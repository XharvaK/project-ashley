import { describe, expect, it } from "vitest";
import { attachAuthorizedClaims, decide } from "./decide.js";
import type { Motivation } from "../types.js";

function motivation(
  kind: Motivation["kind"],
  score: number,
  summary: string,
): Motivation {
  return { id: score, kind, score, summary };
}

describe("nuclear agency decisions", () => {
  it("speaks by default when a user addresses Ashley", () => {
    const result = decide(
      [motivation("user_message", 100, "can you explain the retry loop?")],
      "reactive",
    );
    expect(result.kind).toBe("speak");
    expect(result.cognitiveAllocation.shouldSpeak).toBe(true);
    expect(result.authorizedClaims.readingTakeIds).toEqual([]);
  });

  it("honors a direct request for space", () => {
    const result = decide(
      [motivation("silence_signal", 100, "stop messaging me for now")],
      "reactive",
    );
    expect(result.kind).toBe("silence");
    expect(result.cognitiveAllocation.shouldSpeak).toBe(false);
  });

  it("delays an empty fluff ping without other material", () => {
    const result = decide(
      [motivation("user_message", 32, "hey")],
      "reactive",
    );
    expect(result.kind).toBe("delay");
  });

  it("silences proactive turns below the material floor", () => {
    const result = decide(
      [motivation("take", 12, "a weak, stale take")],
      "proactive",
    );
    expect(result.kind).toBe("silence");
  });

  it("attaches reading claims for share from existing takes", () => {
    const base = decide(
      [motivation("take", 80, "a feed take worth sharing")],
      "proactive",
    );
    expect(base.kind).toBe("share");
    const withClaims = attachAuthorizedClaims(base, [
      { id: 1, title: "One" },
      { id: 2, title: "Two" },
      { id: 3, title: "Three" },
    ]);
    expect(withClaims.authorizedClaims.readingTakeIds).toEqual([1, 2]);
    expect(withClaims.authorizedClaims.readingTakeTitles).toEqual([
      "One",
      "Two",
    ]);
  });
});
