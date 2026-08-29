import { describe, expect, it } from "vitest";
import { fidelityCheck } from "./fidelity.js";

const commitments = {
  epistemic: [{
    dimensions: {
      source: "owner_utterance" as const,
      status: "asserted" as const,
      time: "current" as const,
      reliability: "owner_supplied" as const,
    },
    statement: "HY4 is the selected item",
  }],
  conversational: ["answer" as const],
  stance: {
    warmth: "medium" as const,
    humorAllowed: false,
    disagreement: false,
    uncertaintyDisplay: true,
  },
};

describe("v0.2.1 speech fidelity", () => {
  it("requires a draft and preserves mustSay/mustNot", () => {
    expect(fidelityCheck({
      mode: "draft",
      draft: "HY4 is the selected item",
      mustSay: ["HY4"],
      mustNot: ["HY3"],
      acceptableRealizations: [],
      commitments,
    })).toMatchObject({ ok: true });

    expect(fidelityCheck({
      mode: "draft",
      draft: "HY3 is the selected item",
      mustSay: ["HY4"],
      mustNot: [],
      acceptableRealizations: [],
      commitments,
    })).toMatchObject({ ok: false, code: "DRAFT_COMMITMENT_CONFLICT" });
  });

  it("rejects forbidden text and empty committed draft", () => {
    expect(fidelityCheck({
      mode: "draft",
      draft: "HY4 and HY3",
      mustSay: [],
      mustNot: ["HY3"],
      acceptableRealizations: [],
      commitments,
    })).toMatchObject({ ok: false, code: "DRAFT_COMMITMENT_CONFLICT" });

    expect(fidelityCheck({
      mode: "draft",
      draft: "some words",
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, epistemic: [], conversational: [] },
    })).toMatchObject({ ok: false, code: "EMPTY_COMMITMENTS_WITH_DRAFT" });
  });

  it("accepts a declared alternative realization", () => {
    expect(fidelityCheck({
      mode: "draft",
      draft: "I selected HY4.",
      mustSay: ["HY4"],
      mustNot: [],
      acceptableRealizations: ["I selected HY4."],
      commitments,
    })).toMatchObject({ ok: true });
  });

  it("treats private silence as a successful settlement", () => {
    expect(fidelityCheck({
      mode: "none",
      draft: null,
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, conversational: [] },
    })).toMatchObject({ ok: true });
  });
});
