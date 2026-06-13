import type { DatabaseSync } from "node:sqlite";
import type { FactInput, MemFact } from "./types.js";
import {
  addToDenylist,
  getDenylist,
  isTextDenied,
} from "./correction-denylist.js";
import { FACT_MIN_CONFIDENCE } from "./consolidator-triggers.js";

const CATEGORY_IMPORTANCE: Record<MemFact["category"], number> = {
  pinned: 100,
  ongoing: 70,
  project: 60,
  person: 55,
  preference: 50,
};

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

export function listActiveFacts(
  db: DatabaseSync,
  ownerId: string,
  limit = 40,
  includePrivate = false,
): MemFact[] {
  const rows = db
    .prepare(
      `SELECT * FROM mem_facts
       WHERE owner_id = ? AND superseded_by IS NULL
         AND (valid_until IS NULL OR valid_until > datetime('now'))
       ORDER BY importance DESC, last_confirmed_at DESC
       LIMIT ?`,
    )
    .all(ownerId, limit) as MemFact[];

  if (includePrivate) return rows;
  return rows.filter((f) => f.sensitivity !== "private");
}

export function pinFact(
  db: DatabaseSync,
  ownerId: string,
  text: string,
  sensitivity: MemFact["sensitivity"] = "none",
): { key: string; value: string } | null {
  const denylist = getDenylist(db, ownerId);
  if (isTextDenied(text, denylist)) return null;

  const key = `pinned_${Date.now()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_facts (owner_id, category, key, value, confidence, importance, sensitivity, last_confirmed_at, created_at)
     VALUES (?, 'pinned', ?, ?, 1.0, 100, ?, ?, ?)`,
  ).run(ownerId, key, text, sensitivity, now, now);
  return { key, value: text };
}

export function mergeFacts(
  db: DatabaseSync,
  ownerId: string,
  facts: FactInput[],
  sourceMessageId?: number | null,
): number {
  const denylist = getDenylist(db, ownerId);
  const now = new Date().toISOString();
  let merged = 0;

  for (const f of facts) {
    if (f.category === "pinned") continue;
    if (f.confidence < FACT_MIN_CONFIDENCE) continue;
    if (isTextDenied(`${f.key} ${f.value}`, denylist)) continue;

    const existing = db
      .prepare(
        `SELECT id, category FROM mem_facts
         WHERE owner_id = ? AND category = ? AND key = ? AND superseded_by IS NULL`,
      )
      .get(ownerId, f.category, f.key) as
      | { id: number; category: MemFact["category"] }
      | undefined;

    const importance = Math.round(
      CATEGORY_IMPORTANCE[f.category] * f.confidence,
    );

    let newId: number;

    if (existing) {
      if (existing.category === "pinned") continue;
      const result = db
        .prepare(
          `INSERT INTO mem_facts (owner_id, category, key, value, confidence, importance, sensitivity, valid_until, source_message_id, last_confirmed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          f.category,
          f.key,
          f.value,
          f.confidence,
          importance,
          f.sensitivity ?? "none",
          f.valid_until ?? null,
          sourceMessageId ?? null,
          now,
          now,
        );
      newId = Number(result.lastInsertRowid);
      db.prepare(`UPDATE mem_facts SET superseded_by = ? WHERE id = ?`).run(
        newId,
        existing.id,
      );
    } else {
      const result = db
        .prepare(
          `INSERT INTO mem_facts (owner_id, category, key, value, confidence, importance, sensitivity, valid_until, source_message_id, last_confirmed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          f.category,
          f.key,
          f.value,
          f.confidence,
          importance,
          f.sensitivity ?? "none",
          f.valid_until ?? null,
          sourceMessageId ?? null,
          now,
          now,
        );
      newId = Number(result.lastInsertRowid);
    }

    if (f.supersedes_key) {
      const old = db
        .prepare(
          `SELECT id FROM mem_facts
           WHERE owner_id = ? AND category = ? AND key = ? AND superseded_by IS NULL AND id != ?`,
        )
        .get(ownerId, f.category, f.supersedes_key, newId) as
        | { id: number }
        | undefined;
      if (old) {
        db.prepare(`UPDATE mem_facts SET superseded_by = ? WHERE id = ?`).run(
          newId,
          old.id,
        );
      }
    }
    merged += 1;
  }
  return merged;
}

export function forgetByTopic(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
  confirmed: boolean,
): { preview: string[]; deleted: number } {
  const safe = escapeLike(topic.toLowerCase());
  if (!safe || safe === "%" || safe === "%%") {
    return { preview: [], deleted: 0 };
  }
  const like = `%${safe}%`;
  const rows = db
    .prepare(
      `SELECT id, key, value FROM mem_facts
       WHERE owner_id = ? AND superseded_by IS NULL
         AND (LOWER(key) LIKE ? ESCAPE '\\' OR LOWER(value) LIKE ? ESCAPE '\\')`,
    )
    .all(ownerId, like, like) as Array<{
    id: number;
    key: string;
    value: string;
  }>;

  const preview = rows.map((r) => `${r.key}: ${r.value}`);
  if (!confirmed) return { preview, deleted: 0 };

  const now = new Date().toISOString();
  for (const r of rows) {
    db.prepare(`UPDATE mem_facts SET superseded_by = id WHERE id = ?`).run(
      r.id,
    );
  }

  db.prepare(
    `UPDATE mem_chunks SET deleted_at = ? WHERE owner_id = ? AND LOWER(text) LIKE ? ESCAPE '\\' AND deleted_at IS NULL`,
  ).run(now, ownerId, like);

  addToDenylist(db, ownerId, [topic]);

  return { preview, deleted: rows.length };
}

export function getActiveSummary(
  db: DatabaseSync,
  threadId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT text FROM mem_summaries WHERE thread_id = ? AND is_active = 1 LIMIT 1`,
    )
    .get(threadId) as { text: string } | undefined;
  return row?.text ?? null;
}
