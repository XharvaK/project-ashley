import { describe, expect, it } from "vitest";
import {
  createDisposableWorkspaceId,
  isDisposableWorkspaceId,
} from "./workspace-id.js";

describe("workspace ids", () => {
  it("generates filename-safe base64url ids", () => {
    const id = createDisposableWorkspaceId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id.length).toBe(22);
  });

  it("generates distinct ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(createDisposableWorkspaceId());
    expect(seen.size).toBe(1000);
  });

  it("accepts valid ids", () => {
    expect(isDisposableWorkspaceId(createDisposableWorkspaceId())).toBe(true);
    expect(isDisposableWorkspaceId("abcDEF-012_9")).toBe(true);
  });

  it("rejects malformed ids", () => {
    expect(isDisposableWorkspaceId("")).toBe(false);
    expect(isDisposableWorkspaceId("../escape")).toBe(false);
    expect(isDisposableWorkspaceId("a/b")).toBe(false);
    expect(isDisposableWorkspaceId("a b")).toBe(false);
    expect(isDisposableWorkspaceId("a".repeat(65))).toBe(false);
    expect(isDisposableWorkspaceId(42)).toBe(false);
    expect(isDisposableWorkspaceId(null)).toBe(false);
    expect(isDisposableWorkspaceId(undefined)).toBe(false);
  });
});
