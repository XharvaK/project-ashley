import { describe, expect, it } from "vitest";
import { env } from "../../../env.js";
import {
  evaluateQualificationCase,
  runThoughtCapabilityQualification,
  thoughtSchemaKeywordInventory,
  validateQualificationSchema,
  validateThoughtOutputSchema,
  type QualificationGateEvidence,
} from "./thought-capability-qualification.js";
import { qualificationCheckoutIdentity } from "../../rollout/capabilities.js";

const validAbstain = JSON.stringify({
  kind: "abstain",
  reason: "insufficient_evidence",
  explanation: "The fixture contains no more evidence.",
  evidenceRefs: ["turn-1"],
});

const baseGate: QualificationGateEvidence = {
  transport: "success",
  provider: "mistral",
  model: "mistral-small-2603",
  kernelBinding: "pass",
  fencing: "pass",
  authorityReachability: "pass",
  semanticValidity: "pass",
  resourcePolicy: "pass",
  elapsedMs: 1,
  outputTokens: 64,
  attempts: 1,
  maxOutputTokens: 4096,
  wireMode: "native_json_schema",
  wireBindingId: "compat_thought_mistral_small_2603_native_json_schema_v2",
  providerDeclaredEnforcement: "unavailable",
  capabilityFingerprint: "sha256:" + "a".repeat(64),
};

describe("successor Thought qualification", () => {
  it("passes every declared semantic branch through the real W0 fixture path", async () => {
    const result = await runThoughtCapabilityQualification({
      environment: "fixture",
      provider: "mistral",
      model: "mistral-small-2603",
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
        provider: "mistral",
        model: "mistral-small-2603",
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

  it("retains precise closed-schema diagnostics without persisting provider content", () => {
    const result = evaluateQualificationCase({
      caseId: "abstain",
      rawContent: JSON.stringify({ kind: "unknown", explanation: "not a permitted branch" }),
      allowlistedReferences: [],
      gateEvidence: {
        ...baseGate,
        dispatchTruth: "response_received",
        dispatchStage: "provider_dispatch",
        providerRequestStarted: true,
        providerResponseReceived: true,
        attemptId: "attempt:provider-content",
      },
    });

    expect(result.diagnostics.firstFailureBoundary).toBe("LOCAL_SCHEMA_REJECTION");
    expect(result.diagnostics.closedSchemaFailureKeyword).toBe("oneOf");
    expect(result.diagnostics.closedSchemaFailureInstancePath).toBe("$");
    expect(result.diagnostics.closedSchemaFailureSchemaPath).toBe("#/oneOf");
    expect(result.diagnostics.dispatchTruth).toBe("response_received");
    expect(result.diagnostics.providerRequestStarted).toBe(true);
    expect(result.diagnostics.providerResponseReceived).toBe(true);
    expect(result.diagnostics.attemptId).toBe("attempt:provider-content");
    expect(result.diagnostics.reachability).toEqual({
      kernelBinding: "NOT_REACHED",
      fencing: "NOT_REACHED",
      authorityReachability: "NOT_REACHED",
      semanticValidity: "NOT_REACHED",
    });
    expect("rawContent" in result).toBe(false);
    expect(result.rawContentBytes).toBeGreaterThan(0);
  });

  it("classifies a local pre-dispatch failure without claiming provider reliability", () => {
    const result = evaluateQualificationCase({
      caseId: "abstain",
      rawContent: "",
      allowlistedReferences: [],
      gateEvidence: {
        ...baseGate,
        transport: "failure",
        provider: undefined,
        model: undefined,
        kernelBinding: "fail",
        fencing: "fail",
        authorityReachability: "fail",
        semanticValidity: "fail",
        resourcePolicy: "fail",
        dispatchTruth: "not_sent",
        dispatchStage: "attention_admission",
        providerRequestStarted: false,
        providerResponseReceived: false,
        attemptId: null,
        errorCode: "request_exceeds_tpm_budget",
      },
    });

    expect(result.diagnostics.firstFailureBoundary).toBe("PRE_DISPATCH_LOCAL_FAILURE");
    expect(result.diagnostics.dispatchTruth).toBe("not_sent");
    expect(result.diagnostics.providerRequestStarted).toBe(false);
    expect(result.diagnostics.providerResponseReceived).toBe(false);
    expect(result.diagnostics.errorCode).toBe("request_exceeds_tpm_budget");
    expect(result.diagnostics.reachability).toEqual({
      kernelBinding: "NOT_REACHED",
      fencing: "NOT_REACHED",
      authorityReachability: "NOT_REACHED",
      semanticValidity: "NOT_REACHED",
    });
  });

  it("distinguishes a dispatched attempt with no response from a provider error response", () => {
    const noResponse = evaluateQualificationCase({
      caseId: "abstain",
      rawContent: "",
      allowlistedReferences: [],
      gateEvidence: {
        ...baseGate,
        transport: "failure",
        dispatchTruth: "sent_outcome_unknown",
        dispatchStage: "provider_dispatch",
        providerRequestStarted: true,
        providerResponseReceived: false,
        attemptId: "attempt:no-response",
        errorCode: "timeout",
      },
    });
    const providerError = evaluateQualificationCase({
      caseId: "abstain",
      rawContent: "",
      allowlistedReferences: [],
      gateEvidence: {
        ...baseGate,
        transport: "failure",
        dispatchTruth: "response_received",
        dispatchStage: "provider_dispatch",
        providerRequestStarted: true,
        providerResponseReceived: true,
        attemptId: "attempt:provider-error",
        errorCode: "provider_unavailable",
      },
    });

    expect(noResponse.diagnostics.firstFailureBoundary).toBe("REQUEST_DISPATCHED_NO_RESPONSE");
    expect(providerError.diagnostics.firstFailureBoundary).toBe("PROVIDER_ERROR_RESPONSE");
    expect(noResponse.diagnostics.attemptId).toBe("attempt:no-response");
    expect(providerError.diagnostics.attemptId).toBe("attempt:provider-error");
  });

  it("rejects a stale production release label before isolated live dispatch", async () => {
    const checkoutIdentity = qualificationCheckoutIdentity();
    const staleReleaseIdentity = checkoutIdentity === "a".repeat(40)
      ? "b".repeat(40)
      : "a".repeat(40);
    const originalReleaseIdentity = env.ashleyReleaseId;
    let completeChatCalls = 0;
    env.ashleyReleaseId = staleReleaseIdentity;
    try {
      const result = await runThoughtCapabilityQualification({
        environment: "isolated_live",
        provider: "mistral",
        model: "mistral-small-2603",
        candidateSha: checkoutIdentity,
        allowlistedReferences: [],
        noFallback: true,
        completeChat: async () => {
          completeChatCalls += 1;
          throw new Error("network_must_not_start");
        },
      });
      expect(result.verdict).toBe("NOT_RUN");
      expect(result.preflight).toMatchObject({
        errorCode: "qualification_release_identity_mismatch",
      });
      expect(completeChatCalls).toBe(0);
    } finally {
      env.ashleyReleaseId = originalReleaseIdentity;
    }
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
