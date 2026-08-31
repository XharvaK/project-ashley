import { describe, expect, it, vi } from "vitest";
import { appendInboxEvent } from "./inbox.js";
import { claimNextInboxEvent, consumeNextInboxEvent, startInboxConsumer } from "./inbox-consumer.js";
import { openTestSidecar } from "../test-support.js";

describe("durable cognitive inbox consumer", () => {
  it("reclaims a 202-admitted event after a worker lease expires", async () => {
    const db = openTestSidecar();
    appendInboxEvent(db, { conversationId: "thread-restart", kind: "owner_message", payload: {}, createdAtMs: 1 });
    const claimed = claimNextInboxEvent(db, { workerId: "crashed-worker", nowMs: 10, leaseMs: 5 });
    expect(claimed?.status).toBe("claimed");
    const seen: string[] = [];
    const result = await consumeNextInboxEvent(db, {
      workerId: "restarted-worker",
      nowMs: () => 20,
      handler: async (event) => { seen.push(event.id); },
    });
    expect(result).toMatchObject({ outcome: "consumed" });
    expect(seen).toHaveLength(1);
    expect(db.prepare("SELECT status, attempt_count FROM inbox_events").get()).toMatchObject({ status: "consumed", attempt_count: 2 });
    db.close();
  });

  it("holds publication work for reconciliation after a crash instead of replaying it", async () => {
    const db = openTestSidecar();
    appendInboxEvent(db, { id: "event-replay", conversationId: "thread-replay", kind: "owner_message", payload: {}, createdAtMs: 1 });
    let calls = 0;
    const first = await consumeNextInboxEvent(db, {
      workerId: "worker-a",
      handler: async () => {
        calls += 1;
        db.prepare("INSERT OR IGNORE INTO settlements (settlement_id, cycle_id, generation, payload_json) VALUES (?, ?, ?, ?)").run("settlement-replay", "cycle-replay", 1, "{}");
        if (calls === 1) throw new Error("crash_after_publication_commit");
      },
    });
    const second = await consumeNextInboxEvent(db, { workerId: "worker-b", handler: async () => {
      db.prepare("INSERT OR IGNORE INTO settlements (settlement_id, cycle_id, generation, payload_json) VALUES (?, ?, ?, ?)").run("settlement-replay", "cycle-replay", 1, "{}");
    } });
    expect(first).toMatchObject({ outcome: "failed" });
    expect(second).toMatchObject({ outcome: "idle" });
    expect(calls).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM settlements").get()).toMatchObject({ count: 1 });
    expect(db.prepare("SELECT status, state FROM inbox_events WHERE id = 'event-replay'").get()).toMatchObject({ status: "claimed", state: "reconciling" });
    db.close();
  });

  it("stops the polling loop without leaving a timer behind", async () => {
    const db = openTestSidecar();
    const handler = vi.fn(async () => undefined);
    const loop = startInboxConsumer(db, { workerId: "worker-loop", handler, pollMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    loop.stop();
    await loop.done;
    expect(handler).not.toHaveBeenCalled();
    db.close();
  });
});
