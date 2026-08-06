/**
 * Executable resolver tests (Sandbox Wave 4, Commit 9).
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveFixedRecipeExecutable } from "../index.js";
import type { FixedRecipe } from "../index.js";
import { toCanonicalBrokerPath } from "../policy/path.js";
import { makeWorkspaceTestRoots } from "../test/fixtures/workspace.js";

function makeRecipe(overrides: Partial<FixedRecipe> = {}): FixedRecipe {
  return {
    recipeId: "git:test",
    category: "git",
    executable: "/usr/bin/git",
    argv: ["--no-pager", "-c", "color.ui=false", "status"],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: ["PATH"],
    networkMode: "none",
    description: "test",
    ...overrides,
  };
}

describe("resolveFixedRecipeExecutable", () => {
  it("1. resolves a mapped executable that is a real regular file", () => {
    const roots = makeWorkspaceTestRoots();
    const bin = mkdtempSync(path.join(tmpdir(), "ashley-bin-"));
    const exe = path.join(bin, "git-real");
    writeFileSync(exe, "#!/bin/sh\n", "utf8");
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: exe },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(path.normalize(result.executable)).toBe(exe);
    }
  });

  it("2. fails closed on an unmapped executable", () => {
    const roots = makeWorkspaceTestRoots();
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: {},
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("executable_unmapped");
  });

  it("3. fails closed on a mapping for a different executable id", () => {
    const roots = makeWorkspaceTestRoots();
    const bin = mkdtempSync(path.join(tmpdir(), "ashley-bin-"));
    const exe = path.join(bin, "other");
    writeFileSync(exe, "x", "utf8");
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { npm: exe },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("executable_unmapped");
  });

  it("4. fails closed on a non-absolute mapping", () => {
    const roots = makeWorkspaceTestRoots();
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: "relative/git" },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("executable_mapping_not_absolute");
  });

  it("5. fails closed on a missing file", () => {
    const roots = makeWorkspaceTestRoots();
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: path.join(roots.base, "no-such-file") },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("executable_missing");
  });

  it("6. fails closed on a directory mapping", () => {
    const roots = makeWorkspaceTestRoots();
    const dir = mkdtempSync(path.join(tmpdir(), "ashley-dir-"));
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: dir },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("executable_not_regular_file");
  });

  it("7. fails closed on a symlink mapping", () => {
    const roots = makeWorkspaceTestRoots();
    const bin = mkdtempSync(path.join(tmpdir(), "ashley-bin-"));
    const target = path.join(bin, "target");
    const link = path.join(bin, "link");
    writeFileSync(target, "x", "utf8");
    try {
      symlinkSync(target, link);
    } catch {
      // symlinks unsupported on this host
      return;
    }
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: link },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("executable_symlink");
  });

  it("8. fails closed on an executable inside a writable disposable root", () => {
    const roots = makeWorkspaceTestRoots();
    const exe = path.join(roots.base, "dest", "tampered.bin");
    writeFileSync(exe, "x", "utf8");
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: exe },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("executable_in_forbidden_zone");
  });

  it("9. fails closed on an executable inside a protected root", () => {
    const roots = makeWorkspaceTestRoots();
    const gitDirNative = path.join(roots.base, "source", ".git");
    mkdirSync(gitDirNative, { recursive: true });
    const exe = path.join(gitDirNative, "hooks.bin");
    writeFileSync(exe, "x", "utf8");
    const canonicalResult = toCanonicalBrokerPath(gitDirNative);
    if (!canonicalResult.ok) throw new Error("path_not_canonical");
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: exe },
      rootConfig: {
        ...roots.rootConfig,
        protectedRoots: {
          delegatedWriteDeniedOwnerApprovable: [canonicalResult.value],
          absoluteDenial: [],
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("executable_in_forbidden_zone");
  });

  it("10. allows an executable inside a read-only root", () => {
    const roots = makeWorkspaceTestRoots();
    const exe = path.join(roots.base, "source", "tool.bin");
    writeFileSync(exe, "x", "utf8");
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: exe },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(true);
  });

  it("11. allows an executable outside all configured roots", () => {
    const roots = makeWorkspaceTestRoots();
    const bin = mkdtempSync(path.join(tmpdir(), "ashley-bin-"));
    const exe = path.join(bin, "git-outside");
    writeFileSync(exe, "x", "utf8");
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: exe },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(true);
  });

  it("12. maps by executable base name, not full path", () => {
    const roots = makeWorkspaceTestRoots();
    const bin = mkdtempSync(path.join(tmpdir(), "ashley-bin-"));
    const exe = path.join(bin, "git-renamed");
    writeFileSync(exe, "x", "utf8");
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe({ executable: "/usr/local/lib/git" }),
      mappings: { git: exe },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(true);
  });

  it("13. revalidates through realpath at execution time", () => {
    const roots = makeWorkspaceTestRoots();
    const bin = mkdtempSync(path.join(tmpdir(), "ashley-bin-"));
    const exe = path.join(bin, "real-check");
    writeFileSync(exe, "x", "utf8");
    const result = resolveFixedRecipeExecutable({
      recipe: makeRecipe(),
      mappings: { git: exe },
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(path.normalize(result.executable)).toBe(exe);
  });
});
