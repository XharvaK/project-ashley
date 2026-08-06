/**
 * Sandbox task state model (Sandbox Wave 4, Commit 10).
 *
 * A `SandboxTask` is the bounded, owner-originated unit of work admitted
 * into the sandbox orchestration loop: objective, role, allowed
 * capabilities, model-call and tool-execution budgets, a deadline, and an
 * optional source-root binding. Creation validates every field strictly and
 * fails closed on anything outside the delegated-safe policy surface.
 *
 * The task carries no secrets, no keys, no signatures, no raw paths and no
 * conversation content: it is the bounded input to context building.
 */

import {
  capabilitySpec,
  type SandboxCapabilityId,
} from "@composer-assistant/sandbox-policy";
import {
  BROKER_SANDBOX_ROLES,
  isBrokerSandboxRole,
  MAX_TOOL_EXECUTIONS_PER_SESSION,
  type BrokerSandboxRole,
} from "@composer-assistant/sandbox-broker";

export const MAX_TASK_OBJECTIVE_LENGTH = 4000;
export const MAX_TASK_ID_LENGTH = 128;
export const MAX_OWNER_ID_LENGTH = 128;
export const MAX_CONVERSATION_ID_LENGTH = 256;
export const MAX_SOURCE_ROOT_ID_LENGTH = 128;
export const MAX_TASK_CAPABILITIES = 16;
export const MAX_MODEL_CALLS_PER_TASK = 64;
export const MIN_MODEL_CALLS_PER_TASK = 1;
export const MIN_TOOL_EXECUTIONS_PER_TASK = 1;

export const SANDBOX_TASK_STATUSES = [
  "admitted",
  "running",
  "awaiting_owner",
  "completed",
  "aborted",
  "expired",
] as const;

export type SandboxTaskStatus = (typeof SANDBOX_TASK_STATUSES)[number];

export function isSandboxTaskStatus(value: unknown): value is SandboxTaskStatus {
  return (
    typeof value === "string" &&
    (SANDBOX_TASK_STATUSES as readonly string[]).includes(value)
  );
}

export type SandboxTask = {
  taskId: string;
  ownerId: string;
  originatingConversationId: string | null;
  objective: string;
  role: BrokerSandboxRole;
  allowedCapabilities: readonly SandboxCapabilityId[];
  maxModelCalls: number;
  maxToolExecutions: number;
  deadlineAtMs: number;
  sourceRootId: string | null;
  workspaceRequired: boolean;
  status: SandboxTaskStatus;
};

export type CreateSandboxTaskErrorCode =
  | "task_id_invalid"
  | "owner_id_invalid"
  | "conversation_id_invalid"
  | "objective_invalid"
  | "role_invalid"
  | "capabilities_invalid"
  | "capabilities_empty"
  | "capability_too_many"
  | "duplicate_capability"
  | "capability_unknown"
  | "capability_not_delegated_safe"
  | "max_model_calls_invalid"
  | "max_tool_executions_invalid"
  | "deadline_invalid"
  | "deadline_in_past"
  | "source_root_id_invalid";

export type CreateSandboxTaskResult =
  | { ok: true; task: SandboxTask }
  | { ok: false; error: CreateSandboxTaskErrorCode; reason: string };

function isBoundedString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

/**
 * Deterministic trusted mapping from a fixed recipe id to the recipe-bound
 * delegated-safe capability that authorizes it. Unknown namespaces yield
 * null and are refused: only policy-listed fixed recipes may ever run.
 */
export function capabilityForRecipeExecution(
  recipeId: string,
): SandboxCapabilityId | null {
  if (recipeId.startsWith("test:")) return "fixed_test_recipe";
  if (recipeId.startsWith("verify:")) return "fixed_lint_verification_recipe";
  if (
    recipeId.startsWith("git:") ||
    recipeId.startsWith("patch:") ||
    recipeId.startsWith("build:")
  ) {
    return "fixed_build_recipe";
  }
  return null;
}

/** Capability used for disposable candidate workspace creation. */
export const CANDIDATE_WORKSPACE_CREATE_CAPABILITY =
  "candidate_workspace_create" as const;

export type CreateSandboxTaskInput = {
  taskId: string;
  ownerId: string;
  originatingConversationId?: string;
  objective: string;
  role: string;
  allowedCapabilities: readonly string[];
  maxModelCalls: number;
  maxToolExecutions: number;
  deadlineAtMs: number;
  sourceRootId?: string;
  workspaceRequired?: boolean;
  nowMs: number;
};

