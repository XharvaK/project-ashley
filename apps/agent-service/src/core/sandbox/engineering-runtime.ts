/**
 * Production runtime wiring for the Autonomous Engineering Workstation.
 *
 * This is the single owner-controlled entry point that gives every
 * `core/sandbox/*` module a real production call site:
 *  - `engineering-supervisor.ts` -> `coordinator.ts` -> `engineering-operator.ts`
 *    -> `broker-engineering-port.ts` -> `engineering-envelope.ts`
 *  - `self-improvement.ts` (weekly review) via a durable trigger.
 *
 * Fail-closed: nothing starts unless `env.sandboxEngineeringLifecycleEnabled`
 * is explicitly true (owner action). The supervisor only dispatches post-cutover
 * grounded admissions; the weekly review only fires when due.
 */

import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import {
  createConfiguredUnixSandboxClient,
  type UnixSandboxBrokerClient,
} from "./unix-broker-client.js";
import { createBrokerEngineeringPort } from "./broker-engineering-port.js";
import {
  runEngineeringSupervisorTick,
  resetEngineeringSupervisor,
} from "./engineering-supervisor.js";
import { verifyEngineeringReadiness } from "./engineering-envelope.js";
import {
  expectedActivationOutput,
  initActivationState,
  setMarkers,
} from "./activation.js";
import { createEngineeringThinkingModel } from "./engineering-model-adapter.js";
import {
  ensureEngineeringTables,
  setEngineeringActivationEpochMs,
} from "./engineering-runs.js";
import { AgentProjectRegistry } from "./project-registry.js";
import {
  buildWeeklyReview,
  isReviewDue,
  type SelfImprovementCloneState,
} from "./self-improvement.js";
import { loadCloneState, saveCloneState } from "./self-improvement-state.js";
import type { EngineeringRoots } from "./engineering-types.js";

export type EngineeringRuntimeWiring = {
  db: DatabaseSync;
  ownerId: string;
  nowMs?: () => number;
  brokerClient?: UnixSandboxBrokerClient | null;
  onCompleted?: (info: {
    taskId: string;
    summary: string | null;
    admissionId: string | null;
  }) => void;
  onWeeklyReviewDue?: (summary: string) => void;
  onRefused?: (reason: string) => void;
};

let supervisorTimer: ReturnType<typeof setInterval> | null = null;
let weeklyTimer: ReturnType<typeof setInterval> | null = null;

/** Resolve trusted project/candidate roots from the host allowlist registry. */
function buildResolveRoots(): (projectId: string | null) => EngineeringRoots {
  let registry: AgentProjectRegistry | null = null;
  try {
    registry = AgentProjectRegistry.loadFromFile(env.sandboxProjectRegistryPath);
  } catch {
    registry = null;
  }
  return (projectId) => {
    const empty: EngineeringRoots = {
      projectRoots: [],
      candidateRepoRoot: "",
      workspaceRoots: [],
    };
    if (!projectId || !registry) return empty;
    const entry = registry.get(projectId);
    if (registry.isEngineeringAllowed(projectId) && entry?.enabled) {
      return {
        projectRoots: [entry.canonicalRoot],
        candidateRepoRoot: entry.canonicalRoot,
        workspaceRoots: [entry.canonicalRoot],
      };
    }
    return empty;
  };
}

export function startEngineeringAutonomyLoops(wiring: EngineeringRuntimeWiring): void {
  // Fail-closed: the owner must explicitly enable the engineering lifecycle.
  if (!env.sandboxEngineeringLifecycleEnabled) return;
  const nowMs = wiring.nowMs ?? (() => Date.now());
  // Fail-closed readiness: if the engineering lifecycle is requested but the
  // required owner-signed policy / delegated signing material is missing or
  // carries the wrong identity, refuse to start the loops (no autonomous
  // execution authority is ever granted).
  const readiness = verifyEngineeringReadiness({ ownerId: wiring.ownerId, nowMs: nowMs() });
  if (!readiness.ok) {
    console.error(
      `[engineering] readiness failed (${readiness.reason}); supervisor disabled (fail-closed)`,
    );
    return;
  }
  // Record the activation markers this process would assert once the owner
  // completes the host-side activation sequence (qualification, canary, epoch).
  const activationState = initActivationState(nowMs());
  setMarkers(activationState, {
    brokerExecutionIsolation: "ready",
    engineeringWorker: "ready",
    sandboxAutonomy: "ENABLED",
  });
  console.log(
    `[engineering] activation markers: ${JSON.stringify(expectedActivationOutput(activationState))}`,
  );
  stopEngineeringAutonomyLoops();

  const db = wiring.db;
  const brokerClient = wiring.brokerClient ?? createConfiguredUnixSandboxClient();
  if (brokerClient === null) {
    // Fail closed: no broker client means no execution authority.
    console.error(
      "[engineering] no broker client available; supervisor disabled (fail-closed)",
    );
  }
  const resolveRoots = buildResolveRoots();
  ensureEngineeringTables(db);

  if (brokerClient !== null) {
    supervisorTimer = setInterval(() => {
      try {
        void runEngineeringSupervisorTick({
          db,
          ownerId: wiring.ownerId,
          nowMs,
          modelFactory: () => createEngineeringThinkingModel(),
          portFactory: () => createBrokerEngineeringPort({ client: brokerClient, nowMs }),
          resolveRoots,
          onCompleted: (result, admissionId) =>
            wiring.onCompleted?.({
              taskId: result.taskId,
              summary: result.summary,
              admissionId,
            }),
          onRefused: (reason) => wiring.onRefused?.(reason),
        });
      } catch (err) {
        console.error("[engineering-supervisor] tick failed", err);
      }
    }, Math.max(1, env.sandboxEngineeringSupervisorMinutes) * 60_000);
  }

  // Weekly self-improvement trigger — real production call site.
  weeklyTimer = setInterval(() => {
    try {
      const state = loadCloneState(db);
      if (!state) return;
      if (!isReviewDue(state, nowMs())) return;
      const review = buildWeeklyReview(state, nowMs());
      if (review) {
        wiring.onWeeklyReviewDue?.(`${review.reportRef}: ${review.candidate.title}`);
        saveCloneState(db, { ...state, lastReviewAtMs: nowMs() });
      }
    } catch (err) {
      console.error("[engineering-self-improvement] weekly review failed", err);
    }
  }, 60 * 60 * 1000);
}

export function stopEngineeringAutonomyLoops(): void {
  if (supervisorTimer !== null) {
    clearInterval(supervisorTimer);
    supervisorTimer = null;
  }
  if (weeklyTimer !== null) {
    clearInterval(weeklyTimer);
    weeklyTimer = null;
  }
  resetEngineeringSupervisor();
}

/**
 * Owner-action helper: record the activation epoch (cutover) so the supervisor
 * may dispatch post-cutover grounded admissions. Pre-activation historical
 * admissions are never executed.
 */
export function activateEngineeringAutonomy(
  db: DatabaseSync,
  epochMs: number = Date.now(),
): void {
  ensureEngineeringTables(db);
  setEngineeringActivationEpochMs(db, epochMs);
}
