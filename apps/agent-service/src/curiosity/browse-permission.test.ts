import { describe, expect, it } from "vitest";
import { isActivityAsk } from "./activity-ask.js";
import {
  buildCapabilityBlock,
  isBrowsePermission,
} from "./browse-permission.js";
import { shouldLookup } from "./lookup.js";

describe("isBrowsePermission", () => {
  it("matches English and Turkish permission phrases", () => {
    expect(
      isBrowsePermission(
        "you can chill, browse web and read stuff that interests you",
      ),
    ).toBe(true);
    expect(isBrowsePermission("go browse, read what interests you")).toBe(true);
    expect(isBrowsePermission("feel free to follow your feeds")).toBe(true);
    expect(isBrowsePermission("feedlerini takip edebilirsin")).toBe(true);
    expect(isBrowsePermission("rahat rahat oku, istediğini oku")).toBe(true);
  });

  it("rejects Doc self-report and metaphors", () => {
    expect(isBrowsePermission("I've been browsing the web all day")).toBe(
      false,
    );
    expect(isBrowsePermission("read the room")).toBe(false);
    expect(isBrowsePermission("okudum bir şeyler")).toBe(false);
  });

  it("is neither activity ask nor Tavily lookup", () => {
    const msg =
      "you can chill, browse web and read stuff that interests you";
    expect(isBrowsePermission(msg)).toBe(true);
    expect(isActivityAsk(msg)).toBe(false);
    expect(shouldLookup(msg)).toBeNull();
  });
});

describe("buildCapabilityBlock", () => {
  it("licenses the quiet reader when curiosity is enabled", () => {
    const block = buildCapabilityBlock(true);
    expect(block).toContain("quiet configured RSS/Atom reader");
    expect(block).toMatch(/do not arbitrarily/i);
    expect(block).not.toMatch(/sqlite\.org|hnrss|article title/i);
  });

  it("owns the registered moltbook presence, not arbitrary forums", () => {
    const block = buildCapabilityBlock(true);
    expect(block).toMatch(/registered moltbook agent/i);
    expect(block).toMatch(/not on arbitrary forums/i);
  });

  it("does not claim a reader when curiosity is disabled", () => {
    const block = buildCapabilityBlock(false);
    expect(block).toMatch(/unavailable|disabled/i);
    expect(block).not.toMatch(/you have a quiet configured/i);
  });
});
