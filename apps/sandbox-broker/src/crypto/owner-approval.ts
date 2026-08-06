/**
 * Owner approval envelope for sandbox proposals (Sandbox Wave 4, Commit 11).
 *
 * A distinct cryptographic domain from the older generic owner approval
 * envelopes (`ASHLEY-SANDBOX-APPROVAL-v1`) and from the delegated runtime
 * envelopes (`ASHLEY-SANDBOX-DELEGATED-APPROVAL-v1`). An owner approval here
 * authorizes ONE sandbox capability proposal with exact structured payload
 * binding: the signed payload contains only structured authority fields
 * (capability, policy identity, risk class, canonical target paths, recipe,
 * persistence, network and side-effect flags) and a canonical payload hash
 * over exactly those fields. Any mutation of a bound field invalidates the
 * approval because the signature covers the canonical JSON of the full
 * payload and the payload hash is recomputed by the verifier.
 *
 * Only the owner approval key may sign these envelopes; delegated, capability
 * and unknown keys fail closed. The broker verifies with
 * `verifyOwnerApprovalEnvelope` and never trusts agent-service claims.
 *
 * Pure crypto: no execution, no filesystem, no secrets beyond caller-supplied
 * key material.
 */

import { createPublicKey, sign, verify } from "node:crypto";
import type {
  SandboxPathIntent,
  SandboxRiskClass,
} from "@composer-assistant/sandbox-policy";
import { canonicalJson } from "./canonical-json.js";
import { sha256Hex } from "./types.js";
import { REQUIRED_NETWORK_MODE } from "../constants/limits.js";
import type { ApprovalKeyConfig } from "./approval.js";

export const OWNER_APPROVAL_PREFIX =
  "ASHLEY-SANDBOX-OWNER-APPROVAL-v1\n";

/** Fixed signer class of owner-signed sandbox approvals. */
export const OWNER_APPROVAL_SIGNER_CLASS = "owner";

export type OwnerApprovalTarget = {
  path: string;
  intent: SandboxPathIntent;
};

/**
 * Structured authority payload bound by an owner approval. No model prose:
 * every field is a bounded, typed authority field.
 */
export type OwnerApprovalAuthorityPayload = {
  proposalId: string;
  ownerId: string;
  sessionUuid: string;
  capabilityId: string;
  authoritativeRiskClass: SandboxRiskClass;
  canonicalTargetPaths: OwnerApprovalTarget[];
  policyRuleId: string;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  recipeId: string | null;
  executableId: string | null;
  persistence: "temporary" | "persistent";
  requiresNetwork: boolean;
  externalSideEffect: boolean;
};

export interface SandboxOwnerApprovalEnvelope {
  protocolVersion: 1;
  keyId: string;
  signerClass: typeof OWNER_APPROVAL_SIGNER_CLASS;
  proposalId: string;
  ownerId: string;
  sessionUuid: string;
  capabilityId: string;
  authoritativeRiskClass: SandboxRiskClass;
  canonicalTargetPaths: OwnerApprovalTarget[];
  policyRuleId: string;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  recipeId: string | null;
  executableId: string | null;
  persistence: "temporary" | "persistent";
  requiresNetwork: boolean;
  externalSideEffect: boolean;
  networkMode: "none";
  payloadHash: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature?: string;
}

export interface OwnerApprovalVerifierConfig {
  keys: ApprovalKeyConfig[];
  revokedKeyIds?: Set<string>;
}

const PAYLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Canonical hash over the structured authority payload. This is the exact
 * binding an owner approval carries; the verifier recomputes it and any
 * mismatch invalidates the approval.
 */
export function computeOwnerApprovalPayloadHash(
  payload: OwnerApprovalAuthorityPayload,
): string {
  return sha256Hex(Buffer.from(canonicalJson(payload), "utf8"));
}

