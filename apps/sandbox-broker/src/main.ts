import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  createBroker,
  DurableBrokerStore,
  type BrokerRecipe,
} from "./index.js";
import { publicKeyFromPem } from "./crypto/approval.js";
import { tombstonePublicKeyFromPem } from "./crypto/tombstone.js";
import { ChildProcessRunner } from "./process/real-runner.js";
import { loadRecipeManifest } from "./policy/recipes.js";
import { createLinuxPeerCredentialResolver } from "./peer-credentials.js";
import { UnixBrokerServer } from "./server.js";

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
