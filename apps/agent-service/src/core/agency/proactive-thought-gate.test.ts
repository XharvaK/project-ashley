import { describe, expect, it } from "vitest";
import { shouldRunProactiveModelThought } from "./proactive-thought-gate.js";

describe("shouldRunProactiveModelThought", () => {
  it("does not dispatch undeadlined 120b Thought merely because inspection is offerable", () => {
    expect(shouldRunProactiveModelThought("easy")).toBe(false);
  });

  it("still dispatches proactive Thought on hard complexity", () => {
    expect(shouldRunProactiveModelThought("hard")).toBe(true);
  });
});
