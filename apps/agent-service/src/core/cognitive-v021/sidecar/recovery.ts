import type { DatabaseSync } from "node:sqlite";

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
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve original */ }
    throw error;
  }
}
