import { describe, expect, it } from "vitest";
import { openTestSidecar } from "../test-support.js";
import { admitCycle } from "../cycle/inbox.js";
import { emitInfrastructureNotice, getSystemNotice, listSystemNotices, THOUGHT_UNAVAILABLE_NOTICE } from "./infrastructure-notice.js";

describe("v0.2.1 Thought outage notices", () => {
  it("persists routing, ledger unavailability, and one notice per failure key", () => {
    const db = openTestSidecar();
    try {
      admitCycle(db, { cycleId: "cycle-notice", conversationId: "thread-notice", triggerKind: "owner_message", occupantId: "doc", nowMs: 1 });
      const first = emitInfrastructureNotice(db, { ownerId: "doc", channel: "discord", threadId: "thread-notice", conversationId: "thread-notice", cycleId: "cycle-notice", generation: 1, reason: "unavailable" });
      const second = emitInfrastructureNotice(db, { ownerId: "doc", channel: "discord", threadId: "thread-notice", conversationId: "thread-notice", cycleId: "cycle-notice", generation: 1, reason: "unavailable" });
      expect(second.noticeId).toBe(first.noticeId);
      expect(first.noticeText).toBe(THOUGHT_UNAVAILABLE_NOTICE);
      expect(first.deliveryIntent).toMatchObject({ ownerId: "doc", channel: "discord", threadId: "thread-notice", purpose: "system_notice" });
      expect(listSystemNotices(db)).toHaveLength(1);
      expect(getSystemNotice(db, first.noticeId)?.noticeText).toBe(THOUGHT_UNAVAILABLE_NOTICE);
      expect(db.prepare("SELECT thought_unavailable FROM causal_ledger WHERE cycle_id = ? AND generation = ?").get("cycle-notice", 1)).toMatchObject({ thought_unavailable: 1 });
    } finally {
      db.close();
    }
  });

  it("marks an existing ledger unavailable without erasing causal fields", () => {
    const db = openTestSidecar();
    try {
      admitCycle(db, { cycleId: "cycle-ledger", conversationId: "thread-ledger", triggerKind: "owner_message", occupantId: "doc", nowMs: 1 });
      db.prepare("INSERT INTO causal_ledger (cycle_id, generation, payload_json, thought_unavailable) VALUES (?, ?, ?, 0)")
        .run("cycle-ledger", 1, JSON.stringify({ settlementId: "settlement-existing", authorityCodes: ["authority_kept"] }));
      emitInfrastructureNotice(db, { ownerId: "doc", channel: "discord", threadId: "thread-ledger", conversationId: "thread-ledger", cycleId: "cycle-ledger", generation: 1, reason: "unavailable" });
      const row = db.prepare("SELECT payload_json, thought_unavailable FROM causal_ledger WHERE cycle_id = ? AND generation = ?").get("cycle-ledger", 1) as { payload_json: string; thought_unavailable: number };
      expect(JSON.parse(row.payload_json)).toMatchObject({ settlementId: "settlement-existing", authorityCodes: ["authority_kept"], thoughtUnavailable: true });
      expect(row.thought_unavailable).toBe(1);
    } finally {
      db.close();
    }
  });
});
