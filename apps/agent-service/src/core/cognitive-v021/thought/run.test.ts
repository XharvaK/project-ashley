import { describe, expect, it, vi } from "vitest";
import { admitCycle, appendInboxEvent } from "../cycle/inbox.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { openTestSidecar } from "../test-support.js";
import type { CapabilityReality, IdentitySlice, KernelDeps, Observation, ThoughtInput } from "../types.js";
import { makeThoughtDraft } from "../test-support.js";
import { runCognitiveCycle } from "./run.js";

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
  it("runs perception before Thought, includes observations, and passes attentionDb", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitCycle(sidecar, {
      cycleId: "cycle-1", conversationId: "thread-1", triggerKind: "owner_message",
      triggerRef: "owner-1", occupantId: "doc", authorityEpoch: 1, nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: "thread-1", text: "hello", discordMessageIds: ["d1"], nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
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
            schemaVersion: 1, cycleId: "cycle-1", generation: 1, authorityEpoch: 1,
            occupantId: "doc", architectureEpoch: "v0.2.1", triggerRef: "owner-1",
            interpretation: { discourseActs: ["inform"], referentBindings: [], corrections: [], unresolvedAmbiguities: [], topics: ["hello"] },
            commitments: { epistemic: [{ dimensions: { source: "owner_utterance", status: "asserted", time: "current", reliability: "owner_supplied" }, statement: "hello" }], conversational: ["answer"], stance: { warmth: "medium", humorAllowed: false, disagreement: false, uncertaintyDisplay: true } },
            speech: { mode: "draft", mustSay: ["hello"], mustNot: [], surfaceDraft: "hello", acceptableRealizations: ["hello"], presentationDirectives: [] },
            workingContextDelta: [], concernDeltas: [], occupancyDelta: [], futureTriggers: [], subscriptions: [], durableNominations: [],
            operations: { observationsConsumed: ["observation-1"], effectsCompleted: [], intentsStillInFlight: [] }, authority: { objectionsApplied: [], revisionCount: 0 },
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

  it("fails closed on malformed Thought output and does not publish speech", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitCycle(sidecar, { conversationId: "thread-1", triggerKind: "owner_message", triggerRef: "owner-1", nowMs: 1 });
    const evidence = appendOwnerUtterance(sidecar, { conversationId: "thread-1", text: "hello", discordMessageIds: ["d1"], nowMs: 2 });
    const event = appendInboxEvent(sidecar, { conversationId: "thread-1", kind: "owner_message", payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerMessage: "hello" }, createdAtMs: 2 });
    const completeChat = vi.fn(async () => ({ text: "not json", model: "fake", modelAlias: "fake", resolvedModelId: null }));
    const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({ completeChat }));
    expect(result).toMatchObject({ published: false, acceptedSettlements: 0, infrastructureNotice: "[system] Thought did not complete. Please send the message again." });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM settlements").get()).toMatchObject({ count: 0 });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get()).toMatchObject({ count: 0 });
    sidecar.close();
    attentionDb.close();
  });

  it("reuses one absolute deadline and gives a bounded corrective structural retry", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitCycle(sidecar, {
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
    let calls = 0;
    const completeChat = vi.fn(async (
      messages: Array<{ role: string; content: string }>,
      options: {
        deadlineAtMs?: number | null;
        responseFormat?: string;
        structuredOutput?: { contractId?: string };
      },
    ) => {
      calls += 1;
      deadlines.push(options.deadlineAtMs ?? -1);
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
        text: JSON.stringify(makeThoughtDraft({
          cycleId: input.cycleId,
          generation: input.generation,
          authorityEpoch: input.authorityEpoch,
          occupantId: input.occupantId,
          triggerRef: input.trigger.ref,
        })),
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
    expect(deadlines).toEqual([11_000, 11_000]);
    expect(structuredContractIds).toEqual(["ashley.thought.step.v1", "ashley.thought.step.v1"]);
    expect(userInputs[1]).toBe(userInputs[0]);
    expect(systemMessages[1]).toContain("invalid_json");
    expect(systemMessages[1]).toContain("structural validation");
    sidecar.close();
    attentionDb.close();
  });
});
