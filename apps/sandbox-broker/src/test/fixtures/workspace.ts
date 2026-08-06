/**
 * Disposable workspace test fixtures (Sandbox Wave 4, Commit 7).
 *
 * Synthetic source and destination roots are created under the OS temp
 * directory and mapped to broker-canonical form, mirroring production
 * (where the broker resolves the active policy roots through realpath).
 * The real Ashley checkout is never used as a source root.
 */

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { toCanonicalBrokerPath } from "../../policy/path.js";
import type { BrokerRootConfig } from "../../policy/root-config.js";
import type { ProtectedRootsConfig } from "@composer-assistant/sandbox-policy";
import type { DisposableWorkspaceAuthorization } from "../../workspace/workspace-create.js";
import { MAX_WORKSPACE_BYTES } from "../../constants/limits.js";

export function canonicalTempRoot(prefix: string): string {
  const native = mkdtempSync(path.join(tmpdir(), prefix));
  const result = toCanonicalBrokerPath(native);
  if (!result.ok) throw new Error(`temp_root_not_canonical:${native}`);
  return result.value;
}

function canon(native: string): string {
  const result = toCanonicalBrokerPath(native);
  if (!result.ok) throw new Error(`path_not_canonical:${native}`);
  return result.value;
}

export type WorkspaceTestRoots = {
  base: string;
  sourceRoot: string;
  destinationRoot: string;
  protectedRoots: ProtectedRootsConfig;
  rootConfig: BrokerRootConfig;
};

export function makeWorkspaceTestRoots(
  overrides: {
    protectedRoots?: ProtectedRootsConfig;
    extraDestinationRoot?: string;
  } = {},
): WorkspaceTestRoots {
  const base = mkdtempSync(path.join(tmpdir(), "ashley-workspace-"));
  const sourceNative = path.join(base, "source");
  const destNative = path.join(base, "dest");
  mkdirSync(sourceNative, { recursive: true });
  mkdirSync(destNative, { recursive: true });
  const sourceRoot = canon(sourceNative);
  const destinationRoot = canon(destNative);
  const writableDisposableRoots = [destinationRoot];
  if (overrides.extraDestinationRoot !== undefined) {
    const extra = mkdtempSync(path.join(tmpdir(), "ashley-workspace-"));
    writableDisposableRoots.push(canon(extra));
  }
  const rootConfig: BrokerRootConfig = {
    workspaceRoot: canon(base),
    readOnlyRoots: [sourceRoot],
    writableDisposableRoots,
    protectedRoots:
      overrides.protectedRoots ?? {
        delegatedWriteDeniedOwnerApprovable: [],
        absoluteDenial: [],
      },
  };
  return {
    base,
    sourceRoot,
    destinationRoot,
    protectedRoots: rootConfig.protectedRoots,
    rootConfig,
  };
}

export function makeWorkspaceAuthorization(
  overrides: Partial<DisposableWorkspaceAuthorization> = {},
): DisposableWorkspaceAuthorization {
  return {
    decision: "autonomous_safe",
    capability: "candidate_workspace_create",
    policyId: "test-policy-1",
    policyVersion: 1,
    policyHash: "a".repeat(64),
    ownerId: "owner-1",
    proposalId: "prop-1",
    sessionUuid: null,
    workspaceBytesMax: MAX_WORKSPACE_BYTES,
    ...overrides,
  };
}
