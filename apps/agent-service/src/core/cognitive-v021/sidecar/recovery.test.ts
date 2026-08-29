import { describe, expect, it } from "vitest";
import { appendInboxEvent, claimInboxEvent } from "../cycle/inbox.js";
import { openTestSidecar } from "../test-support.js";
import { recoverCognitiveSidecar } from "./recovery.js";

describe("cognitive sidecar reopen recovery", () => {
  it("returns expired inbox claims and orphaned live projections to retryable states", () => {
    const db = openTestSidecar();
    appendInboxEvent(db, { conversationId: "thread-recovery", kind: "owner_message", payload: {}, createdAtMs: 1 });
    claimInboxEvent(db, { workerId: "crashed", nowMs: 10, leaseMs: 5 });
    db.prepare(
      `INSERT INTO speech_outbox
       (settlement_id, projection_key, cycle_id, generation, conversation_id, licensed_text,
        send_status, suppressed, origin, delivery_intent_json)
       VALUES ('settlement-recovery', 'speech:recovery', 'cycle-recovery', 1, 'thread-recovery',
        'hello', 'projecting', 0, 'live', '{}')`,
    ).run();
    const result = recoverCognitiveSidecar(db, 20);
    expect(result).toEqual({ inboxClaimsRecovered: 1, speechProjectionsRequeued: 1, noticeProjectionsRequeued: 0 });
    expect(db.prepare("SELECT status, last_error FROM inbox_events").get()).toMatchObject({ status: "failed_retryable", last_error: "recovered_after_lease_expiry" });
    expect(db.prepare("SELECT send_status FROM speech_outbox").get()).toMatchObject({ send_status: "pending" });
    db.close();
  });
});
