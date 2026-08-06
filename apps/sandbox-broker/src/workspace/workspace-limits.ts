/**
 * Disposable workspace limits (Sandbox Wave 4, Commit 7).
 *
 * Every disposable workspace copy is bounded by a strictest-of combination:
 * broker hard ceilings (fixed constants), the active policy resource
 * ceilings (workspaceBytesMax from the verified policy), and the request's
 * own ceilings. A request may only tighten a ceiling, never loosen it.
 * Ceiling violations fail the copy incrementally, before and during
 * traversal, so a hostile or accidental source tree can never exhaust disk,
 * inodes, or scan time.
 */

export type DisposableWorkspaceLimits = {
  /** Maximum number of regular files copied. */
  maxFiles: number;
  /** Maximum total bytes of copied file content. */
  maxBytes: number;
  /** Maximum bytes of a single copied file. */
  maxSingleFileBytes: number;
  /** Maximum characters of a relative path below the source root. */
  maxPathLength: number;
  /** Maximum depth in segments below the source root. */
  maxDepth: number;
  /** Maximum number of excluded entries the traversal may record. */
  maxExcludedEntries: number;
  /** Lifetime of the workspace in milliseconds; expiry is enforced on revalidation. */
  ttlMs: number;
};

/** Broker hard ceilings. Never raised by a request or a policy. */
export const DISPOSABLE_WORKSPACE_HARD_LIMITS: DisposableWorkspaceLimits = {
  maxFiles: 10_000,
  maxBytes: 100 * 1_024 * 1_024,
  maxSingleFileBytes: 25 * 1_024 * 1_024,
  maxPathLength: 1_024,
  maxDepth: 32,
  maxExcludedEntries: 20_000,
  ttlMs: 24 * 60 * 60 * 1000,
};

/** Maximum accepted TTL for a disposable workspace. */
export const DISPOSABLE_WORKSPACE_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkspaceLimitsValidation =
  | { ok: true; value: DisposableWorkspaceLimits }
  | { ok: false; reasons: string[] };

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Validates caller-supplied limits: every field must be a positive integer
 * and never exceed the broker hard ceiling for that field.
 */
export function validateDisposableWorkspaceLimits(
  input: Partial<DisposableWorkspaceLimits> | undefined,
): WorkspaceLimitsValidation {
  const reasons: string[] = [];
  if (input === undefined) {
    return { ok: true, value: { ...DISPOSABLE_WORKSPACE_HARD_LIMITS } };
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, reasons: ["limits_not_an_object"] };
  }
  const fields: Array<keyof DisposableWorkspaceLimits> = [
    "maxFiles",
    "maxBytes",
    "maxSingleFileBytes",
    "maxPathLength",
    "maxDepth",
    "maxExcludedEntries",
    "ttlMs",
  ];
  const value: DisposableWorkspaceLimits = { ...DISPOSABLE_WORKSPACE_HARD_LIMITS };
  for (const field of fields) {
    const entry = input[field];
    if (entry === undefined) continue;
    if (!isPositiveInteger(entry)) {
      reasons.push(`${field}_invalid`);
      continue;
    }
    const ceiling = DISPOSABLE_WORKSPACE_HARD_LIMITS[field];
    if (field === "ttlMs" && entry > DISPOSABLE_WORKSPACE_MAX_TTL_MS) {
      reasons.push("ttl_ms_exceeds_hard_ceiling");
      continue;
    }
    if (entry > ceiling) {
      reasons.push(`${field}_exceeds_hard_ceiling`);
      continue;
    }
    value[field] = entry;
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, value };
}

/**
 * Effective limits for a creation: broker hard ceilings combined with the
 * verified active policy ceiling and the request ceilings, taking the
 * strictest bound of each dimension.
 */
export function combineWorkspaceLimits(
  request: DisposableWorkspaceLimits,
  policyWorkspaceBytesMax: number,
): DisposableWorkspaceLimits {
  return {
    ...request,
    maxBytes: Math.min(request.maxBytes, policyWorkspaceBytesMax),
  };
}
