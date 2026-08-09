import { DatabaseSync } from "node:sqlite";

export class SyntheticAshleyAuthority {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ashley_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id TEXT NOT NULL,
        entity_uuid TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        source_key TEXT NOT NULL UNIQUE,
        source_message_ids TEXT NOT NULL,
        capability_contract TEXT NOT NULL,
        model_epoch INTEGER NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance IN ('shadow', 'live')),
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS ashley_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES ashley_jobs(id),
        candidate_run_id TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        UNIQUE(job_id, candidate_run_id)
      );
      CREATE TABLE IF NOT EXISTS ashley_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL UNIQUE REFERENCES ashley_jobs(id),
        source_key TEXT NOT NULL UNIQUE,
        owner_id TEXT NOT NULL,
        entity_uuid TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        source_message_ids TEXT NOT NULL,
        capability_contract TEXT NOT NULL,
        model_epoch INTEGER NOT NULL,
        provenance TEXT NOT NULL,
        summary TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS semantic_effects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES ashley_jobs(id),
        source_key TEXT NOT NULL,
        effect_type TEXT NOT NULL,
        effect_key TEXT NOT NULL,
        provenance TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        UNIQUE(source_key, effect_type, effect_key)
      );
      CREATE TABLE IF NOT EXISTS p01_trace (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_key TEXT NOT NULL,
        event TEXT NOT NULL,
        detail TEXT
      );
    `);
  }

  close() {
    this.db.close();
  }

  enqueue(job) {
    this.db.prepare(`
      INSERT OR IGNORE INTO ashley_jobs
        (owner_id, entity_uuid, thread_id, source_key, source_message_ids,
         capability_contract, model_epoch, provenance, status, attempts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
    `).run(
      job.ownerId,
      job.entityUuid,
      job.threadId,
      job.sourceKey,
      JSON.stringify(job.sourceMessageIds),
      job.capabilityContract,
      job.modelEpoch,
      job.provenance,
    );
    return this.job(job.sourceKey);
  }

  job(sourceKey) {
    return this.db.prepare(
      "SELECT * FROM ashley_jobs WHERE source_key = ?",
    ).get(sourceKey);
  }

  outcome(sourceKey) {
    return this.db.prepare(
      "SELECT * FROM ashley_outcomes WHERE source_key = ?",
    ).get(sourceKey);
  }

  trace(sourceKey, event, detail = null) {
    this.db.prepare(
      "INSERT INTO p01_trace (source_key, event, detail) VALUES (?, ?, ?)",
    ).run(sourceKey, event, detail == null ? null : JSON.stringify(detail));
  }

  beginAttempt(sourceKey) {
    this.db.prepare(`
      UPDATE ashley_jobs
      SET status = 'running', attempts = attempts + 1, last_error = NULL
      WHERE source_key = ? AND status != 'completed'
    `).run(sourceKey);
    const job = this.job(sourceKey);
    this.trace(sourceKey, "callback_start", { attempt: Number(job.attempts) });
    return Number(job.attempts);
  }

  markFailure(sourceKey, candidateRunId, error) {
    const job = this.job(sourceKey);
    const terminal = Number(job.attempts) >= 5;
    this.db.prepare(`
      UPDATE ashley_jobs SET status = ?, last_error = ? WHERE source_key = ?
    `).run(terminal ? "failed" : "pending", String(error), sourceKey);
    this.db.prepare(`
      INSERT INTO ashley_runs (job_id, candidate_run_id, status, error)
      VALUES (?, ?, 'failed', ?)
      ON CONFLICT(job_id, candidate_run_id) DO UPDATE SET
        status = 'failed', error = excluded.error
    `).run(job.id, candidateRunId, String(error));
    this.trace(sourceKey, terminal ? "terminal_failed" : "retry_scheduled", {
      attempt: Number(job.attempts),
      error: String(error),
    });
  }

  materialize(job, analysis, candidateRunId, failurePoint = "none") {
    const existing = this.outcome(job.sourceKey);
    if (existing) {
      this.trace(job.sourceKey, "materializer_reconciled", { outcomeId: existing.id });
      return existing;
    }
    if (job.contractMismatch || job.epochMismatch) {
      throw new Error(job.contractMismatch ? "contract_mismatch" : "model_epoch_mismatch");
    }

    this.trace(job.sourceKey, "materialization_begin");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const persisted = this.job(job.sourceKey);
      const messages = JSON.parse(persisted.source_message_ids);
      if (
        persisted.owner_id !== job.ownerId ||
        persisted.entity_uuid !== job.entityUuid ||
        persisted.thread_id !== job.threadId ||
        JSON.stringify(messages) !== JSON.stringify(job.sourceMessageIds) ||
        persisted.capability_contract !== job.capabilityContract ||
        Number(persisted.model_epoch) !== job.modelEpoch ||
        persisted.provenance !== job.provenance
      ) {
        throw new Error("ashley_provenance_mismatch");
      }

      const inserted = this.db.prepare(`
        INSERT INTO ashley_outcomes
          (job_id, source_key, owner_id, entity_uuid, thread_id,
           source_message_ids, capability_contract, model_epoch, provenance, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        persisted.id,
        job.sourceKey,
        job.ownerId,
        job.entityUuid,
        job.threadId,
        JSON.stringify(job.sourceMessageIds),
        job.capabilityContract,
        job.modelEpoch,
        job.provenance,
        analysis.summary,
      );
      const outcomeId = Number(inserted.lastInsertRowid);
      const insertEffect = this.db.prepare(`
        INSERT INTO semantic_effects
          (job_id, source_key, effect_type, effect_key, provenance,
           source_type, source_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertEffect.run(
        persisted.id,
        job.sourceKey,
        "episode",
        job.entityUuid,
        job.provenance,
        "message_set",
        JSON.stringify(job.sourceMessageIds),
      );
      insertEffect.run(
        persisted.id,
        job.sourceKey,
        "revision",
        "interest.cognition_reliability",
        job.provenance,
        "episode",
        String(outcomeId),
      );
      if (failurePoint === "inside_ashley_transaction") {
        throw new Error("inside_ashley_transaction");
      }
      if (job.provenance === "live") {
        insertEffect.run(
          persisted.id,
          job.sourceKey,
          "fact",
          "p01_proof",
          "live",
          "message",
          String(job.sourceMessageIds[0]),
        );
        insertEffect.run(
          persisted.id,
          job.sourceKey,
          "mind_state",
          "p01_follow_up",
          "live",
          "episode",
          String(outcomeId),
        );
        insertEffect.run(
          persisted.id,
          job.sourceKey,
          "affect",
          "p01_focus",
          "live",
          "episode",
          String(outcomeId),
        );
      }
      this.db.prepare(`
        INSERT INTO ashley_runs (job_id, candidate_run_id, status, error)
        VALUES (?, ?, 'completed', NULL)
        ON CONFLICT(job_id, candidate_run_id) DO UPDATE SET
          status = 'completed', error = NULL
      `).run(persisted.id, candidateRunId);
      this.db.prepare(
        "UPDATE ashley_jobs SET status = 'completed', last_error = NULL WHERE id = ?",
      ).run(persisted.id);
      this.db.exec("COMMIT");
      this.trace(job.sourceKey, "materialization_commit", { outcomeId });
      return this.outcome(job.sourceKey);
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.trace(job.sourceKey, "materialization_rollback", { error: error.message });
      throw error;
    }
  }

  snapshot(sourceKey) {
    const job = this.job(sourceKey);
    return {
      job,
      runs: this.db.prepare(
        "SELECT * FROM ashley_runs WHERE job_id = ? ORDER BY id",
      ).all(job.id),
      outcome: this.outcome(sourceKey) ?? null,
      effects: this.db.prepare(
        "SELECT * FROM semantic_effects WHERE source_key = ? ORDER BY effect_type, id",
      ).all(sourceKey),
      trace: this.db.prepare(
        "SELECT event, detail FROM p01_trace WHERE source_key = ? ORDER BY id",
      ).all(sourceKey),
    };
  }
}
