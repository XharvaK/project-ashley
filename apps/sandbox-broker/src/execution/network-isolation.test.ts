/**
 * Network isolation provider tests (Sandbox Wave 4, Commit 9; R5A).
 *
 * R5A makes isolation spawn-coupled: `prepare()` returns the complete spawn
 * specification or a typed refusal. These tests pin the fail-closed contract
 * of the default (unavailable) provider and the deterministic fake used by
 * the execution harness.
 */

import { describe, expect, it } from "vitest";
import {
  NETWORK_ISOLATION_UNAVAILABLE,
  createUnavailableNetworkIsolation,
} from "../index.js";
import { FakeNetworkIsolationProvider } from "../test/fixtures/execution.js";

const baseRequest = {
  taskId: "t-1",
  argv: ["/usr/bin/git", "status"],
  cwd: "/tmp/ashley-cwd",
  env: { PATH: "/usr/bin:/bin" },
  wallMs: 5_000,
  maxProcesses: 1,
  maxOutputBytes: 1_024,
};

describe("network isolation", () => {
  it("1. the unavailable provider fails closed with zero spawn", async () => {
    const provider = createUnavailableNetworkIsolation();
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("network_isolation_unavailable");
    }
  });

  it("2. the unavailable constant is stable", () => {
    expect(NETWORK_ISOLATION_UNAVAILABLE).toEqual({
      ok: false,
      errorCode: "network_isolation_unavailable",
      reason: "no network isolation provider configured",
    });
  });

  it("3. the unavailable provider never reports operational status", () => {
    const provider = createUnavailableNetworkIsolation();
    expect(provider.status()).toBe("unavailable");
  });

  it("4. the unavailable provider has no cancellation passthrough", () => {
    const provider = createUnavailableNetworkIsolation();
    expect(provider.cancel).toBeUndefined();
  });

  it("5. the fake provider passes the exact request through when enforcing", async () => {
    const provider = new FakeNetworkIsolationProvider();
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request).toBe(baseRequest);
    }
    expect(provider.prepareCalls).toBe(1);
    expect(provider.status()).toBe("operational");
  });

  it("6. the fake provider can be set to unavailable", async () => {
    const provider = new FakeNetworkIsolationProvider();
    provider.mode = "unavailable";
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("network_isolation_unavailable");
    }
    expect(provider.status()).toBe("unavailable");
  });

  it("7. prepare is called per execution attempt", async () => {
    const provider = new FakeNetworkIsolationProvider();
    await provider.prepare(baseRequest);
    await provider.prepare(baseRequest);
    expect(provider.prepareCalls).toBe(2);
  });
});
