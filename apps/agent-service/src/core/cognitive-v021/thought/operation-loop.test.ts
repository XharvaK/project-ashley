import { describe, expect, it, vi } from "vitest";
import { admitCycle, appendInboxEvent } from "../cycle/inbox.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { openTestSidecar } from "../test-support.js";
import type { CapabilityReality, IdentitySlice, KernelDeps, Observation } from "../types.js";
import { runCognitiveCycle } from "./run.js";

const constitution: IdentitySlice = { constitutional: ["truth first"], stableSelf: [] };
const capabilityReality: CapabilityReality = {
  vision: false, attachmentText: false, conversationalRead: false, webSearch: false,
  canOfferProjectInspection: false, canOfferWorkspace: false, canOfferVerification: false,
  canOfferAuthorship: false, canOfferBoundedOperation: false, canOfferPatchExport: false,
  approvedProjectIds: [],
};

function baseDeps(attentionDb: ReturnType<typeof openTestSidecar>, completeChat: KernelDeps["completeChat"], executeObservation: KernelDeps["executeObservation"]): KernelDeps {
  return {
    nowMs: () => 10,
    attentionDb,
    completeChat,
    runPerception: vi.fn(async (): Promise<Observation[]> => []),
    executeObservation,
    executeEffect: vi.fn(),
    checkAuthority: () => ({ ok: true }),
    loadAuthorityPacks: () => ({
      epistemic: { allowInferredWorldClaims: false }, currentness: { requireObservationForLatest: true }, receipt: { receiptsByEffectId: {} }, capability: capabilityReality,
      operational: { sandboxAvailable: false }, relational: { withdrawalActive: false, neverMention: [] }, stateEpoch: { authorityEpoch: 1 },
    }),
    expressionEnabled: false,
    projectOutbox: vi.fn(async () => undefined),
    constitution,
    capabilityReality,
  };
}

describe("v0.2.1 Thought operation loop", () => {
  it("reinjects a pure observation before the settlement pass", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitCycle(sidecar, { cycleId: "cycle-1", conversationId: "thread-1", triggerKind: "owner_message", triggerRef: "owner-1", occupantId: "doc", nowMs: 1 });
    const evidence = appendOwnerUtterance(sidecar, { conversationId: "thread-1", text: "inspect this", discordMessageIds: ["d1"], nowMs: 2 });
    const event = appendInboxEvent(sidecar, { conversationId: "thread-1", kind: "owner_message", payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerMessage: "inspect this" }, createdAtMs: 2 });
    let call = 0;
    const completeChat = vi.fn(async (messages) => {
      call++;
      if (call === 1) return { text: JSON.stringify({ kind: "observation_request", cycleId: "cycle-1", generation: 1, occupantId: "doc", correlationId: "corr-1", observationRequest: { requestId: "observation-request-1", cycleId: "cycle-1", generation: 1, kind: "project.read_file", request: { path: "README.md" }, replaySafe: true } }), model: "fake", modelAlias: "fake", resolvedModelId: null };
      expect(JSON.stringify(messages)).toContain("observation-1");
      return { text: JSON.stringify({ schemaVersion: 1, cycleId: "cycle-1", generation: 1, authorityEpoch: 1, occupantId: "doc", architectureEpoch: "v0.2.1", triggerRef: "owner-1", interpretation: { discourseActs: ["inform"], referentBindings: [], corrections: [], unresolvedAmbiguities: [], topics: ["inspection"] }, commitments: { epistemic: [{ dimensions: { source: "perception", status: "asserted", time: "current", reliability: "fallible_observation" }, statement: "the file was observed" }], conversational: ["answer"], stance: { warmth: "medium", humorAllowed: false, disagreement: false, uncertaintyDisplay: true } }, speech: { mode: "draft", mustSay: ["observed"], mustNot: [], surfaceDraft: "observed", acceptableRealizations: ["observed"], presentationDirectives: [] }, workingContextDelta: [], concernDeltas: [], occupancyDelta: [], futureTriggers: [], subscriptions: [], durableNominations: [], operations: { observationsConsumed: ["observation-1"], effectsCompleted: [], intentsStillInFlight: [] }, authority: { objectionsApplied: [], revisionCount: 0 } }), model: "fake", modelAlias: "fake", resolvedModelId: null };
    });
    const observed: Observation = { observationId: "observation-1", cycleId: "cycle-1", generation: 1, derived: false, replaySafe: true, modality: "text", payload: { text: "raw" }, provenance: "fake-read", dataClassification: "ordinary", secretOmitted: false };
    const executeObservation = vi.fn(async () => observed);
    const result = await runCognitiveCycle(sidecar, attentionDb, event, baseDeps(attentionDb, completeChat, executeObservation));
    expect(result).toMatchObject({ published: true, thoughtModelAttempts: 2, acceptedThoughtPasses: 2, acceptedSettlements: 1 });
    expect(executeObservation).toHaveBeenCalledTimes(1);
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM observations WHERE observation_id = 'observation-1'").get()).toMatchObject({ count: 1 });
    expect(sidecar.prepare("SELECT kind FROM thought_steps ORDER BY created_at_ms, request_id").all()).toEqual(expect.arrayContaining([{ kind: "observation_request" }, { kind: "settlement" }]));
    sidecar.close();
    attentionDb.close();
  });
});
