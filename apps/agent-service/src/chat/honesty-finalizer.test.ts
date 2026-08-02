import { describe, expect, it } from "vitest";
import { finalizeHonesty } from "./honesty-finalizer.js";
import {
  computeNetworkActionLicense,
  NETWORK_HARD_FLOOR,
} from "../moltbook/network-license.js";
import { SIDE_EFFECT_HARD_FLOOR } from "../curiosity/claim-gate.js";

describe("finalizeHonesty", () => {
  it("floors fake moltbook /p/ URL after a repeat-style draft", () => {
    const network = computeNetworkActionLicense({});
    const out = finalizeHonesty({
      text: "https://www.moltbook.com/p/ashley-graham/hello",
      readingLicensed: false,
      network,
    });
    expect(out.flooredNetwork).toBe(true);
    expect(out.text).toBe(NETWORK_HARD_FLOOR);
  });

  it("preserves allowlisted claim URL", () => {
    const claim = "https://www.moltbook.com/claim/real_token";
    const network = computeNetworkActionLicense({
      claimLinkAsk: true,
      storedClaimUrl: claim,
    });
    const out = finalizeHonesty({
      text: claim,
      readingLicensed: false,
      network,
    });
    expect(out.flooredNetwork).toBe(false);
    expect(out.text).toBe(claim);
  });

  it("floors already-on-it browse theater without browseOk", () => {
    const network = computeNetworkActionLicense({});
    const out = finalizeHonesty({
      text: "already on it.",
      readingLicensed: true,
      network,
    });
    expect(out.flooredNetwork).toBe(true);
    expect(out.text).toBe(NETWORK_HARD_FLOOR);
  });

  it("strips unlicensed reading claims", () => {
    const network = computeNetworkActionLicense({});
    const out = finalizeHonesty({
      text: "just reading some stuff on my quiet feed. nothing exciting",
      readingLicensed: false,
      network,
    });
    expect(out.flooredActivity).toBe(true);
    expect(out.text.toLowerCase()).not.toContain("quiet feed");
  });

  it("floors third-person status theater without a tool note", () => {
    const network = computeNetworkActionLicense({});
    const out = finalizeHonesty({
      text: "the registration is complete, the network accepted it",
      readingLicensed: false,
      network,
    });
    expect(out.flooredSideEffect).toBe(true);
    expect(out.text).toBe(SIDE_EFFECT_HARD_FLOOR);
  });

  it("keeps side-effect claims when a tool note licenses them", () => {
    const network = computeNetworkActionLicense({});
    const out = finalizeHonesty({
      text: "the registration is complete on my side, the tool confirmed it",
      readingLicensed: false,
      network,
      sideEffectLicensed: true,
    });
    expect(out.flooredSideEffect).toBe(false);
    expect(out.text).toContain("registration");
  });
});
