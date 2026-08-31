import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openCognitiveSidecarDb } from "../sidecar/db.js";
import { admitWake } from "../wake/ledger.js";
import { bindPrivateReservationInvocation, commitPrivateDispatch, getPrivateReservation, markPrivateReservationUnknown, reservePrivateThought } from "./ledger.js";
import { reconcilePolicyClock } from "./policy-time-ledger.js";
import { recoverPrivateBudget } from "./recovery.js";

const BASE = 3_000_000;

function sidecar(): DatabaseSync {
  const db = openCognitiveSidecarDb(new DatabaseSync(":memory:"), { dataPlane: { kind: "isolated" } });
  reconcilePolicyClock(db, { policyId: "private-v1", wallClockNowMs: BASE, authorizationRef: "owner:recovery-epoch" });
  return db;
}

function reservation(db: DatabaseSync, suffix: string) {
  const wake = admitWake(db, {
    occurrenceId: `occurrence:recovery:${suffix}`,
    triggerRef: `trigger:recovery:${suffix}`,
    sourceKind: "idle",
    conversationId: "conversation:recovery",
    cycleId: `cycle:recovery:${suffix}`,
    capturedAuthorityRevision: 1,
    nowMs: BASE,
  });
  const result = reservePrivateThought(db, {
    admissionId: `admission:recovery:${suffix}`,
    wakeId: wake.wake.wakeId,
    conversationId: "conversation:recovery",
    policyId: "private-v1",
    wallClockNowMs: BASE,
  });
  if (result.kind !== "reserved") throw new Error("recovery_reservation_missing");
  return result.reservation;
}

describe("private budget restart and crash recovery", () => {
  it("releases an unbound hold because the W0 binding gate was never crossed", () => {
    const db = sidecar();
    try {
      const item = reservation(db, "unbound");
      expect(recoverPrivateBudget(db, { wallClockNowMs: BASE + 1 })).toMatchObject({ released: 1, reconciling: 0 });
      expect(getPrivateReservation(db, item.reservationId)).toMatchObject({ state: "released", dispatchTruth: "not_started" });
    } finally {
      db.close();
    }
  });

  it("keeps a bound hold consuming when no durable receipt proves no dispatch", () => {
    const db = sidecar();
    try {
      const item = reservation(db, "unknown");
      bindPrivateReservationInvocation(db, { reservationId: item.reservationId, invocationId: "mf-invocation:unknown", attemptId: "mf-attempt:unknown", nowMs: BASE });
      expect(recoverPrivateBudget(db, { wallClockNowMs: BASE + 1 })).toMatchObject({ reconciling: 1 });
      expect(getPrivateReservation(db, item.reservationId)).toMatchObject({ state: "reconcile_required", dispatchTruth: "unknown" });
    } finally {
      db.close();
    }
  });

  it("uses a receipt resolver to release before-dispatch and commit after-dispatch states", () => {
    const db = sidecar();
    try {
      const notStarted = reservation(db, "receipt-not-started");
      bindPrivateReservationInvocation(db, { reservationId: notStarted.reservationId, invocationId: "mf-invocation:not-started", attemptId: "mf-attempt:not-started", nowMs: BASE });
      const attempted = reservation(db, "receipt-attempted");
      bindPrivateReservationInvocation(db, { reservationId: attempted.reservationId, invocationId: "mf-invocation:attempted", attemptId: "mf-attempt:attempted", nowMs: BASE });
      const recovered = recoverPrivateBudget(db, {
        wallClockNowMs: BASE + 1,
        resolveReceipt: (item) => item.reservationId === notStarted.reservationId
          ? { dispatchTruth: "not_started", proofRef: "mf-receipt:not-started" }
          : item.reservationId === attempted.reservationId
            ? { dispatchTruth: "attempted" }
            : null,
      });
      expect(recovered).toMatchObject({ released: 1, committed: 1 });
      expect(getPrivateReservation(db, notStarted.reservationId)).toMatchObject({ state: "released" });
      expect(getPrivateReservation(db, attempted.reservationId)).toMatchObject({ state: "committed", dispatchTruth: "attempted" });
    } finally {
      db.close();
    }
  });

  it("can settle an already-reconciling reservation only with the exact bound receipt", () => {
    const db = sidecar();
    try {
      const item = reservation(db, "reconcile-attempted");
      bindPrivateReservationInvocation(db, {
        reservationId: item.reservationId,
        invocationId: "mf-invocation:reconcile-attempted",
        attemptId: "mf-attempt:reconcile-attempted",
        nowMs: BASE,
      });
      markPrivateReservationUnknown(db, item.reservationId, { nowMs: BASE + 1 });
      expect(recoverPrivateBudget(db, {
        wallClockNowMs: BASE + 2,
        resolveReceipt: (candidate) => candidate.reservationId === item.reservationId
          ? { dispatchTruth: "attempted" }
          : null,
      })).toMatchObject({ committed: 1, released: 0, reconciling: 0 });
      expect(getPrivateReservation(db, item.reservationId)).toMatchObject({ state: "committed", dispatchTruth: "attempted" });
    } finally {
      db.close();
    }
  });

  it("preserves the rolling-hour consumption across restart and expires committed work only at the boundary", () => {
    const db = sidecar();
    try {
      const item = reservation(db, "restart");
      bindPrivateReservationInvocation(db, { reservationId: item.reservationId, invocationId: "mf-invocation:restart", attemptId: "mf-attempt:restart", nowMs: BASE });
      commitPrivateDispatch(db, { reservationId: item.reservationId, invocationId: "mf-invocation:restart", attemptId: "mf-attempt:restart", nowMs: BASE });
      expect(recoverPrivateBudget(db, { wallClockNowMs: BASE + 1 })).toMatchObject({ released: 0, committed: 0, reconciling: 0 });
      expect(getPrivateReservation(db, item.reservationId)).toMatchObject({ state: "committed" });
      expect(recoverPrivateBudget(db, { wallClockNowMs: BASE + 3_600_000 })).toMatchObject({ expired: 1 });
      expect(getPrivateReservation(db, item.reservationId)).toMatchObject({ state: "expired" });
    } finally {
      db.close();
    }
  });
});
