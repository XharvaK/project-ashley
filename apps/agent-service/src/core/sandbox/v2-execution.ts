/**
 * Sandbox V2 P1 Production Execution Adapter.
 *
 * Connects Ashley's production runtime to the accepted Sandbox V2 M1 executor
 * (`runSandboxM1`), replacing legacy V1 coordinator/broker execution with
 * direct, in-process Bubblewrap execution for the single proven operation
 * `file.roundtrip`.
 *
 * Invariants (fail-closed):
 *  1. Accepts an already-admitted reactive roundtrip request;
 *  2. Establishes host-owned loopback evidence and isolated sentinels;
 *  3. Invokes the frozen `runSandboxM1` executor;
 *  4. Cleans up all host listener/sentinel resources in finally;
 *  5. Validates success via `isCompleteSuccessResult` and returns canonical
 *     `OperationalClaimLicense` with `RoundtripEffectEvidence`;
 *  6. Fails closed on any non-success, timeout, or malformed result;
 *  7. Gracefully returns state="none" when sandbox is unavailable on the host.
 */

import { randomBytes, createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, connect as netConnect, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isCompleteSuccessResult,
  runSandboxM1,
  type SandboxM1HostEvidence,
  type SandboxM1Request,
  type SandboxM1Result,
} from "@composer-assistant/sandbox-m1";
import type {
  OperationalClaimLicense,
  RoundtripEffectEvidence,
} from "./engineering-types.js";

const SECRET_ENV_KEY = "ASHLEY_SANDBOX_M1_SECRET_SENTINEL";
const BWRAP_PATH = "/usr/bin/bwrap";

export type ExecuteReactiveSandboxTaskV2Input = {
  content?: string;
  messageEntityUuid?: string;
  deadlineAtMs?: number;
  executor?: (
    request: SandboxM1Request,
    hostEvidence: SandboxM1HostEvidence,
  ) => Promise<SandboxM1Result>;
};

function tryConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = netConnect({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, 2000);
    timer.unref();
    sock.once("connect", () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(false);
    });
  });
}

export function isSandboxV2Available(): boolean {
  return process.platform === "linux" && existsSync(BWRAP_PATH);
}

export async function executeReactiveSandboxTaskV2(
  input: ExecuteReactiveSandboxTaskV2Input = {},
): Promise<OperationalClaimLicense> {
  const executor = input.executor ?? runSandboxM1;
  const isCustomExecutor = input.executor !== undefined;

  // On unsupported host without custom test executor, fail closed gracefully
  if (!isCustomExecutor && !isSandboxV2Available()) {
    return {
      state: "none",
      profile: "sandbox_workspace_file_roundtrip",
      error: "sandbox_unavailable",
      ...(input.messageEntityUuid ? { sourceMessageEntityUuid: input.messageEntityUuid } : {}),
    };
  }

  let sentinelDir: string | undefined;
  let fd: number | undefined;
  let server: Server | undefined;
  const previousSecret = process.env[SECRET_ENV_KEY];

  try {
    // 1. Establish host sentinel file & descriptor
    sentinelDir = mkdtempSync(join(tmpdir(), "ashley-v2-sentinel-"));
    const sentinelPath = join(sentinelDir, "sentinel.txt");
    writeFileSync(sentinelPath, "sentinel", "utf8");
    fd = openSync(sentinelPath, "r");
    const sentinelCanonical = realpathSync(sentinelPath);

    // 2. Establish host environment secret
    process.env[SECRET_ENV_KEY] = "s-" + randomBytes(16).toString("hex");

    // 3. Establish short-lived host loopback probe listener
    let hits = 0;
    server = createServer((sock) => {
      hits += 1;
      sock.destroy();
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", () => resolve());
    });
    const probePort = (server.address() as AddressInfo).port;

    // 4. Positive control probe
    const positiveControl = await tryConnect(probePort);
    const baselineHits = hits;

    // 5. Construct frozen M1 request & host evidence
    const content = input.content ?? "hello";
    const request: SandboxM1Request = {
      version: 1,
      kind: "file.roundtrip",
      content,
      probePort,
      sentinelPath: sentinelCanonical,
      fdSentinelCanonical: sentinelCanonical,
    };

    const hostEvidence: SandboxM1HostEvidence = {
      loopbackPositiveControlSucceeded: positiveControl,
      hostLoopbackSandboxHits: () => hits - baselineHits,
    };

    // 6. Invoke frozen M1 executor
    const res = await executor(request, hostEvidence);

    // 7. Validate and map result to OperationalClaimLicense
    const completedAtMs = Date.now();
    if (res.ok === true && isCompleteSuccessResult(res)) {
      const contentHash = createHash("sha256").update(content, "utf8").digest("hex");
      const effectEvidence: RoundtripEffectEvidence = {
        verified: true,
        workspaceId: "ephemeral-m1",
        relativePath: "hello.txt",
        bytesWritten: Buffer.byteLength(content, "utf8"),
        contentHash,
        readMatches: true,
        deleted: true,
        verifiedAbsent: true,
        completedAtMs,
      };
      return {
        state: "succeeded",
        taskId: `v2-m1-${completedAtMs}`,
        profile: "sandbox_workspace_file_roundtrip",
        effectEvidence,
        ...(input.messageEntityUuid ? { sourceMessageEntityUuid: input.messageEntityUuid } : {}),
      };
    }

    if (res.ok === false) {
      return {
        state: "failed",
        taskId: `v2-m1-${completedAtMs}`,
        profile: "sandbox_workspace_file_roundtrip",
        error: typeof res.code === "string" ? res.code : "roundtrip_failed",
        ...(input.messageEntityUuid ? { sourceMessageEntityUuid: input.messageEntityUuid } : {}),
      };
    }

    // Malformed / incomplete success result fails closed
    return {
      state: "failed",
      taskId: `v2-m1-${completedAtMs}`,
      profile: "sandbox_workspace_file_roundtrip",
      error: "invalid_result",
      ...(input.messageEntityUuid ? { sourceMessageEntityUuid: input.messageEntityUuid } : {}),
    };
  } catch {
    return {
      state: "failed",
      taskId: `v2-m1-${Date.now()}`,
      profile: "sandbox_workspace_file_roundtrip",
      error: "internal_error",
      ...(input.messageEntityUuid ? { sourceMessageEntityUuid: input.messageEntityUuid } : {}),
    };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {}
    }
    if (server) {
      try {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      } catch {}
    }
    if (sentinelDir) {
      try {
        rmSync(sentinelDir, { recursive: true, force: true });
      } catch {}
    }
    if (previousSecret === undefined) {
      delete process.env[SECRET_ENV_KEY];
    } else {
      process.env[SECRET_ENV_KEY] = previousSecret;
    }
  }
}
