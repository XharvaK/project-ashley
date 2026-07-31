import { describe, expect, it } from "vitest";
import { isEchoOfUser } from "./echo-guard.js";

describe("isEchoOfUser", () => {
  it("catches exact and punctuated mirrors", () => {
    expect(isEchoOfUser("lol", "lol")).toBe(true);
    expect(isEchoOfUser("lol.", "lol")).toBe(true);
    expect(isEchoOfUser("bruh", "bruh")).toBe(true);
    expect(isEchoOfUser("BRUH!", "bruh")).toBe(true);
  });

  it("leaves real replies alone", () => {
    expect(isEchoOfUser("what's funny", "lol")).toBe(false);
    expect(isEchoOfUser("hey. what.", "bruh")).toBe(false);
    expect(isEchoOfUser("lol that one was actually good", "lol")).toBe(false);
  });
});
