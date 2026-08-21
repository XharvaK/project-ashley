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
import { createServer, connect as netConnect, type AddressInfo, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isCompleteSuccessResult,
  runSandboxM1,
  type SandboxM1HostEvidence,
  type SandboxM1ExecutionOptions,
  type SandboxM1Request,
  type SandboxM1Result,
} from "@composer-assistant/sandbox-m1";
import {
  SandboxV2Dispatcher,
  type SandboxV2Environment,
  type SandboxV2Request,
  type SandboxV2Result,
} from "@composer-assistant/sandbox-v2";
import type {
  CognitionInspectionRequest,
  CognitionWorkspaceRequest,
  ProjectInspectionObservation,
  WorkspaceExperimentObservation,
} from "../types.js";
import {
  loadOperatorProjectReadRegistry,
  type V2ProjectReadRegistry,
} from "./project-registry.js";
import type {
  OperationalClaimLicense,
  RoundtripEffectEvidence,
  WorkspaceClaimEffect,
} from "./engineering-types.js";

import type { DatabaseSync } from "node:sqlite";
import type { CognitionMode } from "../types.js";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import { env } from "../../env.js";

const SECRET_ENV_KEY = "ASHLEY_SANDBOX_M1_SECRET_SENTINEL";
const BWRAP_PATH = "/usr/bin/bwrap";

export type ExecuteProjectInspectionV2Input = {
  request: CognitionInspectionRequest;
  messageEntityUuid?: string;
  /**
   * REACTIVE CONTRACT: the full immutable turn-plan deadlines are required.
   * A reactive caller must not silently omit the preparation deadline.
   * The explicitly named legacy/proactive entry point
   * (`executeProjectInspectionV2LegacyProactive`) is the only no-plan path.
   */
  projectInspectionPreparationDeadlineAtMs: number;
  childExecutionDeadlineAtMs: number;
  childTerminationDeadlineAtMs: number;
  settlementDeadlineAtMs: number;
  dispatcher?: SandboxV2Dispatcher;
  registry?: V2ProjectReadRegistry;
  envOverrides?: Partial<SandboxV2Environment> & {
    sandboxEngineeringLifecycleEnabled?: boolean;
  };
  db?: DatabaseSync;
  masterMode?: CognitionMode;
  skipCapabilityGate?: boolean;
};

export type ExecuteProjectInspectionV2Result = {
  license: OperationalClaimLicense;
  observation: ProjectInspectionObservation | null;
  /**
   * Canonical dispatch truth: the execution spawn seam was invoked.
   * This does NOT prove successful process creation, Bubblewrap READY,
   * child execution, or operation success.
   */
  dispatchAttempted: boolean;
  /** Occurrence timestamp of the dispatch attempt, captured at the seam. */
  dispatchAttemptedAtMs?: number;
  /**
   * Truthful reason the acquisition-preparation phase ended when the final
   * result was reclassified (e.g. settlement overrun of preparation-failure
   * cleanup). Absent when preparation completed.
   */
  preparationEndedReason?: string;
  /**
   * Occurrence timestamp captured at the execution seam for the returned
   * outcome (when the dispatcher produced one). Persisting callers must use
   * this instead of result-consumption time.
   */
  occurredAtMs?: number;
};

/** Internal shape: deadlines optional so the legacy proactive path exists explicitly. */
type ProjectInspectionExecutionInput = Omit<
  ExecuteProjectInspectionV2Input,
  | "projectInspectionPreparationDeadlineAtMs"
  | "childExecutionDeadlineAtMs"
  | "childTerminationDeadlineAtMs"
  | "settlementDeadlineAtMs"
> & {
  projectInspectionPreparationDeadlineAtMs?: number;
  childExecutionDeadlineAtMs?: number;
  childTerminationDeadlineAtMs?: number;
  settlementDeadlineAtMs?: number;
};

export type ExecuteReactiveSandboxTaskV2Input = {
  content?: string;
  messageEntityUuid?: string;
  deadlineAtMs?: number;
  childExecutionDeadlineAtMs?: number;
  childTerminationDeadlineAtMs?: number;
  settlementDeadlineAtMs?: number;
  executor?: (
    request: SandboxM1Request,
    hostEvidence: SandboxM1HostEvidence,
    options?: SandboxM1ExecutionOptions,
  ) => Promise<SandboxM1Result>;
  clock?: { nowMs(): number };
  serverCloser?: (server: Server, connections: Set<Socket>) => void;
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
  if (process.env.SANDBOX_V2_FORCE_AVAILABLE === "true") {
    return true;
  }
  return process.platform === "linux" && existsSync(BWRAP_PATH);
}

