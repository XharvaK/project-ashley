import { describe, expect, it } from "vitest";
import { estimateTokens, trimToTokenBudget } from "./tokens.js";

describe("tokens", () => {
  it("estimates tokens from length", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(8))).toBe(2);
  });

  it("trims oldest messages when over budget", () => {
    const texts = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];
    const trimmed = trimToTokenBudget(texts, 15);
    expect(trimmed.length).toBeLessThan(texts.length);
    expect(trimmed[trimmed.length - 1]).toBe(texts[2]);
  });

  it("keeps recent messages within budget", () => {
    const texts = ["aa", "bb", "cc"];
    const trimmed = trimToTokenBudget(texts, 10);
    expect(trimmed).toEqual(texts);
  });
});
