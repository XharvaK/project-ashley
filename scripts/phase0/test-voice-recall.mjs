#!/usr/bin/env node
/**
 * Voice channel recall smoke (agent-service + keys).
 */
import { loadComposerEnv, requireOwnerId, agentUrl } from "./load-env.mjs";

loadComposerEnv();
const ownerId = requireOwnerId();

async function freshThread() {
  const res = await fetch(`${agentUrl}/memory/newthread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: ownerId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
}

function sentenceCount(text) {
  return text.split(/[.!?…]+/).filter((s) => s.trim().length > 3).length;
}

await freshThread();

const debugRes = await fetch(
  `${agentUrl}/debug/memory-context?owner_id=${encodeURIComponent(ownerId)}&channel=voice&message=${encodeURIComponent("neler hatırlıyorsun")}`,
);
const debug = await debugRes.json();
if (debug.queryMode !== "recall") {
  console.error("FAIL queryMode", debug.queryMode);
  process.exit(1);
}

const res = await fetch(`${agentUrl}/chat/text`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "neler hatırlıyorsun",
    channel: "voice",
    userId: ownerId,
  }),
});
const data = await res.json();
if (!res.ok) {
  console.error("FAIL", data);
  process.exit(1);
}

const text = String(data.text ?? "");
if (/^\s*[-*•]\s/m.test(text) || /\*[^*]+\*/.test(text)) {
  console.error("FAIL bullets/stage in voice recall:", text);
  process.exit(1);
}
if (sentenceCount(text) > 3) {
  console.error("FAIL too long:", text);
  process.exit(1);
}

console.log("OK voice recall ->", text.slice(0, 120));
process.exit(0);
