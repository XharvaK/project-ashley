import { describe, expect, it } from "vitest";
import { extractJsonObject, parseJsonObject } from "./extract-json.js";

describe("extractJsonObject", () => {
  it("strips markdown fences", () => {
    const raw = '```json\n{"facts": [], "no_change": true}\n```';
    expect(extractJsonObject(raw)).toBe('{"facts": [], "no_change": true}');
  });

  it("extracts embedded object", () => {
    const raw = 'Here is output:\n{"ok": true}\nThanks';
    expect(parseJsonObject<{ ok: boolean }>(raw).ok).toBe(true);
  });
});
