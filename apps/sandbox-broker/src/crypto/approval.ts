import {
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import {
  APPROVAL_PREFIX,
  type ApprovalEnvelope,
} from "./types.js";
import { REQUIRED_NETWORK_MODE } from "../constants/limits.js";

export interface ApprovalKeyConfig {
  keyId: string;
  publicKey: KeyObject;
}

export interface ApprovalVerifierConfig {
  keys: ApprovalKeyConfig[];
  revokedKeyIds?: Set<string>;
}

export function signApprovalEnvelope(
  envelope: Omit<ApprovalEnvelope, "signature">,
  privateKeyPem: string,
): ApprovalEnvelope {
  const payload = stripSignature(envelope);
  const message = Buffer.from(APPROVAL_PREFIX + canonicalJson(payload), "utf8");
  const signature = sign(null, message, privateKeyPem).toString("base64url");
  return { ...payload, signature };
}

export function verifyApprovalEnvelope(
  envelope: ApprovalEnvelope,
  config: ApprovalVerifierConfig,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (envelope.protocolVersion !== 1) {
    return { ok: false, reason: "invalid_protocol_version" };
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
  if (envelope.networkMode !== REQUIRED_NETWORK_MODE) {
    return { ok: false, reason: "invalid_network_mode" };
  }
  const payload = stripSignature(envelope);
  const message = Buffer.from(APPROVAL_PREFIX + canonicalJson(payload), "utf8");
  const signature = Buffer.from(envelope.signature, "base64url");
  const valid = verify(null, message, key.publicKey, signature);
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function publicKeyFromPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

function stripSignature(
  envelope: ApprovalEnvelope | Omit<ApprovalEnvelope, "signature">,
): Omit<ApprovalEnvelope, "signature"> {
  const { signature: _signature, ...rest } = envelope as ApprovalEnvelope;
  return rest;
}
