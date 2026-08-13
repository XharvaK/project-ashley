/**
 * Model-backed engineering operator adapter (Autonomous Engineering Workstation
 * wave).
 *
 * Drives a thinking-model through the closed engineering action vocabulary. The
 * model may ONLY emit bounded structured actions (see sandbox-policy
 * `EngineeringAction`); it never sees a raw shell, raw host paths, or signing
 * material. Every action is re-validated and authorized by the broker before
 * execution. The operator enforces budgets and fail-closed concurrency and
 * converts the model's `complete`/`request_owner_approval`/`abort` decisions
 * into task outcomes.
 */

import {
  engineeringActionCapability,
  isCanonicalRelativePath,
  validateEngineeringAction,
  type EngineeringAction,
  type EngineeringActionType,
  type SandboxCapabilityId,
} from "@composer-assistant/sandbox-policy";
import type { DelegatedApprovalEnvelope } from "@composer-assistant/sandbox-broker";
import {
  type EngineeringExecutionPort,
  type EngineeringToolResult,
  type ThinkingModel,
} from "./engineering-types.js";

const ENGINEERING_MAX_STEPS = 64;
const ENGINEERING_META_ACTIONS = new Set<EngineeringActionType>([
  "request_owner_approval",
  "complete",
  "abort",
]);

export type OperatorEnvelopeProvider = (
  action: EngineeringAction,
  capability: SandboxCapabilityId,
  nowMs: number,
) => DelegatedApprovalEnvelope;

export type OperatorRunInput = {
  taskId: string;
  objective: string;
  projectId: string | null;
  workspaceId: string | null;
  envelopes: OperatorEnvelopeProvider;
  availableDiagnostics: string[];
  nowMs: () => number;
  budgets: { maxModelCalls: number; maxToolExecutions: number; maxWallMs: number };
  /** Cooperative cancellation check; when true the operator stops at the next safe point. */
  isCancelled?: () => boolean;
};

export type OperatorOutcome = {
  status: "completed" | "awaiting_owner" | "aborted" | "budget_exhausted" | "failed";
  modelCallsUsed: number;
  toolCallsUsed: number;
  results: EngineeringToolResult[];
  candidatePatchRef: string | null;
};

export class EngineeringOperatorAdapter {
  private readonly model: ThinkingModel;
  private readonly port: EngineeringExecutionPort;

  constructor(model: ThinkingModel, port: EngineeringExecutionPort) {
    this.model = model;
    this.port = port;
  }

