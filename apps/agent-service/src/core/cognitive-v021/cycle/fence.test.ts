import { describe, expect, it } from "vitest";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { admitCycle, updateCycleState } from "./inbox.js";
import { composeOrPreempt } from "./fence.js";
import { insertOutboxPending } from "../speech/outbox.js";
import { openTestSidecar } from "../test-support.js";

describe("v0.2.1 cycle fence", () => {
  it("keeps an owner append composable while the cycle is thinking", () => {
    const db = openTestSidecar();
    try {
      const cycle = admitCycle(db, {
        conversationId: "thread-1", triggerKind: "owner_message", triggerRef: "first",
        occupantId: "doc", authorityEpoch: 1, nowMs: 1,
      });
      updateCycleState(db, cycle.cycleId, "thinking", 2);
      const evidence = appendOwnerUtterance(db, {
        conversationId: "thread-1", text: "new owner turn", discordMessageIds: ["d2"], nowMs: 3,
      });
      const result = composeOrPreempt(db, {
        conversationId: "thread-1", evidenceRowIds: [evidence.rowId], triggerRef: evidence.rowId,
        occupantId: "doc", authorityEpoch: 1, nowMs: 4,
      });
      expect(result.action).toBe("compose");
      expect(result.generation).toBe(1);
    } finally {
      db.close();
    }
  });

  it("preempts an unsent outbox and treats every in-flight effect as effectful", () => {
    const db = openTestSidecar();
    try {
      const cycle = admitCycle(db, {
        conversationId: "thread-1", triggerKind: "owner_message", triggerRef: "first",
        occupantId: "doc", authorityEpoch: 1, nowMs: 1,
      });
      updateCycleState(db, cycle.cycleId, "thinking", 2);
      insertOutboxPending(db, {
        settlementId: "settlement-1", cycleId: cycle.cycleId, generation: 1,
        conversationId: "thread-1", licensedText: "hello", origin: "live",
        deliveryIntent: { ownerId: "doc", channel: "discord", threadId: "thread-1", conversationId: "thread-1", trigger: "owner_message_reactive", deliveryLane: "reactive", purpose: "licensed_speech" },
      });
      db.prepare(`INSERT INTO in_flight_effects
        (effect_id, cycle_id, generation, correlation_id, idempotency_key, state, payload_json, dispatched_at_ms, origin_job_id)
        VALUES ('effect-1', ?, 1, 'corr', 'idem', 'in_flight', '{}', 2, NULL)`).run(cycle.cycleId);
      const result = composeOrPreempt(db, {
        conversationId: "thread-1", triggerRef: "owner-2", occupantId: "doc", authorityEpoch: 1, nowMs: 3,
      });
      expect(result.action).toBe("preempt");
      expect(result.generation).toBe(2);
      expect(db.prepare("SELECT send_status FROM speech_outbox").get()).toMatchObject({ send_status: "suppressed" });
    } finally {
      db.close();
    }
  });
});
