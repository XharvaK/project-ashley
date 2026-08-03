import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "./db.js";

function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  return row.user_version;
}

describe("nuclear database migrations", () => {
  it("creates the cognition and Reflection schemas for a fresh database", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));

    expect(schemaVersion(db)).toBe(4);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN (
           'reflection_events', 'initiative_learning', 'episodes',
           'mind_state_items', 'affective_state', 'cognitive_jobs',
           'learning_revisions'
         )
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual([
      "affective_state",
      "cognitive_jobs",
      "episodes",
      "initiative_learning",
      "learning_revisions",
      "mind_state_items",
      "reflection_events",
    ]);

    db.close();
  });

  it("upgrades a populated v1 decision log without losing data", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE decision_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        trigger TEXT NOT NULL,
        decision_kind TEXT NOT NULL,
        motivation_ids_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        outcome_text TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE mem_threads (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        status TEXT NOT NULL,
        channel TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE mem_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL REFERENCES mem_threads(id),
        owner_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        channel TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE mem_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id TEXT NOT NULL,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL NOT NULL,
        importance INTEGER NOT NULL,
        source_message_id INTEGER,
        superseded_by INTEGER,
        created_at TEXT NOT NULL
      );
      INSERT INTO decision_log
        (owner_id, channel, trigger, decision_kind, motivation_ids_json,
         reason, outcome_text, created_at)
      VALUES
        ('doc', 'discord', 'reactive', 'speak', '[]',
         'existing decision', 'existing outcome', '2026-01-01T00:00:00.000Z');
      PRAGMA user_version = 1;
    `);

    openNuclearDb(db);

    expect(schemaVersion(db)).toBe(4);
    const decision = db
      .prepare(
        `SELECT reason, outcome_text, learning_subject_kind,
                learning_adjustment, learning_through_event_id
         FROM decision_log WHERE id = 1`,
      )
      .get() as Record<string, unknown>;
    expect(decision).toMatchObject({
      reason: "existing decision",
      outcome_text: "existing outcome",
      learning_subject_kind: null,
      learning_adjustment: 0,
      learning_through_event_id: null,
    });

    db.close();
  });

  it("upgrades v3 cognition rows with safe v4 lifecycle defaults", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE decision_log (
        id INTEGER PRIMARY KEY, owner_id TEXT, channel TEXT, trigger TEXT,
        decision_kind TEXT, motivation_ids_json TEXT, reason TEXT,
        learning_subject_kind TEXT, learning_adjustment REAL,
        learning_through_event_id INTEGER, objective TEXT,
        evidence_refs_json TEXT, effort TEXT, completion TEXT,
        uncertainty REAL, urgency REAL, affect_license_json TEXT,
        outcome_text TEXT, created_at TEXT
      );
      CREATE TABLE mind_state_items (
        id INTEGER PRIMARY KEY, owner_id TEXT, kind TEXT, text TEXT,
        source_type TEXT, source_id TEXT, activation REAL, urgency REAL,
        status TEXT, due_at TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE mem_facts (
        id INTEGER PRIMARY KEY, owner_id TEXT, category TEXT, key TEXT,
        value TEXT, confidence REAL, importance INTEGER,
        source_message_id INTEGER, superseded_by INTEGER, created_at TEXT
      );
      CREATE TABLE episodes (id INTEGER PRIMARY KEY, owner_id TEXT,
        thread_id TEXT, summary TEXT, entities TEXT,
        source_start_message_id INTEGER, source_end_message_id INTEGER,
        salience REAL, unresolved INTEGER, status TEXT,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE cognitive_runs (
        id INTEGER PRIMARY KEY, job_id INTEGER, owner_id TEXT, kind TEXT,
        model TEXT, input_json TEXT, output_json TEXT, status TEXT,
        error TEXT, created_at TEXT
      );
      CREATE TABLE learning_revisions (
        id INTEGER PRIMARY KEY, owner_id TEXT, target_layer TEXT,
        target_key TEXT, previous_value TEXT, proposed_value TEXT,
        rationale TEXT, status TEXT, apply_after TEXT, applied_at TEXT,
        reverted_at TEXT, created_at TEXT, updated_at TEXT
      );
      INSERT INTO mind_state_items VALUES
        (1, 'doc', 'concern', 'urgent', 'episode', '1', 1, 0.9,
         'active', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        (2, 'doc', 'interest', 'quiet', 'episode', '2', 0.5, 0.2,
         'active', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO mem_facts VALUES
        (1, 'doc', 'project', 'name', 'Ashley', 1, 80, NULL, NULL,
         '2026-01-01T00:00:00.000Z');
      PRAGMA user_version = 3;
    `);

    openNuclearDb(db);

    expect(schemaVersion(db)).toBe(4);
    expect(db.prepare(
      "SELECT wake_state FROM mind_state_items WHERE id = 1",
    ).get()).toMatchObject({ wake_state: "pending" });
    expect(db.prepare(
      "SELECT wake_state FROM mind_state_items WHERE id = 2",
    ).get()).toMatchObject({ wake_state: "consumed" });
    expect(db.prepare(
      "SELECT origin FROM mem_facts WHERE id = 1",
    ).get()).toMatchObject({ origin: "legacy" });
    db.close();
  });
});
