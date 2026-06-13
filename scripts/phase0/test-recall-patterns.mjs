#!/usr/bin/env node
/**
 * Unit: recall-query pattern detection (no API).
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const { isRecallQuery } = await import(
  pathToFileURL(join(root, "apps/agent-service/dist/memory/recall.js")).href
);

const shouldMatch = [
  "what do you remember about me?",
  "ne biliyorsun benden?",
  "neler hatırlıyorsun",
  "hafızanda neler var",
  "ne hatırlıyorsun",
  "benim hakkımda ne hatırlıyorsun",
  "hafızanda ne var",
];

const shouldNotMatch = [
  "merhaba",
  "valorant oynuyor musun",
  "3-meo hakkında ne düşünüyorsun",
  "bugün ne yapalım",
];

let ok = true;
for (const msg of shouldMatch) {
  if (!isRecallQuery(msg)) {
    console.error("FAIL should match:", msg);
    ok = false;
  }
}
for (const msg of shouldNotMatch) {
  if (isRecallQuery(msg)) {
    console.error("FAIL should not match:", msg);
    ok = false;
  }
}

if (ok) console.log("OK recall patterns", shouldMatch.length, "positive,", shouldNotMatch.length, "negative");
process.exit(ok ? 0 : 1);
