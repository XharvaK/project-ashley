import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  createBroker,
  DurableBrokerStore,
  type BrokerRecipe,
} from "./index.js";
import { publicKeyFromPem } from "./crypto/approval.js";
import { tombstonePublicKeyFromPem } from "./crypto/tombstone.js";
import { parseEncryptedKeyEnvelope, decryptPrivateKeyPem } from "./crypto/key-custody.js";
import { ChildProcessRunner } from "./process/real-runner.js";
import { loadRecipeManifest } from "./policy/recipes.js";
import { createLinuxPeerCredentialResolver } from "./peer-credentials.js";
import { UnixBrokerServer } from "./server.js";
import { toCanonicalBrokerPath } from "./policy/path.js";
import { fixedRecipeRegistry } from "./policy/recipe-registry.js";
import {
  createUnavailableNetworkIsolation,
  type NetworkIsolationProvider,
} from "./execution/network-isolation.js";
import type { DelegatedRuntimeConfig } from "./delegated/runtime.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function keyIdFromPath(path: string): string {
  return basename(path).replace(/\.(?:pem|pub)$/i, "");
}

function readPublicKey(path: string, kind: "owner" | "continuity") {
  const pem = readFileSync(path, "utf8");
  return kind === "owner" ? publicKeyFromPem(pem) : tombstonePublicKeyFromPem(pem);
}

function readPublicKeyPem(path: string): string {
  return readFileSync(path, "utf8");
}

