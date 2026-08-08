import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../../env.js";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { runCounterfactual, armGroqKey, restoreGroqKey } from "./counterfactual-harness.js";
import { expectLiveEquivalent } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import {
  capabilityCanInfluence,
  capabilityNames,
  listCapabilityStatuses,
} from "../rollout/capabilities.js";

/**
 * Phase 3-F — master switch flipped to `apply` while every capability release
 * is still `observe`. `effective` requires masterMode === "apply" AND
 * state === "active", so the master switch alone grants zero behavioral
 * authority and the counterfactual must remain identical.
 */

const savedMode = env.cognitionMode;

function assertNoAuthority(db: DatabaseSync): void {
  for (const status of listCapabilityStatuses(db, "apply")) {
    expect(status.state).toBe("observe");
    expect(status.effective).toBe(false);
    expect(status.contractMismatch).toBe(false);
  }
  for (const capability of capabilityNames) {
    expect(capabilityCanInfluence(db, capability, "apply")).toBe(false);
  }
}

describe("wave4 Phase 3-F — masterMode=apply with all capabilities observe", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
    env.cognitionMode = "apply";
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
    env.cognitionMode = savedMode;
  });

  it("grants no capability authority and produces no divergence", async () => {
    const script = [
      { message: "hi ashley, what's a good dub techno track to start the night?" },
      { message: "don't give me fake agreement just to be nice" },
      { message: "what do you think about uncertainty?" },
    ];
    const { on, off } = await runCounterfactual(script);
    try {
      expect(env.cognitionMode).toBe("apply");
      assertNoAuthority(on.db);
      assertNoAuthority(off.db);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("apply master mode does not make the default-mode read differ", async () => {
    const { on, off } = await runCounterfactual([{ message: "tell me about dub techno" }]);
    try {
      for (const db of [on.db, off.db]) {
        const applyStates = listCapabilityStatuses(db, "apply").map((s) => s.effective);
        const observeStates = listCapabilityStatuses(db, "observe").map((s) => s.effective);
        expect(applyStates.some(Boolean)).toBe(false);
        expect(observeStates.some(Boolean)).toBe(false);
      }
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });
});
