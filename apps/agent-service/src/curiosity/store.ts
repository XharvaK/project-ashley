import type { DatabaseSync } from "node:sqlite";
import { urlKey } from "./feed.js";

export type Interest =
  | "dev"
  | "pharma"
  | "music"
  | "gaming"
  | "philosophy"
  | "turkey"
  | "wildcard";

export type SourceRow = {
  id: number;
  slug: string;
  title: string;
  kind: "rss" | "atom" | "json" | "search";
  url: string;
  interest: string;
  weight: number;
  last_fetched_at: string | null;
  fail_count: number;
};

export type ItemRow = {
  id: number;
  source_id: number;
  url: string;
  title: string;
  excerpt: string | null;
  interest: string;
  published_at: string | null;
  seen_at: string;
  score: number;
  status: "scanned" | "noted" | "read" | "skipped";
};

export type TakeRow = {
  id: number;
  item_id: number;
  interest: string;
  take: string;
  created_at: string;
  surfaced_count: number;
  last_surfaced_at: string | null;
  title: string;
  url: string;
  source_slug?: string;
};

export type ProvenanceKind =
  | "scan"
  | "read"
  | "take"
  | "search"
  | "surface"
  | "mention"
  | "link";

export function upsertSource(
  db: DatabaseSync,
  source: {
    slug: string;
    title: string;
    kind: SourceRow["kind"];
    url: string;
    interest: string;
    weight?: number;
  },
): void {
  db.prepare(
    `INSERT INTO cur_sources (slug, title, kind, url, interest, weight)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       kind = excluded.kind,
       url = excluded.url,
       interest = excluded.interest,
       weight = excluded.weight`,
  ).run(
    source.slug,
    source.title,
    source.kind,
    source.url,
    source.interest,
    source.weight ?? 1,
  );
}

export function listSources(db: DatabaseSync): SourceRow[] {
  return db
    .prepare(
      `SELECT id, slug, title, kind, url, interest, weight, last_fetched_at, fail_count
       FROM cur_sources
       WHERE enabled = 1 AND kind IN ('rss','atom')
       ORDER BY COALESCE(last_fetched_at, '') ASC`,
    )
    .all() as SourceRow[];
}

export function markSourceFetched(
  db: DatabaseSync,
  sourceId: number,
  error: string | null,
): void {
  db.prepare(
    `UPDATE cur_sources
     SET last_fetched_at = datetime('now'),
         last_error = ?,
         fail_count = CASE WHEN ? IS NULL THEN 0 ELSE fail_count + 1 END
     WHERE id = ?`,
  ).run(error, error, sourceId);
}

/** Returns the new row id, or null when the item was already known. */
export function insertItem(
  db: DatabaseSync,
  item: {
    sourceId: number;
    url: string;
    title: string;
    excerpt: string;
    interest: string;
    publishedAt: string | null;
    score: number;
  },
): number | null {
  const existing = db
    .prepare(`SELECT id FROM cur_items WHERE url_key = ?`)
    .get(urlKey(item.url)) as { id: number } | undefined;
  if (existing) return null;

  const result = db
    .prepare(
      `INSERT INTO cur_items
         (source_id, url, url_key, title, excerpt, interest, published_at, seen_at, score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'scanned')`,
    )
    .run(
      item.sourceId,
      item.url,
      urlKey(item.url),
      item.title,
      item.excerpt.slice(0, 1200),
      item.interest,
      item.publishedAt,
      item.score,
    );
  return Number(result.lastInsertRowid);
}

export function setItemStatus(
  db: DatabaseSync,
  itemId: number,
  status: ItemRow["status"],
): void {
  db.prepare(`UPDATE cur_items SET status = ? WHERE id = ?`).run(status, itemId);
}

export function updateItemExcerpt(
  db: DatabaseSync,
  itemId: number,
  excerpt: string,
): void {
  db.prepare(`UPDATE cur_items SET excerpt = ? WHERE id = ?`).run(
    excerpt.slice(0, 4000),
    itemId,
  );
}

export function topScannedItems(
  db: DatabaseSync,
  limit: number,
): ItemRow[] {
  if (limit <= 0) return [];
  return db
    .prepare(
      `SELECT * FROM cur_items
       WHERE status = 'scanned'
       ORDER BY score DESC, seen_at DESC
       LIMIT ?`,
    )
    .all(limit) as ItemRow[];
}

/** Noted but not yet read, including leftovers from earlier ticks. */
export function topNotedItems(db: DatabaseSync, limit: number): ItemRow[] {
  if (limit <= 0) return [];
  return db
    .prepare(
      `SELECT * FROM cur_items
       WHERE status = 'noted'
       ORDER BY score DESC, seen_at DESC
       LIMIT ?`,
    )
    .all(limit) as ItemRow[];
}

