import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ApprovalEnvelope } from "../crypto/types.js";
import {
  ARTIFACT_REF_ENTROPY_BYTES,
  MAX_ARTIFACT_BYTES,
  MAX_TASK_ARTIFACT_BYTES,
  MAX_WORKSPACE_BYTES,
  UPLOAD_SESSION_TTL_MS,
} from "../constants/limits.js";
import { randomRef } from "../crypto/types.js";
import { BrokerSessionLedger } from "../sessions/session-ledger.js";

export interface StoredArtifact {
  ownerId: string;
  artifactRef: string;
  entityUuid: string;
  bytes: Buffer;
  taskId?: string;
}

export interface UploadSession {
  uploadId: string;
  sessionCapability: string;
  ownerId: string;
  taskId?: string;
  chunks: Buffer[];
  declaredSize: number;
  expiresAt: number;
}

export type TaskState =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timeout"
  | "policy_rejected"
  | "concurrency_limit"
  | "broker_restart";

export interface StoredTask {
  taskId: string;
  ownerId: string;
  state: TaskState;
  exitCode?: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  terminalReason?: string;
  envelope: ApprovalEnvelope;
  uploadAuthorized: boolean;
}

export interface AuditEvent {
  atMs: number;
  code: string;
  metadata: Record<string, string | number | boolean>;
}

export class BrokerStore {
  readonly artifacts = new Map<string, StoredArtifact>();
  readonly uploads = new Map<string, UploadSession>();
  readonly tasks = new Map<string, StoredTask>();
  readonly spentNonces = new Set<string>();
  readonly appliedTombstones = new Set<string>();
  readonly auditEvents: AuditEvent[] = [];
  sessionLedger: BrokerSessionLedger = new BrokerSessionLedger();
  workspaceBytesUsed = 0;

  /** Persistence hooks are no-ops for the local in-memory Wave 07b store. */
  flush(): void {}

  /** Fail-closed readiness: an in-memory flush cannot fail, so it is healthy. */
  persistenceHealthy(): boolean {
    return true;
  }

  close(): void {}

  recordNonce(nonce: string): boolean {
    if (this.spentNonces.has(nonce)) {
      return false;
    }
    this.spentNonces.add(nonce);
    return true;
  }

  hasNonce(nonce: string): boolean {
    return this.spentNonces.has(nonce);
  }

  createUploadSession(
    ownerId: string,
    declaredSize: number,
    taskId?: string,
    nowMs = Date.now(),
  ): UploadSession {
    const session: UploadSession = {
      uploadId: randomUUID(),
      sessionCapability: randomRef(),
      ownerId,
      taskId,
      chunks: [],
      declaredSize,
      expiresAt: nowMs + UPLOAD_SESSION_TTL_MS,
    };
    this.uploads.set(session.uploadId, session);
    return session;
  }

  commitArtifact(
    ownerId: string,
    bytes: Buffer,
    taskId?: string,
  ): StoredArtifact {
    if (bytes.length > MAX_ARTIFACT_BYTES) {
      throw new Error("artifact_too_large");
    }
    if (this.workspaceBytesUsed + bytes.length > MAX_WORKSPACE_BYTES) {
      throw new Error("workspace_quota_exceeded");
    }
    const artifact: StoredArtifact = {
      ownerId,
      artifactRef: randomRef(ARTIFACT_REF_ENTROPY_BYTES),
      entityUuid: randomUUID(),
      bytes,
      taskId,
    };
    this.workspaceBytesUsed += bytes.length;
    this.artifacts.set(artifact.artifactRef, artifact);
    return artifact;
  }

  taskArtifactBytes(taskId: string): number {
    let total = 0;
    for (const artifact of this.artifacts.values()) {
      if (artifact.taskId === taskId) {
        total += artifact.bytes.length;
      }
    }
    return total;
  }

  assertTaskArtifactQuota(taskId: string, nextBytes: number): void {
    if (this.taskArtifactBytes(taskId) + nextBytes > MAX_TASK_ARTIFACT_BYTES) {
      throw new Error("task_artifact_quota_exceeded");
    }
  }

  authorizeTaskUpload(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    return Boolean(task && task.uploadAuthorized);
  }

  markTasksFailedOnRestart(): void {
    for (const task of this.tasks.values()) {
      if (task.state === "running") {
        task.state = "broker_restart";
        task.terminalReason = "broker_restart";
        task.uploadAuthorized = false;
      }
    }
  }

  recordAppliedTombstone(tombstoneId: string): boolean {
    if (this.appliedTombstones.has(tombstoneId)) return false;
    this.appliedTombstones.add(tombstoneId);
    return true;
  }
}

/**
 * Restart-durable broker metadata for the Mint daemon. Upload chunks remain
 * intentionally ephemeral; committed artifacts, task receipts, audit rows,
 * spent nonces, and applied tombstone ids survive a broker restart.
 */
export class DurableBrokerStore extends BrokerStore {
  private readonly database: DatabaseSync;

