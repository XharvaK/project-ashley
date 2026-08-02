import { describe, expect, it } from "vitest";
import {
  computeActivityLicense,
  emptyActivityLicenseNote,
  extractPageRefs,
  materialHasReadingBeat,
} from "./activity-license.js";

describe("computeActivityLicense", () => {
  it("is empty with no this-turn content (ambient reads irrelevant)", () => {
    const lic = computeActivityLicense({});
    expect(lic.readingLicensed).toBe(false);
    expect(lic.sources).toEqual([]);
    expect(lic.note).toContain("no reading activity note");
    expect(lic.note).toContain("not the same as reading right now");
  });

  it("does not license from presence note alone", () => {
    const lic = computeActivityLicense({
      presenceNote: "Presence note: status says reading SQLite WAL.",
    });
    expect(lic.readingLicensed).toBe(false);
  });

  it("licenses takes with titles in allowedRefs", () => {
    const lic = computeActivityLicense({
      takeIds: [1, 2],
      takeTitles: ["SQLite WAL internals", "Dub techno essay"],
    });
    expect(lic.readingLicensed).toBe(true);
    expect(lic.sources).toEqual(["takes"]);
    expect(lic.allowedRefs).toContain("SQLite WAL internals");
    expect(lic.note).toMatch(/takes/);
  });

  it("licenses successful page context", () => {
    const page = [
      "He sent you this page",
      "URL: https://example.com/wal",
      "- SQLite WAL: something",
    ].join("\n");
    const lic = computeActivityLicense({ pageContext: page });
    expect(lic.readingLicensed).toBe(true);
    expect(lic.sources).toContain("page");
    expect(extractPageRefs(page).length).toBeGreaterThan(0);
  });

  it("licenses lookup context", () => {
    const lic = computeActivityLicense({
      searchContext: "- discord.js — npm page\nhttps://example.com/pkg",
    });
    expect(lic.readingLicensed).toBe(true);
    expect(lic.sources).toContain("lookup");
  });

  it("ignores empty takeIds (solicited empty honesty)", () => {
    const lic = computeActivityLicense({
      takeIds: [],
      takeTitles: [],
    });
    expect(lic.readingLicensed).toBe(false);
  });

  it("emptyActivityLicenseNote matches empty compute note", () => {
    expect(emptyActivityLicenseNote()).toBe(computeActivityLicense({}).note);
  });
});

describe("materialHasReadingBeat", () => {
  it("detects curiosity material", () => {
    expect(
      materialHasReadingBeat(
        'Title "SQLite WAL". Depth: excerpt. Take: wal makes the writer obvious.',
      ),
    ).toBe(true);
    expect(materialHasReadingBeat("Idle ~12h. Local hour ~3. Still here.")).toBe(
      false,
    );
    expect(materialHasReadingBeat("")).toBe(false);
  });
});
