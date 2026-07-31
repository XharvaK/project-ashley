import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "./memory/db.js";
import { reentryLine } from "./memory/reentry.js";
import {
  classifyReaction,
  kindFeedbackMultiplier,
  recordReaction,
  takeReactionLine,
} from "./signals.js";

const OWNER = "doc";
let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  migrate(db);
  db.prepare(
    `INSERT INTO mem_threads (id, owner_id, status, created_at, last_active_at)
     VALUES ('t1', ?, 'active', datetime('now'), datetime('now'))`,
  ).run(OWNER);
});

afterEach(() => db.close());

function userMessage(agoHours: number): number {
  const result = db
    .prepare(
      `INSERT INTO mem_messages (thread_id, owner_id, role, text, channel, ts)
       VALUES ('t1', ?, 'user', 'hey', 'discord', ?)`,
    )
    .run(
      OWNER,
      new Date(Date.now() - agoHours * 3_600_000).toISOString(),
    );
  return Number(result.lastInsertRowid);
}

describe("reactions", () => {
  it("reads a laugh as approval and a shrug as not", () => {
    expect(classifyReaction("😂")).toBe("positive");
    expect(classifyReaction("🙄")).toBe("negative");
    expect(classifyReaction("🦆")).toBe("neutral");
  });

  it("surfaces the reaction once and then stops mentioning it", () => {
    recordReaction(db, OWNER, { messageId: "m1", emoji: "😂" });
    expect(takeReactionLine(db)).toContain("😂");
    expect(takeReactionLine(db)).toBeNull();
  });

  it("attaches feedback to the proactive message it landed on", () => {
    db.prepare(
      `INSERT INTO mem_initiative_log
         (owner_id, thread_id, angle, reason, message_text, discord_message_id,
          sent_at, candidate_kind)
       VALUES (?, 't1', 'opinion', 'take', 'msg', 'm9', datetime('now'), 'curiosity_take')`,
    ).run(OWNER);

    const result = recordReaction(db, OWNER, { messageId: "m9", emoji: "🔥" });
    expect(result.matchedInitiative).toBe(true);
    expect(kindFeedbackMultiplier(db, OWNER, "curiosity_take")).toBeGreaterThan(
      1,
    );
  });

  it("leaves an untouched kind on a neutral multiplier", () => {
    expect(kindFeedbackMultiplier(db, OWNER, "stance")).toBe(1);
  });
});

describe("re-entry", () => {
  it("says nothing when he was here an hour ago", () => {
    userMessage(1);
    expect(reentryLine(db, OWNER)).toBeNull();
  });

  it("names the gap after days away", () => {
    userMessage(72);
    expect(reentryLine(db, OWNER)).toContain("3 days");
  });

  it("measures the previous turn, not the one he just sent", () => {
    userMessage(72);
    const current = userMessage(0);
    expect(reentryLine(db, OWNER, current)).toContain("3 days");
  });
});
