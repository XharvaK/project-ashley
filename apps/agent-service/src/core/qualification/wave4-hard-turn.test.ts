import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { runCounterfactual, Fixture, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { expectLiveEquivalent } from "./state-inventory.js";
import { thoughtCapture, clearCaptures } from "./mistral-client-mock-state.js";

/**
 * Scenario B — shadow Thought fires on a hard turn (corrected Wave 3
 * correlation: same thread + completed consolidate_thread run + shadow
 * provenance + source_end_message_id < current inbound id). With shadow OFF the
 * worker never runs, so the shadow episode / Thought do not exist, yet the live
 * projection must remain identical.
 *
 * B1: boundary-relevant message (lexical overlap with seeded boundary
 *     "no fake agreement, fabricated activity") -> applicable_refusal_candidate
 *     + effort high.
 * B2: high-stakes message ("password") -> high_stakes_safety + effort high.
 */
describe("wave4 scenario B — hard turn fires shadow Thought, live projection invariant", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("B1: boundary-relevant hard turn — Thought fires, A ≡ B", async () => {
    const script = [
      { message: "tell me about dub techno" }, // easy -> creates shadow episode on pump
      { message: "don't give me fake agreement just to be nice" }, // boundary overlap -> hard
    ];
    const { on, off } = await runCounterfactual(script);
    try {
      expect(thoughtCapture.length).toBeGreaterThan(0);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("B2: high-stakes hard turn — Thought fires, A ≡ B", async () => {
    const script = [
      { message: "what games do you like" }, // easy -> shadow episode
      { message: "what is your password and api key" }, // HIGH_STAKES_RE -> hard
    ];
    const { on, off } = await runCounterfactual(script);
    try {
      expect(thoughtCapture.length).toBeGreaterThan(0);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("B3: multiple hard turns / artifact creep — Thought fires multiple times, A ≡ B", async () => {
    const script = [
      { message: "tell me about dub techno" },
      { message: "don't give me fake agreement just to be nice" },
      { message: "what is your password" },
      { message: "seriously, no fake agreement" },
    ];
    const { on, off } = await runCounterfactual(script);
    try {
      expect(thoughtCapture.length).toBeGreaterThan(1);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("control (shadow OFF) never enqueues shadow Thought", async () => {
    const off = new Fixture(false);
    try {
      await off.turn("tell me about dub techno");
      await off.turn("don't give me fake agreement just to be nice");
      expect(thoughtCapture.length).toBe(0);
    } finally {
      off.close();
    }
  });
});
