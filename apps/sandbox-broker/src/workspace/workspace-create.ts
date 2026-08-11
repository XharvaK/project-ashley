/**
 * Disposable workspace creation boundary (Sandbox Wave 4, Commit 7).
 *
 * `createDisposableWorkspace` is the single entry point that turns an
 * approved source root into a sanitized broker-owned candidate workspace.
 * It requires an autonomous authorization for the
 * `candidate_workspace_create` capability (the broker's delegated
 * authorization result), verifies the source/destination zones from
 * broker-owned facts (realpath, never caller claims), copies the tree with
 * mandatory exclusions under strictest-of ceilings, and writes the
 * broker-owned manifest into the reserved metadata directory next to the
 * candidate tree.
 *
 * Nothing is executed here: no processes, no recipes, no sessions, no
 * route activation. The manifest is evidence of a creation, not an
 * authorization.
 *
 * Failure semantics: any failure before the manifest is durably written
 * removes the partial tree and metadata, so a failed creation leaves no
 * disposable workspace behind.
 */

import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isCanonicalForm,
  type SandboxCapabilityId,
} from "@composer-assistant/sandbox-policy";
import { MAX_WORKSPACE_BYTES } from "../constants/limits.js";
import { sha256Hex } from "../crypto/types.js";
import { classifyBrokerZone } from "../policy/path.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import { RESERVED_BROKER_METADATA_NAME } from "./workspace-exclusions.js";
import { buildWorkspaceBrokerConfig } from "./workspace-config.js";
import { copySanitizedTree, type WorkspaceCopyCounts } from "./workspace-copy.js";
import { buildWorkspaceExclusionSet } from "./workspace-exclusions.js";
import { createDisposableWorkspaceId, isDisposableWorkspaceId } from "./workspace-id.js";
import {
  combineWorkspaceLimits,
  validateDisposableWorkspaceLimits,
  type DisposableWorkspaceLimits,
} from "./workspace-limits.js";
import {
  createDisposableWorkspaceManifest,
  parseDisposableWorkspaceManifest,
  serializeDisposableWorkspaceManifest,
  type DisposableWorkspaceManifest,
} from "./workspace-manifest.js";
import { toCanonicalBrokerPath, toNativeBrokerPath } from "../policy/path.js";

export const CANDIDATE_WORKSPACE_CREATE_CAPABILITY = "candidate_workspace_create";

/**
 * Broker-owned authorization evidence required for a creation. Built by the
 * caller from the broker delegated authorization result plus trusted
 * context; `workspaceBytesMax` is the policy-bounded effective ceiling
 * carried out of the authorization result.
 */
export type DisposableWorkspaceAuthorization = {
  decision: "autonomous_safe";
  capability: SandboxCapabilityId;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  ownerId: string;
  proposalId: string;
  sessionUuid: string | null;
  workspaceBytesMax: number;
};

export type CreateDisposableWorkspaceInput = {
  authorization: DisposableWorkspaceAuthorization;
  rootConfig: BrokerRootConfig;
  /**
   * Broker-resolved source identity id (SANDBOX-ISOLATION-01). When
   * present, selects the source root from `rootConfig.sourceIdentities`
   * and wins over `sourceRoot`; the identity root is never substituted
   * with `readOnlyRoots[0]`. Unknown ids fail closed.
   */
  sourceRootId?: string;
  /** Canonical source root; must classify as a read-only broker zone. */
  sourceRoot?: string;
  /** Canonical destination base; defaults to the sole writable disposable root. */
  destinationRoot?: string;
  /** Request ceilings; may only tighten the broker hard ceilings. */
  limits?: Partial<DisposableWorkspaceLimits>;
  symlinkPolicy?: "skip" | "fail";
  /** Compute per-file SHA-256 digests and an aggregate digest. */
  digests?: boolean;
  nowMs: number;
};

export type CreateDisposableWorkspaceResult =
  | {
      ok: true;
      workspaceId: string;
      treeRoot: string;
      manifestPath: string;
      destinationRoot: string;
      manifest: DisposableWorkspaceManifest;
      counts: WorkspaceCopyCounts;
    }
  | {
      ok: false;
      errorCode: string;
      reason: string;
      cleanupPerformed: boolean;
    };

