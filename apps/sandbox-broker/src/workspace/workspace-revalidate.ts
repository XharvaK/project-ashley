/**
 * Disposable workspace revalidation (Sandbox Wave 4, Commit 7).
 *
 * A workspace reference (trusted ID) is revalidated against broker-owned
 * facts before it is ever used or cleaned up: the ID shape, the manifest's
 * existence and strict parse, the tree's existence, the tree root's exact
 * containment below a configured writable disposable root, the manifest's
 * identity binding, and its expiry. Nothing here authorizes execution; it
 * only establishes that a reference still denotes a live, intact candidate
 * workspace.
 */

import { realpathSync } from "node:fs";
import { isCanonicalForm } from "@composer-assistant/sandbox-policy";
import { buildWorkspaceBrokerConfig } from "./workspace-config.js";
import { isDisposableWorkspaceId } from "./workspace-id.js";
import { readDisposableWorkspaceManifest } from "./workspace-create.js";
import type { DisposableWorkspaceManifest } from "./workspace-manifest.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import { toCanonicalBrokerPath, toNativeBrokerPath } from "../policy/path.js";
import { RESERVED_BROKER_METADATA_NAME } from "./workspace-exclusions.js";

export type WorkspaceLocations = {
  destinationRoot: string;
  treeRoot: string;
  manifestPath: string;
  manifest: DisposableWorkspaceManifest;
};

export type WorkspaceLocationResult =
  | { ok: true; locations: WorkspaceLocations }
  | { ok: false; errorCode: string; reason: string };

/**
 * Locates a workspace by trusted ID across the configured writable
 * disposable roots. The manifest must exist and parse strictly; the tree
 * must exist; the resolved tree must sit exactly at
 * `<destinationRoot>/<workspaceId>`; the manifest must bind to the same
 * ID and tree. Expiry is NOT enforced here so cleanup can remove expired
 * workspaces.
 */
export function locateDisposableWorkspace(
  workspaceId: string,
  rootConfig: BrokerRootConfig,
): WorkspaceLocationResult {
  if (!isDisposableWorkspaceId(workspaceId)) {
    return { ok: false, errorCode: "invalid_workspace_id", reason: "workspace_id_shape_invalid" };
  }
  const config = buildWorkspaceBrokerConfig(rootConfig);
  if (!config.ok) {
    return { ok: false, errorCode: "root_config_invalid", reason: config.reason };
  }
  let found: WorkspaceLocations | null = null;
  for (const destinationRoot of config.value.destinationRoots) {
    if (!isCanonicalForm(destinationRoot)) {
      return { ok: false, errorCode: "root_config_invalid", reason: "destination_root_not_canonical" };
    }
    const manifestCanonical = `${destinationRoot}/${RESERVED_BROKER_METADATA_NAME}/${workspaceId}.json`;
    const manifestResult = readDisposableWorkspaceManifest(manifestCanonical);
    if (!manifestResult.ok) {
      continue;
    }
    const manifest = manifestResult.manifest;
    const treeRoot = `${destinationRoot}/${workspaceId}`;
    const treeNative = toNativeBrokerPath(treeRoot);
    let resolvedTree: string | null = null;
    try {
      const native = realpathSync(treeNative);
      const canonical = toCanonicalBrokerPath(native);
      if (canonical.ok) resolvedTree = canonical.value;
    } catch {
      resolvedTree = null;
    }
    if (resolvedTree === null) {
      return { ok: false, errorCode: "tree_missing", reason: treeRoot };
    }
    if (manifest.workspaceId !== workspaceId) {
      return { ok: false, errorCode: "manifest_identity_mismatch", reason: workspaceId };
    }
    if (manifest.treeRoot !== resolvedTree) {
      return { ok: false, errorCode: "manifest_mismatch", reason: "tree_root_does_not_match_manifest" };
    }
    if (manifest.metadataPath !== manifestCanonical) {
      return { ok: false, errorCode: "manifest_mismatch", reason: "metadata_path_does_not_match" };
    }
    if (found !== null) {
      return { ok: false, errorCode: "ambiguous_workspace", reason: workspaceId };
    }
    found = {
      destinationRoot,
      treeRoot,
      manifestPath: manifestCanonical,
      manifest,
    };
  }
  if (found === null) {
    return { ok: false, errorCode: "workspace_not_found", reason: workspaceId };
  }
  return { ok: true, locations: found };
}

export type RevalidateWorkspaceInput = {
  workspaceId: string;
  rootConfig: BrokerRootConfig;
  nowMs: number;
};

export type RevalidateWorkspaceResult =
  | { ok: true; locations: WorkspaceLocations }
  | { ok: false; errorCode: string; reason: string };

/**
 * Revalidates a workspace reference for use. Adds the expiry check that
 * cleanup intentionally omits.
 */
export function revalidateDisposableWorkspace(
  input: RevalidateWorkspaceInput,
): RevalidateWorkspaceResult {
  if (!Number.isFinite(input.nowMs)) {
    return { ok: false, errorCode: "invalid_clock", reason: "invalid_now_ms" };
  }
  const located = locateDisposableWorkspace(input.workspaceId, input.rootConfig);
  if (!located.ok) {
    return located;
  }
  const expiresMs = Date.parse(located.locations.manifest.expiresAtIso);
  if (!Number.isFinite(expiresMs) || expiresMs <= input.nowMs) {
    return { ok: false, errorCode: "workspace_expired", reason: input.workspaceId };
  }
  const createdAtMs = Date.parse(located.locations.manifest.createdAtIso);
  if (!Number.isFinite(createdAtMs) || createdAtMs > input.nowMs) {
    return { ok: false, errorCode: "manifest_mismatch", reason: "created_at_in_future" };
  }
  return { ok: true, locations: located.locations };
}

/** Path containment guard used before any removal. Never remove a root. */
export function isWorkspaceTreePath(destinationRoot: string, treeRoot: string): boolean {
  const expected = `${destinationRoot.replace(/\/+$/, "")}/${treeRoot.split("/").pop() ?? ""}`;
  return treeRoot === expected && treeRoot.length > destinationRoot.length;
}
