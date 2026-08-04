import {
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import { DISPATCH_SCOPE, type DispatchEnvelope } from "./types.js";

export const DISPATCH_PREFIX = "ASHLEY-EXTERNAL-DISPATCH-v1\n";
export const DISPATCH_KEY_NAMESPACE = "external-ed25519-v1";

export interface DispatchKeyConfig {
  keyId: string;
  publicKey: KeyObject;
}

export interface DispatchVerifierConfig {
  keys: DispatchKeyConfig[];
  revokedKeyIds?: Set<string>;
}

export function signDispatchEnvelope(
  envelope: Omit<DispatchEnvelope, "signature">,
  privateKeyPem: string,
): DispatchEnvelope {
  const payload = stripSignature(envelope);
  const message = Buffer.from(DISPATCH_PREFIX + canonicalJson(payload), "utf8");
  const signature = sign(null, message, privateKeyPem).toString("base64url");
  return { ...payload, signature };
}

export function verifyDispatchEnvelope(
  envelope: DispatchEnvelope,
  config: DispatchVerifierConfig,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (envelope.protocolVersion !== 1) {
    return { ok: false, reason: "invalid_protocol_version" };
  }
  if (envelope.scope !== DISPATCH_SCOPE) {
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
  const message = Buffer.from(DISPATCH_PREFIX + canonicalJson(payload), "utf8");
  const signature = Buffer.from(envelope.signature, "base64url");
  const valid = verify(null, message, key.publicKey, signature);
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function dispatchPublicKeyFromPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

function stripSignature(
  envelope: DispatchEnvelope | Omit<DispatchEnvelope, "signature">,
): Omit<DispatchEnvelope, "signature"> {
  const { signature: _signature, ...rest } = envelope as DispatchEnvelope;
  return rest;
}
