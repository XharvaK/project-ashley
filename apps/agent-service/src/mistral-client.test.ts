import { describe, expect, it, vi, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env.js";
import { AppError } from "./errors.js";
import {
  completeChat,
  isEligibleMistralCredentialFailover,
  mapMistralError,
  resetAdapterCache,
} from "./mistral-client.js";
import { openNuclearDb } from "./core/db.js";
import { withOfflineAppGateDisabled } from "./core/qualification/offline-test-helpers.js";
import { openCognitiveSidecarDb } from "./core/cognitive-v021/sidecar/db.js";
import { admitWake } from "./core/cognitive-v021/wake/ledger.js";
import { reconcilePolicyClock } from "./core/cognitive-v021/private-budget/policy-time-ledger.js";
import { reservePrivateThought } from "./core/cognitive-v021/private-budget/ledger.js";
import * as nimAdapterModule from "./core/model-routing/adapters/nim-adapter.js";
import * as mistralAdapterModule from "./core/model-routing/adapters/mistral-adapter.js";
import { thoughtOutputStructuredRequest } from "./core/cognitive-v021/thought/output-contract.js";
import type {
  ProviderCompletion,
  ProviderDispatchArgs,
} from "./core/model-routing/types.js";

const originalApiKey = env.mistralApiKey;
const originalSecondaryApiKey = env.mistralApiKeySecondary;
const originalGroqKey = env.groqApiKey;
const originalNimKey = env.nimApiKey;

afterEach(() => {
  env.mistralApiKey = originalApiKey;
  env.mistralApiKeySecondary = originalSecondaryApiKey;
  env.groqApiKey = originalGroqKey;
  env.nimApiKey = originalNimKey;
  resetAdapterCache();
  vi.restoreAllMocks();
});

describe("mapMistralError", () => {
  it("maps statusCode 429 to rate_limited", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("Request failed"), { statusCode: 429 });
    const mapped = mapMistralError(err);
    expect(mapped.code).toBe("rate_limited");
    expect(mapped.httpStatus).toBe(429);
  });

  it("maps statusCode 503 to mistral_unavailable", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("boom"), { statusCode: 503 });
    const mapped = mapMistralError(err);
    expect(mapped.code).toBe("mistral_unavailable");
    expect(mapped.httpStatus).toBe(503);
  });

  it("maps 503 queue-full to mistral_unavailable and relays Retry-After", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(
      new Error("Streaming response failed: [503] The request queue is full."),
      {
        statusCode: 503,
        headers: new Headers({ "retry-after": "17" }),
      },
    );
    const mapped = mapMistralError(err);
    expect(mapped.code).toBe("mistral_unavailable");
    expect(mapped.httpStatus).toBe(503);
    expect(mapped.retryAfterSec).toBe(17);
  });

  it("keeps Retry-After undefined on a 503 without the header", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("boom"), { statusCode: 503 });
    const mapped = mapMistralError(err);
    expect(mapped.retryAfterSec).toBeUndefined();
  });

  it("keeps 400 as internal_error but logs the status", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(
      new Error("Assistant message must have either content or tool_calls"),
      { statusCode: 400 },
    );
    const mapped = mapMistralError(err);
    expect(mapped.code).toBe("internal_error");
    expect(log).toHaveBeenCalledWith(
      "[mistral]",
      400,
      expect.stringContaining("Assistant message"),
    );
  });

  it("re-throws AbortError without remapping", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(() => mapMistralError(err)).toThrow(err);
  });

  it("classifies account credential failures separately from provider-wide failures", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const invalid = mapMistralError(
      Object.assign(new Error("invalid api key"), { statusCode: 401 }),
    );
    const accountQuota = mapMistralError(
      Object.assign(new Error("quota exhausted"), { statusCode: 402 }),
    );
    const providerUnavailable = mapMistralError(
      Object.assign(new Error("service unavailable"), { statusCode: 503 }),
    );

    expect(invalid).toMatchObject({
      code: "credential_invalid",
      credentialFailureDomain: "account",
    });
    expect(accountQuota).toMatchObject({
      code: "quota_exhausted",
      credentialFailureDomain: "account",
    });
    expect(providerUnavailable).toMatchObject({
      code: "mistral_unavailable",
      credentialFailureDomain: "provider",
    });
  });

  it("permits one credential hop only after a definitive account-scoped response", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const accountFailure = mapMistralError(
      Object.assign(new Error("invalid api key"), { statusCode: 401 }),
    );
    const providerFailure = mapMistralError(
      Object.assign(new Error("service unavailable"), { statusCode: 503 }),
    );

    expect(
      isEligibleMistralCredentialFailover(accountFailure, "response_received"),
    ).toBe(true);
    expect(
      isEligibleMistralCredentialFailover(accountFailure, "sent_outcome_unknown"),
    ).toBe(false);
    expect(
      isEligibleMistralCredentialFailover(accountFailure, "not_sent"),
    ).toBe(false);
    expect(
      isEligibleMistralCredentialFailover(providerFailure, "response_received"),
    ).toBe(false);
    expect(
      isEligibleMistralCredentialFailover(
        new Error("schema validation failed"),
        "response_received",
      ),
    ).toBe(false);
  });

