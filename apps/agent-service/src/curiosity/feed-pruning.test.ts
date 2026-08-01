import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../memory/db.js";
import {
  getFeedStrikeRecord,
  recordFeedStrike,
  isFeedPruned,
} from "./feed-pruning.js";

describe("feed-pruning", () => {
  let db: DatabaseSync;
  const ownerId = "test_owner";
  const sourceSlug = "low-quality-blog";

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrate(db);
  });

  it("starts with 0 strikes and not pruned", () => {
    expect(isFeedPruned(db, ownerId, sourceSlug)).toBe(false);
    const rec = getFeedStrikeRecord(db, ownerId, sourceSlug);
    expect(rec.strikes).toBe(0);
  });

  it("prunes feed after 3 strikes", () => {
    recordFeedStrike(db, ownerId, sourceSlug, "SEO clickbait title");
    expect(isFeedPruned(db, ownerId, sourceSlug)).toBe(false);

    recordFeedStrike(db, ownerId, sourceSlug, "Low unique content");
    expect(isFeedPruned(db, ownerId, sourceSlug)).toBe(false);

    const prunedRec = recordFeedStrike(db, ownerId, sourceSlug, "Repetitive AI summary");
    expect(isFeedPruned(db, ownerId, sourceSlug)).toBe(true);
    expect(prunedRec.strikes).toBe(3);
    expect(prunedRec.prunedAt).toBeTruthy();
  });
});
