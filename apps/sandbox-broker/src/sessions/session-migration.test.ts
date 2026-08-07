import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BROKER_SESSION_SCHEMA_VERSION,
  MIGRATION_1_SESSION_LEDGER_DDL,
  MIGRATION_2_SESSION_LEDGER_DDL,
  MIGRATION_3_SESSION_LEDGER_DDL,
  migrateBrokerSessionSchema,
} from "./session-migration.js";

function freshDb(): { db: DatabaseSync; close: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "ashley-migration-"));
  const db = new DatabaseSync(path.join(dir, "migration.db"));
  return {
    db,
    close: () => {
      try {
        db.close();
      } catch {
        // already closed
      }
    },
  };
}

describe("session-migration", () => {
  it("migrates a fresh database to the supported version", () => {
    const { db, close } = freshDb();
    const result = migrateBrokerSessionSchema(db);
    expect(result).toEqual({ ok: true, version: BROKER_SESSION_SCHEMA_VERSION });
    const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
    expect(Number(row.user_version)).toBe(BROKER_SESSION_SCHEMA_VERSION);
    close();
  });

  it("creates the session tables", () => {
    const { db, close } = freshDb();
    migrateBrokerSessionSchema(db);
    const tables = (db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sandbox_%'")
      .all() as Array<{ name: string }>).map((r) => r.name).sort();
    expect(tables).toEqual([
      "sandbox_capability_uses",
      "sandbox_session_authorizations",
      "sandbox_session_events",
      "sandbox_sessions",
    ]);
    close();
  });

  it("is idempotent across repeated migrations", () => {
    const { db, close } = freshDb();
    expect(migrateBrokerSessionSchema(db).ok).toBe(true);
    expect(migrateBrokerSessionSchema(db).ok).toBe(true);
    expect(migrateBrokerSessionSchema(db).ok).toBe(true);
    close();
  });

  it("fails closed on a future schema version", () => {
    const { db, close } = freshDb();
    migrateBrokerSessionSchema(db);
    db.exec(`PRAGMA user_version = ${BROKER_SESSION_SCHEMA_VERSION + 1}`);
    const result = migrateBrokerSessionSchema(db);
    expect(result).toMatchObject({ ok: false, errorCode: "schema_version_future" });
    close();
  });

  it("rolls back DDL when migration fails midway", () => {
    const { db, close } = freshDb();
    db.exec("CREATE TABLE sandbox_sessions (wrong_column TEXT)");
    const result = migrateBrokerSessionSchema(db);
    expect(result).toMatchObject({ ok: false, errorCode: "migration_failed" });
    const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
    expect(Number(row.user_version)).toBe(0);
    const leftovers = (db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sandbox_%'")
      .all() as Array<{ name: string }>).map((r) => r.name);
    expect(leftovers).toEqual(["sandbox_sessions"]);
    close();
  });

  it("enforces the session role and state check constraints", () => {
    const { db, close } = freshDb();
    migrateBrokerSessionSchema(db);
    const insert = db.prepare(`
      INSERT INTO sandbox_sessions (
        session_uuid, owner_id, proposal_id, role, state, policy_id,
        policy_version, policy_hash, delegated_signer_key_id,
        capability_signing_key_id, allowed_capabilities_json,
        max_tool_executions, tool_executions_used, created_at, expires_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    expect(() =>
      insert.run(
        "s1", "owner-1", "p1", "sandbox_operator_light", "created", "policy-1",
        1, "f".repeat(64), "k1", "k2", "[]", 10, 0, "2026-08-05T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z", 1,
      ),
    ).not.toThrow();
    expect(() =>
      insert.run(
        "s2", "owner-1", "p1", "sandbox_root", "created", "policy-1",
        1, "f".repeat(64), "k1", "k2", "[]", 10, 0, "2026-08-05T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z", 1,
      ),
    ).toThrow();
    expect(() =>
      insert.run(
        "s3", "owner-1", "p1", "sandbox_operator_light", "ghost", "policy-1",
        1, "f".repeat(64), "k1", "k2", "[]", 10, 0, "2026-08-05T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z", 1,
      ),
    ).toThrow();
    close();
  });

  it("exports the DDL constant with all statements", () => {
    expect(MIGRATION_1_SESSION_LEDGER_DDL.length).toBeGreaterThan(0);
    const all = [...MIGRATION_1_SESSION_LEDGER_DDL, ...MIGRATION_2_SESSION_LEDGER_DDL].join(" ");
    expect(all).toContain("CREATE TABLE IF NOT EXISTS sandbox_sessions");
    expect(all).toContain("CREATE TABLE IF NOT EXISTS sandbox_session_events");
    expect(all).toContain("CREATE TABLE IF NOT EXISTS sandbox_session_authorizations");
    expect(all).toContain("CREATE TABLE IF NOT EXISTS sandbox_capability_uses");
  });

  it("migration 3 preserves capability-use rows when upgrading an existing store", () => {
    const { db, close } = freshDb();
    migrateBrokerSessionSchema(db);
    const insertSession = db.prepare(`
      INSERT INTO sandbox_sessions (
        session_uuid, owner_id, proposal_id, role, state, policy_id,
        policy_version, policy_hash, delegated_signer_key_id,
        capability_signing_key_id, allowed_capabilities_json,
        max_tool_executions, tool_executions_used, created_at, expires_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSession.run(
      "s1", "owner-1", "p1", "sandbox_operator_light", "active", "policy-1",
      1, "f".repeat(64), "k1", "k2", "[\"approved_project_read\"]", 10, 1,
      "2026-08-05T00:00:00.000Z", "2026-08-06T00:00:00.000Z", 2,
    );
    db.prepare(
      `INSERT INTO sandbox_capability_uses
         (capability_use_id, session_uuid, capability, policy_hash, outcome, issued_at, consumed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "u1", "s1", "approved_project_read", "f".repeat(64), "succeeded",
      "2026-08-05T00:00:00.000Z", "2026-08-05T00:00:01.000Z",
    );
    // Simulate the pre-v3 schema: force a downgrade then re-upgrade.
    db.exec(`PRAGMA user_version = ${BROKER_SESSION_SCHEMA_VERSION - 1}`);
    expect(migrateBrokerSessionSchema(db)).toEqual({
      ok: true,
      version: BROKER_SESSION_SCHEMA_VERSION,
    });
    const row = db
      .prepare(
        `SELECT capability_use_id, session_uuid, capability, policy_hash, outcome,
                issued_at, consumed_at
         FROM sandbox_capability_uses WHERE capability_use_id = 'u1'`,
      )
      .get() as { capability_use_id: string; session_uuid: string; outcome: string; consumed_at: string };
    expect(row.capability_use_id).toBe("u1");
    expect(row.session_uuid).toBe("s1");
    expect(row.outcome).toBe("succeeded");
    expect(row.consumed_at).toBe("2026-08-05T00:00:01.000Z");
    close();
  });

  it("migration 3 accepts the interrupted outcome", () => {
    const { db, close } = freshDb();
    migrateBrokerSessionSchema(db);
    db.prepare(`
      INSERT INTO sandbox_sessions (
        session_uuid, owner_id, proposal_id, role, state, policy_id,
        policy_version, policy_hash, delegated_signer_key_id,
        capability_signing_key_id, allowed_capabilities_json,
        max_tool_executions, tool_executions_used, created_at, expires_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "s1", "owner-1", "p1", "sandbox_operator_light", "active", "policy-1",
      1, "f".repeat(64), "k1", "k2", "[\"approved_project_read\"]", 10, 1,
      "2026-08-05T00:00:00.000Z", "2026-08-06T00:00:00.000Z", 2,
    );
    expect(() =>
      db.prepare(
        `INSERT INTO sandbox_capability_uses
           (capability_use_id, session_uuid, capability, policy_hash, outcome, issued_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        "u1", "s1", "approved_project_read", "f".repeat(64), "interrupted",
        "2026-08-05T00:00:00.000Z",
      ),
    ).not.toThrow();
    const before = db.prepare("SELECT COUNT(*) AS n FROM sandbox_capability_uses").get() as {
      n: number;
    };
    expect(Number(before.n)).toBe(1);
    // The pre-v3 check rejected non-list outcomes; ensure a re-upgrade still
    // accepts 'interrupted' (table rebuilt again).
    db.exec(`PRAGMA user_version = ${BROKER_SESSION_SCHEMA_VERSION - 1}`);
    migrateBrokerSessionSchema(db);
    const after = db.prepare("SELECT COUNT(*) AS n FROM sandbox_capability_uses").get() as {
      n: number;
    };
    expect(Number(after.n)).toBe(1);
    close();
  });

  it("migration 3 exports rebuild statements", () => {
    const all = MIGRATION_3_SESSION_LEDGER_DDL.join(" ");
    expect(all).toContain("ALTER TABLE sandbox_capability_uses RENAME");
    expect(all).toContain("interrupted");
    expect(all).toContain("idx_sandbox_capability_uses_session");
  });
});
