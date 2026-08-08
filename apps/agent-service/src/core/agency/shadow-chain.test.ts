import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { insertMessage, resolveActiveThread } from "../memory/threads.js";
import { retrieveEpisodes } from "../memory/episodes.js";
import { getAffectiveState } from "../state/affect.js";
import { listActiveMindStateItems } from "../state/mind-items.js";
import { listActiveFacts } from "../memory/facts.js";
import { listRevisions } from "../learning/revisions.js";
import { recordCriticalFailure, recordIsolatedEvaluation, recordLiveShadowEvent, currentReleaseId } from "../rollout/capabilities.js";
import { enqueueCognitiveJob } from "../cognition/jobs.js";
import { processNextCognitiveJob, type CognitionAnalysis, getLatestShadowAnalysis } from "../cognition/worker.js";
import { enqueueThoughtObservation, type ShadowCognitionContext } from "../agency/thought-observation.js";
import { mindStateItemToMotivation, type MindStateMotivationInput } from "../agency/motivations.js";
import { type Complete } from "../agency/thought.js";
import type { Decision, Motivation, Trigger, MindStateItemKind } from "../types.js";

const releaseId = currentReleaseId();
const start = new Date("2026-07-01T00:00:00.000Z");

function qualify(db: DatabaseSync, capability: Parameters<typeof recordIsolatedEvaluation>[1]): void {
  recordIsolatedEvaluation(db, capability, {
    seeds: 3, passed: true, sourceKey: `${capability}:eval`,
    releaseId, occurredAt: start.toISOString(),
  });
  for (let i = 0; i < 25; i++) {
    const at = new Date(start.getTime() + i * (7 * 86_400_000 / 24));
    recordLiveShadowEvent(db, capability, `${capability}:${i}`, {
      releaseId, occurredAt: at.toISOString(),
    });
  }
}

function shadowCounts(db: DatabaseSync, capability: string): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM capability_events
     WHERE capability = ? AND kind = 'live_shadow' AND release_id = ?
     AND source_key LIKE 'episode:%'`,
  ).get(capability, releaseId) as { c?: number };
  return Number(row.c ?? 0);
}

function thoughtShadowCounts(db: DatabaseSync): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM capability_events
     WHERE capability = 'thought' AND kind = 'live_shadow' AND release_id = ?
     AND source_key LIKE 'thought-observe:%'`,
  ).get(releaseId) as { c?: number };
  return Number(row.c ?? 0);
}

function baseDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 40,
    reason: "base-reason",
    evidenceRefs: [],
    uncertainty: 0.2,
    urgency: 0.1,
    thoughtSource: "deterministic",
    thoughtError: null,
    cognitiveAllocation: { effort: "medium", completion: "complete", shouldSpeak: true },
    authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
    affectLicense: { permitted: false, valence: 0, activation: 0, openness: 0, tension: 0, reason: "none" },
    ...overrides,
  };
}

const shadowAnalysis: CognitionAnalysis = {
  summary: "ShadowChain sentinel recall summary",
  entities: ["sentinel"],
  salience: 0.9,
  unresolved: true,
  stateItems: [{
    kind: "commitment",
    text: "SENTINEL_MIND_STATE_COMMITMENT",
    activation: 0.9,
    urgency: 0.9,
  }],
  affect: {
    valenceDelta: 0.15,
    activationDelta: 0.2,
    opennessDelta: 0.1,
    tensionDelta: 0.05,
    reason: "SENTINEL_AFFECT_REASON",
  },
  revisions: [{
    layer: "dynamic_identity",
    key: "interest.shadow_chain",
    value: "curious about shadow chains",
    rationale: "Ashley engaged with shadow chains.",
  }],
  facts: [],
};

const thoughtResponseJson = {
  kind: "speak",
  shouldSpeak: true,
  effort: "medium",
  completion: "complete",
  uncertainty: 0.2,
  urgency: 0.1,
  objective: "reply",
  reason: "ok",
  motivationIds: [1],
};

type ThoughtInputMessage = { role: string; content: string };
type ThoughtInput = ThoughtInputMessage[];

function makeFakeComplete(spy: { calls: number; inputs: ThoughtInput[] }): Complete {
  return async (messages, _options) => {
    spy.calls++;
    spy.inputs.push(messages as ThoughtInput);
    return {
      text: JSON.stringify(thoughtResponseJson),
      model: "test",
      modelAlias: "test",
      resolvedModelId: "test-model",
    };
  };
}

