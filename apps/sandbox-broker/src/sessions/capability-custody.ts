/**
 * Capability-signing key custody (Sandbox Wave 4, Commit 8).
 *
 * The broker's capability-signing key is Ed25519-only and carries the fixed
 * key ID `broker-session-capability-ed25519-v1`. The private key is injected
 * by the host (encrypted at rest via key-custody envelopes, decrypted only by
 * the host and passed to the broker as PEM material). This module never
 * generates keys, never returns the private key, and never logs PEM.
 *
 * The public identity of the key is a fingerprint: SHA-256 over the SPKI DER
 * public key, the same convention used for the delegated-runtime key.
 */

import {
  createPublicKey,
  createPrivateKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { sha256Hex } from "../crypto/types.js";
import { CAPABILITY_SIGNING_KEY_ID } from "./session-limits.js";

export type CapabilitySigningKeyMaterial = {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
};

export interface BrokerCapabilitySigner {
  readonly keyId: string;
  readonly publicKeyPem: string;
  /** SHA-256 over SPKI DER of the public key. */
  readonly fingerprint: string;
  /** Ed25519-signs an arbitrary byte message; returns a base64url signature. */
  signMessage(message: Buffer): string;
  /** Verifies a base64url Ed25519 signature over an arbitrary byte message. */
  verifySignature(message: Buffer, signatureBase64Url: string): boolean;
}

export type CreateCapabilitySignerResult =
  | { ok: true; signer: BrokerCapabilitySigner }
  | { ok: false; errorCode: string; reason: string };

const PUBLIC_KEY_STRING_MAX = 8192;
const PRIVATE_KEY_STRING_MAX = 8192;

export function capabilitySigningKeyFingerprint(publicKeyPem: string): string {
  const publicKey = createPublicKey(publicKeyPem);
  return sha256Hex(publicKey.export({ type: "spki", format: "der" }));
}

/**
 * Wraps injected key material as the broker's fixed-ID capability signer.
 * Refuses any key ID other than the capability-signing key ID, refuses
 * non-Ed25519 keys, and never exposes the private key on the returned object.
 */
export function createBrokerCapabilitySigner(
  material: CapabilitySigningKeyMaterial,
): CreateCapabilitySignerResult {
  if (material.keyId !== CAPABILITY_SIGNING_KEY_ID) {
    return {
      ok: false,
      errorCode: "key_id_mismatch",
      reason: `expected key id ${CAPABILITY_SIGNING_KEY_ID}`,
    };
  }
  if (
    typeof material.privateKeyPem !== "string" ||
    typeof material.publicKeyPem !== "string" ||
    material.privateKeyPem.length === 0 ||
    material.privateKeyPem.length > PRIVATE_KEY_STRING_MAX ||
    material.publicKeyPem.length === 0 ||
    material.publicKeyPem.length > PUBLIC_KEY_STRING_MAX
  ) {
    return { ok: false, errorCode: "invalid_key_material", reason: "invalid key material" };
  }

  let privateKey: KeyObject;
  let publicKey: KeyObject;
  try {
    privateKey = createPrivateKey(material.privateKeyPem);
    publicKey = createPublicKey(material.publicKeyPem);
  } catch {
    return { ok: false, errorCode: "unreadable_key_material", reason: "unreadable key material" };
  }
  if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
    return { ok: false, errorCode: "unsupported_key_algorithm", reason: "ed25519 required" };
  }

  const fingerprint = sha256Hex(publicKey.export({ type: "spki", format: "der" }));

  const signMessage = (message: Buffer): string =>
    sign(null, message, privateKey).toString("base64url");

  const verifySignature = (message: Buffer, signatureBase64Url: string): boolean => {
    try {
      return verify(null, message, publicKey, Buffer.from(signatureBase64Url, "base64url"));
    } catch {
      return false;
    }
  };

  return {
    ok: true,
    signer: {
      keyId: CAPABILITY_SIGNING_KEY_ID,
      publicKeyPem: material.publicKeyPem,
      fingerprint,
      signMessage,
      verifySignature,
    },
  };
}

export function capabilitySignerPublicKeyFingerprint(
  signer: BrokerCapabilitySigner,
): string {
  return signer.fingerprint;
}
