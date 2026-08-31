import { describe, expect, it, vi } from "vitest";
import { appendInboxEvent } from "../cycle/inbox.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { admitTestCycle, openTestSidecar, makeSemanticSettlement } from "../test-support.js";
import { runLiveCognitiveTurn } from "./live.js";
import type { CapabilityReality, IdentitySlice, KernelDeps, Observation } from "../types.js";

const constitution: IdentitySlice = { constitutional: ["truth first"], stableSelf: [] };
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
      completeChat: vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement()),
      model: "fake", modelAlias: "fake", resolvedModelId: null,
    })),
    runPerception: vi.fn(async (): Promise<Observation[]> => []),
    executeObservation: vi.fn(),
    executeEffect: vi.fn(),
    checkAuthority: () => ({ ok: true }),
    loadAuthorityPacks: () => ({
      epistemic: { allowInferredWorldClaims: false },
      currentness: { requireObservationForLatest: false },
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
    ...overrides,
  };
}

function event(sidecar: ReturnType<typeof openTestSidecar>) {
  const cycle = admitTestCycle(sidecar, {
    cycleId: "cycle-live",
    conversationId: "thread-live",
    triggerKind: "owner_message",
    triggerRef: "owner-live",
    occupantId: "doc",
    nowMs: 1,
  });
  const evidence = appendOwnerUtterance(sidecar, {
    conversationId: "thread-live",
    text: "hello live",
    discordMessageIds: ["discord-live"],
    nowMs: 2,
  });
  return appendInboxEvent(sidecar, {
    conversationId: "thread-live",
    kind: "owner_message",
    payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerId: "doc", channel: "discord", threadId: "thread-live" },
    createdAtMs: 2,
  });
}

describe("v0.2.1 live dispatcher", () => {
  it("maps one admitted event through Thought and the projector seam", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openTestSidecar();
    const attentionDb = openTestSidecar();
    const projectOutbox = vi.fn(async () => undefined);
    const result = await runLiveCognitiveTurn({
      sidecar,
      nuclear,
      event: event(sidecar),
      deps: deps({ attentionDb, projectOutbox }),
      projector: {
        project: projectOutbox,
        projectSystem: vi.fn(async () => undefined),
      },
    });
    expect(result).toMatchObject({ published: true, acceptedSettlements: 1 });
    expect(projectOutbox).toHaveBeenCalledTimes(1);
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM settlements").get()).toMatchObject({ count: 1 });
    sidecar.close();
    nuclear.close();
    attentionDb.close();
  });
});
