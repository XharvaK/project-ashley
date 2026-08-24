/**
 * In-process durable M6 runner. Claims operational_jobs envelopes only.
 * Historical origin_job_id-null M6 rows are ignored. Not a V1 supervisor.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceManager } from "@composer-assistant/sandbox-v2";
import type { CognitionBoundedOperationRequest } from "../types.js";
import type { OperationalClaimLicense } from "./engineering-types.js";
import {
  executeCandidateAuthorshipV2,
  executeCandidateVerificationV2,
  executeWorkspaceExperimentV2,
} from "./v2-execution.js";
import {
  declareDurableStep,
  finalizeBoundedOperation,
  getBoundedOperationTaskRow,
  getDurableStep,
  listDurableSteps,
  markBoundedOperationRunning,
  markDurableStepInFlight,
  persistAdmittedBoundedOperation,
  settleDurableStep,
  type DurableStepRow,
} from "./bounded-operation-store.js";
import {
  assertOperationalJobFence,
  claimOperationalJob,
  findClaimableOperationalJob,
  getOperationalJob,
  getOperationalJobBySourceMessage,
  hasActiveOperationalJobForOwner,
  insertAdmittedOperationalJob,
  listTerminalJobsMissingCompletion,
  listUnclaimedCancelledJobs,
  mintOperationalJobId,
  renewOperationalJobLease,
  setOperationalJobStepIndex,
  terminalizeOperationalJob,
  terminalizeUnclaimedCancelledJob,
  tryEnqueueOperationalJobDelivery,
  type OperationalJobRow,
  type OperationalJobStatus,
} from "./operational-job-store.js";
import {
  tickDurableCognition,
  ownerCognitionStatus,
  type RunDurableThought,
} from "./durable-cognition.js";
import { getVerificationReceiptByTaskId } from "./verification-receipt-store.js";
import { getChangeSetByOriginChildTaskId } from "./changeset-store.js";
import { drainOperationalJobCompletions } from "./durable-job-completion.js";

export type DurableChildKind =
  | "candidate_workspace_experiment"
  | "candidate_verification"
  | "candidate_authorship";

export type DurableChildDrivers = {
  runExperiment: (input: {
    request: Record<string, unknown>;
    taskId: string;
    ownerId: string;
  }) => Promise<OperationalClaimLicense>;
  runVerification: (input: {
    request: Record<string, unknown>;
    taskId: string;
    ownerId: string;
  }) => Promise<OperationalClaimLicense>;
  runAuthorship: (input: {
    request: Record<string, unknown>;
    taskId: string;
    ownerId: string;
  }) => Promise<OperationalClaimLicense>;
};

export type DurableRunnerContext = {
  db: DatabaseSync;
  nowMs: () => number;
  drivers?: DurableChildDrivers;
  workspaceManager?: WorkspaceManager;
  shouldStop?: () => boolean;
  expressCompletion?: (input: {
    floorText: string;
    license: OperationalClaimLicense;
  }) => Promise<string | null>;
  runDurableThought?: RunDurableThought;
};

type EffectClass = "NO_EFFECT" | "RECONCILABLE_EFFECT" | "AMBIGUOUS_EFFECT";

function mintChildTaskId(kind: DurableChildKind): string {
  const prefix =
    kind === "candidate_workspace_experiment"
      ? "v2-exp"
      : kind === "candidate_verification"
        ? "v2-verify"
        : "v2-author";
  return `${prefix}-${randomBytes(8).toString("hex")}`;
}

function parseAdmittedSteps(json: string): Array<{
  kind: DurableChildKind;
  operation: string | null;
  request: Record<string, unknown>;
}> {
  const raw = JSON.parse(json) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const row = entry as {
      kind?: string;
      operation?: string;
      request?: Record<string, unknown>;
    };
    return {
      kind: row.kind as DurableChildKind,
      operation: row.operation ?? null,
      request: (row.request ?? row) as Record<string, unknown>,
    };
  });
}

function holdFence(
  ctx: DurableRunnerContext,
  job: OperationalJobRow,
  token: string,
  generation: number,
): boolean {
  renewOperationalJobLease(ctx.db, {
    jobId: job.jobId,
    token,
    generation,
    nowMs: ctx.nowMs(),
  });
  return assertOperationalJobFence(ctx.db, {
    jobId: job.jobId,
    token,
    generation,
  });
}

function defaultDrivers(ctx: DurableRunnerContext): DurableChildDrivers {
  return {
    async runExperiment(input) {
      const result = await executeWorkspaceExperimentV2({
        request: input.request as never,
        taskId: input.taskId,
        db: ctx.db,
        workspaceManager: ctx.workspaceManager,
      });
      return result.license;
    },
    async runVerification(input) {
      const result = await executeCandidateVerificationV2({
        request: input.request as never,
        taskId: input.taskId,
        ownerId: input.ownerId,
        db: ctx.db,
        workspaceManager: ctx.workspaceManager,
      });
      return result.license;
    },
    async runAuthorship(input) {
      const result = await executeCandidateAuthorshipV2({
        request: input.request as never,
        taskId: input.taskId,
        ownerId: input.ownerId,
        db: ctx.db,
        workspaceManager: ctx.workspaceManager,
      });
      return result.license;
    },
  };
}

function classifyInFlight(
  ctx: DurableRunnerContext,
  kind: DurableChildKind,
  childTaskId: string,
): EffectClass {
  if (kind === "candidate_verification") {
    return getVerificationReceiptByTaskId(ctx.db, childTaskId)
      ? "RECONCILABLE_EFFECT"
      : "AMBIGUOUS_EFFECT";
  }
  if (kind === "candidate_authorship") {
    return getChangeSetByOriginChildTaskId(ctx.db, childTaskId)
      ? "RECONCILABLE_EFFECT"
      : "NO_EFFECT";
  }
  const found = ctx.workspaceManager?.findWorkspaceByOriginChildTaskId(childTaskId);
  return found ? "RECONCILABLE_EFFECT" : "NO_EFFECT";
}

function enqueueCompletion(db: DatabaseSync, jobId: string): void {
  tryEnqueueOperationalJobDelivery(db, {
    jobId,
    deliveryKind: "completion",
    deliveryReservationId: 0,
  });
}

function closeJob(
  ctx: DurableRunnerContext,
  job: OperationalJobRow,
  token: string,
  generation: number,
  status: Exclude<OperationalJobStatus, "admitted" | "running">,
  stopReason: string,
  m6TaskId: string,
  ownerId: string,
): void {
  const steps = listDurableSteps(ctx.db, m6TaskId);
  const executed = steps.filter((step) => step.stepRunStatus === "succeeded").length;
  finalizeBoundedOperation(ctx.db, {
    ownerId,
    taskId: m6TaskId,
    status: status === "outcome_unknown" ? "outcome_unknown" : status,
    stopReason: stopReason as never,
    stepsExecuted: executed,
    stepRecords: [],
    skipStepInsert: true,
  });
  const ok = terminalizeOperationalJob(ctx.db, {
    jobId: job.jobId,
    token,
    generation,
    status,
    stopReason,
  });
  if (ok) enqueueCompletion(ctx.db, job.jobId);
}

function persistChildOutcome(
  db: DatabaseSync,
  m6TaskId: string,
  stepIndex: number,
  license: OperationalClaimLicense,
): void {
  const succeeded = license.state === "succeeded";
  settleDurableStep(db, {
    taskId: m6TaskId,
    stepIndex,
    stepRunStatus: succeeded ? "succeeded" : "failed",
    outcome: succeeded ? "succeeded" : "failed",
    error: license.error ?? null,
    effectRefKind: typeof license.profile === "string" ? license.profile : null,
    effectRefId: license.taskId ?? null,
    effectFactsJson: JSON.stringify({
      state: license.state,
      error: license.error ?? null,
      workspaceId:
        license.workspaceClaimEffect?.workspaceId ??
        license.verificationClaimEffect?.workspaceId ??
        license.authorshipClaimEffect?.workspaceId ??
        null,
    }),
    derivedLicenseJson: JSON.stringify(license),
  });
}

function skipLaterSteps(db: DatabaseSync, m6TaskId: string, fromIndex: number, total: number): void {
  for (let later = fromIndex; later < total; later += 1) {
    if (getDurableStep(db, m6TaskId, later)) continue;
    const childTaskId = `v2-skip-${randomBytes(4).toString("hex")}`;
    declareDurableStep(db, {
      ownerId: "system",
      taskId: m6TaskId,
      stepIndex: later,
      stepKind: "skipped",
      operation: null,
      childTaskId,
      causationKey: `${m6TaskId}:${later}:skipped`,
      leaseGeneration: 0,
    });
    settleDurableStep(db, {
      taskId: m6TaskId,
      stepIndex: later,
      stepRunStatus: "skipped",
      outcome: "skipped",
      error: "not_started",
    });
  }
}

async function runOrReconcileStep(
  ctx: DurableRunnerContext,
  job: OperationalJobRow,
  token: string,
  generation: number,
  m6TaskId: string,
  admittedJson: string,
  stepIndex: number,
  spec: { kind: DurableChildKind; operation: string | null; request: Record<string, unknown> },
): Promise<"continue" | "stop"> {
  const drivers = ctx.drivers ?? defaultDrivers(ctx);
  let step = getDurableStep(ctx.db, m6TaskId, stepIndex);
  let openedThisTurn = false;
  if (!step?.childTaskId) {
    if (!holdFence(ctx, job, token, generation)) return "stop";
    const childTaskId = mintChildTaskId(spec.kind);
    declareDurableStep(ctx.db, {
      ownerId: job.ownerId,
      taskId: m6TaskId,
      stepIndex,
      stepKind: spec.kind,
      operation: spec.operation,
      childTaskId,
      causationKey: `${job.jobId}:${stepIndex}:${childTaskId}`,
      leaseGeneration: generation,
    });
    markDurableStepInFlight(ctx.db, m6TaskId, stepIndex);
    openedThisTurn = true;
    step = getDurableStep(ctx.db, m6TaskId, stepIndex);
  } else if (step.stepRunStatus === "declared") {
    markDurableStepInFlight(ctx.db, m6TaskId, stepIndex);
    openedThisTurn = true;
    step = getDurableStep(ctx.db, m6TaskId, stepIndex);
  }
  if (!step?.childTaskId) return "stop";

  if (
    step.stepRunStatus === "succeeded" ||
    step.stepRunStatus === "failed" ||
    step.stepRunStatus === "skipped" ||
    step.stepRunStatus === "outcome_unknown"
  ) {
    return "continue";
  }

  if (step.stepRunStatus === "in_flight" && !openedThisTurn) {
    const classification = classifyInFlight(ctx, spec.kind, step.childTaskId);
    if (classification === "AMBIGUOUS_EFFECT") {
      settleDurableStep(ctx.db, {
        taskId: m6TaskId,
        stepIndex,
        stepRunStatus: "outcome_unknown",
        outcome: "failed",
        error: "ambiguous_in_flight_effect",
      });
      if (holdFence(ctx, job, token, generation)) {
        closeJob(ctx, job, token, generation, "outcome_unknown", "ambiguous_in_flight_effect", m6TaskId, job.ownerId);
      }
      return "stop";
    }
    if (classification === "RECONCILABLE_EFFECT") {
      settleDurableStep(ctx.db, {
        taskId: m6TaskId,
        stepIndex,
        stepRunStatus: "succeeded",
        outcome: "succeeded",
        error: null,
        effectRefKind: spec.kind,
        effectRefId: step.childTaskId,
      });
      if (
        !setOperationalJobStepIndex(ctx.db, {
          jobId: job.jobId,
          token,
          generation,
          stepIndex: stepIndex + 1,
        })
      ) {
        return "stop";
      }
      return "continue";
    }
  }

  if (!holdFence(ctx, job, token, generation)) return "stop";
  const live = getOperationalJob(ctx.db, job.jobId);
  if (!live) return "stop";
  if (live.cancelRequested) {
    settleDurableStep(ctx.db, {
      taskId: m6TaskId,
      stepIndex,
      stepRunStatus: "skipped",
      outcome: "skipped",
      error: "cancelled_before_effect",
    });
    skipLaterSteps(ctx.db, m6TaskId, stepIndex + 1, parseAdmittedSteps(admittedJson).length);
    if (holdFence(ctx, job, token, generation)) {
      closeJob(ctx, job, token, generation, "cancelled", "cancelled", m6TaskId, job.ownerId);
    }
    return "stop";
  }
  if (ctx.nowMs() >= live.lifetimeExpiresAtMs) {
    settleDurableStep(ctx.db, {
      taskId: m6TaskId,
      stepIndex,
      stepRunStatus: "skipped",
      outcome: "skipped",
      error: "deadline_exceeded",
    });
    if (holdFence(ctx, job, token, generation)) {
      closeJob(ctx, job, token, generation, "deadline_exceeded", "deadline_exceeded", m6TaskId, job.ownerId);
    }
    return "stop";
  }

  let license: OperationalClaimLicense;
  switch (spec.kind) {
    case "candidate_workspace_experiment":
      license = await drivers.runExperiment({
        request: spec.request,
        taskId: step.childTaskId,
        ownerId: job.ownerId,
      });
      break;
    case "candidate_verification":
      license = await drivers.runVerification({
        request: spec.request,
        taskId: step.childTaskId,
        ownerId: job.ownerId,
      });
      break;
    case "candidate_authorship":
      license = await drivers.runAuthorship({
        request: spec.request,
        taskId: step.childTaskId,
        ownerId: job.ownerId,
      });
      break;
    default: {
      const _never: never = spec.kind;
      throw new Error(`unhandled_durable_child:${String(_never)}`);
    }
  }

  if (!holdFence(ctx, job, token, generation)) return "stop";
  persistChildOutcome(ctx.db, m6TaskId, stepIndex, license);
  if (license.state !== "succeeded") {
    skipLaterSteps(ctx.db, m6TaskId, stepIndex + 1, parseAdmittedSteps(admittedJson).length);
    closeJob(ctx, job, token, generation, "failed", license.error ?? "step_failed", m6TaskId, job.ownerId);
    return "stop";
  }
  if (
    !setOperationalJobStepIndex(ctx.db, {
      jobId: job.jobId,
      token,
      generation,
      stepIndex: stepIndex + 1,
    })
  ) {
    return "stop";
  }
  return "continue";
}

export async function runDurableOperationalJob(
  ctx: DurableRunnerContext,
  claimed: { job: OperationalJobRow; token: string; generation: number },
): Promise<void> {
  const { job, token, generation } = claimed;
  const m6Id = job.boundedOperationTaskId;
  if (!m6Id) return;
  const m6 = getBoundedOperationTaskRow(ctx.db, m6Id);
  if (!m6 || !m6.originJobId) return;
  markBoundedOperationRunning(ctx.db, m6Id);
  const specs = parseAdmittedSteps(m6.admittedStepsJson);
  let index = job.currentStepIndex;
  while (index < specs.length) {
    if (ctx.shouldStop?.()) return;
    const spec = specs[index];
    if (!spec) break;
    const outcome = await runOrReconcileStep(
      ctx,
      job,
      token,
      generation,
      m6Id,
      m6.admittedStepsJson,
      index,
      spec,
    );
    if (outcome === "stop") return;
    index += 1;
  }
  if (!holdFence(ctx, job, token, generation)) return;
  closeJob(ctx, job, token, generation, "succeeded", "succeeded", m6Id, job.ownerId);
}

export function recoverDurableOperationalJobs(ctx: DurableRunnerContext): void {
  for (const cancelled of listUnclaimedCancelledJobs(ctx.db)) {
    if (terminalizeUnclaimedCancelledJob(ctx.db, cancelled.jobId, "cancelled")) {
      enqueueCompletion(ctx.db, cancelled.jobId);
    }
  }
  for (const missing of listTerminalJobsMissingCompletion(ctx.db)) {
    enqueueCompletion(ctx.db, missing.jobId);
  }
}

export async function tickDurableOperationalJobs(ctx: DurableRunnerContext): Promise<void> {
  recoverDurableOperationalJobs(ctx);
  await drainOperationalJobCompletions({
    db: ctx.db,
    nowMs: ctx.nowMs,
    workspaceManager: ctx.workspaceManager,
    express: ctx.expressCompletion,
  });
  if (ctx.shouldStop?.()) return;
  if (ctx.runDurableThought) {
    await tickDurableCognition({
      db: ctx.db,
      nowMs: ctx.nowMs,
      runDurableThought: ctx.runDurableThought,
      shouldStop: ctx.shouldStop,
    });
  }
  if (ctx.shouldStop?.()) return;
  const claimable = findClaimableOperationalJob(ctx.db, ctx.nowMs());
  if (!claimable) return;
  const claimed = claimOperationalJob(ctx.db, claimable.jobId, ctx.nowMs());
  if (!claimed.ok) return;
  await runDurableOperationalJob(ctx, {
    job: claimed.job,
    token: claimed.token,
    generation: claimed.generation,
  });
  await drainOperationalJobCompletions({
    db: ctx.db,
    nowMs: ctx.nowMs,
    workspaceManager: ctx.workspaceManager,
    express: ctx.expressCompletion,
  });
}

export function admitDurableBoundedOperation(
  db: DatabaseSync,
  input: {
    ownerId: string;
    sourceMessageEntityUuid: string;
    sourceUserMessageId: number | null;
    admissionReservationId: number;
    request: CognitionBoundedOperationRequest;
    taskId: string;
    jobId?: string;
  },
): { jobId: string; taskId: string; duplicate: boolean } {
  const existing = getOperationalJobBySourceMessage(
    db,
    input.ownerId,
    input.sourceMessageEntityUuid,
  );
  if (existing) {
    return {
      jobId: existing.jobId,
      taskId: existing.boundedOperationTaskId ?? input.taskId,
      duplicate: true,
    };
  }
  if (hasActiveOperationalJobForOwner(db, input.ownerId)) {
    throw new Error("durable_job_already_active");
  }
  const jobId = input.jobId ?? mintOperationalJobId();
  db.exec("BEGIN IMMEDIATE");
  try {
    persistAdmittedBoundedOperation(db, {
      ownerId: input.ownerId,
      taskId: input.taskId,
      projectId: input.request.projectId,
      workspaceId: input.request.workspaceId ?? "pending_acquisition",
      origin:
        input.request.origin === "ashley_private_interest"
          ? "ashley_private_interest"
          : "owner_request",
      objective: input.request.objective,
      successCondition: input.request.successCondition,
      failureCondition: input.request.failureCondition,
      admittedStepsJson: JSON.stringify(
        input.request.steps.map((step) => ({
          kind: step.kind,
          operation: "operation" in step.request ? step.request.operation : null,
          request: step.request,
        })),
      ),
      maxSteps: input.request.budget.maxSteps,
      deadlineAtMs: input.request.budget.deadlineAtMs,
      originJobId: jobId,
    });
    insertAdmittedOperationalJob(db, {
      ownerId: input.ownerId,
      sourceMessageEntityUuid: input.sourceMessageEntityUuid,
      sourceUserMessageId: input.sourceUserMessageId,
      admissionReservationId: input.admissionReservationId,
      boundedOperationTaskId: input.taskId,
      projectId: input.request.projectId,
      lifetimeExpiresAtMs: input.request.budget.deadlineAtMs,
      jobId,
    });
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* keep original error */
    }
    throw error;
  }
  return { jobId, taskId: input.taskId, duplicate: false };
}

