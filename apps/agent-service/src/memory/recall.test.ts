import { describe, expect, it } from "vitest";
import { isRecallQuery, RECALL_PATTERNS } from "./recall.js";

describe("isRecallQuery", () => {
  it("matches Turkish and English meta-memory asks", () => {
    expect(isRecallQuery("neler hatırlıyorsun")).toBe(true);
    expect(isRecallQuery("hafızanda neler var")).toBe(true);
    expect(isRecallQuery("what do you remember about me?")).toBe(true);
    expect(isRecallQuery("ne biliyorsun benden?")).toBe(true);
  });

  it("does not match normal chat", () => {
    expect(isRecallQuery("merhaba")).toBe(false);
    expect(isRecallQuery("valorant oynuyor musun")).toBe(false);
  });

  it("exports pattern list", () => {
    expect(RECALL_PATTERNS.length).toBeGreaterThan(5);
  });
});
