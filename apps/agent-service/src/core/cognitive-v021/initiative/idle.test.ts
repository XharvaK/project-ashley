import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR } from "../types.js";
import { openTestSidecar } from "../test-support.js";
import { PRIVATE_THOUGHT_POLICY_ID } from "../private-budget/ledger.js";
import { reconcilePolicyClock } from "../private-budget/policy-time-ledger.js";
import { tickIdleOpportunity } from "./idle.js";
import { scheduleFutureTrigger } from "./future-triggers.js";

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
        expect(result.idleEligible).toBe(false);
        expect(result.semanticAbsenceClaim).toBe("yes");
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
      expect(result.idleEligible).toBe(true);
      expect(result.semanticAbsenceClaim).toBe("no");
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
      let exhaustedResult;
      for (let index = 0; index < PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR + 1; index += 1) {
        const result = await tickIdleOpportunity(db, {
          conversationId: "thread-budget",
          nowMs: 10_000 + index * 100,
          runThought: async () => {
            calls += 1;
            return { published: true, outboxId: 1, thoughtModelAttempts: 1, speechMode: "draft" as const };
          },
        });
        if (index === PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR) exhaustedResult = result;
      }
      expect(calls).toBe(PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR);
      expect(exhaustedResult?.reason).toBe("private_compute_budget");
      expect(db.prepare("SELECT COUNT(*) AS count FROM wakes WHERE conversation_id = 'thread-budget'").get()).toMatchObject({ count: PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR });
    } finally {
      db.close();
    }
  });

  it("admits a bounded curiosity observation through the existing idle opportunity", async () => {
    const db = openTestSidecar();
    try {
      establishEpoch(db, 100);
      let acquisitionCalls = 0;
      const result = await tickIdleOpportunity(db, {
        conversationId: "thread-curiosity",
        nowMs: 100,
        curiosityObservationProvider: async (input: { conversationId: string; nowMs: number }) => {
          acquisitionCalls += 1;
          expect(input).toMatchObject({ conversationId: "thread-curiosity", nowMs: 100 });
          return [{
            observationId: "curiosity:read:7:abc",
            derived: true,
            replaySafe: true,
            modality: "page" as const,
            payload: {
              readId: 7,
              itemId: 9,
              finalUrl: "https://example.com/article",
              contentHash: "abc",
              retrievedAt: "2026-09-09T00:00:00.000Z",
              title: "A bounded page",
              excerpts: ["Untrusted source evidence."],
              inputTrust: "untrusted_evidence",
            },
            provenance: "curiosity:read:7:abc",
            dataClassification: "ordinary" as const,
            secretOmitted: false,
          }];
        },
        runThought: async (input: import("./idle.js").IdleThoughtContext) => {
          expect(input.trigger.kind).toBe("idle_opportunity");
          expect(input.observations).toEqual([
            expect.objectContaining({
              observationId: "curiosity:read:7:abc",
              cycleId: input.cycle.cycleId,
              generation: input.cycle.generation,
            }),
          ]);
          return { published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const };
        },
      } as any);

      expect(acquisitionCalls).toBe(1);
      expect(result).toMatchObject({ eligible: true, thoughtModelAttempts: 1, acceptedSettlements: 1 });
      expect(result.semanticAbsenceClaim).toBe("no");
      expect(db.prepare("SELECT COUNT(*) AS count FROM concerns").get()).toMatchObject({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM working_context_items").get()).toMatchObject({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM speech_outbox").get()).toMatchObject({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("does not turn a stale suppressed trigger into a curiosity opportunity", async () => {
    const db = openTestSidecar();
    try {
      db.prepare(
        `INSERT INTO concerns
           (concern_id, conversation_id, statement, source_refs_json, dimensions_json,
            assertion_key, status, snapshot_hash, updated_cycle)
         VALUES ('resolved-concern', 'thread-stale', 'old concern', '[]', '{}', NULL,
                 'resolved', 'resolved-snapshot', NULL)`,
      ).run();
      scheduleFutureTrigger(db, {
        triggerId: "stale-curiosity-trigger",
        conversationId: "thread-stale",
        concernId: "resolved-concern",
        snapshotHash: "resolved-snapshot",
        dueAtMs: 1,
      });
      let acquisitions = 0;
      const result = await tickIdleOpportunity(db, {
        conversationId: "thread-stale",
        nowMs: 2,
        curiosityObservationProvider: async () => {
          acquisitions += 1;
          return [];
        },
        runThought: async () => ({ published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const }),
      });

      expect(acquisitions).toBe(0);
      expect(result.reason).toBe("empty_house");
      expect(result.thoughtCalls).toBe(0);
    } finally {
      db.close();
    }
  });

  it("leaves acquired evidence mechanical when private Thought admission is exhausted", async () => {
    const db = openTestSidecar();
    try {
      seedActiveOccupancy(db, "thread-mechanical-only");
      establishEpoch(db, 10_000);
      let acquisitions = 0;
      let thoughtCalls = 0;
      const draft = {
        observationId: "curiosity:read:mechanical:hash",
        derived: true,
        replaySafe: true,
        modality: "page" as const,
        payload: { inputTrust: "untrusted_evidence" },
        provenance: "curiosity:read:mechanical:hash",
        dataClassification: "ordinary" as const,
        secretOmitted: false,
      };
      for (let index = 0; index < PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR; index += 1) {
        await tickIdleOpportunity(db, {
          conversationId: "thread-mechanical-only",
          nowMs: 10_000 + index * 100,
          curiosityObservationProvider: async () => {
            acquisitions += 1;
            return [draft];
          },
          runThought: async () => {
            thoughtCalls += 1;
            return { published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const };
          },
        });
      }
      const exhausted = await tickIdleOpportunity(db, {
        conversationId: "thread-mechanical-only",
        nowMs: 11_300,
        curiosityObservationProvider: async () => {
          acquisitions += 1;
          return [draft];
        },
        runThought: async () => {
          thoughtCalls += 1;
          return { published: true, outboxId: null, thoughtModelAttempts: 1, speechMode: "none" as const };
        },
      });

      expect(acquisitions).toBe(PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR + 1);
      expect(thoughtCalls).toBe(PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR);
      expect(exhausted).toMatchObject({ reason: "private_compute_budget", observations: [] });
      expect(db.prepare("SELECT COUNT(*) AS count FROM wakes WHERE conversation_id = 'thread-mechanical-only'").get())
        .toMatchObject({ count: PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR });
      expect(db.prepare("SELECT COUNT(*) AS count FROM concerns WHERE conversation_id = 'thread-mechanical-only'").get())
        .toMatchObject({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("preserves unknown physical execution provenance without changing legacy counters", async () => {
    const db = openTestSidecar();
    try {
      seedActiveOccupancy(db, "idle-provenance");
      establishEpoch(db, 10);
      const result = await tickIdleOpportunity(db, {
        conversationId: "idle-provenance",
        nowMs: 10,
        runThought: async () => ({
          published: false,
          thoughtModelAttempts: 0,
          thoughtExecutionProvenance: {
            dispatchTruth: "unknown" as const,
            providerAttempts: "unknown" as const,
          },
        }),
      });

      expect(result).toMatchObject({
        thoughtModelAttempts: 0,
        thoughtCalls: 1,
        thoughtExecutionProvenance: { dispatchTruth: "unknown", providerAttempts: "unknown" },
      });
    } finally {
      db.close();
    }
  });
});
