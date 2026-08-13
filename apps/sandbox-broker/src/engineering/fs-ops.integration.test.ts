/**
 * Integration tests for the engineering containment primitives.
 *
 * These exercise the REAL broker filesystem primitives (no fake client),
 * covering the corrected `isWithin(root, target)` argument order (B1), the
 * symlink/dangling-symlink safe resolution, and the search bounds.
 *
 * The broker runs only on Linux Mint, and its `path.resolve`/`realpath`
 * containment semantics are POSIX-specific; consistent with the repo's
 * `describe.skipIf(!onLinux)` convention for engineering primitives, these
 * tests run on Linux and are skipped on the Windows dev host. They are
 * source-complete and ready to execute on the Mint qualification host.
 */

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  resolveWithinRoot,
  boundedReadFile,
  boundedSearchText,
  FS_OP_LIMITS,
  SEARCH_EXCLUDED_DIRS,
} from "./fs-ops.js";
import { workspaceTreeRoot } from "./handlers.js";
import type { BrokerRootConfig } from "../policy/root-config.js";

const onLinux = process.platform === "linux";

describe.skipIf(!onLinux)("B1: resolveWithinRoot containment + symlink safety", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "eng-fs-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "export const x = 1;\n");
    writeFileSync(join(root, "readme.md"), "# hi\n");
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("resolves a normal child", async () => {
    const r = await resolveWithinRoot(root, "src/a.ts");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absolute.endsWith("src/a.ts")).toBe(true);
  });

  it("rejects a parent-escape via ..", async () => {
    const r = await resolveWithinRoot(root, "../escape");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("path_escape");
  });

  it("rejects an absolute path outside the root", async () => {
    const r = await resolveWithinRoot(root, "/etc/passwd");
    expect(r.ok).toBe(false);
  });

  it("refuses a dangling-symlink write-through escape (B1 companion)", async () => {
    let canSymlink = true;
    try {
      symlinkSync("/nonexistent-outside-target", join(root, "src", "dangling"));
    } catch {
      canSymlink = false;
    }
    if (!canSymlink) return;
    const r = await resolveWithinRoot(root, "src/dangling/file");
    expect(r.ok).toBe(false);
  });

  it("refuses an existing symlink pointing outside the root", async () => {
    let canSymlink = true;
    try {
      symlinkSync("/tmp", join(root, "escape-link"));
    } catch {
      canSymlink = false;
    }
    if (!canSymlink) return;
    const r = await resolveWithinRoot(root, "escape-link/secret");
    expect(r.ok).toBe(false);
  });

  it("reads a contained file", async () => {
    const r = await boundedReadFile(root, "readme.md");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBeTruthy();
  });
});

describe.skipIf(!onLinux)("B1 handler: workspaceTreeRoot argument order", () => {
  const rootConfig: BrokerRootConfig = {
    workspaceRoot: "/var/lib/ashley-sandbox/workspace",
    readOnlyRoots: [],
    writableDisposableRoots: [],
    protectedRoots: { delegatedWriteDeniedOwnerApprovable: [], absoluteDenial: [] },
  };
  it("accepts a valid workspace id under the root", () => {
    const abs = workspaceTreeRoot(rootConfig, "abc123");
    expect(abs).not.toBeNull();
    expect(abs!.startsWith("/var/lib/ashley-sandbox/workspace/")).toBe(true);
  });
  it("rejects an escape id", () => {
    expect(workspaceTreeRoot(rootConfig, "../x")).toBeNull();
    expect(workspaceTreeRoot(rootConfig, "a/../../x")).toBeNull();
  });
  it("rejects a non-canonical id", () => {
    expect(workspaceTreeRoot(rootConfig, "bad id!")).toBeNull();
  });
});

describe.skipIf(!onLinux)("search bounds (exclusions, literal vs regex, caps)", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "eng-fs-"));
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "needle in src\n");
    writeFileSync(join(root, ".git", "config"), "needle in git config\n");
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("does not traverse excluded directories (.git)", async () => {
    const r = await boundedSearchText(root, "needle");
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const m of r.matches) {
        expect(m.relativePath.startsWith(".git/")).toBe(false);
      }
      expect(r.matches.some((m) => m.relativePath === "src/a.ts")).toBe(true);
    }
  });

  it("excluded dir set includes the expected entries", () => {
    expect(SEARCH_EXCLUDED_DIRS.has(".git")).toBe(true);
    expect(SEARCH_EXCLUDED_DIRS.has("node_modules")).toBe(true);
  });

  it("exposes sane search bounds", () => {
    expect(FS_OP_LIMITS.MAX_SEARCH_FILES).toBeGreaterThan(0);
    expect(FS_OP_LIMITS.MAX_SEARCH_MATCHES).toBeGreaterThan(0);
  });
});

// Keep existsSync referenced to avoid unused-import lint in some configs.
expect(typeof existsSync).toBe("function");
