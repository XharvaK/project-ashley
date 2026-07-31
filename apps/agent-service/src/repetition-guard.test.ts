import { describe, expect, it } from "vitest";
import { looksLikeRepeat } from "./repetition-guard.js";

describe("looksLikeRepeat", () => {
  it("flags the same opener", () => {
    expect(
      looksLikeRepeat(
        "Şu an seninle ilgili uzun vadeli bir şey saklamıyorum. Ne var?",
        [
          "Şu an seninle ilgili uzun vadeli bir şey saklamıyorum. Başka bir şey?",
        ],
      ),
    ).toBe(true);
  });

  it("allows a fresh opener", () => {
    expect(
      looksLikeRepeat("nah, nothing on that. what's up?", [
        "Şu an seninle ilgili uzun vadeli bir şey saklamıyorum.",
      ]),
    ).toBe(false);
  });

  it("ignores short crumbs", () => {
    expect(looksLikeRepeat("ok", ["ok then"])).toBe(false);
  });
});
