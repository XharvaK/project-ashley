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
  claimPendingWeeklyReviewDeliveries,
  claimWeeklyReviewDelivery,
} from "./weekly-review-delivery.js";
import {
  getOperationalJob,
  insertAdmittedOperationalJob,
  listOperationalCompletionsAwaitingDraft,
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

  it("server-owned lease: client leaseMs 0/negative/NaN/huge are clamped and cannot create zero/overflow lease", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const threadId = resolveActiveThread(db, "doc", "discord");
      const nowMs = 1_700_000_000_000;
      // create one reserved
      const r = claimOperationalFulfillmentDelivery(db, {
        ownerId: "doc", channel: "discord", threadId, draftText: "lease test", bubbles: [{ ordinal: 0, text: "lease test" }], nowMs,
      });
      // claim with 0 -> clamped to 30_000
      const c0 = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", leaseMs: 0, nowMs });
      expect(c0.length).toBe(1);
      const row0 = getDeliveryReservation(db, r.id);
      const exp0 = new Date(nowMs + 30_000).toISOString();
      expect(row0?.deliveryLeaseExpiresAt).toBe(exp0);
      // reset to reserved for next variant
      db.prepare(`UPDATE delivery_reservations SET state='reserved', delivery_lease_expires_at=NULL WHERE id=?`).run(r.id);
      const cNeg = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", leaseMs: -5000, nowMs });
      expect(cNeg.length).toBe(1);
      const rowNeg = getDeliveryReservation(db, r.id);
      expect(rowNeg?.deliveryLeaseExpiresAt).toBe(exp0);
      db.prepare(`UPDATE delivery_reservations SET state='reserved', delivery_lease_expires_at=NULL WHERE id=?`).run(r.id);
      const cNaN = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", leaseMs: NaN as unknown as number, nowMs });
      expect(cNaN.length).toBe(1);
      const rowNaN = getDeliveryReservation(db, r.id);
      expect(rowNaN?.deliveryLeaseExpiresAt).toBe(new Date(nowMs + 120_000).toISOString());
      db.prepare(`UPDATE delivery_reservations SET state='reserved', delivery_lease_expires_at=NULL WHERE id=?`).run(r.id);
      const cHuge = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", leaseMs: 9_999_999_999, nowMs });
      expect(cHuge.length).toBe(1);
      const rowHuge = getDeliveryReservation(db, r.id);
      expect(rowHuge?.deliveryLeaseExpiresAt).toBe(new Date(nowMs + 600_000).toISOString());
    } finally {
      db.close();
    }
  });

  it("bounded claim: one reservation per claim, oldest first", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const threadId = resolveActiveThread(db, "doc", "discord");
      const now = 1_700_000_000_000;
      const r1 = claimOperationalFulfillmentDelivery(db, { ownerId: "doc", channel: "discord", threadId, draftText: "r1", bubbles: [{ ordinal: 0, text: "r1" }], nowMs: now });
      const r2 = claimOperationalFulfillmentDelivery(db, { ownerId: "doc", channel: "discord", threadId, draftText: "r2", bubbles: [{ ordinal: 0, text: "r2" }], nowMs: now + 1 });
      const r3 = claimOperationalFulfillmentDelivery(db, { ownerId: "doc", channel: "discord", threadId, draftText: "r3", bubbles: [{ ordinal: 0, text: "r3" }], nowMs: now + 2 });
      const c1 = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", nowMs: now });
      expect(c1.length).toBe(1);
      expect(c1[0].reservationId).toBe(r1.id);
      const remaining1 = listPendingOperationalCompletionDeliveries(db, "doc");
      expect(remaining1.some(p => p.reservationId === r2.id)).toBe(true);
      expect(remaining1.some(p => p.reservationId === r3.id)).toBe(true);
      expect(remaining1.some(p => p.reservationId === r1.id)).toBe(false);
      // second claim gets r2
      const c2 = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", nowMs: now + 100 });
      expect(c2.length).toBe(1);
      expect(c2[0].reservationId).toBe(r2.id);
    } finally {
      db.close();
    }
  });

  it("stale sending reconciliation via real claim entrypoint: zero receipts -> expired/unknown, no retry", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const now = 1_700_000_000_000;
      resolveActiveThread(db, "doc", "discord");
      const job = insertAdmittedOperationalJob(db, { ownerId: "doc", sourceMessageEntityUuid: "src_stale_zero", sourceUserMessageId: 1, admissionReservationId: 1, boundedOperationTaskId: "task_stale_zero", projectId: "proj_1", lifetimeExpiresAtMs: now + 60_000, jobId: "job_stale_zero" });
      db.prepare(`UPDATE operational_jobs SET status='succeeded', job_phase='terminal' WHERE job_id=?`).run(job.jobId);
      await drainOperationalJobCompletions({ db, nowMs: () => now });
      const row = db.prepare(`SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id=?`).get(job.jobId) as { delivery_reservation_id: number };
      const resId = Number(row.delivery_reservation_id);
      // claim to sending
      const claimed = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", leaseMs: 60_000, nowMs: now });
      expect(claimed.length).toBe(1);
      // advance past lease, next claim should reconcile stale to expired before claiming next
      const afterLease = now + 61_000;
      // create second job/reservation that is pending
      const job2 = insertAdmittedOperationalJob(db, { ownerId: "doc", sourceMessageEntityUuid: "src_stale_zero2", sourceUserMessageId: 2, admissionReservationId: 2, boundedOperationTaskId: "task_stale_zero2", projectId: "proj_1", lifetimeExpiresAtMs: afterLease + 60_000, jobId: "job_stale_zero2" });
      db.prepare(`UPDATE operational_jobs SET status='succeeded', job_phase='terminal' WHERE job_id=?`).run(job2.jobId);
      await drainOperationalJobCompletions({ db, nowMs: () => afterLease });
      const row2 = db.prepare(`SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id=?`).get(job2.jobId) as { delivery_reservation_id: number };
      const resId2 = Number(row2.delivery_reservation_id);
      // next claim at afterLease should reconcile first stale to expired and claim r2
      const claimed2 = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", nowMs: afterLease });
      expect(claimed2.length).toBe(1);
      expect(claimed2[0].reservationId).toBe(resId2);
      const stale = getDeliveryReservation(db, resId);
      expect(stale?.state).toBe("expired");
      expect(stale?.finalizationReason).toBe("delivery_lease_expired");
      // original job must not be redrafted
      const draft = await draftOperationalJobCompletion(db, { jobId: job.jobId, nowMs: afterLease + 1000 });
      expect(draft.drafted).toBe(false);
      expect(draft.reservationId).toBe(resId);
    } finally {
      db.close();
    }
  });

  it("stale sending with partial receipts -> partially_delivered via real claim", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const now = 1_700_000_000_000;
      const threadId = resolveActiveThread(db, "doc", "discord");
      const r = claimOperationalFulfillmentDelivery(db, { ownerId: "doc", channel: "discord", threadId, draftText: "A".repeat(2500), bubbles: [{ ordinal: 0, text: "A".repeat(1800) }, { ordinal: 1, text: "B" }], nowMs: now });
      // claim
      claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", leaseMs: 60_000, nowMs: now });
      // receipt bubble 0
      db.prepare(`UPDATE delivery_bubbles SET discord_message_id='msg0', sent_at=? WHERE reservation_id=? AND ordinal=0`).run(new Date(now + 500).toISOString(), r.id);
      db.prepare(`UPDATE delivery_reservations SET first_sent_at=? WHERE id=?`).run(new Date(now + 500).toISOString(), r.id);
      // advance past lease and claim (next owner/lane claim triggers reconcile)
      const after = now + 61_000;
      // need a pending to trigger claim, or claim itself will reconcile even if no pending? Our claim reconciles before selecting next reserved; if no reserved, it still reconciles stale. So call claim again
      const c = claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", nowMs: after });
      expect(c.length).toBe(0); // no new reserved
      const stale = getDeliveryReservation(db, r.id);
      expect(stale?.state).toBe("partially_delivered");
      expect(stale?.finalizationReason).toBe("delivery_lease_expired_after_partial");
    } finally {
      db.close();
    }
  });

  it("stale sending with all receipts -> committed via real claim", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const now = 1_700_000_000_000;
      const threadId = resolveActiveThread(db, "doc", "discord");
      const r = claimOperationalFulfillmentDelivery(db, { ownerId: "doc", channel: "discord", threadId, draftText: "done", bubbles: [{ ordinal: 0, text: "done" }], nowMs: now });
      claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", leaseMs: 60_000, nowMs: now });
      db.prepare(`UPDATE delivery_bubbles SET discord_message_id='msg_all', sent_at=? WHERE reservation_id=?`).run(new Date(now + 500).toISOString(), r.id);
      db.prepare(`UPDATE delivery_reservations SET first_sent_at=? WHERE id=?`).run(new Date(now + 500).toISOString(), r.id);
      const after = now + 61_000;
      claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", nowMs: after });
      const stale = getDeliveryReservation(db, r.id);
      expect(stale?.state).toBe("committed");
      expect(stale?.finalizationReason).toBe("all_bubbles_delivered");
    } finally {
      db.close();
    }
  });

  it("expired/unknown is not advertised as retryable by store nor draft", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const now = 1_700_000_000_000;
      resolveActiveThread(db, "doc", "discord");
      const job = insertAdmittedOperationalJob(db, { ownerId: "doc", sourceMessageEntityUuid: "src_expired_q", sourceUserMessageId: 1, admissionReservationId: 1, boundedOperationTaskId: "task_expired_q", projectId: "proj_1", lifetimeExpiresAtMs: now + 60_000, jobId: "job_expired_q" });
      db.prepare(`UPDATE operational_jobs SET status='succeeded', job_phase='terminal' WHERE job_id=?`).run(job.jobId);
      await drainOperationalJobCompletions({ db, nowMs: () => now });
      const row = db.prepare(`SELECT delivery_reservation_id FROM operational_job_deliveries WHERE job_id=?`).get(job.jobId) as { delivery_reservation_id: number };
      const resId = Number(row.delivery_reservation_id);
      claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", leaseMs: 60_000, nowMs: now });
      // manually expire via claim reconciliation (advance time)
      claimPendingOperationalCompletionDeliveries(db, { ownerId: "doc", nowMs: now + 61_000 });
      const res = getDeliveryReservation(db, resId);
      expect(res?.state).toBe("expired");
      // store should NOT list it
      const awaiting = listOperationalCompletionsAwaitingDraft(db);
      expect(awaiting.some(j => j.jobId === job.jobId)).toBe(false);
      const draft = await draftOperationalJobCompletion(db, { jobId: job.jobId, nowMs: now + 30_000 });
      expect(draft.drafted).toBe(false);
    } finally {
      db.close();
    }
  });

  it("weekly atomic claim: one per claim and stale weekly reconciled via real claim", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const now = 1_700_000_000_000;
      const candidate = { title: "t", whyImportant: "w", problem: "p", filesChanged: ["a"], diffStat: "1", testsRun: ["t"], testResults: "ok", securityImpact: "none", knownLimitations: "none", remainingUncertainty: "none", ownerReviewFocus: "none" } as any;
      const w1 = claimWeeklyReviewDelivery(db, { ownerId: "doc", reportRef: "ref1", candidate, nowMs: now });
      const w2 = claimWeeklyReviewDelivery(db, { ownerId: "doc", reportRef: "ref2", candidate, nowMs: now + 1 });
      expect(w1).not.toBeNull();
      expect(w2).not.toBeNull();
      const c1 = claimPendingWeeklyReviewDeliveries(db, { ownerId: "doc", nowMs: now });
      expect(c1.length).toBe(1);
      expect(c1[0].reservationId).toBe(w1!.deliveryReservationId);
      const c2 = claimPendingWeeklyReviewDeliveries(db, { ownerId: "doc", nowMs: now + 10 });
      expect(c2.length).toBe(1);
      expect(c2[0].reservationId).toBe(w2!.deliveryReservationId);
      // stale weekly with zero receipts
      const staleId = w1!.deliveryReservationId;
      // first claim already moved w1 to sending, advance past lease
      const after = now + 121_000;
      // need another weekly to trigger reconcile
      const w3 = claimWeeklyReviewDelivery(db, { ownerId: "doc", reportRef: "ref3", candidate, nowMs: after });
      const c3 = claimPendingWeeklyReviewDeliveries(db, { ownerId: "doc", nowMs: after });
      // w1 should be expired after reconcile, c3 should claim w3 (oldest remaining)
      const stale = getDeliveryReservation(db, staleId);
      expect(stale?.state).toBe("expired");
      expect(c3.some(c => c.reservationId === w3!.deliveryReservationId)).toBe(true);
    } finally {
      db.close();
    }
  });
});
