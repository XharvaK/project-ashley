/**
 * Engineering workstation agent-side types (Autonomous Engineering Workstation
 * wave).
 *
 * Anchored in agent-service/core/sandbox, reusing Ashley's model-routing
 * stack, task model, lifecycle, audit, recovery and broker client. The broker
 * remains the final authority; the agent owns cognition and the structured
 * action vocabulary.
 */

import type {
  EngineeringAction,
  EngineeringActionType,
} from "@composer-assistant/sandbox-policy";
import type { DelegatedApprovalEnvelope } from "@composer-assistant/sandbox-broker";

/** Trusted project/candidate roots bound from the project registry. */
export type EngineeringRoots = {
  projectRoots: string[];
  candidateRepoRoot: string;
  workspaceRoots: string[];
};

export type { EngineeringAction, EngineeringActionType };

/** Durable engineering task identity and lifecycle state. */
export type SandboxTaskStatus =
  | "admitted"
  | "running"
  | "awaiting_owner"
  | "completed"
  | "failed"
  | "aborted"
  | "expired"
  | "outcome_unknown";

export type SandboxTaskProfile =
  | "build_regression"
  | "test_regression"
  | "proactive_bug_investigation"
  | "code_quality"
  | "self_improvement"
  | "health_maintenance"
  | "local_service_recovery"
  | "project_investigation";

export type SandboxTask = {
  taskId: string;
  owner: string;
  projectId: string | null;
  sourceBaseCommit: string | null;
  admissionCause: "user_request" | "proactive" | "health_anomaly" | "open_item" | "scheduled";
  groundingRefs: string[];
  profile: SandboxTaskProfile;
  status: SandboxTaskStatus;
  workspaceId: string | null;
  modelCallsUsed: number;
  toolCallsUsed: number;
  startedAtMs: number | null;
  deadlineMs: number | null;
  completedAtMs: number | null;
  error: string | null;
  refusal: string | null;
  candidatePatchRef: string | null;
  candidateCommitRef: string | null;
  artifactRefs: string[];
};

export type EngineeringBudgets = {
  maxModelCalls: number;
  maxToolExecutions: number;
  maxWallMs: number;
};

export const DEFAULT_ENGINEERING_BUDGETS: EngineeringBudgets = {
  maxModelCalls: 24,
  maxToolExecutions: 48,
  maxWallMs: 45 * 60 * 1000,
};

/** Result of a single structured-action execution via the broker port. */
export type EngineeringToolResult =
  | { ok: true; data: unknown; artifactRef: string | null }
  | { ok: false; errorCode: string; reason: string };

/**
 * The execution port the operator drives. The production implementation wraps
 * the broker `sandbox.engineering.action` / `sandbox.agent.restart` messages;
 * a fake implements it in-process for unit tests. The broker remains final
 * authority for every call. The envelope/nowMs are baked into the port by the
 * production adapter (`broker-engineering-port.ts`).
 */
export interface EngineeringExecutionPort {
  executeAction(
    action: EngineeringAction,
    envelope: DelegatedApprovalEnvelope,
  ): Promise<EngineeringToolResult>;
  agentRestart(ctx: {
    unit: string;
    incidentId: string;
    health: { healthy: boolean; deterministic: boolean };
    restartState: {
      incidentId: string;
      lastAttemptAtMs: number | null;
      attemptsForIncident: number;
      cooldownMs: number;
    };
  }): Promise<EngineeringToolResult>;
}

/** Minimal thinking-model contract the operator uses for engineering reasoning. */
export interface ThinkingModel {
  readonly route: "thinking";
  proposeNextAction(ctx: EngineeringOperatorContext): Promise<unknown>;
}

export type EngineeringOperatorContext = {
  taskId: string;
  objective: string;
  projectId: string | null;
  workspaceId: string | null;
  availableDiagnostics: string[];
  lastResults: { ok: boolean; artifactRef: string | null; errorCode: string | null; reason: string | null }[];
  modelCallsUsed: number;
  toolCallsUsed: number;
  nowMs: number;
};