function setupWithMessages() {
  const db = openNuclearDb(new DatabaseSync(":memory:"));
  const threadId = resolveActiveThread(db, "doc");
  const m1 = insertMessage(db, { threadId, ownerId: "doc", role: "user", text: "SENTINEL_USER_MESSAGE" });
  const m2 = insertMessage(db, { threadId, ownerId: "doc", role: "assistant", text: "Tell me more." });
  enqueueCognitiveJob(db, {
    ownerId: "doc",
    kind: "consolidate_thread",
    sourceKey: `cf-setup:${m2}`,
    payload: { threadId, throughMessageId: m2 },
  });
  return { db, threadId, m1, m2 };
}

function identicalLiveState(dbA: DatabaseSync, dbB: DatabaseSync): boolean {
  const queries = [
    "SELECT * FROM mind_state_items ORDER BY id",
    "SELECT * FROM affective_state ORDER BY owner_id",
    "SELECT target_layer, target_key, proposed_value, status, provenance FROM learning_revisions ORDER BY id",
    "SELECT * FROM mem_facts ORDER BY id",
  ];
  for (const query of queries) {
    const a = dbA.prepare(query).all();
    const b = dbB.prepare(query).all();
    if (JSON.stringify(a) !== JSON.stringify(b)) return false;
  }
  return true;
}

