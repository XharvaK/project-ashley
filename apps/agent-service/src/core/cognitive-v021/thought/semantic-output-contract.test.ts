import { describe, expect, it } from "vitest";
import {
  thoughtOutputCompatibilityInstruction,
  thoughtOutputStructuredRequest,
} from "./output-contract.js";
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
    surfaceDraft: "I can verify that.",
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

  it("requires a non-empty surfaceDraft for draft speech across the parser and schema", () => {
    const missingSurfaceDraft = {
      ...settlement,
      speech: { ...settlement.speech },
    };
    delete (missingSurfaceDraft.speech as { surfaceDraft?: unknown }).surfaceDraft;

    expect(parseThoughtSemanticOutput(missingSurfaceDraft, refs)).toMatchObject({ ok: false });
    expect(parseThoughtSemanticOutput({
      ...settlement,
      speech: { ...settlement.speech, surfaceDraft: "" },
    }, refs)).toMatchObject({ ok: false });

    const request = thoughtOutputStructuredRequest();
    const schema = request.schema as {
      oneOf: Array<{
        properties?: {
          kind?: { const?: string };
          speech?: { oneOf?: Array<{ required?: string[]; properties?: Record<string, unknown> }> };
        };
      }>;
    };
    const settlementSchema = schema.oneOf.find((branch) => branch.properties?.kind?.const === "settlement");
    const draftSpeechSchema = settlementSchema?.properties?.speech?.oneOf?.find(
      (branch) => branch.properties?.mode && (branch.properties.mode as { const?: string }).const === "draft",
    );

    expect(draftSpeechSchema?.required).toContain("surfaceDraft");
    expect(draftSpeechSchema?.properties?.surfaceDraft).toMatchObject({ type: "string", minLength: 1 });
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

  it("rejects fixed structural shapes that the native schema rejects", () => {
    expect(parseThoughtSemanticOutput({
      kind: "observation_intent",
      operationKind: "project.read_file",
      request: { path: "x" },
      purpose: "",
      evidenceNeed: "x",
      existingRefs: ["turn-1"],
    }, refs)).toMatchObject({ ok: false });
    expect(parseThoughtSemanticOutput({
      kind: "effect_intent",
      operationKind: "workspace.verify",
      request: { path: "x" },
      purpose: "x",
      expectedOutcome: "",
      existingRefs: ["turn-1"],
    }, refs)).toMatchObject({ ok: false });
    expect(parseThoughtSemanticOutput({
      kind: "abstain",
      reason: "insufficient_evidence",
      explanation: "",
      evidenceRefs: [],
    }, refs)).toMatchObject({ ok: false });
    expect(parseThoughtSemanticOutput({
      ...settlement,
      occupancyDeltas: [{
        op: "set",
        concernRef: { kind: "existing", ref: "turn-1" },
        status: "active",
        priority: 1.5,
      }],
    }, refs)).toMatchObject({ ok: false });
    expect(parseThoughtSemanticOutput({
      ...settlement,
      futureTriggerDeltas: [{
        op: "create",
        identity: { kind: "local", alias: "future-1" },
        concernRef: { kind: "existing", ref: "turn-1" },
        dueAtMs: 1.5,
        purpose: "check",
        payload: {},
      }],
    }, refs)).toMatchObject({ ok: false });
    expect(parseThoughtSemanticOutput({
      ...settlement,
      subscriptionDeltas: [{
        op: "create",
        subscription: {
          identity: { kind: "local", alias: "subscription-1" },
          concernRef: null,
          source: "owner",
          scope: "qualification",
          topicKeys: [],
          match: "equality",
          expiresAtMs: 1.5,
        },
      }],
    }, refs)).toMatchObject({ ok: false });
  });

  it("attributes operation purpose and existing-reference failures to their owning fields", () => {
    const effect = {
      kind: "effect_intent",
      operationKind: "conversation.read",
      request: { conversationId: "qualification-conversation", turnId: "turn-1" },
      purpose: "read the requested conversation",
      expectedOutcome: "the requested conversation is available",
      existingRefs: ["turn-1"],
    };

    expect(parseThoughtSemanticOutput(effect, refs)).toEqual({
      ok: true,
      value: effect,
    });
    expect(parseThoughtSemanticOutput({ ...effect, purpose: "" }, refs)).toEqual({
      ok: false,
      code: "wrong_type",
      field: "purpose",
    });
    expect(parseThoughtSemanticOutput({ ...effect, existingRefs: ["qualification-conversation:turn-1"] }, refs)).toEqual({
      ok: false,
      code: "reference_not_allowlisted",
      field: "existingRefs",
    });
    expect(parseThoughtSemanticOutput({ ...effect, existingRefs: "turn-1" }, refs)).toEqual({
      ok: false,
      code: "wrong_type",
      field: "existingRefs",
    });
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

  it("teaches Thought the semantic selection law separately from output shape", () => {
    const instruction = thoughtOutputCompatibilityInstruction();

    expect(instruction).toContain("Semantic selection rules");
    expect(instruction).toContain("settlement only when the current supplied evidence and context are sufficient");
    expect(instruction).toContain("observation_intent when the answer requires additional read-only evidence acquisition");
    expect(instruction).toContain("effect_intent when the requested outcome requires a governed mechanical effect");
    expect(instruction).toContain("abstain when required evidence, capability, or an admissible basis is absent or unresolved");
    expect(instruction).toContain("Do not use settlement as a placeholder for an unperformed observation or effect");
    expect(instruction).toContain('semanticClass:"observation" requires observation_intent');
    expect(instruction).toContain('semanticClass:"effect" requires effect_intent');
    expect(instruction).toContain("readOnly does not convert an effect-class operation into an observation");
    expect(instruction).toContain("workspace.verify");
    expect(instruction).toContain("This contract describes output shape only");
  });

  it("teaches Thought that observation requires need-resolving relevance and abstain takes precedence", () => {
    const instruction = thoughtOutputCompatibilityInstruction();

    // OBSERVATION_REQUIRES_NEED_RESOLVING_RELEVANCE
    expect(instruction).toContain("only when an available observation can actually supply evidence capable of resolving the current semantic need");
    // UNRELATED_AVAILABLE_OBSERVATION_DOES_NOT_JUSTIFY_OBSERVATION
    expect(instruction).toContain("the availability of an unrelated observation does not justify observation");
    // ABSTAIN_PRECEDENCE_WHEN_NO_AVAILABLE_OBSERVATION_CAN_SUPPLY_NEEDED_EVIDENCE
    expect(instruction).toContain("when no available observation can supply the needed evidence, abstain takes precedence over observation");
  });

  it("teaches Thought the governed currentness rule Authority already enforces", () => {
    const instruction = thoughtOutputCompatibilityInstruction();

    // CURRENT_REQUIRES_GOVERNED_OBSERVATION
    expect(instruction).toContain("governed evidence status, not ordinary conversational recency");
    expect(instruction).toContain('Use time:current only for a factual claim whose present truth is supported by a governed observation supplied in the current Thought input');
    expect(instruction).toContain("evidenceUse.observationRefsUsed");
    // SOURCE_REF_ALONE_NOT_CURRENT
    expect(instruction).toContain("a source reference, a retrieval reference");
    expect(instruction).toContain("does not by itself license");
    // OWNER_RECENCY_NOT_CURRENT
    expect(instruction).toContain("the fact that the owner just sent a message does not by itself license");
    // UNKNOWN_FRESHNESS_DEFINED
    expect(instruction).toContain('Use time:unknown_freshness when evidence supports a claim but its present truth has not been established by governed current observation');
    // HISTORICAL_DEFINED
    expect(instruction).toContain('Use time:historical for a claim about a past state or event that does not assert it is still true now');
    // EPISTEMIC_COMMITMENT_MAY_BE_OMITTED_FOR_ACK
    expect(instruction).toContain("omit the epistemic commitment");
    expect(instruction).toContain("an empty epistemic array is valid");
  });

  it("carries semantic branch intent in the native schema without changing branch shape", () => {
    const request = thoughtOutputStructuredRequest();
    const schema = request.schema as {
      oneOf: Array<{ description?: string }>;
    };

    expect(schema.oneOf.map((branch) => branch.description)).toEqual([
      expect.stringContaining("current supplied evidence and context are sufficient"),
      expect.stringContaining("additional read-only evidence acquisition"),
      expect.stringContaining("governed mechanical effect"),
      expect.stringContaining("required evidence, capability, or an admissible basis is absent"),
    ]);
  });
});
