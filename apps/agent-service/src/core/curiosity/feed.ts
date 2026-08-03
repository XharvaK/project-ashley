import type { DatabaseSync } from "node:sqlite";
import {
  decodeEntities,
  htmlToText,
  parseFeed,
  urlKey,
  type FeedItem,
} from "../../lib/feed-parse.js";

export { decodeEntities, htmlToText, parseFeed, urlKey };
export type { FeedItem };

export type NuclearSourceKind = "rss" | "atom" | "json" | "search";

export type NuclearSource = {
  id: number;
  slug: string;
  title: string;
  kind: NuclearSourceKind;
  url: string;
  interest: string;
  weight: number;
  enabled: boolean;
  lastFetchedAt: string | null;
};

export type NuclearItem = {
  id: number;
  sourceId: number;
  url: string;
  title: string;
  excerpt: string;
  interest: string;
  publishedAt: string | null;
  seenAt: string;
  score: number;
  status: "scanned" | "noted" | "read" | "skipped";
};

export type NuclearTake = {
  id: number;
  itemId: number;
  interest: string;
  take: string;
  createdAt: string;
  title: string;
  url: string;
  evidenceKind: "scan_excerpt" | "read_record";
  readId: number | null;
};

export type NuclearProvenanceKind =
  | "scan"
  | "read"
  | "take"
  | "search"
  | "surface"
  | "mention"
  | "link"
  | "radar";

type SourceInput = {
  slug: string;
  title: string;
  kind: NuclearSourceKind;
  url: string;
  interest: string;
  weight?: number;
};

type DbRow = Record<string, unknown>;

