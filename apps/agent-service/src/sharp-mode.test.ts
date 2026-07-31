import { describe, expect, it } from "vitest";
import { decideSharpMode, sharpShape } from "./sharp-mode.js";

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
      decideSharpMode({ ...base, force: "on", rand: () => 0.99 }).armed,
    ).toBe(true);
    expect(
      decideSharpMode({ ...base, force: "off", rand: () => 0 }).armed,
    ).toBe(false);
  });

  it("does not re-arm inside the 24h budget", () => {
    const lastAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(
      decideSharpMode({
        ...base,
        force: "auto",
        lastAt,
        rand: () => 0,
      }).reason,
    ).toBe("budget24h");
  });

  it("rolls with stubbed RNG on peak turns", () => {
    expect(
      decideSharpMode({
        ...base,
        force: "auto",
        chancePeak: 0.28,
        rand: () => 0.1,
      }).armed,
    ).toBe(true);
    expect(
      decideSharpMode({
        ...base,
        force: "auto",
        chancePeak: 0.28,
        rand: () => 0.5,
      }).armed,
    ).toBe(false);
  });

  it("stays off when blocked (link / night ask)", () => {
    expect(
      decideSharpMode({
        ...base,
        force: "auto",
        blocked: true,
        rand: () => 0,
      }).armed,
    ).toBe(false);
  });

  it("ignores voice and non-normal query modes", () => {
    expect(
      decideSharpMode({
        ...base,
        channel: "voice",
        force: "auto",
        rand: () => 0,
      }).armed,
    ).toBe(false);
    expect(
      decideSharpMode({
        ...base,
        queryMode: "recall",
        force: "auto",
        rand: () => 0,
      }).armed,
    ).toBe(false);
  });
});