describe("full shadow chain: Recall → Mind State → Thought", () => {
  it("executes the full chain with shadow provenance and no live side-effects", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      const threadId = resolveActiveThread(db, "doc");
      const m1 = insertMessage(db, { threadId, ownerId: "doc", role: "user", text: "SENTINEL_USER_MESSAGE" });
      const m2 = insertMessage(db, { threadId, ownerId: "doc", role: "assistant", text: "Tell me more." });
      enqueueCognitiveJob(db, {
        ownerId: "doc",
        kind: "consolidate_thread",
        sourceKey: "shadow-chain-test",
        payload: { threadId, throughMessageId: m2 },
      });

      qualify(db, "recall");
      qualify(db, "mind_state");
      qualify(db, "thought");

      const analyze = async () => ({ analysis: shadowAnalysis, model: "test", raw: "{}" });
      expect(await processNextCognitiveJob(db, "observe", analyze)).toBe(true);

      const episodes = retrieveEpisodes(db, "doc", "sentinel");
      expect(episodes).toHaveLength(1);
      const shadowEpisode = episodes[0];
      expect(shadowEpisode.provenance).toBe("shadow");
      expect(shadowEpisode.summary).toBe("ShadowChain sentinel recall summary");

      expect(shadowCounts(db, "recall")).toBe(1);
      expect(shadowCounts(db, "mind_state")).toBe(1);
      expect(shadowCounts(db, "learning")).toBe(1);

      expect(listActiveMindStateItems(db, "doc")).toHaveLength(0);
      expect(listActiveFacts(db, "doc")).toHaveLength(0);
      expect(getAffectiveState(db, "doc").reason).toBe("neutral baseline");
      expect(listRevisions(db, "doc").filter((r) => r.provenance === "live")).toHaveLength(0);

      const recallSummary = shadowEpisode.summary;
      const shadowContext: ShadowCognitionContext = {
        recall: {
          episodeId: shadowEpisode.id,
          summary: recallSummary,
          entities: shadowAnalysis.entities,
          salience: shadowEpisode.salience,
        },
        mindState: {
          hasStateItems: true,
          hasAffect: true,
          stateItemCount: shadowAnalysis.stateItems.length,
          affectReason: shadowAnalysis.affect.reason,
        },
      };

      expect(shadowContext.recall!.summary).toBe("ShadowChain sentinel recall summary");
      expect(shadowContext.mindState!.affectReason).toBe("SENTINEL_AFFECT_REASON");
      expect(shadowContext.mindState!.stateItemCount).toBe(1);

      // Derive ephemeral Mind State motivation candidates using the production-equivalent mapping
      const mindStateCandidates = shadowAnalysis.stateItems.map((item, idx) =>
        mindStateItemToMotivation({
          kind: item.kind,
          text: item.text,
          activation: item.activation,
          urgency: item.urgency,
          id: idx + 100, // ephemeral IDs for shadow
        } as MindStateMotivationInput),
      );

      const thoughtSpy = { calls: 0, inputs: [] as ThoughtInput[] };
      enqueueThoughtObservation({
        db,
        decision: baseDecision({ reason: recallSummary }),
        motivations: [
          {
            id: 1,
            kind: "user_message",
            score: 40,
            summary: "SENTINEL_MOTIVATION",
            refType: "message",
            refId: m1,
          } as Motivation,
          ...mindStateCandidates.map((c, idx) => ({
            id: c.refId,
            kind: c.kind,
            score: c.score,
            summary: c.summary,
            refType: c.refType,
            refId: c.refId,
          } as Motivation)),
        ],
        trigger: "reactive" as Trigger,
        decisionId: 1,
        shadowContext,
        complete: makeFakeComplete(thoughtSpy),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(thoughtSpy.calls).toBe(1);

      const userMessage = thoughtSpy.inputs[0][1];
      const parsedInput = JSON.parse(userMessage.content);
      expect(parsedInput.base.reason).toBe("ShadowChain sentinel recall summary");

      // R_SENTINEL in base.reason (Recall path)
      // M_SENTINEL in candidates (Mind State path through motivations)
      expect(parsedInput.candidates).toHaveLength(2);
      const msCandidate = parsedInput.candidates.find((c: { summary: string }) =>
        c.summary.includes("SENTINEL_MIND_STATE_COMMITMENT"),
      );
      expect(msCandidate).toBeDefined();
      expect(msCandidate!.kind).toBe("unfinished"); // commitment -> unfinished mapping
      expect(msCandidate!.refType).toBe("mind_state");
      expect(msCandidate!.refId).toBe(100);

      expect(thoughtShadowCounts(db)).toBe(1);

      db.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });

  it("skips Thought shadow when shadow context lacks recall result", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      qualify(db, "thought");

      const thoughtSpy = { calls: 0, inputs: [] as ThoughtInput[] };
      enqueueThoughtObservation({
        db,
        decision: baseDecision(),
        motivations: [{
          id: 1,
          kind: "user_message",
          score: 40,
          summary: "hi",
        } as Motivation],
        trigger: "reactive" as Trigger,
        decisionId: 2,
        shadowContext: {
          mindState: { hasStateItems: true, hasAffect: true, stateItemCount: 1, affectReason: "x" },
        },
        complete: makeFakeComplete(thoughtSpy),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(thoughtSpy.calls).toBe(0);
      expect(thoughtShadowCounts(db)).toBe(0);
      db.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });

  it("skips Thought shadow when shadow context lacks mindState result", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      qualify(db, "thought");

      const thoughtSpy = { calls: 0, inputs: [] as ThoughtInput[] };
      enqueueThoughtObservation({
        db,
        decision: baseDecision(),
        motivations: [{
          id: 1,
          kind: "user_message",
          score: 40,
          summary: "hi",
        } as Motivation],
        trigger: "reactive" as Trigger,
        decisionId: 3,
        shadowContext: {
          recall: { episodeId: 1, summary: "x", entities: ["x"], salience: 0.5 },
        },
        complete: makeFakeComplete(thoughtSpy),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(thoughtSpy.calls).toBe(0);
      expect(thoughtShadowCounts(db)).toBe(0);
      db.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });

  it("prevents duplicate Thought model calls with same decision id", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      qualify(db, "thought");

      const thoughtSpy = { calls: 0, inputs: [] as ThoughtInput[] };
      const commonOpts = {
        db,
        decision: baseDecision(),
        motivations: [{
          id: 1,
          kind: "user_message",
          score: 40,
          summary: "hi",
        } as Motivation],
        trigger: "reactive" as Trigger,
        decisionId: 42,
        shadowContext: {
          recall: { episodeId: 1, summary: "x", entities: ["x"], salience: 0.5 },
          mindState: { hasStateItems: true, hasAffect: true, stateItemCount: 1, affectReason: "x" },
        } as ShadowCognitionContext,
        complete: makeFakeComplete(thoughtSpy),
      };
      enqueueThoughtObservation(commonOpts);
      enqueueThoughtObservation(commonOpts);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(thoughtSpy.calls).toBe(1);
      expect(thoughtShadowCounts(db)).toBe(1);
      db.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });
});

describe("counterfactual: shadow chain non-interference", () => {
  it("disabled recall blocks Thought shadow execution", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      qualify(db, "thought");
      recordCriticalFailure(db, "recall", "cf-shadow", "deletion_integrity", "forget breach", {
        releaseId,
      });

      const thoughtSpy = { calls: 0, inputs: [] as ThoughtInput[] };
      enqueueThoughtObservation({
        db,
        decision: baseDecision(),
        motivations: [{
          id: 1,
          kind: "user_message",
          score: 40,
          summary: "hi",
        } as Motivation],
        trigger: "reactive" as Trigger,
        decisionId: 5,
        shadowContext: {
          recall: { episodeId: 1, summary: "x", entities: ["x"], salience: 0.5 },
          mindState: { hasStateItems: true, hasAffect: true, stateItemCount: 1, affectReason: "x" },
        },
        complete: makeFakeComplete(thoughtSpy),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(thoughtSpy.calls).toBe(0);
      expect(thoughtShadowCounts(db)).toBe(0);
      db.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });

  it("produces identical live state with and without shadow capability readiness", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const { db: dbA } = setupWithMessages();
      const { db: dbB } = setupWithMessages();
      qualify(dbA, "recall");
      qualify(dbA, "mind_state");
      qualify(dbA, "thought");

      const analyze = async () => ({ analysis: shadowAnalysis, model: "test", raw: "{}" });

      await processNextCognitiveJob(dbA, "apply", analyze, () => false);
      await processNextCognitiveJob(dbB, "apply", analyze, () => false);

      expect(identicalLiveState(dbA, dbB)).toBe(true);
      dbA.close();
      dbB.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });
});

describe("stale-run correlation: getLatestShadowAnalysis binds to correct turn", () => {
  it("selects correct shadow analysis by thread and message boundary, not owner-wide latest", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      qualify(db, "recall");
      qualify(db, "mind_state");
      qualify(db, "learning");

      // Thread A: first exchange
      const threadA = resolveActiveThread(db, "doc");
      const aUser1 = insertMessage(db, { threadId: threadA, ownerId: "doc", role: "user", text: "Turn A user message" });
      const aAsst1 = insertMessage(db, { threadId: threadA, ownerId: "doc", role: "assistant", text: "Turn A assistant response" });
      enqueueCognitiveJob(db, {
        ownerId: "doc",
        kind: "consolidate_thread",
        sourceKey: `stale-test-A:${aAsst1}`,
        payload: { threadId: threadA, throughMessageId: aAsst1 },
      });
      const analyzeA = async () => ({
        analysis: {
          ...shadowAnalysis,
          summary: "RECALL_A_SUMMARY",
          stateItems: [{ kind: "commitment" as MindStateItemKind, text: "MINDSTATE_A_COMMITMENT", activation: 0.9, urgency: 0.8 }],
        },
        model: "test",
        raw: "{}",
      });
      await processNextCognitiveJob(db, "observe", analyzeA);

      // Thread B: second exchange (newer in time, different thread)
      const threadB = resolveActiveThread(db, "doc"); // This will archive threadA and create new one
      const bUser1 = insertMessage(db, { threadId: threadB, ownerId: "doc", role: "user", text: "Turn B user message" });
      const bAsst1 = insertMessage(db, { threadId: threadB, ownerId: "doc", role: "assistant", text: "Turn B assistant response" });
      enqueueCognitiveJob(db, {
        ownerId: "doc",
        kind: "consolidate_thread",
        sourceKey: `stale-test-B:${bAsst1}`,
        payload: { threadId: threadB, throughMessageId: bAsst1 },
      });
      const analyzeB = async () => ({
        analysis: {
          ...shadowAnalysis,
          summary: "RECALL_B_SUMMARY",
          stateItems: [{ kind: "concern" as MindStateItemKind, text: "MINDSTATE_B_CONCERN", activation: 0.7, urgency: 0.9 }],
        },
        model: "test",
        raw: "{}",
      });
      await processNextCognitiveJob(db, "observe", analyzeB);

      // Now query for Thread A's shadow analysis using correlation:
      // We want the analysis for the exchange ending BEFORE aUser1 (which doesn't exist, so use aAsst1 as boundary)
      // Actually, the correlation uses beforeMessageId = current user message ID.
      // For Thread A's next turn, the current user message would be a new message after aAsst1.
      // So we query with beforeMessageId = aAsst1 + 1 (or just a value > aAsst1 but < bUser1)
      // But since we're testing the correlation logic directly, let's use aAsst1 as the boundary.
      // The episode for A ends at aAsst1. The episode for B ends at bAsst1.
      // If we query with beforeMessageId = aAsst1 + 100 (simulating a new user message after A),
      // it should return A's analysis.

      // However, threadA was archived when threadB was created. Let's check if threadA still exists.
      // resolveActiveThread archives the old thread. So threadA is no longer active.
      // The episodes for threadA still exist with thread_id = threadA.
      // The query uses e.thread_id = ? AND e.source_end_message_id < ?
      // So we need to query with threadA and beforeMessageId > aAsst1.

      const analysisForA = getLatestShadowAnalysis(db, "doc", threadA, aAsst1 + 1);
      expect(analysisForA).not.toBeNull();
      expect(analysisForA!.summary).toBe("RECALL_A_SUMMARY");
      expect(analysisForA!.stateItems[0].text).toBe("MINDSTATE_A_COMMITMENT");
      expect(analysisForA!.stateItems[0].text).not.toBe("MINDSTATE_B_CONCERN");

      // Query with threadB and beforeMessageId > bAsst1 should return B
      const analysisForB = getLatestShadowAnalysis(db, "doc", threadB, bAsst1 + 1);
      expect(analysisForB).not.toBeNull();
      expect(analysisForB!.summary).toBe("RECALL_B_SUMMARY");
      expect(analysisForB!.stateItems[0].text).toBe("MINDSTATE_B_CONCERN");

      // Query with threadA but beforeMessageId <= aAsst1 should return null (no prior exchange)
      const analysisBeforeA = getLatestShadowAnalysis(db, "doc", threadA, aAsst1);
      expect(analysisBeforeA).toBeNull();

      // Owner-wide latest (no thread filter) would return B, but our correlated query returns A for threadA
      // This proves the correlation works.

      db.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });

  it("excludes non-consolidate_thread runs from reactive Thought correlation", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      qualify(db, "recall");
      qualify(db, "mind_state");
      qualify(db, "learning");

      const threadId = resolveActiveThread(db, "doc");
      const user1 = insertMessage(db, { threadId, ownerId: "doc", role: "user", text: "User message" });
      const asst1 = insertMessage(db, { threadId, ownerId: "doc", role: "assistant", text: "Assistant response" });
      enqueueCognitiveJob(db, {
        ownerId: "doc",
        kind: "consolidate_thread",
        sourceKey: `curiosity-exclude:${asst1}`,
        payload: { threadId, throughMessageId: asst1 },
      });
      const analyze = async () => ({ analysis: shadowAnalysis, model: "test", raw: "{}" });
      await processNextCognitiveJob(db, "observe", analyze);

      // Directly insert a cognitive_run with wrong kind (simulating curiosity consolidation)
      const now = new Date().toISOString();
      const jobResult = db.prepare(
        `INSERT INTO cognitive_jobs (owner_id, kind, source_key, payload_json, status, attempts, available_at, created_at, updated_at)
         VALUES (?, 'consolidate_curiosity', ?, '{}', 'completed', 0, ?, ?, ?)`
      ).run("doc", `fake-curiosity-job`, now, now, now);
      const fakeJobId = Number(jobResult.lastInsertRowid);
      db.prepare(
        `INSERT INTO cognitive_runs (job_id, owner_id, kind, model, input_json, output_json, status, created_at)
         VALUES (?, ?, 'consolidate_curiosity', 'test', '{}', '{}', 'completed', ?)`
      ).run(fakeJobId, "doc", now);

      // Correlated query should still find the thread analysis, not the curiosity run
      const analysis = getLatestShadowAnalysis(db, "doc", threadId, asst1 + 1);
      expect(analysis).not.toBeNull();
      expect(analysis!.summary).toBe("ShadowChain sentinel recall summary"); // from shadowAnalysis constant
      // The curiosity run has kind='consolidate_curiosity' and should be excluded by cr.kind = 'consolidate_thread'

      db.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });

  it("returns null when no shadow analysis exists for the correlated turn (fail closed)", async () => {
    const originalKey = env.groqApiKey;
    env.groqApiKey = "test";
    try {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      qualify(db, "recall");
      qualify(db, "mind_state");

      const threadId = resolveActiveThread(db, "doc");
      // No cognition jobs processed yet

      // Query should return null (no matching shadow run)
      const analysis = getLatestShadowAnalysis(db, "doc", threadId, 100);
      expect(analysis).toBeNull();

      db.close();
    } finally {
      env.groqApiKey = originalKey;
    }
  });
});
