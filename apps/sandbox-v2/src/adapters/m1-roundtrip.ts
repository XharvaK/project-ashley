/**
 * M1 roundtrip adapter (Sandbox V2 M2).
 *
 * `file.roundtrip` keeps executing through the frozen M1 kernel
 * (`runSandboxM1` in @composer-assistant/sandbox-m1 — never modified), but it
 * is now exposed through the same V2 dispatch seam and V2 typed result
 * vocabulary as the project-inspection family, with host evidence injected
 * exactly like the inspection path (loopback positive control + sentinel
 * file/fd + environment secret).
 *
 * Execution/result truth stays downstream of actual execution evidence;
 * the model can never decide that a roundtrip happened.
 */

import { createHash, randomBytes } from "node:crypto";
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
import { V2_SECRET_ENV_KEY } from "../limits.js";
import type {
  SandboxV2FileRoundtripRequest,
  SandboxV2Result,
} from "../v2-types.js";

export type M1RoundtripExecutorOptions = {
  /** Injectable executor seam (unit tests script a fake M1). */
  executor?: (
    request: SandboxM1Request,
    hostEvidence: SandboxM1HostEvidence,
  ) => Promise<SandboxM1Result>;
  available?: () => boolean;
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

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function isM1RoundtripAvailable(): boolean {
  return process.platform === "linux" && existsSync("/usr/bin/bwrap");
}

/**
 * Real frozen-M1 roundtrip execution with V2 host evidence, mapped into the
 * V2 typed result vocabulary. Fails closed on any non-success, malformed
 * result, or isolation failure.
 */
export async function handleFileRoundtripV2(
  request: SandboxV2FileRoundtripRequest,
  options: M1RoundtripExecutorOptions = {},
): Promise<SandboxV2Result> {
  const executedAtMs = Date.now();
  const failed = (error: string): SandboxV2Result => ({
    outcome: "failed",
    operation: "file.roundtrip",
    error,
    executedAtMs,
  });

  const executor = options.executor ?? runSandboxM1;
  const isCustomExecutor = options.executor !== undefined;
  const available = options.available ?? isM1RoundtripAvailable;
  if (!isCustomExecutor && !available()) {
    return {
      outcome: "unavailable",
      operation: "file.roundtrip",
      error: "sandbox_unavailable",
      executedAtMs,
    };
  }

  const content = request.content ?? "hello";

  let sentinelDir: string | undefined;
  let fd: number | undefined;
  let server: Server | undefined;
  const previousSecret = process.env[V2_SECRET_ENV_KEY];

  try {
    sentinelDir = mkdtempSync(join(tmpdir(), "ashley-v2-sentinel-"));
    const sentinelPath = join(sentinelDir, "sentinel.txt");
    writeFileSync(sentinelPath, "sentinel", "utf8");
    fd = openSync(sentinelPath, "r");
    const sentinelCanonical = realpathSync(sentinelPath);
    process.env[V2_SECRET_ENV_KEY] = "s-" + randomBytes(16).toString("hex");

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
    const positiveControl = await tryConnect(probePort);
    const baselineHits = hits;

    const m1Request: SandboxM1Request = {
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

    const res = await executor(m1Request, hostEvidence);

    if (res.ok === true && isCompleteSuccessResult(res)) {
      return {
        outcome: "succeeded",
        operation: "file.roundtrip",
        result: {
          kind: "file.roundtrip",
          profile: "sandbox_workspace_file_roundtrip",
          checks: res.checks,
          bytesWritten: Buffer.byteLength(content, "utf8"),
          contentHash: sha256Hex(content),
          readMatches: true,
          deleted: true,
          verifiedAbsent: true,
          completedAtMs: Date.now(),
        },
        executedAtMs: Date.now(),
      };
    }

    if (res.ok === false) return failed(res.code);
    return failed("invalid-result");
  } catch {
    return failed("internal-error");
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
    if (sentinelDir !== undefined) {
      try {
        rmSync(sentinelDir, { recursive: true, force: true });
      } catch {}
    }
    if (previousSecret === undefined) {
      delete process.env[V2_SECRET_ENV_KEY];
    } else {
      process.env[V2_SECRET_ENV_KEY] = previousSecret;
    }
  }
}