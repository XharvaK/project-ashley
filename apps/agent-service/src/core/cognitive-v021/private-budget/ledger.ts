import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR,
  type PrivateBudgetAdmission,
  type PrivateBudgetPolicy,
  type PrivateBudgetReservation,
} from "../types.js";
import { advancePolicyClock } from "./policy-time-ledger.js";

export const PRIVATE_THOUGHT_POLICY_ID = "ashley.private_thought.v1" as const;
export const PRIVATE_THOUGHT_WINDOW_MS = 3_600_000 as const;
export const PRIVATE_THOUGHT_CLOCK_DISCONTINUITY_MS = 300_000 as const;

export const DEFAULT_PRIVATE_THOUGHT_POLICY: PrivateBudgetPolicy = Object.freeze({
  policyId: PRIVATE_THOUGHT_POLICY_ID,
  limit: PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR,
  windowMs: PRIVATE_THOUGHT_WINDOW_MS,
  clockDiscontinuityMs: PRIVATE_THOUGHT_CLOCK_DISCONTINUITY_MS,
});

export type PrivateBudgetDispatchBinding = Readonly<{
  sidecar: DatabaseSync;
  reservationId: string;
}>;

export type PrivateBudgetProjection = Readonly<{
  source: "private_budget_ledger";
  policyId: string;
  limit: number;
  windowMs: number;
  policyTimeMs: number | null;
  lowerBoundMs: number | null;
  clockState: "stable" | "clock_reconciliation" | "migration_epoch_required";
  discrepancyMs: number | null;
  consumingCount: number;
  remaining: number;
  stateCounts: Readonly<Record<PrivateBudgetReservation["state"], number>>;
}>;

type ReservationRow = Record<string, unknown>;
type ClockRow = {
  last_policy_now_ms: number;
  clock_state: "stable" | "clock_reconciliation";
  discrepancy_ms: number;
};

function budgetError(code: string): Error {
  return new Error(code);
}

function requiredText(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw budgetError(code);
  return value;
}

function validTime(value: number, code = "policy_clock_invalid"): number {
  if (!Number.isFinite(value) || value < 0) throw budgetError(code);
  return Math.floor(value);
}

function now(input?: number): number {
  return validTime(input ?? Date.now(), "private_budget_time_invalid");
}

function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (caught) {
    try { db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
    throw caught;
  }
}

function reservationFromRow(row: ReservationRow): PrivateBudgetReservation {
  return {
    reservationId: String(row.reservation_id),
    admissionId: String(row.admission_id),
    wakeId: String(row.wake_id),
    conversationId: String(row.conversation_id),
    policyId: String(row.policy_id),
    state: row.state as PrivateBudgetReservation["state"],
    policyTimeMs: Number(row.policy_time_ms),
    invocationId: row.invocation_id == null ? null : String(row.invocation_id),
    attemptId: row.attempt_id == null ? null : String(row.attempt_id),
    dispatchTruth: row.dispatch_truth as PrivateBudgetReservation["dispatchTruth"],
    releaseProofRef: row.release_proof_ref == null ? null : String(row.release_proof_ref),
  };
}

function reservationRow(db: DatabaseSync, reservationId: string): ReservationRow | undefined {
  return db.prepare("SELECT * FROM private_budget_reservations WHERE reservation_id = ?").get(reservationId) as ReservationRow | undefined;
}

function reservationRequired(db: DatabaseSync, reservationId: string): PrivateBudgetReservation {
  const row = reservationRow(db, reservationId);
  if (!row) throw budgetError("reservation_missing");
  return reservationFromRow(row);
}

export function getPrivateReservation(db: DatabaseSync, reservationId: string): PrivateBudgetReservation | null {
  const row = reservationRow(db, reservationId);
  return row ? reservationFromRow(row) : null;
}

export function getPrivateReservationRequired(db: DatabaseSync, reservationId: string): PrivateBudgetReservation {
  return reservationRequired(db, requiredText(reservationId, "reservation_id_required"));
}

function clockRow(db: DatabaseSync, policyId: string): ClockRow | undefined {
  return db.prepare(
    "SELECT last_policy_now_ms, clock_state, discrepancy_ms FROM private_budget_policy_clock WHERE policy_id = ?",
  ).get(policyId) as ClockRow | undefined;
}

