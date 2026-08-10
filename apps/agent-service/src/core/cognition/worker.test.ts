import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { applyModelContinuity, currentModelContinuityIdentity } from "../attention/continuity.js";
import { runAttentiveDispatch } from "../attention/governor.js";
import { insertMessage, resolveActiveThread } from "../memory/threads.js";
import { retrieveEpisodes } from "../memory/episodes.js";
import { getAffectiveState } from "../state/affect.js";
import { listActiveMindStateItems } from "../state/mind-items.js";
import { listRevisions } from "../learning/revisions.js";
import { listActiveFacts } from "../memory/facts.js";
import { currentContractId, recordCriticalFailure } from "../rollout/capabilities.js";
import { recordRecallLiveCutover } from "../memory/cutover.js";
import { currentBuildIdentity } from "../rollout/capabilities.js";
import { listOpenCognitiveItems } from "./open-items.js";
import { enqueueCognitiveJob, recoverCognitiveJobs } from "./jobs.js";
import { processNextCognitiveJob, type CognitionAnalysis } from "./worker.js";

const analysis: CognitionAnalysis = {
  summary: "Doc is preparing a modular synth performance; Ashley wants to follow up after it.",
  entities: ["modular synth", "performance"],
  salience: 0.9,
  unresolved: true,
  stateItems: [{
    kind: "commitment",
    text: "Ask how the synth performance went.",
    activation: 0.9,
    urgency: 0.9,
  }],
  affect: {
    valenceDelta: 0.15,
    activationDelta: 0.2,
    opennessDelta: 0.1,
    tensionDelta: 0.05,
    reason: "Anticipation about Doc's performance.",
  },
  revisions: [{
    layer: "dynamic_identity",
    key: "interest.modular_synthesis",
    value: "curious about modular synthesis",
    rationale: "Ashley engaged with the topic.",
  }],
  facts: [{
    category: "ongoing",
    key: "synth_performance",
    value: "Doc's modular synth performance is Friday.",
    confidence: 0.95,
    importance: 80,
    explicit: true,
    sourceMessageId: 1,
    sourceQuote: "My synth performance is Friday.",
  }],
};

const allCapabilitiesActive = () => true;

function setup() {
  const db = openNuclearDb(new DatabaseSync(":memory:"));
  const threadId = resolveActiveThread(db, "doc");
  insertMessage(db, { threadId, ownerId: "doc", role: "user", text: "My synth performance is Friday." });
  const through = insertMessage(db, { threadId, ownerId: "doc", role: "assistant", text: "Tell me how it goes." });
  enqueueCognitiveJob(db, {
    ownerId: "doc",
    kind: "consolidate_thread",
    sourceKey: `test:${through}`,
    payload: { threadId, throughMessageId: through },
  });
  return { db, threadId, userMessageId: 1 };
}