it("creates no attention reservation when API key is missing", async () => {
    env.mistralApiKey = "";
    env.groqApiKey = "";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    await expect(
      withOfflineAppGateDisabled(() =>
        completeChat([{ role: "user", content: "hello" }], { attentionDb: db }),
      ),
    ).rejects.toMatchObject({ code: "agent_not_ready" });
    expect(
      db.prepare(`SELECT COUNT(*) AS c FROM attention_requests`).get(),
    ).toEqual({ c: 0 });
    db.close();
  });

  it("binds and commits the durable private reservation at the exact W0 attempt boundary", async () => {
    env.mistralApiKey = "test-mistral-key";
    env.nimApiKey = "test-nim-key";
    const attentionDb = openNuclearDb(new DatabaseSync(":memory:"));
    const sidecar = openCognitiveSidecarDb(new DatabaseSync(":memory:"), { dataPlane: { kind: "isolated" } });
    const nowMs = 4_000_000;
    reconcilePolicyClock(sidecar, { policyId: "private-v1", wallClockNowMs: nowMs, authorizationRef: "owner:w7-test-epoch" });
    const wake = admitWake(sidecar, {
      occurrenceId: "occurrence:w7-client",
      triggerRef: "trigger:w7-client",
      sourceKind: "idle",
      conversationId: "conversation:w7-client",
      cycleId: "cycle:w7-client",
      capturedAuthorityRevision: 1,
      nowMs,
    });
    const reserved = reservePrivateThought(sidecar, {
      admissionId: "admission:w7-client",
      wakeId: wake.wake.wakeId,
      conversationId: "conversation:w7-client",
      policyId: "private-v1",
      wallClockNowMs: nowMs,
    });
    if (reserved.kind !== "reserved") throw new Error("w7_test_reservation_missing");
    const dispatch = vi.fn().mockResolvedValue({
      text: "{}",
      providerModel: "mistral-small-2603",
      usage: { promptTokens: 2, completionTokens: 1 },
      finishReason: "stop",
    });
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({ provider: "nim", dispatch });
    vi.spyOn(mistralAdapterModule, "createMistralAdapter").mockReturnValue({
      provider: "mistral",
      dispatch,
    });

    try {
      const result = await completeChat([{ role: "user", content: "private thought" }], {
        attentionDb,
        purpose: "thought",
        route: "thought",
        logicalRole: "thought",
        reasoningEffort: "low",
        deadlineAtMs: Date.now() + 6_000,
        privateBudgetBinding: { sidecar, reservationId: reserved.reservation.reservationId },
      });
      const row = sidecar.prepare("SELECT state, dispatch_truth, invocation_id, attempt_id FROM private_budget_reservations WHERE reservation_id = ?").get(reserved.reservation.reservationId) as Record<string, unknown>;
      expect(row).toMatchObject({ state: "committed", dispatch_truth: "responded", invocation_id: result.capturedAttemptIdentity?.modelFabricInvocationId, attempt_id: result.capturedAttemptIdentity?.modelFabricAttemptId });
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally {
      attentionDb.close();
      sidecar.close();
    }
  });
});

