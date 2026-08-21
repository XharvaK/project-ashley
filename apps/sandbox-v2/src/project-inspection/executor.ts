/**
 * Sandbox V2 M2 project-inspection host executor.
 *
 * Fail-closed pipeline:
 *  1. strict request validation (canonical relative paths only);
 *  2. projectId resolution through the operator-owned read registry
 *     (unknown / disabled / read-denied projects are refused);
 *  3. sanitized bounded source view materialization (exclusions + protected
 *     roots, symlinks never copied);
 *  4. host-owned loopback evidence + sentinel file/fd + environment secret;
 *  5. direct Bubblewrap execution (fixed profile, no shell, no arbitrary
 *     argv, no dynamic executable selection) with the view ro-bound at
 *     /project, network/pid/user/ipc/uts namespaces isolated, clean env;
 *  6. bounded stdin/stdout/stderr, timeout -> SIGKILL -> await close;
 *  7. typed evidence validation + host loopback verdict (fail closed);
 *  8. disposable view + evidence cleanup in finally.
 *
 * Execution/result truth is downstream of actual execution evidence only;
 * the model can never decide that an inspection happened.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, connect as netConnect, type AddressInfo, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SANDBOX_V2_INSPECTION_RUNNER_SOURCE } from "./runner.js";
import { isInspectionRunnerEvidence } from "./evidence.js";
import { buildSanitizedProjectView, removeProjectView, type ProjectSourceViewResult } from "./source-view.js";
import { validateProjectInspectionRequest } from "../validation.js";
import { V2_HOST_FACTS, V2_LIMITS, V2_SECRET_ENV_KEY } from "../limits.js";
import { awaitChildCloseByDeadline, forceCloseLoopbackServer, terminateChild } from "../settlement-cleanup.js";
import type { V2ProjectReadRegistry } from "../registry.js";
import type {
  SandboxV2ProjectListDirectoryRequest,
  SandboxV2ProjectReadFileRequest,
  SandboxV2ProjectSearchTextRequest,
  SandboxV2Result,
} from "../v2-types.js";
import type { ProtectedRootsConfig } from "@composer-assistant/sandbox-policy";

export type InspectionSpawnInput = {
  /** The sanitized source view directory (read-only mount source). */
  viewRoot: string;
  /** Canonical JSON request already bounded and validated. */
  requestJson: string;
  /** Host-owned evidence values injected into the runner request. */
  probePort: number;
  sentinelPath: string;
  fdSentinelCanonical: string;
  timeoutMs: number;
  childTerminationDeadlineAtMs: number;
  settlementDeadlineAtMs: number;
  nowMs: () => number;
};

export type InspectionSpawnOutput = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancellationRequested?: boolean;
  cancellationAcknowledged?: boolean;
  stdoutOverflow: boolean;
  stderrOverflow: boolean;
};

/** Injectable spawn seam (unit tests substitute a scripted runner). */
export type InspectionSpawn = (
  input: InspectionSpawnInput,
) => Promise<InspectionSpawnOutput>;

export type ProjectInspectionExecutorOptions = {
  registry: V2ProjectReadRegistry;
  protectedRoots?: ProtectedRootsConfig;
  available?: () => boolean;
  spawnRunner?: InspectionSpawn;
  /** Test seam: maps a resolved canonical root to a sanitized view. Defaults to the real builder. */
  viewBuilder?: (options: {
    canonicalRoot: string;
    protectedRoots: ProtectedRootsConfig;
  }) => Promise<ProjectSourceViewResult>;
  timeoutMs?: number;
  /** Absolute child-execution cutoff selected by the owning turn plan. */
  childExecutionDeadlineAtMs?: number;
  /** Absolute cutoff for awaiting child termination acknowledgement. */
  childTerminationDeadlineAtMs?: number;
  /** Absolute cutoff by which execution, validation, and cleanup must settle. */
  settlementDeadlineAtMs?: number;
  /** Deterministic test seam. */
  clock?: { nowMs(): number };
  /** Deterministic settlement teardown seam. */
  serverCloser?: (server: Server, connections: Set<Socket>) => void;
};

function buildBwrapArgs(viewRoot: string): string[] {
  return [
    "--unshare-user",
    "--unshare-pid",
    "--unshare-net",
    "--unshare-ipc",
    "--unshare-uts",
    "--ro-bind", "/usr", "/usr",
    "--symlink", "usr/lib", "/lib",
    "--symlink", "usr/lib64", "/lib64",
    "--symlink", "usr/bin", "/bin",
    "--symlink", "usr/sbin", "/sbin",
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--ro-bind", viewRoot, V2_HOST_FACTS.PROJECT_MOUNT,
    "--clearenv",
    "--setenv", "PATH", V2_HOST_FACTS.PATH_VALUE,
    "--setenv", "HOME", V2_HOST_FACTS.HOME_VALUE,
    "--chdir", V2_HOST_FACTS.PROJECT_MOUNT,
    "--die-with-parent",
    "--new-session",
    "--ro-bind", V2_HOST_FACTS.NVM_NODE_PREFIX, "/opt/node",
    V2_HOST_FACTS.NODE_BIN, "-e", SANDBOX_V2_INSPECTION_RUNNER_SOURCE,
  ];
}

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

