import { describe, expect, it } from "vitest";
import { stripMetadataEcho, stripPipelineNarration } from "./metadata-echo.js";

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

describe("stripPipelineNarration", () => {
  it("drops the observed link-narration leak before the reply", () => {
    expect(
      stripPipelineNarration(
        "i opened the link he sent\n\nokay, it's a manifesto for substrate independence",
      ),
    ).toBe("okay, it's a manifesto for substrate independence");
  });

  it("drops a standalone mechanics report anywhere in the reply", () => {
    expect(
      stripPipelineNarration(
        "yeah, that tracks\n\ni opened the link he sent\n\nso the core claim is organization > substrate",
      ),
    ).toBe(
      "yeah, that tracks\n\nso the core claim is organization > substrate",
    );
  });

  it("drops terse open/pull/fetch reports and waiting interjections", () => {
    for (const leak of [
      "i opened the link he sent",
      "i opened it",
      "i pulled it up",
      "gimme a sec, pulling it up",
      "hang on, looking",
      "one sec, checking",
    ]) {
      expect(stripPipelineNarration(`${leak}\n\nreal answer`), leak).toBe(
        "real answer",
      );
    }
  });

  it("keeps content-bearing reading openers (unlicensed ones are floored upstream)", () => {
    const text =
      "i've been reading about the pigeon pecking order experiments from the 60s and the policy gradient both learn";
    expect(stripPipelineNarration(text)).toBe(text);
  });

  it("keeps research/results reports that are not page mechanics", () => {
    const text = "i looked it up, it's fine\n\ni'm in\n\nrest";
    expect(stripPipelineNarration(text)).toBe(text);
  });

  it("keeps banter that merely starts with an interjection", () => {
    const text = "hang on, i'm not done yet\n\nso anyway";
    expect(stripPipelineNarration(text)).toBe(text);
  });
});
