import type { DatabaseSync } from "node:sqlite";

export function getKv(db: DatabaseSync, key: string): string | null {
  const row = db
    .prepare(`SELECT value FROM mem_kv WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setKv(db: DatabaseSync, key: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(key, value, now);
}

export function deleteKv(db: DatabaseSync, key: string): void {
  db.prepare(`DELETE FROM mem_kv WHERE key = ?`).run(key);
}
