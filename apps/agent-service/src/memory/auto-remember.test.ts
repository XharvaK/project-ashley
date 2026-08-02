import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";
import {
  detectAutoRemember,
  isSelfDisclosedLink,
} from "./auto-remember.js";
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

  it("pins on English remember this", () => {
    const r = detectAutoRemember("remember this: Doc prefers dark mode");
    expect(r?.action).toBe("pin");
    if (r?.action === "pin") {
      expect(r.fact.value).toContain("dark mode");
    }
  });

  it("does not merge conversational project statements", () => {
    expect(detectAutoRemember("Website Factory'de çalışıyorum")).toBeNull();
    expect(detectAutoRemember("Working on you, fixing the lookup gate")).toBeNull();
    expect(detectAutoRemember("working on composer-assistant")).toBeNull();
  });

  it("does not merge banter or self-project jokes", () => {
    expect(
      detectAutoRemember(
        "cursordaki projem sensin şapşik. Evet, sanırım bugünlük bu kadar yeterli.",
      ),
    ).toBeNull();
    expect(
      detectAutoRemember("yeter artık çalışıyorum sensin şapşik"),
    ).toBeNull();
  });

  it("does not merge identity or preference chatter", () => {
    expect(detectAutoRemember("my name is Doc")).toBeNull();
    expect(detectAutoRemember("I like strong coffee")).toBeNull();
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

describe("isSelfDisclosedLink", () => {
  it("fires when Doc points at his own work with a link", () => {
    expect(
      isSelfDisclosedLink(
        "Well, funny you mentioned the substrate independence... You should read my blog post: https://substack.com/@spiralseekr/p-193177777",
      ),
    ).toBe(true);
    expect(
      isSelfDisclosedLink("check my article https://example.com/a"),
    ).toBe(true);
    expect(
      isSelfDisclosedLink("benim blogumu oku: https://example.com/a"),
    ).toBe(true);
    expect(isSelfDisclosedLink("yazıma bak https://example.com/a")).toBe(true);
  });

  it("does not fire without a link or without self-attribution", () => {
    expect(isSelfDisclosedLink("You should read my blog post")).toBe(false);
    expect(isSelfDisclosedLink("check this out https://example.com/a")).toBe(
      false,
    );
    expect(isSelfDisclosedLink("his blog https://example.com/a")).toBe(false);
    expect(isSelfDisclosedLink("göz at https://example.com/a")).toBe(false);
  });
});
