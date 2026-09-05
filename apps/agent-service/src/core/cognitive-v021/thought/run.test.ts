import { describe, expect, it, vi } from "vitest";
import { appendInboxEvent } from "../cycle/inbox.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { applyWorkingContextDelta } from "../evidence/working-context.js";
import { admitTestCycle, openTestSidecar } from "../test-support.js";
import type { CapabilityReality, IdentitySlice, KernelDeps, Observation, ThoughtInput } from "../types.js";
import { makeSemanticSettlement } from "../test-support.js";
import { DatabaseSync } from "node:sqlite";
import { initObservabilitySchema, openObservabilityStore } from "./diagnostics.js";
import {
  createThoughtCycleTokenMetrics,
  materializeEffectsCompleted,
  observeThoughtCycleInput,
  runCognitiveCycle,
} from "./run.js";

const constitution: IdentitySlice = { constitutional: ["truth first"], stableSelf: ["curious"] };
const capabilityReality: CapabilityReality = {
  vision: false, attachmentText: false, conversationalRead: false, webSearch: false,
  canOfferProjectInspection: false, canOfferWorkspace: false, canOfferVerification: false,
  canOfferAuthorship: false, canOfferBoundedOperation: false, canOfferPatchExport: false,
  approvedProjectIds: [],
};

function deps(overrides: Partial<KernelDeps> = {}): KernelDeps {
  return {
    nowMs: () => 10,
    attentionDb: openTestSidecar(),
    completeChat: vi.fn(async () => ({ text: "{}", model: "fake", modelAlias: "fake", resolvedModelId: null })),
    runPerception: vi.fn(async (): Promise<Observation[]> => []),
    executeObservation: vi.fn(),
    executeEffect: vi.fn(),
    checkAuthority: () => ({ ok: true }),
    loadAuthorityPacks: () => ({
      epistemic: { allowInferredWorldClaims: false }, currentness: { requireObservationForLatest: true },
      receipt: { receiptsByEffectId: {} }, capability: capabilityReality,
      operational: { sandboxAvailable: false }, relational: { withdrawalActive: false, neverMention: [] },
      stateEpoch: { authorityEpoch: 1 },
    }),
    expressionEnabled: false,
    projectOutbox: vi.fn(async () => undefined),
    constitution,
    capabilityReality,
    ...overrides,
  };
}

