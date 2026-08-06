/**
 * Sandbox orchestration audit events (Sandbox Wave 4, Commit 10).
 *
 * Bounded, typed, redacted audit records for the orchestration loop. Every
 * free-form string is scrubbed of credential shapes before it leaves the
 * module. Records are delivered through an injected sink — no database, no
 * route, no persistence dependency.
 */

import { redactSecretShapes } from "../privacy/redact-logs.js";
import type { SandboxStopReason } from "./stop-reasons.js";
import type { SandboxOperatorActionType } from "./operator-actions.js";

export const SANDBOX_ORCHESTRATION_AUDIT_KINDS = [
  "lifecycle_denied",
  "bootstrap_started",
  "bootstrap_failed",
  "session_bound",
  "workspace_bound",
  "model_call_reserved",
  "model_action_received",
  "model_action_invalid",
  "broker_action_requested",
  "broker_receipt_received",
  "owner_approval_requested",
  "approval_proposal_created",
  "approval_proposal_approved",
  "approval_proposal_rejected",
  "approval_proposal_withdrawn",
  "approval_proposal_stale",
  "approval_proposal_expired",
  "approval_session_resumed",
  "task_completed",
  "task_aborted",
  "task_expired",
  "budget_exhausted",
  "loop_stopped",
] as const;

export type SandboxOrchestrationAuditKind =
  (typeof SANDBOX_ORCHESTRATION_AUDIT_KINDS)[number];

type BaseAudit = {
  kind: SandboxOrchestrationAuditKind;
  taskId: string;
  ownerId: string;
  createdAtIso: string;
};

export type SandboxOrchestrationAudit =
  | (BaseAudit & { kind: "lifecycle_denied"; lifecycle: string; reason: string })
  | (BaseAudit & {
      kind: "bootstrap_started";
      policyId: string;
      policyVersion: number;
      policyHash: string;
    })
  | (BaseAudit & {
      kind: "bootstrap_failed";
      errorCode: string;
      reason: string;
    })
  | (BaseAudit & {
      kind: "session_bound";
      sessionUuid: string;
      role: string;
      state: string;
    })
  | (BaseAudit & {
      kind: "workspace_bound";
      sessionUuid: string;
      workspaceId: string;
    })
  | (BaseAudit & {
      kind: "model_call_reserved";
      turn: number;
      remainingAfter: number;
    })
  | (BaseAudit & {
      kind: "model_action_received";
      turn: number;
      actionType: SandboxOperatorActionType | string;
    })
  | (BaseAudit & {
      kind: "model_action_invalid";
      turn: number;
      reason: string;
    })
  | (BaseAudit & {
      kind: "broker_action_requested";
      turn: number;
      actionType: string;
      capabilityId: string;
      recipeId: string | null;
    })
  | (BaseAudit & {
      kind: "broker_receipt_received";
      turn: number;
      recipeId: string;
      outcome: string;
      stage: string | null;
      errorCode: string | null;
      exitCode: number | null;
      truncated: boolean;
    })
  | (BaseAudit & {
      kind: "owner_approval_requested";
      capabilityId: string;
      reasonPreview: string;
    })
  | (Omit<BaseAudit, "taskId"> & {
      kind:
        | "approval_proposal_created"
        | "approval_proposal_approved"
        | "approval_proposal_rejected"
        | "approval_proposal_withdrawn"
        | "approval_proposal_stale"
        | "approval_proposal_expired";
      taskId: string | null;
      proposalId: string;
      capabilityId: string;
      sessionUuid: string | null;
      policyHash: string;
      reason: string | null;
    })
  | (Omit<BaseAudit, "taskId"> & {
      kind: "approval_session_resumed";
      taskId: string | null;
      proposalId: string;
      sessionUuid: string;
      revision: number;
      errorCode: string | null;
    })
  | (BaseAudit & {
      kind: "task_completed";
      modelCallsUsed: number;
      toolExecutionsUsed: number;
    })
  | (BaseAudit & {
      kind: "task_aborted";
      reason: string;
    })
  | (BaseAudit & {
      kind: "task_expired";
      deadlineAtMs: number;
    })
  | (BaseAudit & {
      kind: "budget_exhausted";
      budget: "model" | "tool";
      used: number;
      limit: number;
    })
  | (BaseAudit & {
      kind: "loop_stopped";
      stopReason: SandboxStopReason;
    });

export type SandboxAuditSink = (record: SandboxOrchestrationAudit) => void;

const REASON_PREVIEW_MAX = 200;

type AuditBase = {
  taskId: string;
  ownerId: string;
  nowMs: number;
};

function base(input: AuditBase): Omit<BaseAudit, "kind"> {
  return {
    taskId: input.taskId,
    ownerId: input.ownerId,
    createdAtIso: new Date(
      Number.isFinite(input.nowMs) ? input.nowMs : 0,
    ).toISOString(),
  };
}

function redact(text: string, max = 1000): string {
  const scrubbed = redactSecretShapes(text);
  return scrubbed.length > max ? scrubbed.slice(0, max) : scrubbed;
}