function isBoundedString(value: unknown, max: number, min = 1): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function validateAuthorization(
  authorization: DisposableWorkspaceAuthorization | undefined,
):
  | { ok: true; value: DisposableWorkspaceAuthorization }
  | { ok: false; errorCode: string; reason: string } {
  if (authorization === undefined) {
    return { ok: false, errorCode: "authorization_required", reason: "no_authorization" };
  }
  if (authorization.decision !== "autonomous_safe") {
    return { ok: false, errorCode: "authorization_required", reason: "decision_not_autonomous_safe" };
  }
  if (authorization.capability !== CANDIDATE_WORKSPACE_CREATE_CAPABILITY) {
    return {
      ok: false,
      errorCode: "authorization_capability_mismatch",
      reason: `capability_${String(authorization.capability)}`,
    };
  }
  if (
    !isBoundedString(authorization.policyId, 256) ||
    !isBoundedString(authorization.ownerId, 128) ||
    !isBoundedString(authorization.proposalId, 128) ||
    (authorization.sessionUuid !== null && !isBoundedString(authorization.sessionUuid, 64)) ||
    typeof authorization.policyVersion !== "number" ||
    !Number.isInteger(authorization.policyVersion) ||
    authorization.policyVersion < 1 ||
    !HASH_PATTERN.test(String(authorization.policyHash ?? "")) ||
    typeof authorization.workspaceBytesMax !== "number" ||
    !Number.isInteger(authorization.workspaceBytesMax) ||
    authorization.workspaceBytesMax < 1 ||
    authorization.workspaceBytesMax > MAX_WORKSPACE_BYTES
  ) {
    return { ok: false, errorCode: "authorization_invalid", reason: "authorization_fields_out_of_bounds" };
  }
  return { ok: true, value: authorization };
}

/**
 * Resolves a canonical root claim through realpath and reclassifies it, so
 * every decision is grounded in broker facts rather than the claim.
 */
function resolveCanonicalRoot(
  canonical: string,
  rootConfig: BrokerRootConfig,
  expectedZone: "read_only" | "writable_disposable",
): { ok: true; canonical: string } | { ok: false; errorCode: string; reason: string } {
  if (!isCanonicalForm(canonical)) {
    return { ok: false, errorCode: "root_not_canonical", reason: canonical };
  }
  let native: string;
  try {
    native = realpathSync(toNativeBrokerPath(canonical));
  } catch {
    return { ok: false, errorCode: "root_missing", reason: canonical };
  }
  let resolvedCanonical: string;
  try {
    const result = toCanonicalBrokerPath(native);
    if (!result.ok) return { ok: false, errorCode: "root_not_canonical", reason: canonical };
    resolvedCanonical = result.value;
  } catch {
    return { ok: false, errorCode: "root_not_canonical", reason: canonical };
  }
  const zone = classifyBrokerZone(resolvedCanonical, rootConfig);
  if (zone === null) {
    return { ok: false, errorCode: "root_outside_configured_roots", reason: canonical };
  }
  if (zone.zone !== expectedZone) {
    const errorCode =
      expectedZone === "read_only" && zone.zone === "protected"
        ? "source_root_protected"
        : expectedZone === "read_only"
          ? "source_root_not_read_only"
          : "destination_root_not_writable_disposable";
    return { ok: false, errorCode, reason: `${zone.zone}:${canonical}` };
  }
  return { ok: true, canonical: resolvedCanonical };
}

/**
 * Resolves the creation source from a bound source identity, an explicit
 * source root, or the single-root fallback (SANDBOX-ISOLATION-01). A bound
 * identity always wins; an unknown id fails closed; without identity or
 * explicit root, exactly one read-only root may exist.
 */
function resolveCreationSource(
  input: CreateDisposableWorkspaceInput,
): {
  ok: true;
  canonical: string;
  sourceIdentity: string | null;
} | { ok: false; errorCode: string; reason: string } {
  if (input.sourceRootId !== undefined) {
    const identityRoot = input.rootConfig.sourceIdentities?.get(input.sourceRootId);
    if (identityRoot === undefined) {
      return {
        ok: false,
        errorCode: "source_root_id_unknown",
        reason: input.sourceRootId,
      };
    }
    return { ok: true, canonical: identityRoot, sourceIdentity: input.sourceRootId };
  }
  if (input.sourceRoot !== undefined) {
    return { ok: true, canonical: input.sourceRoot, sourceIdentity: null };
  }
  const live = input.rootConfig.readOnlyRoots;
  if (live.length !== 1) {
    return {
      ok: false,
      errorCode: "ambiguous_source_root",
      reason: `read_only_roots_${live.length}`,
    };
  }
  return { ok: true, canonical: live[0]!, sourceIdentity: null };
}

