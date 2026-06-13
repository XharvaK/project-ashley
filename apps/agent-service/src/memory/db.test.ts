import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";

describe("migrate v4", () => {
  it("adds facts_cutoff_message_id on fresh db", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const cols = db
      .prepare(`PRAGMA table_info(mem_threads)`)
      .all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === "facts_cutoff_message_id")).toBe(true);
    const version = db
      .prepare("PRAGMA user_version")
      .get() as { user_version: number };
    expect(version.user_version).toBe(4);
  });

  it("migrates v3 to v4 idempotently", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      PRAGMA user_version = 3;
      CREATE TABLE mem_threads (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        last_active_channel TEXT,
        hot_cutoff_message_id INTEGER,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL
      );
      CREATE TABLE mem_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    migrate(db);
    migrate(db);
    const cols = db
      .prepare(`PRAGMA table_info(mem_threads)`)
      .all() as Array<{ name: string }>;
    expect(cols.filter((c) => c.name === "facts_cutoff_message_id").length).toBe(
      1,
    );
  });
});
