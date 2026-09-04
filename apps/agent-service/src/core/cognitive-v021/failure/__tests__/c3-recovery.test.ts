import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../../../db.js";
import { openTestSidecar } from "../../test-support.js";
import { insertOutboxPending } from "../../speech/outbox.js";
import { repairMissingC3Experiences } from "../c3-recovery.js";

function seedSidecarSources(sidecar: DatabaseSync): void {
  sidecar.prepare(
    `INSERT INTO cycle_records
       (cycle_id, conversation_id, generation, wake_id, state, trigger_kind,
        trigger_ref, occupant_id, authority_epoch, architecture_epoch,
        admitted_at_ms, updated_at_ms, compose_log_ids_json, preempted_generation)
     VALUES ('cycle:thought', 'conversation:thought', 1, NULL, 'silent',
       'owner_message', 'trigger:thought', 'doc', 1, 'v0.2.1', 1, 100, '[]', NULL)`,
  ).run();
  sidecar.prepare(
    `INSERT INTO system_notice_outbox
       (notice_key, projection_key, cycle_id, conversation_id, notice_text,
        send_status, origin, delivery_intent_json)
     VALUES ('thought_failure:conversation:thought:cycle:thought:1:unavailable',
       'system:thought', 'cycle:thought', 'conversation:thought',
       '[system] visible notice text', 'pending', 'live', '{}')`,
  ).run();
  sidecar.prepare(
    `INSERT INTO deferred_reactive_frontiers
       (frontier_id, conversation_id, cycle_id, generation, state,
        next_eligible_at_ms, capacity_deadline_at_ms, latest_evidence_row_id,
        attempt_count, created_at_ms, updated_at_ms, terminal_reason)
     VALUES ('frontier:capacity', 'conversation:frontier', 'cycle:frontier', 1,
       'exhausted', 1, 2, 'evidence:frontier', 1, 1, 200,
       'capacity_wait_max_duration_exceeded')`,
  ).run();
  sidecar.prepare(
    `INSERT INTO cycle_records
       (cycle_id, conversation_id, generation, wake_id, state, trigger_kind,
        trigger_ref, occupant_id, authority_epoch, architecture_epoch,
        admitted_at_ms, updated_at_ms, compose_log_ids_json, preempted_generation)
     VALUES ('cycle:frontier', 'conversation:frontier', 1, NULL, 'silent',
       'owner_message', 'trigger:frontier', 'doc', 1, 'v0.2.1', 1, 100, '[]', NULL)`,
  ).run();
}

