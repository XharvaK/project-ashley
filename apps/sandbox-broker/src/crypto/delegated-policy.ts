/**
 * Broker-side verification and loading of owner-signed delegated sandbox
 * policies (Sandbox Wave 4, Commit 2).
 *
 * The active policy is a cryptographically verifiable owner-signed artifact:
 * the broker recomputes the canonical payload, looks up the trusted owner
 * public key, verifies the Ed25519 signature, and checks injected-clock time
 * validity. Every failure is typed and fail-closed. The language model never
 * signs, alters, reloads, or chooses the key for this artifact. This module
 * does not wire the verified policy into execution authorization yet; that
 * is a later commit.
 *
 * Shared canonicalization/schema/result types come from the pure
 * `@composer-assistant/sandbox-policy` package; this module owns Ed25519
 * primitives, trusted owner-key lookup, and file loading only.
 */

import { existsSync, readFileSync } from "node:fs";
import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import {
  canonicalizeSandboxPolicyPayload,
  SANDBOX_POLICY_SIGNATURE_PREFIX,
  validateSandboxPolicyDocument,
  type SandboxPolicyDocument,
  type SandboxPolicySignature,
  type SandboxPolicyVerificationError,
  type SandboxPolicyVerificationResult,
  type SignedSandboxPolicyArtifact,
} from "@composer-assistant/sandbox-policy";
import { sha256Hex } from "./types.js";

export interface OwnerPolicyKeyConfig {
  keyId: string;
  publicKey: KeyObject;
}

export interface DelegatedPolicyVerifierConfig {
  keys: OwnerPolicyKeyConfig[];
}

export type DelegatedPolicyDiagnosticMetadata = {
  policyId: string;
  policyVersion: number;
  issuedAt: string;
  expiresAt?: string;
};

export interface DelegatedPolicyLoaderConfig {
  artifactPath: string;
  signaturePath?: string;
  keys: OwnerPolicyKeyConfig[];
  enabled: boolean;
  nowMs: number;
}

export type DelegatedPolicyLoadResult =
  | { ok: true; disabled: true }
  | {
      ok: true;
      policy: SandboxPolicyDocument;
      policyHash: string;
      signerKeyId: string;
      signatureSource: "embedded" | "detached";
    }
  | {
      ok: false;
      error:
        | "artifact_missing"
        | "signature_missing"
        | "artifact_unreadable"
        | "signature_unreadable"
        | "artifact_json_invalid"
        | "signature_json_invalid"
        | SandboxPolicyVerificationError;
      reason: string;
      metadata?: DelegatedPolicyDiagnosticMetadata;
    };

