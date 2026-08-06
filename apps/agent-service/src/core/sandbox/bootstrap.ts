/**
 * Sandbox session bootstrap (Sandbox Wave 4, Commit 10).
 *
 * Turns an admitted task into a live broker session in one bounded flow:
 * lifecycle gate, task constraints, trusted policy context, a preliminary
 * precheck probe, delegated signing, broker-final authorization of the
 * probe, optional disposable workspace creation (broker-authorized), then
 * broker session creation and activation. Denial or owner-approval at any
 * point fails closed and NEVER calls the model.
 *
 * Nothing here executes a recipe; the loop owns per-turn model interaction.
 */

import { randomNonce } from "@composer-assistant/sandbox-broker";
import {
  checkSandboxAutonomyLifecycle,
  type SandboxAutonomyLifecycle,
} from "./lifecycle.js";
import type { SandboxStopReason } from "./stop-reasons.js";
import type { SandboxTask } from "./task.js";
import { CANDIDATE_WORKSPACE_CREATE_CAPABILITY } from "./task.js";
import type { SandboxOperatorAdapter } from "./operator-adapter.js";
import type {
  SandboxBrokerClient,
  SandboxBrokerSessionSnapshot,
} from "./broker-client.js";
import type {
  SandboxPolicyTrustedContext,
  CanonicalPathFact,
} from "./policy-context.js";
import { runSandboxPrecheck } from "./precheck.js";
import { signDelegatedSandboxEnvelope } from "./delegated-signer.js";
import type { DelegatedRuntimeKeyMaterial } from "./delegated-key-custody.js";
import type { SandboxActionProposal } from "./proposal-types.js";
import { buildSandboxOrchestrationAudit } from "./orchestration-audit.js";
import type { SandboxAuditSink } from "./orchestration-audit.js";

export type SandboxBootstrapResult =
  | {
      ok: true;
      session: SandboxBrokerSessionSnapshot;
      workspace: { workspaceId: string } | null;
    }
  | {
      ok: false;
      stopReason: Extract<SandboxStopReason, "lifecycle_denied" | "bootstrap_failed">;
      reason: string;
    };

export type BootstrapSandboxSessionInput = {
  task: SandboxTask;
  lifecycle: SandboxAutonomyLifecycle;
  adapter: SandboxOperatorAdapter;
  client: SandboxBrokerClient;
  delegatedKey: DelegatedRuntimeKeyMaterial;
  nowMs: () => number;
  nonceFactory?: () => string;
  workspaceTtlMs?: number;
  auditSink?: SandboxAuditSink;
};

type AuditFields = Omit<
  Parameters<typeof buildSandboxOrchestrationAudit>[0],
  "taskId" | "ownerId" | "nowMs"
>;

function emit(
  sink: SandboxAuditSink | undefined,
  taskId: string,
  ownerId: string,
  nowMs: number,
  fields: AuditFields,
): void {
  const record = buildSandboxOrchestrationAudit({
    ...fields,
    taskId,
    ownerId,
    nowMs,
  });
  if (record !== null) sink?.(record);
}

function precheckReason(precheck: unknown): string {
  if (
    typeof precheck === "object" &&
    precheck !== null &&
    "reason" in precheck &&
    typeof (precheck as { reason?: unknown }).reason === "string"
  ) {
    return (precheck as { reason: string }).reason;
  }
  return "unexpected_precheck_outcome";
}

/**
 * Builds the trusted precheck context from the broker client's facts and
 * the injected active policy. Never reads the environment or disk.
 */
export function buildTrustedPolicyContext(input: {
  task: SandboxTask;
  client: SandboxBrokerClient;
  nowMs: number;
  facts?: readonly CanonicalPathFact[];
}): SandboxPolicyTrustedContext {
  const policy = input.client.policy.policy;
  return {
    source: "injected_verified_policy",
    policy,
    policyHash: input.client.policy.policyHash,
    signerClass: "delegated_runtime",
    ownerId: input.task.ownerId,
    nowMs: input.nowMs,
    canonicalPathFacts: input.facts ?? input.client.pathFacts,
  };
}

