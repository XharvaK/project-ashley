import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";
import { ConsolidationWorker } from "./consolidator.js";
import { insertMessage, resolveActiveThread } from "./threads.js";

describe("ConsolidationWorker afterMessage", () => {
  it("does not flood facts jobs after threshold", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const ownerId = "o1";
    const threadId = resolveActiveThread(db, ownerId, "discord");
    const worker = new ConsolidationWorker(db);

    for (let i = 0; i < 12; i++) {
      const role = i % 2 === 0 ? "user" : "assistant";
      const id = insertMessage(db, {
        threadId,
        ownerId,
        role: role as "user" | "assistant",
        text: `msg ${i}`,
        channel: "discord",
        tokenEstimate: 10,
      });
      worker.afterMessage(ownerId, threadId, id, role as "user" | "assistant");
    }

    const factsJobs = db
      .prepare(`SELECT COUNT(*) as c FROM mem_jobs WHERE job_type = 'facts'`)
      .get() as { c: number };
    const embedJobs = db
      .prepare(`SELECT COUNT(*) as c FROM mem_jobs WHERE job_type = 'embed'`)
      .get() as { c: number };

    expect(embedJobs.c).toBe(12);
    expect(factsJobs.c).toBe(1);
  });
});
