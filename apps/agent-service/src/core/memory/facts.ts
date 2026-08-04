import type { DatabaseSync } from "node:sqlite";
import { newEntityUuid } from "../continuity/entity-uuid.js";
import { defaultUnclassifiedConversational } from "../privacy/classification.js";

export type FactCategory =
  | "project"
  | "preference"
  | "person"
  | "ongoing"
  | "pinned";

export type MemoryFact = {
  id: number;
  ownerId: string;
  category: FactCategory;
  key: string;
  value: string;
  confidence: number;
  importance: number;
  sourceMessageId: number | null;
  origin: "legacy" | "manual" | "explicit_user";
  sourceQuote: string | null;
  supersededBy: number | null;
  createdAt: string;
};

type FactInput = {
  ownerId: string;
  category: FactCategory;
  key: string;
  value: string;
  confidence?: number;
  importance?: number;
  sourceMessageId?: number | null;
  origin?: "legacy" | "manual" | "explicit_user";
  sourceQuote?: string | null;
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

function nullableNumber(value: unknown): number | null {
  return value == null ? null : numberValue(value);
}

export function literalLikePattern(value: string): string {
  return `%${value.trim().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function mapFact(row: unknown): MemoryFact | null {
  if (!isRow(row)) return null;
  const category = stringValue(row.category);
  if (
    category !== "project" &&
    category !== "preference" &&
    category !== "person" &&
    category !== "ongoing" &&
    category !== "pinned"
  ) {
    return null;
  }
  return {
    id: numberValue(row.id),
    ownerId: stringValue(row.owner_id),
    category,
    key: stringValue(row.key),
    value: stringValue(row.value),
    confidence: numberValue(row.confidence),
    importance: numberValue(row.importance),
    sourceMessageId: nullableNumber(row.source_message_id),
    origin:
      row.origin === "manual" || row.origin === "explicit_user"
        ? row.origin
        : "legacy",
    sourceQuote: typeof row.source_quote === "string" ? row.source_quote : null,
    supersededBy: nullableNumber(row.superseded_by),
    createdAt: stringValue(row.created_at),
  };
}

export function listActiveFacts(
  db: DatabaseSync,
  ownerId: string,
  limit = 40,
): MemoryFact[] {
  if (limit <= 0) return [];
  const rows = db
    .prepare(
      `SELECT id, owner_id, category, key, value, confidence, importance,
              source_message_id, origin, source_quote, superseded_by, created_at
       FROM mem_facts
       WHERE owner_id = ? AND superseded_by IS NULL
       ORDER BY importance DESC, id DESC
       LIMIT ?`,
    )
    .all(ownerId, Math.min(100, limit))
    .map(mapFact)
    .filter((fact): fact is MemoryFact => fact !== null);
  return rows;
}

export function listFactsMatchingTopic(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
): MemoryFact[] {
  const cleanTopic = topic.trim();
  if (!cleanTopic) return [];
  const pattern = literalLikePattern(cleanTopic);
  return db.prepare(
    `SELECT id, owner_id, category, key, value, confidence, importance,
            source_message_id, origin, source_quote, superseded_by, created_at
     FROM mem_facts
     WHERE owner_id = ? AND superseded_by IS NULL
       AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\'
            OR category LIKE ? ESCAPE '\\')
     ORDER BY id DESC`,
  ).all(ownerId, pattern, pattern, pattern)
    .map(mapFact)
    .filter((fact): fact is MemoryFact => fact !== null);
}

export function upsertFact(db: DatabaseSync, input: FactInput): number;
export function upsertFact(
  db: DatabaseSync,
  ownerId: string,
  category: FactCategory,
  key: string,
  value: string,
  confidence?: number,
  importance?: number,
  sourceMessageId?: number | null,
): number;
export function upsertFact(
  db: DatabaseSync,
  inputOrOwner: FactInput | string,
  category?: FactCategory,
  key?: string,
  value?: string,
  confidence = 0.8,
  importance = 50,
  sourceMessageId: number | null = null,
): number {
  const input: FactInput =
    typeof inputOrOwner === "string"
      ? {
          ownerId: inputOrOwner,
          category: category ?? "ongoing",
          key: key ?? "",
          value: value ?? "",
          confidence,
          importance,
          sourceMessageId,
        }
      : inputOrOwner;
  const cleanKey = input.key.trim();
  const cleanValue = input.value.trim();
  if (!cleanKey || !cleanValue) return 0;
  const existing: unknown = db
    .prepare(
      `SELECT id, value
       FROM mem_facts
       WHERE owner_id = ? AND category = ? AND key = ? AND superseded_by IS NULL
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(input.ownerId, input.category, cleanKey);
  const boundedConfidence = Math.max(0, Math.min(1, input.confidence ?? 0.8));
  const boundedImportance = Math.max(
    0,
    Math.min(100, Math.round(input.importance ?? 50)),
  );
  if (
    isRow(existing) &&
    typeof existing.id === "number" &&
    input.origin === "explicit_user" &&
    stringValue(existing.value).toLocaleLowerCase() === cleanValue.toLocaleLowerCase()
  ) {
    return existing.id;
  }
  if (
    isRow(existing) &&
    typeof existing.id === "number" &&
    input.origin !== "explicit_user"
  ) {
    db.prepare(
      `UPDATE mem_facts
       SET value = ?, confidence = ?, importance = ?, source_message_id = ?,
           origin = ?, source_quote = ?
       WHERE id = ?`,
    ).run(
      cleanValue,
      boundedConfidence,
      boundedImportance,
      input.sourceMessageId ?? null,
      input.origin ?? "legacy",
      input.sourceQuote ?? null,
      existing.id,
    );
    return existing.id;
  }
  const hasUuid = db
    .prepare(`PRAGMA table_info(mem_facts)`)
    .all()
    .some((row) => (row as { name?: string }).name === "entity_uuid");
  const result = hasUuid
    ? db
        .prepare(
          `INSERT INTO mem_facts
         (owner_id, category, key, value, confidence, importance,
          source_message_id, origin, source_quote, superseded_by, created_at,
          entity_uuid, data_classification)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        )
        .run(
          input.ownerId,
          input.category,
          cleanKey,
          cleanValue,
          boundedConfidence,
          boundedImportance,
          input.sourceMessageId ?? null,
          input.origin ?? "legacy",
          input.sourceQuote ?? null,
          new Date().toISOString(),
          newEntityUuid(),
          defaultUnclassifiedConversational(),
        )
    : db
        .prepare(
          `INSERT INTO mem_facts
         (owner_id, category, key, value, confidence, importance,
          source_message_id, origin, source_quote, superseded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .run(
          input.ownerId,
          input.category,
          cleanKey,
          cleanValue,
          boundedConfidence,
          boundedImportance,
          input.sourceMessageId ?? null,
          input.origin ?? "legacy",
          input.sourceQuote ?? null,
          new Date().toISOString(),
        );
  const insertedId = Number(result.lastInsertRowid);
  if (isRow(existing) && typeof existing.id === "number") {
    db.prepare(
      "UPDATE mem_facts SET superseded_by = ? WHERE id = ? AND superseded_by IS NULL",
    ).run(insertedId, existing.id);
  }
  return insertedId;
}

export function forgetByTopic(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
): number {
  const cleanTopic = topic.trim();
  if (!cleanTopic) return 0;
  const ids = listFactsMatchingTopic(db, ownerId, cleanTopic)
    .map((fact) => fact.id);
  const update = db.prepare(
    `UPDATE mem_facts SET superseded_by = ? WHERE id = ? AND owner_id = ?`,
  );
  for (const id of ids) update.run(id, id, ownerId);
  return ids.length;
}
