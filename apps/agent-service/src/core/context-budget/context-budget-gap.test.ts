import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { listCapabilityStatuses } from "../rollout/capabilities.js";
import { createContextProjection } from "../model-fabric/projection.js";
import { composeInitialThoughtMessages } from "../agency/thought.js";
import type { Decision, Motivation } from "../types.js";

const OWNER_ID = "c2-gap-owner";

function baseDecision(): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 100,
    reason: "gap fixture",
    objective: "answer",
    evidenceRefs: [],
    uncertainty: 0,
    urgency: 0,
    thoughtSource: "deterministic",
    thoughtError: null,
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0,
      openness: 0,
      tension: 0,
      reason: "gap fixture",
    },
    cognitiveAllocation: {
      shouldSpeak: true,
      effort: "low",
      completion: "complete",
    },
    authorizedClaims: {
      readingRecordIds: [],
      readingTitles: [],
      readingClaims: [],
    },
  };
}

function motivation(id: number, summary: string): Motivation {
  return {
    id,
    ownerId: OWNER_ID,
    kind: "user_message",
    score: 100 - id,
    refType: "message",
    refId: id,
    summary,
  };
}

describe("C2 implementation-HEAD gap characterization", () => {
  it("has the C2 allocation schema and minimal Fabric projection seam", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      expect(db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'context_allocation_receipts'",
      ).get()).toEqual({ 1: 1 });
      expect(db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'context_budget_policies'",
      ).get()).toEqual({ 1: 1 });
      expect(createContextProjection({
        purpose: "thought",
        contextPolicyId: "c2-gap",
        messages: [{ role: "system", content: "schema" }],
      }).evidenceRefs).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("does not impose the retired positional twelve-candidate cut", () => {
    const messages = composeInitialThoughtMessages({
      base: baseDecision(),
      motivations: Array.from({ length: 14 }, (_, index) =>
        motivation(index + 1, `candidate ${index + 1}`)),
      trigger: "reactive",
      canOffer: false,
      canOfferWorkspace: false,
      canOfferVerification: false,
      canOfferAuthorship: false,
      canOfferOperation: false,
      canOfferExport: false,
      approvedProjectIds: [],
    });
    const payload = JSON.parse(messages[1]?.content ?? "{}") as {
      candidates?: unknown[];
    };
    expect(payload.candidates).toHaveLength(14);
  });

  it("declares C2 observe capability without live influence", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const status = listCapabilityStatuses(db).find((item) => item.capability === "context_budget");
      expect(status).toMatchObject({ state: "observe", effective: false });
    } finally {
      db.close();
    }
  });
});
