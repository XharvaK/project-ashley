import { describe, expect, it } from "vitest";
import {
  createDisposableWorkspaceManifest,
  parseDisposableWorkspaceManifest,
  serializeDisposableWorkspaceManifest,
  type DisposableWorkspaceManifest,
} from "./workspace-manifest.js";

function validManifest(): DisposableWorkspaceManifest {
  return createDisposableWorkspaceManifest({
    workspaceId: "abc-123",
    sourceRoot: "/var/lib/ashley-sandbox/live-checkout",
    sourceRootId: "a".repeat(64),
    sourceIdentity: null,
    treeRoot: "/var/lib/ashley-sandbox/work/abc-123",
    metadataPath: "/var/lib/ashley-sandbox/work/.ashley-meta/abc-123.json",
    ownerId: "owner-1",
    proposalId: "prop-1",
    sessionUuid: "session-1",
    policyId: "test-policy-1",
    policyVersion: 1,
    policyHash: "b".repeat(64),
    capabilityId: "candidate_workspace_create",
    createdAtIso: "2026-08-06T10:00:00.000Z",
    expiresAtIso: "2026-08-07T10:00:00.000Z",
    limits: {
      maxFiles: 100,
      maxBytes: 1024,
      maxSingleFileBytes: 512,
      maxPathLength: 1024,
      maxDepth: 32,
      maxExcludedEntries: 100,
      ttlMs: 86_400_000,
    },
    counts: {
      files: 3,
      directories: 2,
      excluded: 1,
      bytes: 42,
      skippedSymlinks: 0,
      hardLinkedFiles: 0,
      specialFiles: 0,
      privilegedFiles: 0,
      caseCollisions: 0,
    },
    exclusionCodes: ["vcs_metadata", "env_secrets"],
    digest: null,
    fileDigests: null,
  });
}

describe("workspace manifests", () => {
  it("round-trips through serialize and parse", () => {
    const manifest = validManifest();
    const parsed = parseDisposableWorkspaceManifest(JSON.parse(serializeDisposableWorkspaceManifest(manifest)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.manifest).toEqual(manifest);
    }
  });

  it("rejects wrong versions", () => {
    const bad = { ...validManifest(), version: 2 };
    const parsed = parseDisposableWorkspaceManifest(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reasons).toContain("manifest_version_must_be_1");
  });

  it("rejects unsupported fields", () => {
    const bad = { ...validManifest(), extraField: "x" };
    const parsed = parseDisposableWorkspaceManifest(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reasons).toContain("unsupported_field:extraField");
  });

  it("rejects malformed identity and policy fields", () => {
    const cases: Array<[Partial<DisposableWorkspaceManifest>, string]> = [
      [{ workspaceId: "" }, "workspace_id_invalid"],
      [{ workspaceId: "bad/id" }, "workspace_id_invalid"],
      [{ sourceRootId: "not-a-hash" }, "source_root_id_invalid"],
      [{ policyHash: "zzz" }, "policy_hash_invalid"],
      [{ policyVersion: 0 }, "policy_version_invalid"],
      [
        { capabilityId: "write_live_repository" } as never,
        "capability_id_invalid",
      ],
      [{ ownerId: "" }, "owner_id_invalid"],
      [{ sessionUuid: "" }, "session_uuid_invalid"],
      [{ sessionUuid: "x".repeat(65) }, "session_uuid_invalid"],
    ];
    for (const [patch, reason] of cases) {
      const parsed = parseDisposableWorkspaceManifest({ ...validManifest(), ...patch });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.reasons).toContain(reason);
    }
  });

  it("rejects malformed timestamps", () => {
    const parsed = parseDisposableWorkspaceManifest({
      ...validManifest(),
      createdAtIso: "2026-08-06",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reasons).toContain("created_at_invalid");
  });

  it("rejects malformed limits and counts", () => {
    const badLimits = parseDisposableWorkspaceManifest({
      ...validManifest(),
      limits: { ...validManifest().limits, maxFiles: 0 },
    });
    expect(badLimits.ok).toBe(false);
    if (!badLimits.ok) expect(badLimits.reasons).toContain("limits_maxFiles_invalid");
    const missingCounts = parseDisposableWorkspaceManifest({ ...validManifest(), counts: undefined });
    expect(missingCounts.ok).toBe(false);
    if (!missingCounts.ok) expect(missingCounts.reasons).toContain("counts_required");
    const badCounts = parseDisposableWorkspaceManifest({
      ...validManifest(),
      counts: { ...validManifest().counts, files: -1 },
    });
    expect(badCounts.ok).toBe(false);
    if (!badCounts.ok) expect(badCounts.reasons).toContain("counts_files_invalid");
  });

  it("rejects malformed digests", () => {
    const badDigest = parseDisposableWorkspaceManifest({ ...validManifest(), digest: "x" });
    expect(badDigest.ok).toBe(false);
    if (!badDigest.ok) expect(badDigest.reasons).toContain("digest_invalid");
    const badFileDigests = parseDisposableWorkspaceManifest({
      ...validManifest(),
      fileDigests: { "a.txt": "zzz" },
    });
    expect(badFileDigests.ok).toBe(false);
    if (!badFileDigests.ok) expect(badFileDigests.reasons).toContain("file_digests_invalid");
  });

  it("rejects malformed exclusion codes", () => {
    const parsed = parseDisposableWorkspaceManifest({ ...validManifest(), exclusionCodes: "x" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reasons).toContain("exclusion_codes_invalid");
  });

  it("accepts null session, digest and fileDigests", () => {
    const manifest = { ...validManifest(), sessionUuid: null, digest: null, fileDigests: null };
    const parsed = parseDisposableWorkspaceManifest(manifest);
    expect(parsed.ok).toBe(true);
  });
});
