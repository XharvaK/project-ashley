/**
 * Engineering task coordinator (Autonomous Engineering Workstation wave).
 *
 * Owns the durable task model, admission, lifecycle state machine, budget
 * accounting, fail-closed concurrency (exactly one running task), cancellation
 * and restart recovery. The coordinator never executes tools itself; it drives
 * the `SandboxOperatorAdapter` against the broker `EngineeringExecutionPort`.
 */

import type { EngineeringExecutionPort, RoundtripEffectEvidence, SandboxTask, SandboxTaskProfile, SandboxTaskStatus } from "./engineering-types.js";
import { EngineeringOperatorAdapter, type OperatorEnvelopeProvider } from "./engineering-operator.js";
import type { ThinkingModel } from "./engineering-types.js";

export type CoordinatorConfig = {
  owner: string;
  budgets: { maxModelCalls: number; maxToolExecutions: number; maxWallMs: number };
  availableDiagnostics: string[];
  nowMs: () => number;
  /** Optional persistence hooks for durable task state. */
  persist?: (tasks: SandboxTask[]) => void;
};

export type AdmitParams = {
  objective: string;
  projectId: string | null;
  sourceBaseCommit?: string | null;
  admissionCause: SandboxTask["admissionCause"];
  profile: SandboxTaskProfile;
  groundingRefs?: string[];
};

export type CoordinatorResult = {
  taskId: string;
  status: SandboxTaskStatus;
  modelCallsUsed: number;
  toolCallsUsed: number;
  summary: string | null;
  candidatePatchRef: string | null;
  candidateCommitRef: string | null;
  artifactRefs: string[];
  effectEvidence?: RoundtripEffectEvidence | null;
};

let taskCounter = 0;

import { executeSandboxWorkspaceFileRoundtrip } from "./roundtrip-profile.js";

