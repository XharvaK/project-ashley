import { describe, expect, it } from "vitest";
import {
  evaluateQualificationCase,
  runThoughtCapabilityQualification,
  thoughtSchemaKeywordInventory,
  validateQualificationSchema,
  validateThoughtOutputSchema,
  type QualificationGateEvidence,
} from "./thought-capability-qualification.js";

const validAbstain = JSON.stringify({
  kind: "abstain",
  reason: "insufficient_evidence",
  explanation: "The fixture contains no more evidence.",
  evidenceRefs: ["turn-1"],
});

const baseGate: QualificationGateEvidence = {
  transport: "success",
  provider: "nim",
  model: "openai/gpt-oss-20b",
  kernelBinding: "pass",
  fencing: "pass",
  authorityReachability: "pass",
  semanticValidity: "pass",
  resourcePolicy: "pass",
  elapsedMs: 1,
  outputTokens: 64,
  attempts: 1,
  maxOutputTokens: 4096,
  wireMode: "json_object_compatibility",
  wireBindingId: "compat_thought_nim_gpt_oss_20b_json_object_v1",
  providerDeclaredEnforcement: "unavailable",
  capabilityFingerprint: "sha256:" + "a".repeat(64),
};

describe("successor Thought qualification", () => {
  it("passes every declared semantic branch through the real W0 fixture path", async () => {
    const result = await runThoughtCapabilityQualification({
      environment: "fixture",
      provider: "nim",
      model: "openai/gpt-oss-20b",
      allowlistedReferences: ["turn-1"],
      runId: "w2-test-fixture",
    });
    expect(result.verdict).toBe("PASS");
    expect(result.cases.map((item) => item.caseId)).toEqual([
      "settlement",
      "observation_intent",
      "effect_intent",
      "abstain",
      "structural_correction",
    ]);
    expect(result.cases.every((item) =>
      item.transport === "success"
      && item.strictParser === "pass"
      && item.kernelBinding === "pass"
      && item.fencing === "pass"
      && item.authorityReachability === "pass"
      && item.semanticValidity === "pass"
      && item.resourcePolicy === "pass",
    )).toBe(true);
    expect(result.negativeWitnesses?.map((item) => item.witness)).toContain(
      "provider-accepted structural value rejected by the W0 semantic parser",
    );
  });

  it("proves default fixture mode performs no network call", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("fixture_network_forbidden");
    }) as typeof fetch;
    try {
      const result = await runThoughtCapabilityQualification({
        environment: "fixture",
        provider: "nim",
        model: "openai/gpt-oss-20b",
        allowlistedReferences: ["turn-1"],
        runId: "w2-test-no-network",
      });
      expect(result.verdict).toBe("PASS");
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(calls).toBe(0);
  });

  it("derives the schema keyword inventory and fails closed on drift", () => {
    const inventory = thoughtSchemaKeywordInventory();
    expect(inventory).toEqual([
      "additionalProperties",
      "const",
      "enum",
      "items",
      "maxItems",
      "minLength",
      "oneOf",
      "pattern",
      "properties",
      "required",
      "type",
    ]);
    const parsed = JSON.parse(validAbstain) as Record<string, unknown>;
    expect(validateThoughtOutputSchema(parsed).ok).toBe(true);
    expect(validateThoughtOutputSchema({ ...parsed, unexpected: true }).ok).toBe(false);
    expect(() => validateQualificationSchema({}, {
      type: "object",
      format: "unsupported",
    })).toThrow("thought_schema_oracle_unsupported_keyword:format");
  });

  it("fails each conjunct independently when its evidence is false", () => {
    const predicates = [
      "kernelBinding",
      "fencing",
      "authorityReachability",
      "semanticValidity",
      "resourcePolicy",
    ] as const;
    for (const predicate of predicates) {
      const result = evaluateQualificationCase({
        caseId: "abstain",
        rawContent: validAbstain,
        allowlistedReferences: ["turn-1"],
        gateEvidence: {
          ...baseGate,
          [predicate]: "fail",
        },
      });
      expect(result.verdict, predicate).toBe("NOT_QUALIFIED");
      expect(result.failureCodes.length, predicate).toBeGreaterThan(0);
    }
  });

  it("records a provider-accepted parser rejection as a negative witness", () => {
    const result = evaluateQualificationCase({
      caseId: "abstain",
      rawContent: JSON.stringify({
        kind: "abstain",
        reason: "INSUFFICIENT_EVIDENCE",
        explanation: "x",
        evidenceRefs: [],
      }),
      allowlistedReferences: [],
    });
    expect(result.verdict).toBe("NOT_QUALIFIED");
    expect(result.failureCodes).toContain("PROVIDER_ACCEPTED_PARSER_REJECTED");
  });

  it("refuses silent route substitution", async () => {
    const result = await runThoughtCapabilityQualification({
      environment: "fixture",
      provider: "groq",
      model: "openai/gpt-oss-20b",
      allowlistedReferences: [],
    });
    expect(result.verdict).toBe("NOT_QUALIFIED");
    expect(result.cases).toHaveLength(0);
  });
});
