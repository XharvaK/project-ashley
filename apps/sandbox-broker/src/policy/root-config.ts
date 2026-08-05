/**
 * Broker canonical root configuration (Sandbox Wave 4, Commit 6).
 *
 * The broker never authorizes against envelope claims or unvalidated policy
 * strings: it builds its own canonical root configuration from verified
 * roots and validates that configuration before any path resolution. In
 * production the roots are the `realpath`-resolved forms of the active
 * policy's roots; this module validates shape, canonicality, uniqueness,
 * and cross-class overlap conflicts. All roots use the shared POSIX-canonical
 * path form so containment and classification stay deterministic.
 */

import {
  isCanonicalForm,
  isWithin,
  type ProtectedRootsConfig,
} from "@composer-assistant/sandbox-policy";

export type BrokerRootConfig = {
  workspaceRoot: string;
  readOnlyRoots: readonly string[];
  writableDisposableRoots: readonly string[];
  protectedRoots: ProtectedRootsConfig;
};

export type BrokerRootConfigResult =
  | { ok: true; value: BrokerRootConfig }
  | { ok: false; reasons: string[] };

function canonicalUniqueList(
  values: readonly string[] | undefined,
  label: string,
  reasons: string[],
  seen: Set<string>,
): boolean {
  if (!Array.isArray(values)) {
    reasons.push(`${label}_required`);
    return false;
  }
  let valid = true;
  for (const entry of values) {
    if (typeof entry !== "string" || !isCanonicalForm(entry)) {
      reasons.push(`${label}_not_canonical:${String(entry)}`);
      valid = false;
      continue;
    }
    if (seen.has(entry)) {
      reasons.push(`${label}_duplicate:${entry}`);
      valid = false;
      continue;
    }
    seen.add(entry);
  }
  return valid;
}

function canonicalProtectedConfig(
  protectedRoots: ProtectedRootsConfig | undefined,
  reasons: string[],
): boolean {
  if (
    !protectedRoots ||
    !Array.isArray(protectedRoots.delegatedWriteDeniedOwnerApprovable) ||
    !Array.isArray(protectedRoots.absoluteDenial)
  ) {
    reasons.push("protected_roots_required");
    return false;
  }
  let valid = true;
  const seen = new Set<string>();
  valid =
    canonicalUniqueList(
      protectedRoots.delegatedWriteDeniedOwnerApprovable,
      "owner_approvable_protected_root",
      reasons,
      seen,
    ) && valid;
  valid =
    canonicalUniqueList(
      protectedRoots.absoluteDenial,
      "absolute_denial_protected_root",
      reasons,
      seen,
    ) && valid;
  return valid;
}

function overlap(a: string, b: string): boolean {
  return isWithin(a, b) || isWithin(b, a);
}

/**
 * Validates an injected canonical root configuration. Rejects non-canonical
 * or duplicated roots and any cross-class overlap: a path may never sit
 * under roots with conflicting authorization semantics.
 */
export function validateBrokerRootConfig(input: {
  workspaceRoot: string;
  readOnlyRoots: readonly string[];
  writableDisposableRoots: readonly string[];
  protectedRoots: ProtectedRootsConfig;
}): BrokerRootConfigResult {
  const reasons: string[] = [];
  if (!isCanonicalForm(input.workspaceRoot)) {
    reasons.push("workspace_root_not_canonical");
  }
  const seenRead = new Set<string>();
  const seenWrite = new Set<string>();
  const readValid = canonicalUniqueList(
    input.readOnlyRoots,
    "read_only_root",
    reasons,
    seenRead,
  );
  const writeValid = canonicalUniqueList(
    input.writableDisposableRoots,
    "writable_disposable_root",
    reasons,
    seenWrite,
  );
  const protectedValid = canonicalProtectedConfig(input.protectedRoots, reasons);

  if (readValid && writeValid) {
    for (const read of input.readOnlyRoots) {
      for (const write of input.writableDisposableRoots) {
        if (overlap(read, write)) {
          reasons.push(`read_write_root_overlap:${read}:${write}`);
        }
      }
    }
  }
  if (protectedValid) {
    const protectedPaths = [
      ...input.protectedRoots.delegatedWriteDeniedOwnerApprovable,
      ...input.protectedRoots.absoluteDenial,
    ];
    for (const protectedPath of protectedPaths) {
      for (const read of input.readOnlyRoots) {
        if (overlap(read, protectedPath)) {
          reasons.push(`protected_overlaps_read_root:${protectedPath}:${read}`);
        }
      }
      for (const write of input.writableDisposableRoots) {
        if (overlap(write, protectedPath)) {
          reasons.push(`protected_overlaps_disposable_root:${protectedPath}:${write}`);
        }
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return {
    ok: true,
    value: {
      workspaceRoot: input.workspaceRoot,
      readOnlyRoots: [...input.readOnlyRoots],
      writableDisposableRoots: [...input.writableDisposableRoots],
      protectedRoots: {
        delegatedWriteDeniedOwnerApprovable: [
          ...input.protectedRoots.delegatedWriteDeniedOwnerApprovable,
        ],
        absoluteDenial: [...input.protectedRoots.absoluteDenial],
      },
    },
  };
}
