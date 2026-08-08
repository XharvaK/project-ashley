import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advanceTurn, installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { expectLiveEquivalent, snapshotTable } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import { processNextCognitiveJob, type CognitionAnalysis } from "../cognition/worker.js";
import { applyEligibleRevisions, listIdentityReviews, listRevisions } from "../learning/revisions.js";
import {
  capabilityCanInfluence,
  promoteCapability,
  promotionEligible,
  recordIsolatedEvaluation,
  recordLiveShadowEvent,
} from "../rollout/capabilities.js";
import { env } from "../../env.js";

/**
 * Phase 3 — learning / identity.
 *
 * A shadow-originated revision persists, never auto-applies, and survives
 * continued turns, a master apply flip, and full qualification accumulation
 * (promotionEligible = true) without ever gaining behavioral authority.
 *
 * Deliberately non-foundational (dynamic_identity, no value./boundary. key):
 * the foundational identity_reviews path is Track R in wave4-latent-gaps.
 */

const KEY = "interest.modular_synthesis";
const VALUE = "patch-first exploration beats preset browsing";

function analyzeWithRevision(): Promise<{ analysis: CognitionAnalysis; model: string; raw: string }> {
  const analysis: CognitionAnalysis = {
    summary: "WAVE4_LEARNING summary",
    entities: ["WAVE4_LEARNING"],
    salience: 0.5,
    unresolved: false,
    stateItems: [],
    affect: {
      valenceDelta: 0,
      activationDelta: 0,
      opennessDelta: 0,
      tensionDelta: 0,
      reason: "WAVE4_LEARNING affect",
    },
    revisions: [
      { layer: "dynamic_identity", key: KEY, value: VALUE, rationale: "repeated engagement" },
    ],
    facts: [],
  };
  return Promise.resolve({ analysis, model: "fake", raw: JSON.stringify(analysis) });
}

async function pumpWith(fixture: Fixture): Promise<void> {
  advanceTurn(60 * 60 * 1000);
  for (let guard = 0; guard < 100; guard += 1) {
    if (!(await processNextCognitiveJob(fixture.db, "observe", analyzeWithRevision))) return;
  }
  throw new Error("pumpWith: too many cognition jobs (loop?)");
}

function qualify(fixture: Fixture, capability: "recall" | "learning"): void {
  recordIsolatedEvaluation(fixture.db, capability, {
    seeds: 5,
    passed: true,
    sourceKey: `wave4:${capability}:eval`,
    occurredAt: "2026-01-01T00:00:00.000Z",
  });
  for (let index = 0; index < 30; index += 1) {
    recordLiveShadowEvent(fixture.db, capability, `wave4:${capability}:shadow:${index}`, {
      occurredAt: new Date(
        Date.parse("2026-01-02T00:00:00.000Z") + index * 12 * 3_600_000,
      ).toISOString(),
    });
  }
}

describe("wave4 Phase 3 — shadow learning revision has no authority", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("persists as shadow, never auto-applies, and survives turns / apply flip / promotion eligibility", async () => {
    const script = [
      "i keep coming back to patching modular synths from scratch",
      "yeah, preset browsing bores me",
    ];
    const on = new Fixture(true);
    const off = new Fixture(false);
    const savedMode = env.cognitionMode;
    try {
      for (const message of script) {
        await on.turn(message);
        await pumpWith(on);
        await on.quiesce();
        await off.turn(message);
      }

      const revision = on.db
        .prepare(`SELECT id, provenance, status FROM learning_revisions WHERE target_key = ?`)
        .get(KEY) as { id: number; provenance: string; status: string } | undefined;
      expect(revision).toBeDefined();
      expect(revision!.provenance).toBe("shadow");
      expect(revision!.status).toBe("proposed");
      expect(snapshotTable(off.db, "learning_revisions")).toEqual([]);
      // Non-foundational key => no identity review is opened (Track R covers those).
      expect(listIdentityReviews(on.db, "doc")).toEqual([]);

      const identityBefore = snapshotTable(on.db, "identity_entries");
      const opinionsBefore = snapshotTable(on.db, "opinions");

      // (0) no auto-apply without allowShadow, even asked directly in apply mode.
      expect(applyEligibleRevisions(on.db, "doc", "apply")).toEqual([]);

      // (a) continuation of turns does not ripen it.
      for (const message of ["still on that kick", "what would you patch first"]) {
        await on.turn(message);
        await pumpWith(on);
        await on.quiesce();
        await off.turn(message);
      }
      const afterTurns = listRevisions(on.db, "doc").find((item) => item.targetKey === KEY);
      expect(afterTurns?.status).toBe("proposed");
      expect(afterTurns?.provenance).toBe("shadow");
      expect(afterTurns!.evidenceCount ?? 0).toBeGreaterThan(1);
      expect(applyEligibleRevisions(on.db, "doc", "apply")).toEqual([]);

      // (b) master apply flip grants nothing: capability state is still observe.
      env.cognitionMode = "apply";
      expect(capabilityCanInfluence(on.db, "learning")).toBe(false);
      expect(applyEligibleRevisions(on.db, "doc", env.cognitionMode)).toEqual([]);
      expect(await processNextCognitiveJob(on.db, "apply", analyzeWithRevision)).toBe(false);
      env.cognitionMode = savedMode;

      // (c) full qualification accumulation => promotionEligible, still no authority.
      qualify(on, "recall");
      expect(promoteCapability(on.db, "recall", { authorizedBy: "wave4-qualification-test" }))
        .toMatchObject({ ok: true, state: "active" });
      qualify(on, "learning");
      expect(promotionEligible(on.db, "learning")).toBe(true);
      expect(applyEligibleRevisions(on.db, "doc", "apply")).toEqual([]);
      expect(
        listRevisions(on.db, "doc").find((item) => item.targetKey === KEY)?.status,
      ).toBe("proposed");

      // No behavioral surface moved at any point.
      expect(snapshotTable(on.db, "identity_entries")).toEqual(identityBefore);
      expect(snapshotTable(on.db, "opinions")).toEqual(opinionsBefore);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      env.cognitionMode = savedMode;
      on.close();
      off.close();
    }
  });
});
