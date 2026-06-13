import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";
import { ConsolidationWorker } from "./consolidator.js";

describe("enqueueCoalesced", () => {
  it("updates pending payload with latest trigger", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const worker = new ConsolidationWorker(db);
    worker.enqueueCoalesced("o1", "facts", "t1", 10);
    worker.enqueueCoalesced("o1", "facts", "t1", 20);
    const row = db
      .prepare(`SELECT payload_json FROM mem_jobs WHERE job_type = 'facts'`)
      .get() as { payload_json: string };
    const payload = JSON.parse(row.payload_json) as { triggerMessageId: number };
    expect(payload.triggerMessageId).toBe(20);
  });

  it("stores deferred trigger while job is running", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO mem_jobs (idempotency_key, owner_id, job_type, payload_json, status, created_at, updated_at)
       VALUES ('o1:facts:t1', 'o1', 'facts', ?, 'running', ?, ?)`,
    ).run(
      JSON.stringify({ threadId: "t1", triggerMessageId: 10 }),
      now,
      now,
    );
    const worker = new ConsolidationWorker(db);
    worker.enqueueCoalesced("o1", "facts", "t1", 25, { priority: true });
    const row = db
      .prepare(`SELECT payload_json FROM mem_jobs WHERE idempotency_key = 'o1:facts:t1'`)
      .get() as { payload_json: string };
    const payload = JSON.parse(row.payload_json) as {
      deferredTriggerMessageId?: number;
      priority?: boolean;
    };
    expect(payload.deferredTriggerMessageId).toBe(25);
    expect(payload.priority).toBe(true);
  });
});
