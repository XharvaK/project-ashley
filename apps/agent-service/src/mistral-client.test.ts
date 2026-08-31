import { describe, expect, it, vi, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env.js";
import { completeChat, mapMistralError } from "./mistral-client.js";
import { openNuclearDb } from "./core/db.js";
import { withOfflineAppGateDisabled } from "./core/qualification/offline-test-helpers.js";
import { openCognitiveSidecarDb } from "./core/cognitive-v021/sidecar/db.js";
import { admitWake } from "./core/cognitive-v021/wake/ledger.js";
import { reconcilePolicyClock } from "./core/cognitive-v021/private-budget/policy-time-ledger.js";
import { reservePrivateThought } from "./core/cognitive-v021/private-budget/ledger.js";
import * as nimAdapterModule from "./core/model-routing/adapters/nim-adapter.js";

const originalApiKey = env.mistralApiKey;
const originalGroqKey = env.groqApiKey;
const originalNimKey = env.nimApiKey;

afterEach(() => {
  env.mistralApiKey = originalApiKey;
  env.groqApiKey = originalGroqKey;
  env.nimApiKey = originalNimKey;
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
      providerModel: "openai/gpt-oss-20b",
      usage: { promptTokens: 2, completionTokens: 1 },
      finishReason: "stop",
    });
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({ provider: "nim", dispatch });

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