  constructor(stateRoot: string) {
    super();
    mkdirSync(stateRoot, { recursive: true });
    this.database = new DatabaseSync(join(stateRoot, "broker.db"));
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS broker_artifacts (
        artifact_ref TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        entity_uuid TEXT NOT NULL,
        bytes BLOB NOT NULL,
        task_id TEXT
      );
      CREATE TABLE IF NOT EXISTS broker_nonces (
        nonce TEXT PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS broker_tombstones (
        tombstone_id TEXT PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS broker_tasks (
        task_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        state TEXT NOT NULL,
        exit_code INTEGER,
        stdout TEXT NOT NULL,
        stderr TEXT NOT NULL,
        truncated INTEGER NOT NULL,
        terminal_reason TEXT,
        envelope_json TEXT NOT NULL,
        upload_authorized INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS broker_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at_ms INTEGER NOT NULL,
        code TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );
    `);
    this.sessionLedger = new BrokerSessionLedger({ database: this.database });
    this.load();
  }

  override recordNonce(nonce: string): boolean {
    if (!super.recordNonce(nonce)) return false;
    try {
      this.flush();
      return true;
    } catch {
      this.spentNonces.delete(nonce);
      return false;
    }
  }

  override recordAppliedTombstone(tombstoneId: string): boolean {
    // Forget applies persist the tombstone and exact artifact deletions in a
    // single broker flush after the handler completes. Persisting this marker
    // before deletion would make a crash look like a completed forget.
    return super.recordAppliedTombstone(tombstoneId);
  }

  override markTasksFailedOnRestart(): void {
    super.markTasksFailedOnRestart();
    this.flush();
  }

  override flush(): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec(`
        DELETE FROM broker_artifacts;
        DELETE FROM broker_nonces;
        DELETE FROM broker_tombstones;
        DELETE FROM broker_tasks;
        DELETE FROM broker_audit_events;
      `);
      const artifact = this.database.prepare(
        `INSERT INTO broker_artifacts
         (artifact_ref, owner_id, entity_uuid, bytes, task_id)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const item of this.artifacts.values()) {
        artifact.run(
          item.artifactRef,
          item.ownerId,
          item.entityUuid,
          item.bytes,
          item.taskId ?? null,
        );
      }
      const nonce = this.database.prepare(
        `INSERT INTO broker_nonces (nonce) VALUES (?)`,
      );
      for (const value of this.spentNonces) nonce.run(value);
      const tombstone = this.database.prepare(
        `INSERT INTO broker_tombstones (tombstone_id) VALUES (?)`,
      );
      for (const value of this.appliedTombstones) tombstone.run(value);
      const task = this.database.prepare(
        `INSERT INTO broker_tasks
         (task_id, owner_id, state, exit_code, stdout, stderr, truncated,
          terminal_reason, envelope_json, upload_authorized)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of this.tasks.values()) {
        task.run(
          item.taskId,
          item.ownerId,
          item.state,
          item.exitCode ?? null,
          item.stdout,
          item.stderr,
          item.truncated ? 1 : 0,
          item.terminalReason ?? null,
          JSON.stringify(item.envelope),
          item.uploadAuthorized ? 1 : 0,
        );
      }
      const audit = this.database.prepare(
        `INSERT INTO broker_audit_events (at_ms, code, metadata_json)
         VALUES (?, ?, ?)`,
      );
      for (const item of this.auditEvents) {
        audit.run(item.atMs, item.code, JSON.stringify(item.metadata));
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  override close(): void {
    this.flush();
    this.database.close();
  }

  /** Fail-closed readiness: the durable ledger is only healthy while its SQLite handle is open. */
  override persistenceHealthy(): boolean {
    return this.database.isOpen;
  }

  private load(): void {
    const artifacts = this.database
      .prepare(
        `SELECT artifact_ref, owner_id, entity_uuid, bytes, task_id
         FROM broker_artifacts`,
      )
      .all() as Array<{
      artifact_ref: string;
      owner_id: string;
      entity_uuid: string;
      bytes: Uint8Array;
      task_id: string | null;
    }>;
    for (const row of artifacts) {
      const bytes = Buffer.from(row.bytes);
      this.artifacts.set(row.artifact_ref, {
        artifactRef: row.artifact_ref,
        ownerId: row.owner_id,
        entityUuid: row.entity_uuid,
        bytes,
        ...(row.task_id ? { taskId: row.task_id } : {}),
      });
      this.workspaceBytesUsed += bytes.length;
    }
    for (const row of this.database
      .prepare(`SELECT nonce FROM broker_nonces`)
      .all() as Array<{ nonce: string }>) {
      this.spentNonces.add(row.nonce);
    }
    for (const row of this.database
      .prepare(`SELECT tombstone_id FROM broker_tombstones`)
      .all() as Array<{ tombstone_id: string }>) {
      this.appliedTombstones.add(row.tombstone_id);
    }
    for (const row of this.database
      .prepare(
        `SELECT task_id, owner_id, state, exit_code, stdout, stderr, truncated,
                terminal_reason, envelope_json, upload_authorized
         FROM broker_tasks`,
      )
      .all() as Array<{
      task_id: string;
      owner_id: string;
      state: TaskState;
      exit_code: number | null;
      stdout: string;
      stderr: string;
      truncated: number;
      terminal_reason: string | null;
      envelope_json: string;
      upload_authorized: number;
    }>) {
      this.tasks.set(row.task_id, {
        taskId: row.task_id,
        ownerId: row.owner_id,
        state: row.state,
        ...(row.exit_code === null ? {} : { exitCode: row.exit_code }),
        stdout: row.stdout,
        stderr: row.stderr,
        truncated: row.truncated !== 0,
        ...(row.terminal_reason
          ? { terminalReason: row.terminal_reason }
          : {}),
        envelope: JSON.parse(row.envelope_json) as ApprovalEnvelope,
        uploadAuthorized: row.upload_authorized !== 0,
      });
    }
    for (const row of this.database
      .prepare(
        `SELECT at_ms, code, metadata_json
         FROM broker_audit_events ORDER BY id`,
      )
      .all() as Array<{
      at_ms: number;
      code: string;
      metadata_json: string;
    }>) {
      this.auditEvents.push({
        atMs: row.at_ms,
        code: row.code,
        metadata: JSON.parse(row.metadata_json) as Record<
          string,
          string | number | boolean
        >,
      });
    }
  }
}
