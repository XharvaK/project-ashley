/**
 * Delegated runtime key custody tests (Sandbox Wave 4, Commit 4).
 *
 * Behaviors 1-10: valid material, Ed25519 enforcement, malformed input,
 * stable fingerprints, distinct keys, no key generation, no owner fallback,
 * and no key bytes or PEM material escaping the custody API.
 */

import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DELEGATED_RUNTIME_KEY_ID } from "@composer-assistant/sandbox-broker";
import { generateEd25519KeyPairPem } from "@composer-assistant/sandbox-broker";
import {
  validateDelegatedRuntimeKeyMaterial,
  type DelegatedRuntimeKeyMaterial,
} from "./delegated-key-custody.js";

function ed25519Material(
  keyId = DELEGATED_RUNTIME_KEY_ID,
): DelegatedRuntimeKeyMaterial {
  const pair = generateEd25519KeyPairPem();
  return {
    keyId,
    privateKeyPem: pair.privateKeyPem,
    publicKeyPem: pair.publicKeyPem,
  };
}

describe("delegated runtime key custody", () => {
  it("accepts valid Ed25519 material and returns a stable 64-hex fingerprint", () => {
    const material = ed25519Material();
    const first = validateDelegatedRuntimeKeyMaterial(material);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const second = validateDelegatedRuntimeKeyMaterial(material);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("returns the same fingerprint for the same key and differs for different keys", () => {
    const materialA = ed25519Material();
    const materialB = ed25519Material();
    const a = validateDelegatedRuntimeKeyMaterial(materialA);
    const b = validateDelegatedRuntimeKeyMaterial(materialB);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const again = validateDelegatedRuntimeKeyMaterial(materialA);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.fingerprint).toBe(a.fingerprint);
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });

  it("refuses a key whose keyId is not the fixed delegated-runtime key ID", () => {
    const result = validateDelegatedRuntimeKeyMaterial(
      ed25519Material("owner-ed25519-v1"),
    );
    expect(result).toMatchObject({
      ok: false,
      error: "key_id_mismatch",
    });
  });

  it("refuses a non-Ed25519 private key (owner-style fallback is impossible)", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 });
    const result = validateDelegatedRuntimeKeyMaterial({
      keyId: DELEGATED_RUNTIME_KEY_ID,
      privateKeyPem: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      publicKeyPem: rsa.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    expect(result).toMatchObject({
      ok: false,
      error: "not_ed25519_private_key",
    });
  });

  it("refuses a non-Ed25519 public key", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pair = generateEd25519KeyPairPem();
    const result = validateDelegatedRuntimeKeyMaterial({
      keyId: DELEGATED_RUNTIME_KEY_ID,
      privateKeyPem: pair.privateKeyPem,
      publicKeyPem: ec.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    expect(result).toMatchObject({
      ok: false,
      error: "not_ed25519_public_key",
    });
  });

  it("refuses malformed PEM and missing material", () => {
    const pair = generateEd25519KeyPairPem();
    const malformedPrivate = validateDelegatedRuntimeKeyMaterial({
      keyId: DELEGATED_RUNTIME_KEY_ID,
      privateKeyPem: "not-a-pem",
      publicKeyPem: pair.publicKeyPem,
    });
    expect(malformedPrivate).toMatchObject({
      ok: false,
      error: "invalid_private_key",
    });
    const malformedPublic = validateDelegatedRuntimeKeyMaterial({
      keyId: DELEGATED_RUNTIME_KEY_ID,
      privateKeyPem: pair.privateKeyPem,
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----",
    });
    expect(malformedPublic).toMatchObject({
      ok: false,
      error: "invalid_public_key",
    });
    const missing = validateDelegatedRuntimeKeyMaterial({
      keyId: DELEGATED_RUNTIME_KEY_ID,
      privateKeyPem: "",
      publicKeyPem: "",
    });
    expect(missing).toMatchObject({ ok: false, error: "invalid_private_key" });
  });

  it("refuses a public key that does not match the private key", () => {
    const pairA = generateEd25519KeyPairPem();
    const pairB = generateEd25519KeyPairPem();
    const result = validateDelegatedRuntimeKeyMaterial({
      keyId: DELEGATED_RUNTIME_KEY_ID,
      privateKeyPem: pairA.privateKeyPem,
      publicKeyPem: pairB.publicKeyPem,
    });
    expect(result).toMatchObject({
      ok: false,
      error: "key_pair_mismatch",
    });
  });

  it("never leaks PEM material in errors or results", () => {
    const pairA = generateEd25519KeyPairPem();
    const pairB = generateEd25519KeyPairPem();
    const failures = [
      validateDelegatedRuntimeKeyMaterial({
        keyId: "owner-ed25519-v1",
        privateKeyPem: pairA.privateKeyPem,
        publicKeyPem: pairA.publicKeyPem,
      }),
      validateDelegatedRuntimeKeyMaterial({
        keyId: DELEGATED_RUNTIME_KEY_ID,
        privateKeyPem: "not-a-pem",
        publicKeyPem: pairA.publicKeyPem,
      }),
      validateDelegatedRuntimeKeyMaterial({
        keyId: DELEGATED_RUNTIME_KEY_ID,
        privateKeyPem: pairA.privateKeyPem,
        publicKeyPem: pairB.publicKeyPem,
      }),
    ];
    const serialized = JSON.stringify(failures);
    expect(serialized).not.toContain("PRIVATE KEY");
    expect(serialized).not.toContain("BEGIN");
    const success = validateDelegatedRuntimeKeyMaterial(ed25519Material());
    expect(success.ok).toBe(true);
    if (!success.ok) return;
    expect(Object.keys(success).sort()).toEqual(["fingerprint", "ok"]);
  });

  it("performs no key generation and no filesystem access", () => {
    const source = readFileSync(
      new URL("./delegated-key-custody.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("generateKeyPair");
    expect(source).not.toContain("writeFile");
    expect(source).not.toContain("randomBytes");
    expect(source).not.toContain("env");
  });
});
