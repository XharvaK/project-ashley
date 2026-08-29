import { describe, expect, it } from "vitest";
import { makeThoughtDraft } from "../test-support.js";
import { validateThoughtSettlementDraft } from "./validate.js";

const active = {
  cycleId: "cycle-1",
  generation: 1,
  occupantId: "doc",
  authorityEpoch: 1,
  consumedEffectIds: ["effect-1"],
};

describe("v0.2.1 ThoughtSettlementDraft validation", () => {
  it("rejects missing schemaVersion and draft speech without surfaceDraft", () => {
    const missing = { ...makeThoughtDraft(), schemaVersion: undefined };
    expect(validateThoughtSettlementDraft(missing, active)).toMatchObject({ ok: false, kind: "malformed" });

    const noSurface = makeThoughtDraft({ speech: { ...makeThoughtDraft().speech, surfaceDraft: null } });
    expect(validateThoughtSettlementDraft(noSurface, active)).toMatchObject({ ok: false, kind: "malformed" });
  });

  it("rejects none mode with text, empty commitments, unknown effects, and excess revisions", () => {
    const noneWithText = makeThoughtDraft({
      speech: { ...makeThoughtDraft().speech, mode: "none", surfaceDraft: "should not speak" },
    });
    expect(validateThoughtSettlementDraft(noneWithText, active)).toMatchObject({ ok: false, kind: "malformed" });

    const emptyCommitments = makeThoughtDraft({
      commitments: { ...makeThoughtDraft().commitments, epistemic: [], conversational: [] },
    });
    expect(validateThoughtSettlementDraft(emptyCommitments, active)).toMatchObject({ ok: false, kind: "conflict" });

    const unknownEffect = makeThoughtDraft({ operations: { ...makeThoughtDraft().operations, effectsCompleted: ["effect-unknown"] } });
    expect(validateThoughtSettlementDraft(unknownEffect, active)).toMatchObject({ ok: false, kind: "malformed" });

    const tooManyRevisions = makeThoughtDraft({ authority: { objectionsApplied: [], revisionCount: 3 } });
    expect(validateThoughtSettlementDraft(tooManyRevisions, active)).toMatchObject({ ok: false, kind: "malformed" });
  });

  it("accepts a private none settlement with an occupancy delta", () => {
    const draft = makeThoughtDraft({
      speech: { ...makeThoughtDraft().speech, mode: "none", surfaceDraft: null },
      commitments: { ...makeThoughtDraft().commitments, epistemic: [], conversational: [] },
      occupancyDelta: [{
        op: "set",
        occupancy: {
          conversationId: "thread-1",
          concernId: "concern-1",
          status: "active",
          priority: 2,
          updatedGeneration: 1,
        },
      }],
    });
    expect(validateThoughtSettlementDraft(draft, active)).toMatchObject({ ok: true, draft });
  });

  it("rejects published-only fields instead of accepting model-authored license state", () => {
    const published = { ...makeThoughtDraft(), finalLicensedText: "licensed" };
    expect(validateThoughtSettlementDraft(published, active)).toMatchObject({ ok: false, kind: "malformed" });
  });
});
