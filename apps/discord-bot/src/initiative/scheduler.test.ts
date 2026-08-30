import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { AgentManager } from "../../../agent-service/src/agent.js";
import { AshleyCore } from "../../../agent-service/src/core/runtime.js";
import { openNuclearDb } from "../../../agent-service/src/core/db.js";
import { env as agentEnv } from "../../../agent-service/src/env.js";
import { createServer } from "../../../agent-service/src/server.js";
import {
  initiativeOperationalStatus,
} from "../agent-client.js";
import {
  runProactiveSchedulerCycle,
  runProactiveSchedulerPreflight,
} from "./scheduler.js";
import { config } from "../config.js";

const OWNER_ID = "doc";

function seedSchedulerInventory(
  db: DatabaseSync,
  size: number,
  options: { deferred?: boolean; reviewDue?: boolean } = {},
): void {
  const now = new Date().toISOString();
  const insertItem = db.prepare(
    `INSERT INTO open_cognitive_items
       (owner_id, entity_uuid, kind, status, semantic_summary,
        source_type, source_id, source_entity_uuid, semantic_key_hash,
        source_capability, contract_id, provenance, source_revision, origin,
        build_identity, model_epoch, data_classification, status_reason,
        created_at, updated_at)
     VALUES (?, ?, 'question', 'OPEN', ?, 'question', ?, ?, ?,
             'reading', 'scheduler-contract', 'live', '', 'manual',
             'scheduler-build', 0, 'never_public', 'created', ?, ?)`,
  );
  const insertAttention = db.prepare(
    `INSERT INTO open_cognitive_item_attention
       (item_id, delay_class, defer_until, last_considered_at,
        consideration_count, last_outcome_code, review_requested_at, updated_at)
     VALUES (?, 'none', ?, NULL, 0, NULL, ?, ?)`,
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < size; index += 1) {
      const key = `scheduler:${size}:${index}`;
      const hash = Buffer.from(key).toString("hex").padEnd(64, "0").slice(0, 64);
      const result = insertItem.run(
        OWNER_ID,
        key,
        `Scheduler fixture ${index}`,
        String(index + 1),
        `missing-source:${index}`,
        hash,
        now,
        now,
      );
      insertAttention.run(
        Number(result.lastInsertRowid),
        options.deferred ? "2999-01-01T00:00:00.000Z" : null,
        options.reviewDue ? "2000-01-01T00:00:00.000Z" : null,
        now,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function instrumentSchedulerQueries(db: DatabaseSync) {
  const metrics = {
    wakeRawRows: 0,
    reviewRawRows: 0,
    wakeQueries: 0,
    reviewQueries: 0,
    reviewCountQueries: 0,
  };
  const originalPrepare = db.prepare.bind(db);
  (db as unknown as { prepare: typeof db.prepare }).prepare = ((sql: string) => {
    const statement = originalPrepare(sql);
    const wake = sql.includes("ORDER BY o.id ASC") && sql.includes("LEFT JOIN open_cognitive_item_attention");
    const review = sql.includes("ORDER BY o.id DESC") && sql.includes("LEFT JOIN open_cognitive_item_attention");
    if (sql.includes("SELECT COUNT(*) AS count FROM (") && sql.includes("LIMIT 32")) {
      metrics.reviewCountQueries += 1;
    }
    if (!wake && !review) return statement;
    return new Proxy(statement, {
      get(target, property) {
        if (property === "all") {
          return (...args: Parameters<typeof target.all>) => {
            const rows = target.all(...args);
            if (wake) {
              metrics.wakeQueries += 1;
              metrics.wakeRawRows += rows.length;
            } else {
              metrics.reviewQueries += 1;
              metrics.reviewRawRows += rows.length;
            }
            return rows;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof db.prepare;
  return metrics;
}

async function runLocalSchedulerFixture(
  size: number,
  options: { deferred?: boolean; reviewDue?: boolean } = {},
) {
  const db = openNuclearDb(new DatabaseSync(":memory:"));
  const core = new AshleyCore(db, { sandboxBrokerTransport: null });
  seedSchedulerInventory(db, size, options);
  const metrics = instrumentSchedulerQueries(db);
  const manager = {
    core,
    getCognitiveKernel: () => "legacy" as const,
    getState: () => "ready",
    isPaused: () => false,
    getUptimeSec: () => 0,
    getProviderState: () => "unavailable",
  } as unknown as AgentManager;
  const app = createServer(manager);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const paths: string[] = [];
  try {
    const cycle = await runProactiveSchedulerCycle({
      preflight: () => runProactiveSchedulerPreflight({
        checkHealth: async () => {
          paths.push("/health");
          const response = await fetch(`${baseUrl}/health`);
          const body = await response.json() as { ready?: boolean };
          return response.ok && body.ready === true;
        },
        initiativeOperationalStatus: async () => {
          paths.push("/initiative/operational-status");
          const response = await fetch(
            `${baseUrl}/initiative/operational-status?owner_id=${OWNER_ID}`,
          );
          assert.equal(response.status, 200);
          return await response.json() as Awaited<ReturnType<typeof initiativeOperationalStatus>>;
        },
      }),
      tickInitiative: async () => {
        paths.push("/initiative/tick");
        const response = await fetch(`${baseUrl}/initiative/tick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: OWNER_ID }),
        });
        assert.equal(response.status, 200);
        return await response.json() as Awaited<ReturnType<
          typeof import("../agent-client.js").tickInitiative
        >>;
      },
    });
    return { cycle, metrics, paths };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    db.close();
  }
}

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

test("v021 blocks the legacy proactive scheduler cycle", async () => {
  const originalKernel = config.cognitiveKernel;
  let tickCalled = false;
  config.cognitiveKernel = "v021";
  try {
    const cycle = await runProactiveSchedulerCycle({
      preflight: async () => ({ ok: false, reason: "agent_unhealthy" }),
      tickInitiative: async () => {
        tickCalled = true;
        return { shouldSend: false, reason: "legacy_tick" };
      },
    });
    assert.deepEqual(cycle, { outcome: "kernel_skip", reason: "v021_kernel" });
    assert.equal(tickCalled, false);
  } finally {
    config.cognitiveKernel = originalKernel;
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

test("scheduler reaches real runtime SQLite wake and review paths within fixed bounds", async () => {
  const originalDiscordOwnerId = agentEnv.discordOwnerId;
  const originalMemoryOwnerId = agentEnv.memoryOwnerId;
  const originalProactiveEnabled = agentEnv.proactiveEnabled;
  agentEnv.discordOwnerId = OWNER_ID;
  agentEnv.memoryOwnerId = OWNER_ID;
  agentEnv.proactiveEnabled = true;
  try {
    const noMaterial = await runLocalSchedulerFixture(0);
    assert.deepEqual(noMaterial.paths, [
      "/health",
      "/initiative/operational-status",
      "/initiative/tick",
    ]);
    assert.equal(noMaterial.cycle.outcome, "tick");
    assert.equal(noMaterial.metrics.wakeRawRows, 0);

    const allDeferred = await runLocalSchedulerFixture(1000, { deferred: true });
    assert.equal(allDeferred.cycle.outcome, "tick");
    assert.ok(allDeferred.metrics.wakeRawRows <= 128);
    assert.ok(allDeferred.metrics.wakeQueries <= 4);

    const reviewDue = await runLocalSchedulerFixture(1000, { reviewDue: true });
    assert.equal(reviewDue.cycle.outcome, "tick");
    assert.ok(reviewDue.metrics.reviewRawRows <= 32);
    assert.ok(reviewDue.metrics.reviewQueries <= 1);
    assert.equal(reviewDue.metrics.reviewCountQueries, 1);
    assert.ok(reviewDue.metrics.wakeRawRows <= 128);

    const largeBlocked = await runLocalSchedulerFixture(1000);
    assert.equal(largeBlocked.cycle.outcome, "tick");
    assert.ok(largeBlocked.metrics.wakeRawRows <= 128);
    assert.ok(largeBlocked.metrics.wakeQueries <= 4);
  } finally {
    agentEnv.discordOwnerId = originalDiscordOwnerId;
    agentEnv.memoryOwnerId = originalMemoryOwnerId;
    agentEnv.proactiveEnabled = originalProactiveEnabled;
  }
});
