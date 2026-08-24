import { describe, expect, it } from "vitest";
import type { Decision } from "../types.js";
import {
  classifyDurableThoughtError,
  mapDecisionToNormalizedDurableThought,
} from "./durable-thought-production.js";

function baseDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 50,
    reason: "test",
    evidenceRefs: [],
    uncertainty: 0.2,
    urgency: 0.2,
    thoughtSource: "model",
    thoughtError: null,
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0.5,
      openness: 0.5,
      tension: 0,
      reason: "test",
    },
    cognitiveAllocation: {
      shouldSpeak: true,
      effort: "medium",
      completion: "complete",
    },
    authorizedClaims: {
      readingRecordIds: [],
      readingTitles: [],
      readingClaims: [],
    },
    ...overrides,
  };
}

describe("production durable Thought driver", () => {
  it("classifies provider failures as transport and validation failures as structural", () => {
    expect(classifyDurableThoughtError("rate_limited")).toBe("transport");
    expect(classifyDurableThoughtError("mistral_unavailable")).toBe("transport");
    expect(classifyDurableThoughtError("invalid_json")).toBe("structural");
    expect(classifyDurableThoughtError("missing_required_field")).toBe("structural");
  });

  it("maps a bounded_operation Decision onto normalized durable Thought", () => {
    const decision = baseDecision({
      kind: "speak",
      evidenceDisposition: "sufficient",
      operationalRequest: {
        kind: "bounded_operation",
        request: {
          operation: "objective.operate",
          projectId: "project-ashley",
          origin: "owner_request",
          objective: "candidate-only smoke",
          successCondition: "sealed",
          failureCondition: "child failed",
          steps: [],
          budget: { maxSteps: 3, deadlineAtMs: 1 },
        },
      },
    });
    const normalized = mapDecisionToNormalizedDurableThought(decision);
    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.operationalKind).toBe("bounded_operation");
    expect(normalized.operationalRequest?.projectId).toBe("project-ashley");
    expect(normalized.shouldSpeak).toBe(true);
    expect(normalized.thoughtError).toBeNull();
  });
});
