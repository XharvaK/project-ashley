import { describe, expect, it } from "vitest";
import { makeThoughtDraft } from "../test-support.js";
import type { AuthorityPacks, EffectProposal, ThoughtSettlementDraft } from "../types.js";
import { checkAuthority } from "./check.js";

function packs(overrides: Partial<AuthorityPacks> = {}): AuthorityPacks {
  return {
    epistemic: { allowInferredWorldClaims: false },
    currentness: { requireObservationForLatest: true },
    receipt: { receiptsByEffectId: {} },
    capability: {
      vision: false, attachmentText: false, conversationalRead: false, webSearch: false,
      canOfferProjectInspection: false, canOfferWorkspace: false, canOfferVerification: false,
      canOfferAuthorship: false, canOfferBoundedOperation: false, canOfferPatchExport: false,
      approvedProjectIds: [],
    },
    operational: { sandboxAvailable: false },
    relational: { withdrawalActive: false, neverMention: [] },
    stateEpoch: { authorityEpoch: 1 },
    ...overrides,
  };
}

describe("v0.2.1 deterministic Authority", () => {
  it("rejects a latest claim without current observation and does not rewrite it", () => {
    const draft = makeThoughtDraft({ commitments: {
      ...makeThoughtDraft().commitments,
      epistemic: [{ ...makeThoughtDraft().commitments.epistemic[0]!, statement: "the latest HY4 shipped today" }],
    }});
    const result = checkAuthority("settlement", { settlement: draft, packs: packs(), authorityEpoch: 1 });
    expect(result).toMatchObject({ ok: false, codes: ["CURRENTNESS_UNVERIFIED"] });
    expect(draft.commitments.epistemic[0]?.statement).toBe("the latest HY4 shipped today");
  });

  it("accepts the same claim when a consumed page observation is present", () => {
    const draft = makeThoughtDraft({ commitments: {
      ...makeThoughtDraft().commitments,
      epistemic: [{ ...makeThoughtDraft().commitments.epistemic[0]!, statement: "the latest HY4 shipped today" }],
    }, operations: { ...makeThoughtDraft().operations, observationsConsumed: ["obs-1"] }});
    expect(checkAuthority("settlement", {
      settlement: draft,
      packs: packs({ currentness: { requireObservationForLatest: true, observedObservationIds: ["obs-1"] } }),
      authorityEpoch: 1,
    })).toEqual({ ok: true });
  });

  it("bounds effect claims to durable receipts", () => {
    const draft = makeThoughtDraft({ operations: { ...makeThoughtDraft().operations, effectsCompleted: ["effect-1"] }, commitments: {
      ...makeThoughtDraft().commitments,
      epistemic: [{ ...makeThoughtDraft().commitments.epistemic[0]!, statement: "it worked" }],
    }});
    expect(checkAuthority("settlement", { settlement: draft, packs: packs(), authorityEpoch: 1 })).toMatchObject({ ok: false, codes: ["RECEIPT_REQUIRED"] });
    expect(checkAuthority("settlement", { settlement: draft, packs: packs({ receipt: { receiptsByEffectId: { "effect-1": { receiptId: "r1", effectId: "effect-1", idempotencyKey: "i1", outcome: "failed", claims: {}, atMs: 1, dataClassification: "ordinary", secretOmitted: false } } } }), authorityEpoch: 1 })).toMatchObject({ ok: false, codes: ["RECEIPT_CONTRADICTS_CLAIM"] });
  });

  it("checks active host-owned receipt outcomes even when effectsCompleted is empty", () => {
    const draft = makeThoughtDraft({ commitments: {
      ...makeThoughtDraft().commitments,
      epistemic: [{ ...makeThoughtDraft().commitments.epistemic[0]!, statement: "it worked" }],
    }});
    const activeEffect = {
      effectId: "effect-1",
      cycleId: "cycle-1",
      generation: 1,
      wakeId: "wake-1",
      correlationId: "effect-1",
      idempotencyKey: "idem-1",
      status: "receipted" as const,
      dispatchedAtMs: 1,
      originJobId: null,
    };
    const failedReceipt = {
      receiptId: "r1",
      effectId: "effect-1",
      idempotencyKey: "i1",
      outcome: "failed" as const,
      claims: {},
      atMs: 1,
      dataClassification: "ordinary" as const,
      secretOmitted: false,
    };
    const unknownReceipt = { ...failedReceipt, receiptId: "r2", outcome: "unknown" as const };
    expect(checkAuthority("settlement", {
      settlement: draft,
      packs: packs({ receipt: { receiptsByEffectId: { "effect-1": failedReceipt } } }),
      authorityEpoch: 1,
      activeEffects: [activeEffect],
    })).toEqual({ ok: false, codes: ["RECEIPT_CONTRADICTS_CLAIM"] });
    expect(checkAuthority("settlement", {
      settlement: draft,
      packs: packs({ receipt: { receiptsByEffectId: { "effect-1": unknownReceipt } } }),
      authorityEpoch: 1,
      activeEffects: [activeEffect],
    })).toEqual({ ok: false, codes: ["IN_FLIGHT_UNKNOWN"] });
  });

  it("rechecks dispatch epoch and blocks relational withdrawal", () => {
    const proposal: EffectProposal = { effectId: "effect-1", cycleId: "cycle-1", generation: 1, idempotencyKey: "idem-1", kind: "workspace.write_file", request: {}, authorityEpoch: 1 };
    expect(checkAuthority("dispatch", { proposal, packs: packs({ stateEpoch: { authorityEpoch: 2 } }), authorityEpoch: 2 })).toMatchObject({ ok: false, codes: ["DISPATCH_EPOCH_CHANGED"] });
    const draft = makeThoughtDraft();
    expect(checkAuthority("settlement", { settlement: draft, packs: packs({ relational: { withdrawalActive: true, neverMention: [] } }), authorityEpoch: 1 })).toMatchObject({ ok: false, codes: ["RELATIONAL_WITHDRAWAL"] });
  });

  it("caps revision loops instead of allowing a livelock", () => {
    const draft: ThoughtSettlementDraft = makeThoughtDraft({ authority: { objectionsApplied: ["STALE_STATE"], revisionCount: 2 } });
    expect(checkAuthority("settlement", { settlement: draft, packs: packs(), authorityEpoch: 1 })).toMatchObject({ ok: false, codes: ["REVISION_BUDGET_EXHAUSTED"] });
  });
});
