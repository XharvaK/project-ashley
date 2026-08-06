/**
 * Disposable workspace cleanup (Sandbox Wave 4, Commit 7).
 *
 * Explicit removal of a disposable workspace by trusted ID. Cleanup
 * re-locates the workspace through the same broker-owned facts as
 * revalidation, then removes exactly the candidate tree and its manifest.
 * Expiry is intentionally NOT enforced: expired workspaces must still be
 * removable. Removal is confined to the matched tree path below a
 * configured writable disposable root — the destination root itself can
 * never be a removal target.
 */

import { rmSync } from "node:fs";
import { locateDisposableWorkspace, isWorkspaceTreePath } from "./workspace-revalidate.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import { toNativeBrokerPath } from "../policy/path.js";

export type CleanupWorkspaceInput = {
  workspaceId: string;
  rootConfig: BrokerRootConfig;
};

export type CleanupWorkspaceResult =
  | {
      ok: true;
      removedTree: boolean;
      removedManifest: boolean;
      treeRoot: string;
      manifestPath: string;
    }
  | { ok: false; errorCode: string; reason: string };

/**
 * Removes the candidate tree and manifest of a disposable workspace.
 * Fails closed when the reference does not resolve to an intact workspace
 * or when the resolved tree path escapes its destination root.
 */
export function cleanupDisposableWorkspace(
  input: CleanupWorkspaceInput,
): CleanupWorkspaceResult {
  const located = locateDisposableWorkspace(input.workspaceId, input.rootConfig);
  if (!located.ok) {
    return { ok: false, errorCode: located.errorCode, reason: located.reason };
  }
  const { destinationRoot, treeRoot, manifestPath } = located.locations;
  if (!isWorkspaceTreePath(destinationRoot, treeRoot)) {
    return { ok: false, errorCode: "containment_failed", reason: treeRoot };
  }
  let removedTree = false;
  let removedManifest = false;
  try {
    rmSync(toNativeBrokerPath(treeRoot), { recursive: true, force: true });
    removedTree = true;
  } catch {
    removedTree = false;
  }
  try {
    rmSync(toNativeBrokerPath(manifestPath), { force: true });
    removedManifest = true;
  } catch {
    removedManifest = false;
  }
  return {
    ok: true,
    removedTree,
    removedManifest,
    treeRoot,
    manifestPath,
  };
}
