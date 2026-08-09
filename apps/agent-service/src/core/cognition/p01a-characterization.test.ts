import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env.js";
import { applyModelContinuity } from "../attention/continuity.js";
import { MODEL_SENSITIVE_SET_FOR_CONTRACT } from "../attention/contract-material.js";
import { openNuclearDb } from "../db.js";
import { applyEligibleRevisions } from "../learning/revisions.js";
import { insertMessage } from "../memory/threads.js";
import {
  capabilityCanInfluence,
  currentContractId,
  type CapabilityName,
} from "../rollout/capabilities.js";
import {
  claimNextJob,
  enqueueCognitiveJob,
  recoverCognitiveJobs,
} from "./jobs.js";
import {
  processNextCognitiveJob,
  type CognitionAnalysis,
} from "./worker.js";

const OWNER_ID = "p01-owner";
const THREAD_ID = "p01-thread";
const USER_ENTITY_UUID = "10000000-0000-4000-8000-000000000001";
const ASSISTANT_ENTITY_UUID = "10000000-0000-4000-8000-000000000002";
const CLOCK_START = Date.parse("2026-08-09T01:00:00.000Z");

const fixedAnalysis: CognitionAnalysis = {
  summary: "Doc is preparing a deterministic P-01 proof and Ashley will follow up.",
  entities: ["P-01", "cognition lifecycle"],
  salience: 0.9,
  unresolved: true,
  stateItems: [{
    kind: "commitment",
    text: "Ask how the deterministic P-01 proof went.",
    activation: 0.9,
    urgency: 0.9,
  }],
  affect: {
    valenceDelta: 0.1,
    activationDelta: 0.1,
    opennessDelta: 0.1,
    tensionDelta: 0.05,
    reason: "Focused anticipation about the P-01 proof.",
  },
  revisions: [{
    layer: "dynamic_identity",
    key: "interest.cognition_reliability",
    value: "curious about cognition reliability",
    rationale: "The exchange directly concerns cognition reliability.",
  }],
  facts: [{
    category: "project",
    key: "p01_proof",
    value: "Doc is preparing a deterministic P-01 proof.",
    confidence: 0.95,
    importance: 80,
    explicit: true,
    sourceMessageId: 1,
    sourceQuote: "I am preparing a deterministic P-01 proof.",
  }],
};

const allCapabilitiesActive = () => true;
const openDbs = new Set<DatabaseSync>();
const tempDirectories = new Set<string>();

type Fixture = {
  db: DatabaseSync;
  path: string | null;
  jobId: number;
  userMessageId: number;
  assistantMessageId: number;
  sourceKey: string;
};

function openTracked(path = ":memory:"): DatabaseSync {
  const db = openNuclearDb(new DatabaseSync(path));
  openDbs.add(db);
  return db;
}

function closeTracked(db: DatabaseSync): void {
  if (!openDbs.delete(db)) return;
  db.close();
}

function tempDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "ashley-p01a-"));
  tempDirectories.add(directory);
  return join(directory, "fixture.db");
}

