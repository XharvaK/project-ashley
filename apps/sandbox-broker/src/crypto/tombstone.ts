import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import {
  TOMBSTONE_PREFIX,
  type TombstoneEnvelope,
} from "./types.js";

export interface TombstoneKeyConfig {
  continuityKeyId: string;
  publicKey: KeyObject;
}

export interface TombstoneVerifierConfig {
  keys: TombstoneKeyConfig[];
  revokedKeyIds?: Set<string>;
}

export function signTombstoneEnvelope(
  envelope: Omit<TombstoneEnvelope, "signature">,
  privateKeyPem: string,
): TombstoneEnvelope {
  const payload = stripSignature(envelope);
  const message = Buffer.from(TOMBSTONE_PREFIX + canonicalJson(payload), "utf8");
  const signature = sign(null, message, privateKeyPem).toString("base64url");
  return { ...payload, signature };
}

export function verifyTombstoneEnvelope(
  envelope: TombstoneEnvelope,
  config: TombstoneVerifierConfig,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (envelope.protocolVersion !== 1) {
    return { ok: false, reason: "invalid_protocol_version" };
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
  const message = Buffer.from(TOMBSTONE_PREFIX + canonicalJson(payload), "utf8");
  const signature = Buffer.from(envelope.signature, "base64url");
  const valid = verify(null, message, key.publicKey, signature);
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function tombstonePublicKeyFromPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

function stripSignature(
  envelope: TombstoneEnvelope | Omit<TombstoneEnvelope, "signature">,
): Omit<TombstoneEnvelope, "signature"> {
  const { signature: _signature, ...rest } = envelope as TombstoneEnvelope;
  return rest;
}
