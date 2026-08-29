import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { appendInboxEvent, claimInboxEvent } from "../cycle/inbox.js";
import { openTestSidecar } from "../test-support.js";
import { openCognitiveSidecarDb } from "./db.js";
import { recoverCognitiveSidecar } from "./recovery.js";
import { putInFlight } from "../effect/in-flight.js";
import { admitCycle } from "../cycle/inbox.js";

describe("cognitive sidecar reopen recovery", () => {
  it("returns expired inbox claims and orphaned live projections to retryable states", () => {
    const db = openTestSidecar();
    appendInboxEvent(db, { conversationId: "thread-recovery", kind: "owner_message", payload: {}, createdAtMs: 1 });
    claimInboxEvent(db, { workerId: "crashed", nowMs: 10, leaseMs: 5 });
    db.prepare(
      `INSERT INTO speech_outbox
       (settlement_id, projection_key, cycle_id, generation, conversation_id, licensed_text,
        send_status, suppressed, origin, delivery_intent_json)
       VALUES ('settlement-recovery', 'speech:recovery', 'cycle-recovery', 1, 'thread-recovery',
        'hello', 'projecting', 0, 'live', '{}')`,
    ).run();
    const result = recoverCognitiveSidecar(db, 20);
    expect(result).toEqual({ inboxClaimsRecovered: 1, speechProjectionsRequeued: 1, noticeProjectionsRequeued: 0 });
    expect(db.prepare("SELECT status, last_error FROM inbox_events").get()).toMatchObject({ status: "failed_retryable", last_error: "recovered_after_lease_expiry" });
    expect(db.prepare("SELECT send_status FROM speech_outbox").get()).toMatchObject({ send_status: "pending" });
    db.close();
  });

  it("reopens orphaned effects as unknown and enqueues one idempotent recovery event", () => {
    const directory = mkdtempSync(join(tmpdir(), "ashley-v021-recovery-"));
    const databasePath = join(directory, "sidecar.db");
    let db = openCognitiveSidecarDb(new DatabaseSync(databasePath), {
      dataPlane: { kind: "isolated" },
    });
    admitCycle(db, {
      cycleId: "cycle-restart",
      conversationId: "conversation-restart",
      generation: 3,
      triggerKind: "owner_message",
      occupantId: "doc",
      nowMs: 1,
    });
    putInFlight(db, {
      effectId: "effect-restart",
      cycleId: "cycle-restart",
      generation: 3,
      correlationId: "correlation-restart",
      idempotencyKey: "idempotency-restart",
      payload: { projectId: "project-restart" },
      dispatchedAtMs: 1,
    });
    db.close();

    try {
      db = openCognitiveSidecarDb(new DatabaseSync(databasePath), {
        dataPlane: { kind: "isolated" },
      });
      expect(db.prepare("SELECT state FROM in_flight_effects WHERE effect_id = 'effect-restart'").get()).toMatchObject({ state: "unknown" });
      expect(db.prepare("SELECT id, kind FROM inbox_events").all()).toEqual([
        { id: "recovery:effect-restart", kind: "recovery" },
      ]);
      const payload = db.prepare("SELECT payload_json FROM inbox_events WHERE id = 'recovery:effect-restart'").get() as { payload_json: string };
      expect(JSON.parse(payload.payload_json)).toMatchObject({
        cycleId: "cycle-restart",
        generation: 3,
        effectId: "effect-restart",
        correlationId: "correlation-restart",
      });
      db.close();
      db = openCognitiveSidecarDb(new DatabaseSync(databasePath), {
        dataPlane: { kind: "isolated" },
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM inbox_events WHERE id = 'recovery:effect-restart'").get()).toMatchObject({ count: 1 });
    } finally {
      try { db.close(); } catch { /* already closed */ }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