function consumingCount(db: DatabaseSync, conversationId: string, policyId: string, policyTimeMs: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
       FROM private_budget_reservations
      WHERE conversation_id = ? AND policy_id = ?
        AND policy_time_ms > ?
        AND state IN ('held', 'committed', 'reconcile_required')`,
  ).get(conversationId, policyId, policyTimeMs - DEFAULT_PRIVATE_THOUGHT_POLICY.windowMs) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function expireInTransaction(db: DatabaseSync, conversationId: string, policyId: string, policyTimeMs: number): number {
  const result = db.prepare(
    `UPDATE private_budget_reservations
        SET state = 'expired', updated_at_ms = ?
      WHERE conversation_id = ? AND policy_id = ?
        AND policy_time_ms <= ?
        AND state IN ('held', 'committed', 'reconcile_required')`,
  ).run(policyTimeMs, conversationId, policyId, policyTimeMs - DEFAULT_PRIVATE_THOUGHT_POLICY.windowMs);
  return Number(result.changes ?? 0);
}

function verifyWakeForAdmission(db: DatabaseSync, input: { wakeId: string; conversationId: string }): void {
  const row = db.prepare("SELECT conversation_id, state FROM wakes WHERE wake_id = ?").get(input.wakeId) as { conversation_id?: unknown; state?: unknown } | undefined;
  if (!row) throw budgetError("wake_missing");
  if (String(row.conversation_id) !== input.conversationId) throw budgetError("wake_conversation_conflict");
  if (row.state === "terminal" || row.state === "reconciling" || row.state === "consequence_pending") throw budgetError("wake_not_dispatchable");
}

function validateAdmission(input: { admissionId: string; wakeId: string; conversationId: string; policyId: string; wallClockNowMs: number }): number {
  requiredText(input.admissionId, "admission_id_required");
  requiredText(input.wakeId, "wake_id_required");
  requiredText(input.conversationId, "conversation_id_required");
  requiredText(input.policyId, "policy_id_required");
  return validTime(input.wallClockNowMs);
}

/** Reserve one private Thought opportunity. Clock, expiry, count, and insert share one write transaction. */
export function reservePrivateThought(
  db: DatabaseSync,
  input: { admissionId: string; wakeId: string; conversationId: string; policyId: string; wallClockNowMs: number },
): PrivateBudgetAdmission {
  const wallClockNowMs = validateAdmission(input);
  return transaction(db, () => {
    const existingRow = db.prepare("SELECT * FROM private_budget_reservations WHERE admission_id = ?").get(input.admissionId) as ReservationRow | undefined;
    if (existingRow) {
      const existing = reservationFromRow(existingRow);
      if (
        existing.wakeId !== input.wakeId
        || existing.conversationId !== input.conversationId
        || existing.policyId !== input.policyId
      ) throw budgetError("admission_identity_conflict");
      const clock = clockRow(db, input.policyId);
      const projectionTime = Math.max(existing.policyTimeMs, Number(clock?.last_policy_now_ms ?? existing.policyTimeMs), wallClockNowMs);
      const remaining = Math.max(0, DEFAULT_PRIVATE_THOUGHT_POLICY.limit - consumingCount(db, input.conversationId, input.policyId, projectionTime));
      return { kind: "existing", reservation: existing, remaining };
    }

    verifyWakeForAdmission(db, input);
    const currentClock = clockRow(db, input.policyId);
    if (!currentClock) {
      db.prepare(
        `INSERT INTO private_budget_policy_clock
          (policy_id, last_policy_now_ms, clock_state, discrepancy_ms)
         VALUES (?, ?, 'clock_reconciliation', 0)`,
      ).run(input.policyId, wallClockNowMs);
      return { kind: "refused", reason: "clock_reconciliation", remaining: 0 };
    }

    const policyTime = advancePolicyClock(
      db,
      input.policyId,
      wallClockNowMs,
      DEFAULT_PRIVATE_THOUGHT_POLICY.clockDiscontinuityMs,
    );
    if (currentClock.clock_state !== "stable" || policyTime.state !== "stable") {
      return { kind: "refused", reason: "clock_reconciliation", remaining: 0 };
    }

    expireInTransaction(db, input.conversationId, input.policyId, policyTime.policyTimeMs);
    const used = consumingCount(db, input.conversationId, input.policyId, policyTime.policyTimeMs);
    if (used >= DEFAULT_PRIVATE_THOUGHT_POLICY.limit) {
      return { kind: "refused", reason: "capacity_exhausted", remaining: 0 };
    }

    const timestamp = wallClockNowMs;
    const reservationId = `private-reservation:${randomUUID()}`;
    db.prepare(
      `INSERT INTO private_budget_reservations
        (reservation_id, admission_id, wake_id, conversation_id, policy_id, state,
         policy_time_ms, dispatch_truth, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, 'held', ?, 'not_bound', ?, ?)`,
    ).run(
      reservationId,
      input.admissionId,
      input.wakeId,
      input.conversationId,
      input.policyId,
      policyTime.policyTimeMs,
      timestamp,
      timestamp,
    );
    return {
      kind: "reserved",
      reservation: reservationRequired(db, reservationId),
      remaining: DEFAULT_PRIVATE_THOUGHT_POLICY.limit - used - 1,
    };
  });
}

/** Bind the reservation to one exact Model Fabric invocation and attempt. */
export function bindPrivateReservationInvocation(
  db: DatabaseSync,
  input: { reservationId: string; invocationId: string; attemptId: string; nowMs?: number },
): PrivateBudgetReservation {
  const timestamp = now(input.nowMs);
  requiredText(input.reservationId, "reservation_id_required");
  requiredText(input.invocationId, "invocation_id_required");
  requiredText(input.attemptId, "attempt_id_required");
  return transaction(db, () => {
    const current = reservationRequired(db, input.reservationId);
    if (current.state === "committed" && current.invocationId === input.invocationId && current.attemptId === input.attemptId) return current;
    if (current.state !== "held") throw budgetError("reservation_state_conflict");
    if (current.invocationId != null) {
      if (current.invocationId === input.invocationId && current.attemptId === input.attemptId) return current;
      throw budgetError("invocation_binding_conflict");
    }
    try {
      const result = db.prepare(
        `UPDATE private_budget_reservations
            SET invocation_id = ?, attempt_id = ?, dispatch_truth = 'not_started', updated_at_ms = ?
          WHERE reservation_id = ? AND state = 'held' AND invocation_id IS NULL`,
      ).run(input.invocationId, input.attemptId, timestamp, input.reservationId);
      if (Number(result.changes ?? 0) !== 1) throw budgetError("invocation_binding_conflict");
    } catch (caught) {
      if (caught instanceof Error && caught.message === "invocation_binding_conflict") throw caught;
      throw budgetError("invocation_binding_conflict");
    }
    return reservationRequired(db, input.reservationId);
  });
}

/** Commit capacity at the exact W0 dispatch-attempted boundary. */
export function commitPrivateDispatch(
  db: DatabaseSync,
  input: { reservationId: string; invocationId: string; attemptId: string; nowMs?: number },
): PrivateBudgetReservation {
  const timestamp = now(input.nowMs);
  requiredText(input.reservationId, "reservation_id_required");
  requiredText(input.invocationId, "invocation_id_required");
  requiredText(input.attemptId, "attempt_id_required");
  return transaction(db, () => {
    const current = reservationRequired(db, input.reservationId);
    if (current.state === "committed" && current.invocationId === input.invocationId && current.attemptId === input.attemptId) return current;
    const canCommit = current.state === "held"
      || (current.state === "reconcile_required" && current.dispatchTruth === "unknown");
    if (!canCommit) throw budgetError("dispatch_without_reservation");
    if (current.invocationId !== input.invocationId || current.attemptId !== input.attemptId) throw budgetError("dispatch_without_reservation");
    const result = db.prepare(
      `UPDATE private_budget_reservations
          SET state = 'committed', dispatch_truth = 'attempted', updated_at_ms = ?
        WHERE reservation_id = ? AND state IN ('held', 'reconcile_required')
          AND dispatch_truth IN ('not_started', 'unknown')
          AND invocation_id = ? AND attempt_id = ?`,
    ).run(timestamp, input.reservationId, input.invocationId, input.attemptId);
    if (Number(result.changes ?? 0) !== 1) throw budgetError("dispatch_without_reservation");
    return reservationRequired(db, input.reservationId);
  });
}

/** Record a provider response without releasing the already-consumed reservation. */
export function recordPrivateProviderResponse(
  db: DatabaseSync,
  input: { reservationId: string; invocationId: string; attemptId: string; nowMs?: number },
): PrivateBudgetReservation {
  const timestamp = now(input.nowMs);
  return transaction(db, () => {
    const current = reservationRequired(db, input.reservationId);
    if (
      current.state === "committed"
      && current.invocationId === input.invocationId
      && current.attemptId === input.attemptId
      && current.dispatchTruth === "responded"
    ) return current;
    if (current.state !== "committed" || current.invocationId !== input.invocationId || current.attemptId !== input.attemptId) throw budgetError("reservation_state_conflict");
    db.prepare(
      `UPDATE private_budget_reservations
          SET dispatch_truth = 'responded', updated_at_ms = ?
        WHERE reservation_id = ? AND state = 'committed'
          AND invocation_id = ? AND attempt_id = ?`,
    ).run(timestamp, input.reservationId, input.invocationId, input.attemptId);
    return reservationRequired(db, input.reservationId);
  });
}

/** Release only when a durable no-dispatch proof is supplied. */
export function releasePrivateReservation(
  db: DatabaseSync,
  input: {
    reservationId: string;
    proofRef: string;
    dispatchTruth?: "not_started";
    invocationId?: string;
    attemptId?: string;
    nowMs?: number;
  },
): PrivateBudgetReservation {
  const timestamp = now(input.nowMs);
  if (input.dispatchTruth !== "not_started") throw budgetError("release_proof_missing");
  requiredText(input.proofRef, "release_proof_missing");
  return transaction(db, () => {
    const current = reservationRequired(db, input.reservationId);
    if (current.state === "released") {
      if (current.releaseProofRef === input.proofRef) return current;
      throw budgetError("release_proof_conflict");
    }
    if (current.state !== "held" && current.state !== "reconcile_required") throw budgetError("reservation_state_conflict");
    if (current.invocationId != null && input.invocationId != null && current.invocationId !== input.invocationId) throw budgetError("release_proof_conflict");
    if (current.attemptId != null && input.attemptId != null && current.attemptId !== input.attemptId) throw budgetError("release_proof_conflict");
    const result = db.prepare(
      `UPDATE private_budget_reservations
          SET state = 'released', dispatch_truth = 'not_started',
              invocation_id = COALESCE(invocation_id, ?),
              attempt_id = COALESCE(attempt_id, ?),
              release_proof_ref = ?, updated_at_ms = ?
        WHERE reservation_id = ? AND state IN ('held', 'reconcile_required')`,
    ).run(input.invocationId ?? null, input.attemptId ?? null, input.proofRef, timestamp, input.reservationId);
    if (Number(result.changes ?? 0) !== 1) throw budgetError("reservation_state_conflict");
    return reservationRequired(db, input.reservationId);
  });
}

/** Preserve capacity when W0/Model Fabric cannot prove that dispatch did not begin. */
export function markPrivateReservationUnknown(
  db: DatabaseSync,
  reservationId: string,
  options: { nowMs?: number } = {},
): PrivateBudgetReservation {
  const timestamp = now(options.nowMs);
  requiredText(reservationId, "reservation_id_required");
  return transaction(db, () => {
    const current = reservationRequired(db, reservationId);
    if (current.state === "reconcile_required") return current;
    if (current.state !== "held") {
      if (current.state === "released" || current.state === "expired") return current;
      throw budgetError("contradictory_dispatch_truth");
    }
    db.prepare(
      `UPDATE private_budget_reservations
          SET state = 'reconcile_required', dispatch_truth = 'unknown', updated_at_ms = ?
        WHERE reservation_id = ? AND state = 'held'`,
    ).run(timestamp, reservationId);
    return reservationRequired(db, reservationId);
  });
}

/** Expire only reservations outside the rolling window; clock reconciliation never refills by lowering high-water. */
export function expirePrivateReservations(
  db: DatabaseSync,
  input: { policyId: string; wallClockNowMs: number; conversationId?: string },
): { policyTimeMs: number; expired: number } {
  const wallClockNowMs = validTime(input.wallClockNowMs);
  requiredText(input.policyId, "policy_id_required");
  return transaction(db, () => {
    const clock = clockRow(db, input.policyId);
    if (!clock) return { policyTimeMs: wallClockNowMs, expired: 0 };
    const policy = advancePolicyClock(db, input.policyId, wallClockNowMs, DEFAULT_PRIVATE_THOUGHT_POLICY.clockDiscontinuityMs);
    const clause = input.conversationId ? " AND conversation_id = ?" : "";
    const args = input.conversationId
      ? [policy.policyTimeMs, input.policyId, policy.policyTimeMs - DEFAULT_PRIVATE_THOUGHT_POLICY.windowMs, input.conversationId]
      : [policy.policyTimeMs, input.policyId, policy.policyTimeMs - DEFAULT_PRIVATE_THOUGHT_POLICY.windowMs];
    const result = db.prepare(
      `UPDATE private_budget_reservations
          SET state = 'expired', updated_at_ms = ?
        WHERE policy_id = ? AND policy_time_ms <= ?
          AND state IN ('held', 'committed', 'reconcile_required')${clause}`,
    ).run(...args);
    return { policyTimeMs: policy.policyTimeMs, expired: Number(result.changes ?? 0) };
  });
}

/** Read-only authoritative budget projection for delivery gates and diagnostics. */
export function getPrivateBudgetProjection(
  db: DatabaseSync,
  input: { conversationId: string; policyId: string; wallClockNowMs?: number },
): PrivateBudgetProjection {
  requiredText(input.conversationId, "conversation_id_required");
  requiredText(input.policyId, "policy_id_required");
  const wallClockNowMs = now(input.wallClockNowMs);
  const clock = clockRow(db, input.policyId);
  const policyTimeMs = clock ? Math.max(Number(clock.last_policy_now_ms), wallClockNowMs) : null;
  const discrepancyMs = clock ? Math.abs(wallClockNowMs - Number(clock.last_policy_now_ms)) : null;
  const clockState = !clock
    ? "migration_epoch_required" as const
    : clock.clock_state === "clock_reconciliation" || (discrepancyMs ?? 0) > DEFAULT_PRIVATE_THOUGHT_POLICY.clockDiscontinuityMs
      ? "clock_reconciliation" as const
      : "stable" as const;
  const stateCounts = {
    held: 0,
    committed: 0,
    released: 0,
    reconcile_required: 0,
    expired: 0,
  } satisfies Record<PrivateBudgetReservation["state"], number>;
  const rows = db.prepare(
    `SELECT state, COUNT(*) AS count FROM private_budget_reservations
      WHERE conversation_id = ? AND policy_id = ? GROUP BY state`,
  ).all(input.conversationId, input.policyId) as Array<{ state?: string; count?: number }>;
  for (const row of rows) {
    if (row.state && row.state in stateCounts) stateCounts[row.state as PrivateBudgetReservation["state"]] = Number(row.count ?? 0);
  }
  const consuming = policyTimeMs == null ? 0 : consumingCount(db, input.conversationId, input.policyId, policyTimeMs);
  return {
    source: "private_budget_ledger",
    policyId: input.policyId,
    limit: DEFAULT_PRIVATE_THOUGHT_POLICY.limit,
    windowMs: DEFAULT_PRIVATE_THOUGHT_POLICY.windowMs,
    policyTimeMs,
    lowerBoundMs: policyTimeMs == null ? null : policyTimeMs - DEFAULT_PRIVATE_THOUGHT_POLICY.windowMs,
    clockState,
    discrepancyMs,
    consumingCount: consuming,
    remaining: clockState === "stable" ? Math.max(0, DEFAULT_PRIVATE_THOUGHT_POLICY.limit - consuming) : 0,
    stateCounts,
  };
}
