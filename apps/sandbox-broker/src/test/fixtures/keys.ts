import { generateKeyPairSync } from "node:crypto";
import {
  publicKeyFromPem,
  signApprovalEnvelope,
} from "../../crypto/approval.js";
import {
  tombstonePublicKeyFromPem,
  signTombstoneEnvelope,
} from "../../crypto/tombstone.js";
import type { ApprovalEnvelope, TombstoneEnvelope } from "../../crypto/types.js";
import { randomNonce } from "../../crypto/types.js";

export interface TestKeyMaterial {
  ownerPrivateKeyPem: string;
  ownerPublicKeyPem: string;
  continuityPrivateKeyPem: string;
  continuityPublicKeyPem: string;
}

export function createTestKeys(): TestKeyMaterial {
  const owner = generateKeyPairSync("ed25519");
  const continuity = generateKeyPairSync("ed25519");
  return {
    ownerPrivateKeyPem: owner.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    ownerPublicKeyPem: owner.publicKey.export({ type: "spki", format: "pem" }).toString(),
    continuityPrivateKeyPem: continuity.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    continuityPublicKeyPem: continuity.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
  };
}

export function baseApproval(
  overrides: Partial<ApprovalEnvelope> = {},
): Omit<ApprovalEnvelope, "signature"> {
  const now = Date.now();
  return {
    protocolVersion: 1,
    keyId: "owner-ed25519-v1",
    taskId: "task-1",
    ownerId: "owner-1",
    scope: "task.submit",
    argv: ["/bin/echo", "hi"],
    cwd: "workspace",
    inputArtifactRefs: [],
    inputHashes: [],
    riskClass: "observe",
    limits: { wallMs: 1000, maxProcesses: 4, maxOutputBytes: 1024 },
    networkMode: "none",
    expiresAt: now + 60_000,
    nonce: randomNonce(),
    ...overrides,
  };
}

export function signedApproval(
  keys: TestKeyMaterial,
  overrides: Partial<ApprovalEnvelope> = {},
): ApprovalEnvelope {
  return signApprovalEnvelope(baseApproval(overrides), keys.ownerPrivateKeyPem);
}

export function signedTombstone(
  keys: TestKeyMaterial,
  overrides: Partial<TombstoneEnvelope> = {},
): TombstoneEnvelope {
  const now = Date.now();
  return signTombstoneEnvelope(
    {
      protocolVersion: 1,
      continuityKeyId: "continuity-tombstone-ed25519-v1",
      tombstoneId: "tomb-1",
      ownerId: "owner-1",
      targets: [],
      issuedAt: now,
      expiresAt: now + 60_000,
      ...overrides,
    },
    keys.continuityPrivateKeyPem,
  );
}

export function approvalVerifier(keys: TestKeyMaterial) {
  return {
    keys: [
      {
        keyId: "owner-ed25519-v1",
        publicKey: publicKeyFromPem(keys.ownerPublicKeyPem),
      },
    ],
  };
}

export function tombstoneVerifier(keys: TestKeyMaterial) {
  return {
    keys: [
      {
        continuityKeyId: "continuity-tombstone-ed25519-v1",
        publicKey: tombstonePublicKeyFromPem(keys.continuityPublicKeyPem),
      },
    ],
  };
}
