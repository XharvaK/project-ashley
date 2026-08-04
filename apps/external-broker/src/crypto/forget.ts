import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import { FORGET_SCOPE, type ForgetEnvelope } from "./types.js";

export const FORGET_PREFIX = "ASHLEY-EXTERNAL-FORGET-v1\n";

export interface ForgetKeyConfig {
  continuityKeyId: string;
  publicKey: KeyObject;
}

export interface ForgetVerifierConfig {
  keys: ForgetKeyConfig[];
  revokedKeyIds?: Set<string>;
}

export function signForgetEnvelope(
  envelope: Omit<ForgetEnvelope, "signature">,
  privateKeyPem: string,
): ForgetEnvelope {
  const payload = stripSignature(envelope);
  const message = Buffer.from(FORGET_PREFIX + canonicalJson(payload), "utf8");
  const signature = sign(null, message, privateKeyPem).toString("base64url");
  return { ...payload, signature };
}

export function verifyForgetEnvelope(
  envelope: ForgetEnvelope,
  config: ForgetVerifierConfig,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (envelope.protocolVersion !== 1) {
    return { ok: false, reason: "invalid_protocol_version" };
  }
  if (envelope.scope !== FORGET_SCOPE) {
    return { ok: false, reason: "invalid_scope" };
  }
  if (config.revokedKeyIds?.has(envelope.continuityKeyId)) {
    return { ok: false, reason: "revoked_key" };
  }
  const key = config.keys.find(
    (item) => item.continuityKeyId === envelope.continuityKeyId,
  );
  if (!key) {
    return { ok: false, reason: "unknown_key" };
  }
  if (!envelope.signature) {
    return { ok: false, reason: "missing_signature" };
  }
  if (envelope.expiresAt !== undefined && envelope.expiresAt <= nowMs) {
    return { ok: false, reason: "expired" };
  }
  const payload = stripSignature(envelope);
  const message = Buffer.from(FORGET_PREFIX + canonicalJson(payload), "utf8");
  const signature = Buffer.from(envelope.signature, "base64url");
  const valid = verify(null, message, key.publicKey, signature);
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function forgetPublicKeyFromPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

function stripSignature(
  envelope: ForgetEnvelope | Omit<ForgetEnvelope, "signature">,
): Omit<ForgetEnvelope, "signature"> {
  const { signature: _signature, ...rest } = envelope as ForgetEnvelope;
  return rest;
}
