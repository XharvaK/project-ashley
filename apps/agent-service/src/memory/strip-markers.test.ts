import { describe, expect, it } from "vitest";
import { stripMediaMarkers } from "./strip-markers.js";

describe("stripMediaMarkers", () => {
  it("removes react and gif markers", () => {
    expect(stripMediaMarkers("nice one [[react:😂]]")).toBe("nice one");
    expect(stripMediaMarkers("look at this\n\n[[gif:fat kitten]]")).toBe(
      "look at this",
    );
  });

  it("keeps the text when a reply is markers only", () => {
    expect(stripMediaMarkers("[[react:🔥]]")).toBe("");
  });

  it("leaves ordinary brackets alone", () => {
    expect(stripMediaMarkers("array[[0]] is fine")).toBe("array[[0]] is fine");
  });

  it("collapses the blank line a stripped marker leaves behind", () => {
    expect(stripMediaMarkers("one\n\n[[gif:x]]\n\ntwo")).toBe("one\n\ntwo");
  });
});
