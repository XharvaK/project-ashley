import { describe, expect, it } from "vitest";
import { stripMetadataEcho } from "./metadata-echo.js";

describe("stripMetadataEcho", () => {
  it("removes a leading bare depth label before the real reply", () => {
    expect(
      stripMetadataEcho(
        "medium depth\n\nThe classic setup is a Skinner box with grain dispensers.",
      ),
    ).toBe("The classic setup is a Skinner box with grain dispensers.");
  });

  it("removes all depth label spellings", () => {
    for (const label of [
      "medium depth",
      "MEDIUM DEPTH",
      "medium depth.",
      "medium depth:",
      "Depth: excerpt",
      "depth: full",
      "short depth",
      "deep depth",
    ]) {
      expect(stripMetadataEcho(`${label}\n\nreal answer here`), label).toBe(
        "real answer here",
      );
    }
  });

  it("removes material format lines", () => {
    expect(stripMetadataEcho("Piece: some title\nTake: the take\n\nreal")).toBe(
      "real",
    );
  });

  it("removes a leaked label at the start of a later paragraph", () => {
    expect(
      stripMetadataEcho("haha\n\ntake: that's the whole point\n\nand another"),
    ).toBe("haha\n\nand another");
  });

  it("leaves ordinary text alone", () => {
    const text =
      "medium depth is where i live\n\npiece of the puzzle is the mechanism";
    expect(stripMetadataEcho(text)).toBe(text);
  });

  it("does not eat paragraphs that are not labels", () => {
    expect(stripMetadataEcho("one\n\ntwo\n\nthree")).toBe("one\n\ntwo\n\nthree");
  });
});
