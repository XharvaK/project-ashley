/**
 * Network isolation provider tests (Sandbox Wave 4, Commit 9).
 */

import { describe, expect, it } from "vitest";
import {
  NETWORK_ISOLATION_UNAVAILABLE,
  createUnavailableNetworkIsolation,
} from "../index.js";
import { FakeNetworkIsolationProvider } from "../test/fixtures/execution.js";

describe("network isolation", () => {
  it("1. the unavailable provider fails closed", async () => {
    const provider = createUnavailableNetworkIsolation();
    const result = await provider.enforce();
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

  it("3. the fake provider enforces by default", async () => {
    const provider = new FakeNetworkIsolationProvider();
    const result = await provider.enforce();
    expect(result).toEqual({ ok: true });
    expect(provider.enforceCalls).toBe(1);
  });

  it("4. the fake provider can be set to unavailable", async () => {
    const provider = new FakeNetworkIsolationProvider();
    provider.mode = "unavailable";
    const result = await provider.enforce();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("network_isolation_unavailable");
    }
  });

  it("5. enforce is called per execution attempt", async () => {
    const provider = new FakeNetworkIsolationProvider();
    await provider.enforce();
    await provider.enforce();
    expect(provider.enforceCalls).toBe(2);
  });
});
