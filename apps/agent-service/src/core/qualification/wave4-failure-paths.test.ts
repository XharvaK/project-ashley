import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advanceTurn, installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture, armGroqKey, restoreGroqKey, fakeAnalyze } from "./counterfactual-harness.js";
import { expectLiveEquivalent, snapshotTable, type Row } from "./state-inventory.js";
import { clearCaptures, thoughtCapture } from "./mistral-client-mock-state.js";
import { completeChat } from "../../mistral-client.js";
import { processNextCognitiveJob, type CognitionAnalysis } from "../cognition/worker.js";
import { insertItem, upsertSource } from "../curiosity/feed.js";
import { performGroundedReads } from "../curiosity/reads.js";

/**
 * Phase 3 — failure paths.
 *
 * Every failure mode must be inert twice over: no live behavioral change, and
 * no false qualification credit (no live_shadow capability event for work that
 * did not actually complete).
 */

type Analyze = (transcript: string) => Promise<{ analysis: CognitionAnalysis; model: string; raw: string }>;

const analyzeThrows: Analyze = () => Promise.reject(new Error("wave4_analyze_failure"));

const analyzeNoMindState: Analyze = () => {
  const analysis: CognitionAnalysis = {
    summary: "WAVE4_NO_MIND_STATE summary",
    entities: ["WAVE4_NO_MIND_STATE"],
    salience: 0.5,
    unresolved: false,
    stateItems: [],
    affect: {
      valenceDelta: 0,
      activationDelta: 0,
      opennessDelta: 0,
      tensionDelta: 0,
      reason: "No material affect change.",
    },
    revisions: [],
    facts: [],
  };
  return Promise.resolve({ analysis, model: "fake", raw: JSON.stringify(analysis) });
};

async function pumpWith(fixture: Fixture, analyze: Analyze): Promise<void> {
  advanceTurn(60 * 60 * 1000);
  for (let guard = 0; guard < 100; guard += 1) {
    if (!(await processNextCognitiveJob(fixture.db, "observe", analyze))) return;
  }
  throw new Error("pumpWith: too many cognition jobs (loop?)");
}

function liveShadow(fixture: Fixture, capability: string): Row[] {
  return (fixture.classRows("CONTROL_PLANE").capability_events ?? []).filter(
    (row) => row.capability === capability && row.kind === "live_shadow",
  );
}

function jobs(fixture: Fixture): Array<{ status: string; last_error: string | null }> {
  return fixture.db
    .prepare(`SELECT status, last_error FROM cognitive_jobs ORDER BY id`)
    .all() as Array<{ status: string; last_error: string | null }>;
}

