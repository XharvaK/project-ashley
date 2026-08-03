import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../env.js";
import { decide } from "./decide.js";
import { deliberateDecision } from "./thought.js";
import type { Motivation } from "../types.js";

const originalMode = env.cognitionMode;
const originalKey = env.mistralApiKey;
const motivation: Motivation = {
  id: 1,
  kind: "user_message",
  score: 100,
  summary: "Tell me what you think.",
  refType: "message",
  refId: 1,
};

afterEach(() => {
  env.cognitionMode = originalMode;
  env.mistralApiKey = originalKey;
});

describe("Thought fallback", () => {
  it.each([
    ["rate_limited", Object.assign(new Error("limited"), { code: "rate_limited" })],
    ["mistral_unavailable", Object.assign(new Error("timeout"), { code: "mistral_unavailable" })],
    ["AbortError", Object.assign(new Error("aborted"), { name: "AbortError" })],
  ])("returns deterministic Agency on %s", async (expected, failure) => {
    env.cognitionMode = "apply";
    env.mistralApiKey = "test";
    const base = decide([motivation], "reactive");
    const result = await deliberateDecision(
      base,
      [motivation],
      "reactive",
      async () => { throw failure; },
    );
    expect(result).toMatchObject({
      kind: base.kind,
      motivationIds: base.motivationIds,
      thoughtSource: "fallback",
      thoughtError: expected,
    });
  });

  it("falls back on malformed structured output", async () => {
    env.cognitionMode = "apply";
    env.mistralApiKey = "test";
    const result = await deliberateDecision(
      decide([motivation], "reactive"),
      [motivation],
      "reactive",
      async () => ({ text: "not json", model: "test" }),
    );
    expect(result).toMatchObject({
      thoughtSource: "fallback",
      thoughtError: "invalid_response",
    });
  });

  it("persists only a sanitized provider error code", async () => {
    env.cognitionMode = "apply";
    env.mistralApiKey = "test";
    const result = await deliberateDecision(
      decide([motivation], "reactive"),
      [motivation],
      "reactive",
      async () => {
        throw Object.assign(new Error("raw provider payload"), {
          code: "provider failed: token=secret",
        });
      },
    );
    expect(result.thoughtError).toBe("thought_error");
    expect(result.thoughtError).not.toContain("raw provider payload");
  });
});
