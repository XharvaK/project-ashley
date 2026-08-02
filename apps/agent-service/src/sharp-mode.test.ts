import { describe, expect, it } from "vitest";
import {
  decideSharpMode,
  sharpLicenseNote,
  sharpShape,
} from "./sharp-mode.js";

describe("sharpLicenseNote", () => {
  it("does not hand the model canned sleep or 3am roast templates", () => {
    const note = sharpLicenseNote().toLowerCase();
    expect(note).not.toMatch(/3\s*am/);
    expect(note).not.toMatch(/sleep habits/);
    expect(note).toMatch(/memory block|standing facts|hot thread/);
  });
});

describe("sharpShape", () => {
  it("peaks on sleep and wake", () => {
    expect(sharpShape("going to sleep finally")).toBe("peak");
    expect(sharpShape("morning")).toBe("peak");
    expect(sharpShape("günaydın")).toBe("peak");
    expect(sharpShape("ben yatıyorum")).toBe("peak");
  });

  it("allows short banter", () => {
    expect(sharpShape("lol")).toBe("banter");
    expect(sharpShape("just hanging")).toBe("banter");
  });

  it("blocks code/pharma/quiet and long messages", () => {
    expect(sharpShape("this typescript build error is weird")).toBe(
      "ineligible",
    );
    expect(sharpShape("mdma dose timing?")).toBe("ineligible");
    expect(sharpShape("go dark")).toBe("ineligible");
    expect(sharpShape("a".repeat(120))).toBe("ineligible");
  });
});

describe("decideSharpMode", () => {
  const base = {
    channel: "discord",
    queryMode: "normal",
    message: "going to sleep finally",
    lastAt: null as string | null,
  };

  it("arms on force=on and respects force=off", () => {
    expect(
      decideSharpMode({ ...base, force: "on" }).armed,
    ).toBe(true);
    expect(
      decideSharpMode({ ...base, force: "off" }).armed,
    ).toBe(false);
  });

  it("does not re-arm inside the 24h budget", () => {
    const lastAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(
      decideSharpMode({
        ...base,
        force: "auto",
        lastAt,
        minGapHours: 1,
      }).reason,
    ).toBe("budget24h");
  });

  it("arms on peak turns when the budget allows — no dice", () => {
    expect(
      decideSharpMode({ ...base, force: "auto" }).armed,
    ).toBe(true);
    expect(
      decideSharpMode({ ...base, force: "auto" }).reason,
    ).toBe("peak");
  });

  it("stays off when blocked (link / night ask)", () => {
    expect(
      decideSharpMode({
        ...base,
        force: "auto",
        blocked: true,
      }).armed,
    ).toBe(false);
  });

  it("ignores voice and non-normal query modes", () => {
    expect(
      decideSharpMode({
        ...base,
        channel: "voice",
        force: "auto",
      }).armed,
    ).toBe(false);
    expect(
      decideSharpMode({
        ...base,
        queryMode: "recall",
        force: "auto",
      }).armed,
    ).toBe(false);
  });

  it("respects min gap between sharp turns", () => {
    const lastAt = new Date(Date.now() - 1 * 3_600_000).toISOString();
    expect(
      decideSharpMode({
        ...base,
        force: "auto",
        lastAt,
        minGapHours: 6,
        maxPer24hHours: 24,
      }).reason,
    ).toBe("minGap");
  });
});