function createFixture(fileBacked = false): Fixture {
  const path = fileBacked ? tempDbPath() : null;
  const db = openTracked(path ?? ":memory:");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_threads
       (id, owner_id, status, channel, created_at, updated_at)
     VALUES (?, ?, 'active', 'discord', ?, ?)`,
  ).run(THREAD_ID, OWNER_ID, now, now);
  const userMessageId = insertMessage(db, {
    threadId: THREAD_ID,
    ownerId: OWNER_ID,
    role: "user",
    text: "I am preparing a deterministic P-01 proof.",
    entityUuid: USER_ENTITY_UUID,
  });
  const assistantMessageId = insertMessage(db, {
    threadId: THREAD_ID,
    ownerId: OWNER_ID,
    role: "assistant",
    text: "I will keep the proof bounded and exact.",
    entityUuid: ASSISTANT_ENTITY_UUID,
  });
  const sourceKey = `p01:${OWNER_ID}:${THREAD_ID}:${assistantMessageId}`;
  const jobId = enqueueCognitiveJob(db, {
    ownerId: OWNER_ID,
    kind: "consolidate_thread",
    sourceKey,
    payload: { threadId: THREAD_ID, throughMessageId: assistantMessageId },
  });
  return {
    db,
    path,
    jobId,
    userMessageId,
    assistantMessageId,
    sourceKey,
  };
}

function fixedAnalyze() {
  return Promise.resolve({ analysis: fixedAnalysis, model: "p01-fixed", raw: "{}" });
}

function rowCount(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return Number(row.count);
}

function snapshot(db: DatabaseSync) {
  const job = db.prepare(
    `SELECT id, owner_id, kind, source_key, status, attempts, available_at,
            last_error
     FROM cognitive_jobs ORDER BY id LIMIT 1`,
  ).get();
  const runs = db.prepare(
    `SELECT id, job_id, owner_id, kind, model, status, error, episode_id
     FROM cognitive_runs ORDER BY id`,
  ).all();
  const episodes = db.prepare(
    `SELECT id, owner_id, thread_id, source_start_message_id,
            source_end_message_id, entity_uuid, provenance
     FROM episodes ORDER BY id`,
  ).all();
  return {
    job,
    runs,
    episodes,
    semanticCounts: {
      episodeMessages: rowCount(db, "episode_messages"),
      facts: rowCount(db, "mem_facts"),
      mindState: rowCount(db, "mind_state_items"),
      affectEvents: rowCount(db, "affective_events"),
      revisions: rowCount(db, "learning_revisions"),
      evidenceLinks: rowCount(db, "evidence_links"),
    },
    authority: {
      contract: db.prepare(
        `SELECT contract_id, version, active
         FROM capability_contracts WHERE active = 1`,
      ).get(),
      modelEpochs: db.prepare(
        `SELECT alias, resolved_model_id, model_epoch
         FROM model_continuity_state ORDER BY alias`,
      ).all(),
    },
  };
}

function activateCapability(db: DatabaseSync, capability: CapabilityName, modelEpoch = 0): void {
  capabilityCanInfluence(db, capability, "apply");
  db.prepare(
    `UPDATE capability_releases
     SET state = 'active', contract_id = ?, model_epoch = ?, updated_at = ?
     WHERE capability = ? AND release_id = ?`,
  ).run(
    currentContractId(),
    modelEpoch,
    new Date().toISOString(),
    capability,
    currentContractId(),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(CLOCK_START);
});

afterEach(() => {
  for (const db of openDbs) {
    try {
      db.close();
    } catch {
      // Best-effort cleanup after an assertion failure.
    }
  }
  openDbs.clear();
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories.clear();
  vi.useRealTimers();
});

describe("P-01A current cognition lifecycle characterization", () => {
  it("scenario 1: duplicate enqueue preserves one globally unique source key", () => {
    const fixture = createFixture();
    const duplicateId = enqueueCognitiveJob(fixture.db, {
      ownerId: OWNER_ID,
      kind: "consolidate_thread",
      sourceKey: fixture.sourceKey,
      payload: { threadId: "different-thread" },
    });

    expect(duplicateId).toBe(fixture.jobId);
    expect(rowCount(fixture.db, "cognitive_jobs")).toBe(1);
    expect(snapshot(fixture.db).job).toMatchObject({
      id: fixture.jobId,
      owner_id: OWNER_ID,
      source_key: fixture.sourceKey,
      status: "pending",
      attempts: 0,
    });
  });

  it("scenario 2: restart blindly resets running work without an expiring lease", () => {
    const fixture = createFixture(true);
    expect(claimNextJob(fixture.db)).toMatchObject({
      id: fixture.jobId,
      attempts: 1,
    });
    expect(snapshot(fixture.db).job).toMatchObject({
      status: "running",
      attempts: 1,
    });
    const columns = fixture.db.prepare("PRAGMA table_info(cognitive_jobs)").all() as
      Array<{ name: string }>;
    expect(columns.some((column) => /lease|claim.*at/i.test(column.name))).toBe(false);

    closeTracked(fixture.db);
    const reopened = openTracked(fixture.path!);
    expect(recoverCognitiveJobs(reopened)).toBe(1);
    expect(snapshot(reopened).job).toMatchObject({
      status: "pending",
      attempts: 1,
      available_at: new Date(CLOCK_START).toISOString(),
    });
  });

  it("scenario 3: failure before callback result creates no semantic materialization", async () => {
    const fixture = createFixture();

    expect(await processNextCognitiveJob(
      fixture.db,
      "observe",
      async () => { throw new Error("p01-before-result"); },
      allCapabilitiesActive,
    )).toBe(true);

    const state = snapshot(fixture.db);
    expect(state.semanticCounts).toEqual({
      episodeMessages: 0,
      facts: 0,
      mindState: 0,
      affectEvents: 0,
      revisions: 0,
      evidenceLinks: 0,
    });
    expect(state.job).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: "p01-before-result",
    });
    expect(state.runs).toEqual([
      expect.objectContaining({ status: "failed", error: "p01-before-result" }),
    ]);
  });

  it("scenario 4: a valid callback result followed by pre-transaction process loss leaves no outcome", async () => {
    const fixture = createFixture(true);
    let resultConstructed = false;

    await expect(processNextCognitiveJob(
      fixture.db,
      "observe",
      async () => {
        resultConstructed = true;
        closeTracked(fixture.db);
        return { analysis: fixedAnalysis, model: "p01-fixed", raw: "{}" };
      },
      allCapabilitiesActive,
    )).rejects.toThrow();
    expect(resultConstructed).toBe(true);

    const reopened = openTracked(fixture.path!);
    const beforeRecovery = snapshot(reopened);
    expect(beforeRecovery.job).toMatchObject({ status: "running", attempts: 1 });
    expect(beforeRecovery.runs).toEqual([]);
    expect(beforeRecovery.semanticCounts).toEqual({
      episodeMessages: 0,
      facts: 0,
      mindState: 0,
      affectEvents: 0,
      revisions: 0,
      evidenceLinks: 0,
    });
    expect(recoverCognitiveJobs(reopened)).toBe(1);
    expect(snapshot(reopened).job).toMatchObject({ status: "pending", attempts: 1 });
  });

  it("scenario 5: failure inside authoritative materialization rolls every effect back", async () => {
    const fixture = createFixture();
    fixture.db.exec(`
      CREATE TRIGGER p01_fail_mind_state
      BEFORE INSERT ON mind_state_items
      BEGIN SELECT RAISE(ABORT, 'p01 materialization failure'); END;
    `);

    expect(await processNextCognitiveJob(
      fixture.db,
      "apply",
      fixedAnalyze,
      allCapabilitiesActive,
    )).toBe(true);

    const state = snapshot(fixture.db);
    expect(state.semanticCounts).toEqual({
      episodeMessages: 0,
      facts: 0,
      mindState: 0,
      affectEvents: 0,
      revisions: 0,
      evidenceLinks: 0,
    });
    expect(rowCount(fixture.db, "episodes_fts")).toBe(0);
    expect(state.job).toMatchObject({ status: "pending", attempts: 1 });
    expect(state.runs).toEqual([
      expect.objectContaining({ status: "failed", error: "p01 materialization failure" }),
    ]);
  });

  it("scenario 6: committed Ashley outcome remains exactly once when the caller does not observe return", async () => {
    const fixture = createFixture(true);
    let callbackCount = 0;

    await processNextCognitiveJob(
      fixture.db,
      "apply",
      async () => {
        callbackCount += 1;
        return fixedAnalyze();
      },
      allCapabilitiesActive,
    );
    closeTracked(fixture.db);

    const reopened = openTracked(fixture.path!);
    expect(recoverCognitiveJobs(reopened)).toBe(0);
    expect(await processNextCognitiveJob(
      reopened,
      "apply",
      async () => {
        callbackCount += 1;
        return fixedAnalyze();
      },
      allCapabilitiesActive,
    )).toBe(false);

    const state = snapshot(reopened);
    expect(callbackCount).toBe(1);
    expect(state.job).toMatchObject({ status: "completed", attempts: 1 });
    expect(state.runs).toEqual([
      expect.objectContaining({ status: "completed", episode_id: 1 }),
    ]);
    expect(state.episodes).toHaveLength(1);
    expect(state.semanticCounts).toEqual({
      episodeMessages: 2,
      facts: 1,
      mindState: 1,
      affectEvents: 1,
      revisions: 1,
      evidenceLinks: 3,
    });
  });

  it("scenario 7: repeated failure uses exponential backoff and stops after attempt five", async () => {
    const fixture = createFixture();
    const observedDelays: number[] = [];
    let callbackCount = 0;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(await processNextCognitiveJob(
        fixture.db,
        "observe",
        async () => {
          callbackCount += 1;
          throw new Error(`p01-attempt-${attempt}`);
        },
        allCapabilitiesActive,
      )).toBe(true);
      const job = snapshot(fixture.db).job as {
        status: string;
        attempts: number;
        available_at: string;
      };
      observedDelays.push(Date.parse(job.available_at) - Date.now());
      expect(job.attempts).toBe(attempt);
      expect(job.status).toBe(attempt === 5 ? "failed" : "pending");
      if (attempt < 5) vi.setSystemTime(Date.parse(job.available_at));
    }

    expect(observedDelays).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    expect(callbackCount).toBe(5);
    expect(rowCount(fixture.db, "cognitive_runs")).toBe(5);
    expect(await processNextCognitiveJob(
      fixture.db,
      "observe",
      async () => {
        callbackCount += 1;
        return fixedAnalyze();
      },
      allCapabilitiesActive,
    )).toBe(false);
    expect(callbackCount).toBe(5);
  });

  it("scenario 8: contract mismatch and model epoch change both fail authority closed", async () => {
    const contractFixture = createFixture();
    activateCapability(contractFixture.db, "recall");
    expect(capabilityCanInfluence(contractFixture.db, "recall", "apply")).toBe(true);
    contractFixture.db.prepare(
      "UPDATE capability_contracts SET spec_hash = 'p01-mismatch' WHERE active = 1",
    ).run();
    expect(capabilityCanInfluence(contractFixture.db, "recall", "apply")).toBe(false);

    expect(await processNextCognitiveJob(
      contractFixture.db,
      "apply",
      fixedAnalyze,
    )).toBe(true);
    expect(contractFixture.db.prepare(
      "SELECT COUNT(*) AS count FROM episodes WHERE provenance = 'live'",
    ).get()).toEqual({ count: 0 });
    expect(rowCount(contractFixture.db, "mem_facts")).toBe(0);
    expect(rowCount(contractFixture.db, "mind_state_items")).toBe(0);

    const epochFixture = createFixture();
    applyModelContinuity(epochFixture.db, {
      alias: env.mistralModel,
      resolvedModelId: "p01-model-a",
      unresolvedAlias: false,
      dispatchSequence: 1,
    }, () => undefined);
    activateCapability(epochFixture.db, "recall", 0);
    activateCapability(epochFixture.db, "learning", 1);
    expect(capabilityCanInfluence(epochFixture.db, "learning", "apply")).toBe(true);
    applyModelContinuity(epochFixture.db, {
      alias: env.mistralModel,
      resolvedModelId: "p01-model-b",
      unresolvedAlias: false,
      dispatchSequence: 2,
    }, (db) => {
      for (const capability of MODEL_SENSITIVE_SET_FOR_CONTRACT) {
        db.prepare(
          `UPDATE capability_releases SET state = 'observe', updated_at = ?
           WHERE capability = ? AND release_id = ? AND state = 'active'`,
        ).run(new Date().toISOString(), capability, currentContractId());
      }
    });
    expect(capabilityCanInfluence(epochFixture.db, "learning", "apply")).toBe(false);
    expect(epochFixture.db.prepare(
      `SELECT state, model_epoch FROM capability_releases
       WHERE capability = 'learning' AND release_id = ?`,
    ).get(currentContractId())).toEqual({ state: "observe", model_epoch: 1 });
  });

  it("scenario 9: shadow artifacts never time-shift into later influence", async () => {
    const fixture = createFixture();
    expect(await processNextCognitiveJob(
      fixture.db,
      "observe",
      fixedAnalyze,
    )).toBe(true);
    const episode = fixture.db.prepare(
      "SELECT id, provenance FROM episodes LIMIT 1",
    ).get() as { id: number; provenance: string };
    const revision = fixture.db.prepare(
      "SELECT id, provenance, status FROM learning_revisions LIMIT 1",
    ).get() as { id: number; provenance: string; status: string };
    expect(episode.provenance).toBe("shadow");
    expect(revision).toMatchObject({ provenance: "shadow", status: "proposed" });

    for (const capability of ["recall", "mind_state", "affect", "learning"] as const) {
      activateCapability(fixture.db, capability);
    }
    expect(applyEligibleRevisions(fixture.db, OWNER_ID, "apply")).toEqual([]);
    expect(fixture.db.prepare(
      "SELECT provenance FROM episodes WHERE id = ?",
    ).get(episode.id)).toEqual({ provenance: "shadow" });
    expect(fixture.db.prepare(
      "SELECT provenance, status FROM learning_revisions WHERE id = ?",
    ).get(revision.id)).toEqual({ provenance: "shadow", status: "proposed" });
    expect(rowCount(fixture.db, "mem_facts")).toBe(0);
    expect(rowCount(fixture.db, "mind_state_items")).toBe(0);
    expect(rowCount(fixture.db, "affective_events")).toBe(0);
  });

  it("scenario 10: semantic provenance preserves owner, entity, thread, and exact source messages", async () => {
    const fixture = createFixture();
    expect(await processNextCognitiveJob(
      fixture.db,
      "apply",
      fixedAnalyze,
      allCapabilitiesActive,
    )).toBe(true);

    const episode = fixture.db.prepare(
      `SELECT id, owner_id, thread_id, source_start_message_id,
              source_end_message_id, entity_uuid, provenance
       FROM episodes LIMIT 1`,
    ).get() as Record<string, unknown>;
    expect(episode).toMatchObject({
      owner_id: OWNER_ID,
      thread_id: THREAD_ID,
      source_start_message_id: fixture.userMessageId,
      source_end_message_id: fixture.assistantMessageId,
      provenance: "live",
    });
    expect(String(episode.entity_uuid)).toMatch(/^[0-9a-f-]{36}$/i);

    expect(fixture.db.prepare(
      `SELECT id, entity_uuid FROM mem_messages
       WHERE id IN (?, ?) ORDER BY id`,
    ).all(fixture.userMessageId, fixture.assistantMessageId)).toEqual([
      { id: fixture.userMessageId, entity_uuid: USER_ENTITY_UUID },
      { id: fixture.assistantMessageId, entity_uuid: ASSISTANT_ENTITY_UUID },
    ]);
    expect(fixture.db.prepare(
      "SELECT message_id FROM episode_messages WHERE episode_id = ? ORDER BY message_id",
    ).all(Number(episode.id))).toEqual([
      { message_id: fixture.userMessageId },
      { message_id: fixture.assistantMessageId },
    ]);
    expect(fixture.db.prepare(
      "SELECT owner_id, source_message_id, origin FROM mem_facts LIMIT 1",
    ).get()).toEqual({
      owner_id: OWNER_ID,
      source_message_id: fixture.userMessageId,
      origin: "explicit_user",
    });
    expect(fixture.db.prepare(
      `SELECT source_type, source_id FROM evidence_links
       WHERE target_type = 'fact' ORDER BY source_type`,
    ).all()).toEqual([
      { source_type: "episode", source_id: String(episode.id) },
      { source_type: "message", source_id: String(fixture.userMessageId) },
    ]);
    expect(fixture.db.prepare(
      "SELECT source_type, source_id FROM mind_state_items LIMIT 1",
    ).get()).toEqual({ source_type: "episode", source_id: String(episode.id) });
    expect(fixture.db.prepare(
      "SELECT COUNT(*) AS count FROM evidence_links WHERE source_type = 'cognitive_run'",
    ).get()).toEqual({ count: 0 });
  });
});