function forceCloseLoopbackServer(server: Server, connections: Set<Socket>): void {
  server.close();
  for (const socket of connections) socket.destroy();
  connections.clear();
}

export async function executeReactiveSandboxTaskV2(
  input: ExecuteReactiveSandboxTaskV2Input = {},
): Promise<OperationalClaimLicense> {
  const nowMs = (): number => input.clock?.nowMs() ?? Date.now();
  const settlementDeadlineAtMs =
    input.settlementDeadlineAtMs ?? input.deadlineAtMs;
  if (
    input.childExecutionDeadlineAtMs !== undefined &&
    input.childTerminationDeadlineAtMs !== undefined &&
    input.childExecutionDeadlineAtMs >= input.childTerminationDeadlineAtMs
  ) {
    return {
      state: "failed",
      profile: "sandbox_workspace_file_roundtrip",
      error: "invalid_deadline_plan",
    };
  }
  if (
    input.childTerminationDeadlineAtMs !== undefined &&
    settlementDeadlineAtMs !== undefined &&
    input.childTerminationDeadlineAtMs >= settlementDeadlineAtMs
  ) {
    return {
      state: "failed",
      profile: "sandbox_workspace_file_roundtrip",
      error: "invalid_deadline_plan",
    };
  }
  if (
    settlementDeadlineAtMs !== undefined &&
    nowMs() >= settlementDeadlineAtMs
  ) {
    return {
      state: "failed",
      profile: "sandbox_workspace_file_roundtrip",
      error: "acquisition_settlement_deadline_expired",
    };
  }
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
  const serverConnections = new Set<Socket>();
  const previousSecret = process.env[SECRET_ENV_KEY];

  const result = await (async (): Promise<OperationalClaimLicense> => {
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
      serverConnections.add(sock);
      sock.once("close", () => serverConnections.delete(sock));
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
    const remainingChildMs =
      input.childExecutionDeadlineAtMs === undefined
        ? 30_000
        : input.childExecutionDeadlineAtMs - nowMs();
    if (remainingChildMs <= 0) {
      return {
        state: "failed",
        profile: "sandbox_workspace_file_roundtrip",
        error: "child_execution_deadline_expired",
      };
    }
    const res = await executor(request, hostEvidence, {
      timeoutMs: Math.min(30_000, remainingChildMs),
      childTerminationDeadlineAtMs: input.childTerminationDeadlineAtMs,
      settlementDeadlineAtMs,
      clock: input.clock,
    });

    // 7. Validate and map result to OperationalClaimLicense
    const completedAtMs = nowMs();
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
        cancellationRequested: res.cancellationRequested === true,
        cancellationAcknowledged: res.cancellationAcknowledged === true,
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
      taskId: `v2-m1-${nowMs()}`,
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
      (input.serverCloser ?? forceCloseLoopbackServer)(server, serverConnections);
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
  })();

  if (
    settlementDeadlineAtMs !== undefined &&
    nowMs() >= settlementDeadlineAtMs
  ) {
    return {
      state: "failed",
      taskId: `v2-m1-${nowMs()}`,
      profile: "sandbox_workspace_file_roundtrip",
      error: "acquisition_settlement_deadline_expired",
      ...(input.messageEntityUuid
        ? { sourceMessageEntityUuid: input.messageEntityUuid }
        : {}),
    };
  }
  return result;
}

/**
 * Executes a typed M2 project inspection request (read_file, list_directory, search_text)
 * through the SandboxV2Dispatcher.
 *
 * Invariants (fail-closed):
 *  1. Resolves projectId strictly through the operator-owned registry;
 *  2. On non-Linux hosts without test seams, gracefully returns state="none", error="sandbox_unavailable";
 *  3. On success, returns OperationalClaimLicense (profile: project_investigation, state: succeeded)
 *     and a separate ProjectInspectionObservation;
 *  4. On failure, returns OperationalClaimLicense with state="failed", typed error, and observation=null;
 *  5. On unavailable substrate, returns OperationalClaimLicense with state="none", error="sandbox_unavailable", and observation=null.
 *
 * Reactive contract: requires the full immutable turn-plan deadlines —
 * omission of the preparation deadline is a compile-time error. The only
 * no-plan path is the explicitly named legacy/proactive entry point below;
 * its missing timing plan is a pre-existing, deferred gap, not a reusable
 * reactive API shape.
 */
