import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openCognitiveSidecarDb } from "../sidecar/db.js";
import { publishSemanticTransaction } from "../settlement/publish.js";
import { makeThoughtDraft } from "../test-support.js";
import { OutboxDeliveryProjector } from "../delivery/outbox-projector.js";
import { evaluateExternalizationGate } from "../initiative/externalization.js";
import { fireDueTriggers, scheduleFutureTrigger } from "../initiative/future-triggers.js";
import { tickIdleOpportunity } from "../initiative/idle.js";

function seedConcern(db: ReturnType<typeof openCognitiveSidecarDb>, status: "active" | "resolved" = "active"): void {
  db.prepare(
    `INSERT INTO concerns
       (concern_id, conversation_id, statement, source_refs_json, dimensions_json,
        assertion_key, status, snapshot_hash, updated_cycle)
     VALUES ('concern-auto', 'thread-auto', 'revisit the paper', '[]', '{}', NULL, ?, 'snapshot-auto', NULL)`,
  ).run(status);
  db.prepare(
    `INSERT INTO mind_occupancy
       (conversation_id, concern_id, status, priority, updated_cycle, updated_generation)
     VALUES ('thread-auto', 'concern-auto', ?, 10, 'seed', 1)`,
  ).run(status);
}

describe("v0.2.1 autonomy acceptance", () => {
  it("revalidates due triggers and keeps a private idle settlement silent", async () => {
    const db = openCognitiveSidecarDb(new DatabaseSync(":memory:"), { dataPlane: { kind: "isolated" } });
    try {
      seedConcern(db);
      scheduleFutureTrigger(db, { triggerId: "auto-trigger", conversationId: "thread-auto", concernId: "concern-auto", snapshotHash: "snapshot-auto", dueAtMs: 5 });
      const due = await fireDueTriggers(db, { nowMs: 5 });
      expect(due.fired).toHaveLength(1);
      const idle = await tickIdleOpportunity(db, {
        conversationId: "thread-auto",
        nowMs: 6,
        runThought: async () => ({ published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const }),
      });
      expect(idle.acceptedSettlements).toBe(1);
      expect(idle.thoughtModelAttempts).toBe(1);
      expect(db.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get()).toMatchObject({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("records an idle draft before pause and leaves delivery suppressed by the executive gate", async () => {
    const sidecar = openCognitiveSidecarDb(new DatabaseSync(":memory:"), { dataPlane: { kind: "isolated" } });
    const nuclear = new DatabaseSync(":memory:");
    try {
      const cycle = sidecar.prepare(
        `INSERT INTO cycle_records
           (cycle_id, conversation_id, generation, state, trigger_kind, trigger_ref,
            occupant_id, authority_epoch, architecture_epoch, admitted_at_ms, updated_at_ms,
            compose_log_ids_json, preempted_generation)
         VALUES ('cycle-auto-draft', 'thread-auto', 1, 'admitted', 'idle_opportunity', 'idle', 'doc', 1, 'v0.2.1', 1, 1, '[]', NULL)`,
      ).run();
      void cycle;
      const settlement = makeThoughtDraft({
        cycleId: "cycle-auto-draft",
        speech: { mode: "draft", mustSay: ["idle update"], mustNot: [], surfaceDraft: "idle update", acceptableRealizations: ["idle update"], presentationDirectives: [] },
      });
      const published = publishSemanticTransaction(sidecar, { ...settlement, settlementId: "settlement-auto-draft", speech: { ...settlement.speech, finalLicensedText: "idle update" } });
      expect(published.published).toBe(true);
      const gate = evaluateExternalizationGate({
        deliveryIntent: { ownerId: "doc", channel: "discord", threadId: "thread-auto", conversationId: "thread-auto", trigger: "idle", deliveryLane: "proactive", purpose: "licensed_speech" },
        paused: true, enabled: true, sentToday: 0, maxPerDay: 1, chatInProgress: false, availabilityOk: true, idleFloorRemainingSec: 0, privateBudgetRemaining: 1,
      });
      expect(gate).toEqual({ ok: false, reason: "proactive_paused" });
      const projector = new OutboxDeliveryProjector(sidecar, nuclear, { gate: () => ({ ok: false, reason: "proactive_paused" }) });
      await projector.project(published.outboxId!);
      expect(sidecar.prepare("SELECT send_status FROM speech_outbox WHERE settlement_id = 'settlement-auto-draft'").get()).toMatchObject({ send_status: "suppressed" });
    } finally {
      sidecar.close();
      nuclear.close();
    }
  });

  it("does not start a stale trigger cycle after resolution", async () => {
    const db = openCognitiveSidecarDb(new DatabaseSync(":memory:"), { dataPlane: { kind: "isolated" } });
    try {
      seedConcern(db, "resolved");
      scheduleFutureTrigger(db, { triggerId: "auto-stale", conversationId: "thread-auto", concernId: "concern-auto", snapshotHash: "snapshot-auto", dueAtMs: 1 });
      await expect(fireDueTriggers(db, { nowMs: 1 })).resolves.toMatchObject({ thoughtModelAttempts: 0, fired: [] });
      expect(db.prepare("SELECT COUNT(*) AS count FROM cycle_records").get()).toMatchObject({ count: 0 });
    } finally {
      db.close();
    }
  });
});
