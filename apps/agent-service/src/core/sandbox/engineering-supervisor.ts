/**
 * Engineering supervisor (Autonomous Engineering Workstation wave, production
 * wiring).
 *
 * Consumes grounded, post-cutover engineering admissions from the durable
 * `engineering_admissions` ledger and runs them through the coordinator. This is
 * the single production call site that drives `coordinator.ts` ->
 * `engineering-operator.ts` -> `broker-engineering-port.ts` ->
 * `engineering-envelope.ts`.
 *
 * Invariants (fail-closed):
 *  - runs only when the activation epoch is set (owner action);
 *  - ignores every pre-activation historical admission;
 *  - requires a grounded admission (recorded via `evaluateProactiveAdmission`);
 *  - concurrency is exactly 1;
 *  - recovers durable running state after restart and never double-dispatches
 *    after an ambiguous outcome (a stale 'running' task becomes outcome_unknown);
 *  - honors cancellation signals (drained before each run);
 *  - honors wall/deadline + model/tool budgets via the coordinator;
 *  - feeds completed material work back through `onCompleted`;
 *  - a model merely "thinking about coding" is never sufficient to execute.
 */

import type { DatabaseSync } from "node:sqlite";
import {
  SandboxEngineeringCoordinator,
  type CoordinatorResult,
} from "./coordinator.js";
import type { OperatorEnvelopeProvider } from "./engineering-operator.js";
import {
  createEngineeringEnvelopeProvider,
  loadEngineeringTrustAnchors,
  REQUIRED_ENGINEERING_POLICY_IDENTITY,
} from "./engineering-envelope.js";
import {
  type EngineeringExecutionPort,
  type EngineeringRoots,
  type SandboxTaskProfile,
  type ThinkingModel,
  DEFAULT_ENGINEERING_BUDGETS,
} from "./engineering-types.js";
import {
  ENGINEERING_MAX_CONCURRENCY,
  claimNextPendingAdmission,
  countActiveCoordinatorRuns,
  ensureEngineeringTables,
  getEngineeringActivationEpochMs,
  loadCoordinatorTasks,
  markAdmissionDispatched,
  persistCoordinatorTasks,
  takeCancelRequest,
  type PendingEngineeringAdmission,
} from "./engineering-runs.js";

export type EngineeringSupervisorDeps = {
  db: DatabaseSync;
  ownerId: string;
  nowMs: () => number;
  /** Builds the (production) thinking model that drives engineering reasoning. */
  modelFactory: () => ThinkingModel;
  /** Builds the broker-backed execution port. */
  portFactory: () => EngineeringExecutionPort;
  /** Resolves trusted project/candidate roots for a project (or empty). */
  resolveRoots: (projectId: string | null) => EngineeringRoots;
  /** Feedback into Ashley's communication/proactive path on material completion. */
  onCompleted: (result: CoordinatorResult, admissionId: string | null) => void;
  /** Optional refusal/diagnostic hook. */
  onRefused?: (reason: string) => void;
};

export type EngineeringTickResult = {
  ran: boolean;
  reason: string;
  taskId?: string;
};

// Long-lived coordinator (reused across ticks; recovered once per process).
let coordinatorSingleton: SandboxEngineeringCoordinator | null = null;
let coordinatorDb: DatabaseSync | null = null;

function getCoordinator(deps: EngineeringSupervisorDeps): SandboxEngineeringCoordinator {
  if (coordinatorSingleton && coordinatorDb === deps.db) return coordinatorSingleton;
  const model = deps.modelFactory();
  const port = deps.portFactory();
  const coordinator = new SandboxEngineeringCoordinator(model, port, {
    owner: deps.ownerId,
    budgets: { ...DEFAULT_ENGINEERING_BUDGETS },
    availableDiagnostics: [],
    nowMs: deps.nowMs,
    persist: (tasks) => persistCoordinatorTasks(deps.db, tasks),
  });
  // Recover durable state: running -> outcome_unknown, admitted -> expired.
  coordinator.recover(loadCoordinatorTasks(deps.db));
  coordinatorSingleton = coordinator;
  coordinatorDb = deps.db;
  return coordinator;
}

/** Reset the in-process coordinator (used by tests and shutdown). */
export function resetEngineeringSupervisor(): void {
  coordinatorSingleton = null;
  coordinatorDb = null;
}

function buildEnvelopes(
  deps: EngineeringSupervisorDeps,
  admission: PendingEngineeringAdmission,
): OperatorEnvelopeProvider {
  const anchors = loadEngineeringTrustAnchors({
    ownerId: deps.ownerId,
    requirePolicyIdentity: REQUIRED_ENGINEERING_POLICY_IDENTITY,
    nowMs: deps.nowMs(),
  });
  const roots = deps.resolveRoots(admission.projectId);
  return createEngineeringEnvelopeProvider({
    ownerId: deps.ownerId,
    policy: anchors.policy,
    policyHash: anchors.policyHash,
    delegatedKey: anchors.delegatedKey,
    roots,
  });
}

export async function runEngineeringSupervisorTick(
  deps: EngineeringSupervisorDeps,
): Promise<EngineeringTickResult> {
  ensureEngineeringTables(deps.db);
  const epoch = getEngineeringActivationEpochMs(deps.db);
  if (epoch == null) return { ran: false, reason: "no_activation_epoch" };

  const coordinator = getCoordinator(deps);

  // An active task: only handle cancellation; never start a second one.
  const active = coordinator
    .list()
    .find((t) => t.status === "running" || t.status === "admitted");
  if (active) {
    if (takeCancelRequest(deps.db, active.taskId)) {
      coordinator.cancel(active.taskId);
    }
    return { ran: false, reason: "active_task" };
  }

  if (countActiveCoordinatorRuns(deps.db) >= ENGINEERING_MAX_CONCURRENCY) {
    return { ran: false, reason: "concurrency_limit" };
  }

  const admission = claimNextPendingAdmission(deps.db, epoch);
  if (!admission) return { ran: false, reason: "no_pending_admission" };

  let envelopes: OperatorEnvelopeProvider;
  try {
    envelopes = buildEnvelopes(deps, admission);
  } catch (err) {
    markAdmissionDispatched(deps.db, admission.id);
    const reason = `policy_load_failed:${err instanceof Error ? err.message : String(err)}`;
    deps.onRefused?.(reason);
    return { ran: false, reason };
  }

  const task = coordinator.admit({
    objective: admission.objective,
    projectId: admission.projectId,
    admissionCause:
      admission.sourceKind === "health_anomaly" ? "health_anomaly" : "proactive",
    profile: admission.profile as SandboxTaskProfile,
    groundingRefs: admission.groundingRefs,
  });
  markAdmissionDispatched(deps.db, admission.id);

  // Owner cancel arrived between claim and dispatch => abort, no side effects.
  if (takeCancelRequest(deps.db, task.taskId)) {
    coordinator.cancel(task.taskId);
    return { ran: false, reason: "cancelled_before_run" };
  }

  const result = await coordinator.run(task.taskId, envelopes);
  if (result.status === "completed") {
    deps.onCompleted(result, admission.id);
  } else {
    deps.onRefused?.(`task_${result.status}:${result.summary ?? ""}`);
  }
  return { ran: true, reason: result.status, taskId: task.taskId };
}
