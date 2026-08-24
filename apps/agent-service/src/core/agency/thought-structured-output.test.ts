import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { decide } from "./decide.js";
import {
  MIN_THOUGHT_RETRY_REMAINING_MS,
  THOUGHT_MAX_OUTPUT_TOKENS,
  runBoundedCognition,
  runThoughtModel,
} from "./thought.js";
import * as projectRegistry from "../sandbox/project-registry.js";
import type { Motivation } from "../types.js";

const originalMode = env.cognitionMode;
const originalGroqKey = env.groqApiKey;

afterEach(() => {
  env.cognitionMode = originalMode;
  env.groqApiKey = originalGroqKey;
  vi.restoreAllMocks();
});

function stubVerificationOffer(): void {
  vi.spyOn(projectRegistry, "canOfferCandidateVerification").mockReturnValue(true);
  vi.spyOn(projectRegistry, "listApprovedReadProjectIds").mockReturnValue([
    "project-ashley",
  ]);
}

const motivation: Motivation = {
  id: 1,
  kind: "user_message",
  score: 100,
  summary: "Verify the current candidate workspace for Project Ashley.",
  refType: "message",
  refId: 1,
};

/** Production 1122 visible payload was 632 bytes — incomplete object, not a 1000-token JSON blob. */
const INCIDENT_1122_TRUNCATED_JSON =
  '{"kind":"speak","delayClass":null,"shouldSpeak":true,"effort":"medium","completion":"complete","uncertainty":0.2,"urgency":0.7,"objective":"Verify the current candidate workspace","reason":"Owner asked for mechanical verification only","motivationIds":[1],"evidenceDisposition":"sufficient","operationalRequest":{"kind":"candidate_verification","request":{"operation":"workspace.verify","projectId":"project-ashley"';

const COMPACT_M4_DECISION = JSON.stringify({
  kind: "speak",
  delayClass: null,
  shouldSpeak: true,
  effort: "low",
  completion: "complete",
  uncertainty: 0.1,
  urgency: 0.6,
  objective: "Verify current candidate",
  reason: "Owner asked for mechanical verification",
  motivationIds: [1],
  evidenceDisposition: "sufficient",
  operationalRequest: {
    kind: "candidate_verification",
    request: {
      operation: "workspace.verify",
      projectId: "project-ashley",
    },
  },
});

describe("Thought structured output (1122)", () => {
  it("does not treat 632-byte incomplete JSON as a fabricated operationalRequest", () => {
    expect(Buffer.byteLength(INCIDENT_1122_TRUNCATED_JSON, "utf8")).toBeLessThan(700);
    expect(Buffer.byteLength(INCIDENT_1122_TRUNCATED_JSON, "utf8")).toBeGreaterThan(400);
    expect(() => JSON.parse(INCIDENT_1122_TRUNCATED_JSON)).toThrow();
  });

  it("classifies ceiling + truncated JSON as truncation using request maxTokens, not response.maxTokens", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = new DatabaseSync(":memory:");
    let calls = 0;
    const result = await runThoughtModel(
      db,
      decide([motivation], "reactive"),
      [motivation],
      "reactive",
      async (_messages, options) => {
        calls += 1;
        expect(options?.maxTokens).toBe(THOUGHT_MAX_OUTPUT_TOKENS);
        expect(options?.reasoningEffort).toBe("none");
        expect(options?.responseFormat).toBe("json_object");
        return {
          text: INCIDENT_1122_TRUNCATED_JSON,
          usage: { promptTokens: 2293, completionTokens: 1000 },
        };
      },
      { thoughtDeadlineAtMs: Date.now() + 3_000 },
    );
    db.close();
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected truncation failure");
    expect(result.error).toBe("truncation");
    expect(result.envelope?.attempts).toHaveLength(1);
    expect(result.envelope?.attempts[0]).toMatchObject({
      truncated: true,
      parseOk: false,
      maxTokens: THOUGHT_MAX_OUTPUT_TOKENS,
      outputTokens: 1000,
      errorCode: "truncation",
    });
    expect(JSON.stringify(result.envelope)).not.toContain("operationalRequest");
  });

  it("still retries cheap invalid JSON when remaining deadline can legally dispatch", async () => {
    stubVerificationOffer();
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = new DatabaseSync(":memory:");
    let calls = 0;
    const result = await runThoughtModel(
      db,
      decide([motivation], "reactive"),
      [motivation],
      "reactive",
      async () => {
        calls += 1;
        if (calls === 1) {
          return {
            text: "not json {{",
            usage: { promptTokens: 200, completionTokens: 40 },
          };
        }
        return {
          text: COMPACT_M4_DECISION,
          usage: { promptTokens: 210, completionTokens: 80 },
        };
      },
      { thoughtDeadlineAtMs: Date.now() + MIN_THOUGHT_RETRY_REMAINING_MS + 8_000 },
    );
    db.close();
    expect(calls).toBe(2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected compact retry success");
    expect(result.proposal.operationalRequest).toEqual({
      kind: "candidate_verification",
      request: {
        operation: "workspace.verify",
        projectId: "project-ashley",
      },
    });
  });

  it("accepts a compact candidate_verification decision under the structured-output contract", async () => {
    stubVerificationOffer();
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = new DatabaseSync(":memory:");
    const result = await runThoughtModel(
      db,
      decide([motivation], "reactive"),
      [motivation],
      "reactive",
      async () => ({
        text: COMPACT_M4_DECISION,
        usage: { promptTokens: 400, completionTokens: 90 },
      }),
    );
    db.close();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected compact verification decision");
    expect(result.proposal.kind).toBe("speak");
    expect(result.proposal.operationalRequest?.kind).toBe("candidate_verification");
    expect(Buffer.byteLength(COMPACT_M4_DECISION, "utf8")).toBeLessThan(600);
  });

  it("does not retry after remaining deadline falls below the legal dispatch floor", async () => {
    let calls = 0;
    const outcome = await runBoundedCognition({
      phase: "initial",
      deadlineAtMs: Date.now() + 200,
      complete: async () => {
        calls += 1;
        return { text: "not json {{", usage: { promptTokens: 10, completionTokens: 8 } };
      },
      buildMessages: () => [{ role: "user", content: "x" }],
      buildOptions: (deadlineAtMs) => ({
        maxTokens: THOUGHT_MAX_OUTPUT_TOKENS,
        deadlineAtMs,
        attentionDb: new DatabaseSync(":memory:"),
      }),
      parse: () => null,
      validate: () => ({ ok: true, result: { ok: true } }),
      retryableCodes: new Set(["invalid_json", "truncation"]),
      retryFeedback: () => "retry",
    });
    expect(calls).toBe(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("invalid_json");
  });
});
