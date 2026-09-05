import { vi } from "vitest";

const nimState = vi.hoisted(() => ({
  dispatch: vi.fn(),
}));

vi.mock("../../model-routing/adapters/nim-adapter.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../model-routing/adapters/nim-adapter.js")
  >();
  return {
    ...actual,
    createNimAdapter: () => ({
      provider: "nim" as const,
      dispatch: nimState.dispatch,
    }),
  };
});

import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../../env.js";
import { completeChat, resetAdapterCache } from "../../../mistral-client.js";
import { openNuclearDb } from "../../db.js";
import {
  currentTpmUsage,
  realClock,
  runAttentiveDispatch,
} from "../../attention/index.js";
import { estimateRequestTokens } from "../../attention/estimate.js";
import { resolveCurrentPolicy } from "../../model-fabric/portfolio.js";
import { quotaContractFor } from "../../model-routing/router.js";
import type {
  CapabilityReality,
  IdentitySlice,
  KernelDeps,
  Observation,
  ThoughtInput,
} from "../types.js";
import { appendInboxEvent } from "../cycle/inbox.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { buildThoughtInput } from "./input.js";
import { admitTestCycle, makeSemanticSettlement, openTestSidecar } from "../test-support.js";
import {
  runThoughtModel,
  STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS,
} from "./run.js";

const constitution: IdentitySlice = {
  constitutional: ["truth first"],
  stableSelf: ["curious"],
};
const capabilityReality: CapabilityReality = {
  vision: false,
  attachmentText: false,
  conversationalRead: false,
  webSearch: false,
  canOfferProjectInspection: false,
  canOfferWorkspace: false,
  canOfferVerification: false,
  canOfferAuthorship: false,
  canOfferBoundedOperation: false,
  canOfferPatchExport: false,
  approvedProjectIds: [],
};

const NIM_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const NIM_BUCKET = `nim:${NIM_MODEL}`;
const SEEDED_CURRENT_TPM_USAGE = 14_000;
const TPM_LIMIT = 65_536;
const EXPECTED_RETRY_OUTPUT = STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS;
const savedNimKey = env.nimApiKey;

function deps(attentionDb: DatabaseSync): KernelDeps {
  return {
    nowMs: () => Date.now(),
    attentionDb,
    completeChat,
    runPerception: vi.fn(async (): Promise<Observation[]> => []),
    executeObservation: vi.fn(),
    executeEffect: vi.fn(),
    checkAuthority: () => ({ ok: true }),
    loadAuthorityPacks: () => ({
      epistemic: { allowInferredWorldClaims: false },
      currentness: { requireObservationForLatest: true },
      receipt: { receiptsByEffectId: {} },
      capability: capabilityReality,
      operational: { sandboxAvailable: false },
      relational: { withdrawalActive: false, neverMention: [] },
      stateEpoch: { authorityEpoch: 1 },
    }),
    expressionEnabled: false,
    projectOutbox: vi.fn(async () => undefined),
    constitution,
    capabilityReality,
  };
}

function helloInput(): { sidecar: DatabaseSync; input: ThoughtInput } {
  const sidecar = openTestSidecar();
  const cycle = admitTestCycle(sidecar, {
    cycleId: "cycle-retry-admission",
    conversationId: "thread-retry-admission",
    triggerKind: "owner_message",
    triggerRef: "owner-retry-admission",
    occupantId: "doc",
    authorityEpoch: 1,
    nowMs: 1,
  });
  const evidence = appendOwnerUtterance(sidecar, {
    conversationId: cycle.conversationId,
    text: "hello",
    discordMessageIds: ["retry-admission-message"],
    nowMs: 2,
  });
  appendInboxEvent(sidecar, {
    conversationId: cycle.conversationId,
    kind: "owner_message",
    payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerMessage: "hello" },
    createdAtMs: 2,
  });
  const input = buildThoughtInput({
    sidecar,
    cycle,
    triggerText: "hello",
    triggerEvidence: evidence,
    constitution,
    capabilityReality,
  });
  // Keep the semantic request hello-style while exercising the conservative
  // estimator near the live failure's high-context admission boundary.
  input.rawConversation = input.rawConversation.map((row) => ({
    ...row,
    text: `${row.text} ${"hello ".repeat(600)}`,
  }));
  return { sidecar, input };
}

