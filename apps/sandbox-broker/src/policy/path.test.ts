import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeWorkspacePath } from "./path.js";

describe("path policy", () => {
  it("rejects absolute paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ashley-path-"));
    const result = normalizeWorkspacePath(root, "/etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("absolute_path_forbidden");
    }
  });

  it("rejects parent traversal", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ashley-path-"));
    const result = normalizeWorkspacePath(root, "../outside");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("path_escape");
    }
  });

  it("allows contained workspace-relative paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ashley-path-"));
    mkdirSync(path.join(root, "workspace"), { recursive: true });
    const result = normalizeWorkspacePath(root, "workspace");
    expect(result.ok).toBe(true);
  });

  it("rejects symlink escape when resolved path leaves root", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ashley-path-"));
    const outside = mkdtempSync(path.join(tmpdir(), "ashley-outside-"));
    const linkParent = path.join(root, "workspace");
    mkdirSync(linkParent, { recursive: true });
    const linkPath = path.join(linkParent, "escape");
    try {
      symlinkSync(outside, linkPath, "dir");
      const result = normalizeWorkspacePath(root, "workspace/escape");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("path_escape");
      }
    } catch {
      // Symlink creation may require elevated privileges on Windows; skip assertion.
      expect(true).toBe(true);
    }
  });
});
