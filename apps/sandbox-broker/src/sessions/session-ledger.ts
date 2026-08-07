/**
 * Broker session ledger (Sandbox Wave 4, Commit 8).
 *
 * The broker-authoritative execution-session ledger. Two backends share one
 * interface:
 *
 *  - in-memory (`database: undefined`), used by the local BrokerStore and by
 *    tests that do not need restart durability;
 *  - SQLite-backed (`database: DatabaseSync`), used by DurableBrokerStore.
 *    Schema is created/migrated on first use (see session-migration.ts).
 *
 * Reservations are atomic: session checks (active, not expired, capability
 * allowed, policy hash, budget, no prior use of the capability-use id) and
 * the budget increment are applied in a single transaction. A successful
 * reservation consumes budget regardless of the later execution outcome.
 * Capability-use ids are never reusable, including after `cancelled` or
 * `failed`.
 *
 * The ledger stores session policy identity (id/version/hash), never policy
 * artifacts, never keys, never raw secrets, never argv or output.
 *
 * Broker restart recovery is explicit (`recoverFromRestart`): the ledger is
 * authoritative, reserved capability uses are finalized as `interrupted`
 * without refund or auto-retry, and lapsed sessions are materialized to
 * `expired`. Nothing is silently resumed in memory.
 */

import { type DatabaseSync } from "node:sqlite";
import { capabilitySpec } from "@composer-assistant/sandbox-policy";
import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";
import { randomRef } from "../crypto/types.js";
import {
  BROKER_SESSION_SCHEMA_VERSION,
  migrateBrokerSessionSchema,
} from "./session-migration.js";
import { MAX_CAPABILITY_USE_RECORDS_PER_SESSION } from "./session-limits.js";
import {
  type BrokerSandboxSession,
  type CapabilityUseOutcome,
  type OwnerAuthorizationRecord,
  type OwnerAuthorizedTransition,
  type SandboxCapabilityUse,
  type SandboxSessionEvent,
  type SandboxSessionEventMetadata,
  type SandboxSessionState,
} from "./session-types.js";
import { validateSessionTransition } from "./session-transitions.js";

export type BrokerSessionLedgerOptions = {
  database?: DatabaseSync;
};

type SessionRow = {
  session_uuid: string;
  owner_id: string;
  proposal_id: string;
  role: "sandbox_operator_light" | "sandbox_operator_deep";
  state: SandboxSessionState;
  policy_id: string;
  policy_version: number;
  policy_hash: string;
  delegated_signer_key_id: string;
  capability_signing_key_id: string;
  workspace_id: string | null;
  workspace_manifest_hash: string | null;
  allowed_capabilities_json: string;
  max_tool_executions: number;
  tool_executions_used: number;
  created_at: string;
  activated_at: string | null;
  expires_at: string;
  completed_at: string | null;
  aborted_at: string | null;
  revision: number;
};

export type LedgerResult<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: string; reason: string };

/**
 * Outcome of a broker restart recovery pass. `sessionsMaterialized` lists
 * sessions moved to `expired`; `interruptedUses` is the count of reservations
 * finalized as `interrupted`; `sessionsInterrupted` lists sessions that had
 * at least one interrupted reservation.
 */
export type RestartRecoveryResult = {
  sessionsMaterialized: string[];
  interruptedUses: number;
  sessionsInterrupted: string[];
};

export type ApplyTransitionInput = {
  sessionUuid: string;
  expectedRevision: number;
  to: SandboxSessionState;
  eventType: string;
  atMs: number;
  metadata?: SandboxSessionEventMetadata;
  ownerAuthorization?: OwnerAuthorizedTransition;
  stamps?: {
    activatedAt?: string;
    completedAt?: string;
    abortedAt?: string;
  };
};

const RECORDABLE_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "session_created",
  "session_activated",
  "capability_issued",
  "capability_verified",
  "tool_use_reserved",
  "session_awaiting_owner",
  "owner_authorization_recorded",
  "session_completed",
  "session_aborted",
  "session_expired",
  "session_interrupted",
  "session_policy_superseded",
  "session_workspace_missing",
]);

