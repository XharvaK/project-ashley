import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { generateTake } from "./takes.js";
import { canSpendTavily, searchWeb } from "./search.js";
import {
  insertItem,
  insertTake,
  logProvenance,
  upsertSource,
} from "./store.js";

export type WatchRow = {
  id: number;
  owner_id: string;
  topic: string;
  query: string;
  cadence_hours: number;
  last_checked_at: string | null;
};

const WATCH_SOURCE = "doc-world-watch";

/**
 * Watches are about Doc's world: the projects and tools he actually works on.
 * They are derived from standing facts rather than guessed, so she can never end
 * up watching something he never mentioned.
 */
export function deriveWatchTopics(
  facts: Array<{ category: string; key: string; value: string }>,
  max: number,
): Array<{ topic: string; query: string }> {
  return facts
    .filter((f) => f.category === "project" || f.category === "ongoing")
    .map((f) => ({
      topic: f.key.slice(0, 80),
      query: f.value.replace(/\s+/g, " ").trim().slice(0, 120),
    }))
    .filter((w) => w.query.length > 8)
    .slice(0, max);
}

export function upsertWatch(
  db: DatabaseSync,
  ownerId: string,
  watch: { topic: string; query: string; cadenceHours?: number },
): void {
  db.prepare(
    `INSERT INTO cur_watches (owner_id, topic, query, cadence_hours, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(owner_id, topic) DO UPDATE SET query = excluded.query`,
  ).run(
    ownerId,
    watch.topic,
    watch.query,
    watch.cadenceHours ?? env.curiosityWatchCadenceHours,
  );
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
  logProvenance(db, "take", take, itemId);
  return { topic: watch.topic, take };
}
