import { describe, expect, it } from "vitest";
import { openTestSidecar } from "../test-support.js";
import { admitWake } from "../wake/ledger.js";
import { getCycle, getInboxEvent, updateCycleState } from "../cycle/inbox.js";
import { getWake } from "../wake/ledger.js";
import { reconcileStartupOwnership } from "../cycle/reconcile.js";
import { putInFlight } from "../effect/in-flight.js";
import {
  proveNoExternalDispatch,
  reconcileStrandedOutcomeUnknownAtStartup,
} from "./startup-outcome-recovery.js";
import { claimNextDurableWork, settleDurableAttempt, startDurableAttempt } from "./ledger.js";

function seedStrandedFixture(db: ReturnType<typeof openTestSidecar>, tag: string): {
  eventId: string;
  wakeId: string;
  cycleId: string;
  generation: number;
  conversationId: string;
} {
  const conversationId = `conversation:${tag}`;
  const cycleId = `cycle:${tag}`;
  const eventId = `event:${tag}`;
  const admitted = admitWake(db, {
    occurrenceId: `occurrence:${tag}`,
    triggerRef: `trigger:${tag}`,
    sourceKind: "inbox",
    conversationId,
    cycleId,
    capturedAuthorityRevision: 1,
    nowMs: 1,
  });
  const wakeId = admitted.wake.wakeId;
  db.prepare(
    `INSERT INTO inbox_events
       (id, conversation_id, kind, payload_json, created_at_ms, status, wake_id)
     VALUES (?, ?, 'test', ?, 1, 'pending', ?)`,
  ).run(eventId, conversationId, JSON.stringify({ cycleId, wakeId }), wakeId);
  // admitWake already admitted the cycle row for this wake (generation 1).
  // Stranded Thought is simulated by moving that SAME cycle to thinking so
  // event/wake/cycle/generation lineage is preserved without DB surgery.
  updateCycleState(db, cycleId, "thinking", 2);

  const started = startDurableAttempt(db, { eventId, workerId: "worker", nowMs: 1_000 });
  settleDurableAttempt(db, {
    eventId,
    attemptId: started.attemptId,
    claimToken: started.claimToken,
    result: { kind: "outcome_unknown", operationId: `operation:${tag}`, errorCode: "worker_crash" },
    nowMs: 1_100,
  });
  const cycle = getCycle(db, cycleId);
  return { eventId, wakeId, cycleId, generation: cycle?.generation ?? 1, conversationId };
}

describe("durable-work startup outcome-unknown recovery", () => {
  it("recovers Gen15-shaped stranded work to pending without DB surgery", () => {
    const db = openTestSidecar();
    try {
      const { eventId, wakeId, cycleId, generation, conversationId } = seedStrandedFixture(db, "gen15-shaped");

      // Stranded shape: cycle thinking, wake reconciling, inbox reconciling.
      expect(getCycle(db, cycleId)?.state).toBe("thinking");
      expect(getWake(db, wakeId)?.state).toBe("reconciling");
      expect(getInboxEvent(db, eventId)?.status).toBe("claimed");
      expect(db.prepare("SELECT state, last_failure_class FROM inbox_events WHERE id = ?").get(eventId)).toMatchObject({
        state: "reconciling",
        last_failure_class: "outcome_unknown_reconcile",
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM settlements").get()).toMatchObject({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get()).toMatchObject({ count: 0 });

      // Cycle ownership reconciliation must not steal durable-work authority.
      const ownership = reconcileStartupOwnership(db, { nowMs: 1_150 });
      expect(db.prepare("SELECT state FROM inbox_events WHERE id = ?").get(eventId)).toMatchObject({
        state: "reconciling",
      });
      void ownership;

      const proof = proveNoExternalDispatch(db, eventId);
      expect(proof.ok).toBe(true);

      const recovered = reconcileStrandedOutcomeUnknownAtStartup(db, { nowMs: 1_200 });
      expect(recovered.recoveredToPending).toBe(1);
      expect(recovered.recoveredEventIds).toEqual([eventId]);
      expect(db.prepare("SELECT state, status FROM inbox_events WHERE id = ?").get(eventId)).toMatchObject({
        state: "pending",
        status: "pending",
      });
      expect(db.prepare("SELECT state FROM wakes WHERE wake_id = ?").get(wakeId)).toMatchObject({ state: "pending" });

      // The SAME durable obligation is reclaimable with preserved lineage.
      const retry = startDurableAttempt(db, { eventId, workerId: "worker-2", nowMs: 1_201 });
      expect(retry.ordinal).toBe(2);
      expect(retry.wakeId).toBe(wakeId);
      expect(getWake(db, wakeId)?.cycleId).toBe(cycleId);
      expect(getCycle(db, cycleId)?.generation).toBe(generation);
      expect(getInboxEvent(db, eventId)?.conversationId).toBe(conversationId);
    } finally {
      db.close();
    }
  });

  it("fails closed when external dispatch cannot be disproven", () => {
    const db = openTestSidecar();
    try {
      const { eventId, wakeId, cycleId, generation } = seedStrandedFixture(db, "gen15-blocked");
      // Introduce dispatch-bearing evidence: a bound in-flight effect.
      putInFlight(db, {
        effectId: "effect:blocked-1",
        cycleId,
        generation,
        wakeId,
        correlationId: "corr:blocked",
        idempotencyKey: "idem:blocked",
        dispatchedAtMs: 1_050,
        originEventId: eventId,
      });

      const proof = proveNoExternalDispatch(db, eventId);
      expect(proof.ok).toBe(false);

      const recovered = reconcileStrandedOutcomeUnknownAtStartup(db, { nowMs: 1_200 });
      expect(recovered.recoveredToPending).toBe(0);
      expect(recovered.leftReconciling).toBe(1);
      expect(db.prepare("SELECT state FROM inbox_events WHERE id = ?").get(eventId)).toMatchObject({
        state: "reconciling",
      });
      expect(db.prepare("SELECT state FROM wakes WHERE wake_id = ?").get(wakeId)).toMatchObject({
        state: "reconciling",
      });
      // No synthetic terminal outcome and no pending consumer claim.
      expect(claimNextDurableWork(db, { workerId: "worker-3", eventId, nowMs: 1_201 })).toBeNull();
    } finally {
      db.close();
    }
  });

  it("fails closed on settlement/outbox dispatch evidence", () => {
    const db = openTestSidecar();
    try {
      const { eventId } = seedStrandedFixture(db, "gen15-settled");
      const cycle = getCycle(db, `cycle:gen15-settled`)!;
      db.prepare(
        `INSERT INTO settlements (settlement_id, cycle_id, generation, wake_id, semantic_pass, payload_json)
         VALUES (?, ?, ?, ?, 1, '{}')`,
      ).run("settlement:blocked", cycle.cycleId, cycle.generation, cycle.wakeId);
      expect(proveNoExternalDispatch(db, eventId).ok).toBe(false);
      const recovered = reconcileStrandedOutcomeUnknownAtStartup(db, { nowMs: 1_200 });
      expect(recovered.recoveredToPending).toBe(0);
    } finally {
      db.close();
    }
  });
});