export function createSandboxTask(
  input: CreateSandboxTaskInput,
): CreateSandboxTaskResult {
  if (!isBoundedString(input.taskId, 1, MAX_TASK_ID_LENGTH)) {
    return {
      ok: false,
      error: "task_id_invalid",
      reason: "task_id_out_of_bounds",
    };
  }
  if (!isBoundedString(input.ownerId, 1, MAX_OWNER_ID_LENGTH)) {
    return {
      ok: false,
      error: "owner_id_invalid",
      reason: "owner_id_out_of_bounds",
    };
  }
  if (
    input.originatingConversationId !== undefined &&
    input.originatingConversationId !== null &&
    !isBoundedString(
      input.originatingConversationId,
      1,
      MAX_CONVERSATION_ID_LENGTH,
    )
  ) {
    return {
      ok: false,
      error: "conversation_id_invalid",
      reason: "conversation_id_out_of_bounds",
    };
  }
  if (
    typeof input.objective !== "string" ||
    input.objective.length < 1 ||
    input.objective.length > MAX_TASK_OBJECTIVE_LENGTH
  ) {
    return {
      ok: false,
      error: "objective_invalid",
      reason: "objective_out_of_bounds",
    };
  }
  if (!isBrokerSandboxRole(input.role as BrokerSandboxRole)) {
    return {
      ok: false,
      error: "role_invalid",
      reason: `role_must_be_one_of_${BROKER_SANDBOX_ROLES.join(",")}`,
    };
  }
  if (!Array.isArray(input.allowedCapabilities)) {
    return {
      ok: false,
      error: "capabilities_invalid",
      reason: "allowed_capabilities_must_be_an_array",
    };
  }
  if (input.allowedCapabilities.length === 0) {
    return {
      ok: false,
      error: "capabilities_empty",
      reason: "at_least_one_capability_required",
    };
  }
  if (input.allowedCapabilities.length > MAX_TASK_CAPABILITIES) {
    return {
      ok: false,
      error: "capability_too_many",
      reason: `at_most_${MAX_TASK_CAPABILITIES}_capabilities`,
    };
  }
  const seen = new Set<string>();
  const capabilities: SandboxCapabilityId[] = [];
  for (const raw of input.allowedCapabilities) {
    if (typeof raw !== "string") {
      return {
        ok: false,
        error: "capabilities_invalid",
        reason: "capability_must_be_a_string",
      };
    }
    if (seen.has(raw)) {
      return {
        ok: false,
        error: "duplicate_capability",
        reason: `duplicate_capability_${raw}`,
      };
    }
    seen.add(raw);
    const spec = capabilitySpec(raw as SandboxCapabilityId);
    if (spec === undefined) {
      return {
        ok: false,
        error: "capability_unknown",
        reason: `unknown_capability_${raw}`,
      };
    }
    if (spec.class !== "delegated_safe") {
      return {
        ok: false,
        error: "capability_not_delegated_safe",
        reason: `capability_not_delegated_safe_${raw}`,
      };
    }
    capabilities.push(raw as SandboxCapabilityId);
  }
  if (
    !Number.isInteger(input.maxModelCalls) ||
    input.maxModelCalls < MIN_MODEL_CALLS_PER_TASK ||
    input.maxModelCalls > MAX_MODEL_CALLS_PER_TASK
  ) {
    return {
      ok: false,
      error: "max_model_calls_invalid",
      reason: `max_model_calls_out_of_bounds_${input.maxModelCalls}`,
    };
  }
  if (
    !Number.isInteger(input.maxToolExecutions) ||
    input.maxToolExecutions < MIN_TOOL_EXECUTIONS_PER_TASK ||
    input.maxToolExecutions > MAX_TOOL_EXECUTIONS_PER_SESSION
  ) {
    return {
      ok: false,
      error: "max_tool_executions_invalid",
      reason: `max_tool_executions_out_of_bounds_${input.maxToolExecutions}`,
    };
  }
  if (!Number.isFinite(input.deadlineAtMs)) {
    return {
      ok: false,
      error: "deadline_invalid",
      reason: "deadline_not_finite",
    };
  }
  if (!Number.isFinite(input.nowMs)) {
    return {
      ok: false,
      error: "deadline_invalid",
      reason: "clock_not_finite",
    };
  }
  if (input.deadlineAtMs <= input.nowMs) {
    return {
      ok: false,
      error: "deadline_in_past",
      reason: "deadline_must_be_in_the_future",
    };
  }
  if (
    input.sourceRootId !== undefined &&
    input.sourceRootId !== null &&
    !isBoundedString(input.sourceRootId, 1, MAX_SOURCE_ROOT_ID_LENGTH)
  ) {
    return {
      ok: false,
      error: "source_root_id_invalid",
      reason: "source_root_id_out_of_bounds",
    };
  }
  return {
    ok: true,
    task: {
      taskId: input.taskId,
      ownerId: input.ownerId,
      originatingConversationId:
        input.originatingConversationId === undefined
          ? null
          : input.originatingConversationId,
      objective: input.objective,
      role: input.role as BrokerSandboxRole,
      allowedCapabilities: capabilities,
      maxModelCalls: input.maxModelCalls,
      maxToolExecutions: input.maxToolExecutions,
      deadlineAtMs: input.deadlineAtMs,
      sourceRootId: input.sourceRootId ?? null,
      workspaceRequired: input.workspaceRequired ?? false,
      status: "admitted",
    },
  };
}
