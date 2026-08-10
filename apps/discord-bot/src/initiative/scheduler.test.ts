import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initiativeOperationalStatus,
} from "../agent-client.js";
import { runProactiveSchedulerPreflight } from "./scheduler.js";

test("scheduler preflight uses the bounded operational status surface", async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input) => {
    paths.push(String(input));
    return new Response(JSON.stringify({
      enabled: true,
      paused: false,
      sentToday: 0,
      maxPerDay: 10,
      lastSentAt: null,
      lastUserMessageAt: null,
      minIdleHours: 2,
      lastDiagnostic: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await runProactiveSchedulerPreflight({
      checkHealth: async () => true,
      initiativeOperationalStatus,
    });
    assert.equal(result.ok, true);
    assert.equal(paths.length, 1);
    assert.match(paths[0]!, /\/initiative\/operational-status\?/);
    assert.doesNotMatch(paths[0]!, /\/initiative\/status\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduler preflight remains bounded across no-material inventory sizes", async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  let responseIndex = 0;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    paths.push(url);
    const size = [10, 100, 1000][responseIndex++] ?? 0;
    return new Response(JSON.stringify({
      enabled: true,
      paused: false,
      sentToday: 0,
      maxPerDay: 10,
      lastSentAt: null,
      lastUserMessageAt: null,
      minIdleHours: 2,
      lastDiagnostic: size === 1000 ? "no_open_material" : null,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    for (const size of [10, 100, 1000]) {
      const result = await runProactiveSchedulerPreflight({
        checkHealth: async () => true,
        initiativeOperationalStatus,
      });
      assert.equal(result.ok, true);
    }
    assert.equal(paths.length, 3);
    assert.ok(paths.every((path) => path.includes("/initiative/operational-status?")));
    assert.ok(paths.every((path) => !path.includes("/initiative/status?")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
