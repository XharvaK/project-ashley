import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  createDisposableWorkspace,
  readDisposableWorkspaceManifest,
  type CreateDisposableWorkspaceInput,
} from "./workspace-create.js";
import { toNativeBrokerPath } from "../policy/path.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import {
  makeWorkspaceAuthorization,
  makeWorkspaceTestRoots,
} from "../test/fixtures/workspace.js";
import { DISPOSABLE_WORKSPACE_HARD_LIMITS } from "./workspace-limits.js";

function makeInput(
  roots: ReturnType<typeof makeWorkspaceTestRoots>,
  overrides: Partial<CreateDisposableWorkspaceInput> = {},
): CreateDisposableWorkspaceInput {
  return {
    authorization: makeWorkspaceAuthorization(),
    rootConfig: roots.rootConfig,
    sourceRoot: roots.sourceRoot,
    nowMs: Date.parse("2026-08-06T10:00:00.000Z"),
    ...overrides,
  };
}

function writeSourceFile(roots: ReturnType<typeof makeWorkspaceTestRoots>, rel: string, content: string) {
  const native = path.join(toNativeBrokerPath(roots.sourceRoot), ...rel.split("/"));
  mkdirSync(path.dirname(native), { recursive: true });
  writeFileSync(native, content);
}

describe("disposable workspace creation", () => {
  it("creates a sanitized workspace with a manifest and counts", async () => {
    const roots = makeWorkspaceTestRoots();
    writeSourceFile(roots, "README.md", "# hi");
    writeSourceFile(roots, "src/index.ts", "export const x = 1;");
    writeSourceFile(roots, ".env", "SECRET=1");
    writeSourceFile(roots, "node_modules/pkg/index.js", "x");
    const result = await createDisposableWorkspace(makeInput(roots));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspaceId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const treeNative = toNativeBrokerPath(result.treeRoot);
    expect(existsSync(path.join(treeNative, "README.md"))).toBe(true);
    expect(existsSync(path.join(treeNative, "src", "index.ts"))).toBe(true);
    expect(existsSync(path.join(treeNative, ".env"))).toBe(false);
    expect(existsSync(path.join(treeNative, "node_modules"))).toBe(false);
    expect(result.counts.files).toBe(2);
    expect(result.counts.excluded).toBe(2);
    expect(result.manifest.workspaceId).toBe(result.workspaceId);
    expect(result.manifest.sourceRoot).toBe(roots.sourceRoot);
    expect(result.manifest.capabilityId).toBe("candidate_workspace_create");
    expect(result.manifest.expiresAtIso).toBe(
      new Date(Date.parse(result.manifest.createdAtIso) + result.manifest.limits.ttlMs).toISOString(),
    );
    const onDisk = readDisposableWorkspaceManifest(result.manifestPath);
    expect(onDisk.ok).toBe(true);
  });

  it("records exclusion codes and digests when enabled", async () => {
    const roots = makeWorkspaceTestRoots();
    writeSourceFile(roots, "a.txt", "alpha");
    const result = await createDisposableWorkspace(makeInput(roots, { digests: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.exclusionCodes).toContain("vcs_metadata");
    expect(result.manifest.exclusionCodes).toContain("env_secrets");
    expect(result.manifest.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.manifest.fileDigests?.["a.txt"]).toBeDefined();
  });

  it("requires an autonomous authorization", async () => {
    const roots = makeWorkspaceTestRoots();
    const missing = await createDisposableWorkspace(
      makeInput(roots, { authorization: undefined as never }),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errorCode).toBe("authorization_required");

    const notAutonomous = await createDisposableWorkspace(
      makeInput(roots, {
        authorization: makeWorkspaceAuthorization({
          decision: "owner_approval_required",
        } as never),
      }),
    );
    expect(notAutonomous.ok).toBe(false);
    if (!notAutonomous.ok) expect(notAutonomous.errorCode).toBe("authorization_required");
  });

  it("requires the candidate_workspace_create capability", async () => {
    const roots = makeWorkspaceTestRoots();
    const result = await createDisposableWorkspace(
      makeInput(roots, {
        authorization: makeWorkspaceAuthorization({ capability: "approved_project_read" }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("authorization_capability_mismatch");
  });

  it("rejects malformed authorization fields", async () => {
    const roots = makeWorkspaceTestRoots();
    for (const patch of [
      { policyHash: "zzz" },
      { policyVersion: 0 },
      { workspaceBytesMax: 0 },
      { ownerId: "" },
      { sessionUuid: "x".repeat(65) },
    ]) {
      const result = await createDisposableWorkspace(
        makeInput(roots, { authorization: makeWorkspaceAuthorization(patch) }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("authorization_invalid");
    }
  });

  it("rejects missing, protected, and non-read-only source roots", async () => {
    const roots = makeWorkspaceTestRoots();
    const missing = await createDisposableWorkspace(
      makeInput(roots, { sourceRoot: `${roots.sourceRoot}-nope` }),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errorCode).toBe("source_root_missing");

    const nonCanonical = await createDisposableWorkspace(
      makeInput(roots, { sourceRoot: "not/canonical" }),
    );
    expect(nonCanonical.ok).toBe(false);
    if (!nonCanonical.ok) expect(nonCanonical.errorCode).toBe("root_not_canonical");

    const asDestination = await createDisposableWorkspace(
      makeInput(roots, { sourceRoot: roots.destinationRoot }),
    );
    expect(asDestination.ok).toBe(false);
    if (!asDestination.ok) expect(asDestination.errorCode).toBe("source_root_not_read_only");

    const protectedRoots = makeWorkspaceTestRoots();
    const protectedConfig: BrokerRootConfig = {
      ...protectedRoots.rootConfig,
      protectedRoots: {
        delegatedWriteDeniedOwnerApprovable: [protectedRoots.sourceRoot],
        absoluteDenial: [],
      },
    };
    const protectedSource = await createDisposableWorkspace(
      makeInput(protectedRoots, { rootConfig: protectedConfig }),
    );
    expect(protectedSource.ok).toBe(false);
    if (!protectedSource.ok) {
      expect(protectedSource.errorCode).toBe("root_config_invalid");
    }
  });

  it("rejects missing and non-writable destination roots", async () => {
    const roots = makeWorkspaceTestRoots();
    const missing = await createDisposableWorkspace(
      makeInput(roots, { destinationRoot: `${roots.destinationRoot}-nope` }),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errorCode).toBe("destination_root_missing");

    const asSource = await createDisposableWorkspace(
      makeInput(roots, { destinationRoot: roots.sourceRoot }),
    );
    expect(asSource.ok).toBe(false);
    if (!asSource.ok) expect(asSource.errorCode).toBe("destination_root_not_writable_disposable");
  });

  it("fails when multiple destination roots exist and none is chosen", async () => {
    const roots = makeWorkspaceTestRoots({ extraDestinationRoot: "yes" });
    const result = await createDisposableWorkspace(makeInput(roots));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("ambiguous_destination_root");
    const explicit = await createDisposableWorkspace(
      makeInput(roots, { destinationRoot: roots.destinationRoot }),
    );
    expect(explicit.ok).toBe(true);
  });

  it("combines the authorization workspaceBytesMax as a strict ceiling", async () => {
    const roots = makeWorkspaceTestRoots();
    writeSourceFile(roots, "a.txt", "x".repeat(100));
    const result = await createDisposableWorkspace(
      makeInput(roots, {
        authorization: makeWorkspaceAuthorization({ workspaceBytesMax: 50 }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("limit_exceeded");
  });

  it("enforces request limits", async () => {
    const roots = makeWorkspaceTestRoots();
    writeSourceFile(roots, "a.txt", "x");
    writeSourceFile(roots, "b.txt", "x");
    writeSourceFile(roots, "c.txt", "x");
    const result = await createDisposableWorkspace(
      makeInput(roots, { limits: { maxFiles: 2 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("limit_exceeded");
      expect(result.reason).toContain("files_exceeded");
    }
  });

  it("rejects limits above the hard ceilings", async () => {
    const roots = makeWorkspaceTestRoots();
    const result = await createDisposableWorkspace(
      makeInput(roots, { limits: { maxFiles: DISPOSABLE_WORKSPACE_HARD_LIMITS.maxFiles + 1 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("limits_invalid");
  });

  it("removes the partial tree when the copy fails", async () => {
    const roots = makeWorkspaceTestRoots();
    writeSourceFile(roots, "big.bin", "x".repeat(100));
    const bad = await createDisposableWorkspace(
      makeInput(roots, { limits: { maxSingleFileBytes: 50 } }),
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errorCode).toBe("limit_exceeded");
    expect(bad.cleanupPerformed).toBe(true);
    const destNative = toNativeBrokerPath(roots.destinationRoot);
    const leftovers = readdirSync(destNative);
    expect(leftovers.filter((name) => name !== ".ashley-meta")).toEqual([]);
  });

  it("rejects an invalid clock", async () => {
    const roots = makeWorkspaceTestRoots();
    const result = await createDisposableWorkspace(makeInput(roots, { nowMs: Number.NaN }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_clock");
  });

  it("rejects an invalid symlink policy", async () => {
    const roots = makeWorkspaceTestRoots();
    const result = await createDisposableWorkspace(
      makeInput(roots, { symlinkPolicy: "follow" as never }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("symlink_policy_invalid");
  });
});