const savedOfflineEnv = process.env.ASHLEY_PHASE0_OFFLINE;

afterEach(() => {
  nimState.dispatch.mockReset();
  resetAdapterCache();
  env.nimApiKey = savedNimKey;
  if (savedOfflineEnv === undefined) {
    delete process.env.ASHLEY_PHASE0_OFFLINE;
  } else {
    process.env.ASHLEY_PHASE0_OFFLINE = savedOfflineEnv;
  }
});

describe("v0.2.1 structural Thought retry admission", () => {
  it("keeps the primary at 8192 and admits a corrective retry at 8192 under real rolling TPM accounting", async () => {
    delete process.env.ASHLEY_PHASE0_OFFLINE;
    env.nimApiKey = "test-nim-key";
    resetAdapterCache();
    const { sidecar, input } = helloInput();
    const primaryDb = openNuclearDb(new DatabaseSync(":memory:"));
    const retryDb = openNuclearDb(new DatabaseSync(":memory:"));
    const captured: Array<{
      messages: Array<{ role: string; content: string }>;
      options: { maxTokens?: number; responseFormat?: string };
    }> = [];
    let captureAdmission: Record<string, unknown> | null = null;

    nimState.dispatch.mockImplementation(async (args: {
      messages: Array<{ role: string; content: string }>;
      options: { maxTokens?: number; responseFormat?: string };
    }) => {
      captured.push({ messages: args.messages, options: args.options });
      if (captureAdmission) {
        captureAdmission = retryDb.prepare(
          `SELECT state, estimated_input_tokens, estimated_output_tokens,
                  reserved_input_tokens, reserved_output_tokens,
                  dispatch_started_at, deadline_at
             FROM attention_requests
            WHERE quota_bucket = ?
            ORDER BY id DESC LIMIT 1`,
        ).get(NIM_BUCKET) as Record<string, unknown>;
      }
      const parsed = JSON.parse(args.messages[1]?.content ?? "{}") as ThoughtInput;
      const response = captured.length === 1
        ? {
            text: "not json",
            providerModel: NIM_MODEL,
            usage: { promptTokens: 4_772, completionTokens: 55 },
          }
        : {
            text: JSON.stringify(makeSemanticSettlement()),
            providerModel: NIM_MODEL,
            usage: { promptTokens: 1, completionTokens: 1 },
          };
      return response;
    });

    const currentPolicy = resolveCurrentPolicy({
      logicalRole: "thought",
      purpose: "thought",
      lane: "urgent_grounded",
      routeId: "thought",
    });
    expect(currentPolicy.policyRow.maxOutputTokens).toBe(8_192);
    expect(quotaContractFor(NIM_BUCKET).tpm).toBe(TPM_LIMIT);

    const primary = await runThoughtModel(input, deps(primaryDb), {
      deadlineAtMs: Date.now() + 60_000,
    });
    expect(primary.malformed).toBe(true);
    const primaryRow = primaryDb.prepare(
      `SELECT estimated_input_tokens, estimated_output_tokens,
              actual_input_tokens, actual_output_tokens
         FROM attention_requests
        WHERE quota_bucket = ?
        ORDER BY id DESC LIMIT 1`,
    ).get(NIM_BUCKET) as Record<string, unknown>;
    const currentPrimaryEstimatedInput = Number(primaryRow.estimated_input_tokens);
    expect(Number(primaryRow.estimated_output_tokens)).toBe(8_192);
    expect(Number(primaryRow.actual_input_tokens)).toBe(4_772);
    expect(Number(primaryRow.actual_output_tokens)).toBe(55);

    await runAttentiveDispatch(retryDb, {
      messages: [{ role: "user", content: "seeded primary" }],
      purpose: "thought",
      lane: "urgent_grounded",
      providerId: "nim",
      quotaBucket: NIM_BUCKET,
      modelAlias: NIM_MODEL,
      maxTokens: 8_192,
      deadlineAtMs: Date.now() + 60_000,
      ownerId: "doc",
      dispatch: async () => ({
        providerModel: NIM_MODEL,
        usage: { promptTokens: 12_000, completionTokens: 2_000 },
        result: { text: "seeded" },
      }),
    });
    expect(currentTpmUsage(retryDb, realClock, NIM_BUCKET)).toBe(SEEDED_CURRENT_TPM_USAGE);

    captureAdmission = {};
    const retry = await runThoughtModel(input, deps(retryDb), {
      deadlineAtMs: Date.now() + 60_000,
      structuralFeedback: "invalid_json",
      maxTokens: EXPECTED_RETRY_OUTPUT,
    } as Parameters<typeof runThoughtModel>[2] & { maxTokens: number });
    expect(retry.output.kind).toBe("settlement");
    expect(captured).toHaveLength(2);
    expect(captured[0]?.options.maxTokens).toBe(8_192);
    expect(captured[1]?.options.maxTokens).toBe(EXPECTED_RETRY_OUTPUT);
    expect(captured[1]?.options.responseFormat).toBe("json_schema");
    expect(captured[1]?.messages[1]?.content).toBe(captured[0]?.messages[1]?.content);
    expect(captured[1]?.messages[0]?.content).toContain("invalid_json");
    expect(captured[1]?.messages[0]?.content).toContain("schemaId=ashley.thought.semantic.v1.schema");
    expect(captureAdmission).not.toBeNull();

    const retryInput = Number(captureAdmission?.estimated_input_tokens);
    const retryReservedOutput = Number(captureAdmission?.reserved_output_tokens);
    const retryTotal = retryInput + retryReservedOutput;
    const combinedDemand = SEEDED_CURRENT_TPM_USAGE + retryTotal;
    const headroom = TPM_LIMIT - combinedDemand;
    const estimatedRetry = estimateRequestTokens(captured[1]!.messages, {
      maxTokens: EXPECTED_RETRY_OUTPUT,
    });
    const dispatchStartedAt = Date.parse(String(captureAdmission?.dispatch_started_at));
    const retryDeadline = Date.parse(String(captureAdmission?.deadline_at));
    expect(Number(captureAdmission?.estimated_output_tokens)).toBe(EXPECTED_RETRY_OUTPUT);
    expect(retryInput).toBe(estimatedRetry.estimatedInputTokens);
    expect(retryReservedOutput).toBe(EXPECTED_RETRY_OUTPUT);
    expect(combinedDemand).toBeLessThanOrEqual(TPM_LIMIT);
    expect(captureAdmission?.state).toBe("running");
    expect(dispatchStartedAt).toBeLessThan(retryDeadline);
    expect(retryInput + 8_192 + SEEDED_CURRENT_TPM_USAGE).toBeLessThanOrEqual(TPM_LIMIT);
    expect(retryInput + 50_000 + SEEDED_CURRENT_TPM_USAGE).toBeGreaterThan(TPM_LIMIT);
    expect(headroom).toBeGreaterThanOrEqual(0);
    expect(currentPrimaryEstimatedInput).toBeGreaterThan(0);
    expect(currentPrimaryEstimatedInput + 8_192 + SEEDED_CURRENT_TPM_USAGE).toBeLessThanOrEqual(TPM_LIMIT);

    console.info([
      `CURRENT_HELLO_RETRY_ESTIMATED_INPUT=${retryInput}`,
      `CURRENT_HELLO_RETRY_RESERVED_OUTPUT=${retryReservedOutput}`,
      `CURRENT_HELLO_RETRY_TOTAL=${retryTotal}`,
      `CURRENT_PRIMARY_ESTIMATED_INPUT=${currentPrimaryEstimatedInput}`,
      `SEEDED_CURRENT_TPM_USAGE=${SEEDED_CURRENT_TPM_USAGE}`,
      `COMBINED_TPM_DEMAND=${combinedDemand}`,
      `TPM_LIMIT=${TPM_LIMIT}`,
      `HEADROOM=${headroom}`,
      "RETRY_ADMISSION=PASS",
      `NIM_THOUGHT_TPM=${quotaContractFor(NIM_BUCKET).tpm}`,
      `PRIMARY_8192_TOTAL=${currentPrimaryEstimatedInput + 8_192}`,
      `NIM_SINGLE_REQUEST_ADMISSIBLE=${currentPrimaryEstimatedInput + 8_192 <= quotaContractFor(NIM_BUCKET).tpm ? "yes" : "no"}`,
    ].join("\n"));

    sidecar.close();
    primaryDb.close();
    retryDb.close();
  });
});
