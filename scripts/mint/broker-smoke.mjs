#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createConfiguredUnixBrokerTransport } from "../../apps/agent-service/dist/core/change-proposal/unix-broker-transport.js";

function readOwnerId() {
  const envPath = join(homedir(), ".composer-assistant", ".env");
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith("DISCORD_OWNER_ID="));
  if (!line) throw new Error("owner_id_missing");
  return line.slice("DISCORD_OWNER_ID=".length).trim().replace(/^["']|["']$/g, "");
}

const transport = createConfiguredUnixBrokerTransport();
if (!transport) {
  console.log(JSON.stringify({ ok: false, error: "broker_disabled" }));
  process.exit(1);
}

const ownerId = readOwnerId();
const result = await transport.dispatch("artifact.list", { ownerId });
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
