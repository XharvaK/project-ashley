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
  it("creates the Reflection v1 schema for a fresh database", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));

    expect(schemaVersion(db)).toBe(2);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN ('reflection_events', 'initiative_learning')
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual([
      "initiative_learning",
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
      INSERT INTO decision_log
        (owner_id, channel, trigger, decision_kind, motivation_ids_json,
         reason, outcome_text, created_at)
      VALUES
        ('doc', 'discord', 'reactive', 'speak', '[]',
         'existing decision', 'existing outcome', '2026-01-01T00:00:00.000Z');
      PRAGMA user_version = 1;
    `);

    openNuclearDb(db);

    expect(schemaVersion(db)).toBe(2);
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
});
