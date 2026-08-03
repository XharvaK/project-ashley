import { describe, expect, it } from "vitest";
import { claimsOwnActivity } from "./claims.js";
import { finalizeHonesty } from "./finalize.js";

describe("nuclear honesty finalizer", () => {
  it("removes an unlicensed English activity claim", () => {
    const result = finalizeHonesty({
      text: "i was reading a paper. the mechanism is genuinely interesting.",
      readingLicensed: false,
    });
    expect(result.flooredActivity).toBe(true);
    expect(result.text).toBe("the mechanism is genuinely interesting.");
  });

  it("keeps licensed activity claims", () => {
    const result = finalizeHonesty({
      text: "i was reading a paper and it made one sharp point.",
      readingLicensed: true,
    });
    expect(result.flooredActivity).toBe(false);
    expect(result.text).toContain("reading");
  });

  it("does not treat Turkish text as an English activity claim", () => {
    expect(claimsOwnActivity("okudum bir makale")).toBe(false);
  });
});
