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
import {
  admitWakeInTransaction,
  getWakeRequired,
} from "../wake/ledger.js";
import { occurrenceIdFor } from "../wake/identity.js";
import {
  claimNextDurableWork,
  getOpenDurableAttempt,
  settleDurableAttempt,
  type DurableSettlement,
} from "../retry/ledger.js";
import { getActiveDeferredFrontier } from "../frontier/ledger.js";

export type AdmitCycleInput = {
  conversationId: ConversationId;
  wakeId?: string;
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
  wakeId?: string;
  conversationId: ConversationId;
  kind: string;
  payload: unknown;
  createdAtMs?: number;
  capturedAuthorityRevision?: number;
  initialTerminalReason?: string | null;
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

function payloadRecord(value: unknown): DbRow {
  return isRow(value) && !Array.isArray(value) ? value : {};
}

function triggerKindForInbox(kind: string): CycleTriggerKind {
  if (kind === "future_trigger_due") return "future_trigger_due";
  if (kind === "idle_opportunity") return "idle_opportunity";
  if (kind === "subscription_item") return "subscription_item";
  if (kind === "recovery" || kind === "observation_or_receipt") return "recovery";
  return "owner_message";
}

function mapCycle(row: unknown): CycleRecord | null {
  if (!isRow(row)) return null;
  const wakeId = stringValue(row.wake_id);
  if (!wakeId) return null;
  return {
    cycleId: stringValue(row.cycle_id),
    conversationId: stringValue(row.conversation_id),
    generation: numberValue(row.generation),
    wakeId,
    triggerKind: stringValue(row.trigger_kind) as CycleTriggerKind,
    triggerRef: stringValue(row.trigger_ref),
    state: stringValue(row.state) as CycleState,
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
  const wakeId = stringValue(row.wake_id);
  if (!wakeId) return null;
  let payload: unknown = null;
  try {
    payload = JSON.parse(stringValue(row.payload_json, "null"));
  } catch {
    payload = null;
  }
  return {
    id: stringValue(row.id),
    conversationId: stringValue(row.conversation_id),
    wakeId,
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
    terminalReason: row.terminal_reason == null ? null : stringValue(row.terminal_reason),
  };
}

function cycleForWake(db: DatabaseSync, wakeId: string): CycleRecord | null {
  return mapCycle(db.prepare("SELECT * FROM cycle_records WHERE wake_id = ? LIMIT 1").get(wakeId));
}

function admitCycleInTransaction(db: DatabaseSync, input: AdmitCycleInput): CycleRecord {
  if (!input.conversationId.trim()) throw new Error("conversation_id_required");
  if (!input.wakeId?.trim()) throw new Error("wake_required");
  const wake = getWakeRequired(db, input.wakeId);
  if (wake.state === "terminal") throw new Error("wake_terminal");
  if (wake.conversationId !== input.conversationId) throw new Error("wake_conversation_conflict");
  if (input.cycleId && input.cycleId !== wake.cycleId) throw new Error("wake_cycle_conflict");

  const existingByWake = cycleForWake(db, wake.wakeId);
  if (existingByWake) {
    if (input.cycleId && existingByWake.cycleId !== input.cycleId) throw new Error("wake_cycle_conflict");
    return existingByWake;
  }
  const cycleId = input.cycleId ?? wake.cycleId;
  const existing = db.prepare("SELECT * FROM cycle_records WHERE cycle_id = ? LIMIT 1").get(cycleId) as DbRow | undefined;
  if (existing) {
    const existingWakeId = stringValue(existing.wake_id);
    if (existingWakeId !== wake.wakeId) throw new Error("wake_cycle_conflict");
    const result = mapCycle(existing);
    if (!result) throw new Error("cycle_corrupt");
    return result;
  }
  const activeFrontier = getActiveDeferredFrontier(db, input.conversationId);
  if (activeFrontier && activeFrontier.cycleId !== cycleId) {
    throw new Error("conversation_occupied_by_frontier");
  }

  const maxRow = db.prepare("SELECT MAX(generation) AS generation FROM cycle_records WHERE conversation_id = ?").get(input.conversationId) as DbRow | undefined;
  const generation = input.generation ?? numberValue(maxRow?.generation) + 1;
  db.prepare(
    `INSERT INTO cycle_records
       (cycle_id, conversation_id, generation, wake_id, state, trigger_kind, trigger_ref,
        occupant_id, authority_epoch, architecture_epoch, admitted_at_ms, updated_at_ms,
        compose_log_ids_json, preempted_generation)
     VALUES (?, ?, ?, ?, 'admitted', ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
  ).run(
    cycleId,
    input.conversationId,
    generation,
    wake.wakeId,
    input.triggerKind,
    input.triggerRef ?? wake.triggerRef,
    input.occupantId ?? null,
    input.authorityEpoch ?? 1,
    input.architectureEpoch ?? ARCHITECTURE_EPOCH,
    input.nowMs ?? Date.now(),
    input.nowMs ?? Date.now(),
    input.preemptedGeneration ?? null,
  );
  const result = mapCycle(db.prepare("SELECT * FROM cycle_records WHERE cycle_id = ?").get(cycleId));
  if (!result) throw new Error("cycle_admission_lost");
  return result;
}

/** Admit only a cycle that already belongs to a durable wake. */
export function admitCycle(db: DatabaseSync, input: AdmitCycleInput): CycleRecord {
  return admitCycleInTransaction(db, input);
}

export function getCycle(db: DatabaseSync, cycleId: string): CycleRecord | null {
  return mapCycle(db.prepare("SELECT * FROM cycle_records WHERE cycle_id = ?").get(cycleId));
}

export function getCurrentCycle(db: DatabaseSync, conversationId: string, options: { includeIdle?: boolean } = {}): CycleRecord | null {
  const exclusion = options.includeIdle ? "" : "AND state NOT IN ('silent', 'idle')";
  return mapCycle(db.prepare(
    `SELECT * FROM cycle_records
      WHERE conversation_id = ? ${exclusion}
      ORDER BY generation DESC, updated_at_ms DESC LIMIT 1`,
  ).get(conversationId));
}

export function updateCycleState(db: DatabaseSync, cycleId: string, state: CycleState, nowMs = Date.now()): CycleRecord {
  db.prepare("UPDATE cycle_records SET state = ?, updated_at_ms = ? WHERE cycle_id = ?").run(state, nowMs, cycleId);
  const result = getCycle(db, cycleId);
  if (!result) throw new Error("cycle_missing");
  return result;
}

export function appendCycleLogIds(db: DatabaseSync, cycleId: string, logIds: string[], nowMs = Date.now()): CycleRecord {
  const cycle = getCycle(db, cycleId);
  if (!cycle) throw new Error("cycle_missing");
  const merged = [...new Set([...cycle.composeLogIds, ...logIds.filter(Boolean)])];
  db.prepare("UPDATE cycle_records SET compose_log_ids_json = ?, updated_at_ms = ? WHERE cycle_id = ?").run(JSON.stringify(merged), nowMs, cycleId);
  const result = getCycle(db, cycleId);
  if (!result) throw new Error("cycle_missing");
  return result;
}

function appendInboxEventInTransaction(db: DatabaseSync, input: AppendInboxEventInput, id: string): InboxEvent {
  const existing = getInboxEvent(db, id);
  if (existing) return existing;
  const createdAtMs = input.createdAtMs ?? Date.now();
  const payload = payloadRecord(input.payload);
  const requestedCycleId = typeof payload.cycleId === "string" ? payload.cycleId : undefined;
  let wakeId = input.wakeId;
  if (!wakeId && requestedCycleId) {
    const cycle = getCycle(db, requestedCycleId);
    wakeId = cycle?.wakeId;
  }
  if (!wakeId) {
    const admission = admitWakeInTransaction(db, {
      occurrenceId: occurrenceIdFor({ sourceKind: "inbox", triggerRef: id, conversationId: input.conversationId }),
      triggerRef: id,
      sourceKind: "inbox",
      conversationId: input.conversationId,
      cycleId: requestedCycleId,
      triggerKind: triggerKindForInbox(input.kind),
      occupantId: typeof payload.occupantId === "string" ? payload.occupantId : null,
      authorityEpoch: typeof payload.authorityEpoch === "number" ? payload.authorityEpoch : 1,
      capturedAuthorityRevision: input.capturedAuthorityRevision ?? 0,
      nowMs: createdAtMs,
    });
    if (admission.kind === "cancelled" || admission.kind === "stale") throw new Error("wake_terminal");
    wakeId = admission.wake.wakeId;
  }
  const wake = getWakeRequired(db, wakeId);
  if (wake.conversationId !== input.conversationId) throw new Error("wake_conversation_conflict");
  const cycle = admitCycleInTransaction(db, {
    conversationId: input.conversationId,
    wakeId,
    cycleId: requestedCycleId,
    triggerKind: triggerKindForInbox(input.kind),
    triggerRef: typeof payload.triggerRef === "string" ? payload.triggerRef : wake.triggerRef,
    occupantId: typeof payload.occupantId === "string" ? payload.occupantId : null,
    authorityEpoch: typeof payload.authorityEpoch === "number" ? payload.authorityEpoch : 1,
    nowMs: createdAtMs,
  });
  const lineagePayload = isRow(input.payload) && !Array.isArray(input.payload)
    ? { ...input.payload as DbRow, cycleId: cycle.cycleId, wakeId }
    : input.payload;
  const isTerminal = Boolean(input.initialTerminalReason);
  const status = isTerminal ? "consumed" : "pending";
  const state = isTerminal ? "terminal" : "pending";
  const consumedAtMs = isTerminal ? createdAtMs : null;
  db.prepare(
    `INSERT INTO inbox_events
       (id, conversation_id, kind, payload_json, created_at_ms, status, state, terminal_reason, claim_token,
        worker_id, lease_expires_at_ms, attempt_count, claimed_at_ms, consumed_at_ms,
        last_error, wake_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, NULL, ?, NULL, ?)`,
  ).run(
    id,
    input.conversationId,
    input.kind,
    JSON.stringify(lineagePayload),
    createdAtMs,
    status,
    state,
    input.initialTerminalReason ?? null,
    consumedAtMs,
    wakeId,
  );
  const result = getInboxEvent(db, id);
  if (!result) throw new Error("inbox_append_lost");
  return result;
}

export function getInboxEvent(db: DatabaseSync, id: string): InboxEvent | null {
  return mapInbox(db.prepare("SELECT * FROM inbox_events WHERE id = ?").get(id));
}

/** Inbox admission is itself a wake producer when no existing wake is supplied. */
export function appendInboxEvent(db: DatabaseSync, input: AppendInboxEventInput): InboxEvent {
  const id = input.id ?? randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = appendInboxEventInTransaction(db, input, id);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve the append error */ }
    throw error;
  }
}

export { appendInboxEventInTransaction };

export function listInboxEvents(db: DatabaseSync, conversationId: string, options: { status?: InboxConsumerStatus; limit?: number } = {}): InboxEvent[] {
  const limit = Math.max(1, Math.min(1000, options.limit ?? 100));
  const rows = options.status
    ? db.prepare("SELECT * FROM inbox_events WHERE conversation_id = ? AND status = ? ORDER BY created_at_ms ASC LIMIT ?").all(conversationId, options.status, limit)
    : db.prepare("SELECT * FROM inbox_events WHERE conversation_id = ? ORDER BY created_at_ms ASC LIMIT ?").all(conversationId, limit);
  return rows.map(mapInbox).filter((row): row is InboxEvent => row !== null);
}

export function claimInboxEvent(db: DatabaseSync, input: { workerId: string; conversationId?: string; eventId?: string; nowMs?: number; leaseMs?: number }): InboxEvent | null {
  const nowMs = input.nowMs ?? Date.now();
  try {
    const claimed = claimNextDurableWork(db, {
      workerId: input.workerId,
      conversationId: input.conversationId,
      eventId: input.eventId,
      nowMs,
      leaseMs: input.leaseMs,
    });
    if (!claimed) return null;
    const result = getInboxEvent(db, claimed.eventId);
    return result
      ? { ...result, durableAttemptId: claimed.attemptId, durableAttemptOrdinal: claimed.ordinal }
      : null;
  } catch (error) {
    if (error instanceof Error && [
      "lease_held",
      "wake_not_claimable",
      "wake_reconciliation_required",
      "receipt_reconciliation_required",
      "durable_work_not_eligible",
    ].includes(error.message)) return null;
    throw error;
  }
}

export function markInboxConsumed(db: DatabaseSync, id: string, claimToken?: string, nowMs = Date.now()): boolean {
  try {
    const current = getInboxEvent(db, id);
    if (!current) return false;
    if (current.status === "consumed") return true;
    if (claimToken && current.claimToken !== claimToken) return false;
    const open = getOpenDurableAttempt(db, id);
    if (!open || (claimToken && open.claimToken !== claimToken)) return false;
    return settleDurableAttempt(db, {
      eventId: id,
      attemptId: open.attemptId,
      claimToken: open.claimToken,
      result: { kind: "completed" },
      nowMs,
    }).kind === "completed";
  } catch (error) {
    if (error instanceof Error && ["durable_work_claim_lost", "durable_attempt_missing", "wake_reconciliation_required"].includes(error.message)) return false;
    throw error;
  }
}

export function markInboxFailed(db: DatabaseSync, id: string, error: string, options: { retryable?: boolean; claimToken?: string; nowMs?: number } = {}): boolean {
  const nowMs = options.nowMs ?? Date.now();
  try {
    const current = getInboxEvent(db, id);
    if (!current) return false;
    if (options.claimToken && current.claimToken !== options.claimToken) return false;
    const open = getOpenDurableAttempt(db, id);
    if (!open || (options.claimToken && open.claimToken !== options.claimToken)) return false;
    const result: DurableSettlement = {
      kind: "failed",
      failureClass: "unclassified_internal",
      errorCode: error.slice(0, 1000),
      dispatchTruth: "provider_responded",
    };
    return settleDurableAttempt(db, {
      eventId: id,
      attemptId: open.attemptId,
      claimToken: open.claimToken,
      result,
      nowMs,
    }).kind !== "completed";
  } catch (caught) {
    if (caught instanceof Error && ["durable_work_claim_lost", "durable_attempt_missing", "wake_reconciliation_required"].includes(caught.message)) return false;
    throw caught;
  }
}