describe("C3 bounded forward recovery", () => {
  it("recovers post-cutover thought/frontier/delivery terminal rows and is write-once", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      // The first valid startup binds the delivery watermark to reservations
      // that already exist. Establish it before creating post-cutover work.
      expect((await repairMissingC3Experiences(sidecar, nuclear, { nowMs: 200 })).recorded).toBe(0);
      seedSidecarSources(sidecar);
      const outbox = insertOutboxPending(sidecar, {
        settlementId: "settlement:delivery",
        cycleId: "cycle:delivery",
        generation: 1,
        conversationId: "conversation:delivery",
        licensedText: "licensed text",
      });
      nuclear.prepare(
        `INSERT INTO delivery_reservations
           (owner_id, channel, thread_id, trigger, delivery_lane, state,
            error_category, finalization_reason, draft_text, created_at,
            finalized_at, cognitive_v021_projection_key)
         VALUES ('doc', 'discord', 'conversation:delivery', 'reactive',
           'reactive', 'aborted', 'send_failure', 'send_failure',
           'licensed text', '2026-09-04T00:00:00.000Z',
           '2026-09-04T00:00:01.000Z', ?)`,
      ).run(`speech:${outbox.outboxId}`);

      const first = await repairMissingC3Experiences(sidecar, nuclear, { nowMs: 300, limit: 50 });
      expect(first.recorded).toBe(3);
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM c3_terminal_experiences").get()).toEqual({ count: 3 });
      expect(sidecar.prepare("SELECT experience_id FROM c3_terminal_experiences ORDER BY experience_id").all()).toEqual([
        { experience_id: "c3:delivery:1:delivery_aborted" },
        { experience_id: "c3:frontier:frontier:capacity:capacity_wait_max_duration_exceeded" },
        { experience_id: "c3:thought:thought_failure:conversation:thought:cycle:thought:1:unavailable" },
      ]);
      const second = await repairMissingC3Experiences(sidecar, nuclear, { nowMs: 301, limit: 50 });
      expect(second.recorded).toBe(0);
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM c3_terminal_experiences").get()).toEqual({ count: 3 });
      expect(sidecar.prepare("SELECT max_pre_v8_delivery_reservation_id FROM c3_activation_cutover WHERE id = 1").get()).toEqual({ max_pre_v8_delivery_reservation_id: 0 });

      const later = insertOutboxPending(sidecar, {
        settlementId: "settlement:delivery:later",
        cycleId: "cycle:delivery:later",
        generation: 1,
        conversationId: "conversation:delivery:later",
        licensedText: "later licensed text",
      });
      nuclear.prepare(
        `INSERT INTO delivery_reservations
           (owner_id, channel, thread_id, trigger, delivery_lane, state,
            error_category, finalization_reason, draft_text, created_at,
            finalized_at, cognitive_v021_projection_key)
         VALUES ('doc', 'discord', 'conversation:delivery:later', 'reactive',
           'reactive', 'expired', 'send_failure', 'delivery_lease_expired',
           'later licensed text', '2026-09-04T00:00:02.000Z',
           '2026-09-04T00:00:03.000Z', ?)` ,
      ).run(`speech:${later.outboxId}`);
      expect((await repairMissingC3Experiences(sidecar, nuclear, { nowMs: 302 })).recorded).toBe(1);
      expect(sidecar.prepare("SELECT max_pre_v8_delivery_reservation_id FROM c3_activation_cutover WHERE id = 1").get()).toEqual({ max_pre_v8_delivery_reservation_id: 0 });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });

  it("does not backfill pre-cutover sources and does not mint publication or unknown failures", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      sidecar.prepare(
        `INSERT INTO cycle_records
           (cycle_id, conversation_id, generation, wake_id, state, trigger_kind,
            trigger_ref, occupant_id, authority_epoch, architecture_epoch,
            admitted_at_ms, updated_at_ms, compose_log_ids_json, preempted_generation)
         VALUES ('cycle:pre', 'conversation:pre', 1, NULL, 'silent',
           'owner_message', 'trigger:pre', 'doc', 1, 'v0.2.1', 1, 100, '[]', NULL)`,
      ).run();
      sidecar.prepare(
        `INSERT INTO system_notice_outbox
           (notice_key, projection_key, cycle_id, conversation_id, notice_text,
            send_status, origin, delivery_intent_json)
         VALUES ('thought_failure:conversation:pre:cycle:pre:1:unavailable',
           'system:pre', 'cycle:pre', 'conversation:pre', 'old', 'pending', 'live', '{}')`,
      ).run();
      nuclear.exec("INSERT INTO delivery_reservations (owner_id, channel, thread_id, trigger, delivery_lane, state, created_at, cognitive_v021_projection_key) VALUES ('doc', 'discord', 'pre', 'reactive', 'reactive', 'aborted', '2026-09-04T00:00:00.000Z', 'speech:999')");
      sidecar.prepare("UPDATE c3_activation_cutover SET max_pre_v8_notice_id = (SELECT MAX(notice_id) FROM system_notice_outbox) WHERE id = 1").run();
      const result = await repairMissingC3Experiences(sidecar, nuclear, { nowMs: 500 });
      expect(result.recorded).toBe(0);
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM c3_terminal_experiences").get()).toEqual({ count: 0 });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });

  it("drains more than 50 oldest candidates across repeated recovery passes", async () => {
    const sidecar = openTestSidecar();
    const nuclear = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      expect((await repairMissingC3Experiences(sidecar, nuclear, { nowMs: 1 })).recorded).toBe(0);
      const cycleInsert = sidecar.prepare(
        `INSERT INTO cycle_records
           (cycle_id, conversation_id, generation, wake_id, state, trigger_kind,
            trigger_ref, occupant_id, authority_epoch, architecture_epoch,
            admitted_at_ms, updated_at_ms, compose_log_ids_json, preempted_generation)
         VALUES (?, ?, 1, NULL, 'silent', 'owner_message', ?, 'doc', 1,
           'v0.2.1', ?, ?, '[]', NULL)`,
      );
      const noticeInsert = sidecar.prepare(
        `INSERT INTO system_notice_outbox
           (notice_key, projection_key, cycle_id, conversation_id, notice_text,
            send_status, origin, delivery_intent_json)
         VALUES (?, ?, ?, ?, '[system] bounded recovery notice', 'pending', 'live', '{}')`,
      );
      for (let index = 0; index < 51; index += 1) {
        const cycleId = `cycle:batch:${index}`;
        const conversationId = `conversation:batch:${index}`;
        cycleInsert.run(
          cycleId,
          conversationId,
          `trigger:batch:${index}`,
          10 + index,
          10 + index,
        );
        noticeInsert.run(
          `thought_failure:${conversationId}:${cycleId}:1:unavailable`,
          `system:batch:${index}`,
          cycleId,
          conversationId,
        );
      }

      const first = await repairMissingC3Experiences(sidecar, nuclear, { nowMs: 100, limit: 50 });
      expect(first.recorded).toBe(50);
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM c3_terminal_experiences").get()).toEqual({ count: 50 });

      const second = await repairMissingC3Experiences(sidecar, nuclear, { nowMs: 101, limit: 50 });
      expect(second.recorded).toBe(1);
      expect(sidecar.prepare("SELECT COUNT(*) AS count FROM c3_terminal_experiences").get()).toEqual({ count: 51 });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });
});
