import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  ARCHITECTURE_EPOCH,
  type ConversationId,
  type CycleRecord,
  type CycleState,
  type CycleTriggerKind,
  type InboxConsumerStatus,
  type InboxEvent,
} from "../types.js";

export type AdmitCycleInput = {
  conversationId: ConversationId;
  cycleId?: string;
  generation?: number;
  triggerKind: CycleTriggerKind;
  triggerRef?: string;
  occupantId?: string | null;
  authorityEpoch?: number;
  architectureEpoch?: string;
  nowMs?: number;
  preemptedGeneration?: number | null;
};

export type AppendInboxEventInput = {
  id?: string;
  conversationId: ConversationId;
  kind: string;
  payload: unknown;
  createdAtMs?: number;
};

type DbRow = Record<string, unknown>;

function isRow(value: unknown): value is DbRow {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function jsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(stringValue(value, "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapCycle(row: unknown): CycleRecord | null {
  if (!isRow(row)) return null;
  const state = stringValue(row.state) as CycleState;
  return {
    cycleId: stringValue(row.cycle_id),
    conversationId: stringValue(row.conversation_id),
    generation: numberValue(row.generation),
    triggerKind: stringValue(row.trigger_kind) as CycleTriggerKind,
    triggerRef: stringValue(row.trigger_ref),
    state,
    occupantId: stringValue(row.occupant_id),
    authorityEpoch: numberValue(row.authority_epoch, 1),
    architectureEpoch: stringValue(row.architecture_epoch, ARCHITECTURE_EPOCH) as typeof ARCHITECTURE_EPOCH,
    admittedAtMs: numberValue(row.admitted_at_ms),
    composeLogIds: jsonArray(row.compose_log_ids_json),
    preemptedGeneration: row.preempted_generation == null ? null : numberValue(row.preempted_generation),
  };
}

function mapInbox(row: unknown): InboxEvent | null {
  if (!isRow(row)) return null;
  let payload: unknown = null;
  try {
    payload = JSON.parse(stringValue(row.payload_json, "null"));
  } catch {
    payload = null;
  }
  return {
    id: stringValue(row.id),
    conversationId: stringValue(row.conversation_id),
    kind: stringValue(row.kind),
    payload,
    createdAtMs: numberValue(row.created_at_ms),
    status: stringValue(row.status) as InboxConsumerStatus,
    claimToken: row.claim_token == null ? null : stringValue(row.claim_token),
    workerId: row.worker_id == null ? null : stringValue(row.worker_id),
    leaseExpiresAtMs: row.lease_expires_at_ms == null ? null : numberValue(row.lease_expires_at_ms),
    attemptCount: numberValue(row.attempt_count),
    claimedAtMs: row.claimed_at_ms == null ? null : numberValue(row.claimed_at_ms),
    consumedAtMs: row.consumed_at_ms == null ? null : numberValue(row.consumed_at_ms),
    lastError: row.last_error == null ? null : stringValue(row.last_error),
  };
}

export function getCycle(db: DatabaseSync, cycleId: string): CycleRecord | null {
  return mapCycle(db.prepare("SELECT * FROM cycle_records WHERE cycle_id = ?").get(cycleId));
}

export function getCurrentCycle(
  db: DatabaseSync,
  conversationId: string,
  options: { includeIdle?: boolean } = {},
): CycleRecord | null {
  const exclusion = options.includeIdle ? "" : "AND state NOT IN ('silent', 'idle')";
  return mapCycle(
    db.prepare(
      `SELECT * FROM cycle_records
       WHERE conversation_id = ? ${exclusion}
       ORDER BY generation DESC, updated_at_ms DESC
       LIMIT 1`,
    ).get(conversationId),
  );
}

export function admitCycle(db: DatabaseSync, input: AdmitCycleInput): CycleRecord {
  if (!input.conversationId.trim()) throw new Error("conversation_id_required");
  const nowMs = input.nowMs ?? Date.now();
  const cycleId = input.cycleId ?? randomUUID();
  const maxRow = db
    .prepare("SELECT MAX(generation) AS generation FROM cycle_records WHERE conversation_id = ?")
    .get(input.conversationId) as { generation?: unknown } | undefined;
  const generation = input.generation ?? numberValue(maxRow?.generation) + 1;
  db.prepare(
    `INSERT INTO cycle_records
       (cycle_id, conversation_id, generation, state, trigger_kind, trigger_ref,
        occupant_id, authority_epoch, architecture_epoch, admitted_at_ms,
        updated_at_ms, compose_log_ids_json, preempted_generation)
     VALUES (?, ?, ?, 'admitted', ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
  ).run(
    cycleId,
    input.conversationId,
    generation,
    input.triggerKind,
    input.triggerRef ?? "",
    input.occupantId ?? null,
    input.authorityEpoch ?? 1,
    input.architectureEpoch ?? ARCHITECTURE_EPOCH,
    nowMs,
    nowMs,
    input.preemptedGeneration ?? null,
  );
  const result = getCycle(db, cycleId);
  if (!result) throw new Error("cycle_admission_lost");
  return result;
}

export function updateCycleState(
  db: DatabaseSync,
  cycleId: string,
  state: CycleState,
  nowMs = Date.now(),
): CycleRecord {
  db.prepare("UPDATE cycle_records SET state = ?, updated_at_ms = ? WHERE cycle_id = ?").run(state, nowMs, cycleId);
  const result = getCycle(db, cycleId);
  if (!result) throw new Error("cycle_missing");
  return result;
}

export function appendCycleLogIds(
  db: DatabaseSync,
  cycleId: string,
  logIds: string[],
  nowMs = Date.now(),
): CycleRecord {
  const cycle = getCycle(db, cycleId);
  if (!cycle) throw new Error("cycle_missing");
  const merged = [...new Set([...cycle.composeLogIds, ...logIds.filter(Boolean)])];
  db.prepare("UPDATE cycle_records SET compose_log_ids_json = ?, updated_at_ms = ? WHERE cycle_id = ?").run(JSON.stringify(merged), nowMs, cycleId);
  const result = getCycle(db, cycleId);
  if (!result) throw new Error("cycle_missing");
  return result;
}

export function getInboxEvent(db: DatabaseSync, id: string): InboxEvent | null {
  return mapInbox(db.prepare("SELECT * FROM inbox_events WHERE id = ?").get(id));
}

export function appendInboxEvent(db: DatabaseSync, input: AppendInboxEventInput): InboxEvent {
  const id = input.id ?? randomUUID();
  db.prepare(
    `INSERT OR IGNORE INTO inbox_events
       (id, conversation_id, kind, payload_json, created_at_ms, status,
        claim_token, worker_id, lease_expires_at_ms, attempt_count,
        claimed_at_ms, consumed_at_ms, last_error)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, 0, NULL, NULL, NULL)`,
  ).run(id, input.conversationId, input.kind, JSON.stringify(input.payload), input.createdAtMs ?? Date.now());
  const result = getInboxEvent(db, id);
  if (!result) throw new Error("inbox_append_lost");
  return result;
}

export function listInboxEvents(
  db: DatabaseSync,
  conversationId: string,
  options: { status?: InboxConsumerStatus; limit?: number } = {},
): InboxEvent[] {
  const limit = Math.max(1, Math.min(1000, options.limit ?? 100));
  const rows = options.status
    ? db.prepare("SELECT * FROM inbox_events WHERE conversation_id = ? AND status = ? ORDER BY created_at_ms ASC LIMIT ?").all(conversationId, options.status, limit)
    : db.prepare("SELECT * FROM inbox_events WHERE conversation_id = ? ORDER BY created_at_ms ASC LIMIT ?").all(conversationId, limit);
  return rows.map(mapInbox).filter((row): row is InboxEvent => row !== null);
}

export function claimInboxEvent(
  db: DatabaseSync,
  input: { workerId: string; conversationId?: string; eventId?: string; nowMs?: number; leaseMs?: number },
): InboxEvent | null {
  const nowMs = input.nowMs ?? Date.now();
  const leaseMs = Math.max(1, Math.min(15 * 60_000, input.leaseMs ?? 120_000));
  const claimToken = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    const whereId = input.eventId ? "AND id = ?" : "";
    const whereConversation = input.conversationId ? "AND conversation_id = ?" : "";
    const args = input.eventId
      ? input.conversationId ? [nowMs, input.eventId, input.conversationId] : [nowMs, input.eventId]
      : input.conversationId ? [nowMs, input.conversationId] : [nowMs];
    const row = db.prepare(
      `SELECT id FROM inbox_events
       WHERE (status = 'pending' OR status = 'failed_retryable'
          OR (status = 'claimed' AND lease_expires_at_ms IS NOT NULL AND lease_expires_at_ms <= ?))
         ${whereId} ${whereConversation}
       ORDER BY created_at_ms ASC
       LIMIT 1`,
    ).get(...args);
    if (!isRow(row) || typeof row.id !== "string") {
      db.exec("COMMIT");
      return null;
    }
    db.prepare(
      `UPDATE inbox_events
       SET status = 'claimed', claim_token = ?, worker_id = ?,
           lease_expires_at_ms = ?, attempt_count = attempt_count + 1,
           claimed_at_ms = ?, last_error = NULL
       WHERE id = ?`,
    ).run(claimToken, input.workerId, nowMs + leaseMs, nowMs, row.id);
    db.exec("COMMIT");
    return getInboxEvent(db, row.id as string);
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve original */ }
    throw error;
  }
}

export function markInboxConsumed(db: DatabaseSync, id: string, claimToken?: string, nowMs = Date.now()): boolean {
  const result = claimToken
    ? db.prepare("UPDATE inbox_events SET status = 'consumed', consumed_at_ms = ?, lease_expires_at_ms = NULL WHERE id = ? AND status = 'claimed' AND claim_token = ?").run(nowMs, id, claimToken)
    : db.prepare("UPDATE inbox_events SET status = 'consumed', consumed_at_ms = ?, lease_expires_at_ms = NULL WHERE id = ? AND status = 'claimed'").run(nowMs, id);
  return Number(result.changes) === 1;
}

export function markInboxFailed(
  db: DatabaseSync,
  id: string,
  error: string,
  options: { retryable?: boolean; claimToken?: string; nowMs?: number } = {},
): boolean {
  const status = options.retryable === false ? "failed_terminal" : "failed_retryable";
  const result = options.claimToken
    ? db.prepare("UPDATE inbox_events SET status = ?, last_error = ?, lease_expires_at_ms = NULL WHERE id = ? AND claim_token = ?").run(status, error.slice(0, 1000), id, options.claimToken)
    : db.prepare("UPDATE inbox_events SET status = ?, last_error = ?, lease_expires_at_ms = NULL WHERE id = ?").run(status, error.slice(0, 1000), id);
  return Number(result.changes) === 1;
}
