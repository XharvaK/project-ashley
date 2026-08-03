import type { DatabaseSync } from "node:sqlite";

export type CognitiveJobKind = "consolidate_thread" | "consolidate_curiosity";

export type CognitiveJob = {
  id: number;
  ownerId: string;
  kind: CognitiveJobKind;
  sourceKey: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export function enqueueCognitiveJob(
  db: DatabaseSync,
  input: {
    ownerId: string;
    kind: CognitiveJobKind;
    sourceKey: string;
    payload?: Record<string, unknown>;
    availableAt?: string;
  },
): number {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT OR IGNORE INTO cognitive_jobs
       (owner_id, kind, source_key, payload_json, status, attempts,
        available_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL, ?, ?)`,
  ).run(
    input.ownerId,
    input.kind,
    input.sourceKey,
    JSON.stringify(input.payload ?? {}),
    input.availableAt ?? now,
    now,
    now,
  );
  if (result.changes > 0) return Number(result.lastInsertRowid);
  const row = db.prepare(
    "SELECT id FROM cognitive_jobs WHERE source_key = ?",
  ).get(input.sourceKey) as { id?: number } | undefined;
  return row?.id ?? 0;
}

export function claimNextJob(db: DatabaseSync): CognitiveJob | null {
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare(
      `SELECT id, owner_id, kind, source_key, payload_json, attempts
       FROM cognitive_jobs
       WHERE status = 'pending' AND available_at <= ?
       ORDER BY id ASC LIMIT 1`,
    ).get(now) as Record<string, unknown> | undefined;
    if (!row) {
      db.exec("COMMIT");
      return null;
    }
    db.prepare(
      `UPDATE cognitive_jobs SET status = 'running', attempts = attempts + 1,
              updated_at = ? WHERE id = ? AND status = 'pending'`,
    ).run(now, Number(row.id));
    db.exec("COMMIT");
    let payload: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(String(row.payload_json ?? "{}"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = {};
    }
    return {
      id: Number(row.id),
      ownerId: String(row.owner_id),
      kind: String(row.kind) as CognitiveJobKind,
      sourceKey: String(row.source_key),
      payload,
      attempts: Number(row.attempts) + 1,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function recoverCognitiveJobs(db: DatabaseSync): number {
  const result = db.prepare(
    `UPDATE cognitive_jobs
     SET status = 'pending', available_at = ?, updated_at = ?
     WHERE status = 'running'`,
  ).run(new Date().toISOString(), new Date().toISOString());
  return Number(result.changes);
}

export function completeJob(db: DatabaseSync, jobId: number): void {
  db.prepare(
    `UPDATE cognitive_jobs SET status = 'completed', last_error = NULL,
            updated_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), jobId);
}

export function failJob(
  db: DatabaseSync,
  job: CognitiveJob,
  error: string,
): void {
  const terminal = job.attempts >= 5;
  const retryAt = new Date(
    Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.max(0, job.attempts - 1)),
  ).toISOString();
  db.prepare(
    `UPDATE cognitive_jobs
     SET status = ?, available_at = ?, last_error = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    terminal ? "failed" : "pending",
    retryAt,
    error.slice(0, 1000),
    new Date().toISOString(),
    job.id,
  );
}

export function pruneCognitiveHistory(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): number {
  const completedCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const failedCutoff = new Date(now.getTime() - 180 * 86_400_000).toISOString();
  let changes = 0;
  changes += Number(db.prepare(
    `DELETE FROM cognitive_runs WHERE id IN (
       SELECT id FROM cognitive_runs
       WHERE owner_id = ? AND status = 'completed' AND created_at < ?
       ORDER BY id ASC LIMIT 200
     )`,
  ).run(ownerId, completedCutoff).changes);
  changes += Number(db.prepare(
    `DELETE FROM cognitive_runs WHERE id IN (
       SELECT id FROM cognitive_runs
       WHERE owner_id = ? AND status = 'failed' AND created_at < ?
       ORDER BY id ASC LIMIT 200
     )`,
  ).run(ownerId, failedCutoff).changes);
  changes += Number(db.prepare(
    `DELETE FROM cognitive_jobs WHERE id IN (
       SELECT j.id FROM cognitive_jobs j
       WHERE j.owner_id = ? AND j.status = 'completed' AND j.updated_at < ?
         AND NOT EXISTS (SELECT 1 FROM cognitive_runs r WHERE r.job_id = j.id)
       ORDER BY j.id ASC LIMIT 200
     )`,
  ).run(ownerId, completedCutoff).changes);
  changes += Number(db.prepare(
    `DELETE FROM cognitive_jobs WHERE id IN (
       SELECT j.id FROM cognitive_jobs j
       WHERE j.owner_id = ? AND j.status = 'failed' AND j.updated_at < ?
         AND NOT EXISTS (SELECT 1 FROM cognitive_runs r WHERE r.job_id = j.id)
       ORDER BY j.id ASC LIMIT 200
     )`,
  ).run(ownerId, failedCutoff).changes);
  return changes;
}
