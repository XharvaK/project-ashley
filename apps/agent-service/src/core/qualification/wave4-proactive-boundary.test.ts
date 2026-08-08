import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advanceTurn, installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { expectLiveEquivalent, snapshotTable, type Row } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import { processNextCognitiveJob, type CognitionAnalysis } from "../cognition/worker.js";
import {
  classifyInitiativeClass,
  evaluateProactiveEligibility,
} from "../agency/proactive-eligibility.js";
import { buildOwnTimeReportConstraint } from "../agency/own-time-report.js";
import { hasUrgentMindState } from "../state/mind-items.js";
import { hasOpenOwnTimeSession } from "../state/own-time.js";
import { capabilityCanInfluence } from "../rollout/capabilities.js";

/**
 * Phase 3 — proactive / own-time boundary.
 *
 * The shadow analysis carries a maximally urgent commitment (urgency 0.95), the
 * exact shape that would justify an urgent relational wake post-promotion. In
 * observe mode it may only record a relational_initiative live_shadow event:
 * no mind_state_item, no urgent wake, no delivery/initiative reservation, no
 * scheduled proactive, no own-time claim.
 */

function analyzeUrgent(): Promise<{ analysis: CognitionAnalysis; model: string; raw: string }> {
  const analysis: CognitionAnalysis = {
    summary: "WAVE4_PROACTIVE summary",
    entities: ["WAVE4_PROACTIVE"],
    salience: 0.95,
    unresolved: true,
    stateItems: [
      {
        kind: "commitment",
        text: "WAVE4_PROACTIVE reach out about the unresolved thread",
        activation: 0.95,
        urgency: 0.95,
        dueAt: null,
      },
      {
        kind: "concern",
        text: "WAVE4_PROACTIVE doc sounded off and never came back",
        activation: 0.9,
        urgency: 0.95,
        dueAt: null,
      },
    ],
    affect: {
      valenceDelta: -0.1,
      activationDelta: 0.1,
      opennessDelta: 0,
      tensionDelta: 0.1,
      reason: "WAVE4_PROACTIVE affect",
    },
    revisions: [],
    facts: [],
  };
  return Promise.resolve({ analysis, model: "fake", raw: JSON.stringify(analysis) });
}

async function pumpUrgent(fixture: Fixture): Promise<void> {
  advanceTurn(60 * 60 * 1000);
  for (let guard = 0; guard < 100; guard += 1) {
    if (!(await processNextCognitiveJob(fixture.db, "observe", analyzeUrgent))) return;
  }
  throw new Error("pumpUrgent: too many cognition jobs (loop?)");
}

function liveShadow(fixture: Fixture, capability: string): Row[] {
  return (fixture.classRows("CONTROL_PLANE").capability_events ?? []).filter(
    (row) => row.capability === capability && row.kind === "live_shadow",
  );
}

const PROACTIVE_TABLES = [
  "initiative_reservations",
  "delivery_reservations",
  "delivery_bubbles",
  "delivery_auxiliary_messages",
  "scheduled_proactive_messages",
  "own_time_sessions",
  "mind_state_items",
] as const;

describe("wave4 Phase 3 — shadow cannot cross the proactive / own-time boundary", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("urgent shadow cognition triggers no delivery, no wake, and no own-time claim", async () => {
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      const script = [
        "hey, i've been thinking about that unresolved thread",
        "i had to step away yesterday, sorry",
        "don't just tell me what i want to hear",
        "what did you discover while i was away?",
      ];
      for (const message of script) {
        await on.turn(message);
        await pumpUrgent(on);
        await on.quiesce();
        await off.turn(message);
      }

      // (a) shadow executed the urgent-initiative branch...
      expect(liveShadow(on, "relational_initiative").length).toBeGreaterThan(0);
      expect(liveShadow(off, "relational_initiative")).toEqual([]);

      // ...but no live proactive machinery moved.
      expect(capabilityCanInfluence(on.db, "relational_initiative")).toBe(false);
      for (const table of PROACTIVE_TABLES) {
        const onRows = snapshotTable(on.db, table);
        const offRows = snapshotTable(off.db, table);
        expect(onRows.length, `${table} row count`).toBe(offRows.length);
      }
      expect(snapshotTable(on.db, "initiative_reservations")).toEqual([]);
      expect(snapshotTable(on.db, "scheduled_proactive_messages")).toEqual([]);

      // (b) no urgent relational wake exists to claim: shadow wrote no mind state.
      expect(snapshotTable(on.db, "mind_state_items")).toEqual([]);
      expect(hasUrgentMindState(on.db, "doc")).toBe(false);
      expect(hasUrgentMindState(off.db, "doc")).toBe(false);
      expect(classifyInitiativeClass(on.db, "doc")).toBe("ordinary");
      expect(classifyInitiativeClass(off.db, "doc")).toBe("ordinary");
      const eligibilityInput = {
        ownerId: "doc",
        chatInProgress: false,
        paused: false,
        sentToday: 0,
        maxPerDay: 10,
        lastUserMessageAt: new Date().toISOString(),
        minIdleHours: 2,
        hasUrgent: false,
      };
      expect(evaluateProactiveEligibility(on.db, eligibilityInput)).toEqual(
        evaluateProactiveEligibility(off.db, eligibilityInput),
      );
      expect(evaluateProactiveEligibility(on.db, eligibilityInput).ok).toBe(false);

      // (c) own-time: no session opened, and the report path cannot influence.
      expect(hasOpenOwnTimeSession(on.db, "doc")).toBe(false);
      expect(snapshotTable(on.db, "own_time_sessions")).toEqual([]);
      const constraintInput = {
        ownerId: "doc",
        userMessage: "what did you discover while i was away?",
        userMessageId: on.lastUserMessageId,
      };
      const constraintOn = buildOwnTimeReportConstraint(on.db, constraintInput);
      const constraintOff = buildOwnTimeReportConstraint(off.db, {
        ...constraintInput,
        userMessageId: off.lastUserMessageId,
      });
      expect(constraintOn?.canInfluence).toBe(false);
      expect(constraintOff?.canInfluence).toBe(false);
      expect(constraintOn?.selectedTakeIds).toEqual([]);
      expect(constraintOn?.readingClaims).toEqual([]);
      expect(capabilityCanInfluence(on.db, "own_time_report")).toBe(false);
      expect(snapshotTable(on.db, "own_time_sessions")).toEqual([]);

      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });
});
