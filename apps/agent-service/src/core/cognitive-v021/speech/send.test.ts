import { describe, expect, it } from "vitest";
import { openTestSidecar } from "../test-support.js";
import { admitCycle } from "../cycle/inbox.js";
import { insertOutboxPending } from "./outbox.js";
import { sendOutbox } from "./send.js";

describe("v0.2.1 outbox send", () => {
  it("does not send a second time after a Discord receipt exists", async () => {
    const db = openTestSidecar();
    try {
      admitCycle(db, { cycleId: "cycle-send", conversationId: "thread-send", triggerKind: "owner_message", occupantId: "doc", nowMs: 1 });
      const row = insertOutboxPending(db, { settlementId: "settlement-send", cycleId: "cycle-send", generation: 1, conversationId: "thread-send", licensedText: "hello" });
      db.prepare("UPDATE speech_outbox SET nuclear_reservation_id = 7, send_status = 'projected' WHERE outbox_id = ?").run(row.outboxId);
      let sends = 0;
      const transport = async () => { sends += 1; return ["discord-1"]; };
      await sendOutbox(db, row.outboxId, transport);
      await sendOutbox(db, row.outboxId, transport);
      expect(sends).toBe(1);
      expect(db.prepare("SELECT send_status, discord_message_ids_json FROM speech_outbox WHERE outbox_id = ?").get(row.outboxId)).toMatchObject({ send_status: "delivered", discord_message_ids_json: '["discord-1"]' });
    } finally {
      db.close();
    }
  });
});
