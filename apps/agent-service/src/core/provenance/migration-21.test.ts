/**
 * Regression coverage for the v21 provenance columns (Wave 2
 * time-shift isolation). Guards that the migration backfills existing
 * evidence rows to 'shadow' (strict isolation), admits the CHECK
 * constraint, and that fresh tables default to 'shadow'.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb, NUCLEAR_SUPPORTED_VERSION } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import { MIGRATION_21_PROVENANCE_DDL } from "./migration-21.js";

function openMigratedDb(): DatabaseSync {
  const continuity = openContinuityDb(new DatabaseSync(":memory:"));
  return openNuclearDb(new DatabaseSync(":memory:"), { continuity });
}

const PROVENANCE_TABLES = [
  "cur_takes",
  "cur_reads",
  "episodes",
  "learning_revisions",
  "cur_source_candidates",
];

function columnsOf(db: DatabaseSync, table: string): Array<{ name?: string }> {
  return db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
}

describe("migration-21 provenance (Wave 2 time-shift isolation)", () => {
  it("migrates a fresh database to nuclear schema v21 and adds provenance columns", () => {
    const db = openMigratedDb();
    expect(NUCLEAR_SUPPORTED_VERSION).toBe(21);
    for (const table of PROVENANCE_TABLES) {
      const names = new Set(columnsOf(db, table).map((column) => column.name));
      expect(names.has("provenance")).toBe(true);
    }
    db.close();
  });

  it("defaults new evidence rows to shadow and rejects unknown provenance values", () => {
    const db = openMigratedDb();
    db.prepare(
      `INSERT INTO cur_sources (slug, title, kind, url, interest, weight, enabled)
       VALUES ('audit', 'Audit', 'rss', 'https://example.com/feed', 'systems', 1, 1)`,
    ).run();
    const item = db.prepare(
      `INSERT INTO cur_items
         (source_id, url, url_key, title, excerpt, interest, seen_at, score, status)
       VALUES (1, 'https://example.com/a', 'https://example.com/a', 'A', 'E',
               'systems', '2026-08-08T00:00:00.000Z', 50, 'read')`,
    ).run();
    const take = db.prepare(
      `INSERT INTO cur_takes (item_id, interest, take, evidence_kind, created_at)
       VALUES (?, 'systems', 'default shadow take', 'scan_excerpt', '2026-08-08T00:00:00.000Z')`,
    ).run(Number(item.lastInsertRowid));
    const row = db.prepare(
      `SELECT provenance FROM cur_takes WHERE id = ?`,
    ).get(Number(take.lastInsertRowid)) as { provenance: string };
    expect(row.provenance).toBe("shadow");
    db.prepare(
      `UPDATE cur_takes SET provenance = 'live' WHERE id = ?`,
    ).run(Number(take.lastInsertRowid));
    expect(() =>
      db.prepare(
        `UPDATE cur_takes SET provenance = 'realtime' WHERE id = ?`,
      ).run(Number(take.lastInsertRowid)),
    ).toThrow(/CHECK constraint/);
    db.close();
  });

  it("backfills pre-existing evidence rows to shadow", () => {
    const db = openMigratedDb();
    db.exec(`
      DROP INDEX idx_cur_takes_provenance;
      DROP INDEX idx_cur_reads_provenance;
      DROP INDEX idx_episodes_provenance;
      DROP INDEX idx_learning_revisions_provenance;
      DROP INDEX idx_cur_source_candidates_provenance;
    `);
    for (const table of PROVENANCE_TABLES) {
      db.exec(`ALTER TABLE ${table} DROP COLUMN provenance`);
    }
    db.prepare(
      `INSERT INTO cur_sources (slug, title, kind, url, interest, weight, enabled)
       VALUES ('audit', 'Audit', 'rss', 'https://example.com/feed', 'systems', 1, 1)`,
    ).run();
    const item = db.prepare(
      `INSERT INTO cur_items
         (source_id, url, url_key, title, excerpt, interest, seen_at, score, status)
       VALUES (1, 'https://example.com/b', 'https://example.com/b', 'B', 'E',
               'systems', '2026-08-08T00:00:00.000Z', 50, 'read')`,
    ).run();
    db.prepare(
      `INSERT INTO cur_takes (item_id, interest, take, evidence_kind, created_at)
       VALUES (?, 'systems', 'pre-v21 take', 'scan_excerpt', '2026-08-08T00:00:00.000Z')`,
    ).run(Number(item.lastInsertRowid));
    db.exec(`INSERT INTO learning_revisions
       (owner_id, target_layer, target_key, previous_value, proposed_value,
        rationale, status, apply_after, created_at, updated_at)
       VALUES ('doc', 'dynamic_identity', 'interest.x', NULL, 'y', 'r',
               'proposed', '2026-08-08T00:00:00.000Z', '2026-08-08T00:00:00.000Z',
               '2026-08-08T00:00:00.000Z')`);
    db.exec(MIGRATION_21_PROVENANCE_DDL);
    for (const table of PROVENANCE_TABLES) {
      const rows = db.prepare(
        `SELECT provenance, COUNT(*) AS count FROM ${table} GROUP BY provenance`,
      ).all() as Array<{ provenance: string; count: number }>;
      if (rows.length === 0) continue;
      expect(rows).toEqual([{ provenance: "shadow", count: 1 }]);
    }
    db.close();
  });
});
