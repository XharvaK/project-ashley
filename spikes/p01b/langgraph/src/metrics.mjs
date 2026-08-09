import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLangGraphRuntime, fixtureJob } from "./adapter.mjs";

const directory = mkdtempSync(join(tmpdir(), "ashley-p01b-langgraph-metrics-"));
const authorityPath = join(directory, "ashley.db");
const storePath = join(directory, "langgraph.db");
const runtime = await createLangGraphRuntime({ authorityPath, storePath });
const ready = {
  startupMs: Math.round(process.uptime() * 1000),
  rssBytes: process.memoryUsage().rss,
};
const result = await runtime.execute({ ...fixtureJob });
runtime.close();

console.log(JSON.stringify({
  ...ready,
  status: result.status,
  authorityStoreBytes: statSync(authorityPath).size,
  candidateStoreBytes: statSync(storePath).size,
  tempDirectory: directory,
}));
