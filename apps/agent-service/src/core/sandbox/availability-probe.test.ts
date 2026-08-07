import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: () => true,
    statSync: () => ({ isSocket: () => true }),
  };
});

vi.mock("./key-store.js", () => ({
  sandboxKeysConfigured: () => ({ ownerApproval: true, continuityTombstone: true }),
}));

import type {
  BrokerClientTransport,
  BrokerDispatchResult,
} from "../change-proposal/broker-client.js";

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

function makeTransport(handlers: Record<string, unknown>): BrokerClientTransport {
  return {
    async dispatch(messageType: string, _payload: unknown) {
      const handler = handlers[messageType];
      if (handler === undefined) {
        return { ok: false, errorCode: "unknown_message", message: "unknown" };
      }
      return handler as BrokerDispatchResult<unknown>;
    },
  };
}

describe("sandbox availability broker status probe", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    process.env.ASHLEY_SANDBOX_BROKER_ENABLED = "true";
    process.env.ASHLEY_SANDBOX_BROKER_SOCKET = "/run/ashley/broker.sock";
  });

  afterEach(() => {
    restoreEnv(savedEnv);
    vi.resetModules();
  });

  it("carries the broker status snapshot when the broker answers it", async () => {
    const mod = await import("./availability.js");
    const transport = makeTransport({
      "artifact.list": { ok: true, data: [] },
      "broker.status": {
        ok: true,
        data: {
          ready: true,
          persistence: "ok",
          schemaVersion: 3,
          ownerId: "owner-1",
          sessions: { active: 1, total: 2 },
          audits: 5,
          workspaceBytesUsed: 128,
        },
      },
    });
    const snapshot = await mod.probeSandboxBrokerReachability("owner-1", transport);
    expect(snapshot.qualification).toBe("qualified");
    expect(snapshot.brokerStatus).toEqual({
      ready: true,
      persistence: "ok",
      schemaVersion: 3,
      ownerId: "owner-1",
      sessions: { active: 1, total: 2 },
      audits: 5,
      workspaceBytesUsed: 128,
    });
  });

  it("reports brokerStatus null when broker.status is unanswered", async () => {
    const mod = await import("./availability.js");
    const transport = makeTransport({
      "artifact.list": { ok: true, data: [] },
      "broker.status": { ok: false, errorCode: "unknown_message", message: "unknown" },
    });
    const snapshot = await mod.probeSandboxBrokerReachability("owner-1", transport);
    expect(snapshot.qualification).toBe("qualified");
    expect(snapshot.brokerStatus).toBeNull();
  });
});
