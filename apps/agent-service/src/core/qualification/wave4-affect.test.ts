import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advanceTurn, installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture, armGroqKey, restoreGroqKey, runCounterfactual } from "./counterfactual-harness.js";
import { expectLiveEquivalent, snapshotTable, type Row } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import { processNextCognitiveJob, type CognitionAnalysis } from "../cognition/worker.js";
import { getAffectiveState } from "../state/affect.js";
import { capabilityCanInfluence } from "../rollout/capabilities.js";

/**
 * Phase 3 — affect.
 *
 * The harness analysis already carries non-zero affect deltas, so the shadow
 * executor genuinely runs the affect branch (it records the affect live_shadow
 * capability event). The live affect surfaces (affective_state /
 * affective_events) are written only by the apply-mode influence path, so they
 * must stay byte-identical between the shadow-ON and shadow-OFF fixtures.
 */

function analyzeWithLargeAffect(): Promise<{ analysis: CognitionAnalysis; model: string; raw: string }> {
  const analysis: CognitionAnalysis = {
    summary: "WAVE4_AFFECT summary",
    entities: ["WAVE4_AFFECT"],
    salience: 0.9,
    unresolved: true,
    stateItems: [
      { kind: "concern", text: "WAVE4_AFFECT concern", activation: 0.9, urgency: 0.8, dueAt: null },
    ],
    affect: {
      valenceDelta: -0.25,
      activationDelta: 0.25,
      opennessDelta: -0.25,
      tensionDelta: 0.25,
      reason: "WAVE4_AFFECT large delta",
    },
    revisions: [],
    facts: [],
  };
  return Promise.resolve({ analysis, model: "fake", raw: JSON.stringify(analysis) });
}

/** affective_state/_events carry wall-clock stamps the LIVE projection excludes. */
function untimed(rows: Row[]): Row[] {
  return rows.map(({ created_at: _c, updated_at: _u, ...rest }) => rest);
}

function capabilityEvents(fixture: Fixture, capability: string): Row[] {
  return (fixture.classRows("CONTROL_PLANE").capability_events ?? []).filter(
    (row) => row.capability === capability && row.kind === "live_shadow",
  );
}

describe("wave4 Phase 3 — affect non-interference", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("shadow affect executes but affective_state / affective_events stay identical", async () => {
    const { on, off } = await runCounterfactual([
      { message: "that thread yesterday landed badly for me" },
      { message: "i'm still a bit tense about it" },
    ]);
    try {
      // Shadow really executed the affect branch...
      expect(capabilityEvents(on, "affect").length).toBeGreaterThan(0);
      expect(capabilityEvents(off, "affect")).toEqual([]);
      // ...but affect has no influence authority.
      expect(capabilityCanInfluence(on.db, "affect")).toBe(false);

      expect(untimed(snapshotTable(on.db, "affective_state"))).toEqual(
        untimed(snapshotTable(off.db, "affective_state")),
      );
      expect(untimed(snapshotTable(on.db, "affective_events"))).toEqual(
        untimed(snapshotTable(off.db, "affective_events")),
      );
      expect(snapshotTable(on.db, "affective_events")).toEqual([]);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("a shadow cycle carrying maximal affect deltas leaves the live affect baseline untouched", async () => {
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      for (const message of ["you dismissed what i said", "that stung, honestly"]) {
        await on.turn(message);
        advanceTurn(60 * 60 * 1000);
        for (let guard = 0; guard < 100; guard += 1) {
          if (!(await processNextCognitiveJob(on.db, "observe", analyzeWithLargeAffect))) break;
        }
        await on.quiesce();
        await off.turn(message);
      }

      expect(snapshotTable(on.db, "affective_events")).toEqual([]);
      expect(untimed(snapshotTable(on.db, "affective_state"))).toEqual(
        untimed(snapshotTable(off.db, "affective_state")),
      );
      expect(snapshotTable(on.db, "mind_state_items")).toEqual(
        snapshotTable(off.db, "mind_state_items"),
      );

      // The lazily-created baseline row is identical in both (timestamps aside).
      const stateOn = getAffectiveState(on.db, "doc");
      const stateOff = getAffectiveState(off.db, "doc");
      expect({ ...stateOn, updatedAt: "<TS>" }).toEqual({ ...stateOff, updatedAt: "<TS>" });
      expect(stateOn).toMatchObject({ valence: 0, activation: 0.5, openness: 0.5, tension: 0 });

      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });
});
