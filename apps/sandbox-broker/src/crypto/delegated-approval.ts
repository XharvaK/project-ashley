/**
 * Delegated runtime approval envelope (Sandbox Wave 4, Commit 4).
 *
 * The delegated runtime signer (agent-service) signs sandbox requests that
 * the shared deterministic policy judged `autonomous_safe`. This module
 * defines the envelope those requests travel in, reusing the repository's
 * canonical signing format (domain prefix + canonical JSON + Ed25519
 * signature, base64url encoded) so there is exactly one envelope
 * protocol family and no second incompatible scheme. The broker verifies
 * these envelopes with `verifyDelegatedApprovalEnvelope` before execution;
 * it never trusts the runtime's claims without signature verification.
 *
 * This module is pure crypto: no execution, no filesystem, no secrets
 * beyond the caller-supplied key material.
 */

import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import type {
  SandboxPathIntent,
  SandboxRiskClass,
} from "@composer-assistant/sandbox-policy";
import { canonicalJson } from "./canonical-json.js";
import { sha256Hex } from "./types.js";
import { REQUIRED_NETWORK_MODE } from "../constants/limits.js";
import type { ApprovalKeyConfig } from "./approval.js";

export const DELEGATED_APPROVAL_PREFIX =
  "ASHLEY-SANDBOX-DELEGATED-APPROVAL-v1\n";

/** Fixed key ID of the delegated runtime signing key. */
export const DELEGATED_RUNTIME_KEY_ID = "delegated-runtime-ed25519-v1";

export type DelegatedSignerClass = "delegated_runtime";

export type DelegatedSandboxTarget = {
  path: string;
  intent: SandboxPathIntent;
};

export interface DelegatedApprovalEnvelope {
  protocolVersion: 1;
  keyId: string;
  signerClass: DelegatedSignerClass;
  proposalId: string;
  ownerId: string;
  sessionUuid?: string;
  capabilityId: string;
  authoritativeRiskClass: SandboxRiskClass;
  canonicalTargetPaths: DelegatedSandboxTarget[];
  policyRuleId: string;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  recipeId?: string;
  executableId?: string;
  argv?: string[];
  cwd?: string;
  networkMode: "none";
  persistence: "temporary" | "persistent";
  externalSideEffect: boolean;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature?: string;
}

export interface DelegatedApprovalVerifierConfig {
  keys: ApprovalKeyConfig[];
  revokedKeyIds?: Set<string>;
}

export function signDelegatedApprovalEnvelope(
  envelope: Omit<DelegatedApprovalEnvelope, "signature">,
  privateKeyPem: string,
): DelegatedApprovalEnvelope {
  const payload = stripSignature(envelope);
  const message = Buffer.from(
    DELEGATED_APPROVAL_PREFIX + canonicalJson(payload),
    "utf8",
  );
  const signature = sign(null, message, privateKeyPem).toString("base64url");
  return { ...payload, signature };
}

export function verifyDelegatedApprovalEnvelope(
  envelope: DelegatedApprovalEnvelope,
  config: DelegatedApprovalVerifierConfig,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (envelope.protocolVersion !== 1) {
    return { ok: false, reason: "invalid_protocol_version" };
  }
  if (envelope.signerClass !== "delegated_runtime") {
    return { ok: false, reason: "invalid_signer_class" };
  }
  if (config.revokedKeyIds?.has(envelope.keyId)) {
    return { ok: false, reason: "revoked_key" };
  }
  const key = config.keys.find((item) => item.keyId === envelope.keyId);
  if (!key) {
    return { ok: false, reason: "unknown_key" };
  }
  if (!envelope.signature) {
    return { ok: false, reason: "missing_signature" };
  }
  if (envelope.expiresAt <= nowMs) {
    return { ok: false, reason: "expired" };
  }
  if (envelope.issuedAt > nowMs) {
    return { ok: false, reason: "not_yet_valid" };
  }
  if (envelope.networkMode !== REQUIRED_NETWORK_MODE) {
    return { ok: false, reason: "invalid_network_mode" };
  }
  const payload = stripSignature(envelope);
  const message = Buffer.from(
    DELEGATED_APPROVAL_PREFIX + canonicalJson(payload),
    "utf8",
  );
  const signature = Buffer.from(envelope.signature, "base64url");
  const valid = verify(null, message, key.publicKey, signature);
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

/**
 * SHA-256 over the SPKI DER encoding of the Ed25519 public key. The DER
 * encoding is the stable fingerprint input; the fingerprint is a fixed
 * 64-character hex string that identifies a key independently of PEM
 * framing.
 */
export function delegatedRuntimePublicKeyFingerprint(
  publicKeyPem: string,
): string {
  const publicKey: KeyObject = createPublicKey(publicKeyPem);
  return sha256Hex(publicKey.export({ type: "spki", format: "der" }));
}

function stripSignature(
  envelope:
    | DelegatedApprovalEnvelope
    | Omit<DelegatedApprovalEnvelope, "signature">,
): Omit<DelegatedApprovalEnvelope, "signature"> {
  const { signature: _signature, ...rest } = envelope as DelegatedApprovalEnvelope;
  return rest;
}
