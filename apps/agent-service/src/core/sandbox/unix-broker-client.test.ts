import { describe, expect, it } from "vitest";
import type { BrokerClientTransport } from "../change-proposal/broker-client.js";
import { UnixSandboxBrokerClient } from "./unix-broker-client.js";

function readinessPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    enabled: true,
    ready: true,
    ownerKeyId: "owner-key",
    delegatedKeyId: "delegated-key",
    capabilityKeyId: "capability-key",
    continuityKeyId: "continuity-key",
    policyId: "policy-1",
    policyVersion: 1,
    policyHash: "a".repeat(64),
    signerClass: "delegated_runtime",
    networkMode: "none",
    networkIsolationOperational: true,
    maxConcurrentTasks: 1,
    ...overrides,
  };
}

function clientFor(data: unknown): UnixSandboxBrokerClient {
  const transport: BrokerClientTransport = {
    dispatch: async () => ({ ok: true, data }),
  };
  return new UnixSandboxBrokerClient({ transport });
}

describe("UnixSandboxBrokerClient readiness", () => {
  it("fails closed when isolation is unavailable", async () => {
    const snapshot = await clientFor(
      readinessPayload({ networkIsolationOperational: false }),
    ).readiness();
    expect(snapshot.ready).toBe(false);
    expect(snapshot.networkIsolationOperational).toBe(false);
  });

  it("fails closed for missing or malformed isolation readiness", async () => {
    const missing = readinessPayload();
    delete missing.networkIsolationOperational;
    expect((await clientFor(missing).readiness()).ready).toBe(false);

    const malformed = await clientFor(
      readinessPayload({ networkIsolationOperational: "operational" }),
    ).readiness();
    expect(malformed.ready).toBe(false);
  });

  it("requires usable policy material and supported capacity", async () => {
    const noCapacity = await clientFor(
      readinessPayload({ maxConcurrentTasks: 0 }),
    ).readiness();
    expect(noCapacity.ready).toBe(false);

    const noPolicy = await clientFor(
      readinessPayload({ policyId: null, policyVersion: null, policyHash: null }),
    ).readiness();
    expect(noPolicy.ready).toBe(false);

    const ready = await clientFor(readinessPayload()).readiness();
    expect(ready).toMatchObject({
      ready: true,
      brokerReady: true,
      networkMode: "none",
      networkIsolationOperational: true,
      policyId: "policy-1",
      policyVersion: 1,
      policyHash: "a".repeat(64),
    });
  });
});
