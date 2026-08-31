import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openCognitiveSidecarDb } from "../sidecar/db.js";
import { publishSemanticTransaction } from "../settlement/publish.js";
import { admitTestCycle, makeThoughtDraft } from "../test-support.js";
import { OutboxDeliveryProjector } from "../delivery/outbox-projector.js";
import { evaluateExternalizationGate } from "../initiative/externalization.js";
import { fireDueTriggers, scheduleFutureTrigger } from "../initiative/future-triggers.js";
import { tickIdleOpportunity } from "../initiative/idle.js";
import type { PrivateBudgetProjection } from "../private-budget/ledger.js";
import { PRIVATE_THOUGHT_POLICY_ID } from "../private-budget/ledger.js";
import { reconcilePolicyClock } from "../private-budget/policy-time-ledger.js";

const privateBudget: PrivateBudgetProjection = {
  source: "private_budget_ledger",
  policyId: "private-v1",
  limit: 12,
  windowMs: 3_600_000,
  policyTimeMs: 1_000_000,
  lowerBoundMs: -2_600_000,
  clockState: "stable",
  discrepancyMs: 0,
  consumingCount: 11,
  remaining: 1,
  stateCounts: { held: 0, committed: 11, released: 0, reconcile_required: 0, expired: 0 },
};

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
      reconcilePolicyClock(db, { policyId: PRIVATE_THOUGHT_POLICY_ID, wallClockNowMs: 6, authorizationRef: "owner:test-epoch" });
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
      admitTestCycle(sidecar, {
        cycleId: "cycle-auto-draft",
        conversationId: "thread-auto",
        generation: 1,
        triggerKind: "idle_opportunity",
        triggerRef: "idle",
        occupantId: "doc",
        authorityEpoch: 1,
        architectureEpoch: "v0.2.1",
        nowMs: 1,
      });
      const settlement = makeThoughtDraft({
        cycleId: "cycle-auto-draft",
        speech: { mode: "draft", mustSay: ["idle update"], mustNot: [], surfaceDraft: "idle update", acceptableRealizations: ["idle update"], presentationDirectives: [] },
      });
      const published = publishSemanticTransaction(sidecar, { ...settlement, settlementId: "settlement-auto-draft", speech: { ...settlement.speech, finalLicensedText: "idle update" } });
      expect(published.published).toBe(true);
      const gate = evaluateExternalizationGate({
        deliveryIntent: { ownerId: "doc", channel: "discord", threadId: "thread-auto", conversationId: "thread-auto", trigger: "idle", deliveryLane: "proactive", purpose: "licensed_speech" },
        paused: true, enabled: true, sentToday: 0, maxPerDay: 1, chatInProgress: false, availabilityOk: true, idleFloorRemainingSec: 0, privateBudget,
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
      expect(db.prepare("SELECT COUNT(*) AS count FROM cycle_records").get()).toMatchObject({ count: 1 });
      expect(db.prepare("SELECT state, terminal_reason FROM wakes").get()).toMatchObject({ state: "terminal", terminal_reason: "no_action" });
    } finally {
      db.close();
    }
  });
});