export type BuildOrchestrationAuditInput = AuditBase & {
  kind: SandboxOrchestrationAuditKind;
  lifecycle?: string;
  reason?: string;
  errorCode?: string;
  policyId?: string;
  policyVersion?: number;
  policyHash?: string;
  sessionUuid?: string;
  role?: string;
  state?: string;
  workspaceId?: string;
  turn?: number;
  remainingAfter?: number;
  actionType?: string;
  capabilityId?: string;
  recipeId?: string | null;
  outcome?: string;
  stage?: string | null;
  exitCode?: number | null;
  truncated?: boolean;
  reasonPreview?: string;
  proposalId?: string;
  revision?: number;
  modelCallsUsed?: number;
  toolExecutionsUsed?: number;
  deadlineAtMs?: number;
  budget?: "model" | "tool";
  used?: number;
  limit?: number;
  stopReason?: SandboxStopReason;
};

/**
 * Builds a bounded audit record. Free-form fields are redacted and
 * preview-capped; unknown kinds fail closed (never emitted).
 */
export function buildSandboxOrchestrationAudit(
  input: BuildOrchestrationAuditInput,
): SandboxOrchestrationAudit | null {
  const b = base(input);
  switch (input.kind) {
    case "lifecycle_denied":
      return {
        ...b,
        kind: "lifecycle_denied",
        lifecycle: String(input.lifecycle ?? "unknown"),
        reason: redact(String(input.reason ?? "")),
      };
    case "bootstrap_started":
      return {
        ...b,
        kind: "bootstrap_started",
        policyId: String(input.policyId ?? ""),
        policyVersion: Number(input.policyVersion ?? 0),
        policyHash: String(input.policyHash ?? ""),
      };
    case "bootstrap_failed":
      return {
        ...b,
        kind: "bootstrap_failed",
        errorCode: String(input.errorCode ?? "unknown"),
        reason: redact(String(input.reason ?? "")),
      };
    case "session_bound":
      return {
        ...b,
        kind: "session_bound",
        sessionUuid: String(input.sessionUuid ?? ""),
        role: String(input.role ?? ""),
        state: String(input.state ?? ""),
      };
    case "workspace_bound":
      return {
        ...b,
        kind: "workspace_bound",
        sessionUuid: String(input.sessionUuid ?? ""),
        workspaceId: String(input.workspaceId ?? ""),
      };
    case "model_call_reserved":
      return {
        ...b,
        kind: "model_call_reserved",
        turn: Number(input.turn ?? 0),
        remainingAfter: Number(input.remainingAfter ?? 0),
      };
    case "model_action_received":
      return {
        ...b,
        kind: "model_action_received",
        turn: Number(input.turn ?? 0),
        actionType: String(input.actionType ?? "unknown"),
      };
    case "model_action_invalid":
      return {
        ...b,
        kind: "model_action_invalid",
        turn: Number(input.turn ?? 0),
        reason: redact(String(input.reason ?? ""), 200),
      };
    case "broker_action_requested":
      return {
        ...b,
        kind: "broker_action_requested",
        turn: Number(input.turn ?? 0),
        actionType: String(input.actionType ?? ""),
        capabilityId: String(input.capabilityId ?? ""),
        recipeId: input.recipeId ?? null,
      };
    case "broker_receipt_received":
      return {
        ...b,
        kind: "broker_receipt_received",
        turn: Number(input.turn ?? 0),
        recipeId: String(input.recipeId ?? ""),
        outcome: String(input.outcome ?? ""),
        stage: input.stage ?? null,
        errorCode: input.errorCode ?? null,
        exitCode: input.exitCode ?? null,
        truncated: input.truncated === true,
      };
    case "owner_approval_requested": {
      const preview = redact(String(input.reasonPreview ?? ""), REASON_PREVIEW_MAX);
      return {
        ...b,
        kind: "owner_approval_requested",
        capabilityId: String(input.capabilityId ?? ""),
        reasonPreview: preview,
      };
    }
    case "approval_proposal_created":
    case "approval_proposal_approved":
    case "approval_proposal_rejected":
    case "approval_proposal_withdrawn":
    case "approval_proposal_stale":
    case "approval_proposal_expired":
      return {
        ...b,
        kind: input.kind,
        taskId: input.taskId ?? null,
        proposalId: String(input.proposalId ?? ""),
        capabilityId: String(input.capabilityId ?? ""),
        sessionUuid: input.sessionUuid ?? null,
        policyHash: String(input.policyHash ?? ""),
        reason: input.reason == null ? null : redact(String(input.reason), 300),
      };
    case "approval_session_resumed":
      return {
        ...b,
        kind: "approval_session_resumed",
        taskId: input.taskId ?? null,
        proposalId: String(input.proposalId ?? ""),
        sessionUuid: String(input.sessionUuid ?? ""),
        revision: Number(input.revision ?? 0),
        errorCode: input.errorCode ?? null,
      };
    case "task_completed":
      return {
        ...b,
        kind: "task_completed",
        modelCallsUsed: Number(input.modelCallsUsed ?? 0),
        toolExecutionsUsed: Number(input.toolExecutionsUsed ?? 0),
      };
    case "task_aborted":
      return {
        ...b,
        kind: "task_aborted",
        reason: redact(String(input.reason ?? "")),
      };
    case "task_expired":
      return {
        ...b,
        kind: "task_expired",
        deadlineAtMs: Number(input.deadlineAtMs ?? 0),
      };
    case "budget_exhausted":
      return {
        ...b,
        kind: "budget_exhausted",
        budget: input.budget ?? "model",
        used: Number(input.used ?? 0),
        limit: Number(input.limit ?? 0),
      };
    case "loop_stopped":
      return {
        ...b,
        kind: "loop_stopped",
        stopReason: input.stopReason ?? "internal_error",
      };
    default:
      return null;
  }
}