export function signOwnerApprovalEnvelope(
  input: Omit<SandboxOwnerApprovalEnvelope, "signature" | "payloadHash">,
  privateKeyPem: string,
): SandboxOwnerApprovalEnvelope {
  const payload: OwnerApprovalAuthorityPayload = {
    proposalId: input.proposalId,
    ownerId: input.ownerId,
    sessionUuid: input.sessionUuid,
    capabilityId: input.capabilityId,
    authoritativeRiskClass: input.authoritativeRiskClass,
    canonicalTargetPaths: input.canonicalTargetPaths.map((target) => ({
      path: target.path,
      intent: target.intent,
    })),
    policyRuleId: input.policyRuleId,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    policyHash: input.policyHash,
    recipeId: input.recipeId,
    executableId: input.executableId,
    persistence: input.persistence,
    requiresNetwork: input.requiresNetwork,
    externalSideEffect: input.externalSideEffect,
  };
  const envelope: Omit<SandboxOwnerApprovalEnvelope, "signature"> = {
    ...input,
    payloadHash: computeOwnerApprovalPayloadHash(payload),
  };
  const message = Buffer.from(
    OWNER_APPROVAL_PREFIX + canonicalJson(envelope),
    "utf8",
  );
  const signature = sign(null, message, privateKeyPem).toString("base64url");
  return { ...envelope, signature };
}

export function verifyOwnerApprovalEnvelope(
  envelope: SandboxOwnerApprovalEnvelope,
  config: OwnerApprovalVerifierConfig,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (envelope.protocolVersion !== 1) {
    return { ok: false, reason: "invalid_protocol_version" };
  }
  if (envelope.signerClass !== OWNER_APPROVAL_SIGNER_CLASS) {
    return { ok: false, reason: "invalid_signer_class" };
  }
  if (config.revokedKeyIds?.has(envelope.keyId)) {
    return { ok: false, reason: "revoked_key" };
  }
  const key = config.keys.find((item) => item.keyId === envelope.keyId);
  if (!key) {
    return { ok: false, reason: "unknown_key" };
  }
  if (envelope.keyId === undefined || !envelope.signature) {
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
  if (envelope.requiresNetwork !== false) {
    return { ok: false, reason: "invalid_network_mode" };
  }
  if (!PAYLOAD_HASH_PATTERN.test(envelope.payloadHash)) {
    return { ok: false, reason: "invalid_payload_hash" };
  }
  const recomputed = computeOwnerApprovalPayloadHash({
    proposalId: envelope.proposalId,
    ownerId: envelope.ownerId,
    sessionUuid: envelope.sessionUuid,
    capabilityId: envelope.capabilityId,
    authoritativeRiskClass: envelope.authoritativeRiskClass,
    canonicalTargetPaths: envelope.canonicalTargetPaths,
    policyRuleId: envelope.policyRuleId,
    policyId: envelope.policyId,
    policyVersion: envelope.policyVersion,
    policyHash: envelope.policyHash,
    recipeId: envelope.recipeId,
    executableId: envelope.executableId,
    persistence: envelope.persistence,
    requiresNetwork: envelope.requiresNetwork,
    externalSideEffect: envelope.externalSideEffect,
  });
  if (recomputed !== envelope.payloadHash) {
    return { ok: false, reason: "payload_hash_mismatch" };
  }
  const payload = stripSignature(envelope);
  const message = Buffer.from(
    OWNER_APPROVAL_PREFIX + canonicalJson(payload),
    "utf8",
  );
  const signature = Buffer.from(envelope.signature, "base64url");
  const valid = verify(null, message, key.publicKey, signature);
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function ownerApprovalPublicKeyFingerprint(
  publicKeyPem: string,
): string {
  const publicKey = createPublicKey(publicKeyPem);
  return sha256Hex(publicKey.export({ type: "spki", format: "der" }));
}

function stripSignature(
  envelope:
    | SandboxOwnerApprovalEnvelope
    | Omit<SandboxOwnerApprovalEnvelope, "signature">,
): Omit<SandboxOwnerApprovalEnvelope, "signature"> {
  const { signature: _signature, ...rest } = envelope as SandboxOwnerApprovalEnvelope;
  return rest;
}