describe("wave4 Phase 3 — failure paths grant no credit and no live change", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("(a) Recall analyze throws: job fails cleanly, no episode, no credit, A ≡ B", async () => {
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      for (const message of ["tell me about dub techno", "more of that please"]) {
        await on.turn(message);
        await pumpWith(on, analyzeThrows);
        await on.quiesce();
        await off.turn(message);
      }

      expect(snapshotTable(on.db, "episodes")).toEqual([]);
      const runs = snapshotTable(on.db, "cognitive_runs");
      expect(runs.length).toBeGreaterThan(0);
      expect(runs.every((row) => row.status === "failed")).toBe(true);
      for (const capability of ["recall", "mind_state", "affect", "learning", "thought"]) {
        expect(liveShadow(on, capability), capability).toEqual([]);
      }
      // Not stuck 'running' — the executor released the claim (retry pending).
      expect(jobs(on).every((job) => job.status === "pending" || job.status === "failed")).toBe(true);
      expect(jobs(on).some((job) => job.last_error === "wave4_analyze_failure")).toBe(true);
      expectLiveEquivalent(on.live(), off.live());

      // Recovery: a healthy pump of the same job still consolidates.
      await pumpWith(on, fakeAnalyze);
      expect(snapshotTable(on.db, "episodes").length).toBeGreaterThan(0);
      expect(liveShadow(on, "recall").length).toBeGreaterThan(0);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("(b) shadow analysis without Mind State never reaches Thought, A ≡ B", async () => {
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      const script = [
        "tell me about dub techno",
        "don't give me fake agreement just to be nice",
      ];
      for (const message of script) {
        await on.turn(message);
        await pumpWith(on, analyzeNoMindState);
        await on.quiesce();
        await off.turn(message);
      }

      expect(snapshotTable(on.db, "episodes").length).toBeGreaterThan(0);
      expect(thoughtCapture).toEqual([]);
      expect(liveShadow(on, "thought")).toEqual([]);
      expect(liveShadow(on, "mind_state")).toEqual([]);
      expect(liveShadow(on, "affect")).toEqual([]);
      expect(liveShadow(on, "recall").length).toBeGreaterThan(0);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("(c) Thought throws: no credit, no hang, live Decision unchanged, A ≡ B", async () => {
    const mocked = vi.mocked(completeChat);
    const passthrough = mocked.getMockImplementation()!;
    mocked.mockImplementation(async (messages, options) => {
      if (options.route === "thought") throw new Error("wave4_thought_failure");
      return passthrough(messages, options);
    });
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      const script = [
        "tell me about dub techno",
        "don't give me fake agreement just to be nice",
      ];
      for (const message of script) {
        await on.turn(message);
        await on.pump();
        await on.quiesce();
        await off.turn(message);
      }

      const thoughtCalls = mocked.mock.calls.filter(
        (call) => (call[1] ?? {}).route === "thought",
      );
      expect(thoughtCalls.length).toBeGreaterThan(0);
      expect(thoughtCapture).toEqual([]);
      expect(liveShadow(on, "thought")).toEqual([]);
      expect(
        snapshotTable(on.db, "decision_log").map((row) => row.thought_source),
      ).toEqual(snapshotTable(off.db, "decision_log").map((row) => row.thought_source));
      expectLiveEquivalent(on.live(), off.live());

      // The in-flight decision set is cleared on rejection: the next hard turn
      // calls Thought again instead of being deduped away / left hanging.
      // Limitation: the shared fake Thought payload is not a valid
      // ThoughtProposal, so runThoughtModel returns ok:false and no
      // `thought` live_shadow event is recorded on either side — recovery is
      // therefore asserted through the observed model call, not the ledger.
      mocked.mockImplementation(passthrough);
      const before = thoughtCapture.length;
      const recovery = "seriously, no fake agreement — say the real thing";
      await on.turn(recovery);
      await on.pump();
      await on.quiesce();
      await off.turn(recovery);
      expect(thoughtCapture.length).toBeGreaterThan(before);
      expect(liveShadow(on, "thought")).toEqual([]);
      expect(liveShadow(off, "thought")).toEqual([]);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      mocked.mockImplementation(passthrough);
      on.close();
      off.close();
    }
  });

  it("(d) curiosity fetch fails: no read, no item transition, no credit, A ≡ B", async () => {
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      for (const message of ["what have you been reading", "anything else"]) {
        await on.turn(message);
        await on.pump();
        await on.quiesce();
        await off.turn(message);
      }

      for (const fixture of [on, off]) {
        const sourceId = upsertSource(fixture.db, {
          slug: "wave4-failing",
          title: "Wave4 Failing",
          kind: "rss",
          url: "https://example.com/failing.xml",
          interest: "systems",
        });
        insertItem(fixture.db, {
          sourceId,
          url: "https://example.com/failing-article",
          title: "Failing Article",
          excerpt: "excerpt",
          interest: "systems",
          score: 50,
        });
      }

      const result = await performGroundedReads(on.db, "doc", {
        resolve: async () => [{ address: "93.184.216.34", family: 4 }],
        fetcher: (async () => {
          throw new Error("wave4_fetch_failure");
        }) as unknown as typeof fetch,
      });
      expect(result.readsCreated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("wave4_fetch_failure");

      expect(snapshotTable(on.db, "cur_reads")).toEqual([]);
      expect(snapshotTable(on.db, "cur_items")).toEqual(snapshotTable(off.db, "cur_items"));
      expect(snapshotTable(on.db, "cur_items").map((row) => row.status)).toEqual(["scanned"]);
      expect(liveShadow(on, "reading")).toEqual([]);
      expect(liveShadow(on, "curiosity_consolidation")).toEqual([]);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });
});
