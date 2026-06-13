#!/usr/bin/env node
/**
 * Phase 0: Orpheus TTS streaming smoke test
 * Requires Orpheus-FastAPI on ORPHEUS_URL (default http://127.0.0.1:8881)
 */
const base = process.env.ORPHEUS_URL ?? "http://127.0.0.1:8881";
const voice = process.env.ORPHEUS_VOICE ?? "leah";
const text = process.argv[2] ?? "Hello, I am Ashley.";

const res = await fetch(`${base}/v1/audio/speech`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "orpheus",
    input: text,
    voice,
    response_format: "pcm",
    stream: true,
  }),
});

if (!res.ok) {
  console.error("[orpheus] HTTP", res.status, await res.text());
  process.exit(1);
}

let bytes = 0;
const t0 = performance.now();
let first = null;
for await (const chunk of res.body) {
  if (first === null) first = performance.now() - t0;
  bytes += chunk.length;
}
console.log(`[orpheus] first_chunk_ms=${first?.toFixed(0)} total_bytes=${bytes} total_ms=${(performance.now() - t0).toFixed(0)}`);
process.exit(0);
