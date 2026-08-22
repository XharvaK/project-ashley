import { vi } from "vitest";

const groqDispatch = vi.fn(async () => ({
  text: JSON.stringify({
    kind: "ask",
    delayClass: null,
    shouldSpeak: true,
    effort: "medium",
    completion: "complete",
    uncertainty: 0,
    urgency: 0,
    objective: "ask",
    reason: "ask",
    motivationIds: [1],
    evidenceDisposition: "sufficient",
  }),
  providerModel: "openai/gpt-oss-120b",
  usage: { promptTokens: 10, completionTokens: 20 },
}));

vi.mock("../model-routing/adapters/groq-adapter.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../model-routing/adapters/groq-adapter.js")
  >();
  return {
    ...actual,
    createGroqAdapter: () => ({
      provider: "groq" as const,
      dispatch: groqDispatch,
    }),
  };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { completeChat } from "../../mistral-client.js";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { withOfflineAppGateDisabled } from "../qualification/offline-test-helpers.js";
import { runThoughtModel } from "./thought.js";
import type { Decision, Motivation } from "../types.js";

const motivation: Motivation = {
  id: 1,
  ownerId: "doc",
  kind: "question",
  score: 60,
  summary: "A bounded question",
  refType: "question",
  refId: 1,
};

const base: Decision = {
  trigger: "reactive",
  kind: "ask",
  motivationIds: [1],
  score: 60,
  reason: "base",
  evidenceRefs: [{ type: "question", id: 1 }],
  uncertainty: 0,
  urgency: 0,
  thoughtSource: "deterministic",
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
};

const SAVED = { groq: env.groqApiKey, mistral: env.mistralApiKey };

describe("T1 Thought reaches provider on the caller-owned data plane", () => {
  beforeEach(() => {
    groqDispatch.mockClear();
    env.groqApiKey = "t1-fake-groq";
    env.mistralApiKey = "t1-fake-mistral";
  });
  afterEach(() => {
    env.groqApiKey = SAVED.groq;
    env.mistralApiKey = SAVED.mistral;
  });

  it("runThoughtModel with real completeChat writes attention_requests on the injected DB and reaches Groq", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      await withOfflineAppGateDisabled(() =>
        runThoughtModel(db, base, [motivation], "reactive", completeChat),
      );
      expect(groqDispatch).toHaveBeenCalled();
      const rows = db
        .prepare(`SELECT COUNT(*) AS n FROM attention_requests`)
        .get() as { n: number };
      expect(Number(rows.n)).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