function parseSingleJson(output: string): unknown | null {
  const trimmed = output.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function isV2InspectionAvailable(): boolean {
  return process.platform === "linux" && existsSync(V2_HOST_FACTS.BWRAP);
}

/** Default real Bubblewrap spawn (Linux Mint production posture). */
export async function spawnBubblewrapInspection(
  input: InspectionSpawnInput,
): Promise<InspectionSpawnOutput> {
  const child = spawn(V2_HOST_FACTS.BWRAP, buildBwrapArgs(input.viewRoot), {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdin = child.stdin;
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!stdin || !stdout || !stderr) {
    child.kill("SIGKILL");
    return {
      exitCode: null,
      stdout: "",
      stderr: "spawn-error",
      timedOut: false,
      stdoutOverflow: false,
      stderrOverflow: false,
    };
  }
  stdin.on("error", () => {});
  stdout.on("error", () => {});
  stderr.on("error", () => {});

  let stdoutData = "";
  let stderrData = "";
  let stdoutOverflow = false;
  let stderrOverflow = false;
  stdout.on("data", (chunk: Buffer) => {
    if (stdoutOverflow) return;
    if (stdoutData.length + chunk.length > V2_LIMITS.STDOUT_MAX_BYTES) {
      stdoutOverflow = true;
      terminateChild(child);
      return;
    }
    stdoutData += chunk.toString("utf8");
  });
  stderr.on("data", (chunk: Buffer) => {
    if (stderrOverflow) return;
    if (stderrData.length + chunk.length > V2_LIMITS.STDERR_MAX_BYTES) {
      stderrOverflow = true;
      terminateChild(child);
      return;
    }
    stderrData += chunk.toString("utf8");
  });

  if (Buffer.byteLength(input.requestJson, "utf8") > V2_LIMITS.REQUEST_MAX_BYTES) {
    terminateChild(child);
    return {
      exitCode: null,
      stdout: "",
      stderr: "request-too-large",
      timedOut: false,
      stdoutOverflow: false,
      stderrOverflow: false,
    };
  }
  stdin.write(input.requestJson);
  stdin.end();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    terminateChild(child);
  }, input.timeoutMs);

  let closeResult: { closed: boolean; exitCode: number | null };
  try {
    closeResult = await awaitChildCloseByDeadline(child, {
      childTerminationDeadlineAtMs: input.childTerminationDeadlineAtMs,
      nowMs: input.nowMs,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!closeResult.closed) timedOut = true;

  return {
    exitCode: closeResult.exitCode,
    stdout: stdoutData,
    stderr: stderrData,
    timedOut,
    ...(timedOut
      ? {
          cancellationRequested: true,
          cancellationAcknowledged: closeResult.closed,
        }
      : {}),
    stdoutOverflow,
    stderrOverflow,
  };
}

export async function executeProjectInspection(
  request:
    | SandboxV2ProjectReadFileRequest
    | SandboxV2ProjectListDirectoryRequest
    | SandboxV2ProjectSearchTextRequest,
  options: ProjectInspectionExecutorOptions,
): Promise<SandboxV2Result> {
  const operation = request.operation;
  const nowMs = (): number => options.clock?.nowMs() ?? Date.now();
  const failed = (error: string, executedAtMs = nowMs()): SandboxV2Result => ({
    outcome: "failed",
    operation,
    error,
    executedAtMs,
  });
  const executedAtMs = nowMs();

  if (
    options.childExecutionDeadlineAtMs !== undefined &&
    options.childTerminationDeadlineAtMs !== undefined &&
    options.childExecutionDeadlineAtMs >= options.childTerminationDeadlineAtMs
  ) {
    return failed("invalid_deadline_plan", executedAtMs);
  }
  if (
    options.childTerminationDeadlineAtMs !== undefined &&
    options.settlementDeadlineAtMs !== undefined &&
    options.childTerminationDeadlineAtMs >= options.settlementDeadlineAtMs
  ) {
    return failed("invalid_deadline_plan", executedAtMs);
  }
  if (
    options.settlementDeadlineAtMs !== undefined &&
    nowMs() >= options.settlementDeadlineAtMs
  ) {
    return failed("settlement_deadline_exceeded", executedAtMs);
  }

  const validated = validateProjectInspectionRequest(request);
  if (!validated.ok) return failed(validated.error, executedAtMs);

  const resolution = options.registry.resolveReadRoot(validated.projectId);
  if (!resolution.ok) return failed(resolution.error, executedAtMs);

  const spawnRunner = options.spawnRunner ?? spawnBubblewrapInspection;
  const isCustomSpawn = options.spawnRunner !== undefined;
  const available = options.available ?? isV2InspectionAvailable;
  if (!isCustomSpawn && !available()) {
    return {
      outcome: "unavailable",
      operation,
      error: "sandbox_unavailable",
      executedAtMs,
    };
  }

  let viewRoot: string | undefined;
  let sentinelDir: string | undefined;
  let fd: number | undefined;
  let server: Server | undefined;
  const serverConnections = new Set<Socket>();
  const previousSecret = process.env[V2_SECRET_ENV_KEY];

  const result = await (async (): Promise<SandboxV2Result> => {
    try {
    const view = await (options.viewBuilder ?? buildSanitizedProjectView)({
      canonicalRoot: resolution.entry.canonicalRoot,
      protectedRoots: options.protectedRoots ?? {
        delegatedWriteDeniedOwnerApprovable: [],
        absoluteDenial: [],
      },
    });
    if (!view.ok) return failed(view.error);
    const resolvedViewRoot = view.viewRoot;
    viewRoot = resolvedViewRoot;

    if (
      options.settlementDeadlineAtMs !== undefined &&
      nowMs() >= options.settlementDeadlineAtMs
    ) {
      return failed("settlement_deadline_exceeded");
    }

    sentinelDir = mkdtempSync(join(tmpdir(), "ashley-v2-sentinel-"));
    const sentinelPath = join(sentinelDir, "sentinel.txt");
    writeFileSync(sentinelPath, "sentinel", "utf8");
    fd = openSync(sentinelPath, "r");
    const sentinelCanonical = realpathSync(sentinelPath);
    process.env[V2_SECRET_ENV_KEY] = "s-" + randomBytes(16).toString("hex");

    let hits = 0;
    server = createServer((sock) => {
      hits += 1;
      serverConnections.add(sock);
      sock.once("close", () => serverConnections.delete(sock));
      sock.destroy();
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", () => resolve());
    });
    const probePort = (server.address() as AddressInfo).port;
    const positiveControl = await tryConnect(probePort);
    const baselineHits = hits;

    const runnerRequest = {
      version: 2,
      operation,
      ...(request.operation === "project.read_file"
        ? { path: request.path }
        : request.operation === "project.list_directory"
          ? { path: request.path }
          : {
              path: validated.path,
              pattern: validated.pattern!,
              ...(validated.maxMatches !== undefined
                ? { maxMatches: validated.maxMatches }
                : {}),
            }),
      probePort,
      sentinelPath: sentinelCanonical,
      fdSentinelCanonical: sentinelCanonical,
    };

    const requestJson = JSON.stringify(runnerRequest);
    const operationHardCapMs = options.timeoutMs ?? V2_LIMITS.TIMEOUT_MS;
    const remainingChildMs =
      options.childExecutionDeadlineAtMs === undefined
        ? operationHardCapMs
        : options.childExecutionDeadlineAtMs - nowMs();
    if (remainingChildMs <= 0) return failed("child_execution_deadline_expired");
    const childTimeoutMs = Math.min(operationHardCapMs, remainingChildMs);
    const run = await spawnRunner({
      viewRoot: resolvedViewRoot,
      requestJson,
      probePort,
      sentinelPath: sentinelCanonical,
      fdSentinelCanonical: sentinelCanonical,
      timeoutMs: childTimeoutMs,
      childTerminationDeadlineAtMs:
        options.childTerminationDeadlineAtMs ??
        options.settlementDeadlineAtMs ??
        nowMs() + childTimeoutMs,
      settlementDeadlineAtMs:
        options.settlementDeadlineAtMs ?? nowMs() + childTimeoutMs,
      nowMs,
    });

    if (run.timedOut) {
      return {
        ...failed("timeout"),
        cancellationRequested: run.cancellationRequested === true,
        cancellationAcknowledged: run.cancellationAcknowledged === true,
      };
    }
    if (run.stdoutOverflow) return failed("stdout-overflow");
    if (run.stderrOverflow) return failed("stderr-overflow");

    const parsed = parseSingleJson(run.stdout);
    if (parsed === null) {
      return failed(run.exitCode === 0 ? "malformed-output" : "runner-error");
    }
    const asRecord = parsed as Record<string, unknown>;
    if (run.exitCode !== 0) {
      return failed(typeof asRecord.code === "string" ? asRecord.code : "runner-error");
    }
    if (!isInspectionRunnerEvidence(parsed, operation)) {
      return failed("invalid-result");
    }
    const loopbackIsolated =
      positiveControl === true &&
      parsed.checks.loopbackConnectSucceeded === false &&
      hits - baselineHits === 0;
    if (!loopbackIsolated) return failed("loopback-isolation-failed");

    return {
      outcome: "succeeded",
      operation,
      result: parsed.result,
      executedAtMs: nowMs(),
    };
    } catch {
      return failed("internal-error");
    } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {}
    }
    if (server) {
      (options.serverCloser ?? forceCloseLoopbackServer)(server, serverConnections);
    }
    if (viewRoot !== undefined) removeProjectView(viewRoot);
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
  })();

  if (
    options.settlementDeadlineAtMs !== undefined &&
    nowMs() >= options.settlementDeadlineAtMs
  ) {
    return result.outcome === "succeeded"
      ? {
          outcome: "failed",
          operation,
          error: "settlement_deadline_exceeded",
          lateEvidenceVerified: true,
          executedAtMs: nowMs(),
        }
      : failed("settlement_deadline_exceeded");
  }
  return result;
}