describe("continuous cognition worker", () => {
  it("persists the exact accepted dispatch provenance when continuity changes before materialization", async () => {
    const { db, userMessageId } = setup();
    const originalGroqKey = env.groqApiKey;
    const originalBuild = env.ashleyReleaseId;
    env.groqApiKey = "test-key";
    env.ashleyReleaseId = "accepted-build-a";
    try {
      const job = db
        .prepare("SELECT id FROM cognitive_jobs WHERE owner_id = 'doc' LIMIT 1")
        .get() as { id: number };
      const source = db
        .prepare("SELECT entity_uuid FROM mem_messages WHERE id = ?")
        .get(userMessageId) as { entity_uuid: string };
      const analysisWithOpenItem: CognitionAnalysis = {
        ...analysis,
        openItems: [{
          kind: "question",
          semanticSummary: "Whether the performance follow-up remains unresolved.",
          sourceMessageId: userMessageId,
        }],
      };
      const analyze = async () => {
        const dispatch = await runAttentiveDispatch<{ text: string }>(db, {
          messages: [{ role: "user", content: "bounded cognition dispatch" }],
          purpose: "maintenance",
          lane: "curiosity_maintenance",
          modelAlias: env.mistralModel,
          providerId: "groq",
          quotaBucket: "groq:test-model",
          ownerId: "doc",
          cognitiveJobId: job.id,
          dispatch: async () => ({
            providerModel: "test-model-a",
            usage: { promptTokens: 2, completionTokens: 2 },
            result: { text: "accepted" },
          }),
        });
        applyModelContinuity(
          db,
          {
            alias: env.mistralModel,
            resolvedModelId: "test-model-b",
            unresolvedAlias: false,
            dispatchSequence: dispatch.acceptedDispatchIdentity.dispatchSequence + 1,
          },
          () => undefined,
        );
        env.ashleyReleaseId = "current-build-b";
        return {
          analysis: analysisWithOpenItem,
          model: dispatch.modelAlias,
          modelAlias: dispatch.modelAlias,
          resolvedModelId: dispatch.resolvedModelId,
          dispatchIdentity: dispatch.acceptedDispatchIdentity,
          raw: "{}",
        };
      };

      await processNextCognitiveJob(db, "observe", analyze, allCapabilitiesActive);

      expect(
        db
          .prepare(
            `SELECT provenance, contract_id, build_identity,
                    model_epoch, model_identity
             FROM open_cognitive_items
             WHERE owner_id = 'doc' AND source_entity_uuid = ?`,
          )
          .get(source.entity_uuid),
      ).toMatchObject({
        provenance: "shadow",
        contract_id: currentContractId(),
        build_identity: "accepted-build-a",
        model_epoch: 1,
        model_identity: `model-continuity-v1:${env.mistralModel}|test-model-a`,
      });
    } finally {
      env.groqApiKey = originalGroqKey;
      env.ashleyReleaseId = originalBuild;
      db.close();
    }
  });

  it("applies grounded state only in apply mode", async () => {
    const { db } = setup();
    const analyze = async () => ({ analysis, model: "test", raw: "{}" });
    expect(await processNextCognitiveJob(db, "apply", analyze, allCapabilitiesActive)).toBe(true);
    expect(retrieveEpisodes(db, "doc", "synth")).toHaveLength(1);
    expect(listActiveMindStateItems(db, "doc")[0]).toMatchObject({
      kind: "commitment",
      urgency: 0.9,
    });
    expect(getAffectiveState(db, "doc").reason).toContain("Anticipation");
    expect(listRevisions(db, "doc")).toHaveLength(1);
    expect(listActiveFacts(db, "doc")[0]).toMatchObject({
      key: "synth_performance",
      confidence: 0.95,
    });
    expect(await processNextCognitiveJob(db, "apply", analyze, allCapabilitiesActive)).toBe(false);
    db.close();
  });

  it("records episodes and proposals without changing state in observe mode", async () => {
    const { db } = setup();
    const analyze = async () => ({ analysis, model: "test", raw: "{}" });
    await processNextCognitiveJob(db, "observe", analyze, allCapabilitiesActive);
    expect(retrieveEpisodes(db, "doc", "synth")).toHaveLength(1);
    expect(listActiveMindStateItems(db, "doc")).toHaveLength(0);
    expect(getAffectiveState(db, "doc").reason).toBe("neutral baseline");
    expect(listRevisions(db, "doc")).toHaveLength(1);
    db.close();
  });

  it("materializes structured cognition items from grounded source messages", async () => {
    const { db, userMessageId } = setup();
    const originalGroqKey = env.groqApiKey;
    env.groqApiKey = "test-key";
    const job = db
      .prepare("SELECT id FROM cognitive_jobs WHERE owner_id = 'doc' LIMIT 1")
      .get() as { id: number };
    const source = db
      .prepare("SELECT entity_uuid FROM mem_messages WHERE id = ?")
      .get(userMessageId) as { entity_uuid?: string };
    const analysisWithOpenItem: CognitionAnalysis = {
      ...analysis,
      openItems: [{
        kind: "question",
        semanticSummary: "Whether the performance follow-up remains unresolved.",
        sourceMessageId: userMessageId,
        semanticKeyMaterial: "performance-follow-up",
      }],
    };
    try {
      await processNextCognitiveJob(
        db,
        "observe",
        async () => {
          const dispatch = await runAttentiveDispatch<{ text: string }>(db, {
            messages: [{ role: "user", content: "bounded cognition dispatch" }],
            purpose: "maintenance",
            lane: "curiosity_maintenance",
            modelAlias: env.mistralModel,
            providerId: "groq",
            quotaBucket: "groq:test-model",
            ownerId: "doc",
            cognitiveJobId: job.id,
            dispatch: async () => ({
              providerModel: "test-model-a",
              usage: { promptTokens: 2, completionTokens: 2 },
              result: { text: "accepted" },
            }),
          });
          return {
            analysis: analysisWithOpenItem,
            model: dispatch.modelAlias,
            modelAlias: dispatch.modelAlias,
            resolvedModelId: dispatch.resolvedModelId,
            dispatchIdentity: dispatch.acceptedDispatchIdentity,
            raw: "{}",
          };
        },
      );
      expect(source.entity_uuid).toBeTruthy();
      expect(listOpenCognitiveItems(db, "doc")).toEqual([
        expect.objectContaining({
          kind: "question",
          status: "OPEN",
          sourceType: "message",
          sourceId: String(userMessageId),
          sourceEntityUuid: source.entity_uuid,
          provenance: "shadow",
        }),
      ]);
      expect(
        db
          .prepare(
            "SELECT build_identity, model_epoch, model_identity FROM open_cognitive_items WHERE owner_id = ?",
          )
          .get("doc"),
      ).toEqual({
        build_identity: currentBuildIdentity(),
        model_epoch: 1,
        model_identity: currentModelContinuityIdentity(db, env.mistralModel).identity,
      });
    } finally {
      env.groqApiKey = originalGroqKey;
      db.close();
    }
  });

  it("does not create a live episode from messages cut over while the job was analyzing", async () => {
    const { db } = setup();
    try {
      const analyze = async () => {
        db.exec(
          `INSERT INTO capability_releases
             (capability, release_id, state, updated_at)
           VALUES ('recall', '${currentContractId()}', 'active', 'now')`,
        );
        expect(recordRecallLiveCutover(db, "doc", {
          authorizedBy: "doc",
          masterMode: "observe",
        }).success).toBe(true);
        return { analysis, model: "test", raw: "{}" };
      };

      expect(await processNextCognitiveJob(db, "apply", analyze, allCapabilitiesActive)).toBe(true);
      expect(
        db.prepare("SELECT COUNT(*) AS c FROM episodes WHERE provenance = 'live'").get(),
      ).toEqual({ c: 0 });
    } finally {
      db.close();
    }
  });

  it("recovers a job that was running when the process stopped", () => {
    const { db } = setup();
    db.prepare("UPDATE cognitive_jobs SET status = 'running'").run();
    expect(recoverCognitiveJobs(db)).toBe(1);
    const row = db.prepare("SELECT status FROM cognitive_jobs").get() as { status: string };
    expect(row.status).toBe("pending");
    db.close();
  });

  it("rejects facts without grounded user-message provenance", async () => {
    const { db } = setup();
    const invalid: CognitionAnalysis = {
      ...analysis,
      stateItems: [],
      revisions: [],
      facts: [
        { ...analysis.facts[0]!, sourceMessageId: 999 },
        {
          ...analysis.facts[0]!,
          sourceMessageId: 2,
          sourceQuote: "Tell me how it goes.",
        },
        {
          ...analysis.facts[0]!,
          sourceQuote: "My synth performance was Saturday.",
        },
        {
          category: "person",
          key: "birthday",
          value: "January 1",
          confidence: 1,
          importance: 90,
          explicit: true,
          sourceMessageId: 1,
          sourceQuote: "My synth performance is Friday.",
        },
      ],
    };
    await processNextCognitiveJob(db, "apply", async () => ({
      analysis: invalid,
      model: "test",
      raw: "{}",
    }), allCapabilitiesActive);
    expect(listActiveFacts(db, "doc")).toHaveLength(0);
    db.close();
  });

  it("rolls back partial integration and retries exactly once", async () => {
    const { db } = setup();
    const analyze = async () => ({ analysis, model: "test", raw: "{}" });
    db.exec(`
      CREATE TRIGGER fail_mind_state
      BEFORE INSERT ON mind_state_items
      BEGIN SELECT RAISE(ABORT, 'forced integration failure'); END;
    `);

    await processNextCognitiveJob(db, "apply", analyze, allCapabilitiesActive);
    expect(retrieveEpisodes(db, "doc", "")).toHaveLength(0);
    expect(listActiveFacts(db, "doc")).toHaveLength(0);
    expect(listActiveMindStateItems(db, "doc")).toHaveLength(0);
    expect(db.prepare(
      "SELECT status FROM cognitive_jobs LIMIT 1",
    ).get()).toMatchObject({ status: "pending" });
    expect(db.prepare(
      "SELECT status FROM cognitive_runs LIMIT 1",
    ).get()).toMatchObject({ status: "failed" });

    db.exec("DROP TRIGGER fail_mind_state");
    db.prepare("UPDATE cognitive_jobs SET available_at = ?").run(
      new Date(0).toISOString(),
    );
    await processNextCognitiveJob(db, "apply", analyze, allCapabilitiesActive);
    expect(retrieveEpisodes(db, "doc", "")).toHaveLength(1);
    expect(listActiveFacts(db, "doc")).toHaveLength(1);
    expect(listActiveMindStateItems(db, "doc")).toHaveLength(1);
    expect(db.prepare(
      "SELECT status FROM cognitive_jobs LIMIT 1",
    ).get()).toMatchObject({ status: "completed" });
    expect((db.prepare(
      "SELECT COUNT(*) AS count FROM cognitive_runs WHERE status = 'completed'",
    ).get() as { count: number }).count).toBe(1);
    db.close();
  });

  it("shadow chain records live_shadow events even when observe-only", async () => {
    const { db } = setup();
    const analyze = async () => ({ analysis, model: "test", raw: "{}" });
    expect(await processNextCognitiveJob(db, "observe", analyze)).toBe(true);

    const shadowCounts = (cap: string) => {
      const row = db.prepare(
        `SELECT COUNT(*) AS c FROM capability_events
         WHERE capability = ? AND kind = 'live_shadow'`,
      ).get(cap) as { c?: number };
      return Number(row.c ?? 0);
    };
    expect(shadowCounts("recall")).toBeGreaterThan(0);
    expect(shadowCounts("mind_state")).toBeGreaterThan(0);
    expect(shadowCounts("affect")).toBeGreaterThan(0);
    expect(shadowCounts("learning")).toBeGreaterThan(0);

    const episode = retrieveEpisodes(db, "doc", "")[0];
    expect(episode?.provenance).toBe("shadow");
    expect(listActiveMindStateItems(db, "doc")).toHaveLength(0);
    expect(listActiveFacts(db, "doc")).toHaveLength(0);
    expect(getAffectiveState(db, "doc").reason).toBe("neutral baseline");
    db.close();
  });

  it("disabled root dependency blocks the entire shadow chain", async () => {
    const { db } = setup();
    recordCriticalFailure(db, "recall", "cf-1", "deletion_integrity", "x", {});

    const analyze = async () => ({ analysis, model: "test", raw: "{}" });
    expect(await processNextCognitiveJob(db, "observe", analyze)).toBe(true);

    const shadowCounts = (cap: string) => {
      const row = db.prepare(
        `SELECT COUNT(*) AS c FROM capability_events
         WHERE capability = ? AND kind = 'live_shadow'`,
      ).get(cap) as { c?: number };
      return Number(row.c ?? 0);
    };
    expect(shadowCounts("recall")).toBe(0);
    expect(shadowCounts("mind_state")).toBe(0);
    expect(shadowCounts("affect")).toBe(0);
    expect(shadowCounts("learning")).toBe(0);

    expect(retrieveEpisodes(db, "doc", "")).toHaveLength(0);
    db.close();
  });
});
