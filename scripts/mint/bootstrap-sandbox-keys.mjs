#!/usr/bin/env node
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const brokerDist = join(repoRoot, "apps/sandbox-broker/dist/crypto/key-custody.js");

async function loadKeyCustody() {
  if (!existsSync(brokerDist)) {
    throw new Error(
      "sandbox-broker is not built. Run: npm run build --prefix apps/sandbox-broker",
    );
  }
  return import(pathToFileURL(brokerDist).href);
}

function parseArgs(argv) {
  const options = {
    force: false,
    keysDir: join(homedir(), ".composer-assistant", "keys"),
    ownerKeyId: "owner-ed25519-v1",
    continuityKeyId: "continuity-tombstone-ed25519-v1",
    delegatedKeyId: "delegated-runtime-ed25519-v1",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force" || arg === "-Force") {
      options.force = true;
    } else if (arg === "--keys-dir" && argv[i + 1]) {
      options.keysDir = resolve(argv[++i]);
    } else if (arg === "--owner-key-id" && argv[i + 1]) {
      options.ownerKeyId = argv[++i];
    } else if (arg === "--continuity-key-id" && argv[i + 1]) {
      options.continuityKeyId = argv[++i];
    } else if (arg === "--delegated-key-id" && argv[i + 1]) {
      options.delegatedKeyId = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/mint/bootstrap-sandbox-keys.mjs [--force]

Generates the three operator-side Ed25519 signing keypairs required by the
sandbox trust model:
  1. owner policy signing key        (owner-ed25519-v1)
  2. continuity tombstone signing key (continuity-tombstone-ed25519-v1)
  3. delegated runtime signing key   (delegated-runtime-ed25519-v1)

The broker session-capability key is NOT generated here: it is broker-owned
and produced on the Mint host per capability-custody.ts.

Private keys are encrypted to ~/.composer-assistant/keys/*.key.enc.
Public keys are written as PEM *.pub files. A master.pass file is created
when missing. Never prints private key material.`);
}

function assertWritable(path, force) {
  if (existsSync(path) && !force) {
    throw new Error(`Refusing to overwrite existing file: ${path} (pass --force)`);
  }
}

function writeRestricted(path, content) {
  writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows may not support chmod; restricted mode on write is best-effort.
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const {
    encryptPrivateKeyPem,
    generateEd25519KeyPairPem,
  } = await loadKeyCustody();

  mkdirSync(options.keysDir, { recursive: true, mode: 0o700 });

  const ownerPrivatePath = join(options.keysDir, "owner-approval.key.enc");
  const continuityPrivatePath = join(options.keysDir, "continuity-tombstone.key.enc");
  const delegatedPrivatePath = join(options.keysDir, "delegated-runtime.key.enc");
  const ownerPublicPath = join(options.keysDir, `${options.ownerKeyId}.pub`);
  const continuityPublicPath = join(options.keysDir, `${options.continuityKeyId}.pub`);
  const delegatedPublicPath = join(options.keysDir, `${options.delegatedKeyId}.pub`);
  const passphrasePath = join(options.keysDir, "master.pass");

  for (const path of [
    ownerPrivatePath,
    continuityPrivatePath,
    delegatedPrivatePath,
    ownerPublicPath,
    continuityPublicPath,
    delegatedPublicPath,
  ]) {
    assertWritable(path, options.force);
  }

  let passphrase;
  if (existsSync(passphrasePath)) {
    passphrase = readFileSync(passphrasePath, "utf8").trim();
    if (!passphrase) {
      throw new Error(`Passphrase file is empty: ${passphrasePath}`);
    }
  } else {
    passphrase = randomBytes(32).toString("base64url");
    writeRestricted(passphrasePath, `${passphrase}\n`);
    console.log(`Created passphrase file: ${passphrasePath}`);
  }

  const ownerPair = generateEd25519KeyPairPem();
  const continuityPair = generateEd25519KeyPairPem();
  const delegatedPair = generateEd25519KeyPairPem();

  writeRestricted(
    ownerPrivatePath,
    `${JSON.stringify(
      encryptPrivateKeyPem(ownerPair.privateKeyPem, passphrase, options.ownerKeyId),
      null,
      2,
    )}\n`,
  );
  writeRestricted(
    continuityPrivatePath,
    `${JSON.stringify(
      encryptPrivateKeyPem(
        continuityPair.privateKeyPem,
        passphrase,
        options.continuityKeyId,
      ),
      null,
      2,
    )}\n`,
  );
  writeRestricted(
    delegatedPrivatePath,
    `${JSON.stringify(
      encryptPrivateKeyPem(
        delegatedPair.privateKeyPem,
        passphrase,
        options.delegatedKeyId,
      ),
      null,
      2,
    )}\n`,
  );
  writeRestricted(ownerPublicPath, ownerPair.publicKeyPem);
  writeRestricted(continuityPublicPath, continuityPair.publicKeyPem);
  writeRestricted(delegatedPublicPath, delegatedPair.publicKeyPem);

  console.log("Sandbox signing keys bootstrapped.");
  console.log(`  Owner private (encrypted): ${ownerPrivatePath}`);
  console.log(`  Continuity private (encrypted): ${continuityPrivatePath}`);
  console.log(`  Delegated runtime private (encrypted): ${delegatedPrivatePath}`);
  console.log(`  Owner public: ${ownerPublicPath}`);
  console.log(`  Continuity public: ${continuityPublicPath}`);
  console.log(`  Delegated runtime public: ${delegatedPublicPath}`);
  console.log(`  Passphrase file: ${passphrasePath}`);
  console.log("Next: stage public keys to Mint with sandbox.ps1 -Action StagePublicKeys");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
