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
import type { ProcessRunner } from "./process/fake-runner.js";
import { loadRecipeManifest } from "./policy/recipes.js";
import { createLinuxPeerCredentialResolver } from "./peer-credentials.js";
import { UnixBrokerServer } from "./server.js";
import { toCanonicalBrokerPath } from "./policy/path.js";
import { fixedRecipeRegistry } from "./policy/recipe-registry.js";
import { selectProductionNetworkIsolation, assertNetworkIsolationProbeOperational } from "./execution/linux-network-isolation.js";
import { executableMappingsFromEnv } from "./execution/executable-mappings.js";
import type { NetworkIsolationProvider } from "./execution/network-isolation.js";
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
 * NOTE: the network provider seam defaults to `unavailable` (R4 behavior).
 * `ASHLEY_SANDBOX_NETWORK_PROVIDER=none` selects the R5A spawn-coupled Linux
 * namespace isolation, but only when the R5B host qualification flag
 * `ASHLEY_SANDBOX_NETWORK_ISOLATION_QUALIFIED=true` is also set; the
 * installer writes both, and default configuration stays fail-closed. When
 * `none` is selected the broker runs the R5B boot-time active isolation
 * probe and refuses to start unless the mechanism is actually usable.
 */
async function loadDelegatedRuntimeConfig(
  keysDir: string,
  processRunner: ProcessRunner,
): Promise<
  {
    config: DelegatedRuntimeConfig;
    networkIsolation: NetworkIsolationProvider;
  } | null
> {
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

  const selection = selectProductionNetworkIsolation({
    providerName: process.env.ASHLEY_SANDBOX_NETWORK_PROVIDER,
    qualified: boolEnv("ASHLEY_SANDBOX_NETWORK_ISOLATION_QUALIFIED"),
    platform: process.platform,
    processRunner,
    unsharePath: process.env.ASHLEY_SANDBOX_UNSHARE_PATH?.trim() || undefined,
  });
  if (selection.kind === "none") {
    await assertNetworkIsolationProbeOperational(selection.provider);
  }
  const networkIsolation = selection.provider;

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

  // R5B production executable seam: the installer pins broker-controlled
  // regular files (e.g. /opt/ashley-sandbox/bin/npm) via
  // ASHLEY_SANDBOX_EXECUTABLE_<ID>. Unmapped ids stay unmapped and every
  // fixed-recipe run for them is refused at the executable stage. The
  // mapping is validated here so a malformed seam fails the boot instead of
  // silently running with an empty mapping.
  const mappingsResult = executableMappingsFromEnv(process.env);
  if (!mappingsResult.ok) {
    throw new Error(
      `sandbox_delegated_runtime: executable_mapping_${mappingsResult.errorCode}:${mappingsResult.reason}`,
    );
  }

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
      executableMappings: mappingsResult.mappings,
      networkProvider: selection.label,
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

async function createProductionBroker(): Promise<{
  broker: ReturnType<typeof createBroker>;
  store: DurableBrokerStore;
  helperPath: string;
  ownerId: string;
}> {
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
  const processRunner = new ChildProcessRunner();
  const delegated = await loadDelegatedRuntimeConfig(keysDir, processRunner);
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
    processRunner,
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
  const production = await createProductionBroker();
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
