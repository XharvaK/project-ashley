import { describe, expect, it } from "vitest";
import {
  applySideEffectHardFloor,
  claimsFakeInfra,
  claimsSideEffect,
  claimsUnlicensedAction,
  isFailureContradiction,
  stripUnlicensedActionClaims,
  SIDE_EFFECT_HARD_FLOOR,
} from "./claim-gate.js";

describe("side-effect claim gate", () => {
  it("flags registration theater", () => {
    expect(
      claimsSideEffect(
        "registered ashleyinchains on moltbook. claim url: https://moltbook.com/x",
      ),
    ).toBe(true);
    expect(claimsSideEffect("i think joining agent networks is noisy.")).toBe(
      false,
    );
  });

  it("flags fake infra and moltbook urls", () => {
    expect(claimsFakeInfra("i'll keep the ngrok tunnel as a fallback")).toBe(
      true,
    );
    expect(
      claimsUnlicensedAction(
        "endpoint not claimed yet. the claim URL is a POST endpoint that needs a signed message",
      ),
    ).toBe(true);
  });

  it("strips unlicensed sentences and floors empty drafts", () => {
    const stripped = stripUnlicensedActionClaims(
      "sounds messy. registered ashleyinchains on moltbook. what do you want next?",
    );
    expect(stripped.toLowerCase()).toContain("sounds messy");
    expect(claimsSideEffect(stripped)).toBe(false);

    expect(applySideEffectHardFloor("registered. server is live.")).toBe(
      SIDE_EFFECT_HARD_FLOOR,
    );
  });

  it("detects failure contradiction from Doc", () => {
    expect(isFailureContradiction("claim link gives me 404, why")).toBe(true);
    expect(isFailureContradiction("it says Post not found")).toBe(true);
    expect(isFailureContradiction("cool")).toBe(false);
  });
});
