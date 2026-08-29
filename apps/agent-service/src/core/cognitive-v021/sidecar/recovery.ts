import type { DatabaseSync } from "node:sqlite";
import { appendInboxEvent } from "../cycle/inbox.js";
import { recoverInFlight } from "../effect/recovery.js";

export type CognitiveSidecarRecoveryResult = {
  inboxClaimsRecovered: number;
  speechProjectionsRequeued: number;
  noticeProjectionsRequeued: number;
};

/** Reopen-time recovery is conservative: only expired leases are made retryable. */
export function recoverCognitiveSidecar(
  db: DatabaseSync,
  nowMs = Date.now(),
): CognitiveSidecarRecoveryResult {
  const result: CognitiveSidecarRecoveryResult = {
    inboxClaimsRecovered: 0,
    speechProjectionsRequeued: 0,
    noticeProjectionsRequeued: 0,
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    const inbox = db.prepare(
      `UPDATE inbox_events
          SET status = 'failed_retryable', claim_token = NULL, worker_id = NULL,
              lease_expires_at_ms = NULL, last_error = 'recovered_after_lease_expiry'
        WHERE status = 'claimed' AND lease_expires_at_ms IS NOT NULL
          AND lease_expires_at_ms <= ?`,
    ).run(nowMs);
    result.inboxClaimsRecovered = Number(inbox.changes);

    const speech = db.prepare(
      `UPDATE speech_outbox
          SET send_status = 'pending', suppressed = 0
        WHERE send_status = 'projecting' AND origin = 'live'
          AND nuclear_reservation_id IS NULL`,
    ).run();
    result.speechProjectionsRequeued = Number(speech.changes);

    const notices = db.prepare(
      `UPDATE system_notice_outbox
          SET send_status = 'pending'
        WHERE send_status = 'projecting' AND origin = 'live'
          AND nuclear_reservation_id IS NULL`,
    ).run();
    result.noticeProjectionsRequeued = Number(notices.changes);

    // An external effect may have crossed its process boundary before the
    // crash. Mark it unknown and leave a durable, reference-only recovery
    // event for Thought. The deterministic event id makes reopen idempotent;
    // the effect is never redispatched merely because the process restarted.
    for (const effect of recoverInFlight(db, nowMs)) {
      if (effect.status !== "unknown") continue;
      const cycle = db.prepare(
        "SELECT conversation_id FROM cycle_records WHERE cycle_id = ? LIMIT 1",
      ).get(effect.cycleId) as { conversation_id?: unknown } | undefined;
      if (typeof cycle?.conversation_id !== "string" || !cycle.conversation_id) continue;
      appendInboxEvent(db, {
        id: `recovery:${effect.effectId}`,
        conversationId: cycle.conversation_id,
        kind: "recovery",
        payload: {
          cycleId: effect.cycleId,
          generation: effect.generation,
          triggerRef: effect.effectId,
          effectId: effect.effectId,
          recoveryEffectId: effect.effectId,
          correlationId: effect.correlationId,
          idempotencyKey: effect.idempotencyKey,
        },
        createdAtMs: nowMs,
      });
    }
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve original */ }
    throw error;
  }
}
