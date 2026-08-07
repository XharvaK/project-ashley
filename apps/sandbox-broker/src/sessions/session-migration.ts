/**
 * Broker session ledger schema migration (Sandbox Wave 4, Commit 8).
 *
 * The broker's durable store (DurableBrokerStore, node:sqlite) has no schema
 * tracking of its own; this module introduces a broker-local versioned
 * migration keyed by `PRAGMA user_version`. The version numbering is
 * unrelated to the agent-service nuclear schema versions (a separate store).
 *
 * Migration is idempotent (CREATE TABLE IF NOT EXISTS) and fails closed on
 * unknown/future schema versions. Transactions are written or fully rolled
 * back.
 */

import { type DatabaseSync } from "node:sqlite";

export const BROKER_SESSION_SCHEMA_VERSION = 3;

/**
 * Broker session ledger migrations. Each version's DDL is applied in order
 * when upgrading; every statement is idempotent (CREATE TABLE IF NOT EXISTS).
 * `MIGRATION_2` adds the owner-authorization ledger that Commit 11 requires
 * for broker-recorded owner resumes. `MIGRATION_3` adds the `interrupted`
 * capability-use outcome (broker restart recovery) by rebuilding the
 * capability-uses table.
 */
export const MIGRATION_2_SESSION_LEDGER_DDL: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS sandbox_session_authorizations (
    authorization_id TEXT PRIMARY KEY,
    session_uuid TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    policy_hash TEXT NOT NULL,
    authorized_at_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_uuid) REFERENCES sandbox_sessions(session_uuid)
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_sandbox_session_authorizations_session
    ON sandbox_session_authorizations (session_uuid, authorized_at_ms);
  `,
];

/**
 * `MIGRATION_3` extends capability-use outcomes with `interrupted` so a broker
 * restart can durably mark reservations that were consumed but never
 * finalized. SQLite cannot alter a CHECK constraint in place, so the
 * `sandbox_capability_uses` table is rebuilt (data preserved, indexes
 * recreated) inside the same transaction as the version bump.
 */
export const MIGRATION_3_SESSION_LEDGER_DDL: readonly string[] = [
  `
  DROP INDEX IF EXISTS idx_sandbox_capability_uses_session;
  `,
  `
  ALTER TABLE sandbox_capability_uses RENAME TO sandbox_capability_uses_old;
  `,
  `
  CREATE TABLE sandbox_capability_uses (
    capability_use_id TEXT PRIMARY KEY,
    session_uuid TEXT NOT NULL,
    capability TEXT NOT NULL,
    policy_hash TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'reserved'
      CHECK (outcome IN ('reserved','succeeded','failed','cancelled','interrupted')),
    issued_at TEXT NOT NULL,
    consumed_at TEXT,
    FOREIGN KEY (session_uuid) REFERENCES sandbox_sessions(session_uuid)
  );
  `,
  `
  INSERT INTO sandbox_capability_uses
    (capability_use_id, session_uuid, capability, policy_hash, outcome, issued_at, consumed_at)
  SELECT capability_use_id, session_uuid, capability, policy_hash, outcome, issued_at, consumed_at
  FROM sandbox_capability_uses_old;
  `,
  `
  DROP TABLE sandbox_capability_uses_old;
  `,
  `
  CREATE INDEX idx_sandbox_capability_uses_session
    ON sandbox_capability_uses (session_uuid);
  `,
];

export const MIGRATION_1_SESSION_LEDGER_DDL: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS sandbox_sessions (
    session_uuid TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('sandbox_operator_light','sandbox_operator_deep')),
    state TEXT NOT NULL CHECK (state IN ('created','active','awaiting_owner','completed','aborted','expired')),
    policy_id TEXT NOT NULL,
    policy_version INTEGER NOT NULL,
    policy_hash TEXT NOT NULL,
    delegated_signer_key_id TEXT NOT NULL,
    capability_signing_key_id TEXT NOT NULL,
    workspace_id TEXT,
    workspace_manifest_hash TEXT,
    allowed_capabilities_json TEXT NOT NULL,
    max_tool_executions INTEGER NOT NULL,
    tool_executions_used INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    activated_at TEXT,
    expires_at TEXT NOT NULL,
    completed_at TEXT,
    aborted_at TEXT,
    revision INTEGER NOT NULL
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_owner_state
    ON sandbox_sessions (owner_id, state);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_policy
    ON sandbox_sessions (policy_id, policy_version);
  `,
  `
  CREATE TABLE IF NOT EXISTS sandbox_session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_uuid TEXT NOT NULL UNIQUE,
    session_uuid TEXT NOT NULL,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_uuid) REFERENCES sandbox_sessions(session_uuid)
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_sandbox_session_events_session
    ON sandbox_session_events (session_uuid, id);
  `,
  `
  CREATE TABLE IF NOT EXISTS sandbox_capability_uses (
    capability_use_id TEXT PRIMARY KEY,
    session_uuid TEXT NOT NULL,
    capability TEXT NOT NULL,
    policy_hash TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'reserved'
      CHECK (outcome IN ('reserved','succeeded','failed','cancelled')),
    issued_at TEXT NOT NULL,
    consumed_at TEXT,
    FOREIGN KEY (session_uuid) REFERENCES sandbox_sessions(session_uuid)
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_sandbox_capability_uses_session
    ON sandbox_capability_uses (session_uuid);
  `,
];

export type MigrateBrokerSessionSchemaResult =
  | { ok: true; version: number }
  | { ok: false; errorCode: string; reason: string };

export function migrateBrokerSessionSchema(
  db: DatabaseSync,
): MigrateBrokerSessionSchemaResult {
  let userVersion: number;
  try {
    const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
    userVersion = Number(row.user_version);
  } catch {
    return { ok: false, errorCode: "schema_probe_failed", reason: "cannot probe user_version" };
  }

  if (userVersion > BROKER_SESSION_SCHEMA_VERSION) {
    return {
      ok: false,
      errorCode: "schema_version_future",
      reason: `broker schema version ${userVersion} is newer than supported ${BROKER_SESSION_SCHEMA_VERSION}`,
    };
  }
  if (userVersion === BROKER_SESSION_SCHEMA_VERSION) {
    return { ok: true, version: userVersion };
  }

  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const ddl of MIGRATION_1_SESSION_LEDGER_DDL) {
        db.exec(ddl);
      }
      for (const ddl of MIGRATION_2_SESSION_LEDGER_DDL) {
        db.exec(ddl);
      }
      for (const ddl of MIGRATION_3_SESSION_LEDGER_DDL) {
        db.exec(ddl);
      }
      db.exec(`PRAGMA user_version = ${BROKER_SESSION_SCHEMA_VERSION}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch {
    return {
      ok: false,
      errorCode: "migration_failed",
      reason: `failed to migrate broker schema to version ${BROKER_SESSION_SCHEMA_VERSION}`,
    };
  }
  return { ok: true, version: BROKER_SESSION_SCHEMA_VERSION };
}
