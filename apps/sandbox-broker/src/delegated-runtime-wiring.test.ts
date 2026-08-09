import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SandboxBroker } from "./broker.js";
import {
  DelegatedRuntime,
  type DelegatedRuntimeConfig,
  type DelegatedRuntimeDependencies,
} from "./delegated/runtime.js";
import {
  DurableBrokerStore,
  type BrokerStore,
} from "./store/broker-store.js";

function processRunner() {
  return {
    async run() {
      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
        truncated: false,
        terminalReason: "success" as const,
      };
    },
  };
}

function unavailableIsolation() {
  return {
    prepare() {
      return {
        ok: false as const,
        errorCode: "network_isolation_unavailable",
        reason: "test",
      };
    },
    status() {
      return "unavailable" as const;
    },
  };
}

function brokerConfig(store: BrokerStore, workspaceRoot: string) {
  return {
    workspaceRoot,
    ownerId: "owner-1",
    approval: { keys: [] },
    tombstone: { keys: [] },
    interpreterAllowlist: new Set<string>(),
    envAllowlist: new Set<string>(),
    processRunner: processRunner(),
    store,
    delegatedRuntimeConfig: {} as DelegatedRuntimeConfig,
    networkIsolation: unavailableIsolation(),
  };
}

function readinessFixture(overrides: {
  networkStatus?: "operational" | "unavailable";
  networkProvider?: "none" | "unavailable";
  recipes?: Map<string, { supported: boolean }>;
  ownerKeyId?: string;
} = {}): DelegatedRuntime {
  const runtime = Object.create(DelegatedRuntime.prototype) as DelegatedRuntime;
  Object.assign(runtime as unknown as Record<string, unknown>, {
    config: {
      delegatedKeyId: "delegated-key",
      continuityKeyId: "continuity-key",
      networkProvider: overrides.networkProvider ?? "none",
      recipes: overrides.recipes ?? new Map([["test", { supported: true }]]),
    } as unknown as DelegatedRuntimeConfig,
    activePolicy: {
      policyId: "policy-1",
      policyVersion: 1,
      policyHash: "a".repeat(64),
    },
    capabilitySigner: { keyId: "capability-key" },
    networkIsolation: {
      status: () => overrides.networkStatus ?? "unavailable",
    },
    ownerKeyId: overrides.ownerKeyId ?? "owner-key",
  });
  return runtime;
}

describe("delegated runtime broker wiring", () => {
  it("uses the durable broker nonce ledger across runtime restart", () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "ashley-broker-nonce-"));
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "ashley-broker-work-"));
    const dependencies: DelegatedRuntimeDependencies[] = [];
    let secondStore: DurableBrokerStore | null = null;
    const createSpy = vi
      .spyOn(DelegatedRuntime, "create")
      .mockImplementation((_config, deps) => {
        dependencies.push(deps);
        return {} as DelegatedRuntime;
      });

    try {
      const firstStore = new DurableBrokerStore(stateRoot);
      new SandboxBroker(brokerConfig(firstStore, workspaceRoot));
      const first = dependencies[0];
      expect(first).toBeDefined();
      expect(first?.nonceStore.reserve("restart-nonce")).toBe(true);
      firstStore.close();

      const reopenedStore = new DurableBrokerStore(stateRoot);
      secondStore = reopenedStore;
      new SandboxBroker(brokerConfig(reopenedStore, workspaceRoot));
      const second = dependencies[1];
      expect(second).toBeDefined();
      expect(second?.nonceStore.reserve("restart-nonce")).toBe(false);

      const concurrent = [
        second?.nonceStore.reserve("concurrent-nonce"),
        second?.nonceStore.reserve("concurrent-nonce"),
      ];
      expect(concurrent.filter(Boolean)).toHaveLength(1);
    } finally {
      createSpy.mockRestore();
      secondStore?.close();
      rmSync(stateRoot, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when durable nonce persistence fails", () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "ashley-broker-failure-"));
    const store = new DurableBrokerStore(stateRoot);
    const flushSpy = vi.spyOn(store, "flush").mockImplementation(() => {
      throw new Error("test_persistence_failure");
    });
    try {
      expect(store.recordNonce("persistence-failure-nonce")).toBe(false);
      expect(store.hasNonce("persistence-failure-nonce")).toBe(false);
    } finally {
      flushSpy.mockRestore();
      store.close();
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("does not report delegated readiness without operational isolation", () => {
    const readiness = readinessFixture().readiness();
    expect(readiness.networkIsolationOperational).toBe(false);
    expect(readiness.ready).toBe(false);
  });

  it("requires supported recipe capacity and complete material for readiness", () => {
    const noRecipes = readinessFixture({
      networkStatus: "operational",
      recipes: new Map([["unsupported", { supported: false }]]),
    }).readiness();
    expect(noRecipes.maxConcurrentTasks).toBe(0);
    expect(noRecipes.ready).toBe(false);

    const complete = readinessFixture({ networkStatus: "operational" }).readiness();
    expect(complete).toMatchObject({
      enabled: true,
      ready: true,
      networkIsolationOperational: true,
      maxConcurrentTasks: 1,
    });
  });
});
