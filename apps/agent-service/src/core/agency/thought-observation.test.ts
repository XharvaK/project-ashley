import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { deliberateDecision } from "./thought.js";
import { enqueueThoughtObservation } from "./thought-observation.js";
import type { Decision, Motivation } from "../types.js";
import * as mistral from "../../mistral-client.js";
import {
  listCapabilityStatuses,
  recordLiveShadowEvent,
} from "../rollout/capabilities.js";

const originalKey = env.mistralApiKey;
const originalGroqKey = env.groqApiKey;

afterEach(() => {
  env.mistralApiKey = originalKey;
  env.groqApiKey = originalGroqKey;
  vi.restoreAllMocks();
});

function baseDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 40,
    reason: "test",
    evidenceRefs: [],
    uncertainty: 0.2,
    urgency: 0.1,
    thoughtSource: "deterministic",
    thoughtError: null,
    cognitiveAllocation: {
      effort: "medium",
      completion: "complete",
      shouldSpeak: true,
    },
    authorizedClaims: {
      readingRecordIds: [],
      readingTitles: [],
      readingClaims: [],
    },
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0,
      openness: 0,
      tension: 0,
      reason: "none",
    },
    ...overrides,
  };
}

describe("Thought sub-deadline and observation", () => {
  it("skips model Thought when sub-deadline has already passed", async () => {
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const complete = vi.fn();
    const decision = await deliberateDecision(
      db,
      baseDecision(),
      [{ id: 1, kind: "user_message", score: 40, summary: "hi" }],
      "reactive",
      complete as unknown as typeof mistral.completeChat,
      () => true,
      () => true,
      {
        allowModelThought: true,
        thoughtDeadlineAtMs: Date.now() - 1,
      },
    );
    expect(complete).not.toHaveBeenCalled();
    expect(decision.kind).toBe("speak");
    expect(decision.thoughtSource).toBe("deterministic");
    db.close();
  });

  it("does not record live-shadow when observation fails", async () => {
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    vi.spyOn(mistral, "completeChat").mockRejectedValue(new Error("boom"));
    enqueueThoughtObservation({
      db,
      decision: baseDecision(),
      motivations: [
        { id: 1, kind: "user_message", score: 40, summary: "hi" } as Motivation,
      ],
      trigger: "reactive",
      decisionId: 42,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      listCapabilityStatuses(db, "observe").find((s) => s.capability === "thought")
        ?.liveShadowEvents,
    ).toBe(0);
    db.close();
  });

  it("records live-shadow only after successful observation parse", async () => {
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    vi.spyOn(mistral, "completeChat").mockResolvedValue({
      text: JSON.stringify({
        kind: "speak",
        shouldSpeak: true,
        effort: "medium",
        completion: "answer",
        uncertainty: 0.2,
        urgency: 0.1,
        objective: "reply",
        reason: "ok",
        motivationIds: [1],
      }),
      model: env.mistralModel,
      modelAlias: env.mistralModel,
      resolvedModelId: "mistral-medium-2505",
    });
    enqueueThoughtObservation({
      db,
      decision: baseDecision(),
      motivations: [
        { id: 1, kind: "user_message", score: 40, summary: "hi" } as Motivation,
      ],
      trigger: "reactive",
      decisionId: 99,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Idempotent second enqueue with same decision id
    enqueueThoughtObservation({
      db,
      decision: baseDecision(),
      motivations: [
        { id: 1, kind: "user_message", score: 40, summary: "hi" } as Motivation,
      ],
      trigger: "reactive",
      decisionId: 99,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      listCapabilityStatuses(db, "observe").find((s) => s.capability === "thought")
        ?.liveShadowEvents,
    ).toBe(1);
    db.close();
  });

  it("never increments qualification from fabricated recordLiveShadow alone when epoch mismatches", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    recordLiveShadowEvent(db, "thought", "fabricated", {
      detail: { fabricated: true },
    });
    expect(
      listCapabilityStatuses(db, "apply").find((s) => s.capability === "thought"),
    ).toMatchObject({ state: "observe", evalSeedCount: 0 });
    db.close();
  });
});
