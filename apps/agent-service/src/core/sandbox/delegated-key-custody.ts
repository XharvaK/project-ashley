/**
 * Delegated runtime key custody (Sandbox Wave 4, Commit 4).
 *
 * The delegated runtime signing key is injected as material, never read
 * from configuration or disk by this module, never generated at startup,
 * and never interchangeable with the owner key. Validation is strict and
 * fail-closed: the key ID must be the fixed delegated-runtime key ID, both
 * PEMs must parse and be Ed25519, and the public key must derive from the
 * private key. The key bytes are never returned by the custody API; only a
 * stable fingerprint (SHA-256 over the SPKI DER public key encoding) is
 * exposed for audit and verification purposes.
 */

import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import {
  DELEGATED_RUNTIME_KEY_ID,
  delegatedRuntimePublicKeyFingerprint,
} from "@composer-assistant/sandbox-broker";

export type DelegatedRuntimeKeyMaterial = {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
};

/**
 * Injection seam for key custody. The caller (future sandbox orchestrator)
 * supplies how the key is obtained; the signer only ever receives the
 * material through here and never reaches into the filesystem itself.
 */
export type DelegatedRuntimeKeyLoader = (
  keyId: string,
) => DelegatedRuntimeKeyMaterial | null;

export type DelegatedKeyValidationError =
  | "key_id_mismatch"
  | "invalid_private_key"
  | "invalid_public_key"
  | "not_ed25519_private_key"
  | "not_ed25519_public_key"
  | "key_pair_mismatch";

export type DelegatedKeyValidationResult =
  | { ok: true; fingerprint: string }
  | { ok: false; error: DelegatedKeyValidationError; reason: string };

export function validateDelegatedRuntimeKeyMaterial(
  material: DelegatedRuntimeKeyMaterial,
): DelegatedKeyValidationResult {
  if (material.keyId !== DELEGATED_RUNTIME_KEY_ID) {
    return {
      ok: false,
      error: "key_id_mismatch",
      reason: `expected_key_id_${DELEGATED_RUNTIME_KEY_ID}`,
    };
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(material.privateKeyPem);
  } catch {
    return {
      ok: false,
      error: "invalid_private_key",
      reason: "unparseable_private_key_pem",
    };
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    return {
      ok: false,
      error: "not_ed25519_private_key",
      reason: "private_key_algorithm_not_ed25519",
    };
  }
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey(material.publicKeyPem);
  } catch {
    return {
      ok: false,
      error: "invalid_public_key",
      reason: "unparseable_public_key_pem",
    };
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    return {
      ok: false,
      error: "not_ed25519_public_key",
      reason: "public_key_algorithm_not_ed25519",
    };
  }
  const derivedPublic = createPublicKey(privateKey).export({
    type: "spki",
    format: "der",
  });
  const providedPublic = publicKey.export({ type: "spki", format: "der" });
  if (!derivedPublic.equals(providedPublic)) {
    return {
      ok: false,
      error: "key_pair_mismatch",
      reason: "public_key_does_not_match_private_key",
    };
  }
  return {
    ok: true,
    fingerprint: delegatedRuntimePublicKeyFingerprint(material.publicKeyPem),
  };
}
