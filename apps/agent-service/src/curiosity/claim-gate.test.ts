import { describe, expect, it } from "vitest";
import {
  applySideEffectHardFloor,
  claimsFakeInfra,
  claimsSideEffect,
  claimsUnlicensedAction,
  deniesOwnCapability,
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

  it("flags third-person status theater as a side effect", () => {
    expect(claimsSideEffect("the registration is complete, the network accepted it")).toBe(
      true,
    );
    expect(claimsSideEffect("the agent is now active and verified")).toBe(true);
    expect(claimsSideEffect("the network handshake got established")).toBe(true);
    expect(claimsSideEffect("the server is live")).toBe(true);
  });

  it("flags forum/platform denial of the configured network", () => {
    expect(deniesOwnCapability("i don't wander forums.")).toBe(true);
    expect(deniesOwnCapability("i'm not on submolts")).toBe(true);
    expect(deniesOwnCapability("i never comment on moltbook")).toBe(true);
    expect(deniesOwnCapability("submoltlarda yokum")).toBe(true);
  });

  it("does not flag truthful nuance or reader denial", () => {
    expect(deniesOwnCapability("i don't wander arbitrary forums")).toBe(false);
    expect(deniesOwnCapability("i'm not on random platforms")).toBe(false);
    expect(deniesOwnCapability("i'm not registered on moltbook yet")).toBe(false);
    expect(deniesOwnCapability("i have a quiet feed reader")).toBe(false);
  });

  it("detects failure contradiction from Doc", () => {
    expect(isFailureContradiction("claim link gives me 404, why")).toBe(true);
    expect(isFailureContradiction("it says Post not found")).toBe(true);
    expect(isFailureContradiction("cool")).toBe(false);
  });
});
