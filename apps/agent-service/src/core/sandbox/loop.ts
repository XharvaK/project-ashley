/**
 * Bounded sandbox orchestration loop (Sandbox Wave 4, Commit 10).
 *
 * The loop is the bounded autonomous agent loop over a broker-bound session:
 *
 *  - exactly one model call per iteration, atomically reserved against the
 *    model-call budget BEFORE dispatch;
 *  - exactly one broker tool action (fixed recipe execution) per iteration;
 *  - strict structured-action validation with at most one malformed-output
 *    correction retry (each consuming a model call);
 *  - at most one transient adapter retry (consuming a model call);
 *  - no retry on denial, mismatch, or security failure;
 *  - fixed deadline, model budget, and broker tool budget are enforced as
 *    stop conditions;
 *  - `awaiting_owner` transitions stop the loop (no approval completion in
 *    this commit);
 *  - every action is prechecked, signed, and broker-finalized: the broker
 *    remains the final authority for every tool action.
 *
 * The lifecycle gate defaults to `disabled`; only an injected fixture
 * adapter may run under `fixture_only`.
 */

import { randomNonce } from "@composer-assistant/sandbox-broker";
import type { SandboxAutonomyLifecycle } from "./lifecycle.js";
import { bootstrapSandboxSession } from "./bootstrap.js";
import type {
  SandboxBrokerClient,
  SandboxBrokerClientTestDiagnostics,
  SandboxBrokerSessionSnapshot,
} from "./broker-client.js";
import type { SandboxOperatorAdapter, SandboxReceiptSummary } from "./operator-adapter.js";
import {
  validateSandboxOperatorAction,
  type SandboxOperatorAction,
} from "./operator-actions.js";
import { buildBoundedSandboxContext } from "./sandbox-context.js";
import { runSandboxPrecheck } from "./precheck.js";
import { signDelegatedSandboxEnvelope } from "./delegated-signer.js";
import type { DelegatedRuntimeKeyMaterial } from "./delegated-key-custody.js";
import type { SandboxTask } from "./task.js";
import { CANDIDATE_WORKSPACE_CREATE_CAPABILITY, capabilityForRecipeExecution } from "./task.js";
import { buildSandboxOrchestrationAudit } from "./orchestration-audit.js";
import type { SandboxAuditSink } from "./orchestration-audit.js";
import type { SandboxStopReason } from "./stop-reasons.js";
import type { SandboxActionProposal } from "./proposal-types.js";
import type { SandboxPolicyTrustedContext } from "./policy-context.js";

type AuditFields = Omit<
  Parameters<typeof buildSandboxOrchestrationAudit>[0],
  "taskId" | "ownerId" | "nowMs"
>;

export type SandboxLoopStatus =
  | "completed"
  | "aborted"
  | "expired"
  | "awaiting_owner"
  | "stopped";

export type SandboxLoopResult = {
  status: SandboxLoopStatus;
  stopReason: SandboxStopReason;
  taskId: string;
  sessionUuid: string | null;
  modelCallsUsed: number;
  toolExecutionsUsed: number;
  turns: number;
  awaitingOwner: { capabilityId: string; reason: string } | null;
  error: string | null;
};

export type RunSandboxLoopInput = {
  task: SandboxTask;
  lifecycle: SandboxAutonomyLifecycle;
  adapter: SandboxOperatorAdapter;
  client: SandboxBrokerClient & SandboxBrokerClientTestDiagnostics;
  delegatedKey: DelegatedRuntimeKeyMaterial;
  nowMs: () => number;
  signal?: AbortSignal;
  auditSink?: SandboxAuditSink;
  nonceFactory?: () => string;
  capabilityTtlMs?: number;
};

const DEFAULT_CAPABILITY_TTL_MS = 120_000;

/**
 * Envelope lifetime is deliberately shorter than the capability window so a
 * real (advancing) clock can never push the signed envelope outside the
 * broker-issued capability window. The envelope is signed AFTER the
 * capability is issued and its expiry is clamped inside the window.
 */
const ENVELOPE_TTL_MS = 30_000;

function receiptSummaryOf(
  recipeId: string,
  outcome: "succeeded" | "failed" | "refused",
  stage: string | null,
  errorCode: string | null,
  exitCode: number | null,
  truncated: boolean,
  stdoutBytes: number | null,
  stderrBytes: number | null,
  wallMs: number | null,
): SandboxReceiptSummary {
  return {
    recipeId,
    outcome,
    stage,
    errorCode,
    exitCode,
    truncated,
    stdoutBytes,
    stderrBytes,
    wallMs,
  };
}

