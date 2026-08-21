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
  | "project_investigation"
  | "project_experimentation"
  | "sandbox_workspace_file_roundtrip";

/**
 * Structured effect evidence for the sandbox_workspace_file_roundtrip profile.
 * Proves that actual filesystem invariants were verified (Receipt != Effect Witness).
 */
export type RoundtripEffectEvidence = {
  verified: boolean;
  workspaceId: string;
  relativePath: string;
  bytesWritten: number;
  contentHash: string;
  readMatches: boolean;
  deleted: boolean;
  verifiedAbsent: boolean;
  completedAtMs: number;
};

/**
 * Structured safe effect facts for verified M3 workspace operations.
 * Excludes raw file contents, base64 payloads, search text, directory entries,
 * canonicalRoot, and host filesystem paths.
 */
export type WorkspaceClaimEffect = {
  verified: true;
  projectId: string;
  workspaceId: string;
  operation: string;
  logicalRelativePath: string;
  sourceSnapshotId: string;
  bytesRead?: number;
  bytesWritten?: number;
  beforeSha256?: string;
  afterSha256?: string;
  completedAtMs: number;
};

/**
 * Validates the complete critical invariant of roundtrip effect evidence.
 * Must fail closed on any missing, false, empty, or non-finite property.
 */
export function isVerifiedRoundtripEffectEvidence(
  value: unknown,
): value is RoundtripEffectEvidence {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<RoundtripEffectEvidence>;
  return (
    e.verified === true &&
    e.readMatches === true &&
    e.deleted === true &&
    e.verifiedAbsent === true &&
    typeof e.workspaceId === "string" &&
    e.workspaceId.trim().length > 0 &&
    typeof e.relativePath === "string" &&
    e.relativePath.trim().length > 0 &&
    typeof e.contentHash === "string" &&
    e.contentHash.trim().length > 0 &&
    typeof e.bytesWritten === "number" &&
    Number.isFinite(e.bytesWritten) &&
    e.bytesWritten >= 0 &&
    typeof e.completedAtMs === "number" &&
    Number.isFinite(e.completedAtMs)
  );
}

export function isVerifiedWorkspaceClaimEffect(
  value: unknown,
): value is WorkspaceClaimEffect {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<WorkspaceClaimEffect>;
  return (
    e.verified === true &&
    typeof e.projectId === "string" &&
    e.projectId.trim().length > 0 &&
    typeof e.workspaceId === "string" &&
    e.workspaceId.trim().length > 0 &&
    typeof e.operation === "string" &&
    e.operation.startsWith("workspace.") &&
    typeof e.logicalRelativePath === "string" &&
    typeof e.sourceSnapshotId === "string" &&
    e.sourceSnapshotId.trim().length > 0 &&
    typeof e.completedAtMs === "number" &&
    Number.isFinite(e.completedAtMs)
  );
}

/** Structured operational claim states for Expression & Honesty enforcement. */
export type OperationalClaimState =
  | "none"
  | "proposed"
  | "admitted"
  | "running"
  | "succeeded"
  | "failed"
  | "outcome_unknown";

export type OperationalClaimLicense = {
  state: OperationalClaimState;
  taskId?: string | null;
  profile?: SandboxTaskProfile | string | null;
  effectEvidence?: RoundtripEffectEvidence | null;
  workspaceClaimEffect?: WorkspaceClaimEffect | null;
  receiptRef?: string | null;
  error?: string | null;
  refusalReason?: string | null;
  sourceMessageEntityUuid?: string | null;
  executionTruth?:
    | "no_effect_proven"
    | "effect_verified"
    | "effect_indeterminate"
    | null;
  lateEvidenceVerified?: boolean | null;
};

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
  effectEvidence?: RoundtripEffectEvidence | null;
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
 * the broker `sandbox.engineering.action` message; a fake implements it
 * in-process for unit tests. The broker remains final authority for every call.
 * The envelope/nowMs are baked into the port by the production adapter
 * (`broker-engineering-port.ts`).
 */
export interface EngineeringExecutionPort {
  executeAction(
    action: EngineeringAction,
    envelope: DelegatedApprovalEnvelope,
  ): Promise<EngineeringToolResult>;
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
