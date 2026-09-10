import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { appendInboxEvent } from "../cycle/inbox.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { admitTestCycle, makeSemanticSettlement, openTestSidecar } from "../test-support.js";
import type { CapabilityReality, IdentitySlice, KernelDeps, Observation } from "../types.js";
import { THOUGHT_UNAVAILABLE_NOTICE } from "../speech/infrastructure-notice.js";
import { incrementThoughtAttemptCounter } from "./counters.js";
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

function setupThread(threadId = "thread-terminal") {
  const sidecar = openTestSidecar();
  const attentionDb = openTestSidecar();
  const cycle = admitTestCycle(sidecar, {
    conversationId: threadId, triggerKind: "owner_message", triggerRef: "owner-1", nowMs: 1,
  });
  const evidence = appendOwnerUtterance(sidecar, {
    conversationId: threadId, text: "hello", discordMessageIds: ["d1"], nowMs: 2,
  });
  const event = appendInboxEvent(sidecar, {
    wakeId: cycle.wakeId,
    conversationId: threadId,
    kind: "owner_message",
    payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerMessage: "hello" },
    createdAtMs: 2,
  });
  return { sidecar, attentionDb, cycle, evidence, event };
}

describe("FAILURE-TRUTH-COMPLETENESS-01 producer-to-notice", () => {
  it("maps UNWITNESSED_HIGH_RISK_CLAIM to SPEECH_FIDELITY_REJECTED", async () => {
    const { sidecar, attentionDb, event } = setupThread("thread-fidelity-reading");
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement({
        speech: { mode: "draft", mustSay: ["hello"], surfaceDraft: "I read the Cloudflare documentation." },
      })),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({ attentionDb, completeChat }));
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: SPEECH_FIDELITY_REJECTED`,
      );
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("maps revisable DRAFT_COMMITMENT_CONFLICT through exhaustion to THOUGHT_BUDGET_EXHAUSTED with the cause retained", async () => {
    // DRAFT_COMMITMENT_CONFLICT is revisable, so a persistent conflict revises
    // twice and then exhausts. Terminal cause is exhaustion; the last fidelity
    // objection is retained as its cause rather than replacing exhaustion.
    const { sidecar, attentionDb, event } = setupThread("thread-fidelity-conflict");
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement({
        speech: { mode: "draft", mustSay: ["required phrase never written"], surfaceDraft: "hello" },
      })),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({ attentionDb, completeChat }));
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: THOUGHT_BUDGET_EXHAUSTED`,
      );
      const key = (sidecar.prepare("SELECT notice_key FROM system_notice_outbox").get() as { notice_key: string }).notice_key;
      expect(key).toContain("revision_exhausted");
      expect(key).toContain("DRAFT_COMMITMENT_CONFLICT");
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("maps multi-code authority rejection to AUTHORITY_REJECTED", async () => {
    const { sidecar, attentionDb, event } = setupThread("thread-authority-join");
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement()),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    try {
      const result = await runCognitiveCycle(
        sidecar,
        attentionDb,
        event,
        deps({
          attentionDb,
          completeChat,
          checkAuthority: () => ({ ok: false, codes: ["CAPABILITY_UNAVAILABLE", "EFFECT_NOT_AUTHORIZED"] }),
        }),
      );
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: AUTHORITY_REJECTED`,
      );
      const key = (sidecar.prepare("SELECT notice_key FROM system_notice_outbox").get() as { notice_key: string }).notice_key;
      expect(key).toContain("CAPABILITY_UNAVAILABLE");
      expect(key).toContain("EFFECT_NOT_AUTHORIZED");
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("maps observation dispatch failure to OPERATION_DISPATCH_FAILED", async () => {
    const { sidecar, attentionDb, event } = setupThread("thread-observation");
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify({
        kind: "observation_intent",
        operationKind: "project.read_file",
        request: { path: "README.md" },
        purpose: "inspect the file",
        evidenceNeed: "the file contents",
        existingRefs: ["owner-1"],
      }),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    const executeObservation = vi.fn(async () => { throw new Error("observation boom"); });
    try {
      const result = await runCognitiveCycle(
        sidecar, attentionDb, event, deps({ attentionDb, completeChat, executeObservation }),
      );
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: OPERATION_DISPATCH_FAILED`,
      );
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("maps pass exhaustion to THOUGHT_BUDGET_EXHAUSTED", async () => {
    const { sidecar, attentionDb, cycle, event } = setupThread("thread-pass-exhausted");
    for (let i = 0; i < 12; i += 1) {
      incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "thoughtModelAttempts");
    }
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement()),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({ attentionDb, completeChat }));
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: THOUGHT_BUDGET_EXHAUSTED`,
      );
      expect(completeChat).not.toHaveBeenCalled();
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("maps revision exhaustion to THOUGHT_BUDGET_EXHAUSTED", async () => {
    const { sidecar, attentionDb, cycle, event } = setupThread("thread-revision-exhausted");
    incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "authorityRevisions");
    incrementThoughtAttemptCounter(sidecar, cycle.cycleId, cycle.generation, "authorityRevisions");
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement()),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    try {
      const result = await runCognitiveCycle(
        sidecar,
        attentionDb,
        event,
        deps({
          attentionDb,
          completeChat,
          checkAuthority: () => ({ ok: false, codes: ["CURRENTNESS_UNVERIFIED"] }),
        }),
      );
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: THOUGHT_BUDGET_EXHAUSTED`,
      );
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("maps single validation malformed to STRUCTURED_OUTPUT_INVALID, not retry-exhausted", async () => {
    // Host settlement validation malformed (single check, no retry budget
    // consumed) must not claim retry exhaustion. Model-authored malformed
    // output is intercepted earlier by the parser with its own bounded retry
    // (E6, proven exhaustion); this validator producer covers the
    // defense-in-depth E19 path with a synthetically invalid draft.
    const { validateThoughtSettlementDraft } = await import("../settlement/validate.js");
    const { emitInfrastructureNotice } = await import("../speech/infrastructure-notice.js");
    const { makeThoughtTerminal } = await import("../speech/infrastructure-notice.js");
    const { admitTestCycle, openTestSidecar } = await import("../test-support.js");
    const validation = validateThoughtSettlementDraft({ not: "a draft" });
    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error("expected validation failure");
    expect(validation.kind).toBe("malformed");
    const db = openTestSidecar();
    try {
      admitTestCycle(db, { cycleId: "cycle-validation", conversationId: "thread-validation", triggerKind: "owner_message", occupantId: "doc", nowMs: 1 });
      const notice = emitInfrastructureNotice(db, {
        ownerId: "doc",
        channel: "discord",
        threadId: "thread-validation",
        conversationId: "thread-validation",
        cycleId: "cycle-validation",
        generation: 1,
        reason: "malformed",
        terminal: makeThoughtTerminal("structural_invalid", { codes: validation.codes, stage: "settlement_validation" }),
      });
      expect(notice.noticeText).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: STRUCTURED_OUTPUT_INVALID`,
      );
      expect(notice.noticeKey).toContain(validation.codes[0]);
    } finally {
      db.close();
    }
  });

  it("maps the local Thought deadline to THOUGHT_DEADLINE_EXCEEDED", async () => {
    const { sidecar, attentionDb, event } = setupThread("thread-deadline");
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement()),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    // Monotonic clock jumping past the 180s budget: the loop-top deadline
    // fires before any provider dispatch.
    let t = 0;
    const nowMs = vi.fn(() => (t += 200_000));
    try {
      const result = await runCognitiveCycle(
        sidecar, attentionDb, event, deps({ attentionDb, completeChat, nowMs }),
      );
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: THOUGHT_DEADLINE_EXCEEDED`,
      );
      expect(completeChat).not.toHaveBeenCalled();
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("keeps Thought-authored abstention silent with no infrastructure notice", async () => {
    const { sidecar, attentionDb, event, evidence } = setupThread("thread-abstain");
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify({
        kind: "abstain",
        reason: "insufficient_evidence",
        explanation: "The supplied evidence is not enough.",
        evidenceRefs: [evidence.rowId],
      }),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps({ attentionDb, completeChat }));
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBeNull();
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });

  it("maps publication diagnostic persistence failure without claiming a remote outcome", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const cycle = admitTestCycle(sidecar, {
      conversationId: "thread-publication", triggerKind: "owner_message", triggerRef: "owner-1", nowMs: 1,
    });
    const evidence = appendOwnerUtterance(sidecar, {
      conversationId: "thread-publication", text: "hello", discordMessageIds: ["d1"], nowMs: 2,
    });
    const event = appendInboxEvent(sidecar, {
      wakeId: cycle.wakeId,
      conversationId: "thread-publication",
      kind: "owner_message",
      payload: { cycleId: cycle.cycleId, evidenceRowId: evidence.rowId, ownerMessage: "hello" },
      createdAtMs: 2,
    });
    // Terminalize the wake so publication rejects with wake_terminal while the
    // cycle still reaches the publication stage.
    sidecar.prepare("UPDATE wakes SET state = 'terminal', terminal_reason = 'completed' WHERE wake_id = ?")
      .run(cycle.wakeId);
    const brokenObservability = new DatabaseSync(":memory:");
    brokenObservability.close();
    const completeChat = vi.fn(async () => ({
      text: JSON.stringify(makeSemanticSettlement()),
      model: "fake", modelAlias: "thought", resolvedModelId: null,
    }));
    try {
      const result = await runCognitiveCycle(
        sidecar,
        attentionDb,
        event,
        deps({ attentionDb, completeChat, observabilityDb: brokenObservability as never }),
      );
      expect(result.published).toBe(false);
      expect(result.infrastructureNotice).toBe(
        `${THOUGHT_UNAVAILABLE_NOTICE} Error code: PUBLICATION_PERSISTENCE_FAILED`,
      );
      expect(result.publicationReason).toBe("wake_terminal");
      // PUBLICATION_PERSISTENCE_FAILED is a local persistence cause. It must
      // not assert a remote effect outcome (succeeded/delivered) or a
      // provider response.
      expect(result.infrastructureNotice).not.toMatch(/succeeded|delivered|provider_unavailable/i);
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });
});
