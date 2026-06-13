import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";
import { detectAutoRemember } from "./auto-remember.js";
import { ConsolidationWorker } from "./consolidator.js";
import { insertMessage, resolveActiveThread } from "./threads.js";

describe("auto-remember", () => {
  it("pins on imperative phrase", () => {
    const r = detectAutoRemember("bunu hatırla: Website Factory ana projem");
    expect(r?.action).toBe("pin");
    if (r?.action === "pin") {
      expect(r.fact.value).toContain("Website Factory");
    }
  });

  it("merges explicit project statement (de çalışıyorum)", () => {
    const r = detectAutoRemember("Website Factory'de çalışıyorum");
    expect(r?.action).toBe("merge");
  });

  it("does not merge banter after çalışıyorum", () => {
    const r = detectAutoRemember(
      "artık çalışıyorum sensin şapşik. Evet, sanırım bugünlük bu kadar yeterli. Bira",
    );
    expect(r).toBeNull();
  });

  it("does not merge casual speech with çalışıyorum", () => {
    expect(detectAutoRemember("yeter artık çalışıyorum sensin şapşik")).toBeNull();
  });

  it("merges Ashley self-project from playful projem phrase", () => {
    const r = detectAutoRemember(
      "cursordaki projem sensin şapşik. Evet, sanırım bugünlük bu kadar yeterli.",
    );
    expect(r?.action).toBe("merge");
    if (r?.action === "merge") {
      expect(r.fact.value).toBe("composer-assistant (Ashley)");
      expect(r.fact.category).toBe("project");
    }
  });

  it("coalesces priority facts job for bare remember", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const ownerId = "o1";
    const threadId = resolveActiveThread(db, ownerId, "discord");
    const worker = new ConsolidationWorker(db);
    const msgId = insertMessage(db, {
      threadId,
      ownerId,
      role: "user",
      text: "bunu hatırla",
      channel: "discord",
      tokenEstimate: 5,
    });
    worker.enqueuePriorityFacts(ownerId, threadId, msgId);
    const row = db
      .prepare(
        `SELECT COUNT(*) as c FROM mem_jobs WHERE job_type = 'facts' AND status = 'pending'`,
      )
      .get() as { c: number };
    expect(row.c).toBe(1);
    worker.enqueuePriorityFacts(ownerId, threadId, msgId + 1);
    const row2 = db
      .prepare(`SELECT COUNT(*) as c FROM mem_jobs WHERE job_type = 'facts'`)
      .get() as { c: number };
    expect(row2.c).toBe(1);
  });
});