type DelegatedPolicyVerificationResult = SandboxPolicyVerificationResult & {
  metadata?: DelegatedPolicyDiagnosticMetadata;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fail(
  error: SandboxPolicyVerificationError,
  reason: string,
  metadata?: DelegatedPolicyDiagnosticMetadata,
): DelegatedPolicyVerificationResult {
  return {
    ok: false,
    error,
    reason,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function ownerPolicyKeyFromPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

/**
 * Signs a canonical policy payload (test/tooling helper). The signature
 * covers the full canonical payload prefixed by the domain prefix. The
 * runtime never uses a private key; only the broker verifies.
 */
export function signDelegatedPolicyArtifact(
  payload: SandboxPolicyDocument,
  privateKeyPem: string,
  keyId: string,
): SignedSandboxPolicyArtifact {
  const canonical = canonicalizeSandboxPolicyPayload(payload);
  if (!canonical.ok) {
    throw new Error(`policy_canonicalization_failed:${canonical.reasons.join(",")}`);
  }
  const message = Buffer.from(SANDBOX_POLICY_SIGNATURE_PREFIX + canonical.payload, "utf8");
  const value = sign(null, message, privateKeyPem).toString("base64");
  return {
    payload,
    signature: { algorithm: "Ed25519", keyId, encoding: "base64", value },
  };
}

/**
 * Verifies a signed policy artifact. `nowMs` is injected so tests are
 * deterministic and no wall clock is consulted inside the decision path.
 */
export function verifyDelegatedPolicyArtifact(
  artifact: unknown,
  config: DelegatedPolicyVerifierConfig,
  nowMs: number,
): DelegatedPolicyVerificationResult {
  if (!isRecord(artifact) || !("payload" in artifact)) {
    return fail("policy_schema_invalid", "artifact_payload_missing");
  }
  const signature = artifact.signature;
  if (!isRecord(signature)) {
    return fail("malformed_signature", "signature_missing");
  }
  if (typeof signature.algorithm !== "string" || signature.algorithm !== "Ed25519") {
    return fail(
      "unsupported_signature_algorithm",
      `unsupported_algorithm:${String(signature.algorithm)}`,
    );
  }
  if (typeof signature.keyId !== "string" || signature.keyId.length === 0) {
    return fail("malformed_signature", "signer_key_id_required");
  }
  if (typeof signature.encoding !== "string" || signature.encoding !== "base64") {
    return fail(
      "malformed_signature",
      `unsupported_encoding:${String(signature.encoding)}`,
    );
  }
  if (typeof signature.value !== "string" || signature.value.length === 0) {
    return fail("malformed_signature", "signature_value_empty");
  }

  const validated = validateSandboxPolicyDocument(artifact.payload);
  if (!validated.ok) {
    return fail("policy_schema_invalid", validated.reasons.join(","));
  }
  const canonical = canonicalizeSandboxPolicyPayload(validated.policy);
  if (!canonical.ok) {
    return fail("canonicalization_failed", canonical.reasons.join(","));
  }

  const issuedMs = Date.parse(validated.policy.issuedAt);
  if (issuedMs > nowMs) {
    return fail(
      "policy_not_yet_valid",
      `issued_at_in_future:${issuedMs}:now:${nowMs}`,
      {
        policyId: validated.policy.policyId,
        policyVersion: validated.policy.policyVersion,
        issuedAt: validated.policy.issuedAt,
        ...(validated.policy.expiresAt === undefined
          ? {}
          : { expiresAt: validated.policy.expiresAt }),
      },
    );
  }
  if (validated.policy.expiresAt !== undefined) {
    const expiresMs = Date.parse(validated.policy.expiresAt);
    if (expiresMs <= nowMs) {
      return fail(
        "policy_expired",
        `expires_at:${expiresMs}:now:${nowMs}`,
        {
          policyId: validated.policy.policyId,
          policyVersion: validated.policy.policyVersion,
          issuedAt: validated.policy.issuedAt,
          expiresAt: validated.policy.expiresAt,
        },
      );
    }
  }

  const key = config.keys.find((item) => item.keyId === signature.keyId);
  if (!key) {
    return fail("unknown_signer_key", `unknown_signer_key:${signature.keyId}`);
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature.value, "base64");
  } catch {
    return fail("malformed_signature", "signature_base64_invalid");
  }
  if (signatureBytes.toString("base64") !== signature.value) {
    return fail("malformed_signature", "signature_base64_invalid");
  }

  const message = Buffer.from(SANDBOX_POLICY_SIGNATURE_PREFIX + canonical.payload, "utf8");
  let valid: boolean;
  try {
    valid = verify(null, message, key.publicKey, signatureBytes);
  } catch {
    return fail("signature_invalid", "signature_verification_failed");
  }
  if (!valid) {
    return fail("signature_invalid", "signature_does_not_match_payload");
  }

  const policyHash = sha256Hex(Buffer.from(canonical.payload, "utf8"));
  return {
    ok: true,
    policy: validated.policy,
    policyHash,
    signerKeyId: signature.keyId,
  };
}

/**
 * Reads and verifies a policy artifact from disk. Fail-closed on every error;
 * read-only (never writes or generates a policy), requires the artifact path
 * to be supplied through configuration, and reports typed errors without
 * secret material or cryptographic stack traces. When disabled, no policy is
 * required and no file is read.
 */
export function loadVerifiedDelegatedPolicy(
  config: DelegatedPolicyLoaderConfig,
): DelegatedPolicyLoadResult {
  if (!config.enabled) {
    return { ok: true, disabled: true };
  }
  if (!existsSync(config.artifactPath)) {
    return { ok: false, error: "artifact_missing", reason: "delegated_policy_artifact_missing" };
  }
  let artifactText: string;
  try {
    artifactText = readFileSync(config.artifactPath, "utf8");
  } catch {
    return { ok: false, error: "artifact_unreadable", reason: "delegated_policy_artifact_unreadable" };
  }
  let artifact: unknown;
  try {
    artifact = JSON.parse(artifactText);
  } catch {
    return { ok: false, error: "artifact_json_invalid", reason: "delegated_policy_artifact_json_invalid" };
  }

  if (config.signaturePath !== undefined) {
    if (!existsSync(config.signaturePath)) {
      return { ok: false, error: "signature_missing", reason: "delegated_policy_signature_missing" };
    }
    let signatureText: string;
    try {
      signatureText = readFileSync(config.signaturePath, "utf8");
    } catch {
      return { ok: false, error: "signature_unreadable", reason: "delegated_policy_signature_unreadable" };
    }
    let signature: unknown;
    try {
      signature = JSON.parse(signatureText);
    } catch {
      return { ok: false, error: "signature_json_invalid", reason: "delegated_policy_signature_json_invalid" };
    }
    artifact = { payload: artifact, signature };
  }

  const verified = verifyDelegatedPolicyArtifact(artifact, { keys: config.keys }, config.nowMs);
  if (!verified.ok) {
    return {
      ok: false,
      error: verified.error,
      reason: verified.reason,
      ...(verified.metadata === undefined ? {} : { metadata: verified.metadata }),
    };
  }
  return {
    ok: true,
    policy: verified.policy,
    policyHash: verified.policyHash,
    signerKeyId: verified.signerKeyId,
    signatureSource: config.signaturePath !== undefined ? "detached" : "embedded",
  };
}

export type { SandboxPolicySignature };