export function durableJobStatusSnapshot(
  db: DatabaseSync,
  ownerId: string,
  jobId: string,
): Record<string, unknown> | null {
  const job = getOperationalJob(db, jobId);
  if (!job || job.ownerId !== ownerId) return null;
  const steps = job.boundedOperationTaskId
    ? listDurableSteps(db, job.boundedOperationTaskId)
    : [];
  const deliveries = db
    .prepare(
      `SELECT delivery_kind AS deliveryKind, delivery_reservation_id AS deliveryReservationId
         FROM operational_job_deliveries WHERE job_id = ?`,
    )
    .all(jobId) as Array<{ deliveryKind: string; deliveryReservationId: number }>;
  return {
    jobId: job.jobId,
    status: job.status,
    projectId: job.projectId,
    currentStepIndex: job.currentStepIndex,
    totalSteps: steps.length,
    jobPhase: job.jobPhase,
    cognitionState: job.cognitionState,
    ownerStatus: ownerCognitionStatus(job),
    cancelRequested: job.cancelRequested,
    stopReason: job.stopReason,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.lifetimeExpiresAtMs,
    children: steps.map((step: DurableStepRow) => ({
      stepIndex: step.stepIndex,
      kind: step.stepKind,
      childTaskId: step.childTaskId,
      status: step.stepRunStatus,
      effectRefKind: step.effectRefKind,
      effectRefId: step.effectRefId,
    })),
    deliveries,
  };
}

let runnerAbort: AbortController | null = null;
let runnerLoop: Promise<void> | null = null;

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function startDurableOperationalJobRunner(ctx: DurableRunnerContext): void {
  if (runnerAbort) return;
  runnerAbort = new AbortController();
  const { signal } = runnerAbort;
  const stoppingCtx: DurableRunnerContext = {
    ...ctx,
    shouldStop: () => signal.aborted || Boolean(ctx.shouldStop?.()),
  };
  recoverDurableOperationalJobs(stoppingCtx);
  runnerLoop = (async () => {
    while (!signal.aborted) {
      try {
        await tickDurableOperationalJobs(stoppingCtx);
      } catch {
        /* keep polling; reporting/effect failures are durable */
      }
      await abortableSleep(1000, signal);
    }
  })();
}

export async function stopDurableOperationalJobRunner(): Promise<void> {
  runnerAbort?.abort();
  runnerAbort = null;
  const running = runnerLoop;
  runnerLoop = null;
  if (running) await running;
}
