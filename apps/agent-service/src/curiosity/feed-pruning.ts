import type { DatabaseSync } from "node:sqlite";
import { getKv, setKv } from "../memory/kv.js";

export type FeedStrikeRecord = {
  feedUrl: string;
  sourceSlug: string;
  strikes: number;
  reasons: string[];
  prunedAt: string | null;
};

export function getFeedStrikeRecord(
  db: DatabaseSync,
  ownerId: string,
  sourceSlug: string,
): FeedStrikeRecord {
  const key = `feed_strike:${ownerId}:${sourceSlug}`;
  const existingJson = getKv(db, key);
  if (!existingJson) {
    return {
      feedUrl: sourceSlug,
      sourceSlug,
      strikes: 0,
      reasons: [],
      prunedAt: null,
    };
  }
  try {
    return JSON.parse(existingJson);
  } catch {
    return {
      feedUrl: sourceSlug,
      sourceSlug,
      strikes: 0,
      reasons: [],
      prunedAt: null,
    };
  }
}

export function recordFeedStrike(
  db: DatabaseSync,
  ownerId: string,
  sourceSlug: string,
  reason: string,
): FeedStrikeRecord {
  const record = getFeedStrikeRecord(db, ownerId, sourceSlug);
  record.strikes += 1;
  record.reasons.push(reason);

  if (record.strikes >= 3 && !record.prunedAt) {
    record.prunedAt = new Date().toISOString();
  }

  const key = `feed_strike:${ownerId}:${sourceSlug}`;
  setKv(db, key, JSON.stringify(record));
  return record;
}

export function isFeedPruned(
  db: DatabaseSync,
  ownerId: string,
  sourceSlug: string,
): boolean {
  const record = getFeedStrikeRecord(db, ownerId, sourceSlug);
  return record.strikes >= 3;
}

export function listPrunedFeeds(
  db: DatabaseSync,
  ownerId: string,
): FeedStrikeRecord[] {
  const prefix = `feed_strike:${ownerId}:`;
  // We can track a list of pruned feed slugs in KV
  const listKey = `pruned_feed_list:${ownerId}`;
  const json = getKv(db, listKey);
  if (!json) return [];
  try {
    const slugs: string[] = JSON.parse(json);
    return slugs.map((slug) => getFeedStrikeRecord(db, ownerId, slug));
  } catch {
    return [];
  }
}
