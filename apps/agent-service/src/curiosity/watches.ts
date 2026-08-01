import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { words } from "./inject.js";
import { generateTake } from "./takes.js";
import { canSpendTavily, searchWeb } from "./search.js";
import {
  insertItem,
  insertTake,
  logProvenance,
  upsertSource,
} from "./store.js";
import { recordTasteSignal } from "../memory/taste-drift.js";

export type WatchRow = {
  id: number;
  owner_id: string;
  topic: string;
  query: string;
  cadence_hours: number;
  last_checked_at: string | null;
};

const WATCH_SOURCE = "doc-world-watch";

const EPHEMERAL_RE =
  /\b\d+\s*(hours?|hrs?|minutes?|mins?|days?)\b|\b(hours?\s+saved|per\s+month|session\s*load|load\s*time)\b|\b(current_?time|gmt|timezone|clock)\b|\b(stopped|quit|abstinen|giving\s+up|last_?month)\b|\b(mood|status|feeling|tired|yorgun|bitkin)\b|\bworked[_\s-]?on\b|\b(for\s+~?\d+|~?\d+\s*hours?\s+on)\b/i;

export type WatchFact = {
  category: string;
  key: string;
  value: string;
  valid_until?: string | null;
};

export function isEphemeralWatchFact(key: string, value: string): boolean {
  return EPHEMERAL_RE.test(`${key} ${value}`);
}

export function isDurableWatchTopic(topic: string, query: string): boolean {
  const topicTokens = words(topic.replace(/[_-]+/g, " "));
  const valueTokens = words(query);
  return topicTokens.length >= 2 || valueTokens.length >= 2;
}

export function tokenOverlap(a: string, b: string): number {
  const left = new Set(words(a));
  if (left.size === 0) return 0;
  const right = new Set(words(b));
  let n = 0;
  for (const w of right) {
    if (left.has(w)) n++;
  }
  return n;
}

export function hitMatchesWatch(
  hit: { title: string; snippet: string },
  watch: { topic: string; query: string },
): boolean {
  return (
    tokenOverlap(
      `${hit.title} ${hit.snippet}`,
      `${watch.topic} ${watch.query}`,
    ) >= 2
  );
}

/**
 * Watches are about Doc's world: durable projects and ongoing threads.
 * Ephemeral timesheet / mood / status facts never become auto-watches.
 */
export function deriveWatchTopics(
  facts: WatchFact[],
  max: number,
): Array<{ topic: string; query: string }> {
  return facts
    .filter((f) => f.category === "project" || f.category === "ongoing")
    .filter((f) => !f.valid_until)
    .filter((f) => !isEphemeralWatchFact(f.key, f.value))
    .map((f) => ({
      topic: f.key.slice(0, 80),
      query: f.value.replace(/\s+/g, " ").trim().slice(0, 120),
    }))
    .filter((w) => w.query.length > 8)
    .filter((w) => isDurableWatchTopic(w.topic, w.query))
    .slice(0, max);
}

export function upsertWatch(
  db: DatabaseSync,
  ownerId: string,
  watch: { topic: string; query: string; cadenceHours?: number },
): void {
  db.prepare(
    `INSERT INTO cur_watches (owner_id, topic, query, cadence_hours, enabled, created_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(owner_id, topic) DO UPDATE SET
       query = excluded.query,
       enabled = 1`,
  ).run(
    ownerId,
    watch.topic,
    watch.query,
    watch.cadenceHours ?? env.curiosityWatchCadenceHours,
  );
}

/** Enable durable topics; disable watches whose facts fell off eligibility. */
export function syncWatchesFromFacts(
  db: DatabaseSync,
  ownerId: string,
  facts: WatchFact[],
  max: number,
): void {
  const eligible = deriveWatchTopics(facts, max);
  const eligibleTopics = new Set(eligible.map((w) => w.topic));
  for (const watch of eligible) {
    upsertWatch(db, ownerId, watch);
  }
  const existing = db
    .prepare(
      `SELECT topic FROM cur_watches WHERE owner_id = ? AND enabled = 1`,
    )
    .all(ownerId) as Array<{ topic: string }>;
  for (const row of existing) {
    if (!eligibleTopics.has(row.topic)) {
      db.prepare(
        `UPDATE cur_watches SET enabled = 0 WHERE owner_id = ? AND topic = ?`,
      ).run(ownerId, row.topic);
    }
  }
}

export function dueWatches(db: DatabaseSync, ownerId: string): WatchRow[] {
  return db
    .prepare(
      `SELECT id, owner_id, topic, query, cadence_hours, last_checked_at
       FROM cur_watches
       WHERE owner_id = ? AND enabled = 1
         AND (last_checked_at IS NULL
              OR last_checked_at <= datetime('now', '-' || cadence_hours || ' hours'))
       ORDER BY COALESCE(last_checked_at, '') ASC`,
    )
    .all(ownerId) as WatchRow[];
}

export function markWatchChecked(db: DatabaseSync, id: number): void {
  db.prepare(
    `UPDATE cur_watches SET last_checked_at = datetime('now') WHERE id = ?`,
  ).run(id);
}

function watchSourceId(db: DatabaseSync): number {
  upsertSource(db, {
    slug: WATCH_SOURCE,
    title: "Watching Doc's world",
    kind: "search",
    url: "tavily:watch",
    interest: "dev",
    weight: 1.3,
  });
  const row = db
    .prepare(`SELECT id FROM cur_sources WHERE slug = ?`)
    .get(WATCH_SOURCE) as { id: number };
  return row.id;
}

/** One watch per tick at most: search credits are the scarce resource here. */
export async function runOneDueWatch(
  db: DatabaseSync,
  ownerId: string,
): Promise<{ topic: string; take: string } | null> {
  if (!env.tavilyApiKey) return null;
  if (!canSpendTavily(db)) return null;
  const watch = dueWatches(db, ownerId)[0];
  if (!watch) return null;

  markWatchChecked(db, watch.id);
  const hits = await searchWeb(db, watch.query);
  if (hits.length === 0) return null;

  const hit = hits[0]!;
  if (!hitMatchesWatch(hit, watch)) return null;

  const itemId = insertItem(db, {
    sourceId: watchSourceId(db),
    url: hit.url,
    title: hit.title || watch.topic,
    excerpt: hit.snippet,
    interest: "dev",
    publishedAt: null,
    score: 2,
  });
  if (itemId === null) return null;

  let take: string | null = null;
  try {
    take = await generateTake({
      title: `${watch.topic}: ${hit.title}`,
      text: hits.map((h) => `${h.title}\n${h.snippet}`).join("\n\n"),
    });
  } catch (err) {
    console.warn("[curiosity] watch take failed:", err);
  }
  if (!take) return null;

  logProvenance(db, "read", `watch ${watch.topic}: ${hit.url}`, itemId);
  insertTake(db, { itemId, interest: "dev", take });
  try {
    recordTasteSignal(db, {
      interest: "dev",
      take,
      title: `${watch.topic}: ${hit.title}`,
    });
  } catch (err) {
    console.warn("[curiosity] taste signal failed:", err);
  }
  logProvenance(db, "take", take, itemId);
  return { topic: watch.topic, take };
}
