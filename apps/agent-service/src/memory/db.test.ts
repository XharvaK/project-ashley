import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";

const LATEST_VERSION = 17;

describe("migrate", () => {
  it("reaches the latest schema with habits, facts_cutoff and stances", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const cols = db
      .prepare(`PRAGMA table_info(mem_threads)`)
      .all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === "facts_cutoff_message_id")).toBe(true);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("mem_habits");
    expect(names).toContain("mem_reminders");
    expect(names).toContain("mem_pending_actions");
    expect(names).toContain("mem_stances");
    expect(names).toContain("mem_reflections");
    expect(names).toContain("mem_own_time_drafts");
    expect(names).toContain("mem_conversation_state");
    expect(names).toContain("ashley_taste_signals");
    expect(names).toContain("ashley_tastes");
    expect(names).toContain("ashley_captured_examples");
    expect(names).toContain("discord_gif_feedback");
    expect(names).toContain("discord_emoji_weights");
    expect(names).toContain("mem_stance_embeddings");
    const factCols = db
      .prepare(`PRAGMA table_info(mem_facts)`)
      .all() as Array<{ name: string }>;
    expect(factCols.some((c) => c.name === "access_count")).toBe(true);
    const version = db
      .prepare("PRAGMA user_version")
      .get() as { user_version: number };
    expect(version.user_version).toBe(LATEST_VERSION);
  });

  it("keeps queued jobs when the job_type constraint is rebuilt", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO mem_jobs (idempotency_key, owner_id, job_type, payload_json, created_at, updated_at)
       VALUES ('k1', 'o1', 'stances', '{}', ?, ?)`,
    ).run(now, now);
    const row = db
      .prepare(`SELECT job_type FROM mem_jobs WHERE idempotency_key = 'k1'`)
      .get() as { job_type: string };
    expect(row.job_type).toBe("stances");
  });

  it("migrates a partial v3 database idempotently", () => {
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
    const version = db
      .prepare("PRAGMA user_version")
      .get() as { user_version: number };
    expect(version.user_version).toBe(LATEST_VERSION);
  });
});
