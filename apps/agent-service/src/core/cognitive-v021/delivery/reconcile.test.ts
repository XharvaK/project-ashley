import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../../db.js";
import { finalizeDelivery } from "../../delivery/finalize.js";
import { recordBubbleReceipt } from "../../delivery/store.js";
import { openTestSidecar } from "../test-support.js";
import { insertOutboxPending } from "../speech/outbox.js";
import {
  markProjectedDeliverySending,
  reconcileProjectedDelivery,
} from "./outbox-projector.js";

describe("v0.2.1 delivery reconciliation", () => {
  it("updates sidecar status and appends receipt-backed Ashley evidence once", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const outbox = insertOutboxPending(sidecar, {
        settlementId: "settlement-reconcile",
        cycleId: "cycle-reconcile",
        generation: 1,
        conversationId: "thread-reconcile",
        licensedText: "receipt-backed text",
        deliveryIntent: {
          ownerId: "doc",
          channel: "discord",
          threadId: "thread-reconcile",
          conversationId: "thread-reconcile",
          trigger: "owner_message_reactive",
          deliveryLane: "reactive",
          purpose: "licensed_speech",
        },
      });
      const projector = new (await import("./outbox-projector.js")).OutboxDeliveryProjector(
        sidecar,
        nuclear,
        { nowMs: () => 1_000 },
      );
      await projector.project(outbox.outboxId);
      const reservationId = Number(
        (sidecar.prepare(
          "SELECT nuclear_reservation_id FROM speech_outbox WHERE outbox_id = ?",
        ).get(outbox.outboxId) as { nuclear_reservation_id: number }).nuclear_reservation_id,
      );
      expect(markProjectedDeliverySending(sidecar, nuclear, reservationId)).toBe(true);
      expect(sidecar.prepare(
        "SELECT send_status FROM speech_outbox WHERE outbox_id = ?",
      ).get(outbox.outboxId)).toMatchObject({ send_status: "sending" });

      recordBubbleReceipt(nuclear, reservationId, 0, "discord-reconcile", 2_000);
      finalizeDelivery(nuclear, {
        reservationId,
        ownerId: "doc",
        cause: "complete",
      });
      expect(reconcileProjectedDelivery(sidecar, nuclear, reservationId)).toBe(true);
      expect(sidecar.prepare(
        "SELECT send_status, discord_message_ids_json FROM speech_outbox WHERE outbox_id = ?",
      ).get(outbox.outboxId)).toMatchObject({
        send_status: "delivered",
        discord_message_ids_json: '["discord-reconcile"]',
      });
      expect(sidecar.prepare(
        "SELECT role, text, delivered FROM conversation_evidence_log WHERE reservation_id = ?",
      ).get(reservationId)).toMatchObject({
        role: "ashley",
        text: "receipt-backed text",
        delivered: 1,
      });
      reconcileProjectedDelivery(sidecar, nuclear, reservationId);
      expect(sidecar.prepare(
        "SELECT COUNT(*) AS count FROM conversation_evidence_log WHERE reservation_id = ?",
      ).get(reservationId)).toMatchObject({ count: 1 });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });

  it("preserves a partial terminal outcome in the sidecar", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const outbox = insertOutboxPending(sidecar, {
        settlementId: "settlement-partial-reconcile",
        cycleId: "cycle-partial-reconcile",
        generation: 1,
        conversationId: "thread-partial-reconcile",
        licensedText: "A\n\nB",
        deliveryIntent: {
          ownerId: "doc",
          channel: "discord",
          threadId: "thread-partial-reconcile",
          conversationId: "thread-partial-reconcile",
          trigger: "owner_message_reactive",
          deliveryLane: "reactive",
          purpose: "licensed_speech",
        },
      });
      const { OutboxDeliveryProjector } = await import("./outbox-projector.js");
      await new OutboxDeliveryProjector(sidecar, nuclear, { nowMs: () => 1_000 })
        .project(outbox.outboxId);
      const reservationId = Number(
        (sidecar.prepare(
          "SELECT nuclear_reservation_id FROM speech_outbox WHERE outbox_id = ?",
        ).get(outbox.outboxId) as { nuclear_reservation_id: number }).nuclear_reservation_id,
      );
      recordBubbleReceipt(nuclear, reservationId, 0, "discord-partial", 2_000);
      finalizeDelivery(nuclear, {
        reservationId,
        ownerId: "doc",
        cause: "send_failure",
      });
      reconcileProjectedDelivery(sidecar, nuclear, reservationId);
      expect(sidecar.prepare(
        "SELECT send_status FROM speech_outbox WHERE outbox_id = ?",
      ).get(outbox.outboxId)).toMatchObject({ send_status: "partially_delivered" });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });
});
