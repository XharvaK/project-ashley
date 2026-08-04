import { describe, expect, it } from "vitest";
import {
  decryptPrivateKeyPem,
  encryptPrivateKeyPem,
  generateEd25519KeyPairPem,
  parseEncryptedKeyEnvelope,
} from "./key-custody.js";

describe("key-custody", () => {
  it("round-trips encrypted private key PEM", () => {
    const pair = generateEd25519KeyPairPem();
    const envelope = encryptPrivateKeyPem(
      pair.privateKeyPem,
      "test-passphrase",
      "owner-ed25519-v1",
    );
    const decrypted = decryptPrivateKeyPem(envelope, "test-passphrase");
    expect(decrypted).toBe(pair.privateKeyPem);
  });

  it("rejects wrong passphrase", () => {
    const pair = generateEd25519KeyPairPem();
    const envelope = encryptPrivateKeyPem(
      pair.privateKeyPem,
      "correct",
      "owner-ed25519-v1",
    );
    expect(() => decryptPrivateKeyPem(envelope, "wrong")).toThrow();
  });

  it("parses envelope JSON", () => {
    const pair = generateEd25519KeyPairPem();
    const envelope = encryptPrivateKeyPem(
      pair.privateKeyPem,
      "pass",
      "continuity-tombstone-ed25519-v1",
    );
    const parsed = parseEncryptedKeyEnvelope(JSON.stringify(envelope));
    expect(parsed.keyId).toBe("continuity-tombstone-ed25519-v1");
    expect(decryptPrivateKeyPem(parsed, "pass")).toBe(pair.privateKeyPem);
  });
});