export function countNotedSince(db: DatabaseSync, hours: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM cur_items
       WHERE status IN ('noted','read')
         AND seen_at >= datetime('now', ?)`,
    )
    .get(`-${hours} hours`) as { c: number };
  return row.c;
}

export function insertTake(
  db: DatabaseSync,
  take: { itemId: number; interest: string; take: string },
): number {
  const result = db
    .prepare(
      `INSERT INTO cur_takes (item_id, interest, take, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
    )
    .run(take.itemId, take.interest, take.take);
  return Number(result.lastInsertRowid);
}

export function recentTakes(
  db: DatabaseSync,
  withinHours: number,
  limit = 12,
): TakeRow[] {
  return db
    .prepare(
      `SELECT t.*, i.title AS title, i.url AS url, s.slug AS source_slug
       FROM cur_takes t
       JOIN cur_items i ON i.id = t.item_id
       JOIN cur_sources s ON s.id = i.source_id
       WHERE t.created_at >= datetime('now', ?)
       ORDER BY t.surfaced_count ASC, t.created_at DESC
       LIMIT ?`,
    )
    .all(`-${withinHours} hours`, limit) as TakeRow[];
}

export function markTakesSurfaced(db: DatabaseSync, ids: number[]): void {
  if (ids.length === 0) return;
  const stmt = db.prepare(
    `UPDATE cur_takes
     SET surfaced_count = surfaced_count + 1,
         last_surfaced_at = datetime('now')
     WHERE id = ?`,
  );
  for (const id of ids) stmt.run(id);
}

/** Append-only. Nothing she says about her own activity is licensed without a row. */
export function logProvenance(
  db: DatabaseSync,
  kind: ProvenanceKind,
  detail: string,
  itemId?: number | null,
): void {
  db.prepare(
    `INSERT INTO cur_provenance (kind, item_id, detail, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
  ).run(kind, itemId ?? null, detail.slice(0, 500));
}

export function countProvenance(
  db: DatabaseSync,
  kind: ProvenanceKind,
  withinHours: number,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM cur_provenance
       WHERE kind = ? AND created_at >= datetime('now', ?)`,
    )
    .get(kind, `-${withinHours} hours`) as { c: number };
  return row.c;
}

export function hasReadActivity(db: DatabaseSync, withinHours: number): boolean {
  return countProvenance(db, "read", withinHours) > 0;
}

const INTEREST_KEYWORDS: Array<{ interest: Interest; re: RegExp }> = [
  { interest: "gaming", re: /\b(game|gaming|steam|elden|roguelike|sim city|cs2)\b/i },
  { interest: "music", re: /\b(album|dub techno|bandcamp|vinyl|track|dj)\b/i },
  { interest: "pharma", re: /\b(receptor|dose|pharmac|ketamine|ssri|neuro)\b/i },
  { interest: "dev", re: /\b(refactor|typescript|sqlite|deploy|github|api)\b/i },
  { interest: "philosophy", re: /\b(essay|rationalist|ethics|philosophy)\b/i },
  { interest: "turkey", re: /\b(türkiy|izmir|ankara|istanbul|turkish)\b/i },
];

/** Silent interest discovery from recent facts / messages. Bumps feed weights. */
export function discoverInterestsFromText(
  db: DatabaseSync,
  texts: string[],
): string[] {
  const found = new Set<string>();
  const blob = texts.join("\n");
  for (const { interest, re } of INTEREST_KEYWORDS) {
    if (re.test(blob)) found.add(interest);
  }
  for (const interest of found) {
    db.prepare(
      `UPDATE cur_sources
       SET weight = MIN(1.4, weight + 0.05)
       WHERE interest = ? AND enabled = 1`,
    ).run(interest);
  }
  if (found.size > 0) {
    logProvenance(
      db,
      "mention",
      `interest_bump:${[...found].sort().join(",")}`,
    );
  }
  return [...found];
}

export function curiosityStats(db: DatabaseSync): {
  sources: number;
  itemsToday: number;
  readToday: number;
  takesToday: number;
  lastTakeAt: string | null;
} {
  const one = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...(params as never[])) as { c: number }).c;

  const lastTake = db
    .prepare(`SELECT created_at FROM cur_takes ORDER BY id DESC LIMIT 1`)
    .get() as { created_at: string } | undefined;

  return {
    sources: one(`SELECT COUNT(*) AS c FROM cur_sources WHERE enabled = 1`),
    itemsToday: one(
      `SELECT COUNT(*) AS c FROM cur_items WHERE seen_at >= datetime('now','-24 hours')`,
    ),
    readToday: one(
      `SELECT COUNT(*) AS c FROM cur_items
       WHERE status = 'read' AND seen_at >= datetime('now','-24 hours')`,
    ),
    takesToday: one(
      `SELECT COUNT(*) AS c FROM cur_takes WHERE created_at >= datetime('now','-24 hours')`,
    ),
    lastTakeAt: lastTake?.created_at ?? null,
  };
}
