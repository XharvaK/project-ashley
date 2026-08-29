import { describe, expect, it } from "vitest";
import {
  assertCausalInvariants,
  type CausalBundle,
} from "./causal-harness.js";

function bundle(overrides: Partial<CausalBundle> = {}): CausalBundle {
  return {
    evidenceShownToThought: [],
    thoughtInputHash: "input-hash",
    settlement: null,
    workingContext: [],
    occupancy: [],
    authorityCodes: [],
    nominations: [],
    expressionInput: null,
    outboxText: null,
    deliveredText: null,
    thoughtModelAttempts: 1,
    acceptedSettlements: 0,
    acceptedGeneration: null,
    ...overrides,
  };
}

const draftSettlement = {
  settlementId: "settlement-1",
  cycleId: "cycle-1",
  generation: 1,
  speech: {
    mode: "draft",
    epistemicCommitments: ["The source says hello."],
    conversationalCommitments: [],
    surfaceDraft: "hello",
    finalLicensedText: "hello",
    mustNot: [],
  },
} as CausalBundle["settlement"];

describe("cognitive v0.2.1 causal acceptance harness", () => {
  it("rejects delivered Ashley text without a published settlement", () => {
    expect(() =>
      assertCausalInvariants(bundle({ deliveredText: "unlicensed" })),
    ).toThrow(/delivered_text_requires_settlement/);
  });

  it("rejects a non-empty draft with no epistemic or conversational commitments", () => {
    const settlement = {
      ...draftSettlement,
      speech: {
        ...draftSettlement!.speech,
        epistemicCommitments: [],
        conversationalCommitments: [],
        surfaceDraft: "unsupported draft",
      },
    } as CausalBundle["settlement"];
    expect(() =>
      assertCausalInvariants(
        bundle({ settlement, acceptedSettlements: 1, outboxText: "unsupported draft" }),
      ),
    ).toThrow(/empty_commitments_with_draft/);
  });

  it("rejects transcript, memory, and capability markers in expression input", () => {
    for (const marker of ["hotMessages", "## Capability self-model"]) {
      expect(() =>
        assertCausalInvariants(bundle({ expressionInput: `draft ${marker}` })),
      ).toThrow(/expression_input_contains_forbidden_evidence/);
    }
  });

  it("accepts a settlement whose outbox text matches the licensed draft", () => {
    expect(() =>
      assertCausalInvariants(
        bundle({
          settlement: draftSettlement,
          outboxText: "hello",
          thoughtModelAttempts: 1,
          acceptedSettlements: 1,
          acceptedGeneration: 1,
        }),
      ),
    ).not.toThrow();
  });
});
