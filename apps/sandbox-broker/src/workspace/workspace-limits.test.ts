import { describe, expect, it } from "vitest";
import {
  combineWorkspaceLimits,
  DISPOSABLE_WORKSPACE_HARD_LIMITS,
  DISPOSABLE_WORKSPACE_MAX_TTL_MS,
  validateDisposableWorkspaceLimits,
} from "./workspace-limits.js";

describe("workspace limits", () => {
  it("defaults to the broker hard ceilings", () => {
    const result = validateDisposableWorkspaceLimits(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(DISPOSABLE_WORKSPACE_HARD_LIMITS);
    }
  });

  it("accepts a partial request that tightens limits", () => {
    const result = validateDisposableWorkspaceLimits({ maxFiles: 5, maxBytes: 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.maxFiles).toBe(5);
      expect(result.value.maxBytes).toBe(1024);
      expect(result.value.maxDepth).toBe(DISPOSABLE_WORKSPACE_HARD_LIMITS.maxDepth);
      expect(result.value.ttlMs).toBe(DISPOSABLE_WORKSPACE_HARD_LIMITS.ttlMs);
    }
  });

  it("rejects non-positive or non-integer values", () => {
    for (const bad of [0, -1, 1.5, "5", null]) {
      const result = validateDisposableWorkspaceLimits({ maxFiles: bad as number });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects limits above the hard ceilings", () => {
    const result = validateDisposableWorkspaceLimits({
      maxFiles: DISPOSABLE_WORKSPACE_HARD_LIMITS.maxFiles + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("maxFiles_exceeds_hard_ceiling");
    }
  });

  it("rejects ttls above the maximum ttl", () => {
    const result = validateDisposableWorkspaceLimits({
      ttlMs: DISPOSABLE_WORKSPACE_MAX_TTL_MS + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("ttl_ms_exceeds_hard_ceiling");
    }
  });

  it("rejects non-object limits", () => {
    for (const bad of ["x", 5, [], true]) {
      const result = validateDisposableWorkspaceLimits(bad as never);
      expect(result.ok).toBe(false);
    }
  });

  it("combines request and policy ceilings as the strictest of each", () => {
    const base = { ...DISPOSABLE_WORKSPACE_HARD_LIMITS, maxBytes: 100 };
    expect(combineWorkspaceLimits(base, 50).maxBytes).toBe(50);
    expect(combineWorkspaceLimits(base, 1000).maxBytes).toBe(100);
    expect(combineWorkspaceLimits(base, 10_000).maxFiles).toBe(base.maxFiles);
  });
});