  async runTask(input: OperatorRunInput): Promise<OperatorOutcome> {
    const results: EngineeringToolResult[] = [];
    let modelCallsUsed = 0;
    let toolCallsUsed = 0;
    let workspaceId = input.workspaceId;
    let started = false;

    for (let step = 0; step < ENGINEERING_MAX_STEPS; step++) {
      if (input.isCancelled?.()) {
        return { status: "aborted", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: extractPatchRef(results) };
      }
      const nowMs = input.nowMs();
      const lastResults = results.map((r) => ({
        ok: r.ok,
        artifactRef: r.ok ? r.artifactRef : null,
        errorCode: r.ok ? null : r.errorCode,
        reason: r.ok ? null : r.reason,
      }));
      const ctx = buildOperatorContext({
        taskId: input.taskId,
        objective: input.objective,
        projectId: input.projectId,
        workspaceId,
        availableDiagnostics: input.availableDiagnostics,
        lastResults,
        modelCallsUsed,
        toolCallsUsed,
        nowMs,
      });
      const proposed = await this.model.proposeNextAction(ctx);
      modelCallsUsed += 1;

      if (modelCallsUsed > input.budgets.maxModelCalls) {
        return { status: "budget_exhausted", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: null };
      }
      if (!proposed || typeof proposed !== "object" || !("type" in proposed)) {
        return {
          status: "failed",
          modelCallsUsed,
          toolCallsUsed,
          results: [...results, { ok: false, errorCode: "invalid_proposal", reason: "model produced no valid action" }],
          candidatePatchRef: null,
        };
      }
      const action = proposed as EngineeringAction;
      const validated = validateEngineeringAction(action);
      if (!validated.ok) {
        // Treat model malformation as a bounded refusal, not an exception.
        results.push({ ok: false, errorCode: validated.errorCode, reason: validated.reason });
        toolCallsUsed += 1;
        if (toolCallsUsed >= input.budgets.maxToolExecutions) {
          return { status: "budget_exhausted", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: null };
        }
        continue;
      }

      if (ENGINEERING_META_ACTIONS.has(action.type)) {
        if (action.type === "complete") {
          return { status: "completed", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: extractPatchRef(results) };
        }
        if (action.type === "abort") {
          return { status: "aborted", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: null };
        }
        return { status: "awaiting_owner", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: null };
      }

      const capability = engineeringActionCapability(action.type);
      if (capability === null) {
        results.push({ ok: false, errorCode: "unknown_capability", reason: "no capability for action" });
        toolCallsUsed += 1;
        continue;
      }
      const pathCheck = isActionPathAllowed(action, input.projectId, workspaceId);
      if (!pathCheck.ok) {
        results.push({ ok: false, errorCode: "path_not_allowed", reason: pathCheck.reason });
        toolCallsUsed += 1;
        if (toolCallsUsed >= input.budgets.maxToolExecutions) {
          return { status: "budget_exhausted", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: null };
        }
        continue;
      }

      const envelope = input.envelopes(action, capability, nowMs);
      let result: EngineeringToolResult;
      if (action.type === "request_workspace") {
        if (started) {
          result = { ok: false, errorCode: "workspace_already_created", reason: "workspace already created" };
        } else {
          result = await this.port.executeAction(action, envelope);
          if (result.ok && result.data && typeof result.data === "object" && "workspaceId" in result.data) {
            const wid = (result.data as { workspaceId?: unknown }).workspaceId;
            if (typeof wid === "string") {
              workspaceId = wid;
              started = true;
            }
          }
        }
      } else if (action.type === "commit_candidate") {
        result = { ok: false, errorCode: "owner_approval_required", reason: "commit_candidate requires owner approval" };
      } else if (action.type === "execute_recipe") {
        result = await this.port.executeAction(action, envelope);
      } else if (action.type === "run_diagnostic") {
        result = await this.port.executeAction(action, envelope);
      } else {
        result = await this.port.executeAction(action, envelope);
      }
      results.push(result);
      toolCallsUsed += 1;
      if (toolCallsUsed >= input.budgets.maxToolExecutions) {
        return { status: "budget_exhausted", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: extractPatchRef(results) };
      }
    }

    return { status: "budget_exhausted", modelCallsUsed, toolCallsUsed, results, candidatePatchRef: extractPatchRef(results) };
  }
}

function isActionPathAllowed(
  action: EngineeringAction,
  projectId: string | null,
  workspaceId: string | null,
): { ok: true } | { ok: false; reason: string } {
  const f = action.fields as Record<string, unknown>;
  const rel = typeof f.relativePath === "string" ? f.relativePath : "";
  if (rel.length > 0 && !isCanonicalRelativePath(rel)) {
    return { ok: false, reason: "relative path must be canonical and contained" };
  }
  const requiresProject = action.type.startsWith("inspect_project") || action.type === "list_project_directory" || action.type === "search_project_text";
  if (requiresProject && projectId === null) {
    return { ok: false, reason: "project id required" };
  }
  const requiresWorkspace = action.type.startsWith("list_workspace") || action.type.startsWith("read_workspace") || action.type.startsWith("write_workspace") || action.type.startsWith("search_workspace") || action.type === "apply_workspace_patch" || action.type === "generate_candidate_patch";
  if (requiresWorkspace && workspaceId === null && action.type !== "request_workspace") {
    return { ok: false, reason: "workspace id required" };
  }
  return { ok: true };
}

function extractPatchRef(results: EngineeringToolResult[]): string | null {
  for (const r of results) {
    if (r.ok && r.data && typeof r.data === "object" && "artifactRef" in r.data) {
      const ref = (r.data as { artifactRef?: unknown }).artifactRef;
      if (typeof ref === "string" && ref.startsWith("patch-")) return ref;
    }
  }
  return null;
}

function buildOperatorContext(input: {
  taskId: string;
  objective: string;
  projectId: string | null;
  workspaceId: string | null;
  availableDiagnostics: string[];
  lastResults: { ok: boolean; artifactRef: string | null; errorCode: string | null; reason: string | null }[];
  modelCallsUsed: number;
  toolCallsUsed: number;
  nowMs: number;
}): import("./engineering-types.js").EngineeringOperatorContext {
  return {
    taskId: input.taskId,
    objective: input.objective,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    availableDiagnostics: input.availableDiagnostics,
    lastResults: input.lastResults,
    modelCallsUsed: input.modelCallsUsed,
    toolCallsUsed: input.toolCallsUsed,
    nowMs: input.nowMs,
  };
}
