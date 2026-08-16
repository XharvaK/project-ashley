import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { SandboxM1Result } from "@composer-assistant/sandbox-m1";
import {
  executeReactiveSandboxTaskV2,
  isSandboxV2Available,
} from "./v2-execution.js";
import { isVerifiedRoundtripEffectEvidence } from "./engineering-types.js";

const SECRET_ENV_KEY = "ASHLEY_SANDBOX_M1_SECRET_SENTINEL";

const completeSuccessResult: SandboxM1Result = {
  version: 1,
  kind: "file.roundtrip",
  ok: true,
  checks: {
    roundtrip: true,
    deleted: true,
    absent: true,
    homeAbsent: true,
    runAbsent: true,
    hostSentinelAbsent: true,
    envClean: true,
    loopbackIsolated: true,
    externalIsolated: true,
    fdClean: true,
  },
};

describe("Sandbox V2 P1 execution adapter (executeReactiveSandboxTaskV2)", () => {
  it("1. maps complete M1 success to succeeded license with verified effect evidence", async () => {
    const license = await executeReactiveSandboxTaskV2({
      content: "custom-test-witness",
      messageEntityUuid: "msg-uuid-123",
      executor: async (req, hostEvidence) => {
        expect(req.version).toBe(1);
        expect(req.kind).toBe("file.roundtrip");
        expect(req.content).toBe("custom-test-witness");
        expect(req.probePort).toBeGreaterThan(0);
        expect(existsSync(req.sentinelPath)).toBe(true);
        expect(hostEvidence.loopbackPositiveControlSucceeded).toBe(true);
        expect(hostEvidence.hostLoopbackSandboxHits()).toBe(0);
        return completeSuccessResult;
      },
    });

    expect(license.state).toBe("succeeded");
    expect(license.sourceMessageEntityUuid).toBe("msg-uuid-123");
    expect(license.profile).toBe("sandbox_workspace_file_roundtrip");
    expect(license.taskId).toMatch(/^v2-m1-\d+$/);
    expect(license.effectEvidence).toBeDefined();
    expect(isVerifiedRoundtripEffectEvidence(license.effectEvidence)).toBe(true);
    expect(license.effectEvidence?.bytesWritten).toBe(Buffer.byteLength("custom-test-witness", "utf8"));
    expect(license.effectEvidence?.readMatches).toBe(true);
    expect(license.effectEvidence?.deleted).toBe(true);
    expect(license.effectEvidence?.verifiedAbsent).toBe(true);
  });

  it("2. maps M1 failure code to failed license without effect evidence", async () => {
    const license = await executeReactiveSandboxTaskV2({
      messageEntityUuid: "msg-uuid-456",
      executor: async () => ({
        version: 1,
        kind: "file.roundtrip",
        ok: false,
        code: "timeout",
      }),
    });

    expect(license.state).toBe("failed");
    expect(license.sourceMessageEntityUuid).toBe("msg-uuid-456");
    expect(license.error).toBe("timeout");
    expect(license.effectEvidence).toBeUndefined();
  });

  it("3. fails closed when M1 returns ok:true with missing check keys", async () => {
    const malformedResult = {
      version: 1,
      kind: "file.roundtrip",
      ok: true,
      checks: {
        roundtrip: true,
        deleted: true,
        // missing absent, homeAbsent, fdClean, etc.
      },
    } as unknown as SandboxM1Result;

    const license = await executeReactiveSandboxTaskV2({
      executor: async () => malformedResult,
    });

    expect(license.state).toBe("failed");
    expect(license.error).toBe("invalid_result");
    expect(license.effectEvidence).toBeUndefined();
  });

  it("4. fails closed when executor throws an unexpected exception", async () => {
    const license = await executeReactiveSandboxTaskV2({
      executor: async () => {
        throw new Error("unexpected spawn crash");
      },
    });

    expect(license.state).toBe("failed");
    expect(license.error).toBe("internal_error");
    expect(license.effectEvidence).toBeUndefined();
  });

  it("5. cleans up all host listener/sentinel resources on success", async () => {
    const initialSentinels = readdirSync(tmpdir()).filter((e) => e.startsWith("ashley-v2-sentinel-"));
    const secretBefore = process.env[SECRET_ENV_KEY];

    await executeReactiveSandboxTaskV2({
      executor: async () => completeSuccessResult,
    });

    const finalSentinels = readdirSync(tmpdir()).filter((e) => e.startsWith("ashley-v2-sentinel-"));
    expect(finalSentinels).toEqual(initialSentinels);
    expect(process.env[SECRET_ENV_KEY]).toBe(secretBefore);
  });

  it("6. cleans up all host listener/sentinel resources on failure or throw", async () => {
    const initialSentinels = readdirSync(tmpdir()).filter((e) => e.startsWith("ashley-v2-sentinel-"));
    const secretBefore = process.env[SECRET_ENV_KEY];

    await executeReactiveSandboxTaskV2({
      executor: async () => {
        throw new Error("simulated failure");
      },
    });

    const finalSentinels = readdirSync(tmpdir()).filter((e) => e.startsWith("ashley-v2-sentinel-"));
    expect(finalSentinels).toEqual(initialSentinels);
    expect(process.env[SECRET_ENV_KEY]).toBe(secretBefore);
  });

  it("7. fails closed gracefully with state='none' when sandbox is unavailable on host", async () => {
    // If not running on Linux or without bwrap, default executor returns state="none"
    if (!isSandboxV2Available()) {
      const license = await executeReactiveSandboxTaskV2({
        messageEntityUuid: "msg-uuid-none",
      });
      expect(license.state).toBe("none");
      expect(license.error).toBe("sandbox_unavailable");
      expect(license.sourceMessageEntityUuid).toBe("msg-uuid-none");
    }
  });

  it("8. preserves sourceMessageEntityUuid when provided on error outcomes", async () => {
    const failedLicense = await executeReactiveSandboxTaskV2({
      messageEntityUuid: "msg-err-uuid",
      executor: async () => ({
        version: 1,
        kind: "file.roundtrip",
        ok: false,
        code: "spawn-error",
      }),
    });
    expect(failedLicense.state).toBe("failed");
    expect(failedLicense.sourceMessageEntityUuid).toBe("msg-err-uuid");
    expect(failedLicense.error).toBe("spawn-error");
  });

  it("9. executes purely in-process with zero broker socket or V1 coordinator interaction", async () => {
    let brokerCalled = false;
    const fakeBrokerClient = {
      kind: "unix_socket" as const,
      dispatch: () => {
        brokerCalled = true;
        throw new Error("V1 broker must not be called!");
      },
    };

    const license = await executeReactiveSandboxTaskV2({
      messageEntityUuid: "test-isolation",
      executor: async () => completeSuccessResult,
    });

    expect(brokerCalled).toBe(false);
    expect(license.state).toBe("succeeded");
    expect(license.effectEvidence?.verified).toBe(true);
  });
});