/**
 * Runs the bounded orchestration loop for an admitted task. Fail-closed on
 * lifecycle, bootstrap, budgets, deadline, refusals and invalid output.
 */
export async function runSandboxLoop(
  input: RunSandboxLoopInput,
): Promise<SandboxLoopResult> {
  const task = input.task;
  const emit = (fields: AuditFields) => {
    const record = buildSandboxOrchestrationAudit({
      ...fields,
      taskId: task.taskId,
      ownerId: task.ownerId,
      nowMs: input.nowMs(),
    });
    if (record !== null) input.auditSink?.(record);
  };

  let session: SandboxBrokerSessionSnapshot | null = null;
  let workspace: { workspaceId: string } | null = null;
  let modelCallsUsed = 0;
  let turn = 0;
  let previousAction: SandboxOperatorAction | null = null;
  let previousActionInvalidReason: string | null = null;
  let lastReceipt: SandboxReceiptSummary | null = null;
  const history: SandboxOperatorAction[] = [];
  let correctionRetriesUsed = 0;
  let transientRetriesUsed = 0;
  let awaitingOwner: { capabilityId: string; reason: string } | null = null;
  let error: string | null = null;

  const stop = (
    stopReason: SandboxStopReason,
    status: SandboxLoopStatus,
    stopError: string | null = null,
  ): SandboxLoopResult => {
    emit({ kind: "loop_stopped", stopReason });
    return {
      status,
      stopReason,
      taskId: task.taskId,
      sessionUuid: session?.sessionUuid ?? null,
      modelCallsUsed,
      toolExecutionsUsed: session?.toolExecutionsUsed ?? 0,
      turns: turn,
      awaitingOwner,
      error: stopError,
    };
  };

  // ---- deadline gate before any broker work ----
  const startNowMs = input.nowMs();
  if (startNowMs >= task.deadlineAtMs) {
    emit({ kind: "task_expired", deadlineAtMs: task.deadlineAtMs });
    return stop("task_expired", "expired");
  }

  // ---- bootstrap ----
  const bootstrapped = await bootstrapSandboxSession({
    task,
    lifecycle: input.lifecycle,
    adapter: input.adapter,
    client: input.client,
    delegatedKey: input.delegatedKey,
    nowMs: input.nowMs,
    nonceFactory: input.nonceFactory,
    auditSink: input.auditSink,
  });
  if (!bootstrapped.ok) {
    return stop(bootstrapped.stopReason, "stopped", bootstrapped.reason);
  }
  session = bootstrapped.session;
  workspace = bootstrapped.workspace;

  const trustedContext = (): SandboxPolicyTrustedContext => ({
    source: "injected_verified_policy",
    policy: input.client.policy.policy,
    policyHash: input.client.policy.policyHash,
    signerClass: "delegated_runtime",
    ownerId: task.ownerId,
    nowMs: input.nowMs(),
    canonicalPathFacts: input.client.pathFacts,
    ...(session !== null
      ? {
          activeSession: {
            sessionUuid: session.sessionUuid,
            role: session.role,
            state: "active",
            expiresAt: session.expiresAt,
          },
        }
      : {}),
  });

  const refreshSession = async (): Promise<void> => {
    const latest =
      session === null ? null : await input.client.getSession(session.sessionUuid);
    if (latest !== null) session = latest;
  };

  // ---- loop ----
  while (true) {
    if (input.signal?.aborted === true) {
      return stop("cancelled", "stopped", "cancelled_by_signal");
    }
    const nowMs = input.nowMs();
    if (nowMs >= task.deadlineAtMs) {
      emit({ kind: "task_expired", deadlineAtMs: task.deadlineAtMs });
      return stop("task_expired", "expired");
    }
    if (modelCallsUsed >= task.maxModelCalls) {
      emit({
        kind: "budget_exhausted",
        budget: "model",
        used: modelCallsUsed,
        limit: task.maxModelCalls,
      });
      return stop("model_budget_exhausted", "stopped");
    }
    if (session !== null && session.toolExecutionsUsed >= task.maxToolExecutions) {
      emit({
        kind: "budget_exhausted",
        budget: "tool",
        used: session.toolExecutionsUsed,
        limit: task.maxToolExecutions,
      });
      return stop("tool_budget_exhausted", "stopped");
    }

    // ---- atomic model-call reservation BEFORE dispatch ----
    modelCallsUsed += 1;
    turn += 1;
    emit({
      kind: "model_call_reserved",
      turn,
      remainingAfter: Math.max(0, task.maxModelCalls - modelCallsUsed),
    });

    const context = buildBoundedSandboxContext({
      task,
      session,
      workspace,
      previousAction,
      previousActionInvalidReason,
      lastReceipt,
      history,
      remainingModelCalls: Math.max(0, task.maxModelCalls - modelCallsUsed),
      remainingToolExecutions: Math.max(
        0,
        task.maxToolExecutions - (session?.toolExecutionsUsed ?? 0),
      ),
      deadlineAtMs: task.deadlineAtMs,
      nowMs,
    });

    const output = await input.adapter.proposeNextAction(
      {
        task,
        context,
        session,
        workspace,
        previousAction,
        previousActionInvalidReason,
        lastReceipt,
        remainingModelCalls: Math.max(0, task.maxModelCalls - modelCallsUsed),
        remainingToolExecutions: Math.max(
          0,
          task.maxToolExecutions - (session?.toolExecutionsUsed ?? 0),
        ),
        deadlineAtMs: task.deadlineAtMs,
        nowMs,
      },
      input.signal,
    );

    if (!output.ok) {
      if (output.transient) {
        if (transientRetriesUsed >= 1) {
          error = output.reason;
          return stop("adapter_failure_after_retry", "stopped", output.reason);
        }
        transientRetriesUsed += 1;
        previousActionInvalidReason = `adapter_transient:${output.reason}`;
        continue;
      }
      error = output.reason;
      return stop("internal_error", "stopped", output.reason);
    }

    const validation = validateSandboxOperatorAction(output.action);
    if (!validation.ok) {
      emit({ kind: "model_action_invalid", turn, reason: validation.reason });
      if (correctionRetriesUsed >= 1) {
        error = validation.reason;
        return stop("action_invalid_after_retry", "stopped", validation.reason);
      }
      correctionRetriesUsed += 1;
      previousActionInvalidReason = `action_invalid:${validation.reason}`;
      continue;
    }
    const action = validation.action;
    previousAction = action;
    previousActionInvalidReason = null;
    history.push(action);
    emit({ kind: "model_action_received", turn, actionType: action.type });

    if (action.type === "complete") {
      emit({
        kind: "task_completed",
        modelCallsUsed,
        toolExecutionsUsed: session?.toolExecutionsUsed ?? 0,
      });
      if (session !== null) {
        await input.client.transitionSession(session.sessionUuid, "completed", {
          expectedRevision: session.revision,
          nowMs: input.nowMs(),
        });
      }
      return stop("operator_completed", "completed");
    }

    if (action.type === "abort") {
      emit({ kind: "task_aborted", reason: action.reason });
      if (session !== null) {
        await input.client.transitionSession(session.sessionUuid, "aborted", {
          expectedRevision: session.revision,
          nowMs: input.nowMs(),
        });
      }
      return stop("operator_aborted", "aborted");
    }

    if (action.type === "request_owner_approval") {
      awaitingOwner = { capabilityId: action.capability, reason: action.reason };
      emit({
        kind: "owner_approval_requested",
        capabilityId: action.capability,
        reasonPreview: action.reason,
      });
      if (session !== null) {
        await input.client.transitionSession(session.sessionUuid, "awaiting_owner", {
          expectedRevision: session.revision,
          nowMs: input.nowMs(),
        });
      }
      return stop("awaiting_owner", "awaiting_owner");
    }

    if (action.type === "request_workspace") {
      if (!task.workspaceRequired) {
        return stop("action_not_permitted", "stopped", "workspace_not_required_by_task");
      }
      if (workspace === null) {
        return stop("internal_error", "stopped", "workspace_unavailable");
      }
      if (
        task.sourceRootId !== null &&
        action.sourceRootId !== task.sourceRootId
      ) {
        return stop("action_not_permitted", "stopped", "source_root_id_mismatch");
      }
      // workspace reuse: the bound workspace is acknowledged, no broker call
      continue;
    }

    // ---- execute_recipe ----
    const capability = capabilityForRecipeExecution(action.recipeId);
    if (capability === null) {
      return stop("action_not_permitted", "stopped", `unknown_recipe_namespace:${action.recipeId}`);
    }
    if (!task.allowedCapabilities.includes(capability)) {
      return stop("action_not_permitted", "stopped", `capability_not_allowed_for_task:${capability}`);
    }
    await refreshSession();
    if (session === null) {
      return stop("internal_error", "stopped", "session_unavailable");
    }

    const proposal: SandboxActionProposal = {
      proposalId: `act-${input.nonceFactory ? input.nonceFactory() : randomNonce()}`,
      ownerId: task.ownerId,
      sessionUuid: session.sessionUuid,
      requestedCapability: capability,
      recipeId: action.recipeId,
      requiresNetwork: false,
      externalSideEffect: false,
      persistence: "temporary",
      modelSuggestedRisk: "low",
    };
    emit({
      kind: "broker_action_requested",
      turn,
      actionType: "execute_recipe",
      capabilityId: capability,
      recipeId: action.recipeId,
    });

    const precheck = runSandboxPrecheck(proposal, trustedContext());
    if (!precheck.ok) {
      return stop("policy_refused", "stopped", `precheck:${precheck.reason}`);
    }
    if (precheck.preliminaryDecision === "owner_approval_required") {
      awaitingOwner = {
        capabilityId: precheck.approvalRequired.capabilityId,
        reason: precheck.approvalRequired.reason,
      };
      emit({
        kind: "owner_approval_requested",
        capabilityId: awaitingOwner.capabilityId,
        reasonPreview: awaitingOwner.reason,
      });
      await input.client.transitionSession(session.sessionUuid, "awaiting_owner", {
        expectedRevision: session.revision,
        nowMs: input.nowMs(),
      });
      return stop("awaiting_owner", "awaiting_owner");
    }

    const capabilityIssued = await input.client.issueSessionCapability(
      session.sessionUuid,
      capability,
      {
        ttlMs: input.capabilityTtlMs ?? DEFAULT_CAPABILITY_TTL_MS,
        nowMs: input.nowMs(),
      },
    );
    if (!capabilityIssued.ok) {
      return stop("broker_refusal", "stopped", `capability:${capabilityIssued.errorCode}`);
    }

    // The envelope is signed only after the capability exists so its
    // issuedAt is never earlier than the capability window start, and its
    // expiry is clamped strictly inside the capability window end.
    const capabilityWindowEndMs = Date.parse(capabilityIssued.value.payload.expiresAt);
    const signNowMs = input.nowMs();
    const nonce = input.nonceFactory ? input.nonceFactory() : randomNonce();
    const signed = signDelegatedSandboxEnvelope({
      proposal,
      precheck,
      context: trustedContext(),
      key: input.delegatedKey,
      nowMs: signNowMs,
      expiresAt: Number.isFinite(capabilityWindowEndMs)
        ? Math.min(signNowMs + ENVELOPE_TTL_MS, capabilityWindowEndMs - 1_000)
        : signNowMs + ENVELOPE_TTL_MS,
      nonce,
      auditSink: undefined,
    });
    if (!signed.ok) {
      return stop("policy_refused", "stopped", `signing:${signed.error}:${signed.reason}`);
    }

    const execution = await input.client.executeRecipe({
      envelope: {
        ...signed.envelope,
        sessionUuid: session.sessionUuid,
        recipeId: action.recipeId,
        signature: signed.envelope.signature!,
      },
      sessionUuid: session.sessionUuid,
      capability: capabilityIssued.value,
      capabilityUseId: `use-${nonce}`,
      expectedSessionRevision: session.revision,
      nowMs: input.nowMs(),
    });
    if (!execution.ok) {
      lastReceipt = receiptSummaryOf(
        action.recipeId,
        "refused",
        execution.stage,
        execution.errorCode,
        null,
        false,
        null,
        null,
        null,
      );
      emit({
        kind: "broker_receipt_received",
        turn,
        recipeId: action.recipeId,
        outcome: "refused",
        stage: execution.stage,
        errorCode: execution.errorCode,
        exitCode: null,
        truncated: false,
      });
      return stop("broker_refusal", "stopped", `${execution.stage}:${execution.errorCode}`);
    }
    lastReceipt = receiptSummaryOf(
      action.recipeId,
      execution.outcome,
      "receipt",
      null,
      execution.receipt.terminalState.exitCode,
      execution.receipt.truncated,
      execution.receipt.stdoutBytes,
      execution.receipt.stderrBytes,
      execution.receipt.wallMs,
    );
    emit({
      kind: "broker_receipt_received",
      turn,
      recipeId: action.recipeId,
      outcome: execution.outcome,
      stage: "receipt",
      exitCode: execution.receipt.terminalState.exitCode,
      truncated: execution.receipt.truncated,
    });
    await refreshSession();
  }
}

export { CANDIDATE_WORKSPACE_CREATE_CAPABILITY };
