import type { DatabaseSync } from "node:sqlite";
import type { MemFact } from "./types.js";
import { getDenylist, isTextDenied } from "./correction-denylist.js";

export function filterFactsByDenylist<T extends { key: string; value: string }>(
  facts: T[],
  denylist: string[],
): T[] {
  if (denylist.length === 0) return facts;
  return facts.filter((f) => !isTextDenied(`${f.key} ${f.value}`, denylist));
}

export function filterTextByDenylist(
  text: string | null | undefined,
  denylist: string[],
): string | null {
  if (!text?.trim() || denylist.length === 0) return text?.trim() ?? null;
  if (isTextDenied(text, denylist)) return null;
  return text.trim();
}

export function purgeDeniedTopics(
  db: DatabaseSync,
  ownerId: string,
  topics: string[],
): void {
  if (topics.length === 0) return;
  const denylist = topics;
  const now = new Date().toISOString();

  const facts = db
    .prepare(
      `SELECT id, key, value FROM mem_facts
       WHERE owner_id = ? AND superseded_by IS NULL`,
    )
    .all(ownerId) as Array<{ id: number; key: string; value: string }>;

  for (const f of facts) {
    if (isTextDenied(`${f.key} ${f.value}`, denylist)) {
      db.prepare(`UPDATE mem_facts SET superseded_by = id WHERE id = ?`).run(
        f.id,
      );
    }
  }

  for (const topic of topics) {
    const like = `%${escapeLike(topic.toLowerCase())}%`;
    db.prepare(
      `UPDATE mem_chunks SET deleted_at = ? WHERE owner_id = ? AND LOWER(text) LIKE ? AND deleted_at IS NULL`,
    ).run(now, ownerId, like);
  }

  const summaries = db
    .prepare(
      `SELECT id, thread_id, text FROM mem_summaries WHERE is_active = 1`,
    )
    .all() as Array<{ id: number; thread_id: string; text: string }>;

  for (const s of summaries) {
    const thread = db
      .prepare(`SELECT owner_id FROM mem_threads WHERE id = ?`)
      .get(s.thread_id) as { owner_id: string } | undefined;
    if (thread?.owner_id !== ownerId) continue;
    if (!isTextDenied(s.text, denylist)) continue;
    db.prepare(`UPDATE mem_summaries SET is_active = 0 WHERE id = ?`).run(
      s.id,
    );
  }
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

export function getOwnerDenylist(db: DatabaseSync, ownerId: string): string[] {
  return getDenylist(db, ownerId);
}

export type { MemFact };
