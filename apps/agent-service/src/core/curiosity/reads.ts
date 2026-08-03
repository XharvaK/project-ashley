import type { DatabaseSync } from "node:sqlite";

export type ReadRecord = {
  id: number;
  itemId: number;
  finalUrl: string;
  contentHash: string;
  retrievedAt: string;
  model: string;
  modelMetadata: Record<string, unknown>;
  evidenceExcerpts: string[];
  cleanedChars: number;
  title: string;
  interest: string;
};

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isRow(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseExcerpts(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapRead(value: unknown): ReadRecord | null {
  if (!isRow(value)) return null;
  return {
    id: Number(value.id),
    itemId: Number(value.item_id),
    finalUrl: String(value.final_url ?? ""),
    contentHash: String(value.content_hash ?? ""),
    retrievedAt: String(value.retrieved_at ?? ""),
    model: String(value.model ?? ""),
    modelMetadata: parseObject(value.model_metadata_json),
    evidenceExcerpts: parseExcerpts(value.evidence_excerpts_json),
    cleanedChars: Number(value.cleaned_chars ?? 0),
    title: String(value.title ?? ""),
    interest: String(value.interest ?? ""),
  };
}

export function recordSuccessfulRead(
  db: DatabaseSync,
  input: {
    itemId: number;
    finalUrl: string;
    contentHash: string;
    retrievedAt?: string;
    model: string;
    modelMetadata?: Record<string, unknown>;
    evidenceExcerpts: string[];
    cleanedChars: number;
  },
): number {
  const finalUrl = input.finalUrl.trim().slice(0, 2000);
  const hash = input.contentHash.trim().toLowerCase();
  const model = input.model.trim().slice(0, 200);
  if (!finalUrl || !/^[a-f0-9]{64}$/.test(hash) || !model) return 0;
  const excerpts = input.evidenceExcerpts
    .map((excerpt) => excerpt.replace(/\s+/g, " ").trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 6);
  if (excerpts.length === 0) return 0;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO cur_reads
       (item_id, final_url, content_hash, retrieved_at, model,
        model_metadata_json, evidence_excerpts_json, cleaned_chars, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       final_url = excluded.final_url,
       content_hash = excluded.content_hash,
       retrieved_at = excluded.retrieved_at,
       model = excluded.model,
       model_metadata_json = excluded.model_metadata_json,
       evidence_excerpts_json = excluded.evidence_excerpts_json,
       cleaned_chars = excluded.cleaned_chars`,
  ).run(
    input.itemId,
    finalUrl,
    hash,
    input.retrievedAt ?? now,
    model,
    JSON.stringify(input.modelMetadata ?? {}),
    JSON.stringify(excerpts),
    Math.max(0, Math.min(50_000, Math.trunc(input.cleanedChars))),
    now,
  );
  const existing = db.prepare(
    "SELECT id FROM cur_reads WHERE item_id = ?",
  ).get(input.itemId) as { id?: number } | undefined;
  return Number(existing?.id ?? 0);
}

export function listRecentReads(
  db: DatabaseSync,
  limit = 12,
): ReadRecord[] {
  return db.prepare(
    `SELECT r.id, r.item_id, r.final_url, r.content_hash, r.retrieved_at,
            r.model, r.model_metadata_json, r.evidence_excerpts_json,
            r.cleaned_chars, i.title, i.interest
     FROM cur_reads r
     JOIN cur_items i ON i.id = r.item_id
     ORDER BY r.retrieved_at DESC, r.id DESC
     LIMIT ?`,
  ).all(Math.max(1, Math.min(100, limit)))
    .map(mapRead)
    .filter((record): record is ReadRecord => record !== null);
}
