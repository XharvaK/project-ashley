#!/usr/bin/env node
/**
 * Phase 0: Cursor SDK smoke test (composer-2.5)
 * Usage: CURSOR_API_KEY=... node scripts/phase0/test-sdk.mjs "Hello"
 */
import { Agent } from "@cursor/sdk";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const workspace = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "workspace");
const prompt = process.argv.slice(2).join(" ").trim() || "Say hello in one short sentence.";
const apiKey = process.env.CURSOR_API_KEY;

if (!apiKey) {
  console.error("Missing CURSOR_API_KEY");
  process.exit(1);
}

console.log("[sdk] workspace:", workspace);
console.log("[sdk] prompt:", prompt);

const agent = await Agent.create({
  apiKey,
  model: { id: "composer-2.5" },
  local: { cwd: workspace, settingSources: [] },
});

try {
const run = await agent.send(prompt);
console.log("[sdk] run=", run.id, "agent=", agent.agentId);

for await (const event of run.stream()) {
  if (event.type === "assistant") {
    for (const block of event.message.content) {
      if (block.type === "text") process.stdout.write(block.text);
    }
  }
  if (event.type === "status") console.error("\n[status]", event.status);
}

const result = await run.wait();
console.error("\n[sdk] status=", result.status, "durationMs=", result.durationMs);
process.exit(result.status === "finished" ? 0 : 2);
} finally {
  await agent[Symbol.asyncDispose]();
}
