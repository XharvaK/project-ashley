import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fixture, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { expectLiveEquivalent } from "./state-inventory.js";
import { thoughtCapture, clearCaptures } from "./mistral-client-mock-state.js";
import { recordCriticalFailure } from "../rollout/capabilities.js";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";

describe("wave4 Phase 3 — secondary rollout-gate test (Fixture C)", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("Fixture C: recordCriticalFailure disables recall -> worker early-exit, A ≡ B", async () => {
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      recordCriticalFailure(on.db, "recall", "system", "deletion_integrity", "Wave 4 forced failure");
      
      const script = [
        { message: "tell me about dub techno" },
        { message: "don't give me fake agreement just to be nice" },
      ];
      for (const step of script) {
        await on.turn(step.message);
        await on.pump();
        await on.quiesce();
        await off.turn(step.message);
      }
      
      expect(thoughtCapture.length).toBe(0);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });
});
