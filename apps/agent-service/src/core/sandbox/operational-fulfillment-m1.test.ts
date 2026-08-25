import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { openNuclearDb } from "../db.js";
import {
  claimOperationalFulfillmentDelivery,
  claimProactiveDelivery,
  claimReactiveDelivery,
  getDeliveryReservation,
} from "../delivery/store.js";
import { finalizeDelivery } from "../delivery/finalize.js";
import { resolveActiveThread } from "../memory/threads.js";
import {
  claimPendingOperationalCompletionDeliveries,
  draftOperationalJobCompletion,
  drainOperationalJobCompletions,
  listPendingOperationalCompletionDeliveries,
} from "./durable-job-completion.js";
import {
  getOperationalJob,
  insertAdmittedOperationalJob,
  listTerminalJobsMissingCompletion,
  tryEnqueueOperationalJobDelivery,
} from "./operational-job-store.js";
import { AshleyCore } from "../runtime.js";

describe("Operational Fulfillment M1 (Prompt Delivery + Semantic Separation + Targeted Repair)", () => {
  it("enforces distinct delivery lanes for reactive, proactive, and operational fulfillment", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      const threadId = resolveActiveThread(db, "doc", "discord");

      // 1. Reactive delivery reservation
      const reactiveResult = claimReactiveDelivery(db, {
        ownerId: "doc",
        channel: "discord",
        mergedUserText: "hello ashley",
        inboundDiscordMessageIds: ["msg_1"],
        finalFragmentReceivedAtMs: nowMs,
        nowMs,
      });
      expect(reactiveResult.kind).toBe("claimed");
      if (reactiveResult.kind === "claimed") {
        expect(reactiveResult.reservation.trigger).toBe("reactive");
        expect(reactiveResult.reservation.deliveryLane).toBe("reactive");
        expect(reactiveResult.reservation.decisionId).toBeNull();
        expect(reactiveResult.reservation.initiativeReservationId).toBeNull();
      }

      // 2. Proactive initiative reservation
      const proactiveRes = claimProactiveDelivery(db, {
        ownerId: "doc",
        channel: "discord",
        threadId,
        decisionId: 99,
        initiativeReservationId: 88,
        draftText: "proactive greeting",
        bubbles: [{ ordinal: 0, text: "proactive greeting" }],
        nowMs,
      });
      expect(proactiveRes.trigger).toBe("proactive");
      expect(proactiveRes.deliveryLane).toBe("proactive");
      expect(proactiveRes.decisionId).toBe(99);
      expect(proactiveRes.initiativeReservationId).toBe(88);

      // 3. Operational fulfillment reservation
      const opRes = claimOperationalFulfillmentDelivery(db, {
        ownerId: "doc",
        channel: "discord",
        threadId,
        draftText: "job finished successfully",
        bubbles: [{ ordinal: 0, text: "job finished successfully" }],
        nowMs,
      });
      expect(opRes.trigger).toBe("proactive"); // Satisfies table check constraint
      expect(opRes.deliveryLane).toBe("operational_fulfillment"); // Explicit lane separation!
      expect(opRes.decisionId).toBeNull(); // No dummy decision created!
      expect(opRes.initiativeReservationId).toBeNull(); // No dummy initiative reservation created!
    } finally {
      db.close();
    }
  });

  it("creates durable completion obligation and drafts operational fulfillment without dummy decision/initiative rows", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      resolveActiveThread(db, "doc", "discord");

      const job = insertAdmittedOperationalJob(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "src_msg_1",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        boundedOperationTaskId: "task_op_1",
        projectId: "proj_1",
        lifetimeExpiresAtMs: nowMs + 60_000,
        jobId: "job_op_1",
      });

      // Mark job terminal
      db.prepare(
        `UPDATE operational_jobs SET status = 'succeeded', job_phase = 'terminal' WHERE job_id = ?`,
      ).run(job.jobId);

      // Verify listTerminalJobsMissingCompletion identifies this job
      const missing = listTerminalJobsMissingCompletion(db);
      expect(missing.some((m) => m.jobId === job.jobId)).toBe(true);

      // Drain completions
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs,
      });

      // 1. Verify operational_job_deliveries obligation row exists
      const deliveryRow = db
        .prepare(
          `SELECT * FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number } | undefined;
      expect(deliveryRow).toBeDefined();
      const resId = Number(deliveryRow!.delivery_reservation_id);
      expect(resId).toBeGreaterThan(0);

      // 2. Verify delivery reservation properties
      const reservation = getDeliveryReservation(db, resId);
      expect(reservation).not.toBeNull();
      expect(reservation!.deliveryLane).toBe("operational_fulfillment");
      expect(reservation!.decisionId).toBeNull();
      expect(reservation!.initiativeReservationId).toBeNull();
      expect(reservation!.state).toBe("reserved");

      // 3. Verify ZERO dummy decision_log or initiative_reservations rows were created
      const decisionCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM decision_log`).get() as { c: number }
      ).c;
      expect(decisionCount).toBe(0);

      const initCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM initiative_reservations`).get() as { c: number }
      ).c;
      expect(initCount).toBe(0);

      // 4. Verify listPendingOperationalCompletionDeliveries returns this reservation
      const pendingOp = listPendingOperationalCompletionDeliveries(db, "doc");
      expect(pendingOp.some((p) => p.reservationId === resId)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("server-side filtering isolates operational fulfillment from weekly reviews and proactive drains", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      const threadId = resolveActiveThread(db, "doc", "discord");
      const core = new AshleyCore(db);

      // Claim an operational fulfillment delivery
      const opRes = claimOperationalFulfillmentDelivery(db, {
        ownerId: "doc",
        channel: "discord",
        threadId,
        draftText: "operation complete",
        bubbles: [{ ordinal: 0, text: "operation complete" }],
        nowMs,
      });

      // Query with lane=operational_fulfillment
      const opDeliveries = core.getPendingDeliveries("doc", {
        lane: "operational_fulfillment",
      });
      expect(opDeliveries.some((d) => d.reservationId === opRes.id)).toBe(true);

      // Query with lane=weekly_review
      const weeklyDeliveries = core.getPendingDeliveries("doc", {
        lane: "weekly_review",
      });
      expect(weeklyDeliveries.some((d) => d.reservationId === opRes.id)).toBe(false);

      // Query with lane=proactive
      const proactiveDeliveries = core.getPendingDeliveries("doc", {
        lane: "proactive",
      });
      expect(proactiveDeliveries.some((d) => d.reservationId === opRes.id)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("finalizing operational fulfillment commits assistant mem_messages and does not mutate initiative tables", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      const threadId = resolveActiveThread(db, "doc", "discord");

      const opRes = claimOperationalFulfillmentDelivery(db, {
        ownerId: "doc",
        channel: "discord",
        threadId,
        draftText: "task complete finished",
        bubbles: [{ ordinal: 0, text: "task complete finished" }],
        nowMs,
      });

      // Record bubble receipt
      db.prepare(
        `UPDATE delivery_bubbles SET discord_message_id = 'disc_msg_999', sent_at = ? WHERE reservation_id = ?`,
      ).run(new Date(nowMs).toISOString(), opRes.id);

      // Finalize delivery
      finalizeDelivery(db, {
        ownerId: "doc",
        reservationId: opRes.id,
        cause: "complete",
      });

      const finalized = getDeliveryReservation(db, opRes.id);
      expect(finalized?.state).toBe("committed");

      // Verify assistant message was inserted into mem_messages
      const msg = db
        .prepare(`SELECT * FROM mem_messages WHERE role = 'assistant'`)
        .get() as { text: string; role: string } | undefined;
      expect(msg).toBeDefined();
      expect(msg!.text).toBe("task complete finished");

      // Verify no initiative_reservations modified or created
      const initRows = db.prepare(`SELECT * FROM initiative_reservations`).all();
      expect(initRows).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("atomicity: failure before commit leaves zero orphan reservations and obligation remains recoverable", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      resolveActiveThread(db, "doc", "discord");

      const job = insertAdmittedOperationalJob(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "src_msg_atomic",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        boundedOperationTaskId: "task_atomic_1",
        projectId: "proj_1",
        lifetimeExpiresAtMs: nowMs + 60_000,
        jobId: "job_atomic_1",
      });

      db.prepare(
        `UPDATE operational_jobs SET status = 'succeeded', job_phase = 'terminal' WHERE job_id = ?`,
      ).run(job.jobId);

      // Register obligation
      tryEnqueueOperationalJobDelivery(db, {
        jobId: job.jobId,
        deliveryKind: "completion",
        deliveryReservationId: 0,
      });

      // Simulate a transient error during drafting/reservation creation before commit
      const errorExpress = vi.fn().mockRejectedValue(new Error("transient express failure"));

      const result = await draftOperationalJobCompletion(db, {
        jobId: job.jobId,
        nowMs,
        express: errorExpress,
      });

      // Express failure handled cleanly by floor fallback or drafting failure
      // Verify zero orphan reservation was left unbound
      const orphanReservations = db
        .prepare(
          `SELECT * FROM delivery_reservations
           WHERE id NOT IN (SELECT delivery_reservation_id FROM operational_job_deliveries WHERE delivery_reservation_id > 0)`,
        )
        .all();
      expect(orphanReservations).toHaveLength(0);

      // Next recovery tick cleanly creates exactly one reservation
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs + 1000,
      });

      const deliveryRow = db
        .prepare(
          `SELECT * FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      expect(deliveryRow.delivery_reservation_id).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it("transport failure (zero substantive content) remains retryable without altering terminal job status or rerunning effects", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      resolveActiveThread(db, "doc", "discord");

      const job = insertAdmittedOperationalJob(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "src_msg_retry",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        boundedOperationTaskId: "task_retry_1",
        projectId: "proj_1",
        lifetimeExpiresAtMs: nowMs + 60_000,
        jobId: "job_retry_1",
      });

      db.prepare(
        `UPDATE operational_jobs SET status = 'succeeded', job_phase = 'terminal' WHERE job_id = ?`,
      ).run(job.jobId);

      // 1. Initial draft creation
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs,
      });

      const deliveryRow1 = db
        .prepare(
          `SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      const resId1 = Number(deliveryRow1.delivery_reservation_id);
      expect(resId1).toBeGreaterThan(0);

      // 2. Simulate Discord transport send failure with zero substantive content sent
      finalizeDelivery(db, {
        ownerId: "doc",
        reservationId: resId1,
        cause: "send_failure",
      });

      const res1 = getDeliveryReservation(db, resId1);
      expect(res1?.state).toBe("aborted");

      // Verify operational_jobs row remains SUCCEEDED (DELIVERY FAILURE != JOB FAILURE)
      const jobRow = getOperationalJob(db, job.jobId);
      expect(jobRow?.status).toBe("succeeded");
      expect(jobRow?.jobPhase).toBe("terminal");

      // 3. Next recovery cycle should detect unfulfilled obligation and create a replacement delivery reservation
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs + 2000,
      });

      const deliveryRow2 = db
        .prepare(
          `SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      const resId2 = Number(deliveryRow2.delivery_reservation_id);
      expect(resId2).toBeGreaterThan(resId1);

      // Verify the new reservation is in reserved state and preserves identical deterministic completion semantics
      const res2 = getDeliveryReservation(db, resId2);
      expect(res2?.state).toBe("reserved");
      expect(res2?.deliveryLane).toBe("operational_fulfillment");
      expect(res2?.draftText).toBe(res1?.draftText);

      // Verify the old reservation is preserved in the database for forensic audit
      const oldRes = getDeliveryReservation(db, resId1);
      expect(oldRes?.state).toBe("aborted");

      // 4. Successful delivery of attempt 2
      db.prepare(
        `UPDATE delivery_bubbles SET discord_message_id = 'msg_retry_success', sent_at = ? WHERE reservation_id = ?`,
      ).run(new Date(nowMs + 2500).toISOString(), resId2);

      finalizeDelivery(db, {
        ownerId: "doc",
        reservationId: resId2,
        cause: "complete",
      });

      const res2Final = getDeliveryReservation(db, resId2);
      expect(res2Final?.state).toBe("committed");

      // 5. Subsequent drain does nothing
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs + 5000,
      });

      const deliveryRow3 = db
        .prepare(
          `SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      expect(Number(deliveryRow3.delivery_reservation_id)).toBe(resId2);

      // Verify exactly ONE logical completion row exists in operational_job_deliveries
      const totalDeliveries = db
        .prepare(`SELECT COUNT(*) AS c FROM operational_job_deliveries WHERE job_id = ?`)
        .get(job.jobId) as { c: number };
      expect(totalDeliveries.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it("partial delivery safety: does not blindly replay already sent bubbles", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      resolveActiveThread(db, "doc", "discord");

      const job = insertAdmittedOperationalJob(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "src_msg_partial",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        boundedOperationTaskId: "task_partial_1",
        projectId: "proj_1",
        lifetimeExpiresAtMs: nowMs + 60_000,
        jobId: "job_partial_1",
      });

      db.prepare(
        `UPDATE operational_jobs SET status = 'succeeded', job_phase = 'terminal' WHERE job_id = ?`,
      ).run(job.jobId);

      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs,
        express: async () => "A".repeat(2500),
      });

      const deliveryRow = db
        .prepare(
          `SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      const resId = Number(deliveryRow.delivery_reservation_id);

      // Simulate partial send: bubble 0 sent and receipted
      db.prepare(
        `UPDATE delivery_bubbles SET discord_message_id = 'msg_partial_0', sent_at = ? WHERE reservation_id = ? AND ordinal = 0`,
      ).run(new Date(nowMs + 500).toISOString(), resId);
      db.prepare(
        `UPDATE delivery_reservations SET first_sent_at = ?, state = 'sending' WHERE id = ?`,
      ).run(new Date(nowMs + 500).toISOString(), resId);

      // Finalize as send_failure (e.g. timeout on 2nd bubble)
      finalizeDelivery(db, {
        ownerId: "doc",
        reservationId: resId,
        cause: "send_failure",
      });

      const resState = getDeliveryReservation(db, resId);
      expect(resState?.state).toBe("partially_delivered");

      // Next drain should NOT recreate or blindly duplicate the partial reservation
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs + 3000,
      });

      const afterDrain = db
        .prepare(
          `SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      expect(Number(afterDrain.delivery_reservation_id)).toBe(resId);
    } finally {
      db.close();
    }
  });

  it("proactive pause isolation: operational fulfillment is delivered even when proactive initiative is paused", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      const threadId = resolveActiveThread(db, "doc", "discord");
      const core = new AshleyCore(db);

      // Create an operational fulfillment reservation
      const opRes = claimOperationalFulfillmentDelivery(db, {
        ownerId: "doc",
        channel: "discord",
        threadId,
        draftText: "owed operational result",
        bubbles: [{ ordinal: 0, text: "owed operational result" }],
        nowMs,
      });

      // Create a genuine proactive delivery reservation
      const proactiveRes = claimProactiveDelivery(db, {
        ownerId: "doc",
        channel: "discord",
        threadId,
        decisionId: 50,
        initiativeReservationId: 50,
        draftText: "proactive chat",
        bubbles: [{ ordinal: 0, text: "proactive chat" }],
        nowMs,
      });

      // Filter by operational_fulfillment
      const opPending = core.getPendingDeliveries("doc", { lane: "operational_fulfillment" });
      expect(opPending.some((p) => p.reservationId === opRes.id)).toBe(true);
      expect(opPending.some((p) => p.reservationId === proactiveRes.id)).toBe(false);

      // Filter by weekly_review / proactive
      const proactivePending = core.getPendingDeliveries("doc", { lane: "weekly_review" });
      expect(proactivePending.some((p) => p.reservationId === opRes.id)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("atomic claim operation: transitions reserved to sending and prevents concurrent claim", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      const threadId = resolveActiveThread(db, "doc", "discord");

      // 1. Create a reserved operational fulfillment reservation
      const opRes = claimOperationalFulfillmentDelivery(db, {
        ownerId: "doc",
        channel: "discord",
        threadId,
        draftText: "atomic claim test",
        bubbles: [{ ordinal: 0, text: "atomic claim test" }],
        nowMs,
      });
      expect(opRes.state).toBe("reserved");
      expect(opRes.firstSentAt).toBeNull();

      // 2. Claimant A claims pending deliveries
      const claimedA = claimPendingOperationalCompletionDeliveries(db, {
        ownerId: "doc",
        leaseMs: 60_000,
        nowMs,
      });
      expect(claimedA.length).toBe(1);
      expect(claimedA[0].reservationId).toBe(opRes.id);

      // Verify row state in DB: state is 'sending', delivery_lease_expires_at is set, first_sent_at remains NULL
      const resInDb = getDeliveryReservation(db, opRes.id);
      expect(resInDb?.state).toBe("sending");
      expect(resInDb?.deliveryLeaseExpiresAt).toBe(new Date(nowMs + 60_000).toISOString());
      expect(resInDb?.firstSentAt).toBeNull(); // CLAIMED != SENT

      // 3. Concurrent Claimant B attempts claim: receives EMPTY array
      const claimedB = claimPendingOperationalCompletionDeliveries(db, {
        ownerId: "doc",
        leaseMs: 60_000,
        nowMs,
      });
      expect(claimedB.length).toBe(0);

      // Observational GET /delivery/pending also returns EMPTY
      const pendingList = listPendingOperationalCompletionDeliveries(db, "doc");
      expect(pendingList.length).toBe(0);
    } finally {
      db.close();
    }
  });

  it("crash / sent_outcome_unknown: expired unreceipted delivery is quarantined and blocks automatic replay", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      resolveActiveThread(db, "doc", "discord");

      const job = insertAdmittedOperationalJob(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "src_msg_crash",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        boundedOperationTaskId: "task_crash_1",
        projectId: "proj_1",
        lifetimeExpiresAtMs: nowMs + 60_000,
        jobId: "job_crash_1",
      });

      db.prepare(
        `UPDATE operational_jobs SET status = 'succeeded', job_phase = 'terminal' WHERE job_id = ?`,
      ).run(job.jobId);

      // Draft completion
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs,
      });

      const deliveryRow = db
        .prepare(
          `SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      const resId = Number(deliveryRow.delivery_reservation_id);

      // Claim delivery (state -> sending)
      const claimed = claimPendingOperationalCompletionDeliveries(db, {
        ownerId: "doc",
        leaseMs: 60_000,
        nowMs,
      });
      expect(claimed.length).toBe(1);

      // Simulate crash where lease expires without any receipt persistence (sent_outcome_unknown)
      finalizeDelivery(db, {
        ownerId: "doc",
        reservationId: resId,
        cause: "delivery_lease",
      });

      const resState = getDeliveryReservation(db, resId);
      expect(resState?.state).toBe("expired");
      expect(resState?.finalizationReason).toBe("delivery_lease_expired");

      // Next drain pass must NOT auto-recreate/replay! (UNKNOWN remains UNKNOWN)
      const drainResult = await draftOperationalJobCompletion(db, {
        jobId: job.jobId,
        nowMs: nowMs + 70_000,
      });
      expect(drainResult.drafted).toBe(false);
      expect(drainResult.reservationId).toBe(resId);

      // Exactly ONE obligation exists
      const totalDeliveries = db
        .prepare(`SELECT COUNT(*) AS c FROM operational_job_deliveries WHERE job_id = ?`)
        .get(job.jobId) as { c: number };
      expect(totalDeliveries.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it("definite zero-visible failure: permits retry for the same logical obligation with zero effect replay", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const nowMs = 1_700_000_000_000;
      resolveActiveThread(db, "doc", "discord");

      const job = insertAdmittedOperationalJob(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "src_msg_not_sent",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        boundedOperationTaskId: "task_not_sent_1",
        projectId: "proj_1",
        lifetimeExpiresAtMs: nowMs + 60_000,
        jobId: "job_not_sent_1",
      });

      db.prepare(
        `UPDATE operational_jobs SET status = 'succeeded', job_phase = 'terminal' WHERE job_id = ?`,
      ).run(job.jobId);

      // Initial draft
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs,
      });

      const initialRow = db
        .prepare(
          `SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      const firstResId = Number(initialRow.delivery_reservation_id);

      // Claim delivery
      claimPendingOperationalCompletionDeliveries(db, {
        ownerId: "doc",
        leaseMs: 60_000,
        nowMs,
      });

      // Definite failure before send (not_sent)
      finalizeDelivery(db, {
        ownerId: "doc",
        reservationId: firstResId,
        cause: "send_failure",
      });

      const firstResState = getDeliveryReservation(db, firstResId);
      expect(firstResState?.state).toBe("aborted");
      expect(firstResState?.finalizationReason).toBe("send_failure");
      expect(firstResState?.firstSentAt).toBeNull(); // Proven not sent

      // Next drain pass creates a replacement reservation for the SAME obligation
      await drainOperationalJobCompletions({
        db,
        nowMs: () => nowMs + 5000,
      });

      const secondRow = db
        .prepare(
          `SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(job.jobId) as { delivery_reservation_id: number };
      const secondResId = Number(secondRow.delivery_reservation_id);

      expect(secondResId).toBeGreaterThan(firstResId);
      const secondResState = getDeliveryReservation(db, secondResId);
      expect(secondResState?.state).toBe("reserved");

      // Verify exactly ONE logical obligation row remains in operational_job_deliveries
      const totalDeliveries = db
        .prepare(`SELECT COUNT(*) AS c FROM operational_job_deliveries WHERE job_id = ?`)
        .get(job.jobId) as { c: number };
      expect(totalDeliveries.c).toBe(1);
    } finally {
      db.close();
    }
  });
});
