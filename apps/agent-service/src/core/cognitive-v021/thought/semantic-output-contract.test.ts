import { describe, expect, it } from "vitest";
import { thoughtOutputStructuredRequest } from "./output-contract.js";
import { parseThoughtSemanticOutput } from "./parse.js";

const refs = new Set(["turn-1", "observation-1"]);

const settlement = {
  kind: "settlement",
  interpretation: {
    discourseActs: ["inform"],
    referentBindings: [{ span: "this", sourceTurnRefs: ["turn-1"] }],
    corrections: [],
    unresolvedAmbiguities: [],
    topics: ["testing"],
  },
  commitments: {
    epistemic: [],
    conversational: ["answer"],
    stance: {
      warmth: "medium",
      humorAllowed: false,
      disagreement: false,
      uncertaintyDisplay: true,
    },
  },
  speech: {
    mode: "draft",
    mustSay: ["I can verify that."],
    mustNotSay: [],
    acceptableRealizations: [],
    presentationDirectives: [],
  },
  workingContextDeltas: [],
  concernDeltas: [],
  occupancyDeltas: [],
  futureTriggerDeltas: [],
  subscriptionDeltas: [],
  durableNominations: [],
  evidenceUse: {
    observationRefsUsed: [],
    retrievalRefsUsed: [],
    sourceRefsUsed: ["turn-1"],
    openIntentRefs: [],
  },
};

describe("Thought semantic output contract", () => {
  it("accepts each of the four semantic branches", () => {
    expect(parseThoughtSemanticOutput(settlement, refs)).toMatchObject({ ok: true, value: { kind: "settlement" } });
    expect(parseThoughtSemanticOutput({
      kind: "observation_intent",
      operationKind: "project.read_file",
      request: { path: "README.md" },
      purpose: "verify the project state",
      evidenceNeed: "the current file contents",
      existingRefs: ["turn-1"],
    }, refs)).toMatchObject({ ok: true, value: { kind: "observation_intent" } });
    expect(parseThoughtSemanticOutput({
      kind: "effect_intent",
      operationKind: "workspace.write_file",
      request: { path: "candidate.txt", content: "bounded" },
      purpose: "prepare the requested candidate",
      expectedOutcome: "a candidate file exists",
      existingRefs: ["turn-1"],
    }, refs)).toMatchObject({ ok: true, value: { kind: "effect_intent" } });
    expect(parseThoughtSemanticOutput({
      kind: "abstain",
      reason: "insufficient_evidence",
      explanation: "The current evidence is not enough.",
      evidenceRefs: ["turn-1"],
    }, refs)).toMatchObject({ ok: true, value: { kind: "abstain" } });
  });

  it("rejects model-authored mechanics, coercions, loose enums, and unknown fields", () => {
    for (const value of [
      { ...settlement, cycleId: "cycle-1" },
      { ...settlement, finalLicensedText: "model licensed this" },
      { ...settlement, authorityEpoch: 1 },
      { ...settlement, speech: { ...settlement.speech, mustSay: "one string" } },
      { ...settlement, commitments: { ...settlement.commitments, stance: { ...settlement.commitments.stance, humorAllowed: "false" } } },
      { ...settlement, interpretation: { ...settlement.interpretation, referentBindings: [{ span: "this", sourceTurnRefs: ["turn-1"], unexpected: true }] } },
      { kind: "abstain", reason: "INSUFFICIENT_EVIDENCE", explanation: "x", evidenceRefs: [] },
      { kind: "abstain", reason: "insufficient_evidence", explanation: "x", evidenceRefs: "turn-1" },
      { kind: "abstain", reason: "insufficient_evidence", explanation: "x", evidenceRefs: [], revisionCount: 1 },
      { kind: "observation_intent", operationKind: "PROJECT.READ_FILE", request: { path: "x" }, purpose: "x", evidenceNeed: "x", existingRefs: ["turn-1"] },
      { kind: "observation_intent", operationKind: "unregistered.operation", request: { path: "x" }, purpose: "x", evidenceNeed: "x", existingRefs: ["turn-1"] },
      { kind: "effect_intent", operationKind: "workspace.write_file", request: { path: "x" }, purpose: "x", expectedOutcome: "x", existingRefs: "turn-1" },
      { kind: "observation_intent", operationKind: "project.read_file", request: { path: "x" }, purpose: "x", evidenceNeed: "x", existingRefs: ["unknown"] },
    ]) {
      expect(parseThoughtSemanticOutput(value, refs)).toMatchObject({ ok: false });
    }
  });

  it("rejects the predecessor envelope and every kernel-owned identity field", () => {
    expect(parseThoughtSemanticOutput({
      kind: "settlement",
      cycleId: "cycle-1",
      generation: 1,
      pass: 1,
      requestId: "request-1",
      occupantId: "occupant-1",
      settlement,
    }, refs)).toMatchObject({ ok: false });

    const kernelOwnedFields: Record<string, unknown> = {
      cycleId: "cycle-1",
      generation: 1,
      pass: 1,
      requestId: "request-1",
      occupantId: "occupant-1",
      authorityEpoch: 1,
      architectureEpoch: "v0.2.1",
      triggerRef: "turn-1",
      settlementId: "settlement-1",
      nuclearReservationId: "reservation-1",
      deliveryState: "pending",
    };
    for (const [field, value] of Object.entries(kernelOwnedFields)) {
      expect(parseThoughtSemanticOutput({ ...settlement, [field]: value }, refs), field)
        .toMatchObject({ ok: false });
    }
  });

  it("publishes the successor structured request with only the four semantic branches", () => {
    const request = thoughtOutputStructuredRequest();
    const schema = request.schema as {
      $id: string;
      oneOf: Array<{ properties?: Record<string, { const?: string }> }>;
    };

    expect(request.contractId).toBe("ashley.thought.semantic.v1");
    expect(request.schemaId).toBe("ashley.thought.semantic.v1.schema");
    expect(schema.$id).toBe("ashley.thought.semantic.v1.schema");
    expect(schema.oneOf.map((branch) => branch.properties?.kind?.const)).toEqual([
      "settlement",
      "observation_intent",
      "effect_intent",
      "abstain",
    ]);
    for (const branch of schema.oneOf) {
      expect(branch.properties).not.toHaveProperty("cycleId");
      expect(branch.properties).not.toHaveProperty("generation");
      expect(branch.properties).not.toHaveProperty("pass");
      expect(branch.properties).not.toHaveProperty("requestId");
      expect(branch.properties).not.toHaveProperty("occupantId");
    }
  });
});
