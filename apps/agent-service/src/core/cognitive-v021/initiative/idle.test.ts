import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR } from "../types.js";
import { openTestSidecar } from "../test-support.js";
import { PRIVATE_THOUGHT_POLICY_ID } from "../private-budget/ledger.js";
import { reconcilePolicyClock } from "../private-budget/policy-time-ledger.js";
import { tickIdleOpportunity } from "./idle.js";

function seedActiveOccupancy(db: ReturnType<typeof openTestSidecar>, conversationId = "thread-idle"): void {
  db.prepare(
    `INSERT INTO concerns
       (concern_id, conversation_id, statement, source_refs_json, dimensions_json,
        assertion_key, status, snapshot_hash, updated_cycle)
     VALUES ('concern-idle', ?, 'revisit HY3', '[]', '{}', NULL, 'active', 'snapshot-idle', NULL)`,
  ).run(conversationId);
  db.prepare(
    `INSERT INTO mind_occupancy
       (conversation_id, concern_id, status, priority, updated_cycle, updated_generation)
     VALUES (?, 'concern-idle', 'active', 20, 'cycle-seed', 1)`,
  ).run(conversationId);
}

function establishEpoch(db: ReturnType<typeof openTestSidecar>, nowMs: number): void {
  reconcilePolicyClock(db, { policyId: PRIVATE_THOUGHT_POLICY_ID, wallClockNowMs: nowMs, authorizationRef: "owner:test-epoch" });
}

describe("v0.2.1 idle executive", () => {
  it("does not call Thought in an empty house, even after ten ticks", async () => {
    const db = openTestSidecar();
    try {
      let calls = 0;
      for (let index = 0; index < 10; index += 1) {
        const result = await tickIdleOpportunity(db, {
          conversationId: "thread-empty",
          nowMs: index,
          runThought: async () => {
            calls += 1;
            return { published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const };
          },
        });
        expect(result.thoughtModelAttempts).toBe(0);
      }
      expect(calls).toBe(0);
    } finally {
      db.close();
    }
  });

  it("revisits active occupancy once and accepts private silence", async () => {
    const db = openTestSidecar();
    try {
      seedActiveOccupancy(db);
      establishEpoch(db, 100);
      let calls = 0;
      const result = await tickIdleOpportunity(db, {
        conversationId: "thread-idle",
        nowMs: 100,
        runThought: async (input) => {
          calls += 1;
          expect(input.trigger.kind).toBe("idle_opportunity");
          expect(input.occupancy).toEqual([expect.objectContaining({ concernId: "concern-idle", status: "active" })]);
          return { published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const };
        },
      });
      expect(calls).toBe(1);
      expect(result.thoughtModelAttempts).toBe(1);
      expect(result.acceptedSettlements).toBe(1);
    } finally {
      db.close();
    }
    const source = readFileSync(fileURLToPath(new URL("./idle.ts", import.meta.url)), "utf8").toLowerCase();
    expect(source).not.toContain("score");
    expect(source).not.toContain("interesting");
    expect(source).not.toContain("decide(");
  });

  it("does not write dormancy after unchanged private no-op idles", async () => {
    const db = openTestSidecar();
    try {
      seedActiveOccupancy(db, "thread-dormant");
      establishEpoch(db, 1000);
      let calls = 0;
      for (let index = 0; index < 4; index += 1) {
        const result = await tickIdleOpportunity(db, {
          conversationId: "thread-dormant",
          nowMs: 1000 + index,
          runThought: async () => {
            calls += 1;
            return { published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const };
          },
        });
        expect(result.dormant).toBe(false);
      }
      expect(calls).toBe(4);
      expect(db.prepare("SELECT status FROM mind_occupancy WHERE conversation_id = 'thread-dormant'").get()).toMatchObject({ status: "active" });
      expect(db.prepare("SELECT status FROM concerns WHERE conversation_id = 'thread-dormant'").get()).toMatchObject({ status: "active" });
    } finally {
      db.close();
    }
  });

  it("does not wake for LearnedSelf interest or an unmatched curiosity item", async () => {
    const db = openTestSidecar();
    try {
      let calls = 0;
      const result = await tickIdleOpportunity(db, {
        conversationId: "thread-interest",
        nowMs: 1,
        learnedSelfSlice: { dispositions: [], interests: ["space"] },
        curiosityItems: [{ text: "space news" }],
        runThought: async () => {
          calls += 1;
          return { published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const };
        },
      });
      expect(result.thoughtModelAttempts).toBe(0);
      expect(calls).toBe(0);
    } finally {
      db.close();
    }
  });

  it("stops private Thought calls at the hourly executive budget", async () => {
    const db = openTestSidecar();
    try {
      seedActiveOccupancy(db, "thread-budget");
      establishEpoch(db, 10_000);
      let calls = 0;
      for (let index = 0; index < PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR + 1; index += 1) {
        await tickIdleOpportunity(db, {
          conversationId: "thread-budget",
          nowMs: 10_000 + index * 100,
          runThought: async () => {
            calls += 1;
            return { published: true, outboxId: 1, thoughtModelAttempts: 1, speechMode: "draft" as const };
          },
        });
      }
      expect(calls).toBe(PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR);
    } finally {
      db.close();
    }
  });
});
