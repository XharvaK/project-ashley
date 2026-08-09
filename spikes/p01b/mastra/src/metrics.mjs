import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMastraRuntime } from "./adapter.mjs";

const directory = mkdtempSync(join(tmpdir(), "ashley-p01b-mastra-metrics-"));
const authorityPath = join(directory, "ashley.db");
const storePath = join(directory, "mastra.db");
const runtime = await createMastraRuntime({ authorityPath, storePath });

console.log(JSON.stringify({
  startupMs: Math.round(process.uptime() * 1000),
  rssBytes: process.memoryUsage().rss,
  authorityStoreBytes: statSync(authorityPath).size,
  candidateStoreBytes: statSync(storePath).size,
  tempDirectory: directory,
}));

await runtime.close();
