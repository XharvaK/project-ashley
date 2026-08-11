/**
 * Disposable workspace manifests (Sandbox Wave 4, Commit 7).
 *
 * The manifest is the broker-owned record of a creation: identity, source
 * and destination roots, the verified policy identity the creation was
 * authorized under, ownership metadata, limits, exclusion codes, counts,
 * and optional integrity digests. It is written by the broker into the
 * broker-reserved metadata directory (`.ashley-meta`) next to the
 * candidate tree — never inside the tree — and is required for
 * revalidation and cleanup. The manifest is evidence, not authorization:
 * it never grants authority by itself.
 *
 * Parsing is strict and bounded: unknown fields, wrong versions, malformed
 * shapes, and out-of-range values fail closed.
 */

import { isDisposableWorkspaceId } from "./workspace-id.js";

export const DISPOSABLE_WORKSPACE_MANIFEST_VERSION = 1;


export type DisposableWorkspaceManifest = {
  version: 1;
  workspaceId: string;
  sourceRoot: string;
  sourceRootId: string;
  /**
   * Broker-resolved source identity the tree was created from
   * (SANDBOX-ISOLATION-01). Null on legacy single-root creations and
   * pre-v1 manifests; a non-null value is the exact identity id the
   * task bound (never `readOnlyRoots[0]` substitution).
   */
  sourceIdentity: string | null;
  treeRoot: string;
  metadataPath: string;
  ownerId: string;
  proposalId: string;
  sessionUuid: string | null;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  capabilityId: "candidate_workspace_create";
  createdAtIso: string;
  expiresAtIso: string;
  limits: {
    maxFiles: number;
    maxBytes: number;
    maxSingleFileBytes: number;
    maxPathLength: number;
    maxDepth: number;
    maxExcludedEntries: number;
    ttlMs: number;
  };
  counts: {
    files: number;
    directories: number;
    excluded: number;
    bytes: number;
    skippedSymlinks: number;
    hardLinkedFiles: number;
    specialFiles: number;
    privilegedFiles: number;
    caseCollisions: number;
  };
  exclusionCodes: string[];
  digest: string | null;
  fileDigests: Record<string, string> | null;
};

export function createDisposableWorkspaceManifest(
  fields: Omit<DisposableWorkspaceManifest, "version">,
): DisposableWorkspaceManifest {
  return { version: 1, ...fields };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number, min = 1): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_IDENTITY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type WorkspaceManifestParseResult =
  | { ok: true; manifest: DisposableWorkspaceManifest }
  | { ok: false; reasons: string[] };

/**
 * Strict structural validation of a serialized manifest. Any unsupported
 * field or out-of-bounds value is rejected.
 */
export function parseDisposableWorkspaceManifest(value: unknown): WorkspaceManifestParseResult {
  const reasons: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, reasons: ["manifest_not_an_object"] };
  }
  const allowed = new Set([
    "version",
    "workspaceId",
    "sourceRoot",
    "sourceRootId",
    "sourceIdentity",
    "treeRoot",
    "metadataPath",
    "ownerId",
    "proposalId",
    "sessionUuid",
    "policyId",
    "policyVersion",
    "policyHash",
    "capabilityId",
    "createdAtIso",
    "expiresAtIso",
    "limits",
    "counts",
    "exclusionCodes",
    "digest",
    "fileDigests",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) reasons.push(`unsupported_field:${key}`);
  }
  if (value.version !== DISPOSABLE_WORKSPACE_MANIFEST_VERSION) {
    reasons.push("manifest_version_must_be_1");
  }
  if (!isDisposableWorkspaceId(value.workspaceId)) {
    reasons.push("workspace_id_invalid");
  }
  if (!isBoundedString(value.sourceRoot, 4096)) reasons.push("source_root_invalid");
  if (!HASH_PATTERN.test(String(value.sourceRootId ?? ""))) {
    reasons.push("source_root_id_invalid");
  }
  if (
    value.sourceIdentity !== undefined &&
    value.sourceIdentity !== null &&
    !SOURCE_IDENTITY_PATTERN.test(String(value.sourceIdentity))
  ) {
    reasons.push("source_identity_invalid");
  }
  if (!isBoundedString(value.treeRoot, 4096)) reasons.push("tree_root_invalid");
  if (!isBoundedString(value.metadataPath, 4096)) reasons.push("metadata_path_invalid");
  if (!isBoundedString(value.ownerId, 128)) reasons.push("owner_id_invalid");
  if (!isBoundedString(value.proposalId, 128)) reasons.push("proposal_id_invalid");
  if (
    value.sessionUuid !== null &&
    !isBoundedString(value.sessionUuid, 64)
  ) {
    reasons.push("session_uuid_invalid");
  }
  if (!isBoundedString(value.policyId, 256)) reasons.push("policy_id_invalid");
  if (!isPositiveInteger(value.policyVersion)) reasons.push("policy_version_invalid");
  if (!HASH_PATTERN.test(String(value.policyHash ?? ""))) reasons.push("policy_hash_invalid");
  if (value.capabilityId !== "candidate_workspace_create") {
    reasons.push("capability_id_invalid");
  }
  if (!isBoundedString(value.createdAtIso, 64) || !ISO_PATTERN.test(String(value.createdAtIso))) {
    reasons.push("created_at_invalid");
  }
  if (!isBoundedString(value.expiresAtIso, 64) || !ISO_PATTERN.test(String(value.expiresAtIso))) {
    reasons.push("expires_at_invalid");
  }
  const limits = isRecord(value.limits) ? value.limits : null;
  if (limits === null) {
    reasons.push("limits_required");
  } else {
    const limitFields = [
      "maxFiles",
      "maxBytes",
      "maxSingleFileBytes",
      "maxPathLength",
      "maxDepth",
      "maxExcludedEntries",
      "ttlMs",
    ];
    for (const field of limitFields) {
      if (!isPositiveInteger(limits[field])) reasons.push(`limits_${field}_invalid`);
    }
  }
  const counts = isRecord(value.counts) ? value.counts : null;
  if (counts === null) {
    reasons.push("counts_required");
  } else {
    const countFields = [
      "files",
      "directories",
      "excluded",
      "bytes",
      "skippedSymlinks",
      "hardLinkedFiles",
      "specialFiles",
      "privilegedFiles",
      "caseCollisions",
    ];
    for (const field of countFields) {
      if (!isNonNegativeInteger(counts[field])) reasons.push(`counts_${field}_invalid`);
    }
  }
  if (
    !Array.isArray(value.exclusionCodes) ||
    !value.exclusionCodes.every((code) => isBoundedString(code, 128))
  ) {
    reasons.push("exclusion_codes_invalid");
  }
  if (value.digest !== null && !HASH_PATTERN.test(String(value.digest ?? ""))) {
    reasons.push("digest_invalid");
  }
  if (value.fileDigests !== null) {
    if (!isRecord(value.fileDigests)) {
      reasons.push("file_digests_invalid");
    } else {
      for (const [rel, hash] of Object.entries(value.fileDigests)) {
        if (rel.length === 0 || rel.length > 4096 || !HASH_PATTERN.test(String(hash))) {
          reasons.push("file_digests_invalid");
          break;
        }
      }
    }
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    manifest: {
      ...(value as unknown as DisposableWorkspaceManifest),
      sourceIdentity: (value.sourceIdentity as string | null | undefined) ?? null,
    },
  };
}

export function serializeDisposableWorkspaceManifest(
  manifest: DisposableWorkspaceManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