function isRow(value: unknown): value is DbRow {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function mapSource(row: unknown): NuclearSource | null {
  if (!isRow(row)) return null;
  const kind = stringValue(row.kind);
  if (kind !== "rss" && kind !== "atom" && kind !== "json" && kind !== "search") {
    return null;
  }
  return {
    id: numberValue(row.id),
    slug: stringValue(row.slug),
    title: stringValue(row.title),
    kind,
    url: stringValue(row.url),
    interest: stringValue(row.interest),
    weight: numberValue(row.weight),
    enabled: numberValue(row.enabled) === 1,
    lastFetchedAt:
      typeof row.last_fetched_at === "string" ? row.last_fetched_at : null,
  };
}

function mapItem(row: unknown): NuclearItem | null {
  if (!isRow(row)) return null;
  const status = stringValue(row.status);
  if (
    status !== "scanned" &&
    status !== "noted" &&
    status !== "read" &&
    status !== "skipped"
  ) {
    return null;
  }
  return {
    id: numberValue(row.id),
    sourceId: numberValue(row.source_id),
    url: stringValue(row.url),
    title: stringValue(row.title),
    excerpt: stringValue(row.excerpt),
    interest: stringValue(row.interest),
    publishedAt:
      typeof row.published_at === "string" ? row.published_at : null,
    seenAt: stringValue(row.seen_at),
    score: numberValue(row.score),
    status,
  };
}

function mapTake(row: unknown): NuclearTake | null {
  if (!isRow(row)) return null;
  return {
    id: numberValue(row.id),
    itemId: numberValue(row.item_id),
    interest: stringValue(row.interest),
    take: stringValue(row.take),
    createdAt: stringValue(row.created_at),
    title: stringValue(row.title),
    url: stringValue(row.url),
    evidenceKind: row.evidence_kind === "read_record"
      ? "read_record"
      : "scan_excerpt",
    readId: row.read_id == null ? null : numberValue(row.read_id),
  };
}

export function upsertSource(db: DatabaseSync, source: SourceInput): number {
  db.prepare(
    `INSERT INTO cur_sources
       (slug, title, kind, url, interest, weight, enabled)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       kind = excluded.kind,
       url = excluded.url,
       interest = excluded.interest,
       weight = excluded.weight,
       enabled = 1`,
  ).run(
    source.slug,
    source.title,
    source.kind,
    source.url,
    source.interest,
    source.weight ?? 1,
  );
  const row: unknown = db
    .prepare("SELECT id FROM cur_sources WHERE slug = ?")
    .get(source.slug);
  return isRow(row) && typeof row.id === "number" ? row.id : 0;
}

export function listSources(db: DatabaseSync, limit = 100): NuclearSource[] {
  const rows = db
    .prepare(
      `SELECT id, slug, title, kind, url, interest, weight, enabled, last_fetched_at
       FROM cur_sources
       WHERE enabled = 1
       ORDER BY COALESCE(last_fetched_at, '') ASC, weight DESC
       LIMIT ?`,
    )
    .all(Math.max(1, Math.min(200, limit)))
    .map(mapSource)
    .filter((source): source is NuclearSource => source !== null);
  return rows;
}

export function markSourceFetched(
  db: DatabaseSync,
  sourceId: number,
  error: string | null,
): void {
  db.prepare(
    `UPDATE cur_sources
     SET last_fetched_at = ?, last_error = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), error, sourceId);
}

export function insertItem(
  db: DatabaseSync,
  input: {
    sourceId: number;
    url: string;
    title: string;
    excerpt: string;
    interest: string;
    publishedAt?: string | null;
    score?: number;
  },
): number | null {
  const normalizedUrl = urlKey(input.url);
  const existing: unknown = db
    .prepare("SELECT id FROM cur_items WHERE url_key = ?")
    .get(normalizedUrl);
  if (isRow(existing) && typeof existing.id === "number") return null;
  const result = db
    .prepare(
      `INSERT INTO cur_items
         (source_id, url, url_key, title, excerpt, interest, published_at,
          seen_at, score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scanned')`,
    )
    .run(
      input.sourceId,
      input.url,
      normalizedUrl,
      input.title.trim().slice(0, 500),
      input.excerpt.trim().slice(0, 1600),
      input.interest,
      input.publishedAt ?? null,
      new Date().toISOString(),
      input.score ?? 0,
    );
  return Number(result.lastInsertRowid);
}

export function insertTake(
  db: DatabaseSync,
  input: {
    itemId: number;
    interest: string;
    take: string;
    evidenceKind: "scan_excerpt" | "read_record";
    readId?: number | null;
  },
): number | null {
  const existing: unknown = db
    .prepare("SELECT id, evidence_kind FROM cur_takes WHERE item_id = ?")
    .get(input.itemId);
  if (isRow(existing) && typeof existing.id === "number") {
    if (existing.evidence_kind === "scan_excerpt" && input.evidenceKind === "read_record") {
      db.prepare(
        `UPDATE cur_takes SET interest = ?, take = ?, created_at = ?,
                              evidence_kind = 'read_record', read_id = ?
         WHERE id = ?`,
      ).run(
        input.interest,
        input.take.trim().slice(0, 1000),
        new Date().toISOString(),
        input.readId ?? null,
        existing.id,
      );
      return existing.id;
    }
    return null;
  }
  const result = db
    .prepare(
      `INSERT INTO cur_takes
         (item_id, interest, take, created_at, evidence_kind, read_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.itemId,
      input.interest,
      input.take.trim().slice(0, 1000),
      new Date().toISOString(),
      input.evidenceKind,
      input.readId ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function listRecentItems(
  db: DatabaseSync,
  limit = 20,
): NuclearItem[] {
  const rows = db
    .prepare(
      `SELECT id, source_id, url, title, excerpt, interest, published_at,
              seen_at, score, status
       FROM cur_items
       ORDER BY seen_at DESC, score DESC
       LIMIT ?`,
    )
    .all(Math.max(1, Math.min(100, limit)))
    .map(mapItem)
    .filter((item): item is NuclearItem => item !== null);
  return rows;
}

export function listRecentTakes(
  db: DatabaseSync,
  limit = 12,
): NuclearTake[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.item_id, t.interest, t.take, t.created_at,
              i.title, i.url, t.evidence_kind, t.read_id
       FROM cur_takes t
       JOIN cur_items i ON i.id = t.item_id
       ORDER BY t.created_at DESC
       LIMIT ?`,
    )
    .all(Math.max(1, Math.min(100, limit)))
    .map(mapTake)
    .filter((take): take is NuclearTake => take !== null);
  return rows;
}

export function logProvenance(
  db: DatabaseSync,
  kind: NuclearProvenanceKind,
  detail: string,
  itemId: number | null = null,
): number {
  const result = db
    .prepare(
      `INSERT INTO cur_provenance (kind, item_id, detail, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(kind, itemId, detail.slice(0, 500), new Date().toISOString());
  return Number(result.lastInsertRowid);
}
