import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  decryptPrivateKeyPem,
  parseEncryptedKeyEnvelope,
} from "@composer-assistant/sandbox-broker";
import { env } from "../../env.js";

export type SandboxKeyRole = "owner-approval" | "continuity-tombstone";

function defaultKeysDir(): string {
  return join(homedir(), ".composer-assistant", "keys");
}

export function resolveSandboxKeyPaths(role: SandboxKeyRole): {
  encryptedPath: string;
  publicPath: string;
  keyId: string;
} {
  const keysDir = env.sandboxKeysDir;
  if (role === "owner-approval") {
    return {
      encryptedPath: env.sandboxOwnerApprovalKeyEncPath,
      publicPath: join(keysDir, `${env.sandboxOwnerKeyId}.pub`),
      keyId: env.sandboxOwnerKeyId,
    };
  }
  return {
    encryptedPath: env.sandboxContinuityKeyEncPath,
    publicPath: join(keysDir, `${env.sandboxContinuityKeyId}.pub`),
    keyId: env.sandboxContinuityKeyId,
  };
}

export function readSandboxPassphrase(): string {
  const path = env.sandboxKeyPassphrasePath;
  if (!existsSync(path)) {
    throw new Error("sandbox_passphrase_missing");
  }
  const passphrase = readFileSync(path, "utf8").trim();
  if (!passphrase) {
    throw new Error("sandbox_passphrase_empty");
  }
  return passphrase;
}

export function readSandboxPublicKeyPem(role: SandboxKeyRole): string {
  const { publicPath } = resolveSandboxKeyPaths(role);
  if (!existsSync(publicPath)) {
    throw new Error("sandbox_public_key_missing");
  }
  return readFileSync(publicPath, "utf8");
}

export function withSandboxPrivateKeyPem<T>(
  role: SandboxKeyRole,
  fn: (privateKeyPem: string) => T,
): T {
  const { encryptedPath } = resolveSandboxKeyPaths(role);
  if (!existsSync(encryptedPath)) {
    throw new Error("sandbox_private_key_missing");
  }
  const passphrase = readSandboxPassphrase();
  const envelope = parseEncryptedKeyEnvelope(readFileSync(encryptedPath, "utf8"));
  const privateKeyPem = decryptPrivateKeyPem(envelope, passphrase);
  try {
    return fn(privateKeyPem);
  } finally {
    // Private key PEM is scoped to this call only; avoid retaining references.
  }
}

export function sandboxKeysConfigured(): {
  ownerApproval: boolean;
  continuityTombstone: boolean;
} {
  const owner = resolveSandboxKeyPaths("owner-approval");
  const continuity = resolveSandboxKeyPaths("continuity-tombstone");
  return {
    ownerApproval:
      existsSync(owner.encryptedPath) &&
      existsSync(owner.publicPath) &&
      existsSync(env.sandboxKeyPassphrasePath),
    continuityTombstone:
      existsSync(continuity.encryptedPath) &&
      existsSync(continuity.publicPath) &&
      existsSync(env.sandboxKeyPassphrasePath),
  };
}

export function defaultSandboxKeysDir(): string {
  return defaultKeysDir();
}