export class SandboxEngineeringCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly port: EngineeringExecutionPort;
  private readonly model: ThinkingModel;
  private tasks = new Map<string, SandboxTask>();
  private activeTaskId: string | null = null;
  /** Tasks whose operator loop must stop at the next safe point. */
  private cancelRequested = new Set<string>();

  constructor(model: ThinkingModel, port: EngineeringExecutionPort, config: CoordinatorConfig) {
    this.model = model;
    this.port = port;
    this.config = config;
  }

  /** Restore durable task state after restart. Running tasks become outcome_unknown. */
  recover(tasks: SandboxTask[]): void {
    for (const task of tasks) {
      if (task.status === "running") {
        task.status = "outcome_unknown";
        task.error = "recovered_after_restart";
      }
      if (task.status === "admitted") {
        task.status = "expired";
      }
      this.tasks.set(task.taskId, { ...task });
    }
    this.activeTaskId = null;
    this.persist();
  }

  list(): SandboxTask[] {
    return [...this.tasks.values()];
  }

  get(taskId: string): SandboxTask | null {
    return this.tasks.get(taskId) ?? null;
  }

  admit(params: AdmitParams): SandboxTask {
    const taskId = `eng-${Date.now().toString(36)}-${(taskCounter += 1).toString(36)}`;
    const task: SandboxTask = {
      taskId,
      owner: this.config.owner,
      projectId: params.projectId,
      sourceBaseCommit: params.sourceBaseCommit ?? null,
      admissionCause: params.admissionCause,
      groundingRefs: params.groundingRefs ?? [],
      profile: params.profile,
      status: "admitted",
      workspaceId: null,
      modelCallsUsed: 0,
      toolCallsUsed: 0,
      startedAtMs: null,
      deadlineMs: null,
      completedAtMs: null,
      error: null,
      refusal: null,
      candidatePatchRef: null,
      candidateCommitRef: null,
      artifactRefs: [],
    };
    this.tasks.set(taskId, task);
    this.persist();
    return task;
  }

  /** Run an admitted task. Refuses if another task is already running (concurrency 1). */
  async run(
    taskId: string,
    envelopes: OperatorEnvelopeProvider,
  ): Promise<CoordinatorResult> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error("unknown_task");
    if (this.activeTaskId !== null && this.activeTaskId !== taskId) {
      return this.result(task, "failed", "concurrency_limit");
    }
    if (task.status !== "admitted") {
      return this.result(task, task.status, "not_admitted");
    }
    this.activeTaskId = taskId;
    task.status = "running";
    task.startedAtMs = this.config.nowMs();
    task.deadlineMs = task.startedAtMs + this.config.budgets.maxWallMs;
    this.persist();

    if (task.profile === "sandbox_workspace_file_roundtrip") {
      try {
        const roundtrip = await executeSandboxWorkspaceFileRoundtrip({
          taskId,
          workspaceId: task.workspaceId,
          envelopes,
          port: this.port,
          nowMs: this.config.nowMs,
        });
        task.modelCallsUsed = 0;
        task.toolCallsUsed = roundtrip.ok ? 5 : 1;
        task.completedAtMs = this.config.nowMs();
        const wasCancelled = this.cancelRequested.has(taskId);
        if (wasCancelled) {
          task.status = "aborted";
        } else if (roundtrip.ok) {
          task.status = "completed";
          task.workspaceId = roundtrip.workspaceId;
          task.artifactRefs = roundtrip.artifactRefs;
          task.effectEvidence = roundtrip.evidence;
        } else {
          task.status = "failed";
          task.error = roundtrip.reason;
        }
        this.cancelRequested.delete(taskId);
        this.activeTaskId = null;
        this.persist();
        const summary = roundtrip.ok ? JSON.stringify(roundtrip.evidence) : task.error;
        return this.result(task, task.status, task.error, summary);
      } catch (err) {
        task.status = "failed";
        task.error = err instanceof Error ? err.message : "roundtrip_error";
        task.completedAtMs = this.config.nowMs();
        this.activeTaskId = null;
        this.persist();
        return this.result(task, "failed", task.error);
      }
    }

    const operator = new EngineeringOperatorAdapter(this.model, this.port);
    try {
      const outcome = await operator.runTask({
        taskId,
        objective: `Profile=${task.profile}. ${task.admissionCause}. ${task.groundingRefs.join(" ")}`,
        projectId: task.projectId,
        workspaceId: task.workspaceId,
        envelopes,
        availableDiagnostics: this.config.availableDiagnostics,
        nowMs: this.config.nowMs,
        budgets: this.config.budgets,
        isCancelled: () => this.cancelRequested.has(taskId),
      });
      task.modelCallsUsed = outcome.modelCallsUsed;
      task.toolCallsUsed = outcome.toolCallsUsed;
      task.completedAtMs = this.config.nowMs();
      // A cancellation that arrived after the model finished but before we
      // finalize must win: never report a cancelled task as completed. The
      // operator also reports outcome.status === "aborted" when isCancelled()
      // became true mid-run.
      const wasCancelled = this.cancelRequested.has(taskId) || outcome.status === "aborted";
      if (wasCancelled) {
        task.status = "aborted";
      } else if (outcome.status === "completed") {
        task.status = "completed";
        task.candidatePatchRef = extractPatchRef(outcome);
        task.artifactRefs = extractArtifactRefs(outcome);
      } else if (outcome.status === "awaiting_owner") {
        task.status = "awaiting_owner";
      } else if (outcome.status === "aborted") {
        task.status = "aborted";
      } else if (outcome.status === "budget_exhausted") {
        task.status = "expired";
        task.error = "budget_exhausted";
      } else {
        task.status = "failed";
        const lastFailed = [...outcome.results].reverse().find((r) => !r.ok);
        task.error = lastFailed && !lastFailed.ok ? lastFailed.errorCode : "operator_failed";
      }
      this.cancelRequested.delete(taskId);
      this.activeTaskId = null;
      this.persist();
      return this.result(task, task.status, task.error);
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : "operator_error";
      task.completedAtMs = this.config.nowMs();
      this.activeTaskId = null;
      this.persist();
      return this.result(task, "failed", task.error);
    }
  }

  /**
   * Cancellation: marks the task aborted and requests the running operator loop
   * to stop cooperatively. It does NOT clear `activeTaskId` — the concurrency
   * slot stays occupied until the loop actually terminates, so a second task
   * cannot be dispatched concurrently (concurrency stays 1). The operator's
   * `run()` finalizes to `aborted` and never overwrites it with `completed`.
   */
  cancel(taskId: string): SandboxTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.status === "running" || task.status === "admitted") {
      task.status = "aborted";
      task.completedAtMs = this.config.nowMs();
      this.cancelRequested.add(taskId);
      this.persist();
    }
    return task;
  }

  private result(
    task: SandboxTask,
    status: SandboxTaskStatus,
    error: string | null,
    summary?: string | null,
  ): CoordinatorResult {
    return {
      taskId: task.taskId,
      status,
      modelCallsUsed: task.modelCallsUsed,
      toolCallsUsed: task.toolCallsUsed,
      summary: summary !== undefined ? summary : error,
      candidatePatchRef: task.candidatePatchRef,
      candidateCommitRef: task.candidateCommitRef,
      artifactRefs: task.artifactRefs,
      effectEvidence: task.effectEvidence ?? null,
    };
  }

  private persist(): void {
    this.config.persist?.(this.list());
  }
}

function extractPatchRef(outcome: { results: { ok: boolean; data?: unknown }[] }): string | null {
  for (const r of outcome.results) {
    if (r.ok && r.data && typeof r.data === "object" && "artifactRef" in r.data) {
      const ref = (r.data as { artifactRef?: unknown }).artifactRef;
      if (typeof ref === "string" && ref.startsWith("patch-")) return ref;
    }
  }
  return null;
}

function extractArtifactRefs(outcome: { results: { ok: boolean; data?: unknown }[] }): string[] {
  const refs: string[] = [];
  for (const r of outcome.results) {
    if (r.ok && r.data && typeof r.data === "object" && "artifactRef" in r.data) {
      const ref = (r.data as { artifactRef?: unknown }).artifactRef;
      if (typeof ref === "string") refs.push(ref);
    }
  }
  return refs;
}
