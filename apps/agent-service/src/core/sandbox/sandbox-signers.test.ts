import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encryptPrivateKeyPem,
  generateEd25519KeyPairPem,
  publicKeyFromPem,
  tombstonePublicKeyFromPem,
  verifyApprovalEnvelope,
  verifyTombstoneEnvelope,
} from "@composer-assistant/sandbox-broker";

const OWNER_ID = "owner-test-1";
const OWNER_KEY_ID = "owner-ed25519-v1";
const CONTINUITY_KEY_ID = "continuity-tombstone-ed25519-v1";

let keysDir = "";
let ownerPair = generateEd25519KeyPairPem();
let continuityPair = generateEd25519KeyPairPem();
const passphrase = "test-passphrase-123";

function setSandboxKeyEnv(): void {
  process.env.ASHLEY_SANDBOX_KEYS_DIR = keysDir;
  process.env.ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH = join(keysDir, "master.pass");
  process.env.ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH = join(keysDir, "owner-approval.key.enc");
  process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH = join(
    keysDir,
    "continuity-tombstone.key.enc",
  );
  process.env.ASHLEY_SANDBOX_OWNER_KEY_ID = OWNER_KEY_ID;
  process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ID = CONTINUITY_KEY_ID;
}

async function importFresh<T>(modulePath: string): Promise<T> {
  vi.resetModules();
  setSandboxKeyEnv();
  return import(modulePath) as Promise<T>;
}

function writeKeyMaterial() {
  writeFileSync(join(keysDir, "master.pass"), `${passphrase}\n`, { mode: 0o600 });
  writeFileSync(
    join(keysDir, "owner-approval.key.enc"),
    `${JSON.stringify(
      encryptPrivateKeyPem(ownerPair.privateKeyPem, passphrase, OWNER_KEY_ID),
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(keysDir, "continuity-tombstone.key.enc"),
    `${JSON.stringify(
      encryptPrivateKeyPem(continuityPair.privateKeyPem, passphrase, CONTINUITY_KEY_ID),
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(keysDir, `${OWNER_KEY_ID}.pub`), ownerPair.publicKeyPem, {
    mode: 0o600,
  });
  writeFileSync(join(keysDir, `${CONTINUITY_KEY_ID}.pub`), continuityPair.publicKeyPem, {
    mode: 0o600,
  });
}

describe("sandbox signers", () => {
  beforeEach(() => {
    keysDir = mkdtempSync(join(tmpdir(), "ashley-sandbox-keys-"));
    ownerPair = generateEd25519KeyPairPem();
    continuityPair = generateEd25519KeyPairPem();
    writeKeyMaterial();
  });

  afterEach(() => {
    delete process.env.ASHLEY_SANDBOX_KEYS_DIR;
    delete process.env.ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH;
    delete process.env.ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH;
    delete process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH;
    delete process.env.ASHLEY_SANDBOX_OWNER_KEY_ID;
    delete process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ID;
    vi.resetModules();
  });

  it("signs and verifies owner approval envelopes", async () => {
    const { signOwnerApprovalEnvelope } = await importFresh<typeof import("./approval-signer.js")>(
      "./approval-signer.js",
    );
    const now = Date.now();
    const envelope = signOwnerApprovalEnvelope(OWNER_ID, {
      protocolVersion: 1,
      taskId: "task-1",
      ownerId: OWNER_ID,
      scope: "task.submit",
      argv: ["/bin/echo", "hi"],
      cwd: "workspace",
      inputArtifactRefs: [],
      inputHashes: [],
      riskClass: "observe",
      limits: { wallMs: 1000, maxProcesses: 4, maxOutputBytes: 1024 },
      networkMode: "none",
      expiresAt: now + 60_000,
      nonce: "nonce-abc",
    });
    const verified = verifyApprovalEnvelope(envelope, {
      keys: [{ keyId: OWNER_KEY_ID, publicKey: publicKeyFromPem(ownerPair.publicKeyPem) }],
    });
    expect(verified).toEqual({ ok: true });
    expect(envelope.signature).toBeTruthy();
  });

  it("signs and verifies continuity tombstone envelopes", async () => {
    const { signContinuityTombstoneEnvelope } = await importFresh<
      typeof import("./tombstone-signer.js")
    >("./tombstone-signer.js");
    const now = Date.now();
    const envelope = signContinuityTombstoneEnvelope(OWNER_ID, {
      protocolVersion: 1,
      tombstoneId: "tomb-1",
      ownerId: OWNER_ID,
      targets: [{ entityUuid: "uuid-1", artifactRef: "ref-1" }],
      issuedAt: now,
      expiresAt: now + 60_000,
    });
    const verified = verifyTombstoneEnvelope(envelope, {
      keys: [
        {
          continuityKeyId: CONTINUITY_KEY_ID,
          publicKey: tombstonePublicKeyFromPem(continuityPair.publicKeyPem),
        },
      ],
    });
    expect(verified).toEqual({ ok: true });
    expect(envelope.signature).toBeTruthy();
  });
});
