import { describe, expect, it } from "vitest";
import { openTestSidecar } from "../test-support.js";
import { fireDueTriggers, listFutureTriggers, scheduleFutureTrigger } from "./future-triggers.js";

function seedConcern(db: ReturnType<typeof openTestSidecar>, status: "active" | "resolved" = "active", snapshotHash = "snapshot-1"): void {
  db.prepare(
    `INSERT INTO concerns
       (concern_id, conversation_id, statement, source_refs_json, dimensions_json,
        assertion_key, status, snapshot_hash, updated_cycle)
     VALUES ('concern-1', 'thread-trigger', 'inspect HY3', '[]', '{}', NULL, ?, ?, NULL)`,
  ).run(status, snapshotHash);
  db.prepare(
    `INSERT INTO mind_occupancy
       (conversation_id, concern_id, status, priority, updated_cycle, updated_generation)
     VALUES ('thread-trigger', 'concern-1', ?, 10, 'cycle-seed', 1)`,
  ).run(status);
}

describe("v0.2.1 FutureTrigger fence", () => {
  it("suppresses a due trigger after occupancy resolves without calling Thought", async () => {
    const db = openTestSidecar();
    try {
      seedConcern(db, "resolved");
      scheduleFutureTrigger(db, { triggerId: "future-resolved", conversationId: "thread-trigger", concernId: "concern-1", snapshotHash: "snapshot-1", dueAtMs: 10, payload: { concernId: "concern-1" } });
      const result = await fireDueTriggers(db, { nowMs: 10 });
      expect(result.thoughtModelAttempts).toBe(0);
      expect(result.suppressedStale).toHaveLength(1);
      expect(db.prepare("SELECT status FROM future_triggers WHERE trigger_id = 'future-resolved'").get()).toMatchObject({ status: "suppressed_stale" });
      expect(db.prepare("SELECT payload_json FROM causal_ledger WHERE cycle_id = 'future-trigger:future-resolved'").get()).toMatchObject({ payload_json: expect.stringContaining("suppressed_stale") });
    } finally {
      db.close();
    }
  });

  it("suppresses a due trigger when the concern snapshot hash changed", async () => {
    const db = openTestSidecar();
    try {
      seedConcern(db, "active", "snapshot-new");
      scheduleFutureTrigger(db, { triggerId: "future-hash", conversationId: "thread-trigger", concernId: "concern-1", snapshotHash: "snapshot-old", dueAtMs: 10 });
      const result = await fireDueTriggers(db, { nowMs: 10 });
      expect(result.suppressedStale).toHaveLength(1);
      expect(result.thoughtModelAttempts).toBe(0);
    } finally {
      db.close();
    }
  });

  it("fires a valid trigger once and stores only references in the inbox event", async () => {
    const db = openTestSidecar();
    try {
      seedConcern(db);
      scheduleFutureTrigger(db, { triggerId: "future-valid", conversationId: "thread-trigger", concernId: "concern-1", snapshotHash: "snapshot-1", dueAtMs: 10, payload: { concernId: "concern-1", label: "HY3" } });
      let calls = 0;
      const result = await fireDueTriggers(db, {
        nowMs: 10,
        onFire: async ({ trigger }) => {
          calls += 1;
          expect(trigger.triggerId).toBe("future-valid");
          return { thoughtModelAttempts: 1 };
        },
      });
      expect(result.fired).toHaveLength(1);
      expect(result.thoughtModelAttempts).toBe(1);
      expect(calls).toBe(1);
      const event = db.prepare("SELECT kind, payload_json FROM inbox_events WHERE id = 'future-trigger:future-valid'").get() as { kind: string; payload_json: string };
      expect(event.kind).toBe("future_trigger_due");
      expect(event.payload_json).not.toContain("inspect HY3");
      await expect(fireDueTriggers(db, { nowMs: 11 })).resolves.toMatchObject({ fired: [], thoughtModelAttempts: 0 });
      expect(listFutureTriggers(db, "thread-trigger")).toEqual([expect.objectContaining({ status: "fired" })]);
    } finally {
      db.close();
    }
  });
});
