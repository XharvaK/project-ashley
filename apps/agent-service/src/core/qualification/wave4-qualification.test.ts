import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { runCounterfactual, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { expectLiveEquivalent } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import {
  listCapabilityStatuses,
  promotionEligible,
  recordIsolatedEvaluation,
  recordLiveShadowEvent,
} from "../rollout/capabilities.js";
import { startDeterministicRecallEpoch } from "../rollout/recall-epoch-test-util.js";

/**
 * Phase 3-E — qualification evidence accumulates to promotionEligible=true and
 * still activates NOTHING. Evidence is seeded identically in both fixtures with
 * explicit `occurredAt` values, so the frozen clock is irrelevant to the 7-day
 * span requirement.
 */

const EVIDENCE_START = Date.parse("2026-03-01T00:00:00.000Z");
const LIVE_SHADOW_EVENTS = 25;
const STEP_MS = (7 * 86_400_000) / (LIVE_SHADOW_EVENTS - 1);

function seedQualification(db: DatabaseSync): void {
  startDeterministicRecallEpoch(db);
  recordIsolatedEvaluation(db, "recall", {
    seeds: 3,
    passed: true,
    sourceKey: "q1",
    occurredAt: new Date(EVIDENCE_START).toISOString(),
  });
  for (let index = 0; index < LIVE_SHADOW_EVENTS; index += 1) {
    recordLiveShadowEvent(db, "recall", `s${index + 1}`, {
      occurredAt: new Date(EVIDENCE_START + index * STEP_MS).toISOString(),
    });
  }
}

function recallStatus(db: DatabaseSync) {
  return listCapabilityStatuses(db).find((status) => status.capability === "recall")!;
}

describe("wave4 Phase 3-E — qualification accumulation never activates", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("recall becomes promotionEligible in BOTH fixtures while staying observe/ineffective", async () => {
    const script = [
      { message: "tell me about dub techno mixing" },
      { message: "don't give me fake agreement just to be nice" },
    ];
    const { on, off } = await runCounterfactual(script);
    try {
      expect(recallStatus(on.db).promotionEligible).toBe(false);
      expect(recallStatus(off.db).promotionEligible).toBe(false);

      const liveBeforeOn = on.live();
      const liveBeforeOff = off.live();

      seedQualification(on.db);
      seedQualification(off.db);

      for (const db of [on.db, off.db]) {
        expect(promotionEligible(db, "recall")).toBe(true);
        const status = recallStatus(db);
        expect(status.state).toBe("observe");
        expect(status.effective).toBe(false);
        expect(status.promotedAt).toBeNull();
        expect(status.evalSeedCount).toBeGreaterThanOrEqual(3);
        expect(status.liveShadowEvents).toBeGreaterThanOrEqual(LIVE_SHADOW_EVENTS);
        expect(status.liveShadowSpanDays).toBeGreaterThanOrEqual(7);
      }

      // Qualification is CONTROL_PLANE: no live behavioral table moved.
      expectLiveEquivalent(liveBeforeOn, on.live(), "ON before/after qualification");
      expectLiveEquivalent(liveBeforeOff, off.live(), "OFF before/after qualification");
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  }, 60_000);

  it("no capability is active or effective after qualification accumulation", async () => {
    const { on, off } = await runCounterfactual([{ message: "hi ashley" }]);
    try {
      seedQualification(on.db);
      seedQualification(off.db);
      for (const db of [on.db, off.db]) {
        for (const status of listCapabilityStatuses(db)) {
          expect(status.state).toBe("observe");
          expect(status.effective).toBe(false);
        }
      }
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });
});
