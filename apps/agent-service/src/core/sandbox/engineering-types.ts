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
  | "candidate_verification"
  | "candidate_authorship"
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
    e.operation !== "workspace.verify" &&
    typeof e.logicalRelativePath === "string" &&
    typeof e.sourceSnapshotId === "string" &&
    e.sourceSnapshotId.trim().length > 0 &&
    typeof e.completedAtMs === "number" &&
    Number.isFinite(e.completedAtMs)
  );
}

/**
 * Licensed mechanical authorship claim. Binds a sealed candidate change-set
 * identity. Never apply, merge, deployment, or self-change.
 */
export type AuthorshipClaimEffect = {
  verified: true;
  projectId: string;
  workspaceId: string;
  changesetId: string;
  changesetVersion: 1;
  snapshotId: string;
  candidateTreeHash: string;
  baseTreeHash: string;
  pathCount: number;
  patchSha256: string;
  status: "proposed";
  reviewStatus: "submitted";
  candidateUnchanged: true;
  liveUnwritten: true;
  protocolState: "admitted";
  completedAtMs: number;
};

export function isVerifiedAuthorshipClaimEffect(
  value: unknown,
): value is AuthorshipClaimEffect {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<AuthorshipClaimEffect>;
  return (
    e.verified === true &&
    e.changesetVersion === 1 &&
    e.status === "proposed" &&
    e.reviewStatus === "submitted" &&
    e.candidateUnchanged === true &&
    e.liveUnwritten === true &&
    e.protocolState === "admitted" &&
    typeof e.projectId === "string" &&
    e.projectId.trim().length > 0 &&
    typeof e.workspaceId === "string" &&
    e.workspaceId.trim().length > 0 &&
    typeof e.changesetId === "string" &&
    e.changesetId.startsWith("cs_") &&
    typeof e.snapshotId === "string" &&
    e.snapshotId.trim().length > 0 &&
    typeof e.candidateTreeHash === "string" &&
    e.candidateTreeHash.length === 64 &&
    typeof e.baseTreeHash === "string" &&
    e.baseTreeHash.length === 64 &&
    typeof e.patchSha256 === "string" &&
    e.patchSha256.length === 64 &&
    typeof e.pathCount === "number" &&
    Number.isFinite(e.pathCount) &&
    e.pathCount >= 1 &&
    typeof e.completedAtMs === "number" &&
    Number.isFinite(e.completedAtMs)
  );
}

/**
 * Licensed mechanical verification claim. Binds a named snapshot to a named
 * recipe outcome. Never a quality, approval, merge, or deployment judgment.
 */
export type VerificationClaimEffect = {
  verified: true;
  projectId: string;
  workspaceId: string;
  snapshotId: string;
  candidateTreeHash: string;
  recipeId: string;
  recipeVersion: string;
  recipeDefinitionHash: string;
  protocolState: "admitted";
  verificationOutcome: "verified_success" | "verified_failure";
  completedAtMs: number;
};

export function isVerifiedVerificationClaimEffect(
  value: unknown,
): value is VerificationClaimEffect {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<VerificationClaimEffect>;
  return (
    e.verified === true &&
    e.protocolState === "admitted" &&
    (e.verificationOutcome === "verified_success" ||
      e.verificationOutcome === "verified_failure") &&
    typeof e.projectId === "string" &&
    e.projectId.trim().length > 0 &&
    typeof e.workspaceId === "string" &&
    e.workspaceId.trim().length > 0 &&
    typeof e.snapshotId === "string" &&
    e.snapshotId.trim().length > 0 &&
    typeof e.candidateTreeHash === "string" &&
    e.candidateTreeHash.length === 64 &&
    typeof e.recipeId === "string" &&
    e.recipeId.trim().length > 0 &&
    typeof e.recipeVersion === "string" &&
    e.recipeVersion.trim().length > 0 &&
    typeof e.recipeDefinitionHash === "string" &&
    e.recipeDefinitionHash.length === 64 &&
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
  verificationClaimEffect?: VerificationClaimEffect | null;
  authorshipClaimEffect?: AuthorshipClaimEffect | null;
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
  cancellationRequested?: boolean | null;
  cancellationAcknowledged?: boolean | null;
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
