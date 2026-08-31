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
});
