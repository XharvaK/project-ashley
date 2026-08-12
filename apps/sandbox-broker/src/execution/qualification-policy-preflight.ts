import { readFileSync } from "node:fs";
import type { KeyObject } from "node:crypto";
import { isAbsolute } from "node:path";
import {
  loadVerifiedDelegatedPolicy,
  ownerPolicyKeyFromPem,
  type DelegatedPolicyLoadResult,
} from "../crypto/delegated-policy.js";

export type QualificationPolicyPreflightOptions = {
  enabled: boolean;
  artifactPath: string;
  signaturePath: string;
  ownerPublicKeyPath: string;
  ownerKeyId: string;
  nowMs: number;
};

export type QualificationPolicyPreflightResult =
  | {
      status: "disabled";
      reason: "delegated_runtime_disabled";
      nowMs: number;
    }
  | {
      status: "valid";
      policyId: string;
      policyVersion: number;
      issuedAt: string;
      expiresAt: string | null;
      policyHash: string;
      signerKeyId: string;
      nowMs: number;
    }
  | {
      status: "blocked";
      reason:
        | "delegated_policy_expired"
        | "delegated_policy_missing"
        | "delegated_policy_invalid"
        | "delegated_policy_configuration_invalid";
      error: string;
      verifierReason: string;
      nowMs: number;
      policyId?: string;
      policyVersion?: number;
      issuedAt?: string;
      expiresAt?: string;
    };

function blocked(
  reason: Extract<QualificationPolicyPreflightResult, { status: "blocked" }>["reason"],
  error: string,
  verifierReason: string,
  nowMs: number,
  metadata?: {
    policyId: string;
    policyVersion: number;
    issuedAt: string;
    expiresAt?: string;
  },
): QualificationPolicyPreflightResult {
  return {
    status: "blocked",
    reason,
    error,
    verifierReason,
    nowMs,
    ...(metadata === undefined ? {} : metadata),
  };
}

function blockedFromLoad(
  loaded: Extract<DelegatedPolicyLoadResult, { ok: false }>,
  nowMs: number,
): QualificationPolicyPreflightResult {
  const reason =
    loaded.error === "policy_expired"
      ? "delegated_policy_expired"
      : loaded.error === "artifact_missing" || loaded.error === "signature_missing"
        ? "delegated_policy_missing"
        : "delegated_policy_invalid";
  return blocked(reason, loaded.error, loaded.reason, nowMs, loaded.metadata);
}

export function runQualificationPolicyPreflight(
  options: QualificationPolicyPreflightOptions,
): QualificationPolicyPreflightResult {
  if (!Number.isFinite(options.nowMs)) {
    return blocked(
      "delegated_policy_configuration_invalid",
      "clock_invalid",
      "now_ms_invalid",
      options.nowMs,
    );
  }
  if (!options.enabled) {
    return {
      status: "disabled",
      reason: "delegated_runtime_disabled",
      nowMs: options.nowMs,
    };
  }
  if (
    !isAbsolute(options.artifactPath) ||
    !isAbsolute(options.signaturePath) ||
    !isAbsolute(options.ownerPublicKeyPath) ||
    options.ownerKeyId.trim().length === 0
  ) {
    return blocked(
      "delegated_policy_configuration_invalid",
      "policy_path_or_key_id_invalid",
      "configured_policy_paths_must_be_absolute",
      options.nowMs,
    );
  }

  let ownerPublicKey: KeyObject;
  try {
    ownerPublicKey = ownerPolicyKeyFromPem(
      readFileSync(options.ownerPublicKeyPath, "utf8"),
    );
  } catch {
    return blocked(
      "delegated_policy_invalid",
      "owner_public_key_unreadable",
      "owner_public_key_unreadable",
      options.nowMs,
    );
  }

  const loaded = loadVerifiedDelegatedPolicy({
    artifactPath: options.artifactPath,
    signaturePath: options.signaturePath,
    keys: [{ keyId: options.ownerKeyId, publicKey: ownerPublicKey }],
    enabled: true,
    nowMs: options.nowMs,
  });
  if (!loaded.ok) return blockedFromLoad(loaded, options.nowMs);
  if (!("policy" in loaded)) {
    return blocked(
      "delegated_policy_configuration_invalid",
      "delegated_policy_disabled_in_enabled_preflight",
      "enabled_policy_loader_returned_disabled",
      options.nowMs,
    );
  }
  return {
    status: "valid",
    policyId: loaded.policy.policyId,
    policyVersion: loaded.policy.policyVersion,
    issuedAt: loaded.policy.issuedAt,
    expiresAt: loaded.policy.expiresAt ?? null,
    policyHash: loaded.policyHash,
    signerKeyId: loaded.signerKeyId,
    nowMs: options.nowMs,
  };
}
