import { describe, it, expect } from "vitest";
import {
  semanticPassKey,
  hashAuthorityObjections,
  ProjectionCache,
} from "../cache.js";

describe("Projection Cache & Semantic Pass Keys", () => {
  it("produces identical key for identical semantic pass state across structural retries", () => {
    const key1 = semanticPassKey({
      cycleId: "cycle-1",
      generation: 1,
      pass: 1,
      observationsCount: 2,
      inFlightCount: 0,
      authorityObjectionsHash: hashAuthorityObjections([]),
      composeLogIds: ["log-1", "log-2"],
      rememberDirectivePresent: false,
    });

    const key2 = semanticPassKey({
      cycleId: "cycle-1",
      generation: 1,
      pass: 1,
      observationsCount: 2,
      inFlightCount: 0,
      authorityObjectionsHash: hashAuthorityObjections([]),
      composeLogIds: ["log-2", "log-1"], // Order permutation produces same key
      rememberDirectivePresent: false,
    });

    expect(key1).toBe(key2);
  });

  it("invalidates cache key when semantic evidence changes", () => {
    const base = {
      cycleId: "cycle-1",
      generation: 1,
      pass: 1,
      observationsCount: 0,
      inFlightCount: 0,
      authorityObjectionsHash: "none",
      composeLogIds: ["log-1"],
      rememberDirectivePresent: false,
    };

    const keyBase = semanticPassKey(base);
    const keyNewObs = semanticPassKey({ ...base, observationsCount: 1 });
    const keyNewGen = semanticPassKey({ ...base, generation: 2 });
    const keyNewDirective = semanticPassKey({ ...base, rememberDirectivePresent: true });

    expect(keyNewObs).not.toBe(keyBase);
    expect(keyNewGen).not.toBe(keyBase);
    expect(keyNewDirective).not.toBe(keyBase);
  });

  it("manages cache store entries correctly", () => {
    const cache = new ProjectionCache<{ hash: string }>();
    cache.set("k1", { hash: "hash1" });

    expect(cache.has("k1")).toBe(true);
    expect(cache.get("k1")?.hash).toBe("hash1");
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("k1")).toBe(false);
  });
});
