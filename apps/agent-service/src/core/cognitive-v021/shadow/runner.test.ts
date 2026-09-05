import { describe, expect, it, vi } from "vitest";
import { appendInboxEvent } from "../cycle/inbox.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { admitTestCycle, makeSemanticSettlement, openTestSidecar } from "../test-support.js";
import type { CapabilityReality, IdentitySlice, KernelDeps, Observation } from "../types.js";
import { runShadowCognitiveTurn } from "./runner.js";

const constitution: IdentitySlice = { constitutional: ["truth first"], stableSelf: [] };
const capabilityReality: CapabilityReality = {
  vision: false, attachmentText: false, conversationalRead: false, webSearch: false,
  canOfferProjectInspection: false, canOfferWorkspace: false, canOfferVerification: false,
  canOfferAuthorship: false, canOfferBoundedOperation: false, canOfferPatchExport: false,
  approvedProjectIds: [],
};

function event(sidecar: ReturnType<typeof openTestSidecar>) {
  const cycle = admitTestCycle(sidecar, {
    cycleId: "cycle-shadow", conversationId: "thread-shadow", triggerKind: "owner_message",
    triggerRef: "owner-shadow", occupantId: "doc", nowMs: 1,
  });
  const evidence = appendOwnerUtterance(sidecar, {
    conversationId: "thread-shadow", text: "hello shadow", discordMessageIds: ["shadow-owner"], nowMs: 2,
  });
  return appendInboxEvent(sidecar, {
    conversationId: "thread-shadow", kind: "owner_message",
    payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerId: "doc", channel: "discord", threadId: "thread-shadow" },
    createdAtMs: 2,
  });
}

function deps(overrides: Partial<KernelDeps> = {}): KernelDeps {
  return {
    nowMs: () => 10,
    attentionDb: openTestSidecar(),
    completeChat: vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement()),
      model: "fake", modelAlias: "fake", resolvedModelId: null,
    })),
    runPerception: vi.fn(async (): Promise<Observation[]> => []),
    executeObservation: vi.fn(), executeEffect: vi.fn(),
    checkAuthority: () => ({ ok: true }),
    loadAuthorityPacks: () => ({
      epistemic: { allowInferredWorldClaims: false }, currentness: { requireObservationForLatest: false },
      receipt: { receiptsByEffectId: {} }, capability: capabilityReality,
      operational: { sandboxAvailable: false }, relational: { withdrawalActive: false, neverMention: [] },
      stateEpoch: { authorityEpoch: 1 },
    }),
    expressionEnabled: false,
    projectOutbox: vi.fn(async () => undefined),
    projectSystemNotice: vi.fn(async () => undefined),
    constitution, capabilityReality, ...overrides,
  };
}

describe("v0.2.1 shadow runner", () => {
  it("runs the kernel without invoking either projector", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openTestSidecar();
    const attentionDb = openTestSidecar();
    const projectOutbox = vi.fn(async () => { throw new Error("shadow_projector_must_not_run"); });
    const projectSystemNotice = vi.fn(async () => { throw new Error("shadow_projector_must_not_run"); });
    const result = await runShadowCognitiveTurn({
      sidecar, nuclear, event: event(sidecar),
      deps: deps({ attentionDb, projectOutbox, projectSystemNotice }),
    });
    expect(result).toMatchObject({ published: true, shadow: true });
    expect(projectOutbox).not.toHaveBeenCalled();
    expect(projectSystemNotice).not.toHaveBeenCalled();
    expect(sidecar.prepare("SELECT origin, send_status FROM speech_outbox").get()).toMatchObject({
      origin: "shadow", send_status: "suppressed_shadow",
    });
    sidecar.close(); nuclear.close(); attentionDb.close();
  });

  it("contains shadow failures instead of throwing into the live turn", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const result = await runShadowCognitiveTurn({
      sidecar, nuclear: openTestSidecar(), event: event(sidecar),
      deps: deps({ attentionDb, completeChat: vi.fn(async () => { throw new Error("provider_down"); }) }),
    });
    expect(result.shadow).toBe(true);
    expect(result.published).toBe(false);
    expect(sidecar.prepare("SELECT send_status FROM system_notice_outbox").get()).toMatchObject({ send_status: "suppressed_shadow" });
    expect(sidecar.prepare("SELECT COUNT(*) AS count FROM c3_terminal_experiences").get()).toEqual({ count: 0 });
    sidecar.close(); attentionDb.close();
  });
});
