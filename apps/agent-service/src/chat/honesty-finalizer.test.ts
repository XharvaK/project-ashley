import { describe, expect, it } from "vitest";
import { finalizeHonesty } from "./honesty-finalizer.js";
import {
  computeNetworkActionLicense,
  NETWORK_HARD_FLOOR,
} from "../moltbook/network-license.js";

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
});
