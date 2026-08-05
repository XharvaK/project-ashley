/**
 * Broker root configuration validation tests (Sandbox Wave 4, Commit 6).
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  toCanonicalBrokerPath,
  validateBrokerRootConfig,
  type BrokerRootConfig,
} from "../index.js";

function canon(native: string): string {
  const result = toCanonicalBrokerPath(native);
  if (!result.ok) throw new Error("test_layout_not_canonical");
  return result.value;
}

function makeInput(): {
  workspaceRoot: string;
  readOnlyRoots: string[];
  writableDisposableRoots: string[];
  protectedRoots: BrokerRootConfig["protectedRoots"];
  native: { root: string; live: string; work: string };
} {
  const root = mkdtempSync(join(tmpdir(), "ashley-roots-"));
  const live = join(root, "live");
  const work = join(root, "work");
  mkdirSync(live, { recursive: true });
  mkdirSync(work, { recursive: true });
  return {
    workspaceRoot: canon(root),
    readOnlyRoots: [canon(live)],
    writableDisposableRoots: [canon(work)],
    protectedRoots: {
      delegatedWriteDeniedOwnerApprovable: [],
      absoluteDenial: [canon(join(root, "meta", "keys"))],
    },
    native: { root, live, work },
  };
}

describe("broker root configuration", () => {
  it("1. accepts a canonical, conflict-free configuration", () => {
    const result = validateBrokerRootConfig(makeInput());
    expect(result.ok).toBe(true);
  });

  it("2. rejects a non-canonical workspace root", () => {
    const input = makeInput();
    const result = validateBrokerRootConfig({ ...input, workspaceRoot: "workspace" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("workspace_root_not_canonical");
    }
  });

  it("3. rejects a non-canonical read-only root", () => {
    const input = makeInput();
    const result = validateBrokerRootConfig({ ...input, readOnlyRoots: ["/a/./b"] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("read_only_root_not_canonical:/a/./b");
    }
  });

  it("4. rejects duplicate read-only roots", () => {
    const input = makeInput();
    const result = validateBrokerRootConfig({
      ...input,
      readOnlyRoots: [input.readOnlyRoots[0]!, input.readOnlyRoots[0]!],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.reasons.some((reason) => reason.startsWith("read_only_root_duplicate:")),
      ).toBe(true);
    }
  });

  it("5. rejects a non-canonical disposable root", () => {
    const input = makeInput();
    const result = validateBrokerRootConfig({ ...input, writableDisposableRoots: ["work"] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("writable_disposable_root_not_canonical:work");
    }
  });

  it("6. rejects duplicate disposable roots", () => {
    const input = makeInput();
    const result = validateBrokerRootConfig({
      ...input,
      writableDisposableRoots: [
        input.writableDisposableRoots[0]!,
        input.writableDisposableRoots[0]!,
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.reasons.some((reason) =>
          reason.startsWith("writable_disposable_root_duplicate:"),
        ),
      ).toBe(true);
    }
  });

  it("7. rejects read and writable root overlap", () => {
    const input = makeInput();
    const nestedWork = join(input.native.live, "nested", "work");
    mkdirSync(nestedWork, { recursive: true });
    const result = validateBrokerRootConfig({
      ...input,
      writableDisposableRoots: [canon(nestedWork)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.reasons.some((reason) => reason.startsWith("read_write_root_overlap:")),
      ).toBe(true);
    }
  });

  it("8. rejects protected roots overlapping read-only roots", () => {
    const input = makeInput();
    const gitDir = join(input.native.live, ".git");
    mkdirSync(gitDir, { recursive: true });
    const result = validateBrokerRootConfig({
      ...input,
      protectedRoots: {
        ...input.protectedRoots,
        absoluteDenial: [canon(gitDir)],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.reasons.some((reason) => reason.startsWith("protected_overlaps_read_root:")),
      ).toBe(true);
    }
  });

  it("9. rejects protected roots overlapping disposable roots", () => {
    const input = makeInput();
    const keep = join(input.native.work, "keep");
    mkdirSync(keep, { recursive: true });
    const result = validateBrokerRootConfig({
      ...input,
      protectedRoots: {
        ...input.protectedRoots,
        delegatedWriteDeniedOwnerApprovable: [canon(keep)],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.reasons.some((reason) =>
          reason.startsWith("protected_overlaps_disposable_root:"),
        ),
      ).toBe(true);
    }
  });

  it("10. rejects non-canonical and duplicate protected roots", () => {
    const input = makeInput();
    const result = validateBrokerRootConfig({
      ...input,
      protectedRoots: {
        delegatedWriteDeniedOwnerApprovable: [],
        absoluteDenial: ["/a/b", "/a/b", "/x/./y"],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("absolute_denial_protected_root_duplicate:/a/b");
      expect(result.reasons).toContain("absolute_denial_protected_root_not_canonical:/x/./y");
    }
  });
});
