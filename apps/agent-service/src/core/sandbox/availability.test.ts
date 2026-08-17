import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeSandboxAvailability,
  resetSandboxReachabilityCacheForTests,
} from "./availability.js";

const ENV_KEYS = [
  "ASHLEY_SANDBOX_BROKER_ENABLED",
  "ASHLEY_SANDBOX_BROKER_SOCKET",
  "ASHLEY_SANDBOX_KEYS_DIR",
  "ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH",
  "ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH",
  "ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH",
] as const;

function saveEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

describe("sandbox availability", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    resetSandboxReachabilityCacheForTests();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
    resetSandboxReachabilityCacheForTests();
    vi.resetModules();
  });

  it("reports disabled when broker opt-in is off", async () => {
    process.env.ASHLEY_SANDBOX_BROKER_ENABLED = "false";
    const mod = await import("./availability.js");
    const snapshot = mod.sandboxAvailabilitySnapshot();
    expect(snapshot.qualification).toBe("disabled");
    expect(mod.describeSandboxAvailability(snapshot)).toContain("disabled");
  });

  it("reports socket missing when opt-in is on but socket is absent", async () => {
    process.env.ASHLEY_SANDBOX_BROKER_ENABLED = "true";
    process.env.ASHLEY_SANDBOX_BROKER_SOCKET = "/run/ashley/broker-sock-nonexistent";
    const mod = await import("./availability.js");
    const snapshot = mod.sandboxAvailabilitySnapshot();
    expect(snapshot.qualification).toBe("socket_missing");
    expect(mod.describeSandboxAvailability(snapshot)).toContain("not present");
  });
});

describe("describeSandboxAvailability", () => {
  it("describes disabled state with legacy V1 disambiguation", () => {
    const line = describeSandboxAvailability({
      brokerOptIn: false,
      socketPath: "",
      socketPresent: false,
      signingKeys: { ownerApproval: false, continuityTombstone: false },
      transportConfigured: false,
      qualification: "disabled",
      reachabilityCheckedAtMs: null,
    });
    expect(line).toBe(
      "Legacy sandbox broker (V1): broker IPC disabled (ASHLEY_SANDBOX_BROKER_ENABLED is not true).",
    );
  });

  it("describes qualified state honestly", () => {
    const line = describeSandboxAvailability({
      brokerOptIn: true,
      socketPath: "/run/ashley/broker.sock",
      socketPresent: true,
      signingKeys: { ownerApproval: true, continuityTombstone: true },
      transportConfigured: true,
      qualification: "qualified",
      reachabilityCheckedAtMs: Date.now(),
    });
    expect(line).toContain("Legacy sandbox broker (V1): OS sandbox broker is qualified this session");
    expect(line).toContain("owner-signed approval");
  });
});
