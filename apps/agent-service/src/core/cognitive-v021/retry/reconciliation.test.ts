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
});
