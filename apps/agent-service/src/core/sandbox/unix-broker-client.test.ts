import { describe, expect, it } from "vitest";
import type {
  BrokerClientTransport,
  BrokerDispatchResult,
} from "../change-proposal/broker-client.js";
import type { FixedRecipeExecutionRequest } from "@composer-assistant/sandbox-broker";
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
  return clientForDispatch({ ok: true, data });
}

function clientForDispatch(
  result: BrokerDispatchResult,
): UnixSandboxBrokerClient {
  const transport: BrokerClientTransport = {
    dispatch: async () => result,
  };
  return new UnixSandboxBrokerClient({ transport });
}

const executionRequest = {} as FixedRecipeExecutionRequest;

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

describe("UnixSandboxBrokerClient execution outcomes", () => {
  it("returns refused when transport proves the request was not sent", async () => {
    const result = await clientForDispatch({
      ok: false,
      errorCode: "broker_unavailable",
      message: "connection failed before connect",
      requestDelivery: "not_sent",
    }).executeRecipe(executionRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.outcome).toBe("refused");
  });

  it("returns outcome_unknown for an ambiguous transport failure", async () => {
    const result = await clientForDispatch({
      ok: false,
      errorCode: "broker_timeout",
      message: "deadline expired after request write",
      requestDelivery: "sent_or_unknown",
    }).executeRecipe(executionRequest);

    expect(result).toMatchObject({
      ok: false,
      outcome: "outcome_unknown",
      errorCode: "outcome_unknown",
    });
  });

  it("fails closed as outcome_unknown when a transport gives no delivery proof", async () => {
    const result = await clientForDispatch({
      ok: false,
      errorCode: "broker_unavailable",
      message: "transport rejected the request without delivery metadata",
    }).executeRecipe(executionRequest);

    expect(result).toMatchObject({
      ok: false,
      outcome: "outcome_unknown",
      errorCode: "outcome_unknown",
    });
  });

  it("preserves an explicit broker refusal unchanged", async () => {
    const refused = {
      ok: false,
      outcome: "refused",
      errorCode: "policy_refused",
      reason: "recipe refused",
      stage: "authorization",
      audit: {},
      receipt: null,
    } as const;
    const result = await clientFor(refused).executeRecipe(executionRequest);
    expect(result).toEqual(refused);
  });

  it("preserves an explicit broker outcome_unknown unchanged", async () => {
    const unknown = {
      ok: false,
      outcome: "outcome_unknown",
      errorCode: "outcome_unknown",
      reason: "finalization status unavailable",
      stage: "finalize",
      audit: {},
      receipt: null,
    } as const;
    const result = await clientFor(unknown).executeRecipe(executionRequest);
    expect(result).toEqual(unknown);
  });

  it("treats a malformed execution response as outcome_unknown", async () => {
    const result = await clientFor({ ok: false, reason: "not an execution result" }).executeRecipe(
      executionRequest,
    );

    expect(result).toMatchObject({
      ok: false,
      outcome: "outcome_unknown",
      errorCode: "outcome_unknown",
    });
  });
});