describe("v0.2.1 Thought run", () => {
  it("tracks first-pass and cumulative retry input without changing per-pass receipts", () => {
    const first = createThoughtCycleTokenMetrics();
    const second = observeThoughtCycleInput(first, 1_000);
    const third = observeThoughtCycleInput(second, 500);

    expect(first).toEqual({
      first_pass_total_input_tokens: 0,
      total_cycle_input_tokens_including_retries: 0,
      retry_amplification_ratio: 0,
      request_count: 0,
    });
    expect(second.first_pass_total_input_tokens).toBe(1_000);
    expect(second.total_cycle_input_tokens_including_retries).toBe(1_000);
    expect(third.total_cycle_input_tokens_including_retries).toBe(1_500);
    expect(third.retry_amplification_ratio).toBe(1.5);
    expect(second).not.toBe(first);
  });

  it("persists required overflow details without dispatching a provider", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const observabilityDb = new DatabaseSync(":memory:");
    initObservabilitySchema(observabilityDb);
    const cycle = admitTestCycle(sidecar, {
      cycleId: "cycle-required-overflow-details",
      conversationId: "thread-required-overflow-details",
      triggerKind: "owner_message",
      triggerRef: "owner-overflow-details",
      occupantId: "doc",
      authorityEpoch: 1,
      nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: cycle.conversationId,
      text: "trigger for synthetic overflow detail test",
      discordMessageIds: ["overflow-details-message"],
      nowMs: 2,
    });
    applyWorkingContextDelta(sidecar, {
      op: "upsert",
      item: {
        id: "wc-overflow-details",
        conversationId: cycle.conversationId,
        type: "correction",
        text: "synthetic correction overflow payload ".repeat(20_000),
        concernId: null,
        sourceTurnIds: [evidence.rowId],
        status: "active",
        supersedesId: null,
      },
    }, { cycleId: cycle.cycleId, generation: cycle.generation });
    const event = appendInboxEvent(sidecar, {
      wakeId: cycle.wakeId,
      conversationId: cycle.conversationId,
      kind: "owner_message",
      payload: {
        cycleId: cycle.cycleId,
        evidenceRowId: evidence.rowId,
        ownerMessage: evidence.text,
      },
      createdAtMs: 2,
    });
    const completeChat = vi.fn(async () => ({
      text: "provider must not be called",
      model: "fake",
      modelAlias: "fake",
      resolvedModelId: null,
    }));

    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({
        attentionDb,
        completeChat,
        observabilityDb,
      }));
      expect(result).toMatchObject({
        published: false,
        infrastructureNotice: "[system] Thought did not complete. Please send the message again.",
      });
      expect(completeChat).not.toHaveBeenCalled();

      const diagnostic = openObservabilityStore(observabilityDb).listDiagnostics().find(
        (item) => item.code === "context_allocation_required_overflow",
      );
      expect(diagnostic).toMatchObject({
        stage: "allocation",
        dispatchTruth: "not_sent",
        requiredOverflowSection: "working_context_correction",
        estimatedInputTokens: expect.any(Number),
        semanticBudgetTokens: 9_500,
        overflowTokens: expect.any(Number),
      });
      expect(diagnostic!.overflowTokens).toBe(
        diagnostic!.estimatedInputTokens! - diagnostic!.semanticBudgetTokens!,
      );
      const storedPayload = observabilityDb.prepare(
        "SELECT cycle_metrics_json FROM thought_dispatch_diagnostics WHERE code = 'context_allocation_required_overflow'",
      ).get() as { cycle_metrics_json: string };
      expect(storedPayload.cycle_metrics_json).not.toContain("synthetic correction overflow payload");
    } finally {
      observabilityDb.close();
      sidecar.close();
      attentionDb.close();
    }
  });

  it("runs perception before Thought, includes observations, and passes attentionDb", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitTestCycle(sidecar, {
      cycleId: "cycle-1", conversationId: "thread-1", triggerKind: "owner_message",
      triggerRef: "owner-1", occupantId: "doc", authorityEpoch: 1, nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: "thread-1", text: "hello", discordMessageIds: ["d1"], nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
      wakeId: cycle.wakeId,
      conversationId: "thread-1", kind: "owner_message",
      payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerMessage: "hello" }, createdAtMs: 2,
    });
    const order: string[] = [];
    const observation: Observation = {
      observationId: "observation-1", cycleId: cycle.cycleId, generation: 1, derived: false,
      replaySafe: true, modality: "text", payload: { text: "raw" }, provenance: "test",
      dataClassification: "ordinary", secretOmitted: false,
    };
    const completeChat = vi.fn(async (_messages, options) => {
      order.push("thought");
      expect(options.attentionDb).toBe(attentionDb);
      return {
        text: JSON.stringify({
          ...({
            ...makeSemanticSettlement({ interpretation: { discourseActs: ["inform"], referentBindings: [], corrections: [], unresolvedAmbiguities: [], topics: ["hello"] }, evidenceUse: { observationRefsUsed: ["observation-1"], retrievalRefsUsed: [], sourceRefsUsed: [], openIntentRefs: [] } }),
          }),
        }),
        model: "fake", modelAlias: "fake", resolvedModelId: null,
      };
    });
    const runPerception = vi.fn(async () => {
      order.push("perception");
      return [observation];
    });
    const project = vi.fn(async () => undefined);
    const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({ attentionDb, completeChat, runPerception, projectOutbox: project }));
    expect(order).toEqual(["perception", "thought"]);
    expect(completeChat).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ published: true, acceptedSettlements: 1, thoughtModelAttempts: 1 });
    expect(project).toHaveBeenCalledTimes(1);
    sidecar.close();
    attentionDb.close();
  });

  it("fails closed on a predecessor Thought output envelope and does not publish speech", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitTestCycle(sidecar, { conversationId: "thread-1", triggerKind: "owner_message", triggerRef: "owner-1", nowMs: 1 });
    const evidence = appendOwnerUtterance(sidecar, { conversationId: "thread-1", text: "hello", discordMessageIds: ["d1"], nowMs: 2 });
    const event = appendInboxEvent(sidecar, { wakeId: cycle.wakeId, conversationId: "thread-1", kind: "owner_message", payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerMessage: "hello" }, createdAtMs: 2 });
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify({
        kind: "settlement",
        cycleId: cycle.cycleId,
        generation: 1,
        pass: 1,
        requestId: "model-authored-request",
        occupantId: "model-authored-occupant",
        settlement: makeSemanticSettlement(),
      }),
      model: "fake",
      modelAlias: "fake",
      resolvedModelId: null,
    }));
    const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({ completeChat }));
    expect(result).toMatchObject({ published: false, acceptedSettlements: 0, infrastructureNotice: "[system] Thought did not complete. Please send the message again." });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM settlements").get()).toMatchObject({ count: 0 });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get()).toMatchObject({ count: 0 });
    sidecar.close();
    attentionDb.close();
  });

  it("records an allowlisted provider-unavailable failure without turning C3 into a speech authority", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitTestCycle(sidecar, {
      cycleId: "cycle-c3-thought",
      conversationId: "thread-c3-thought",
      triggerKind: "owner_message",
      triggerRef: "owner-c3-thought",
      occupantId: "doc",
      authorityEpoch: 1,
      nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: cycle.conversationId,
      text: "Please answer this after the provider becomes available.",
      discordMessageIds: ["c3-thought-message"],
      nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
      wakeId: cycle.wakeId,
      conversationId: cycle.conversationId,
      kind: "owner_message",
      payload: {
        cycleId: cycle.cycleId,
        evidenceRowId: evidence.rowId,
        ownerMessage: evidence.text,
      },
      createdAtMs: 2,
    });
    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({
        attentionDb,
        completeChat: vi.fn(async () => {
          throw new Error("provider_unavailable");
        }),
      }));
      expect(result).toMatchObject({ published: false, infrastructureNotice: "[system] Thought did not complete. Please send the message again." });
      expect(sidecar.prepare(
        "SELECT failure_class, terminal_phase, notice_id FROM c3_terminal_experiences",
      ).get()).toMatchObject({ failure_class: "unavailable", terminal_phase: "thought" });
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM settlements").get()).toMatchObject({ count: 0 });
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("reuses one absolute deadline and gives a bounded corrective structural retry", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitTestCycle(sidecar, {
      cycleId: "cycle-deadline",
      conversationId: "thread-deadline",
      triggerKind: "owner_message",
      triggerRef: "owner-deadline",
      occupantId: "doc",
      authorityEpoch: 1,
      nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: "thread-deadline",
      text: "hello",
      discordMessageIds: ["deadline-message"],
      nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
      wakeId: cycle.wakeId,
      conversationId: "thread-deadline",
      kind: "owner_message",
      payload: {
        cycleId: cycle.cycleId,
        evidenceRowId: evidence.rowId,
        ownerMessage: "hello",
      },
      createdAtMs: 2,
    });
    let now = 1_000;
    const deadlines: number[] = [];
    const userInputs: string[] = [];
    const systemMessages: string[] = [];
    const structuredContractIds: string[] = [];
    const maxTokens: Array<number | undefined> = [];
    const temperatures: Array<number | undefined> = [];
    let calls = 0;
    const completeChat = vi.fn(async (
      messages: Array<{ role: string; content: string }>,
      options: {
        deadlineAtMs?: number | null;
        maxTokens?: number;
        temperature?: number;
        responseFormat?: string;
        structuredOutput?: { contractId?: string };
      },
    ) => {
      calls += 1;
      deadlines.push(options.deadlineAtMs ?? -1);
      maxTokens.push(options.maxTokens);
      temperatures.push(options.temperature);
      expect(options.responseFormat).toBe("json_schema");
      structuredContractIds.push(options.structuredOutput?.contractId ?? "");
      systemMessages.push(messages[0]?.content ?? "");
      userInputs.push(messages[1]?.content ?? "");
      const input = JSON.parse(messages[1]?.content ?? "{}") as ThoughtInput;
      if (calls === 1) {
        now = 3_500;
        return { text: "not json", model: "fake", modelAlias: "thought", resolvedModelId: null };
      }
      return {
        text: JSON.stringify(makeSemanticSettlement()),
        model: "fake",
        modelAlias: "thought",
        resolvedModelId: null,
      };
    });
    const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({
      attentionDb,
      completeChat,
      nowMs: () => now,
    }));
    expect(result.published).toBe(true);
    expect(deadlines).toEqual([61_000, 61_000]);
    expect(maxTokens).toEqual([undefined, 8_192]);
    expect(temperatures).toEqual([1.0, 1.0]);
    expect(structuredContractIds).toEqual(["ashley.thought.semantic.v1", "ashley.thought.semantic.v1"]);
    expect(userInputs[1]).toBe(userInputs[0]);
    expect(systemMessages[0]).toContain("schemaId=ashley.thought.semantic.v1.schema");
    expect(systemMessages[0]).toContain("permitted kinds");
    expect(systemMessages[0]).toContain("Semantic selection rules");
    expect(systemMessages[0]).toContain("settlement only when the current supplied evidence and context are sufficient");
    expect(systemMessages[0]).not.toContain("Code validates semantics");
    expect(systemMessages[0]).toContain("mustSay");
    expect(systemMessages[0]).toContain("commitments");
    expect(systemMessages[0]).toContain("evidenceUse");
    expect(systemMessages[0]).toContain("finalLicensedText");
    expect(systemMessages[1]).toContain("invalid_json");
    expect(systemMessages[1]).toContain("structural validation");
    sidecar.close();
    attentionDb.close();
  });

  it("carries the prior model-authored candidate into a localized correction without changing the pass", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitTestCycle(sidecar, {
      cycleId: "cycle-contextual-correction",
      conversationId: "thread-contextual-correction",
      triggerKind: "owner_message",
      triggerRef: "owner-contextual-correction",
      occupantId: "doc",
      authorityEpoch: 1,
      nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: "thread-contextual-correction",
      text: "Return the effect intent semantic branch.",
      discordMessageIds: ["contextual-correction-message"],
      nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
      wakeId: cycle.wakeId,
      conversationId: "thread-contextual-correction",
      kind: "owner_message",
      payload: {
        cycleId: cycle.cycleId,
        evidenceRowId: evidence.rowId,
        ownerMessage: evidence.text,
      },
      createdAtMs: 2,
    });
    const messagesByCall: string[][] = [];
    let calls = 0;
    const completeChat = vi.fn(async (
      messages: Array<{ role: string; content: string }>,
    ) => {
      calls += 1;
      messagesByCall.push(messages.map((message) => message.content));
      return {
        text: calls === 1
          ? JSON.stringify({
              kind: "abstain",
              reason: "insufficient_evidence",
              explanation: "The supplied evidence is not enough.",
              evidenceRefs: ["not-allowlisted"],
            })
          : JSON.stringify({
              kind: "abstain",
              reason: "insufficient_evidence",
              explanation: "The supplied evidence is not enough.",
              evidenceRefs: [evidence.rowId],
            }),
        model: "fake",
        modelAlias: "thought",
        resolvedModelId: null,
      };
    });

    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({
        attentionDb,
        completeChat,
      }));

      expect(result.published).toBe(false);
      expect(calls).toBe(2);
      expect(messagesByCall[1][0]).toContain("reference_not_allowlisted");
      expect(messagesByCall[1][0]).toContain("evidenceRefs");
      expect(messagesByCall[1][0]).toContain("host allowlisted reference IDs");
      expect(messagesByCall[1][0]).toContain(evidence.rowId);
      expect(messagesByCall[1][1]).toBe(messagesByCall[0][1]);
      const correctionData = JSON.parse(messagesByCall[1][2] ?? "null") as {
        structuralCorrection: {
          candidateRole: string;
          previousCandidate: Record<string, unknown>;
          failureCode: string;
          failingPath: string;
          allowedRepairScope: { kind: string; path: string };
          hostAllowlistedReferenceIds: string[];
        };
      };
      expect(correctionData.structuralCorrection).toMatchObject({
        candidateRole: "model_authored_data",
        previousCandidate: {
          kind: "abstain",
          evidenceRefs: ["not-allowlisted"],
        },
        failureCode: "reference_not_allowlisted",
        failingPath: "evidenceRefs",
        allowedRepairScope: { kind: "localized", path: "evidenceRefs" },
        hostAllowlistedReferenceIds: expect.arrayContaining([evidence.rowId]),
      });
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("rejects structural correction branch drift with a typed scope failure", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitTestCycle(sidecar, {
      cycleId: "cycle-correction-drift",
      conversationId: "thread-correction-drift",
      triggerKind: "owner_message",
      triggerRef: "owner-correction-drift",
      occupantId: "doc",
      authorityEpoch: 1,
      nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: "thread-correction-drift",
      text: "Please answer from the supplied evidence.",
      discordMessageIds: ["correction-drift-message"],
      nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
      wakeId: cycle.wakeId,
      conversationId: "thread-correction-drift",
      kind: "owner_message",
      payload: {
        cycleId: cycle.cycleId,
        evidenceRowId: evidence.rowId,
        ownerMessage: evidence.text,
      },
      createdAtMs: 2,
    });
    let calls = 0;
    const completeChat = vi.fn(async () => {
      calls += 1;
      return {
        text: calls === 1
          ? JSON.stringify({
              kind: "effect_intent",
              operationKind: "workspace.verify",
              request: {
                version: 2,
                operation: "workspace.verify",
                projectId: "qualification-fixture",
                workspaceId: "qualification-fixture-workspace",
                recipeId: "typescript_fixture_compile_v1",
              },
              purpose: "run the approved read-only workspace verification",
              expectedOutcome: "the mechanical verification result is reported without changing files",
              existingRefs: ["not-allowlisted"],
            })
          : JSON.stringify(makeSemanticSettlement()),
        model: "fake",
        modelAlias: "thought",
        resolvedModelId: null,
      };
    });

    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({
        attentionDb,
        completeChat,
      }));

      expect(result.published).toBe(false);
      expect(calls).toBe(2);
      const rows = sidecar.prepare(
        "SELECT payload_json FROM thought_steps WHERE kind = 'failure' ORDER BY created_at_ms, request_id",
      ).all() as Array<{ payload_json: string }>;
      expect(rows.map((row) => JSON.parse(row.payload_json))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            correctionFailureCode: "structural_correction_scope_violation",
          }),
        ]),
      );
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it.each([
    ["effect", "Show me / explain what an effect_intent semantic object looks like."],
    ["observation", "Analyze what an observation_intent semantic object would contain."],
  ])("does not infer a semantic branch from an internal-branch mention (%s)", async (_label, ownerMessage) => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitTestCycle(sidecar, {
      cycleId: "cycle-negative-branch-" + _label,
      conversationId: "thread-negative-branch-" + _label,
      triggerKind: "owner_message",
      triggerRef: "owner-negative-branch-" + _label,
      occupantId: "doc",
      authorityEpoch: 1,
      nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: cycle.conversationId,
      text: ownerMessage,
      discordMessageIds: ["negative-branch-" + _label],
      nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
      wakeId: cycle.wakeId,
      conversationId: cycle.conversationId,
      kind: "owner_message",
      payload: {
        cycleId: cycle.cycleId,
        evidenceRowId: evidence.rowId,
        ownerMessage: evidence.text,
      },
      createdAtMs: 2,
    });
    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({
        attentionDb,
        completeChat: vi.fn(async () => ({
          text: JSON.stringify(makeSemanticSettlement()),
          model: "fake",
          modelAlias: "thought",
          resolvedModelId: null,
        })),
      }));
      expect(result.published).toBe(true);
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("materializes effectsCompleted only for terminal physical receipts (succeeded or failed)", () => {
    const inFlight = [
      { effectId: "e-succ" },
      { effectId: "e-fail" },
      { effectId: "e-unk" },
      { effectId: "e-prog" },
      { effectId: "e-notatt" },
      { effectId: "e-norec" },
    ] as any;

    const receiptsByEffectId = {
      "e-succ": { outcome: "succeeded" },
      "e-fail": { outcome: "failed" },
      "e-unk": { outcome: "outcome_unknown" },
      "e-prog": { outcome: "in_progress" },
      "e-notatt": { outcome: "not_attempted" },
    } as any;

    const completed = materializeEffectsCompleted(inFlight, receiptsByEffectId);
    expect(completed).toEqual(["e-succ", "e-fail"]);
    expect(materializeEffectsCompleted(inFlight, undefined)).toEqual([]);
  });
});
