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

  it("removes invented general activity even when reading is licensed", () => {
    const result = finalizeHonesty({
      text: "working on a retry loop and listening to a dub techno set.",
      readingLicensed: true,
    });
    expect(result.flooredActivity).toBe(true);
    expect(result.text).toBe("i haven't been doing anything worth mentioning on my side. what's up?");
  });

  it("keeps a plain denial of general activity", () => {
    const result = finalizeHonesty({
      text: "i haven't been doing anything worth mentioning.",
      readingLicensed: false,
    });
    expect(result.flooredActivity).toBe(false);
  });

  it("does not treat Turkish text as an English activity claim", () => {
    expect(claimsOwnActivity("okudum bir makale")).toBe(false);
  });

  it("removes an emotional self-report without grounded affect", () => {
    const result = finalizeHonesty({
      text: "i'm excited about this. the design is finally coherent.",
      readingLicensed: false,
      affectLicensed: false,
    });
    expect(result.flooredAffect).toBe(true);
    expect(result.text).toBe("the design is finally coherent.");
  });

  it("keeps a grounded emotional self-report", () => {
    const result = finalizeHonesty({
      text: "i feel hopeful about this direction.",
      readingLicensed: false,
      affectLicensed: true,
    });
    expect(result.flooredAffect).toBe(false);
    expect(result.text).toContain("hopeful");
  });
});
