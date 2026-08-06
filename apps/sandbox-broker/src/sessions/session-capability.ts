/**
 * Signed short-lived session capability artifacts (Sandbox Wave 4, Commit 8).
 *
 * A session capability is a bounded, tamper-proof, broker-signed object. It
 * binds: the session UUID, the policy identity (id/version/hash) the session
 * was created under, the granted role, the capability being invoked, and the
 * token's own short lifetime. Signature covers the canonical bytes of the
 * full payload — no field escapes coverage.
 *
 * The repository convention (see delegated-approval.ts) is a domain prefix
 * followed by canonical JSON; Commit 8 introduces its own prefix and version.
 */

import { canonicalJson } from "../crypto/canonical-json.js";
import { capabilitySpec } from "@composer-assistant/sandbox-policy";
import type { BrokerCapabilitySigner } from "./capability-custody.js";
import type { BrokerSandboxRole, SandboxSessionState } from "./session-types.js";
import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";

export const SESSION_CAPABILITY_PREFIX = "ASHLEY-SANDBOX-SESSION-CAPABILITY-v1\n";
export const SESSION_CAPABILITY_VERSION = 1 as const;

export type SessionCapabilityPayload = {
  capabilityVersion: typeof SESSION_CAPABILITY_VERSION;
  capabilityId: SandboxCapabilityId;
  sessionUuid: string;
  ownerId: string;
  role: BrokerSandboxRole;
  sessionState: Extract<SandboxSessionState, "active">;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  allowedCapabilities: SandboxCapabilityId[];
  maxToolExecutions: number;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

export type SignedSandboxSessionCapability = {
  payload: SessionCapabilityPayload;
  signature: {
    algorithm: "Ed25519";
    keyId: string;
    encoding: "base64url";
    value: string;
  };
};

export function canonicalSessionCapabilityBytes(
  payload: SessionCapabilityPayload,
): Buffer {
  return Buffer.from(SESSION_CAPABILITY_PREFIX + canonicalJson(payload), "utf8");
}

export function signSessionCapability(
  payload: SessionCapabilityPayload,
  signer: BrokerCapabilitySigner,
): SignedSandboxSessionCapability {
  const bytes = canonicalSessionCapabilityBytes(payload);
  return {
    payload,
    signature: {
      algorithm: "Ed25519",
      keyId: signer.keyId,
      encoding: "base64url",
      value: signer.signMessage(bytes),
    },
  };
}

export type VerifySessionCapabilityErrorCode =
  | "malformed_artifact"
  | "unsupported_capability_version"
  | "wrong_signature_algorithm"
  | "wrong_signature_encoding"
  | "key_id_mismatch"
  | "missing_signature"
  | "invalid_signature"
  | "malformed_payload"
  | "invalid_capability"
  | "invalid_role"
  | "invalid_session_state"
  | "not_yet_valid"
  | "expired"
  | "invalid_lifetime";

export type VerifySessionCapabilityResult =
  | { ok: true; payload: SessionCapabilityPayload }
  | { ok: false; errorCode: VerifySessionCapabilityErrorCode; reason: string };

function isCapabilityId(value: unknown): value is SandboxCapabilityId {
  return typeof value === "string" && capabilitySpec(value) !== undefined;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isShortIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

/**
 * Verifies the artifact's signature (full-payload canonical coverage) and the
 * payload's structural integrity. Time validity is evaluated against the
 * provided clock; caller still applies session-level checks (state, policy,
 * budget).
 */
export function verifySessionCapability(
  artifact: SignedSandboxSessionCapability,
  signer: BrokerCapabilitySigner,
  nowMs: number,
): VerifySessionCapabilityResult {
  if (!artifact || typeof artifact !== "object") {
    return { ok: false, errorCode: "malformed_artifact", reason: "artifact is not an object" };
  }
  const payload = artifact.payload as unknown;
  if (!payload || typeof payload !== "object") {
    return { ok: false, errorCode: "malformed_artifact", reason: "payload missing" };
  }
  const signature = artifact.signature as unknown;
  if (!signature || typeof signature !== "object") {
    return { ok: false, errorCode: "missing_signature", reason: "signature missing" };
  }
  const sig = signature as Record<string, unknown>;
  if (sig.algorithm !== "Ed25519") {
    return { ok: false, errorCode: "wrong_signature_algorithm", reason: "Ed25519 required" };
  }
  if (sig.encoding !== "base64url") {
    return { ok: false, errorCode: "wrong_signature_encoding", reason: "base64url required" };
  }
  if (typeof sig.value !== "string" || sig.value.length === 0) {
    return { ok: false, errorCode: "missing_signature", reason: "signature value missing" };
  }
  if (sig.keyId !== signer.keyId) {
    return {
      ok: false,
      errorCode: "key_id_mismatch",
      reason: `expected key id ${signer.keyId}`,
    };
  }

  const record = payload as Record<string, unknown>;
  if (record.capabilityVersion !== SESSION_CAPABILITY_VERSION) {
    return {
      ok: false,
      errorCode: "unsupported_capability_version",
      reason: `unsupported capability version`,
    };
  }
  if (
    typeof record.sessionUuid !== "string" ||
    record.sessionUuid.length === 0 ||
    typeof record.ownerId !== "string" ||
    record.ownerId.length === 0 ||
    typeof record.policyId !== "string" ||
    record.policyId.length === 0 ||
    !isFiniteNonNegativeNumber(record.policyVersion) ||
    typeof record.policyHash !== "string" ||
    record.policyHash.length === 0
  ) {
    return { ok: false, errorCode: "malformed_payload", reason: "identity fields malformed" };
  }
  if (!isCapabilityId(record.capabilityId)) {
    return { ok: false, errorCode: "invalid_capability", reason: "unknown capability id" };
  }
  if (record.role !== "sandbox_operator_light" && record.role !== "sandbox_operator_deep") {
    return { ok: false, errorCode: "invalid_role", reason: "unknown role" };
  }
  if (record.sessionState !== "active") {
    return { ok: false, errorCode: "invalid_session_state", reason: "session must be active" };
  }
  if (
    !Array.isArray(record.allowedCapabilities) ||
    record.allowedCapabilities.length === 0 ||
    !record.allowedCapabilities.every(isCapabilityId)
  ) {
    return { ok: false, errorCode: "malformed_payload", reason: "allowed capabilities malformed" };
  }
  if (
    !isFiniteNonNegativeNumber(record.maxToolExecutions) ||
    !isShortIsoTimestamp(record.issuedAt) ||
    !isShortIsoTimestamp(record.expiresAt) ||
    typeof record.nonce !== "string" ||
    record.nonce.length === 0
  ) {
    return { ok: false, errorCode: "malformed_payload", reason: "lifetime fields malformed" };
  }

  const payloadObj = payload as SessionCapabilityPayload;
  const issuedMs = Date.parse(payloadObj.issuedAt);
  const expiresMs = Date.parse(payloadObj.expiresAt);
  if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs)) {
    return { ok: false, errorCode: "malformed_payload", reason: "unparseable timestamps" };
  }
  if (expiresMs <= issuedMs) {
    return { ok: false, errorCode: "invalid_lifetime", reason: "expiry must exceed issuance" };
  }
  if (nowMs < issuedMs) {
    return { ok: false, errorCode: "not_yet_valid", reason: "token not yet valid" };
  }
  if (nowMs >= expiresMs) {
    return { ok: false, errorCode: "expired", reason: "token expired" };
  }

  const bytes = canonicalSessionCapabilityBytes(payloadObj);
  if (!signer.verifySignature(bytes, sig.value as string)) {
    return { ok: false, errorCode: "invalid_signature", reason: "signature verification failed" };
  }

  return { ok: true, payload: payloadObj };
}
