import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";
import {
  recordMood,
  recentNegativeMoodCount,
} from "./mood.js";

describe("mood", () => {
  let db: DatabaseSync;
  const ownerId = "test_owner";

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrate(db);
  });

  it("counts negative recorded states in a window", () => {
    recordMood(db, ownerId, "tired");
    recordMood(db, ownerId, "warm");
    recordMood(db, ownerId, "irritated");
    recordMood(db, ownerId, "flat");
    expect(recentNegativeMoodCount(db, ownerId, 48)).toBe(3);
  });

  it("ignores rows outside the window and positive states", () => {
    recordMood(db, ownerId, "tired");
    recordMood(db, ownerId, "playful");
    const now = new Date();
    const old = new Date(now.getTime() - 100 * 3_600_000).toISOString();
    db.prepare(
      `UPDATE mem_mood SET created_at = ? WHERE mood = 'tired'`,
    ).run(old);
    expect(recentNegativeMoodCount(db, ownerId, 48, now)).toBe(0);
  });
});
