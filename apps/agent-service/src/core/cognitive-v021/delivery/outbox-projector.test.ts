import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb, nuclearSchemaVersion, NUCLEAR_SUPPORTED_VERSION } from "../../db.js";
import { openTestSidecar } from "../test-support.js";
import { admitCycle } from "../cycle/inbox.js";
import { insertOutboxPending } from "../speech/outbox.js";
import { emitInfrastructureNotice } from "../speech/infrastructure-notice.js";
import { OutboxDeliveryProjector } from "./outbox-projector.js";

describe("v0.2.1 cross-database outbox projection", () => {
  it("uses a versioned nuclear key and keeps speech/system namespaces distinct", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      expect(nuclearSchemaVersion(nuclear)).toBe(NUCLEAR_SUPPORTED_VERSION);
      expect(nuclear.prepare("PRAGMA table_info(delivery_reservations)").all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "cognitive_v021_projection_key" })]));
      admitCycle(sidecar, { cycleId: "cycle-project", conversationId: "thread-project", triggerKind: "owner_message", occupantId: "doc", nowMs: 1 });
      const speech = insertOutboxPending(sidecar, { settlementId: "settlement-project", cycleId: "cycle-project", generation: 1, conversationId: "thread-project", licensedText: "hello" });
      const notice = emitInfrastructureNotice(sidecar, { ownerId: "doc", channel: "discord", threadId: "thread-project", conversationId: "thread-project", cycleId: "cycle-project", generation: 1, reason: "unavailable" });
      const projector = new OutboxDeliveryProjector(sidecar, nuclear, { nowMs: () => 1_000 });
      await projector.project(speech.outboxId);
      await projector.projectSystem(notice.noticeId);
      expect(nuclear.prepare("SELECT cognitive_v021_projection_key, draft_text FROM delivery_reservations ORDER BY id").all()).toEqual([
        expect.objectContaining({ cognitive_v021_projection_key: "speech:1", draft_text: "hello" }),
        expect.objectContaining({ cognitive_v021_projection_key: "system:1", draft_text: "[system] Thought did not complete. Please send the message again." }),
      ]);
      await projector.project(speech.outboxId);
      expect(nuclear.prepare("SELECT COUNT(*) AS count FROM delivery_reservations").get()).toMatchObject({ count: 2 });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });

  it("reconciles a destination reservation that already committed", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      admitCycle(sidecar, { cycleId: "cycle-commit", conversationId: "thread-commit", triggerKind: "owner_message", occupantId: "doc", nowMs: 1 });
      const speech = insertOutboxPending(sidecar, { settlementId: "settlement-commit", cycleId: "cycle-commit", generation: 1, conversationId: "thread-commit", licensedText: "already sent" });
      nuclear.prepare(`INSERT INTO delivery_reservations (owner_id, channel, thread_id, trigger, delivery_lane, state, draft_text, created_at, cognitive_v021_projection_key) VALUES ('doc', 'discord', 'thread-commit', 'reactive', 'reactive', 'committed', 'already sent', '1970-01-01T00:00:01.000Z', ?)`).run("speech:" + speech.outboxId);
      const projector = new OutboxDeliveryProjector(sidecar, nuclear, { nowMs: () => 1_000 });
      await projector.project(speech.outboxId);
      expect(sidecar.prepare("SELECT send_status, nuclear_reservation_id FROM speech_outbox WHERE outbox_id = ?").get(speech.outboxId)).toMatchObject({ send_status: "delivered", nuclear_reservation_id: 1 });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });

  it("defers a proactive daily-cap row, then suppresses it after revalidation", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const row = insertOutboxPending(sidecar, {
        settlementId: "settlement-deferred",
        cycleId: "cycle-deferred",
        generation: 1,
        conversationId: "thread-deferred",
        licensedText: "proactive draft",
        deliveryIntent: {
          ownerId: "doc",
          channel: "discord",
          threadId: "thread-deferred",
          conversationId: "thread-deferred",
          trigger: "idle",
          deliveryLane: "proactive",
          purpose: "licensed_speech",
        },
      });
      let cap = true;
      const projector = new OutboxDeliveryProjector(sidecar, nuclear, {
        gate: () => cap ? { ok: false, reason: "daily_cap" } : { ok: false, reason: "proactive_paused" },
      });
      await projector.project(row.outboxId);
      expect(sidecar.prepare("SELECT send_status FROM speech_outbox WHERE outbox_id = ?").get(row.outboxId)).toMatchObject({ send_status: "pending" });
      expect(nuclear.prepare("SELECT COUNT(*) AS count FROM delivery_reservations").get()).toMatchObject({ count: 0 });
      cap = false;
      await projector.project(row.outboxId);
      expect(sidecar.prepare("SELECT send_status, nuclear_finalization_reason FROM speech_outbox WHERE outbox_id = ?").get(row.outboxId)).toMatchObject({ send_status: "suppressed", nuclear_finalization_reason: "proactive_paused" });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });

  it("suppresses a deferred row when its publisher generation is no longer current", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const row = insertOutboxPending(sidecar, {
        settlementId: "settlement-superseded",
        cycleId: "cycle-superseded",
        generation: 1,
        conversationId: "thread-superseded",
        licensedText: "stale proactive draft",
        deliveryIntent: {
          ownerId: "doc",
          channel: "discord",
          threadId: "thread-superseded",
          conversationId: "thread-superseded",
          trigger: "future_trigger",
          deliveryLane: "proactive",
          purpose: "licensed_speech",
        },
      });
      const projector = new OutboxDeliveryProjector(sidecar, nuclear, {
        gate: () => ({ ok: false, reason: "daily_cap" }),
        isCurrentGeneration: () => false,
      });
      await projector.project(row.outboxId);
      expect(sidecar.prepare("SELECT send_status, nuclear_finalization_reason FROM speech_outbox WHERE outbox_id = ?").get(row.outboxId)).toMatchObject({ send_status: "suppressed", nuclear_finalization_reason: "superseded_generation" });
      expect(nuclear.prepare("SELECT COUNT(*) AS count FROM delivery_reservations").get()).toMatchObject({ count: 0 });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });
});
