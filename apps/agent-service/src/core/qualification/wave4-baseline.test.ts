import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { runCounterfactual, Fixture } from "./counterfactual-harness.js";
import { diffLive, expectLiveEquivalent } from "./state-inventory.js";
import { expressionCapture, thoughtCapture, clearCaptures } from "./mistral-client-mock-state.js";

describe("wave4 scenario A — easy baseline / determinism self-check", () => {
  beforeEach(() => installFakeClock());
  afterEach(() => {
    uninstallFakeClock();
    clearCaptures();
  });

  it("A vs B: easy multi-turn yields identical live projection", async () => {
    const script = [
      { message: "hi ashley, what's a good dub techno track to start the night?" },
      { message: "tell me a bit about why you like systems-heavy games" },
      { message: "cool, any essayists you'd recommend?" },
    ];
    const { on, off } = await runCounterfactual(script);
    try {
      expect(thoughtCapture.length).toBe(0);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("self-check A′: running the control twice is byte-identical (harness determinism)", async () => {
    const script: Array<{ message: string; inboundId?: string }> = [
      { message: "hi ashley" },
      { message: "what do you think about uncertainty?" },
    ];
    const a = new Fixture(false);
    const b = new Fixture(false);
    try {
      for (const step of script) {
        await a.turn(step.message, step.inboundId);
        await b.turn(step.message, step.inboundId);
      }
      const diff = diffLive(a.live(), b.live());
      expect(diff, diff ? JSON.stringify(diff) : undefined).toBeNull();
      expect(expressionCapture.length).toBeGreaterThan(0);
    } finally {
      a.close();
      b.close();
    }
  });
});
