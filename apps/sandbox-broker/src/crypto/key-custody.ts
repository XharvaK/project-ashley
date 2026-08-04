import {
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
} from "node:crypto";

export interface EncryptedKeyEnvelope {
  v: 1;
  alg: "aes-256-gcm";
  keyId: string;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface Ed25519KeyPairPem {
  privateKeyPem: string;
  publicKeyPem: string;
}

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

export function generateEd25519KeyPairPem(): Ed25519KeyPairPem {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

export function encryptPrivateKeyPem(
  privateKeyPem: string,
  passphrase: string,
  keyId: string,
): EncryptedKeyEnvelope {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKeyPem, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return {
    v: 1,
    alg: "aes-256-gcm",
    keyId,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

export function decryptPrivateKeyPem(
  envelope: EncryptedKeyEnvelope,
  passphrase: string,
): string {
  if (envelope.v !== 1 || envelope.alg !== "aes-256-gcm") {
    throw new Error("unsupported_key_envelope");
  }
  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  key.fill(0);
  return decrypted.toString("utf8");
}

export function parseEncryptedKeyEnvelope(raw: string): EncryptedKeyEnvelope {
  const parsed = JSON.parse(raw) as EncryptedKeyEnvelope;
  if (
    parsed.v !== 1 ||
    parsed.alg !== "aes-256-gcm" ||
    typeof parsed.keyId !== "string" ||
    typeof parsed.salt !== "string" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new Error("invalid_key_envelope");
  }
  return parsed;
}
