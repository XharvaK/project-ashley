import { describe, expect, it } from "vitest";
import { admitCycle, getCycle, appendInboxEvent } from "./inbox.js";
import { admitTestCycle, openTestSidecar } from "../test-support.js";

describe("v0.2.1 cycle and inbox admission", () => {
  it("refuses direct cycle admission without a durable wake", () => {
    const db = openTestSidecar();
    try {
      expect(() => admitCycle(db, {
        cycleId: "unbound-cycle",
        conversationId: "thread-unbound",
        generation: 1,
        triggerKind: "owner_message",
        triggerRef: "unbound",
        nowMs: 1,
      })).toThrow("wake_required");
    } finally {
      db.close();
    }
  });

  it("allocates a durable generation and inbox events", () => {
    const db = openTestSidecar();
    try {
      const cycle = admitTestCycle(db, {
        conversationId: "thread-1",
        triggerKind: "owner_message",
        triggerRef: "evidence-1",
        occupantId: "doc",
        authorityEpoch: 1,
        nowMs: 100,
      });
      const event = appendInboxEvent(db, {
        conversationId: "thread-1",
        kind: "owner_utterance",
        payload: { evidenceRowId: "evidence-1" },
        id: "inbox-1",
        createdAtMs: 101,
      });
      expect(cycle.generation).toBe(1);
      expect(getCycle(db, cycle.cycleId)).toMatchObject({ cycleId: cycle.cycleId, state: "admitted" });
      expect(event).toMatchObject({ id: "inbox-1", status: "pending" });
    } finally {
      db.close();
    }
  });

  it("rejects admission of distinct cycle when conversation is occupied by active deferred frontier", () => {
    const db = openTestSidecar();
    try {
      const cycleN = admitTestCycle(db, {
        conversationId: "thread-occ",
        triggerKind: "owner_message",
        triggerRef: "ev-occ-1",
        generation: 1,
        nowMs: 100,
      });
      db.prepare(
        `INSERT INTO deferred_reactive_frontiers
           (frontier_id, conversation_id, cycle_id, generation, state,
            next_eligible_at_ms, capacity_deadline_at_ms, latest_evidence_row_id,
            attempt_count, created_at_ms, updated_at_ms)
         VALUES ('f-occ', 'thread-occ', ?, 1, 'waiting', 200, 1000, 'ev-occ-1', 0, 100, 100)`,
      ).run(cycleN.cycleId);

      // Attempt admission of distinct cycle M for same conversation
      expect(() => {
        admitTestCycle(db, {
          cycleId: "cycle-m",
          conversationId: "thread-occ",
          triggerKind: "owner_message",
          triggerRef: "ev-occ-2",
          nowMs: 150,
        });
      }).toThrow("conversation_occupied_by_frontier");

      // Verify no cycle M was inserted and generation did not advance
      const maxGen = db.prepare("SELECT MAX(generation) AS maxGen FROM cycle_records WHERE conversation_id = ?").get("thread-occ") as { maxGen: number };
      expect(maxGen.maxGen).toBe(1);
      const cycleM = getCycle(db, "cycle-m");
      expect(cycleM).toBeNull();
    } finally {
      db.close();
    }
  });
});
