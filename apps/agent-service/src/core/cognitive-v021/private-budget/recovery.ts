import type { DatabaseSync } from "node:sqlite";
import {
  commitPrivateDispatch,
  expirePrivateReservations,
  getPrivateReservation,
  markPrivateReservationUnknown,
  recordPrivateProviderResponse,
  releasePrivateReservation,
  type PrivateBudgetProjection,
} from "./ledger.js";
import type { PrivateBudgetReservation } from "../types.js";

export type PrivateBudgetReceiptTruth =
  | { dispatchTruth: "not_started"; proofRef: string }
  | { dispatchTruth: "attempted" | "responded" | "unknown"; proofRef?: string };

export type PrivateBudgetRecoveryResult = {
  released: number;
  committed: number;
  reconciling: number;
  expired: number;
};

export type PrivateBudgetRecoveryOptions = {
  wallClockNowMs?: number;
  resolveReceipt?: (reservation: PrivateBudgetReservation) => PrivateBudgetReceiptTruth | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reconcile stranded reservations without guessing. An unbound reservation
 * proves that the W0 binding gate was never crossed; every bound reservation
 * requires a durable receipt resolver or remains consuming.
 */
export function recoverPrivateBudget(
  db: DatabaseSync,
  options: PrivateBudgetRecoveryOptions = {},
): PrivateBudgetRecoveryResult {
  const nowMs = options.wallClockNowMs ?? Date.now();
  const result: PrivateBudgetRecoveryResult = { released: 0, committed: 0, reconciling: 0, expired: 0 };

  const policies = db.prepare("SELECT DISTINCT policy_id FROM private_budget_reservations ORDER BY policy_id").all() as Array<{ policy_id?: unknown }>;
  for (const row of policies) {
    const policyId = text(row.policy_id);
    if (!policyId) continue;
    try {
      result.expired += expirePrivateReservations(db, { policyId, wallClockNowMs: nowMs }).expired;
    } catch {
      // A malformed clock must not turn recovery into an optimistic release.
    }
  }

  const stranded = db.prepare(
    `SELECT reservation_id FROM private_budget_reservations
      WHERE state IN ('held', 'reconcile_required')
      ORDER BY created_at_ms ASC, reservation_id ASC`,
  ).all() as Array<{ reservation_id?: unknown }>;

  for (const row of stranded) {
    const reservationId = text(row.reservation_id);
    if (!reservationId) continue;
    const reservation = getPrivateReservation(db, reservationId);
    if (!reservation || (reservation.state !== "held" && reservation.state !== "reconcile_required")) continue;

    if (!reservation.invocationId && reservation.dispatchTruth === "not_bound") {
      try {
        releasePrivateReservation(db, {
          reservationId,
          proofRef: `recovery:${reservationId}:w0-binding-not-crossed`,
          dispatchTruth: "not_started",
          nowMs,
        });
        result.released += 1;
      } catch {
        result.reconciling += 1;
      }
      continue;
    }

    const receipt = options.resolveReceipt?.(reservation) ?? null;
    if (receipt?.dispatchTruth === "not_started" && receipt.proofRef) {
      try {
        releasePrivateReservation(db, {
          reservationId,
          proofRef: receipt.proofRef,
          dispatchTruth: "not_started",
          invocationId: reservation.invocationId ?? undefined,
          attemptId: reservation.attemptId ?? undefined,
          nowMs,
        });
        result.released += 1;
      } catch {
        result.reconciling += 1;
      }
      continue;
    }

    if (
      (receipt?.dispatchTruth === "attempted" || receipt?.dispatchTruth === "responded")
      && reservation.invocationId
      && reservation.attemptId
    ) {
      try {
        commitPrivateDispatch(db, {
          reservationId,
          invocationId: reservation.invocationId,
          attemptId: reservation.attemptId,
          nowMs,
        });
        if (receipt.dispatchTruth === "responded") {
          recordPrivateProviderResponse(db, {
            reservationId,
            invocationId: reservation.invocationId,
            attemptId: reservation.attemptId,
            nowMs,
          });
        }
        result.committed += 1;
        continue;
      } catch {
        // Fall through to the conservative unknown state.
      }
    }

    try {
      const current = getPrivateReservation(db, reservationId);
      if (current?.state === "held") markPrivateReservationUnknown(db, reservationId, { nowMs });
      result.reconciling += 1;
    } catch {
      result.reconciling += 1;
    }
  }

  return result;
}

/** Read-only helper used by diagnostics callers that already have a projection. */
export function privateBudgetRecoveryStatus(projection: PrivateBudgetProjection): "ready" | "blocked" {
  return projection.clockState === "stable" ? "ready" : "blocked";
}
