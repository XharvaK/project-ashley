/**
 * Sandbox V2 M3 workspace experiment host executor.
 *
 * Fail-closed pipeline (mirrors executor.ts project inspection pattern):
 *  1. strict request validation (canonical relative paths only, within /workspace);
 *  2. projectId resolution through the operator-owned read registry
 *     (unknown / disabled / read-denied projects are refused);
 *  3. workspace tree materialization (manifest.json controls provenance;
 *     tree persists beyond bwrap exit);
 *  4. host-owned loopback evidence + sentinel file/fd + environment secret;
 *  5. direct Bubblewrap execution (fixed profile, no shell, no arbitrary argv,
 *     /workspace ro-bind from managed workspace tree) with network/pid/user/ipc/uts
 *     namespaces isolated, clean env;
 *  6. bounded stdin/stdout/stderr, timeout -> SIGKILL -> await close;
 *  7. typed evidence validation + host loopback verdict (fail closed);
 *  8. disposable view + evidence cleanup in finally (manifest preserved).
 *
 * Execution/result truth is downstream of actual execution evidence only;
 * the model can never decide that an inspection happened.
 */

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, connect as netConnect, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager, type WorkspaceAcquisitionResult } from "./workspace-manager.js";
import { SANDBOX_V2_WORKSPACE_RUNNER_SOURCE } from "./runner.js";
import { isWorkspaceRunnerEvidence, type WorkspaceRunnerEvidence } from "./evidence.js";
import { validateProjectInspectionRequest } from "../validation.js";
import { V2_HOST_FACTS, V2_LIMITS, V2_SECRET_ENV_KEY } from "../limits.js";
import type { V2ProjectReadRegistry } from "../registry.js";
import {
  SANDBOX_V2_OPERATION_NAMES,
  type SandboxV2WorkspaceReadFileRequest,
  type SandboxV2WorkspaceListDirectoryRequest,
  type SandboxV2WorkspaceSearchTextRequest,
  type SandboxV2WorkspaceWriteFileRequest,
  type SandboxV2WorkspaceReplaceFileRequest,
  type SandboxV2WorkspaceEditTextRequest,
  type SandboxV2WorkspaceDeleteFileRequest,
  type SandboxV2WorkspaceCreateDirectoryRequest,
  type SandboxV2Result,
} from "../v2-types.js";
import type { ProtectedRootsConfig } from "@composer-assistant/sandbox-policy";

export type WorkspaceExperimentSpawnInput = {
  /** The durable workspace tree directory mounted writable as /workspace. */
  viewRoot: string;
  /** Canonical JSON request already bounded and validated. */
  requestJson: string;
  /** Host-owned evidence values injected into the runner request. */
  probePort: number;
  sentinelPath: string;
  fdSentinelCanonical: string;
  timeoutMs: number;
};

export type WorkspaceExperimentSpawnOutput = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  stdoutOverflow: boolean;
  stderrOverflow: boolean;
};

/** Injectable spawn seam (unit tests substitute a scripted runner). */
export type WorkspaceExperimentSpawn = (
  input: WorkspaceExperimentSpawnInput,
) => Promise<WorkspaceExperimentSpawnOutput>;

export type WorkspaceExperimentExecutorOptions = {
  registry: V2ProjectReadRegistry;
  protectedRoots?: ProtectedRootsConfig;
  available?: () => boolean;
  spawnRunner?: WorkspaceExperimentSpawn;
  workspaceManager?: WorkspaceManager;
  managedWorkspaceRoot?: string;
  timeoutMs?: number;
};

export type ProjectInspectionExecutorOptions = WorkspaceExperimentExecutorOptions;

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
    "--bind", viewRoot, "/workspace",
    "--clearenv",
    "--setenv", "PATH", V2_HOST_FACTS.PATH_VALUE,
    "--setenv", "HOME", V2_HOST_FACTS.HOME_VALUE,
    "--chdir", "/workspace",
    "--die-with-parent",
    "--new-session",
    "--ro-bind", V2_HOST_FACTS.NVM_NODE_PREFIX, "/opt/node",
    V2_HOST_FACTS.NODE_BIN, "-e", SANDBOX_V2_WORKSPACE_RUNNER_SOURCE,
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
  input: WorkspaceExperimentSpawnInput,
): Promise<WorkspaceExperimentSpawnOutput> {
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
      child.kill("SIGKILL");
      return;
    }
    stdoutData += chunk.toString("utf8");
  });
  stderr.on("data", (chunk: Buffer) => {
    if (stderrOverflow) return;
    if (stderrData.length + chunk.length > V2_LIMITS.STDERR_MAX_BYTES) {
      stderrOverflow = true;
      child.kill("SIGKILL");
      return;
    }
    stderrData += chunk.toString("utf8");
  });

  if (Buffer.byteLength(input.requestJson, "utf8") > V2_LIMITS.REQUEST_MAX_BYTES) {
    child.kill("SIGKILL");
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
    child.kill("SIGKILL");
  }, input.timeoutMs);

  let exitCode: number | null;
  try {
    exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("close", (code) => resolve(code));
      child.once("error", (err) => reject(err));
    });
  } catch {
    return {
      exitCode: null,
      stdout: stdoutData,
      stderr: stderrData,
      timedOut,
      stdoutOverflow,
      stderrOverflow,
    };
  } finally {
    clearTimeout(timer);
  }

  return {
    exitCode,
    stdout: stdoutData,
    stderr: stderrData,
    timedOut,
    stdoutOverflow,
    stderrOverflow,
  };
}

