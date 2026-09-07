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

  it("rejects forbidden text while allowing ordinary sparse draft speech", () => {
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
    })).toMatchObject({ ok: true });
  });

  it("does not use acceptable realizations to satisfy mustSay", () => {
    expect(fidelityCheck({
      mode: "draft",
      draft: "I selected the item.",
      mustSay: ["HY4"],
      mustNot: [],
      acceptableRealizations: ["I selected the item."],
      commitments,
    })).toMatchObject({ ok: false, code: "DRAFT_COMMITMENT_CONFLICT" });
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

  it("rejects affirmative effect claims without structured operational success commitment", () => {
    // Surface claims completed/done without operational commitment
    expect(fidelityCheck({
      mode: "draft",
      draft: "I completed the task and it worked.",
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, operational: [] },
    })).toMatchObject({ ok: false, code: "DRAFT_COMMITMENT_CONFLICT" });

    // Surface claims completed with matching operational success commitment -> ok
    expect(fidelityCheck({
      mode: "draft",
      draft: "I completed the task and it worked.",
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: {
        ...commitments,
        operational: [{ effectRef: "effect:test", claimedState: "succeeded" }],
      },
    })).toMatchObject({ ok: true });
  });

  it("rejects currentness claims without structured current epistemic commitment", () => {
    // Surface claims currentness with only historical commitment
    expect(fidelityCheck({
      mode: "draft",
      draft: "Currently, the status is active right now.",
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: {
        ...commitments,
        epistemic: [{
          dimensions: {
            source: "owner_utterance" as const,
            status: "asserted" as const,
            time: "historical" as const,
            reliability: "owner_supplied" as const,
          },
          statement: "The status was active",
        }],
      },
    })).toMatchObject({ ok: false, code: "DRAFT_COMMITMENT_CONFLICT" });
  });

  it("SW-4 does not mistake questions, reported speech, or self-reference for success claims", () => {
    const ordinary = (draft: string) => fidelityCheck({
      mode: "draft",
      draft,
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, operational: [] },
    });

    expect(ordinary("Are you done for tonight?")).toMatchObject({ ok: true });
    expect(ordinary("They said, \"I completed the task.\"")).toMatchObject({ ok: true });
    expect(ordinary("I haven't completed the task yet.")).toMatchObject({ ok: true });
    expect(ordinary("I will complete the task tomorrow.")).toMatchObject({ ok: true });
    expect(ordinary("I completed my thought and finished speaking.")).toMatchObject({ ok: true });
    expect(ordinary("I completed the task.")).toMatchObject({ ok: false, code: "DRAFT_COMMITMENT_CONFLICT" });
    expect(ordinary("I completed the project.")).toMatchObject({ ok: false, code: "DRAFT_COMMITMENT_CONFLICT" });

    expect(fidelityCheck({
      mode: "draft",
      draft: "The task completed successfully.",
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, operational: [{ effectRef: "effect:test", claimedState: "succeeded" }] },
    })).toMatchObject({ ok: true });
  });

  it("SW-4 does not mistake reported or interrogative currentness for a claim", () => {
    const ordinary = (draft: string) => fidelityCheck({
      mode: "draft",
      draft,
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, epistemic: [] },
    });

    expect(ordinary("That's the latest I heard.")).toMatchObject({ ok: true });
    expect(ordinary("What's the latest status?")).toMatchObject({ ok: true });
    expect(ordinary("They mentioned that the latest status was healthy.")).toMatchObject({ ok: true });
    expect(ordinary("The latest status is healthy.")).toMatchObject({ ok: false, code: "DRAFT_COMMITMENT_CONFLICT" });

    expect(fidelityCheck({
      mode: "draft",
      draft: "The latest status is healthy.",
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments,
    })).toMatchObject({ ok: true });
  });

  it("SW-4 keeps vision and reading honesty checks for direct claims only", () => {
    const ordinary = (draft: string) => fidelityCheck({
      mode: "draft",
      draft,
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, operational: [] },
    });

    expect(ordinary("Can you see the image?")).toMatchObject({ ok: true });
    expect(ordinary("They said, \"I can see the image.\"")).toMatchObject({ ok: true });
    expect(ordinary("I can't claim I can see the image.")).toMatchObject({ ok: true });
    expect(ordinary("I can see the image.")).toMatchObject({ ok: false, code: "UNWITNESSED_HIGH_RISK_CLAIM" });
    expect(fidelityCheck({
      mode: "draft",
      draft: "I can see the image.",
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, operational: [] },
      observations: [{ modality: "vision" }],
    })).toMatchObject({ ok: true });
    expect(ordinary("Did you read the page?")).toMatchObject({ ok: true });
    expect(ordinary("They reported, \"I read the page.\"")).toMatchObject({ ok: true });
    expect(ordinary("I can't claim I read the page.")).toMatchObject({ ok: true });
    expect(ordinary("I read the page.")).toMatchObject({ ok: false, code: "UNWITNESSED_HIGH_RISK_CLAIM" });
    expect(fidelityCheck({
      mode: "draft",
      draft: "I read the page.",
      mustSay: [],
      mustNot: [],
      acceptableRealizations: [],
      commitments: { ...commitments, operational: [] },
      observations: [{ modality: "page" }],
    })).toMatchObject({ ok: true });
  });
});
