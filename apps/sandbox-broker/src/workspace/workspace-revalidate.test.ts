import { describe, expect, it } from "vitest";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createDisposableWorkspace } from "./workspace-create.js";
import {
  locateDisposableWorkspace,
  revalidateDisposableWorkspace,
  isWorkspaceTreePath,
} from "./workspace-revalidate.js";
import { cleanupDisposableWorkspace } from "./workspace-cleanup.js";
import { toNativeBrokerPath } from "../policy/path.js";
import {
  makeWorkspaceAuthorization,
  makeWorkspaceTestRoots,
} from "../test/fixtures/workspace.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");

async function createWorkspace(
  roots: ReturnType<typeof makeWorkspaceTestRoots>,
): Promise<{ ok: true; workspaceId: string; treeRoot: string; manifestPath: string }> {
  const result = await createDisposableWorkspace({
    authorization: makeWorkspaceAuthorization(),
    rootConfig: roots.rootConfig,
    sourceRoot: roots.sourceRoot,
    nowMs: NOW,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errorCode);
  return { ok: true, workspaceId: result.workspaceId, treeRoot: result.treeRoot, manifestPath: result.manifestPath };
}

describe("workspace revalidation", () => {
  it("revalidates an intact workspace", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const result = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: NOW + 1_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.locations.treeRoot).toBe(created.treeRoot);
      expect(result.locations.manifest.workspaceId).toBe(created.workspaceId);
    }
  });

  it("rejects malformed ids", () => {
    const roots = makeWorkspaceTestRoots();
    for (const id of ["", "../escape", "a/b", "x".repeat(65)]) {
      const result = revalidateDisposableWorkspace({
        workspaceId: id,
        rootConfig: roots.rootConfig,
        nowMs: NOW,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("invalid_workspace_id");
    }
  });

  it("fails for an unknown id", () => {
    const roots = makeWorkspaceTestRoots();
    const result = revalidateDisposableWorkspace({
      workspaceId: "AAAAAAAAAAAAAAAAAAAAAA",
      rootConfig: roots.rootConfig,
      nowMs: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("workspace_not_found");
  });

  it("fails when the tree is missing", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    rmSync(toNativeBrokerPath(created.treeRoot), { recursive: true, force: true });
    const result = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: NOW + 1_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("tree_missing");
  });

  it("fails for an expired workspace", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const result = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: NOW + 365 * 24 * 60 * 60 * 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("workspace_expired");
  });

  it("fails when the manifest identity is tampered", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const manifestNative = toNativeBrokerPath(created.manifestPath);
    const raw = JSON.parse(readFileSync(manifestNative, "utf8"));
    raw.workspaceId = "BBBBBBBBBBBBBBBBBBBBBB";
    writeFileSync(manifestNative, JSON.stringify(raw));
    const result = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: NOW + 1_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("manifest_identity_mismatch");
  });

  it("fails when the manifest treeRoot is tampered", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const manifestNative = toNativeBrokerPath(created.manifestPath);
    const raw = JSON.parse(readFileSync(manifestNative, "utf8"));
    raw.treeRoot = `${roots.destinationRoot}/other`;
    writeFileSync(manifestNative, JSON.stringify(raw));
    const result = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: NOW + 1_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("manifest_mismatch");
  });

  it("fails when the manifest is corrupt", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    writeFileSync(toNativeBrokerPath(created.manifestPath), "{not json");
    const result = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: NOW + 1_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("workspace_not_found");
  });

  it("rejects an invalid clock", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const result = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: Number.NaN,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_clock");
  });

  it("locate works without expiry enforcement", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const located = locateDisposableWorkspace(created.workspaceId, roots.rootConfig);
    expect(located.ok).toBe(true);
  });

  it("guards tree paths against root-level targets", () => {
    expect(isWorkspaceTreePath("/var/lib/ashley-sandbox/work", "/var/lib/ashley-sandbox/work")).toBe(false);
    expect(isWorkspaceTreePath("/var/lib/ashley-sandbox/work", "/var/lib/ashley-sandbox/work/abc-123")).toBe(true);
    expect(isWorkspaceTreePath("/var/lib/ashley-sandbox/work", "/var/lib/ashley-sandbox/work/abc-123/extra")).toBe(false);
    expect(isWorkspaceTreePath("/var/lib/ashley-sandbox/work", "/var/lib/ashley-sandbox/other/abc-123")).toBe(false);
  });
});

describe("workspace cleanup", () => {
  it("removes the tree and manifest", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const result = cleanupDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedTree).toBe(true);
    expect(result.removedManifest).toBe(true);
    const treeNative = toNativeBrokerPath(created.treeRoot);
    expect(readdirOrFail(treeNative)).toBe(false);
    const after = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: NOW + 1_000,
    });
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.errorCode).toBe("workspace_not_found");
  });

  it("removes expired workspaces", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const expired = revalidateDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
      nowMs: NOW + 365 * 24 * 60 * 60 * 1000,
    });
    expect(expired.ok).toBe(false);
    if (expired.ok) return;
    const result = cleanupDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(true);
  });

  it("fails for malformed or unknown ids", () => {
    const roots = makeWorkspaceTestRoots();
    const malformed = cleanupDisposableWorkspace({ workspaceId: "../x", rootConfig: roots.rootConfig });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.errorCode).toBe("invalid_workspace_id");
    const unknown = cleanupDisposableWorkspace({ workspaceId: "AAAAAAAAAAAAAAAAAAAAAA", rootConfig: roots.rootConfig });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errorCode).toBe("workspace_not_found");
  });

  it("leaves a foreign manifest alone", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createWorkspace(roots);
    const manifestNative = toNativeBrokerPath(created.manifestPath);
    const raw = JSON.parse(readFileSync(manifestNative, "utf8"));
    raw.workspaceId = "CCCCCCCCCCCCCCCCCCCCCC";
    writeFileSync(manifestNative, JSON.stringify(raw));
    const result = cleanupDisposableWorkspace({
      workspaceId: created.workspaceId,
      rootConfig: roots.rootConfig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("manifest_identity_mismatch");
    expect(mkdirSyncOrExists(toNativeBrokerPath(created.treeRoot))).toBe(true);
  });
});

function readdirOrFail(dir: string): boolean {
  try {
    readdirSync(dir);
    return true;
  } catch {
    return false;
  }
}

function mkdirSyncOrExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}