export async function executeProjectInspectionV2(
  input: ExecuteProjectInspectionV2Input,
): Promise<ExecuteProjectInspectionV2Result> {
  return runProjectInspectionV2(input);
}

/**
 * Explicitly isolated legacy/proactive M2 entry point WITHOUT a turn-deadline
 * plan. Proactive timing redesign is out of scope for this repair; this path
 * preserves existing proactive behavior and must not become the normal
 * reactive API (the reactive input type makes every deadline required).
 */
export async function executeProjectInspectionV2LegacyProactive(
  input: Omit<
    ProjectInspectionExecutionInput,
    | "projectInspectionPreparationDeadlineAtMs"
    | "childExecutionDeadlineAtMs"
    | "childTerminationDeadlineAtMs"
    | "settlementDeadlineAtMs"
  >,
): Promise<ExecuteProjectInspectionV2Result> {
  return runProjectInspectionV2(input);
}

async function runProjectInspectionV2(
  input: ProjectInspectionExecutionInput,
): Promise<ExecuteProjectInspectionV2Result> {
  const { request, messageEntityUuid } = input;
  let dispatchAttempted = false;
  let dispatchAttemptedAtMs: number | undefined;
  let preparationEndedReason: string | undefined;
  let occurredAtMs: number | undefined;
  const finish = (
    license: OperationalClaimLicense,
    observation: ProjectInspectionObservation | null,
  ): ExecuteProjectInspectionV2Result => ({
    license,
    observation,
    dispatchAttempted,
    ...(dispatchAttemptedAtMs !== undefined ? { dispatchAttemptedAtMs } : {}),
    ...(preparationEndedReason !== undefined ? { preparationEndedReason } : {}),
    ...(occurredAtMs !== undefined ? { occurredAtMs } : {}),
  });

  // 1. Enforce deadline: already-expired request fails before starting sandbox work
  const settlementDeadlineAtMs = input.settlementDeadlineAtMs;
  if (
    typeof settlementDeadlineAtMs === "number" &&
    settlementDeadlineAtMs <= Date.now()
  ) {
    return finish(
      {
        state: "failed",
        taskId: `v2-insp-${Date.now()}`,
        profile: "project_investigation",
        error: "deadline_exceeded",
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      null,
    );
  }

  // 2. Enforce capability release gate
  if (input.db && !input.skipCapabilityGate) {
    try {
      if (!capabilityCanInfluence(input.db, "project_inspection", input.masterMode)) {
        return finish(
          {
            state: "none",
            taskId: `v2-insp-${Date.now()}`,
            profile: "project_investigation",
            error: "project_inspection_gate_denied",
            ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
          },
          null,
        );
      }
    } catch {
      return finish(
        {
          state: "none",
          taskId: `v2-insp-${Date.now()}`,
          profile: "project_investigation",
          error: "project_inspection_gate_denied",
          ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
        },
        null,
      );
    }
  }

  // 3. Enforce sandbox lifecycle gate
  const lifecycleEnabled =
    input.envOverrides?.sandboxEngineeringLifecycleEnabled !== undefined
      ? input.envOverrides.sandboxEngineeringLifecycleEnabled
      : env.sandboxEngineeringLifecycleEnabled;
  if (!lifecycleEnabled) {
    return finish(
      {
        state: "none",
        taskId: `v2-insp-${Date.now()}`,
        profile: "project_investigation",
        error: "sandbox_lifecycle_disabled",
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      null,
    );
  }

  const registry =
    input.registry ??
    input.envOverrides?.registry ??
    loadOperatorProjectReadRegistry();

  const isCustomSeam =
    input.dispatcher !== undefined ||
    input.envOverrides?.spawnInspection !== undefined ||
    input.envOverrides?.sandboxAvailable !== undefined;

  // 4. Enforce substrate availability
  const substrateAvailable =
    input.envOverrides?.sandboxAvailable !== undefined
      ? input.envOverrides.sandboxAvailable()
      : isSandboxV2Available();

  if (!isCustomSeam && !substrateAvailable) {
    return finish(
      {
        state: "none",
        taskId: `v2-insp-${Date.now()}`,
        profile: "project_investigation",
        error: "sandbox_unavailable",
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      null,
    );
  }

  try {
    const dispatcher =
      input.dispatcher ??
      new SandboxV2Dispatcher({
        env: {
          registry,
          ...input.envOverrides,
          projectInspectionPreparationDeadlineAtMs:
            input.projectInspectionPreparationDeadlineAtMs,
          childExecutionDeadlineAtMs: input.childExecutionDeadlineAtMs,
          childTerminationDeadlineAtMs: input.childTerminationDeadlineAtMs,
          settlementDeadlineAtMs,
        },
      });

    const v2Req: SandboxV2Request = {
      version: 2,
      ...request,
    } as SandboxV2Request;

    const res: SandboxV2Result = await dispatcher.dispatch(v2Req);
    dispatchAttempted = res.dispatchAttempted === true;
    dispatchAttemptedAtMs = res.dispatchAttemptedAtMs;
    preparationEndedReason = res.preparationEndedReason;
    occurredAtMs = res.executedAtMs;

    if (res.outcome === "succeeded") {
      let observation: ProjectInspectionObservation;
      if (res.result.kind === "project.read_file") {
        if (
          typeof res.result.contentBase64 !== "string" ||
          typeof res.result.bytes !== "number" ||
          typeof res.result.sha256 !== "string"
        ) {
          return finish(
            {
              state: "failed",
              taskId: `v2-insp-${res.executedAtMs}`,
              profile: "project_investigation",
              error: "invalid_result",
              ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
            },
            null,
          );
        }
        const contentUtf8 = Buffer.from(
          res.result.contentBase64,
          "base64",
        ).toString("utf8");
        observation = {
          projectId: request.projectId,
          operation: "project.read_file",
          path: res.result.path,
          verified: true,
          truncated: false,
          executedAtMs: res.executedAtMs,
          contentUtf8,
          bytes: res.result.bytes,
          sha256: res.result.sha256,
        };
      } else if (res.result.kind === "project.list_directory") {
        if (!Array.isArray(res.result.entries) || typeof res.result.truncated !== "boolean") {
          return finish(
            {
              state: "failed",
              taskId: `v2-insp-${res.executedAtMs}`,
              profile: "project_investigation",
              error: "invalid_result",
              ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
            },
            null,
          );
        }
        observation = {
          projectId: request.projectId,
          operation: "project.list_directory",
          path: res.result.path,
          verified: true,
          truncated: res.result.truncated,
          executedAtMs: res.executedAtMs,
          entries: res.result.entries,
        };
      } else if (res.result.kind === "project.search_text") {
        if (
          !Array.isArray(res.result.matches) ||
          typeof res.result.filesScanned !== "number" ||
          typeof res.result.truncated !== "boolean"
        ) {
          return finish(
            {
              state: "failed",
              taskId: `v2-insp-${res.executedAtMs}`,
              profile: "project_investigation",
              error: "invalid_result",
              ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
            },
            null,
          );
        }
        observation = {
          projectId: request.projectId,
          operation: "project.search_text",
          path: res.result.path,
          pattern: (request as any).pattern,
          verified: true,
          truncated: res.result.truncated,
          executedAtMs: res.executedAtMs,
          matches: res.result.matches,
          filesScanned: res.result.filesScanned,
        };
      } else {
        return finish(
          {
            state: "failed",
            taskId: `v2-insp-${res.executedAtMs}`,
            profile: "project_investigation",
            error: "invalid_result",
            ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
          },
          null,
        );
      }

      return finish(
        {
          state: "succeeded",
          taskId: `v2-insp-${res.executedAtMs}`,
          profile: "project_investigation",
          ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
        },
        observation,
      );
    }

    if (res.outcome === "unavailable") {
      return finish(
        {
          state: "none",
          taskId: `v2-insp-${res.executedAtMs}`,
          profile: "project_investigation",
          error: res.error ?? "sandbox_unavailable",
          ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
        },
        null,
      );
    }

    // res.outcome === "failed"
    return finish(
      {
        state: "failed",
        taskId: `v2-insp-${res.executedAtMs}`,
        profile: "project_investigation",
        error: res.error ?? "inspection_failed",
        lateEvidenceVerified: res.lateEvidenceVerified === true,
        cancellationRequested: res.cancellationRequested === true,
        cancellationAcknowledged: res.cancellationAcknowledged === true,
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      null,
    );
  } catch {
    return finish(
      {
        state: "failed",
        taskId: `v2-insp-${Date.now()}`,
        profile: "project_investigation",
        error: "internal_error",
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      null,
    );
  }
}

export type ExecuteWorkspaceExperimentV2Input = {
  request: CognitionWorkspaceRequest;
  messageEntityUuid?: string;
  deadlineAtMs?: number;
  childExecutionDeadlineAtMs?: number;
  childTerminationDeadlineAtMs?: number;
  settlementDeadlineAtMs?: number;
  dispatcher?: SandboxV2Dispatcher;
  registry?: V2ProjectReadRegistry;
  workspaceManager?: import("@composer-assistant/sandbox-v2").WorkspaceManager;
  envOverrides?: Partial<SandboxV2Environment> & {
    sandboxEngineeringLifecycleEnabled?: boolean;
  };
  db?: DatabaseSync;
  masterMode?: CognitionMode;
  skipCapabilityGate?: boolean;
};

export type ExecuteWorkspaceExperimentV2Result = {
  license: OperationalClaimLicense;
  observation: WorkspaceExperimentObservation | null;
};

/**
 * Executes a typed M3 candidate workspace experiment request through the SandboxV2Dispatcher.
 *
 * Invariants (fail-closed):
 *  1. Resolves projectId strictly through the operator-owned registry;
 *  2. On non-Linux hosts without test seams, gracefully returns state="none", error="sandbox_unavailable";
 *  3. On success, returns OperationalClaimLicense (profile: workspace_experiment, state: succeeded)
 *     with narrow WorkspaceClaimEffect safe facts, and a separate WorkspaceExperimentObservation;
 *  4. On failure, returns OperationalClaimLicense with state="failed", typed error, and observation=null;
 *  5. On unavailable substrate, returns OperationalClaimLicense with state="none", error="sandbox_unavailable", and observation=null.
 */
export async function executeWorkspaceExperimentV2(
  input: ExecuteWorkspaceExperimentV2Input,
): Promise<ExecuteWorkspaceExperimentV2Result> {
  const { request, messageEntityUuid } = input;

  // 1. Enforce deadline
  const settlementDeadlineAtMs =
    input.settlementDeadlineAtMs ?? input.deadlineAtMs;
  if (
    typeof settlementDeadlineAtMs === "number" &&
    settlementDeadlineAtMs <= Date.now()
  ) {
    return {
      license: {
        state: "failed",
        taskId: `v2-exp-${Date.now()}`,
        profile: "project_experimentation",
        error: "deadline_exceeded",
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      observation: null,
    };
  }

  // 2. Enforce capability release gate
  if (input.db && !input.skipCapabilityGate) {
    try {
      if (!capabilityCanInfluence(input.db, "project_experimentation", input.masterMode)) {
        return {
          license: {
            state: "none",
            taskId: `v2-exp-${Date.now()}`,
            profile: "project_experimentation",
            error: "project_experimentation_gate_denied",
            ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
          },
          observation: null,
        };
      }
    } catch {
      return {
        license: {
          state: "none",
          taskId: `v2-exp-${Date.now()}`,
          profile: "project_experimentation",
          error: "project_experimentation_gate_denied",
          ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
        },
        observation: null,
      };
    }
  }

  // 3. Enforce sandbox lifecycle gate
  const lifecycleEnabled =
    input.envOverrides?.sandboxEngineeringLifecycleEnabled !== undefined
      ? input.envOverrides.sandboxEngineeringLifecycleEnabled
      : env.sandboxEngineeringLifecycleEnabled;
  if (!lifecycleEnabled) {
    return {
      license: {
        state: "none",
        taskId: `v2-exp-${Date.now()}`,
        profile: "project_experimentation",
        error: "sandbox_lifecycle_disabled",
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      observation: null,
    };
  }

  const registry =
    input.registry ??
    input.envOverrides?.registry ??
    loadOperatorProjectReadRegistry();

  const isCustomSeam =
    input.dispatcher !== undefined ||
    input.envOverrides?.spawnInspection !== undefined ||
    input.envOverrides?.spawnWorkspace !== undefined ||
    input.envOverrides?.sandboxAvailable !== undefined;

  // 4. Enforce substrate availability
  const substrateAvailable =
    input.envOverrides?.sandboxAvailable !== undefined
      ? input.envOverrides.sandboxAvailable()
      : isSandboxV2Available();

  if (!isCustomSeam && !substrateAvailable) {
    return {
      license: {
        state: "none",
        taskId: `v2-exp-${Date.now()}`,
        profile: "project_experimentation",
        error: "sandbox_unavailable",
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      observation: null,
    };
  }

  try {
    const dispatcher =
      input.dispatcher ??
      new SandboxV2Dispatcher({
        env: {
          registry,
          workspaceManager: input.workspaceManager,
          ...input.envOverrides,
          childExecutionDeadlineAtMs: input.childExecutionDeadlineAtMs,
          childTerminationDeadlineAtMs: input.childTerminationDeadlineAtMs,
          settlementDeadlineAtMs,
        },
      });

    const v2Req: SandboxV2Request = {
      ...request,
      version: 2,
    } as SandboxV2Request;

    const res: SandboxV2Result = await dispatcher.dispatch(v2Req);

    if (res.outcome === "succeeded") {
      const workspaceId = res.workspaceId ?? (request as any).workspaceId ?? "unknown";
      const sourceSnapshotId = res.sourceSnapshotId ?? "unknown";
      const logicalRelativePath = (request as any).path ?? ".";

      const workspaceClaimEffect: WorkspaceClaimEffect = {
        verified: true,
        projectId: request.projectId,
        workspaceId,
        operation: request.operation,
        logicalRelativePath,
        sourceSnapshotId,
        bytesRead: res.result.kind === "workspace.read_file" ? res.result.bytes : undefined,
        bytesWritten: (res.result as any).bytesWritten,
        beforeSha256: (request as any).expectedSha256,
        afterSha256: (res.result as any).contentHash ?? (res.result as any).sha256,
        completedAtMs: res.executedAtMs,
      };

      const observation: WorkspaceExperimentObservation = {
        kind: "workspace_experiment_observation",
        projectId: request.projectId,
        workspaceId,
        operation: request.operation,
        verified: true,
        executedAtMs: res.executedAtMs,
        logicalRelativePath,
        sourceSnapshotId,
        contentUtf8:
          res.result.kind === "workspace.read_file" && typeof res.result.contentBase64 === "string"
            ? Buffer.from(res.result.contentBase64, "base64").toString("utf8")
            : undefined,
        entries: res.result.kind === "workspace.list_directory" ? res.result.entries : undefined,
        matches: res.result.kind === "workspace.search_text" ? res.result.matches : undefined,
        filesScanned: res.result.kind === "workspace.search_text" ? res.result.filesScanned : undefined,
        bytesWritten: (res.result as any).bytesWritten,
        bytesRead: res.result.kind === "workspace.read_file" ? res.result.bytes : undefined,
        beforeSha256: (request as any).expectedSha256,
        afterSha256: (res.result as any).contentHash ?? (res.result as any).sha256,
        contentHash: (res.result as any).contentHash,
        deleted: (res.result as any).deleted,
        verifiedAbsent: (res.result as any).verifiedAbsent,
      };

      return {
        license: {
          state: "succeeded",
          taskId: `v2-exp-${res.executedAtMs}`,
          profile: "project_experimentation",
          workspaceClaimEffect,
          executionTruth: res.executionTruth ?? "effect_verified",
          ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
        },
        observation,
      };
    }

    if (res.outcome === "unavailable") {
      return {
        license: {
          state: "none",
          taskId: `v2-exp-${res.executedAtMs}`,
          profile: "project_experimentation",
          error: res.error ?? "sandbox_unavailable",
          ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
        },
        observation: null,
      };
    }

    // res.outcome === "failed"
    return {
      license: {
        state:
          res.executionTruth === "effect_indeterminate"
            ? "outcome_unknown"
            : "failed",
        taskId: `v2-exp-${res.executedAtMs}`,
        profile: "project_experimentation",
        error: res.error ?? "workspace_experiment_failed",
        executionTruth: res.executionTruth ?? "no_effect_proven",
        lateEvidenceVerified: res.lateEvidenceVerified === true,
        cancellationRequested: res.cancellationRequested === true,
        cancellationAcknowledged: res.cancellationAcknowledged === true,
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      observation: null,
    };
  } catch {
    return {
      license: {
        state: "failed",
        taskId: `v2-exp-${Date.now()}`,
        profile: "project_experimentation",
        error: "internal_error",
        ...(messageEntityUuid ? { sourceMessageEntityUuid: messageEntityUuid } : {}),
      },
      observation: null,
    };
  }
}
