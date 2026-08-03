import { describe, expect, it } from "vitest";
import { decide } from "./decide.js";
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
  });

  it("honors a direct request for space", () => {
    const result = decide(
      [motivation("silence_signal", 100, "stop messaging me for now")],
      "reactive",
    );
    expect(result.kind).toBe("silence");
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
});