function probeProposal(task: SandboxTask, liveFile: string): SandboxActionProposal {
  return {
    proposalId: `probe-${randomNonce()}`,
    ownerId: task.ownerId,
    requestedCapability: "approved_project_read",
    targetPaths: [{ path: liveFile, intent: "read" }],
    requiresNetwork: false,
    externalSideEffect: false,
    persistence: "temporary",
    modelSuggestedRisk: "low",
  };
}

/**
 * Bootstraps the broker session for an admitted task. Fail-closed at every
 * step; never calls the model.
 */
export async function bootstrapSandboxSession(
  input: BootstrapSandboxSessionInput,
): Promise<SandboxBootstrapResult> {
  const task = input.task;
  const nowMs = input.nowMs();
  const emitSink = (fields: AuditFields) =>
    emit(input.auditSink, task.taskId, task.ownerId, input.nowMs(), fields);

  const gate = checkSandboxAutonomyLifecycle(input.lifecycle, input.adapter);
  if (!gate.ok) {
    emitSink({
      kind: "lifecycle_denied",
      lifecycle: input.lifecycle,
      reason: gate.reason,
    });
    return { ok: false, stopReason: gate.stopReason, reason: gate.reason };
  }

  const context = buildTrustedPolicyContext({ task, client: input.client, nowMs });
  if (context.policy === null) {
    emitSink({ kind: "bootstrap_failed", errorCode: "no_active_policy", reason: "no_active_policy" });
    return { ok: false, stopReason: "bootstrap_failed", reason: "no_active_policy" };
  }

  emitSink({
    kind: "bootstrap_started",
    policyId: context.policy.policyId,
    policyVersion: context.policy.policyVersion,
    policyHash: input.client.policy.policyHash,
  });

  // ---- preliminary precheck probe: validates policy, facts and clock ----
  const probe = probeProposal(task, input.client.liveFileCanonical);
  const precheck = runSandboxPrecheck(probe, context);
  if (!precheck.ok || precheck.preliminaryDecision !== "autonomous_safe") {
    emitSink({
      kind: "bootstrap_failed",
      errorCode: "probe_precheck_failed",
      reason: precheckReason(precheck),
    });
    return {
      ok: false,
      stopReason: "bootstrap_failed",
      reason: `probe_precheck_failed:${precheckReason(precheck)}`,
    };
  }

  // ---- delegated signing of the probe envelope ----
  const probeNonce = input.nonceFactory ? input.nonceFactory() : randomNonce();
  const signed = signDelegatedSandboxEnvelope({
    proposal: probe,
    precheck,
    context,
    key: input.delegatedKey,
    nowMs,
    nonce: probeNonce,
    auditSink: undefined,
  });
  if (!signed.ok) {
    emitSink({
      kind: "bootstrap_failed",
      errorCode: `probe_signing_failed:${signed.error}`,
      reason: signed.reason,
    });
    return {
      ok: false,
      stopReason: "bootstrap_failed",
      reason: `probe_signing_failed:${signed.error}:${signed.reason}`,
    };
  }

  // ---- broker-final authorization of the probe (no execution) ----
  const authorization = await input.client.authorizeRequest(signed.envelope, nowMs);
  if (!authorization.ok) {
    emitSink({
      kind: "bootstrap_failed",
      errorCode: "probe_broker_authorization_refused",
      reason: authorization.reason,
    });
    return {
      ok: false,
      stopReason: "bootstrap_failed",
      reason: `probe_broker_authorization_refused:${authorization.errorCode}`,
    };
  }

  // ---- optional disposable workspace (broker-authorized) ----
  let workspace: { workspaceId: string; workspaceManifestHash: string } | null = null;
  if (task.workspaceRequired) {
    if (task.sourceRootId === null) {
      emitSink({
        kind: "bootstrap_failed",
        errorCode: "workspace_requires_source_root_id",
        reason: "workspace_requires_source_root_id",
      });
      return {
        ok: false,
        stopReason: "bootstrap_failed",
        reason: "workspace_requires_source_root_id",
      };
    }
    const destination = context.policy.writableDisposableRoots[0];
    if (destination === undefined) {
      emitSink({
        kind: "bootstrap_failed",
        errorCode: "no_writable_disposable_root",
        reason: "no_writable_disposable_root",
      });
      return {
        ok: false,
        stopReason: "bootstrap_failed",
        reason: "no_writable_disposable_root",
      };
    }
    const workspaceProposal: SandboxActionProposal = {
      proposalId: `ws-${probeNonce}`,
      ownerId: task.ownerId,
      requestedCapability: CANDIDATE_WORKSPACE_CREATE_CAPABILITY,
      targetPaths: [{ path: destination, intent: "write" }],
      requiresNetwork: false,
      externalSideEffect: false,
      persistence: "temporary",
      modelSuggestedRisk: "low",
    };
    const workspacePrecheck = runSandboxPrecheck(workspaceProposal, context);
    if (
      !workspacePrecheck.ok ||
      workspacePrecheck.preliminaryDecision !== "autonomous_safe"
    ) {
      emitSink({
        kind: "bootstrap_failed",
        errorCode: "workspace_precheck_failed",
        reason: precheckReason(workspacePrecheck),
      });
      return {
        ok: false,
        stopReason: "bootstrap_failed",
        reason: `workspace_precheck_failed:${precheckReason(workspacePrecheck)}`,
      };
    }
    const workspaceNonce = input.nonceFactory
      ? input.nonceFactory()
      : randomNonce();
    const workspaceSigned = signDelegatedSandboxEnvelope({
      proposal: workspaceProposal,
      precheck: workspacePrecheck,
      context,
      key: input.delegatedKey,
      nowMs,
      nonce: workspaceNonce,
      auditSink: undefined,
    });
    if (!workspaceSigned.ok) {
      emitSink({
        kind: "bootstrap_failed",
        errorCode: `workspace_signing_failed:${workspaceSigned.error}`,
        reason: workspaceSigned.reason,
      });
      return {
        ok: false,
        stopReason: "bootstrap_failed",
        reason: `workspace_signing_failed:${workspaceSigned.error}`,
      };
    }
    const created = await input.client.createWorkspace({
      envelope: workspaceSigned.envelope,
      nowMs,
      ttlMs: input.workspaceTtlMs,
    });
    if (!created.ok) {
      emitSink({
        kind: "bootstrap_failed",
        errorCode: "workspace_creation_failed",
        reason: `${created.errorCode}:${created.reason}`,
      });
      return {
        ok: false,
        stopReason: "bootstrap_failed",
        reason: `workspace_creation_failed:${created.errorCode}`,
      };
    }
    workspace = {
      workspaceId: created.workspaceId,
      workspaceManifestHash: created.manifestHash,
    };
  }

  // ---- broker session create + activate ----
  const created = await input.client.createSession({
    ownerId: task.ownerId,
    proposalId: task.taskId,
    role: task.role,
    allowedCapabilities: task.allowedCapabilities,
    maxToolExecutions: task.maxToolExecutions,
    expiresAtMs: task.deadlineAtMs,
    ...(workspace !== null ? { workspace } : {}),
    nowMs,
  });
  if (!created.ok) {
    emitSink({
      kind: "bootstrap_failed",
      errorCode: "session_creation_failed",
      reason: `${created.errorCode}:${created.reason}`,
    });
    return {
      ok: false,
      stopReason: "bootstrap_failed",
      reason: `session_creation_failed:${created.errorCode}`,
    };
  }
  const activated = await input.client.activateSession(
    created.value.sessionUuid,
    created.value.revision,
    nowMs,
  );
  if (!activated.ok) {
    emitSink({
      kind: "bootstrap_failed",
      errorCode: "session_activation_failed",
      reason: `${activated.errorCode}:${activated.reason}`,
    });
    return {
      ok: false,
      stopReason: "bootstrap_failed",
      reason: `session_activation_failed:${activated.errorCode}`,
    };
  }
  emitSink({
    kind: "session_bound",
    sessionUuid: activated.value.sessionUuid,
    role: activated.value.role,
    state: activated.value.state,
  });
  if (workspace !== null) {
    emitSink({
      kind: "workspace_bound",
      sessionUuid: activated.value.sessionUuid,
      workspaceId: workspace.workspaceId,
    });
  }

  return {
    ok: true,
    session: activated.value,
    workspace: workspace === null ? null : { workspaceId: workspace.workspaceId },
  };
}