export type ReserveCapabilityUseInput = {
  sessionUuid: string;
  expectedRevision: number;
  capabilityUseId: string;
  capability: SandboxCapabilityId;
  policyHash: string;
  nowMs: number;
};

function sessionToRow(session: BrokerSandboxSession): SessionRow {
  return {
    session_uuid: session.sessionUuid,
    owner_id: session.ownerId,
    proposal_id: session.proposalId,
    role: session.role,
    state: session.state,
    policy_id: session.policyId,
    policy_version: session.policyVersion,
    policy_hash: session.policyHash,
    delegated_signer_key_id: session.delegatedSignerKeyId,
    capability_signing_key_id: session.capabilitySigningKeyId,
    workspace_id: session.workspaceId ?? null,
    workspace_manifest_hash: session.workspaceManifestHash ?? null,
    allowed_capabilities_json: JSON.stringify(session.allowedCapabilities),
    max_tool_executions: session.maxToolExecutions,
    tool_executions_used: session.toolExecutionsUsed,
    created_at: session.createdAt,
    activated_at: session.activatedAt ?? null,
    expires_at: session.expiresAt,
    completed_at: session.completedAt ?? null,
    aborted_at: session.abortedAt ?? null,
    revision: session.revision,
  };
}

function rowToSession(row: SessionRow): BrokerSandboxSession {
  return {
    sessionUuid: row.session_uuid,
    ownerId: row.owner_id,
    proposalId: row.proposal_id,
    role: row.role,
    state: row.state,
    policyId: row.policy_id,
    policyVersion: row.policy_version,
    policyHash: row.policy_hash,
    delegatedSignerKeyId: row.delegated_signer_key_id,
    capabilitySigningKeyId: row.capability_signing_key_id,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.workspace_manifest_hash ? { workspaceManifestHash: row.workspace_manifest_hash } : {}),
    allowedCapabilities: JSON.parse(row.allowed_capabilities_json) as SandboxCapabilityId[],
    maxToolExecutions: row.max_tool_executions,
    toolExecutionsUsed: row.tool_executions_used,
    createdAt: row.created_at,
    ...(row.activated_at ? { activatedAt: row.activated_at } : {}),
    expiresAt: row.expires_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.aborted_at ? { abortedAt: row.aborted_at } : {}),
    revision: row.revision,
  };
}

export class BrokerSessionLedger {
  private readonly db: DatabaseSync | null;
  private readonly memSessions = new Map<string, BrokerSandboxSession>();
  private readonly memEvents: SandboxSessionEvent[] = [];
  private readonly memUses = new Map<string, SandboxCapabilityUse>();
  private readonly memAuthorizations = new Map<string, OwnerAuthorizationRecord>();

  constructor(options: BrokerSessionLedgerOptions = {}) {
    this.db = options.database ?? null;
    if (this.db) {
      const migration = migrateBrokerSessionSchema(this.db);
      if (!migration.ok) {
        throw new Error(migration.errorCode);
      }
      if (migration.version !== BROKER_SESSION_SCHEMA_VERSION) {
        throw new Error("schema_version_unsupported");
      }
    }
  }

