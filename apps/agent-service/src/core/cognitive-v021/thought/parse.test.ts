import { describe, expect, it } from "vitest";
import { makeThoughtDraft } from "../test-support.js";
import { parseThoughtStepOutput } from "./parse.js";

const active = {
  cycleId: "cycle-1",
  generation: 1,
  pass: 2,
  requestId: "request-2",
  occupantId: "doc",
  authorityEpoch: 1,
};

describe("v0.2.1 ThoughtStepOutput parser", () => {
  it("parses an explicit settlement envelope and a flat settlement draft", () => {
    const explicit = parseThoughtStepOutput(JSON.stringify({
      kind: "settlement",
      cycleId: active.cycleId,
      generation: active.generation,
      pass: active.pass,
      requestId: active.requestId,
      occupantId: active.occupantId,
      settlement: makeThoughtDraft(),
    }), active);
    expect(explicit).toMatchObject({ kind: "settlement", settlement: { cycleId: "cycle-1" } });

    const flat = parseThoughtStepOutput(JSON.stringify(makeThoughtDraft()), active);
    expect(flat).toMatchObject({ kind: "settlement", cycleId: "cycle-1", pass: 2, requestId: "request-2" });
  });

  it("accepts observation and effect operation steps", () => {
    const observation = parseThoughtStepOutput(JSON.stringify({
      kind: "observation_request",
      cycleId: "cycle-1",
      generation: 1,
      pass: 2,
      requestId: "request-2",
      occupantId: "doc",
      correlationId: "correlation-1",
      deadlineAtMs: 100,
      observationRequest: {
        requestId: "observation-1",
        cycleId: "cycle-1",
        generation: 1,
        kind: "lookup",
        request: { key: "x" },
        replaySafe: true,
      },
    }), active);
    expect(observation).toMatchObject({ kind: "observation_request", correlationId: "correlation-1" });

    const effect = parseThoughtStepOutput(JSON.stringify({
      kind: "effect_proposal",
      cycleId: "cycle-1",
      generation: 1,
      pass: 2,
      requestId: "request-2",
      occupantId: "doc",
      correlationId: "correlation-2",
      deadlineAtMs: 100,
      effectProposal: {
        effectId: "effect-1",
        cycleId: "cycle-1",
        generation: 1,
        idempotencyKey: "idem-1",
        kind: "bounded_operation",
        request: { value: 1 },
        authorityEpoch: 1,
      },
    }), active);
    expect(effect).toMatchObject({ kind: "effect_proposal", effectProposal: { effectId: "effect-1" } });
  });

  it("fails closed for malformed JSON, missing draft identity, and published fields", () => {
    expect(parseThoughtStepOutput("not json", active)).toMatchObject({
      kind: "failure",
      reason: "malformed",
      diagnosticCode: "invalid_json",
    });
    expect(parseThoughtStepOutput(JSON.stringify({ answer: "not a draft" }), active)).toMatchObject({
      kind: "failure",
      reason: "malformed",
      diagnosticCode: "missing_settlement_fields",
    });
    expect(parseThoughtStepOutput(JSON.stringify({ ...makeThoughtDraft(), finalLicensedText: "bad" }), active)).toMatchObject({
      kind: "failure",
      reason: "malformed",
      diagnosticCode: "forbidden_fields",
    });
  });

  it("distinguishes omitted Thought identity from an identity mismatch", () => {
    const { cycleId: _cycleId, ...withoutCycleId } = makeThoughtDraft();
    expect(parseThoughtStepOutput(JSON.stringify(withoutCycleId), active)).toMatchObject({
      kind: "failure",
      diagnosticCode: "identity_missing",
    });
    expect(parseThoughtStepOutput(JSON.stringify(makeThoughtDraft({ cycleId: "other-cycle" })), active)).toMatchObject({
      kind: "failure",
      diagnosticCode: "identity_mismatch",
    });
  });

  it("reports contract-specific categories while keeping validation strict", () => {
    const speechFailure = makeThoughtDraft({
      speech: {
        mode: "draft",
        mustSay: [],
        mustNot: [],
        surfaceDraft: null,
        acceptableRealizations: [],
        presentationDirectives: [],
      },
    });
    expect(parseThoughtStepOutput(JSON.stringify(speechFailure), active)).toMatchObject({
      kind: "failure",
      diagnosticCode: "speech_contract_failure",
    });
    expect(parseThoughtStepOutput(JSON.stringify(makeThoughtDraft({ schemaVersion: 99 as 1 })), active)).toMatchObject({
      kind: "failure",
      diagnosticCode: "schema_version_mismatch",
    });
  });

  it("discards an unrecognized workspace field at the Thought boundary", () => {
    const output = parseThoughtStepOutput(JSON.stringify({ ...makeThoughtDraft(), workspace: { notes: "ephemeral" } }), active);
    expect(output.kind).toBe("settlement");
    if (output.kind === "settlement") {
      expect(output.settlement).not.toHaveProperty("workspace");
    }
  });
});