const MISTRAL_SMALL = "mistral-small-2603";

function thoughtDispatchOptions(attentionDb: DatabaseSync) {
  return {
    attentionDb,
    purpose: "thought" as const,
    route: "thought" as const,
    logicalRole: "thought" as const,
    lane: "interactive" as const,
    responseFormat: "json_schema" as const,
    structuredOutput: thoughtOutputStructuredRequest(),
    deadlineAtMs: Date.now() + 30_000,
  };
}

function mockMistralDispatch(
  implementation: (args: ProviderDispatchArgs) => Promise<ProviderCompletion>,
) {
  const dispatch = vi.fn(implementation);
  vi.spyOn(mistralAdapterModule, "createMistralAdapter").mockReturnValue({
    provider: "mistral",
    dispatch,
  });
  return dispatch;
}

describe("Mistral credential failover", () => {
  it("uses only the primary seat when the primary succeeds", async () => {
    env.mistralApiKey = "primary-secret";
    env.mistralApiKeySecondary = "";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const dispatch = mockMistralDispatch(async (args) => ({
      text: "{}",
      providerModel: args.modelId,
      usage: { promptTokens: 2, completionTokens: 1 },
      finishReason: "stop",
    }));
    try {
      const result = await completeChat(
        [{ role: "user", content: "primary only" }],
        thoughtDispatchOptions(db),
      );
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
        modelId: MISTRAL_SMALL,
        credentialSeat: "mistral_primary",
      });
      expect(
        result.modelFabric?.receipt.receiptStage === "resolved"
          ? result.modelFabric.receipt.fallbackClass
          : null,
      ).toBe("none");
      expect(result.modelFabric?.receipt.attempts).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("rejects a Thought model substitution before attention admission", async () => {
    env.mistralApiKey = "primary-secret";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const dispatch = mockMistralDispatch(async (args) => ({
      text: "{}",
      providerModel: args.modelId,
      usage: { promptTokens: 2, completionTokens: 1 },
      finishReason: "stop",
    }));
    try {
      await expect(
        completeChat(
          [{ role: "user", content: "substitution must fail closed" }],
          {
            ...thoughtDispatchOptions(db),
            model: "mistral-medium-latest",
          },
        ),
      ).rejects.toMatchObject({
        code: "capability_mismatch",
        message: "mistral_thought_model_substitution_forbidden",
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect(db.prepare("SELECT COUNT(*) AS count FROM attention_requests").get())
        .toMatchObject({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("rejects a provider-returned model identity substitution without credential failover", async () => {
    env.mistralApiKey = "primary-secret";
    env.mistralApiKeySecondary = "secondary-secret";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const dispatch = mockMistralDispatch(async () => ({
      text: "{}",
      providerModel: "mistral-small-latest",
      usage: { promptTokens: 2, completionTokens: 1 },
      finishReason: "stop",
    }));
    try {
      await expect(
        completeChat(
          [{ role: "user", content: "returned identity must be exact" }],
          thoughtDispatchOptions(db),
        ),
      ).rejects.toMatchObject({
        code: "capability_mismatch",
        message: "mistral_model_identity_mismatch",
      });
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0]?.[0].credentialSeat).toBe("mistral_primary");
    } finally {
      db.close();
    }
  });

  it("uses exactly one secondary credential hop after a definitive account failure", async () => {
    env.mistralApiKey = "primary-secret";
    env.mistralApiKeySecondary = "secondary-secret";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const dispatch = mockMistralDispatch(async (args) => {
      if (args.credentialSeat === "mistral_primary") {
        throw new AppError(
          "quota_exhausted",
          "Mistral quota exhausted",
          402,
          undefined,
          "account",
        );
      }
      return {
        text: "{}",
        providerModel: args.modelId,
        usage: { promptTokens: 2, completionTokens: 1 },
        finishReason: "stop",
      };
    });
    try {
      const result = await completeChat(
        [{ role: "user", content: "credential hop" }],
        thoughtDispatchOptions(db),
      );
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls.map(([args]) => ({
        modelId: args.modelId,
        credentialSeat: args.credentialSeat,
      }))).toEqual([
        { modelId: MISTRAL_SMALL, credentialSeat: "mistral_primary" },
        { modelId: MISTRAL_SMALL, credentialSeat: "mistral_secondary" },
      ]);
      expect(result.modelAlias).toBe(MISTRAL_SMALL);
      expect(
        result.modelFabric?.receipt.receiptStage === "resolved"
          ? result.modelFabric.receipt.fallbackClass
          : null,
      ).toBe("credential_failover");
      expect(result.modelFabric?.receipt.attempts.map((attempt) => ({
        fallbackClass: attempt.fallbackClass,
        credentialSeat: attempt.credentialSeat,
        configuredModelId: attempt.configuredModelId,
      }))).toEqual([
        {
          fallbackClass: "none",
          credentialSeat: "mistral_primary",
          configuredModelId: MISTRAL_SMALL,
        },
        {
          fallbackClass: "credential_failover",
          credentialSeat: "mistral_secondary",
          configuredModelId: MISTRAL_SMALL,
        },
      ]);
    } finally {
      db.close();
    }
  });

  it("preserves an eligible primary failure when no secondary credential exists", async () => {
    env.mistralApiKey = "primary-secret";
    env.mistralApiKeySecondary = "";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const dispatch = mockMistralDispatch(async () => {
      throw new AppError(
        "credential_invalid",
        "Mistral credential rejected",
        401,
        undefined,
        "account",
      );
    });
    try {
      const error = await completeChat(
        [{ role: "user", content: "no secondary" }],
        thoughtDispatchOptions(db),
      ).catch((value: unknown) => value);
      expect(error).toMatchObject({ code: "credential_invalid" });
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect((error as { modelFabric?: { failoverSuppressed?: string } }).modelFabric?.failoverSuppressed)
        .toBe("mistral_secondary_credential_unavailable");
    } finally {
      db.close();
    }
  });

  it.each([
    {
      name: "provider-wide failure",
      error: new AppError("mistral_unavailable", "Mistral unavailable", 503, undefined, "provider"),
    },
    {
      name: "ambiguous dispatch",
      error: new Error("network lost after send"),
    },
    {
      name: "schema or capability rejection",
      error: new AppError("capability_mismatch", "schema rejected", 400),
    },
  ])("does not hop credentials for $name", async ({ error }) => {
    env.mistralApiKey = "primary-secret";
    env.mistralApiKeySecondary = "secondary-secret";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const dispatch = mockMistralDispatch(async () => {
      throw error;
    });
    try {
      if (error instanceof AppError) {
        await expect(
          completeChat(
            [{ role: "user", content: "no hop" }],
            thoughtDispatchOptions(db),
          ),
        ).rejects.toBe(error);
      } else {
        await expect(
          completeChat(
            [{ role: "user", content: "no hop" }],
            thoughtDispatchOptions(db),
          ),
        ).rejects.toMatchObject({ code: "internal_error" });
      }
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0]?.[0].credentialSeat).toBe("mistral_primary");
    } finally {
      db.close();
    }
  });

  it("does not retry a secondary failure and never changes the model identity", async () => {
    env.mistralApiKey = "primary-secret";
    env.mistralApiKeySecondary = "secondary-secret";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const secondaryError = new AppError(
      "credential_invalid",
      "Mistral credential rejected",
      401,
      undefined,
      "account",
    );
    const dispatch = mockMistralDispatch(async (args) => {
      if (args.credentialSeat === "mistral_primary") {
        throw new AppError(
          "quota_exhausted",
          "Mistral quota exhausted",
          402,
          undefined,
          "account",
        );
      }
      throw secondaryError;
    });
    try {
      await expect(
        completeChat(
          [{ role: "user", content: "secondary failure" }],
          thoughtDispatchOptions(db),
        ),
      ).rejects.toBe(secondaryError);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls.every(([args]) => args.modelId === MISTRAL_SMALL)).toBe(true);
    } finally {
      db.close();
    }
  });
});