function boolEnv(name: string): boolean {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

/**
 * Loads host-side delegated runtime material behind
 * `ASHLEY_SANDBOX_DELEGATED_ENABLED`. All private-key material is decrypted
 * here (host-only) and handed to the broker as PEM; only the delegated public
 * key is derived and retained; the delegated private key is discarded after
 * derivation. Returns null when the surface is disabled. Fail-closed on any
 * missing dependency so the delegated surface can never run half-provisioned.
 *
 * NOTE: `ASHLEY_SANDBOX_NETWORK_PROVIDER=none` (the Mint network-namespace
 * seam) is not release-qualified; selecting it refuses boot.
 */
function loadDelegatedRuntimeConfig(
  keysDir: string,
): {
  config: DelegatedRuntimeConfig;
  networkIsolation: NetworkIsolationProvider;
} | null {
  if (!boolEnv("ASHLEY_SANDBOX_DELEGATED_ENABLED")) return null;

  const passphrasePath =
    process.env.ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH?.trim() ??
    join(homedir(), ".composer-assistant", "keys", "master.pass");
  const passphrase = readFileSync(passphrasePath, "utf8").trim();

  const delegatedPublicPath =
    process.env.ASHLEY_SANDBOX_DELEGATED_PUBLIC_KEY?.trim() ??
    join(keysDir, "delegated-runtime-ed25519-v1.pub");
  const capabilityEncPath =
    process.env.ASHLEY_SANDBOX_CAPABILITY_KEY_ENC_PATH?.trim() ??
    join(keysDir, "broker-session-capability.key.enc");
  const ownerKeyPath = requiredEnv("ASHLEY_SANDBOX_OWNER_PUBLIC_KEY");
  const continuityKeyPath = requiredEnv("ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY");
  const policyArtifactPath = requiredEnv("ASHLEY_SANDBOX_POLICY_ARTIFACT");
  const policySignaturePath = requiredEnv("ASHLEY_SANDBOX_POLICY_SIGNATURE");
  const workspaceRoot = requiredEnv("ASHLEY_SANDBOX_WORKSPACE_ROOT");
  const delegatedKeyId =
    process.env.ASHLEY_SANDBOX_DELEGATED_KEY_ID?.trim() ?? "delegated-runtime-ed25519-v1";
  const capabilityKeyId =
    process.env.ASHLEY_SANDBOX_CAPABILITY_KEY_ID?.trim() ??
    "broker-session-capability-ed25519-v1";

  const networkProvider = process.env.ASHLEY_SANDBOX_NETWORK_PROVIDER?.trim() ?? "unavailable";
  if (networkProvider !== "unavailable") {
    throw new Error(
      `ASHLEY_SANDBOX_NETWORK_PROVIDER=${networkProvider} is not release-qualified; only "unavailable" is supported`,
    );
  }
  const networkIsolation = createUnavailableNetworkIsolation();

  const delegatedPublicPem = readPublicKeyPem(delegatedPublicPath);

  const capabilityPrivatePem = decryptPrivateKeyPem(
    parseEncryptedKeyEnvelope(readFileSync(capabilityEncPath, "utf8")),
    passphrase,
  );
  const capabilityPublicPem = createPublicKey(createPrivateKey(capabilityPrivatePem)).export({
    type: "spki",
    format: "pem",
  }).toString();

  const workspaceRootCanonical = toCanonicalBrokerPath(realpathSync(workspaceRoot));
  if (!workspaceRootCanonical.ok) {
    throw new Error("sandbox_delegated_runtime: workspace_root_not_canonical");
  }

  const policyArtifactCanonical = toCanonicalBrokerPath(policyArtifactPath);
  const policySignatureCanonical = toCanonicalBrokerPath(policySignaturePath);
  if (!policyArtifactCanonical.ok || !policySignatureCanonical.ok) {
    throw new Error("sandbox_delegated_runtime: policy_path_not_canonical");
  }

  const envAllowlist = new Set<string>(["PATH", "NODE_OPTIONS"]);
  return {
    config: {
      ownerId: requiredEnv("ASHLEY_SANDBOX_OWNER_ID"),
      ownerKeyId: process.env.ASHLEY_SANDBOX_OWNER_KEY_ID?.trim() || keyIdFromPath(ownerKeyPath),
      ownerPublicKeyPem: readPublicKeyPem(ownerKeyPath),
      continuityKeyId:
        process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ID?.trim() || keyIdFromPath(continuityKeyPath),
      continuityPublicKeyPem: readPublicKeyPem(continuityKeyPath),
      delegatedKeyId,
      delegatedPublicKeyPem: delegatedPublicPem,
      capabilitySigning: {
        keyId: capabilityKeyId,
        privateKeyPem: capabilityPrivatePem,
        publicKeyPem: capabilityPublicPem,
      },
      policyArtifactPath: policyArtifactCanonical.value,
      policySignaturePath: policySignatureCanonical.value,
      workspaceRoot: workspaceRootCanonical.value,
      recipes: fixedRecipeRegistry(),
      envAllowlist,
      executableMappings: {},
      networkProvider: "unavailable",
    },
    networkIsolation,
  };
}

function parseUid(): number {
  const raw = requiredEnv("ASHLEY_SANDBOX_AGENT_UID");
  const uid = Number(raw);
  if (!Number.isInteger(uid) || uid < 0) throw new Error("ASHLEY_SANDBOX_AGENT_UID_invalid");
  return uid;
}

function createProductionBroker() {
  const stateRoot = requiredEnv("ASHLEY_SANDBOX_STATE_ROOT");
  const workspaceRoot = requiredEnv("ASHLEY_SANDBOX_WORKSPACE_ROOT");
  const ownerId = requiredEnv("ASHLEY_SANDBOX_OWNER_ID");
  const ownerKeyPath = requiredEnv("ASHLEY_SANDBOX_OWNER_PUBLIC_KEY");
  const continuityKeyPath = requiredEnv("ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY");
  const manifestPath =
    process.env.ASHLEY_SANDBOX_RECIPE_MANIFEST?.trim() ??
    join(stateRoot, "meta", "recipes.json");
  const helperPath = requiredEnv("ASHLEY_SANDBOX_PEER_CREDENTIAL_HELPER");
  if (!existsSync(helperPath)) throw new Error("peer_credentials_helper_missing");
  const recipes = loadRecipeManifest(manifestPath);
  const ownerKeyId = process.env.ASHLEY_SANDBOX_OWNER_KEY_ID?.trim() || keyIdFromPath(ownerKeyPath);
  const continuityKeyId =
    process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ID?.trim() || keyIdFromPath(continuityKeyPath);
  const store = new DurableBrokerStore(stateRoot);
  const executables = new Set<string>();
  const envAllowlist = new Set<string>(["PATH", "NODE_OPTIONS"]);
  for (const recipe of recipes.values()) {
    if (recipe.supported) executables.add(recipe.executable);
    for (const name of recipe.envAllowlist ?? []) envAllowlist.add(name);
  }
  const keysDir =
    process.env.ASHLEY_SANDBOX_KEYS_DIR?.trim() ??
    join(homedir(), ".composer-assistant", "keys");
  const delegated = loadDelegatedRuntimeConfig(keysDir);
  const broker = createBroker({
    workspaceRoot,
    ownerId,
    approval: {
      keys: [{ keyId: ownerKeyId, publicKey: readPublicKey(ownerKeyPath, "owner") }],
    },
    tombstone: {
      keys: [
        {
          continuityKeyId,
          publicKey: readPublicKey(continuityKeyPath, "continuity"),
        },
      ],
    },
    interpreterAllowlist: executables,
    envAllowlist,
    processRunner: new ChildProcessRunner(),
    store,
    recipes: recipes as Map<string, BrokerRecipe>,
    ...(delegated
      ? { delegatedRuntimeConfig: delegated.config, networkIsolation: delegated.networkIsolation }
      : {}),
  });
  broker.restart();
  return { broker, store, helperPath, ownerId };
}

async function main(): Promise<void> {
  if (process.platform !== "linux") throw new Error("linux_required");
  const activated = process.argv.includes("--socket-activated");
  const socketPath = process.env.ASHLEY_SANDBOX_SOCKET?.trim();
  if (!activated && !socketPath) throw new Error("socket_activation_or_path_required");
  const production = createProductionBroker();
  const server = new UnixBrokerServer({
    broker: production.broker,
    ownerId: production.ownerId,
    ...(activated ? { listenFd: 3 } : { socketPath }),
    expectedPeerUid: parseUid(),
    peerCredentialResolver: createLinuxPeerCredentialResolver(production.helperPath),
    logger: console,
  });
  await server.start();
  const flushTimer = setInterval(() => {
    try {
      production.store.flush();
    } catch (error) {
      console.error(`sandbox broker persistence failure: ${String(error)}`);
    }
  }, 1_000);
  flushTimer.unref();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(flushTimer);
    await server.stop();
    production.store.close();
  };
  process.once("SIGTERM", () => void stop().finally(() => process.exit(0)));
  process.once("SIGINT", () => void stop().finally(() => process.exit(0)));
}

main().catch((error) => {
  console.error(`sandbox broker refused to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
