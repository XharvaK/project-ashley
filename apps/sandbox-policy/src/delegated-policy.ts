/**
 * Signed artifact and verification result vocabulary for owner-signed
 * delegated sandbox policies (Sandbox Wave 4, Commit 2).
 *
 * This module is pure: it defines shapes and result types only. Ed25519
 * signature generation and verification, trusted owner-key lookup, policy
 * file loading, and active-policy state live in the sandbox broker
 * (`apps/sandbox-broker/src/crypto/delegated-policy.ts`). No key material,
 * environment reads, filesystem access, or model/provider state exists here.
 */

import type { SandboxPolicyDocument } from "./policy-schema.js";

export const SANDBOX_POLICY_SIGNATURE_ALGORITHM = "Ed25519" as const;
export const SANDBOX_POLICY_SIGNATURE_ENCODING = "base64" as const;

export type SandboxPolicySignature = {
  algorithm: typeof SANDBOX_POLICY_SIGNATURE_ALGORITHM;
  keyId: string;
  encoding: typeof SANDBOX_POLICY_SIGNATURE_ENCODING;
  value: string;
};

export type SignedSandboxPolicyArtifact = {
  payload: SandboxPolicyDocument;
  signature: SandboxPolicySignature;
};

export type SandboxPolicyVerificationError =
  | "policy_schema_invalid"
  | "canonicalization_failed"
  | "unsupported_signature_algorithm"
  | "unknown_signer_key"
  | "malformed_signature"
  | "signature_invalid"
  | "policy_not_yet_valid"
  | "policy_expired";

export type SandboxPolicyVerificationResult =
  | {
      ok: true;
      policy: SandboxPolicyDocument;
      policyHash: string;
      signerKeyId: string;
    }
  | { ok: false; error: SandboxPolicyVerificationError; reason: string };