/**
 * Creates a sanitized disposable workspace. Requires an autonomous
 * authorization for `candidate_workspace_create`, a read-only source root
 * (identity-bound, explicit, or single-root), and a writable disposable
 * destination root.
 */
export function createDisposableWorkspace(
  input: CreateDisposableWorkspaceInput,
): Promise<CreateDisposableWorkspaceResult> {
  return (async () => {
    if (!Number.isFinite(input.nowMs)) {
      return { ok: false, errorCode: "invalid_clock", reason: "invalid_now_ms", cleanupPerformed: false };
    }
    const auth = validateAuthorization(input.authorization);
    if (!auth.ok) {
      return { ok: false, errorCode: auth.errorCode, reason: auth.reason, cleanupPerformed: false };
    }
    if (input.symlinkPolicy !== undefined && input.symlinkPolicy !== "skip" && input.symlinkPolicy !== "fail") {
      return { ok: false, errorCode: "symlink_policy_invalid", reason: String(input.symlinkPolicy), cleanupPerformed: false };
    }
    const config = buildWorkspaceBrokerConfig(input.rootConfig);
    if (!config.ok) {
      return { ok: false, errorCode: "root_config_invalid", reason: config.reason, cleanupPerformed: false };
    }
    const requestedLimits = validateDisposableWorkspaceLimits(input.limits);
    if (!requestedLimits.ok) {
      return { ok: false, errorCode: "limits_invalid", reason: requestedLimits.reasons.join(","), cleanupPerformed: false };
    }
    const limits = combineWorkspaceLimits(requestedLimits.value, auth.value.workspaceBytesMax);

    const resolvedSource = resolveCreationSource(input);
    if (!resolvedSource.ok) {
      return {
        ok: false,
        errorCode: resolvedSource.errorCode,
        reason: resolvedSource.reason,
        cleanupPerformed: false,
      };
    }
    const source = resolveCanonicalRoot(resolvedSource.canonical, input.rootConfig, "read_only");
    if (!source.ok) {
      const errorCode =
        source.errorCode === "root_missing" ? "source_root_missing" : source.errorCode;
      return { ok: false, errorCode, reason: source.reason, cleanupPerformed: false };
    }
    const effectiveSourceRoot = source.canonical;
    const manifestSourceIdentity = resolvedSource.sourceIdentity;

    let destinationBase: string;
    if (input.destinationRoot !== undefined) {
      const dest = resolveCanonicalRoot(input.destinationRoot, input.rootConfig, "writable_disposable");
      if (!dest.ok) {
        const errorCode =
          dest.errorCode === "root_missing" ? "destination_root_missing" : dest.errorCode;
        return { ok: false, errorCode, reason: dest.reason, cleanupPerformed: false };
      }
      destinationBase = dest.canonical;
    } else {
      const destinations = config.value.destinationRoots;
      if (destinations.length !== 1) {
        return {
          ok: false,
          errorCode: "ambiguous_destination_root",
          reason: `destinations_${destinations.length}`,
          cleanupPerformed: false,
        };
      }
      const dest = resolveCanonicalRoot(destinations[0], input.rootConfig, "writable_disposable");
      if (!dest.ok) {
        const errorCode =
          dest.errorCode === "root_missing" ? "destination_root_missing" : dest.errorCode;
        return { ok: false, errorCode, reason: dest.reason, cleanupPerformed: false };
      }
      destinationBase = dest.canonical;
    }

    const destinationNative = toNativeBrokerPath(destinationBase);
    let destinationIsDir = false;
    try {
      destinationIsDir = lstatSync(destinationNative).isDirectory();
    } catch {
      destinationIsDir = false;
    }
    if (!destinationIsDir) {
      return { ok: false, errorCode: "destination_root_missing", reason: destinationBase, cleanupPerformed: false };
    }

    const workspaceId = createDisposableWorkspaceId();
    const treeRootCanonical = `${destinationBase}/${workspaceId}`;
    const treeRootNative = path.join(destinationNative, workspaceId);
    const metadataDirNative = path.join(destinationNative, RESERVED_BROKER_METADATA_NAME);
    const manifestCanonical = `${destinationBase}/${RESERVED_BROKER_METADATA_NAME}/${workspaceId}.json`;
    const manifestNative = path.join(metadataDirNative, `${workspaceId}.json`);
    const manifestTmpNative = `${manifestNative}.tmp`;

    const cleanupPartial = (): void => {
      try {
        rmSync(treeRootNative, { recursive: true, force: true });
      } catch {
        // best-effort cleanup; the manifest write failure path is still reported
      }
      try {
        rmSync(manifestTmpNative, { force: true });
      } catch {
        // best-effort cleanup
      }
      try {
        rmSync(manifestNative, { force: true });
      } catch {
        // best-effort cleanup
      }
    };

    const failClean = (
      errorCode: string,
      reason: string,
    ): CreateDisposableWorkspaceResult => {
      cleanupPartial();
      return { ok: false, errorCode, reason, cleanupPerformed: true };
    };

    try {
      mkdirSync(treeRootNative, { recursive: false });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return {
        ok: false,
        errorCode: code === "EEXIST" ? "workspace_id_collision" : "destination_mkdir_failed",
        reason: treeRootCanonical,
        cleanupPerformed: false,
      };
    }

    const exclusionSet = buildWorkspaceExclusionSet(
      config.value.protectedRoots,
      effectiveSourceRoot,
    );
    const copy = await copySanitizedTree({
      sourceRoot: toNativeBrokerPath(effectiveSourceRoot),
      destinationRoot: treeRootNative,
      exclusionSet,
      limits,
      symlinkPolicy: input.symlinkPolicy ?? "skip",
      digests: input.digests ?? false,
    });
    if (!copy.ok) {
      return failClean(copy.errorCode, copy.reason);
    }

    const createdAtMs = input.nowMs;
    const expiresAtMs = createdAtMs + limits.ttlMs;
    const manifest = createDisposableWorkspaceManifest({
      workspaceId,
      sourceRoot: effectiveSourceRoot,
      sourceRootId: sha256Hex(effectiveSourceRoot),
      sourceIdentity: manifestSourceIdentity,
      treeRoot: treeRootCanonical,
      metadataPath: manifestCanonical,
      ownerId: auth.value.ownerId,
      proposalId: auth.value.proposalId,
      sessionUuid: auth.value.sessionUuid,
      policyId: auth.value.policyId,
      policyVersion: auth.value.policyVersion,
      policyHash: auth.value.policyHash,
      capabilityId: CANDIDATE_WORKSPACE_CREATE_CAPABILITY,
      createdAtIso: new Date(createdAtMs).toISOString(),
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      limits,
      counts: copy.counts,
      exclusionCodes: [...exclusionSet.codes],
      digest: copy.digest,
      fileDigests: copy.fileDigests,
    });

    try {
      mkdirSync(metadataDirNative, { recursive: true });
      writeFileSync(manifestTmpNative, serializeDisposableWorkspaceManifest(manifest), { encoding: "utf8", flag: "wx" });
      renameSync(manifestTmpNative, manifestNative);
    } catch {
      return failClean("manifest_write_failed", manifestCanonical);
    }

    return {
      ok: true,
      workspaceId,
      treeRoot: treeRootCanonical,
      manifestPath: manifestCanonical,
      destinationRoot: destinationBase,
      manifest,
      counts: copy.counts,
    };
  })();
}

/** Reads and strictly parses a manifest from disk by canonical path. */
export function readDisposableWorkspaceManifest(
  manifestCanonical: string,
): { ok: true; manifest: DisposableWorkspaceManifest } | { ok: false; reason: string } {
  const native = toNativeBrokerPath(manifestCanonical);
  let raw: string;
  try {
    raw = readFileSync(native, "utf8");
  } catch {
    return { ok: false, reason: "manifest_unreadable" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "manifest_not_json" };
  }
  const manifest = parseDisposableWorkspaceManifest(parsed);
  if (!manifest.ok) {
    return { ok: false, reason: manifest.reasons.join(",") };
  }
  return { ok: true, manifest: manifest.manifest };
}

export { isDisposableWorkspaceId };
