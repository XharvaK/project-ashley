import { describe, expect, it } from "vitest";
import { detectLanguage } from "./voice-bank.js";

describe("detectLanguage", () => {
  it("keeps English sentences about variables in English", () => {
    expect(detectLanguage("declare a var and assign it")).toBe("en");
    expect(detectLanguage("the var name is wrong")).toBe("en");
  });

  it("still detects Turkish from characters and words", () => {
    expect(detectLanguage("naber kanka ne yapıyorsun")).toBe("tr");
    expect(detectLanguage("çok güzel olmuş")).toBe("tr");
  });
});
