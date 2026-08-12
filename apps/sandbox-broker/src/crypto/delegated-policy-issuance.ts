import {
  canonicalizeSandboxPolicyPayload,
  validateSandboxPolicyDocument,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";

export const R4004_POLICY_ID = "pol-production-r4-004";
export const R4004_POLICY_VERSION = 4;
export const R4005_POLICY_ID = "pol-production-r4-005";
export const R4005_POLICY_VERSION = 5;
export const R4006_POLICY_ID = "pol-production-r4-006";
export const R4006_POLICY_VERSION = 6;

/**
 * Hard ceiling on an R4-006 validity window. The preparation API requires an
 * explicit owner expiry decision; this bound rejects effectively-indefinite
 * policies so a single issued artifact can never silently authorize autonomy
 * forever.
 */
export const R4006_MAX_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * The exact minimal new delegated-safe engineering capability set authorized
 * for R4-006. These are the only capabilities `prepareR4006Policy` may add; any
 * other capability delta is refused. Owner-approval and absolute-denial
 * capabilities are preserved verbatim from the source R4-005 policy.
 */
export const R4006_ENGINEERING_CAPABILITIES: readonly string[] = [
  "engineering_project_read",
  "candidate_repository_git_write",
  "ashley_agent_service_restart",
  "candidate_workspace_create",
  "candidate_workspace_read_write_delete",
  "candidate_patch_generate",
  "candidate_report_artifact_generate",
  "fixed_test_recipe",
  "fixed_build_recipe",
  "fixed_lint_verification_recipe",
  "bounded_diagnostic_execution",
  "local_health_status_inspection",
];

/**
 * Fixed recipes the engineering workstation drives (build/test/git/patch).
 * Kept as a literal allowlist (not imported from the recipe registry) to avoid
 * pulling the execution/diagnostics import closure into the policy-issuance
 * module, which the broker's qualification harness pins.
 */
export const R4006_ENGINEERING_RECIPE_IDS: readonly string[] = [
  "verify:agent-tsc",
  "verify:sandbox-broker-tsc",
  "test:agent-vitest",
  "test:sandbox-broker-vitest",
  "git:status",
  "git:diff",
  "git:log",
  "git:rev-parse",
  "patch:generate",
];

/** Bounded host-defined diagnostic executables permitted under R4-006. */
export const R4006_ENGINEERING_EXECUTABLE_IDS: readonly string[] = [
  "true",
  "git",
  "df",
  "free",
  "uptime",
  "systemctl",
  "du",
];

function unionUnique(base: readonly string[], additions: readonly string[]): string[] {
  const seen = new Set(base);
  const out = [...base];
  for (const item of additions) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

const LIFECYCLE_NEUTRAL_ISSUED_AT = "2000-01-01T00:00:00.000Z";
const LIFECYCLE_NEUTRAL_EXPIRES_AT = "2000-01-02T00:00:00.000Z";

export type R4005PolicyPreparationOptions = {
  issuedAt: string | number;
  expiresAt?: string | number;
};

export type R4005PolicyPreparationResult =
  | {
      ok: true;
      policy: SandboxPolicyDocument;
      lifetimeMs: number;
      lifetimeSource: "source_policy" | "explicit_owner_decision";
    }
  | {
      ok: false;
      reason:
        | "source_policy_invalid"
        | "source_policy_identity_invalid"
        | "policy_issued_at_invalid"
        | "policy_expiry_invalid"
        | "policy_lifetime_decision_required"
        | "policy_expiry_widening"
        | "policy_authority_changed"
        | "prepared_policy_invalid";
      details?: readonly string[];
    };

function parseTime(value: string | number): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && Number.isFinite(value) ? value : undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoTime(value: string | number): string | undefined {
  const parsed = parseTime(value);
  return parsed === undefined ? undefined : new Date(parsed).toISOString();
}

function lifecycleNeutralPolicy(policy: SandboxPolicyDocument): SandboxPolicyDocument {
  return {
    ...policy,
    policyId: "lifecycle-neutral",
    policyVersion: 1,
    issuedAt: LIFECYCLE_NEUTRAL_ISSUED_AT,
    expiresAt: LIFECYCLE_NEUTRAL_EXPIRES_AT,
  };
}

function authorityFingerprint(policy: SandboxPolicyDocument): string | undefined {
  const canonical = canonicalizeSandboxPolicyPayload(lifecycleNeutralPolicy(policy));
  return canonical.ok ? canonical.payload : undefined;
}

export function prepareR4005Policy(
  sourcePolicy: unknown,
  options: R4005PolicyPreparationOptions,
): R4005PolicyPreparationResult {
  const sourceValidation = validateSandboxPolicyDocument(sourcePolicy);
  if (!sourceValidation.ok) {
    return { ok: false, reason: "source_policy_invalid", details: sourceValidation.reasons };
  }
  const source = sourceValidation.policy;
  if (
    source.policyId !== R4004_POLICY_ID ||
    source.policyVersion !== R4004_POLICY_VERSION
  ) {
    return { ok: false, reason: "source_policy_identity_invalid" };
  }

  const issuedAt = isoTime(options.issuedAt);
  if (issuedAt === undefined) {
    return { ok: false, reason: "policy_issued_at_invalid" };
  }
  const issuedAtMs = Date.parse(issuedAt);
  const sourceIssuedAtMs = Date.parse(source.issuedAt);
  const sourceExpiresAtMs =
    source.expiresAt === undefined ? undefined : Date.parse(source.expiresAt);
  const sourceLifetimeMs =
    sourceExpiresAtMs === undefined ? undefined : sourceExpiresAtMs - sourceIssuedAtMs;

  let expiresAt: string;
  let lifetimeMs: number;
  let lifetimeSource: "source_policy" | "explicit_owner_decision";
  if (options.expiresAt === undefined) {
    if (sourceLifetimeMs === undefined || sourceLifetimeMs <= 0) {
      return { ok: false, reason: "policy_lifetime_decision_required" };
    }
    lifetimeMs = sourceLifetimeMs;
    expiresAt = new Date(issuedAtMs + lifetimeMs).toISOString();
    lifetimeSource = "source_policy";
  } else {
    const explicitExpiresAt = isoTime(options.expiresAt);
    if (explicitExpiresAt === undefined) {
      return { ok: false, reason: "policy_expiry_invalid" };
    }
    const explicitExpiresAtMs = Date.parse(explicitExpiresAt);
    lifetimeMs = explicitExpiresAtMs - issuedAtMs;
    if (lifetimeMs <= 0) {
      return { ok: false, reason: "policy_expiry_invalid" };
    }
    if (sourceLifetimeMs !== undefined && lifetimeMs > sourceLifetimeMs) {
      return { ok: false, reason: "policy_expiry_widening" };
    }
    expiresAt = explicitExpiresAt;
    lifetimeSource = "explicit_owner_decision";
  }

  const prepared: SandboxPolicyDocument = {
    ...source,
    policyId: R4005_POLICY_ID,
    policyVersion: R4005_POLICY_VERSION,
    issuedAt,
    expiresAt,
  };
  const preparedValidation = validateSandboxPolicyDocument(prepared);
  if (!preparedValidation.ok) {
    return {
      ok: false,
      reason: "prepared_policy_invalid",
      details: preparedValidation.reasons,
    };
  }
  const sourceFingerprint = authorityFingerprint(source);
  const preparedFingerprint = authorityFingerprint(preparedValidation.policy);
  if (sourceFingerprint === undefined || preparedFingerprint === undefined) {
    return { ok: false, reason: "policy_authority_changed" };
  }
  if (sourceFingerprint !== preparedFingerprint) {
    return { ok: false, reason: "policy_authority_changed" };
  }
  return {
    ok: true,
    policy: preparedValidation.policy,
    lifetimeMs,
    lifetimeSource,
  };
}

export type R4006PolicyPreparationOptions = {
  /**
   * Owner explicit expiry decision. Required: an R4-006 policy must never be
   * prepared with a silent or indefinite lifetime. The first owner-issued
   * artifact uses a 30-day window, but any explicit expiry is accepted up to
   * `R4006_MAX_LIFETIME_MS`.
   */
  issuedAt: string | number;
  expiresAt: string | number;
};

export type R4006PolicyPreparationResult =
  | {
      ok: true;
      policy: SandboxPolicyDocument;
      lifetimeMs: number;
      lifetimeSource: "explicit_owner_decision";
    }
  | {
      ok: false;
      reason:
        | "source_policy_invalid"
        | "source_policy_identity_invalid"
        | "policy_issued_at_invalid"
        | "policy_expiry_required"
        | "policy_expiry_invalid"
        | "policy_expiry_indefinite"
        | "policy_lifetime_decision_required"
        | "policy_capability_delta_unauthorized"
        | "prepared_policy_invalid";
      details?: readonly string[];
    };

/**
 * Prepare the R4-006 autonomous-engineering production policy.
 *
 * Derives from the staged R4-005 policy (identity-validated) and adds exactly
 * the minimal delegated-safe engineering capability set authorized for the
 * Autonomous Engineering Workstation, together with the fixed recipes and
 * bounded diagnostic executables those capabilities require. Owner-approval and
 * absolute-denial capabilities, protected roots, and network posture are
 * preserved verbatim from the source. The lifetime is an explicit owner
 * decision and is hard-capped to prevent effectively-indefinite autonomy.
 *
 * This function prepares (but does NOT sign) the policy payload. Signing and
 * staging remain owner actions after the source pass.
 */
export function prepareR4006Policy(
  sourcePolicy: unknown,
  options: R4006PolicyPreparationOptions,
): R4006PolicyPreparationResult {
  const sourceValidation = validateSandboxPolicyDocument(sourcePolicy);
  if (!sourceValidation.ok) {
    return { ok: false, reason: "source_policy_invalid", details: sourceValidation.reasons };
  }
  const source = sourceValidation.policy;
  if (
    source.policyId !== R4005_POLICY_ID ||
    source.policyVersion !== R4005_POLICY_VERSION
  ) {
    return { ok: false, reason: "source_policy_identity_invalid" };
  }

  const issuedAt = isoTime(options.issuedAt);
  if (issuedAt === undefined) {
    return { ok: false, reason: "policy_issued_at_invalid" };
  }
  if (options.expiresAt === undefined) {
    return { ok: false, reason: "policy_lifetime_decision_required" };
  }
  const expiresAt = isoTime(options.expiresAt);
  if (expiresAt === undefined) {
    return { ok: false, reason: "policy_expiry_invalid" };
  }
  const lifetimeMs = Date.parse(expiresAt) - Date.parse(issuedAt);
  if (lifetimeMs <= 0) {
    return { ok: false, reason: "policy_expiry_invalid" };
  }
  if (lifetimeMs > R4006_MAX_LIFETIME_MS) {
    return { ok: false, reason: "policy_expiry_indefinite" };
  }

  const allowedCapabilities = unionUnique(
    source.allowedCapabilities,
    R4006_ENGINEERING_CAPABILITIES,
  );
  const allowedRecipeIds = unionUnique(
    source.allowedRecipeIds,
    R4006_ENGINEERING_RECIPE_IDS,
  );
  const allowedExecutableIds = unionUnique(
    source.allowedExecutableIds,
    R4006_ENGINEERING_EXECUTABLE_IDS,
  );

  // The only permitted capability delta is the approved engineering set; refuse
  // any other capability appearing that was not in the source and is not in the
  // approved set.
  const approved = new Set<string>(R4006_ENGINEERING_CAPABILITIES);
  const sourceCaps = new Set<string>(source.allowedCapabilities);
  for (const cap of allowedCapabilities) {
    if (!sourceCaps.has(cap) && !approved.has(cap)) {
      return {
        ok: false,
        reason: "policy_capability_delta_unauthorized",
        details: [cap],
      };
    }
  }

  const prepared: SandboxPolicyDocument = {
    ...source,
    policyId: R4006_POLICY_ID,
    policyVersion: R4006_POLICY_VERSION,
    issuedAt,
    expiresAt,
    allowedCapabilities: allowedCapabilities as SandboxPolicyDocument["allowedCapabilities"],
    allowedRecipeIds: allowedRecipeIds as SandboxPolicyDocument["allowedRecipeIds"],
    allowedExecutableIds: allowedExecutableIds as SandboxPolicyDocument["allowedExecutableIds"],
  };
  const preparedValidation = validateSandboxPolicyDocument(prepared);
  if (!preparedValidation.ok) {
    return {
      ok: false,
      reason: "prepared_policy_invalid",
      details: preparedValidation.reasons,
    };
  }
  return {
    ok: true,
    policy: preparedValidation.policy,
    lifetimeMs,
    lifetimeSource: "explicit_owner_decision",
  };
}
