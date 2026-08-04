import {
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import { POLICY_SCOPE, type PolicyAuthorizeEnvelope } from "./types.js";

export const POLICY_PREFIX = "ASHLEY-EXTERNAL-POLICY-v1\n";
export const POLICY_KEY_NAMESPACE = "policy-ed25519-v1";

export interface PolicyKeyConfig {
  keyId: string;
  publicKey: KeyObject;
}

export interface PolicyVerifierConfig {
  keys: PolicyKeyConfig[];
  revokedKeyIds?: Set<string>;
}

export function signPolicyEnvelope(
  envelope: Omit<PolicyAuthorizeEnvelope, "signature">,
  privateKeyPem: string,
): PolicyAuthorizeEnvelope {
  const payload = stripSignature(envelope);
  const message = Buffer.from(POLICY_PREFIX + canonicalJson(payload), "utf8");
  const signature = sign(null, message, privateKeyPem).toString("base64url");
  return { ...payload, signature };
}

export function verifyPolicyEnvelope(
  envelope: PolicyAuthorizeEnvelope,
  config: PolicyVerifierConfig,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (envelope.protocolVersion !== 1) {
    return { ok: false, reason: "invalid_protocol_version" };
  }
  if (envelope.scope !== POLICY_SCOPE) {
    return { ok: false, reason: "invalid_scope" };
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
  const payload = stripSignature(envelope);
  const message = Buffer.from(POLICY_PREFIX + canonicalJson(payload), "utf8");
  const signature = Buffer.from(envelope.signature, "base64url");
  const valid = verify(null, message, key.publicKey, signature);
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function policyPublicKeyFromPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

function stripSignature(
  envelope: PolicyAuthorizeEnvelope | Omit<PolicyAuthorizeEnvelope, "signature">,
): Omit<PolicyAuthorizeEnvelope, "signature"> {
  const { signature: _signature, ...rest } = envelope as PolicyAuthorizeEnvelope;
  return rest;
}