export async function executeWorkspaceExperiment(
  request:
    | SandboxV2WorkspaceReadFileRequest
    | SandboxV2WorkspaceListDirectoryRequest
    | SandboxV2WorkspaceSearchTextRequest
    | SandboxV2WorkspaceWriteFileRequest
    | SandboxV2WorkspaceReplaceFileRequest
    | SandboxV2WorkspaceEditTextRequest
    | SandboxV2WorkspaceDeleteFileRequest
    | SandboxV2WorkspaceCreateDirectoryRequest,
  options: WorkspaceExperimentExecutorOptions,
): Promise<SandboxV2Result> {
  const operation = request.operation;
  const failed = (error: string, executedAtMs = Date.now()): SandboxV2Result => ({
    outcome: "failed",
    operation,
    error,
    executedAtMs,
  });
  const executedAtMs = Date.now();

  // 1. Validate request is version 2 with valid operation
  if (!SANDBOX_V2_OPERATION_NAMES.includes(request.operation)) {
    return failed("unknown_operation");
  }

  // 2. Resolve projectId through the operator-owned read registry
  const resolution = options.registry.resolveReadRoot(request.projectId);
  if (!resolution.ok) return failed(resolution.error, executedAtMs);

  // 3. Check candidateWorkspaceAllowed via registry entry
  const entry = resolution.entry;
  if (!entry.candidateWorkspaceAllowed) {
    return failed("workspace_not_allowed", executedAtMs);
  }

  // 4. Substrate availability
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

  // 5. Acquire durable workspace via WorkspaceManager (failure-atomic create or resume)
  const workspaceManager =
    options.workspaceManager ??
    new WorkspaceManager({ managedRoot: options.managedWorkspaceRoot });

  const acquisition = await workspaceManager.acquireWorkspace(
    {
      projectId: entry.projectId,
      canonicalRoot: entry.canonicalRoot,
      protectedRoots: options.protectedRoots,
    },
    request.workspaceId,
  );
  if (!acquisition.ok) {
    return failed(acquisition.error, executedAtMs);
  }

  let sentinelDir: string | undefined;
  let fd: number | undefined;
  let server: Server | undefined;
  let previousSecret: string | undefined;

  try {
    // 6. Establish host sentinel file & descriptor
    sentinelDir = mkdtempSync(join(tmpdir(), "ashley-v3-sentinel-"));
    const sentinelPath = join(sentinelDir, "sentinel.txt");
    writeFileSync(sentinelPath, "sentinel", "utf8");
    fd = openSync(sentinelPath, "r");
    const sentinelCanonical = realpathSync(sentinelPath);
    previousSecret = process.env[V2_SECRET_ENV_KEY];

    // 7. Establish host environment secret
    process.env[V2_SECRET_ENV_KEY] = "s-" + randomBytes(16).toString("hex");

    // 8. Establish short-lived host loopback probe listener
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

    // 9. Construct runner request JSON
    const runnerRequest = {
      version: 2,
      operation,
      ...(request.operation === "workspace.read_file"
        ? { path: request.path, workspaceId: acquisition.workspaceId }
        : request.operation === "workspace.list_directory"
          ? { path: request.path, workspaceId: acquisition.workspaceId }
          : request.operation === "workspace.search_text"
            ? {
                path: (request as any).path,
                pattern: (request as any).pattern!,
                workspaceId: acquisition.workspaceId,
                maxMatches: (request as any).maxMatches,
              }
            : request.operation === "workspace.write_file"
              ? {
                  path: request.path,
                  content: (request as any).content,
                  mustNotExist: (request as any).mustNotExist === true,
                  workspaceId: acquisition.workspaceId,
                }
              : request.operation === "workspace.replace_file"
                ? {
                    path: request.path,
                    content: (request as any).content,
                    expectedSha256: (request as any).expectedSha256,
                    workspaceId: acquisition.workspaceId,
                  }
                : request.operation === "workspace.edit_text"
                  ? {
                      path: request.path,
                      oldText: (request as any).oldText,
                      newText: (request as any).newText,
                      expectedSha256: (request as any).expectedSha256,
                      workspaceId: acquisition.workspaceId,
                    }
                  : request.operation === "workspace.delete_file"
                    ? {
                        path: request.path,
                        expectedSha256: (request as any).expectedSha256,
                        workspaceId: acquisition.workspaceId,
                      }
                    : request.operation === "workspace.create_directory"
                      ? { path: request.path, workspaceId: acquisition.workspaceId }
                      : {}),
      probePort,
      sentinelPath: sentinelCanonical,
      fdSentinelCanonical: sentinelCanonical,
    };

    const requestJson = JSON.stringify(runnerRequest);
    if (Buffer.byteLength(requestJson, "utf8") > V2_LIMITS.WORKSPACE_REQUEST_MAX_BYTES) {
      return failed("request_too_large", executedAtMs);
    }

    const run = await spawnRunner({
      viewRoot: acquisition.workspaceTreeRoot,
      requestJson,
      probePort,
      sentinelPath: sentinelCanonical,
      fdSentinelCanonical: sentinelCanonical,
      timeoutMs: options.timeoutMs ?? V2_LIMITS.TIMEOUT_MS,
    });

    if (run.timedOut) return failed("timeout");
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
    if (!isWorkspaceRunnerEvidence(parsed, operation)) {
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
      workspaceId: acquisition.workspaceId,
      sourceSnapshotId: acquisition.manifest.sourceSnapshotId,
      executedAtMs: Date.now(),
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