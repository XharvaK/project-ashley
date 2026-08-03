import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { pruneCognitiveHistory } from "./jobs.js";

describe("cognition history retention", () => {
  it("prunes completed after 90 days and failed after 180 days", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const now = new Date("2026-08-03T00:00:00.000Z");
    const insert = db.prepare(
      `INSERT INTO cognitive_jobs
         (owner_id, kind, source_key, payload_json, status, attempts,
          available_at, created_at, updated_at)
       VALUES ('doc', 'consolidate_thread', ?, '{}', ?, 1, ?, ?, ?)`,
    );
    const oldCompleted = new Date(now.getTime() - 91 * 86_400_000).toISOString();
    const oldFailed = new Date(now.getTime() - 181 * 86_400_000).toISOString();
    const recent = new Date(now.getTime() - 10 * 86_400_000).toISOString();
    const oldCompletedJobId = Number(
      insert.run("old-completed", "completed", oldCompleted, oldCompleted, oldCompleted)
        .lastInsertRowid,
    );
    const oldFailedJobId = Number(
      insert.run("old-failed", "failed", oldFailed, oldFailed, oldFailed)
        .lastInsertRowid,
    );
    insert.run("recent-completed", "completed", recent, recent, recent);
    insert.run("pending", "pending", oldFailed, oldFailed, oldFailed);
    const insertRun = db.prepare(
      `INSERT INTO cognitive_runs
         (job_id, owner_id, kind, model, input_json, output_json, status,
          error, created_at, episode_id)
       VALUES (?, 'doc', 'consolidate_thread', NULL, '{}', '{}', ?, NULL, ?, NULL)`,
    );
    insertRun.run(oldCompletedJobId, "completed", oldCompleted);
    insertRun.run(oldFailedJobId, "failed", oldFailed);

    expect(pruneCognitiveHistory(db, "doc", now)).toBe(4);
    const keys = db.prepare(
      "SELECT source_key FROM cognitive_jobs ORDER BY source_key",
    ).all() as Array<{ source_key: string }>;
    expect(keys.map((row) => row.source_key)).toEqual([
      "pending",
      "recent-completed",
    ]);
    const runCount = db.prepare(
      "SELECT COUNT(*) AS count FROM cognitive_runs",
    ).get() as { count: number };
    expect(runCount.count).toBe(0);
    db.close();
  });
});
