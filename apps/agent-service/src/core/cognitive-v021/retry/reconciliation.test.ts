import { describe, expect, it } from "vitest";
import { recordEffectReceipt, putInFlight } from "../effect/in-flight.js";
import { admitWake } from "../wake/ledger.js";
import type { EffectReceipt } from "../types.js";
import { openTestSidecar } from "../test-support.js";
import { createRepairEvent, reconcileOutcomeUnknown, startDurableAttempt, settleDurableAttempt } from "./ledger.js";

function seedEvent(db: ReturnType<typeof openTestSidecar>, id: string): string {
  const admitted = admitWake(db, {
    occurrenceId: `occurrence:${id}`,
    triggerRef: `trigger:${id}`,
    sourceKind: "inbox",
    conversationId: `conversation:${id}`,
    cycleId: `cycle:${id}`,
    capturedAuthorityRevision: 1,
    nowMs: 1,
  });
  db.prepare(
    `INSERT INTO inbox_events
       (id, conversation_id, kind, payload_json, created_at_ms, status, wake_id)
     VALUES (?, ?, 'test', '{}', 1, 'pending', ?)`,
  ).run(id, `conversation:${id}`, admitted.wake.wakeId);
  return admitted.wake.wakeId;
}

describe("durable retry reconciliation", () => {
  it("does not replay an unknown outcome without proof, then closes on a receipt", () => {
    const db = openTestSidecar();
    try {
      const wakeId = seedEvent(db, "event:unknown");
      const started = startDurableAttempt(db, { eventId: "event:unknown", workerId: "worker", nowMs: 1_000 });
      settleDurableAttempt(db, {
        eventId: "event:unknown",
        attemptId: started.attemptId,
        claimToken: started.claimToken,
        result: { kind: "outcome_unknown", operationId: "operation:unknown", errorCode: "timeout" },
        nowMs: 1_100,
      });
      putInFlight(db, {
        effectId: "effect:unknown",
        cycleId: "cycle:event:unknown",
        generation: 1,
        wakeId,
        correlationId: "correlation:unknown",
        idempotencyKey: "idempotency:unknown",
        dispatchedAtMs: 1_050,
        originEventId: "event:unknown",
        originAttemptId: started.attemptId,
      });

      expect(reconcileOutcomeUnknown(db, { eventId: "event:unknown", nowMs: 1_200 })).toEqual({
        kind: "pending",
        reason: "outcome_still_unknown",
        eventId: "event:unknown",
      });
      expect(db.prepare("SELECT state FROM inbox_events WHERE id = 'event:unknown'").get()).toMatchObject({ state: "reconciling" });

      const receipt: EffectReceipt = {
        receiptId: "receipt:unknown",
        effectId: "effect:unknown",
        idempotencyKey: "idempotency:unknown",
        outcome: "succeeded",
        claims: { referenceOnly: true },
        atMs: 1_300,
        dataClassification: "never_public",
        secretOmitted: true,
      };
      recordEffectReceipt(db, receipt);
      expect(reconcileOutcomeUnknown(db, { eventId: "event:unknown", nowMs: 1_400 })).toEqual({
        kind: "terminal",
        reason: "completed",
        eventId: "event:unknown",
      });
      expect(db.prepare("SELECT state, status, terminal_reason FROM inbox_events WHERE id = 'event:unknown'").get()).toMatchObject({ state: "terminal", status: "consumed", terminal_reason: "completed" });
      expect(db.prepare("SELECT state, terminal_reason FROM wakes WHERE wake_id = ?").get(wakeId)).toMatchObject({ state: "terminal", terminal_reason: "completed" });

      expect(reconcileOutcomeUnknown(db, { eventId: "event:unknown", nowMs: 1_500 })).toEqual({
        kind: "terminal",
        reason: "completed",
        eventId: "event:unknown",
      });
    } finally {
      db.close();
    }
  });

  it("returns the same event to pending only with an explicit no-dispatch proof", () => {
    const db = openTestSidecar();
    try {
      const wakeId = seedEvent(db, "event:no-dispatch");
      const started = startDurableAttempt(db, { eventId: "event:no-dispatch", workerId: "worker", nowMs: 1_000 });
      settleDurableAttempt(db, {
        eventId: "event:no-dispatch",
        attemptId: started.attemptId,
        claimToken: started.claimToken,
        result: { kind: "outcome_unknown", operationId: "operation:no-dispatch", errorCode: "worker_crash" },
        nowMs: 1_100,
      });

      expect(reconcileOutcomeUnknown(db, {
        eventId: "event:no-dispatch",
        nowMs: 1_200,
        noExternalDispatchProof: true,
        proofRef: "proof:no-dispatch",
      })).toEqual({ kind: "pending", reason: "safe_to_retry", eventId: "event:no-dispatch" });
      expect(db.prepare("SELECT state, status FROM inbox_events WHERE id = 'event:no-dispatch'").get()).toMatchObject({ state: "pending", status: "pending" });
      expect(db.prepare("SELECT state, lease_token FROM wakes WHERE wake_id = ?").get(wakeId)).toMatchObject({ state: "pending", lease_token: null });

      const retry = startDurableAttempt(db, { eventId: "event:no-dispatch", workerId: "worker-2", nowMs: 1_201 });
      expect(retry.ordinal).toBe(2);
      expect(retry.wakeId).toBe(wakeId);
    } finally {
      db.close();
    }
  });

  it("creates an authorized repair event without rewriting the predecessor", () => {
    const db = openTestSidecar();
    try {
      const wakeId = seedEvent(db, "event:repair");
      const started = startDurableAttempt(db, { eventId: "event:repair", workerId: "worker", nowMs: 1_000 });
      settleDurableAttempt(db, {
        eventId: "event:repair",
        attemptId: started.attemptId,
        claimToken: started.claimToken,
        result: { kind: "outcome_unknown", operationId: "operation:repair", errorCode: "timeout" },
        nowMs: 1_100,
      });

      const repair = createRepairEvent(db, {
        predecessorEventId: "event:repair",
        authorizationRef: "owner-review:repair-1",
        nowMs: 1_200,
        payload: { referenceOnly: true },
      });
      const duplicate = createRepairEvent(db, {
        predecessorEventId: "event:repair",
        authorizationRef: "owner-review:repair-1",
        nowMs: 1_300,
      });
      expect(duplicate.id).toBe(repair.id);
      expect(repair.id).not.toBe("event:repair");
      expect(repair.wakeId).not.toBe(wakeId);
      expect(db.prepare("SELECT state FROM inbox_events WHERE id = 'event:repair'").get()).toMatchObject({ state: "reconciling" });
      expect(db.prepare("SELECT predecessor_event_id, authorization_ref FROM durable_work_repairs WHERE repair_event_id = ?").get(repair.id)).toMatchObject({ predecessor_event_id: "event:repair", authorization_ref: "owner-review:repair-1" });
    } finally {
      db.close();
    }
  });

  it("enforces multi-effect reconciliation rule over exact bound effects", () => {
    const db = openTestSidecar();
    try {
      const wakeId = seedEvent(db, "event:multi");
      const started = startDurableAttempt(db, { eventId: "event:multi", workerId: "worker", nowMs: 1_000 });
      settleDurableAttempt(db, {
        eventId: "event:multi",
        attemptId: started.attemptId,
        claimToken: started.claimToken,
        result: { kind: "outcome_unknown", operationId: "operation:multi", errorCode: "timeout" },
        nowMs: 1_100,
      });

      // Bind 2 effects to this event (e.g. across two attempts)
      const wake2 = seedEvent(db, "event:multi-attempt-2");
      putInFlight(db, {
        effectId: "effect:multi-1",
        cycleId: "cycle:event:multi",
        generation: 1,
        wakeId,
        correlationId: "corr:multi-1",
        idempotencyKey: "idem:multi-1",
        dispatchedAtMs: 1_050,
        originEventId: "event:multi",
      });
      putInFlight(db, {
        effectId: "effect:multi-2",
        cycleId: "cycle:event:multi-attempt-2",
        generation: 2,
        wakeId: wake2,
        correlationId: "corr:multi-2",
        idempotencyKey: "idem:multi-2",
        dispatchedAtMs: 1_050,
        originEventId: "event:multi",
      });

      // Case 1: One succeeded, one missing receipt -> pending
      recordEffectReceipt(db, {
        receiptId: "rec:multi-1",
        effectId: "effect:multi-1",
        idempotencyKey: "idem:multi-1",
        outcome: "succeeded",
        claims: {},
        atMs: 1_200,
        dataClassification: "never_public",
        secretOmitted: false,
      });
      expect(reconcileOutcomeUnknown(db, { eventId: "event:multi", nowMs: 1_250 })).toEqual({
        kind: "pending",
        reason: "outcome_still_unknown",
        eventId: "event:multi",
      });

      // Case 2: One succeeded, one outcome_unknown -> pending
      recordEffectReceipt(db, {
        receiptId: "rec:multi-2",
        effectId: "effect:multi-2",
        idempotencyKey: "idem:multi-2",
        outcome: "outcome_unknown",
        claims: {},
        atMs: 1_300,
        dataClassification: "never_public",
        secretOmitted: false,
      });
      expect(reconcileOutcomeUnknown(db, { eventId: "event:multi", nowMs: 1_350 })).toEqual({
        kind: "pending",
        reason: "outcome_still_unknown",
        eventId: "event:multi",
      });

      // Case 3: Update effect 2 receipt to succeeded -> all succeeded -> completed
      db.prepare("UPDATE effect_receipts SET outcome = 'succeeded' WHERE receipt_id = 'rec:multi-2'").run();
      expect(reconcileOutcomeUnknown(db, { eventId: "event:multi", nowMs: 1_400 })).toEqual({
        kind: "terminal",
        reason: "completed",
        eventId: "event:multi",
      });
    } finally {
      db.close();
    }
  });

  it("walks predecessor repair lineage and does not leak wake-wide effects", () => {
    const db = openTestSidecar();
    try {
      const wakeId = seedEvent(db, "event:pred");
      const started = startDurableAttempt(db, { eventId: "event:pred", workerId: "worker", nowMs: 1_000 });
      settleDurableAttempt(db, {
        eventId: "event:pred",
        attemptId: started.attemptId,
        claimToken: started.claimToken,
        result: { kind: "outcome_unknown", operationId: "operation:pred", errorCode: "timeout" },
        nowMs: 1_100,
      });

      // Effect is bound to predecessor event
      putInFlight(db, {
        effectId: "effect:pred",
        cycleId: "cycle:event:pred",
        generation: 1,
        wakeId,
        correlationId: "corr:pred",
        idempotencyKey: "idem:pred",
        dispatchedAtMs: 1_050,
        originEventId: "event:pred",
      });
      recordEffectReceipt(db, {
        receiptId: "rec:pred",
        effectId: "effect:pred",
        idempotencyKey: "idem:pred",
        outcome: "succeeded",
        claims: {},
        atMs: 1_150,
        dataClassification: "never_public",
        secretOmitted: false,
      });

      // Create repair event
      const repair = createRepairEvent(db, {
        predecessorEventId: "event:pred",
        authorizationRef: "auth:repair-lineage",
        nowMs: 1_200,
        payload: {},
      });

      // Mark repair event as reconciling
      db.prepare("UPDATE inbox_events SET state = 'reconciling' WHERE id = ?").run(repair.id);

      // Reconciling the repair event walks predecessor and finds effect:pred succeeded
      expect(reconcileOutcomeUnknown(db, { eventId: repair.id, nowMs: 1_250 })).toEqual({
        kind: "terminal",
        reason: "completed",
        eventId: repair.id,
      });
    } finally {
      db.close();
    }
  });
});
