import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  decryptPrivateKeyPem,
  parseEncryptedKeyEnvelope,
} from "../../apps/sandbox-broker/dist/crypto/key-custody.js";
import {
  ownerPolicyKeyFromPem,
  signDelegatedPolicyArtifact,
  verifyDelegatedPolicyArtifact,
} from "../../apps/sandbox-broker/dist/crypto/delegated-policy.js";
import {
  prepareR4005Policy,
  R4005_POLICY_ID,
  R4005_POLICY_VERSION,
} from "../../apps/sandbox-broker/dist/crypto/delegated-policy-issuance.js";

const OWNER_SIGNER_KEY_ID = "owner-ed25519-v1";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  return value?.trim() || undefined;
}

function ownerAction(message) {
  console.error("OWNER_ACTION_REQUIRED");
  if (message) console.error(message);
  console.error("R4-005 was not issued, activated, or deployed.");
  console.error("The owner must explicitly approve and invoke:");
  console.error(
    "node scripts/mint/issue-sandbox-policy.mjs " +
      "--source-policy <R4-004 policy.json> " +
      "--owner-private-key-enc <owner encrypted private key> " +
      "--passphrase-file <owner passphrase file> " +
      "--owner-public-key <owner public key> " +
      "--output-dir <new r4-005 staging directory> " +
      "--confirm-owner-issuance",
  );
  process.exitCode = 77;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name}_missing`);
  return resolve(value);
}

function readText(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`${label}_unreadable`);
  }
}

function writeFileDurably(path, content) {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeSync(fd, content, undefined, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function fsyncDirectory(path) {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function main() {
  if (!process.argv.includes("--confirm-owner-issuance")) {
    ownerAction("--confirm-owner-issuance is required; signing material was not read");
    return;
  }

  const sourcePolicyPath = requiredArgument("--source-policy");
  const ownerPrivateKeyPath = requiredArgument("--owner-private-key-enc");
  const passphrasePath = requiredArgument("--passphrase-file");
  const ownerPublicKeyPath = requiredArgument("--owner-public-key");
  const outputDir = requiredArgument("--output-dir");
  const explicitExpiresAt = argument("--expires-at");

  if (basename(outputDir).toLowerCase() !== "r4-005") {
    throw new Error("--output-dir_must_be_a_new_r4-005_directory");
  }
  for (const [path, label] of [
    [sourcePolicyPath, "source_policy"],
    [ownerPrivateKeyPath, "owner_private_key"],
    [passphrasePath, "passphrase"],
    [ownerPublicKeyPath, "owner_public_key"],
  ]) {
    if (!existsSync(path) || !statSync(path).isFile()) {
      if (label !== "source_policy") {
        ownerAction(`${label}_missing; the owner must provide the controlled signing material`);
        return;
      }
      throw new Error(`${label}_missing`);
    }
  }
  if (existsSync(outputDir)) throw new Error("output_dir_already_exists");

  const sourcePolicy = JSON.parse(readText(sourcePolicyPath, "source_policy"));
  const preparation = prepareR4005Policy(sourcePolicy, {
    issuedAt: Date.now(),
    ...(explicitExpiresAt === undefined ? {} : { expiresAt: explicitExpiresAt }),
  });
  if (!preparation.ok) {
    if (preparation.reason === "policy_lifetime_decision_required") {
      ownerAction(
        "The source policy has no expiry convention. Choose an explicit --expires-at before owner issuance.",
      );
      return;
    }
    throw new Error(
      `r4_005_preparation_failed:${preparation.reason}` +
        (preparation.details?.length ? `:${preparation.details.join(",")}` : ""),
    );
  }

  let ownerPrivateKeyPem;
  let ownerPublicKey;
  try {
    const encryptedKey = parseEncryptedKeyEnvelope(
      readText(ownerPrivateKeyPath, "owner_private_key"),
    );
    const passphrase = readText(passphrasePath, "passphrase").trim();
    ownerPrivateKeyPem = decryptPrivateKeyPem(encryptedKey, passphrase);
    ownerPublicKey = ownerPolicyKeyFromPem(
      readText(ownerPublicKeyPath, "owner_public_key"),
    );
  } catch {
    ownerAction(
      "The controlled owner key or passphrase could not be read or verified; review the owner signing material and invoke again.",
    );
    return;
  }
  const signed = signDelegatedPolicyArtifact(
    preparation.policy,
    ownerPrivateKeyPem,
    OWNER_SIGNER_KEY_ID,
  );
  const verified = verifyDelegatedPolicyArtifact(
    { payload: signed.payload, signature: signed.signature },
    { keys: [{ keyId: OWNER_SIGNER_KEY_ID, publicKey: ownerPublicKey }] },
    Date.parse(preparation.policy.issuedAt),
  );
  if (!verified.ok) {
    throw new Error(`r4_005_local_verification_failed:${verified.error}:${verified.reason}`);
  }

  const parentDir = dirname(outputDir);
  mkdirSync(parentDir, { recursive: true });
  const stagingDir = join(
    parentDir,
    `.${basename(outputDir)}.staging-${process.pid}-${randomUUID()}`,
  );
  mkdirSync(stagingDir, { mode: 0o700 });
  try {
    writeFileDurably(
      join(stagingDir, "policy.json"),
      JSON.stringify(signed.payload, null, 2) + "\n",
    );
    writeFileDurably(
      join(stagingDir, "policy.json.sig"),
      JSON.stringify(signed.signature, null, 2) + "\n",
    );
    renameSync(stagingDir, outputDir);
    fsyncDirectory(parentDir);
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  console.log(`policyId=${R4005_POLICY_ID}`);
  console.log(`policyVersion=${R4005_POLICY_VERSION}`);
  console.log(`issuedAt=${preparation.policy.issuedAt}`);
  console.log(`expiresAt=${preparation.policy.expiresAt}`);
  console.log(`lifetimeMs=${preparation.lifetimeMs}`);
  console.log(`lifetimeSource=${preparation.lifetimeSource}`);
  console.log(`policyHash=${verified.policyHash}`);
  console.log(`outputDir=${outputDir}`);
  console.log("OWNER_ISSUANCE=EXPLICIT");
  console.log("ACTIVATION=NONE");
  console.log("DEPLOY=NONE");
}

try {
  main();
} catch (error) {
  console.error(
    "R4-005 issuance failed: " +
      (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
}
