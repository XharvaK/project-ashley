import { describe, expect, it } from "vitest";
import { admitCycle, getCycle, appendInboxEvent } from "./inbox.js";
import { openTestSidecar } from "../test-support.js";

describe("v0.2.1 cycle and inbox admission", () => {
  it("allocates a durable generation and inbox events", () => {
    const db = openTestSidecar();
    try {
      const cycle = admitCycle(db, {
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
