import {
  canonicalizeSandboxPolicyPayload,
  validateSandboxPolicyDocument,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";

export const R4004_POLICY_ID = "pol-production-r4-004";
export const R4004_POLICY_VERSION = 4;
export const R4005_POLICY_ID = "pol-production-r4-005";
export const R4005_POLICY_VERSION = 5;

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
