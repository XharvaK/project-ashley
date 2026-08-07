import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createDisposableWorkspace } from "./workspace-create.js";
import { sweepDisposableWorkspaces } from "./workspace-sweep.js";
import { toNativeBrokerPath } from "../policy/path.js";
import {
  makeWorkspaceAuthorization,
  makeWorkspaceTestRoots,
} from "../test/fixtures/workspace.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");

async function createWorkspace(
  roots: ReturnType<typeof makeWorkspaceTestRoots>,
  overrides: { ttlMs?: number; nowMs?: number } = {},
): Promise<{ workspaceId: string; treeRoot: string; manifestPath: string }> {
  const result = await createDisposableWorkspace({
    authorization: makeWorkspaceAuthorization(),
    rootConfig: roots.rootConfig,
    sourceRoot: roots.sourceRoot,
    limits: overrides.ttlMs !== undefined ? { ttlMs: overrides.ttlMs } : undefined,
    nowMs: overrides.nowMs ?? NOW,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errorCode);
  return {
    workspaceId: result.workspaceId,
    treeRoot: result.treeRoot,
    manifestPath: result.manifestPath,
  };
}

describe("sweepDisposableWorkspaces", () => {
  it("removes expired workspaces and leaves live ones", async () => {
    const roots = makeWorkspaceTestRoots();
    const expired = await createWorkspace(roots, { ttlMs: 1_000, nowMs: NOW });
    const live = await createWorkspace(roots, { ttlMs: 3_600_000, nowMs: NOW });
    const result = sweepDisposableWorkspaces({
      candidates: [expired.workspaceId, live.workspaceId],
      rootConfig: roots.rootConfig,
      maxWorkspaces: 100,
      nowMs: NOW + 2_000,
    });
    expect(result.ok).toBe(true);
    expect(result.removed.map((entry) => entry.workspaceId)).toEqual([expired.workspaceId]);
    expect(result.skipped).toEqual([
      { workspaceId: live.workspaceId, outcome: "skipped", reason: "not_due" },
    ]);
    expect(existsSync(toNativeBrokerPath(expired.treeRoot))).toBe(false);
    expect(existsSync(toNativeBrokerPath(live.treeRoot))).toBe(true);
  });

  it("is idempotent: a second sweep over removed candidates reports no-op skips", async () => {
    const roots = makeWorkspaceTestRoots();
    const expired = await createWorkspace(roots, { ttlMs: 1_000, nowMs: NOW });
    const first = sweepDisposableWorkspaces({
      candidates: [expired.workspaceId],
      rootConfig: roots.rootConfig,
      maxWorkspaces: 100,
      nowMs: NOW + 2_000,
    });
    expect(first.removed).toHaveLength(1);
    const second = sweepDisposableWorkspaces({
      candidates: [expired.workspaceId],
      rootConfig: roots.rootConfig,
      maxWorkspaces: 100,
      nowMs: NOW + 3_000,
    });
    expect(second.removed).toHaveLength(0);
    expect(second.skipped).toEqual([
      { workspaceId: expired.workspaceId, outcome: "skipped", reason: "already_removed" },
    ]);
  });

  it("is bounded by maxWorkspaces", async () => {
    const roots = makeWorkspaceTestRoots();
    const a = await createWorkspace(roots, { ttlMs: 1_000, nowMs: NOW });
    const b = await createWorkspace(roots, { ttlMs: 1_000, nowMs: NOW });
    const result = sweepDisposableWorkspaces({
      candidates: [a.workspaceId, b.workspaceId],
      rootConfig: roots.rootConfig,
      maxWorkspaces: 1,
      nowMs: NOW + 2_000,
    });
    expect(result.removed).toHaveLength(1);
    expect(result.skipped).toEqual([
      { workspaceId: b.workspaceId, outcome: "skipped", reason: "sweep_cap_reached" },
    ]);
  });

  it("skips malformed candidate ids", () => {
    const roots = makeWorkspaceTestRoots();
    const result = sweepDisposableWorkspaces({
      candidates: ["../escape", "a/b"],
      rootConfig: roots.rootConfig,
      maxWorkspaces: 100,
      nowMs: NOW,
    });
    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toEqual([
      { workspaceId: "../escape", outcome: "skipped", reason: "invalid_candidate" },
      { workspaceId: "a/b", outcome: "skipped", reason: "invalid_candidate" },
    ]);
  });

  it("treats unknown candidates as already removed", async () => {
    const roots = makeWorkspaceTestRoots();
    const result = sweepDisposableWorkspaces({
      candidates: ["AAAAAAAAAAAAAAAAAAAAAA"],
      rootConfig: roots.rootConfig,
      maxWorkspaces: 100,
      nowMs: NOW,
    });
    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toEqual([
      { workspaceId: "AAAAAAAAAAAAAAAAAAAAAA", outcome: "skipped", reason: "already_removed" },
    ]);
  });

  it("honors an explicit created-before cutoff", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots, { ttlMs: 3_600_000, nowMs: NOW });
    const beforeCutoff = sweepDisposableWorkspaces({
      candidates: [created.workspaceId],
      rootConfig: roots.rootConfig,
      maxWorkspaces: 100,
      nowMs: NOW,
      createdBeforeMs: NOW + 1,
    });
    expect(beforeCutoff.removed.map((entry) => entry.workspaceId)).toEqual([
      created.workspaceId,
    ]);
    const afterCutoff = await createWorkspace(roots, { ttlMs: 3_600_000, nowMs: NOW });
    const notBefore = sweepDisposableWorkspaces({
      candidates: [afterCutoff.workspaceId],
      rootConfig: roots.rootConfig,
      maxWorkspaces: 100,
      nowMs: NOW,
      createdBeforeMs: NOW,
    });
    expect(notBefore.removed).toHaveLength(0);
    expect(notBefore.skipped).toEqual([
      {
        workspaceId: afterCutoff.workspaceId,
        outcome: "skipped",
        reason: "not_due",
      },
    ]);
  });

  it("never removes a workspace outside the configured disposable roots", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots, { ttlMs: 1_000, nowMs: NOW });
    const other = makeWorkspaceTestRoots();
    const result = sweepDisposableWorkspaces({
      candidates: [created.workspaceId],
      rootConfig: other.rootConfig,
      maxWorkspaces: 100,
      nowMs: NOW + 2_000,
    });
    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toEqual([
      { workspaceId: created.workspaceId, outcome: "skipped", reason: "already_removed" },
    ]);
    expect(existsSync(toNativeBrokerPath(created.treeRoot))).toBe(true);
  });
});