  createSession(session: BrokerSandboxSession): void {
    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO sandbox_sessions (
             session_uuid, owner_id, proposal_id, role, state, policy_id,
             policy_version, policy_hash, delegated_signer_key_id,
             capability_signing_key_id, workspace_id, workspace_manifest_hash,
             allowed_capabilities_json, max_tool_executions,
             tool_executions_used, created_at, activated_at, expires_at,
             completed_at, aborted_at, revision
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          session.sessionUuid,
          session.ownerId,
          session.proposalId,
          session.role,
          session.state,
          session.policyId,
          session.policyVersion,
          session.policyHash,
          session.delegatedSignerKeyId,
          session.capabilitySigningKeyId,
          session.workspaceId ?? null,
          session.workspaceManifestHash ?? null,
          JSON.stringify(session.allowedCapabilities),
          session.maxToolExecutions,
          session.toolExecutionsUsed,
          session.createdAt,
          session.activatedAt ?? null,
          session.expiresAt,
          session.completedAt ?? null,
          session.abortedAt ?? null,
          session.revision,
        );
      return;
    }
    this.memSessions.set(session.sessionUuid, session);
  }

  getSession(sessionUuid: string): BrokerSandboxSession | null {
    if (this.db) {
      const row = this.db
        .prepare(`SELECT * FROM sandbox_sessions WHERE session_uuid = ?`)
        .get(sessionUuid) as SessionRow | undefined;
      return row ? rowToSession(row) : null;
    }
    return this.memSessions.get(sessionUuid) ?? null;
  }

  listSessions(): BrokerSandboxSession[] {
    if (this.db) {
      const rows = this.db
        .prepare(`SELECT * FROM sandbox_sessions ORDER BY created_at`)
        .all() as SessionRow[];
      return rows.map(rowToSession);
    }
    return [...this.memSessions.values()];
  }

  /**
   * Validates and applies a state transition with an optimistic revision
   * guard, records the audit event, and (durable) commits all in one
   * transaction. An `awaiting_owner -> active` transition also durably
   * records the owner authorization in the same transaction.
   */
  applyTransition(input: ApplyTransitionInput): LedgerResult<BrokerSandboxSession> {
    const run = (): LedgerResult<BrokerSandboxSession> => {
      const current = this.getSession(input.sessionUuid);
      if (!current) {
        return { ok: false, errorCode: "unknown_session", reason: "session not found" };
      }
      const check = validateSessionTransition({
        from: current.state,
        to: input.to,
        expectedRevision: input.expectedRevision,
        currentRevision: current.revision,
        session: current,
        ownerAuthorization: input.ownerAuthorization,
      });
      if (!check.ok) {
        return { ok: false, errorCode: check.errorCode, reason: check.reason };
      }
      const next: BrokerSandboxSession = {
        ...current,
        state: input.to,
        revision: current.revision + 1,
        ...(input.stamps?.activatedAt ? { activatedAt: input.stamps.activatedAt } : {}),
        ...(input.stamps?.completedAt ? { completedAt: input.stamps.completedAt } : {}),
        ...(input.stamps?.abortedAt ? { abortedAt: input.stamps.abortedAt } : {}),
      };
      this.putSession(next);
      this.insertEvent({
        sessionUuid: input.sessionUuid,
        eventType: input.eventType,
        atMs: input.atMs,
        metadata: input.metadata ?? {},
      });
      if (input.ownerAuthorization !== undefined) {
        const recorded = this.recordOwnerAuthorization({
          authorizationId: input.ownerAuthorization.authorizationId,
          sessionUuid: input.sessionUuid,
          ownerId: input.ownerAuthorization.ownerId,
          policyHash: input.ownerAuthorization.policyHash,
          authorizedAtMs: input.ownerAuthorization.authorizedAtMs,
          nowMs: input.atMs,
        });
        if (!recorded.ok) {
          return { ok: false, errorCode: recorded.errorCode, reason: recorded.reason };
        }
      }
      return { ok: true, value: next };
    };
    return this.inTransaction(run);
  }

  /**
   * Durably records an owner authorization (idempotent: re-recording the same
   * authorization id is a no-op success). Never called directly except by
   * tests and by `applyTransition` for `awaiting_owner -> active`.
   */
  recordOwnerAuthorization(input: {
    authorizationId: string;
    sessionUuid: string;
    ownerId: string;
    policyHash: string;
    authorizedAtMs: number;
    nowMs: number;
  }): LedgerResult<{ authorizationId: string }> {
    const session = this.getSession(input.sessionUuid);
    if (!session) {
      return { ok: false, errorCode: "unknown_session", reason: "session not found" };
    }
    const record: OwnerAuthorizationRecord = {
      authorizationId: input.authorizationId,
      sessionUuid: input.sessionUuid,
      ownerId: input.ownerId,
      policyHash: input.policyHash,
      authorizedAtMs: input.authorizedAtMs,
      createdAtIso: new Date(input.nowMs).toISOString(),
    };
    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO sandbox_session_authorizations (
             authorization_id, session_uuid, owner_id, policy_hash,
             authorized_at_ms, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (authorization_id) DO NOTHING`,
        )
        .run(
          record.authorizationId,
          record.sessionUuid,
          record.ownerId,
          record.policyHash,
          record.authorizedAtMs,
          record.createdAtIso,
        );
      return { ok: true, value: { authorizationId: record.authorizationId } };
    }
    if (!this.memAuthorizations.has(record.authorizationId)) {
      this.memAuthorizations.set(record.authorizationId, record);
    }
    return { ok: true, value: { authorizationId: record.authorizationId } };
  }

  getOwnerAuthorization(authorizationId: string): OwnerAuthorizationRecord | null {
    if (this.db) {
      const row = this.db
        .prepare(
          `SELECT authorization_id, session_uuid, owner_id, policy_hash,
                  authorized_at_ms, created_at
           FROM sandbox_session_authorizations WHERE authorization_id = ?`,
        )
        .get(authorizationId) as
        | {
            authorization_id: string;
            session_uuid: string;
            owner_id: string;
            policy_hash: string;
            authorized_at_ms: number;
            created_at: string;
          }
        | undefined;
      if (!row) return null;
      return {
        authorizationId: row.authorization_id,
        sessionUuid: row.session_uuid,
        ownerId: row.owner_id,
        policyHash: row.policy_hash,
        authorizedAtMs: row.authorized_at_ms,
        createdAtIso: row.created_at,
      };
    }
    return this.memAuthorizations.get(authorizationId) ?? null;
  }

  listOwnerAuthorizations(sessionUuid: string): OwnerAuthorizationRecord[] {
    if (this.db) {
      const rows = this.db
        .prepare(
          `SELECT authorization_id, session_uuid, owner_id, policy_hash,
                  authorized_at_ms, created_at
           FROM sandbox_session_authorizations
           WHERE session_uuid = ? ORDER BY authorized_at_ms`,
        )
        .all(sessionUuid) as Array<{
        authorization_id: string;
        session_uuid: string;
        owner_id: string;
        policy_hash: string;
        authorized_at_ms: number;
        created_at: string;
      }>;
      return rows.map((row) => ({
        authorizationId: row.authorization_id,
        sessionUuid: row.session_uuid,
        ownerId: row.owner_id,
        policyHash: row.policy_hash,
        authorizedAtMs: row.authorized_at_ms,
        createdAtIso: row.created_at,
      }));
    }
    return [...this.memAuthorizations.values()].filter(
      (record) => record.sessionUuid === sessionUuid,
    );
  }

  /**
   * Atomically reserves one tool execution: re-checks the session inside the
   * transaction (active, not expired, capability allowed, policy hash match,
   * budget remaining, capability-use id never used before) and increments
   * the budget in the same write. Accepted reservations never refund.
   */
  reserveCapabilityUse(input: ReserveCapabilityUseInput): LedgerResult<{
    session: BrokerSandboxSession;
    use: SandboxCapabilityUse;
  }> {
    const run = (): LedgerResult<{
      session: BrokerSandboxSession;
      use: SandboxCapabilityUse;
    }> => {
      const current = this.getSession(input.sessionUuid);
      if (!current) {
        return { ok: false, errorCode: "unknown_session", reason: "session not found" };
      }
      if (input.expectedRevision !== current.revision) {
        return {
          ok: false,
          errorCode: "revision_mismatch",
          reason: `expected revision ${input.expectedRevision}, current ${current.revision}`,
        };
      }
      if (current.state !== "active") {
        return {
          ok: false,
          errorCode: "session_not_active",
          reason: `session is ${current.state}, not active`,
        };
      }
      if (input.nowMs >= Date.parse(current.expiresAt)) {
        return { ok: false, errorCode: "session_expired", reason: "session has expired" };
      }
      if (capabilitySpec(input.capability) === undefined) {
        return { ok: false, errorCode: "unknown_capability", reason: "unknown capability id" };
      }
      if (!current.allowedCapabilities.includes(input.capability)) {
        return {
          ok: false,
          errorCode: "capability_not_allowed",
          reason: "capability not allowed for this session",
        };
      }
      if (current.policyHash !== input.policyHash) {
        return { ok: false, errorCode: "policy_mismatch", reason: "policy hash mismatch" };
      }
      if (current.toolExecutionsUsed >= current.maxToolExecutions) {
        return { ok: false, errorCode: "budget_exhausted", reason: "tool execution budget exhausted" };
      }
      if (this.getCapabilityUse(input.capabilityUseId)) {
        return { ok: false, errorCode: "capability_use_replay", reason: "capability use id already recorded" };
      }
      if (this.countUses(input.sessionUuid) >= MAX_CAPABILITY_USE_RECORDS_PER_SESSION) {
        return { ok: false, errorCode: "capability_use_limit", reason: "capability use record limit reached" };
      }

      const use: SandboxCapabilityUse = {
        capabilityUseId: input.capabilityUseId,
        sessionUuid: input.sessionUuid,
        capability: input.capability,
        policyHash: input.policyHash,
        outcome: "reserved",
        issuedAt: new Date(input.nowMs).toISOString(),
      };
      this.putCapabilityUse(use);
      this.putSession({
        ...current,
        toolExecutionsUsed: current.toolExecutionsUsed + 1,
        revision: current.revision + 1,
      });
      this.insertEvent({
        sessionUuid: input.sessionUuid,
        eventType: "tool_use_reserved",
        atMs: input.nowMs,
        metadata: {
          capability: input.capability,
          capabilityUseId: input.capabilityUseId,
          toolExecutionsUsed: current.toolExecutionsUsed + 1,
        },
      });
      return { ok: true, value: { session: this.getSession(input.sessionUuid)!, use } };
    };
    return this.inTransaction(run);
  }

  finalizeCapabilityUse(
    capabilityUseId: string,
    outcome: CapabilityUseOutcome,
    atMs: number,
  ): LedgerResult<SandboxCapabilityUse> {
    const run = (): LedgerResult<SandboxCapabilityUse> => {
      const existing = this.getCapabilityUse(capabilityUseId);
      if (!existing) {
        return { ok: false, errorCode: "unknown_capability_use", reason: "use not found" };
      }
      if (existing.outcome !== "reserved") {
        return {
          ok: false,
          errorCode: "capability_use_already_finalized",
          reason: `use already finalized as ${existing.outcome}`,
        };
      }
      const finalized: SandboxCapabilityUse = {
        ...existing,
        outcome,
        consumedAt: new Date(atMs).toISOString(),
      };
      if (this.db) {
        this.db
          .prepare(
            `UPDATE sandbox_capability_uses
             SET outcome = ?, consumed_at = ?
             WHERE capability_use_id = ? AND outcome = 'reserved'`,
          )
          .run(outcome, finalized.consumedAt!, capabilityUseId);
      } else {
        this.memUses.set(capabilityUseId, finalized);
      }
      return { ok: true, value: finalized };
    };
    return this.inTransaction(run);
  }

  getCapabilityUse(capabilityUseId: string): SandboxCapabilityUse | null {
    if (this.db) {
      const row = this.db
        .prepare(
          `SELECT capability_use_id, session_uuid, capability, policy_hash,
                  outcome, issued_at, consumed_at
           FROM sandbox_capability_uses WHERE capability_use_id = ?`,
        )
        .get(capabilityUseId) as
        | {
            capability_use_id: string;
            session_uuid: string;
            capability: SandboxCapabilityId;
            policy_hash: string;
            outcome: CapabilityUseOutcome;
            issued_at: string;
            consumed_at: string | null;
          }
        | undefined;
      if (!row) return null;
      return {
        capabilityUseId: row.capability_use_id,
        sessionUuid: row.session_uuid,
        capability: row.capability,
        policyHash: row.policy_hash,
        outcome: row.outcome,
        issuedAt: row.issued_at,
        ...(row.consumed_at ? { consumedAt: row.consumed_at } : {}),
      };
    }
    return this.memUses.get(capabilityUseId) ?? null;
  }

  /**
   * Records an audit event without a state transition (e.g. capability
   * issued / verified). Event types are restricted to the known vocabulary.
   */
  recordEvent(input: {
    sessionUuid: string;
    eventType: SandboxSessionEvent["eventType"];
    atMs: number;
    metadata?: SandboxSessionEventMetadata;
  }): LedgerResult<{ eventUuid: string }> {
    const session = this.getSession(input.sessionUuid);
    if (!session) {
      return { ok: false, errorCode: "unknown_session", reason: "session not found" };
    }
    if (!RECORDABLE_EVENT_TYPES.has(input.eventType)) {
      return { ok: false, errorCode: "unknown_event_type", reason: "event type not recordable" };
    }
    this.insertEvent({
      sessionUuid: input.sessionUuid,
      eventType: input.eventType,
      atMs: input.atMs,
      metadata: input.metadata ?? {},
    });
    return { ok: true, value: { eventUuid: "" } };
  }

  listEvents(sessionUuid: string): SandboxSessionEvent[] {
    if (this.db) {
      const rows = this.db
        .prepare(
          `SELECT event_uuid, session_uuid, event_type, created_at, metadata_json
           FROM sandbox_session_events
           WHERE session_uuid = ? ORDER BY id`,
        )
        .all(sessionUuid) as Array<{
        event_uuid: string;
        session_uuid: string;
        event_type: string;
        created_at: string;
        metadata_json: string;
      }>;
      return rows.map((row) => ({
        eventUuid: row.event_uuid,
        sessionUuid: row.session_uuid,
        eventType: row.event_type as SandboxSessionEvent["eventType"],
        createdAt: row.created_at,
        metadata: JSON.parse(row.metadata_json) as SandboxSessionEventMetadata,
      }));
    }
    return this.memEvents.filter((event) => event.sessionUuid === sessionUuid);
  }

  listCapabilityUses(sessionUuid: string): SandboxCapabilityUse[] {
    if (this.db) {
      const rows = this.db
        .prepare(
          `SELECT capability_use_id, session_uuid, capability, policy_hash,
                  outcome, issued_at, consumed_at
           FROM sandbox_capability_uses WHERE session_uuid = ? ORDER BY issued_at`,
        )
        .all(sessionUuid) as Array<{
        capability_use_id: string;
        session_uuid: string;
        capability: SandboxCapabilityId;
        policy_hash: string;
        outcome: CapabilityUseOutcome;
        issued_at: string;
        consumed_at: string | null;
      }>;
      return rows.map((row) => ({
        capabilityUseId: row.capability_use_id,
        sessionUuid: row.session_uuid,
        capability: row.capability,
        policyHash: row.policy_hash,
        outcome: row.outcome,
        issuedAt: row.issued_at,
        ...(row.consumed_at ? { consumedAt: row.consumed_at } : {}),
      }));
    }
    return [...this.memUses.values()].filter(
      (use) => use.sessionUuid === sessionUuid,
    );
  }

  /**
   * Broker restart recovery. The ledger is authoritative: reservations whose
   * execution may have been lost in a crash are durably finalized as
   * `interrupted` (never auto-retried, never refunded, single-use ids never
   * reused), and sessions that lapsed while the broker was down are
   * materialized to `expired`. A `session_interrupted` event is recorded per
   * affected session. Idempotent in the sense that a second run finds nothing
   * left to do.
   */
  recoverFromRestart(nowMs: number): RestartRecoveryResult {
    const result: RestartRecoveryResult = {
      sessionsMaterialized: [],
      interruptedUses: 0,
      sessionsInterrupted: [],
    };
    for (const session of this.listSessions()) {
      if (session.state === "completed" || session.state === "aborted" || session.state === "expired") {
        continue;
      }
      const reserved = this.listCapabilityUses(session.sessionUuid).filter(
        (use) => use.outcome === "reserved",
      );
      if (reserved.length > 0) {
        for (const use of reserved) {
          this.finalizeCapabilityUse(use.capabilityUseId, "interrupted", nowMs);
        }
        result.interruptedUses += reserved.length;
        result.sessionsInterrupted.push(session.sessionUuid);
        this.recordEvent({
          sessionUuid: session.sessionUuid,
          eventType: "session_interrupted",
          atMs: nowMs,
          metadata: { interruptedUses: reserved.length },
        });
      }
      if (nowMs >= Date.parse(session.expiresAt)) {
        const current = this.getSession(session.sessionUuid);
        if (!current) continue;
        const expired = this.applyTransition({
          sessionUuid: session.sessionUuid,
          expectedRevision: current.revision,
          to: "expired",
          eventType: "session_expired",
          atMs: nowMs,
          metadata: { recovery: true },
        });
        if (expired.ok) {
          result.sessionsMaterialized.push(session.sessionUuid);
        }
      }
    }
    return result;
  }

  private countUses(sessionUuid: string): number {
    if (this.db) {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS n FROM sandbox_capability_uses WHERE session_uuid = ?`)
        .get(sessionUuid) as { n: number };
      return Number(row.n);
    }
    let count = 0;
    for (const use of this.memUses.values()) {
      if (use.sessionUuid === sessionUuid) count += 1;
    }
    return count;
  }

  private putSession(session: BrokerSandboxSession): void {
    if (this.db) {
      const row = sessionToRow(session);
      this.db
        .prepare(
          `INSERT INTO sandbox_sessions (
             session_uuid, owner_id, proposal_id, role, state, policy_id,
             policy_version, policy_hash, delegated_signer_key_id,
             capability_signing_key_id, workspace_id, workspace_manifest_hash,
             allowed_capabilities_json, max_tool_executions,
             tool_executions_used, created_at, activated_at, expires_at,
             completed_at, aborted_at, revision
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (session_uuid) DO UPDATE SET
             role = excluded.role,
             state = excluded.state,
             workspace_id = excluded.workspace_id,
             workspace_manifest_hash = excluded.workspace_manifest_hash,
             allowed_capabilities_json = excluded.allowed_capabilities_json,
             tool_executions_used = excluded.tool_executions_used,
             activated_at = excluded.activated_at,
             completed_at = excluded.completed_at,
             aborted_at = excluded.aborted_at,
             revision = excluded.revision`,
        )
        .run(
          row.session_uuid,
          row.owner_id,
          row.proposal_id,
          row.role,
          row.state,
          row.policy_id,
          row.policy_version,
          row.policy_hash,
          row.delegated_signer_key_id,
          row.capability_signing_key_id,
          row.workspace_id,
          row.workspace_manifest_hash,
          row.allowed_capabilities_json,
          row.max_tool_executions,
          row.tool_executions_used,
          row.created_at,
          row.activated_at,
          row.expires_at,
          row.completed_at,
          row.aborted_at,
          row.revision,
        );
      return;
    }
    this.memSessions.set(session.sessionUuid, session);
  }

  private putCapabilityUse(use: SandboxCapabilityUse): void {
    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO sandbox_capability_uses (
             capability_use_id, session_uuid, capability, policy_hash,
             outcome, issued_at, consumed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          use.capabilityUseId,
          use.sessionUuid,
          use.capability,
          use.policyHash,
          use.outcome,
          use.issuedAt,
          use.consumedAt ?? null,
        );
      return;
    }
    this.memUses.set(use.capabilityUseId, use);
  }

  private insertEvent(input: {
    sessionUuid: string;
    eventType: string;
    atMs: number;
    metadata: SandboxSessionEventMetadata;
  }): void {
    const event: SandboxSessionEvent = {
      eventUuid: randomRef(16),
      sessionUuid: input.sessionUuid,
      eventType: input.eventType as SandboxSessionEvent["eventType"],
      createdAt: new Date(input.atMs).toISOString(),
      metadata: input.metadata,
    };
    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO sandbox_session_events (
             event_uuid, session_uuid, event_type, created_at, metadata_json
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(event.eventUuid, event.sessionUuid, event.eventType, event.createdAt, JSON.stringify(event.metadata));
      return;
    }
    this.memEvents.push(event);
  }

  private inTransaction<T>(run: () => LedgerResult<T>): LedgerResult<T> {
    if (!this.db) {
      return run();
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // rollback failure is unrecoverable; surface the original error below
      }
      throw new Error("session_ledger_transaction_failed");
    }
  }
}
