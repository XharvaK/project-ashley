/**
 * Agent-side sandbox policy precheck: preliminary, advisory, fail-closed.
 *
 * The precheck is a pure gate between an untrusted model proposal and a
 * later broker-finalized authorization. It validates the proposal shape,
 * checks trusted preconditions (injected policy, policy hash, owner, session,
 * canonical path facts), then defers every authorization decision to the
 * shared deterministic module. Its outcome is explicitly preliminary:
 * signature verification and final authorization belong to the broker and are
 * not performed here.
 *
 * The precheck never reads keys, never signs, never calls the broker, never
 * touches the filesystem and never executes anything.
 */

import {
  authorizeSandboxOperation,
  maxRisk,
  rule,
  type SandboxAuthorizationDecision,
  type SandboxCapabilityId,
  type SandboxPathIntent,
  type SandboxRiskClass,
} from "@composer-assistant/sandbox-policy";
import type { SandboxPrecheckAudit } from "./audit.js";
import { buildSandboxPrecheckAudit, type AuditTarget } from "./audit.js";
import {
  computePolicyHash,
  type SandboxPolicyTrustedContext,
} from "./policy-context.js";
import {
  validateSandboxActionProposal,
} from "./proposal-types.js";
import { redactSecretShapes } from "../privacy/redact-logs.js";

export type SandboxPrecheckFailureCode =
  | "proposal_invalid"
  | "policy_unavailable"
  | "policy_mismatch"
  | "owner_mismatch"
  | "session_invalid"
  | "path_facts_unavailable"
  | "invalid_clock"
  | "precheck_denied";

export type SandboxApprovalRequiredMetadata = {
  capabilityId: SandboxCapabilityId;
  authoritativeRiskClass: SandboxRiskClass;
  affectedCanonicalPaths: string[];
  recipeId: string | null;
  executableId: string | null;
  persistence: "temporary" | "persistent";
  requiresNetwork: boolean;
  externalSideEffect: boolean;
  sessionUuid: string | null;
  policyRuleId: string;
  reason: string;
};

export type SandboxPrecheckResult =
  | {
      ok: true;
      preliminary: true;
      preliminaryDecision: "owner_approval_required";
      capabilityId: SandboxCapabilityId;
      authoritativeRiskClass: SandboxRiskClass;
      policyRuleId: string;
      policyId: string;
      policyVersion: number;
      policyHash: string;
      approvalRequired: SandboxApprovalRequiredMetadata;
      audit: SandboxPrecheckAudit;
      brokerVerificationRequired: true;
    }
  | {
      ok: true;
      preliminary: true;
      preliminaryDecision: "autonomous_safe";
      capabilityId: SandboxCapabilityId;
      authoritativeRiskClass: SandboxRiskClass;
      policyRuleId: string;
      policyId: string;
      policyVersion: number;
      policyHash: string;
      audit: SandboxPrecheckAudit;
      brokerVerificationRequired: true;
    }
  | {
      ok: false;
      preliminary: true;
      error: SandboxPrecheckFailureCode;
      reason: string;
      policyRuleId?: string;
      audit: SandboxPrecheckAudit;
    };

const FAIL_CLOSED_RISK: SandboxRiskClass = "high";

function safeIso(nowMs: number): string {
  return Number.isFinite(nowMs)
    ? new Date(nowMs).toISOString()
    : "1970-01-01T00:00:00.000Z";
}

function maxOfDecisions(decisions: readonly SandboxAuthorizationDecision[]): SandboxRiskClass {
  return decisions.reduce<SandboxRiskClass>(
    (risk, decision) => maxRisk(risk, decision.authoritativeRiskClass),
    "low",
  );
}

type FailParams = {
  error: SandboxPrecheckFailureCode;
  reason: string;
  decision?: SandboxAuthorizationDecision;
  targets?: readonly AuditTarget[];
  securityRelevant?: boolean;
};

export function runSandboxPrecheck(
  proposalInput: unknown,
  context: SandboxPolicyTrustedContext,
): SandboxPrecheckResult {
  const nowIso = safeIso(context.nowMs);

  const validated = validateSandboxActionProposal(proposalInput);
  if (!validated.ok) {
    const audit = buildSandboxPrecheckAudit({
      proposalId: safeProposalId(proposalInput),
      ownerId: safeOwnerId(proposalInput),
      sessionUuid: null,
      requestedCapability: "unknown",
      modelSuggestedRisk: null,
      authoritativeRiskClass: FAIL_CLOSED_RISK,
      preliminaryDecision: "proposal_invalid",
      policyRuleId: null,
      policyId: null,
      policyVersion: null,
      policyHash: null,
      recipeId: null,
      executableId: null,
      targets: [],
      rationale: null,
      reason: validated.reason,
      securityRelevant: false,
      nowIso,
    });
    context.auditSink?.(audit);
    return {
      ok: false,
      preliminary: true,
      error: "proposal_invalid",
      reason: validated.reason,
      audit,
    };
  }
  const proposal = validated.proposal;

  const fail = (params: FailParams): SandboxPrecheckResult => {
    const audit = buildSandboxPrecheckAudit({
      proposalId: proposal.proposalId,
      ownerId: proposal.ownerId,
      sessionUuid: proposal.sessionUuid ?? null,
      requestedCapability: proposal.requestedCapability,
      modelSuggestedRisk: proposal.modelSuggestedRisk ?? null,
      authoritativeRiskClass:
        params.decision?.authoritativeRiskClass ?? FAIL_CLOSED_RISK,
      preliminaryDecision: "denied",
      policyRuleId: params.decision?.policyRuleId ?? null,
      policyId: context.policy?.policyId ?? null,
      policyVersion: context.policy?.policyVersion ?? null,
      policyHash: context.policyHash,
      recipeId: proposal.recipeId ?? null,
      executableId: proposal.executableId ?? null,
      targets: params.targets ?? [],
      rationale: proposal.rationale ?? null,
      reason: params.reason,
      securityRelevant:
        params.securityRelevant ??
        (params.decision?.policyRuleId === rule("absolute-denial")),
      nowIso,
    });
    context.auditSink?.(audit);
    return {
      ok: false,
      preliminary: true,
      error: params.error,
      reason: params.reason,
      ...(params.decision !== undefined
        ? { policyRuleId: params.decision.policyRuleId }
        : {}),
      audit,
    };
  };

  if (!Number.isFinite(context.nowMs)) {
    return fail({ error: "invalid_clock", reason: "invalid_clock_context" });
  }
  const policy = context.policy;
  if (policy === null) {
    if (context.policyHash !== null) {
      return fail({ error: "policy_mismatch", reason: "policy_hash_without_policy" });
    }
    return fail({ error: "policy_unavailable", reason: "no_active_policy" });
  }
  const computedHash = computePolicyHash(policy);
  if (computedHash === null || context.policyHash !== computedHash) {
    return fail({ error: "policy_mismatch", reason: "policy_hash_mismatch" });
  }
  if (context.ownerId !== proposal.ownerId) {
    return fail({ error: "owner_mismatch", reason: "owner_id_mismatch" });
  }
  if (proposal.sessionUuid !== undefined) {
    const session = context.activeSession;
    if (session === undefined) {
      return fail({ error: "session_invalid", reason: "session_facts_required_but_missing" });
    }
    if (session.sessionUuid !== proposal.sessionUuid) {
      return fail({ error: "session_invalid", reason: "session_uuid_mismatch" });
    }
    if (session.role !== "sandbox_operator_light" && session.role !== "sandbox_operator_deep") {
      return fail({ error: "session_invalid", reason: "session_role_invalid" });
    }
    if (session.state !== "active") {
      return fail({ error: "session_invalid", reason: "session_state_inactive" });
    }
    if (Number.isNaN(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= context.nowMs) {
      return fail({ error: "session_invalid", reason: "session_expired" });
    }
  }

  const resolvedTargets: AuditTarget[] = [];
  for (const target of proposal.targetPaths ?? []) {
    const fact = context.canonicalPathFacts.find(
      (entry) => entry.claimedPath === target.path,
    );
    if (fact === undefined) {
      return fail({
        error: "path_facts_unavailable",
        reason: "path_fact_missing_for_target",
        targets: resolvedTargets,
      });
    }
    resolvedTargets.push({ canonicalPath: fact.canonicalPath, intent: target.intent });
  }

  const signer = {
    class: "delegated" as const,
    keyId: policy.allowedDelegatedSignerKeyIds[0] ?? null,
  };

  const authorizeCalls: Array<{ intent: SandboxPathIntent; targetPath: string }> =
    resolvedTargets.length > 0
      ? resolvedTargets.map((target) => ({
          intent: target.intent,
          targetPath: target.canonicalPath,
        }))
      : [{ intent: "read", targetPath: "" }];

  const decisions = authorizeCalls.map((call) =>
    authorizeSandboxOperation({
      capabilityId: proposal.requestedCapability,
      policy,
      signer,
      intent: call.targetPath === "" ? undefined : call.intent,
      targetPath: call.targetPath === "" ? undefined : call.targetPath,
      recipeId: proposal.recipeId,
      executableId: proposal.executableId,
      networkRequired: proposal.requiresNetwork,
      externalSideEffects: proposal.externalSideEffect,
      persistence: proposal.persistence === "persistent",
      modelRiskLabel: proposal.modelSuggestedRisk,
      nowIso,
    }),
  );

  const denied = decisions.find((decision) => decision.decision === "denied");
  if (denied !== undefined) {
    return fail({
      error: "precheck_denied",
      reason: denied.reason,
      decision: denied,
      targets: resolvedTargets,
    });
  }
  const approvals = decisions.filter(
    (decision) => decision.decision === "owner_approval_required",
  );
  if (approvals.length > 0) {
    const decision = approvals[0];
    const risk = maxOfDecisions(decisions);
    const audit = buildSandboxPrecheckAudit({
      proposalId: proposal.proposalId,
      ownerId: proposal.ownerId,
      sessionUuid: proposal.sessionUuid ?? null,
      requestedCapability: proposal.requestedCapability,
      modelSuggestedRisk: proposal.modelSuggestedRisk ?? null,
      authoritativeRiskClass: risk,
      preliminaryDecision: "owner_approval_required",
      policyRuleId: decision.policyRuleId,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyHash: context.policyHash ?? "",
      recipeId: proposal.recipeId ?? null,
      executableId: proposal.executableId ?? null,
      targets: resolvedTargets,
      rationale: proposal.rationale ?? null,
      reason: decision.reason,
      securityRelevant: false,
      nowIso,
    });
    context.auditSink?.(audit);
    return {
      ok: true,
      preliminary: true,
      preliminaryDecision: "owner_approval_required",
      capabilityId: decision.capability,
      authoritativeRiskClass: risk,
      policyRuleId: decision.policyRuleId,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyHash: context.policyHash ?? "",
      approvalRequired: {
        capabilityId: decision.capability,
        authoritativeRiskClass: risk,
        affectedCanonicalPaths: resolvedTargets.map((target) =>
          redactSecretShapes(target.canonicalPath),
        ),
        recipeId: proposal.recipeId ?? null,
        executableId: proposal.executableId ?? null,
        persistence: proposal.persistence,
        requiresNetwork: proposal.requiresNetwork,
        externalSideEffect: proposal.externalSideEffect,
        sessionUuid: proposal.sessionUuid ?? null,
        policyRuleId: decision.policyRuleId,
        reason: decision.reason,
      },
      audit,
      brokerVerificationRequired: true,
    };
  }

  const autonomous = decisions[0];
  const risk = maxOfDecisions(decisions);
  const audit = buildSandboxPrecheckAudit({
    proposalId: proposal.proposalId,
    ownerId: proposal.ownerId,
    sessionUuid: proposal.sessionUuid ?? null,
    requestedCapability: proposal.requestedCapability,
    modelSuggestedRisk: proposal.modelSuggestedRisk ?? null,
    authoritativeRiskClass: risk,
    preliminaryDecision: "autonomous_safe",
    policyRuleId: autonomous.policyRuleId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: context.policyHash ?? "",
    recipeId: proposal.recipeId ?? null,
    executableId: proposal.executableId ?? null,
    targets: resolvedTargets,
    rationale: proposal.rationale ?? null,
    reason: null,
    securityRelevant: false,
    nowIso,
  });
  context.auditSink?.(audit);
  return {
    ok: true,
    preliminary: true,
    preliminaryDecision: "autonomous_safe",
    capabilityId: autonomous.capability,
    authoritativeRiskClass: risk,
    policyRuleId: autonomous.policyRuleId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: context.policyHash ?? "",
    audit,
    brokerVerificationRequired: true,
  };
}

function safeProposalId(input: unknown): string {
  if (
    typeof input === "object" &&
    input !== null &&
    typeof (input as Record<string, unknown>).proposalId === "string" &&
    ((input as Record<string, unknown>).proposalId as string).length <= 128
  ) {
    return (input as Record<string, unknown>).proposalId as string;
  }
  return "<unparsed>";
}

function safeOwnerId(input: unknown): string {
  if (
    typeof input === "object" &&
    input !== null &&
    typeof (input as Record<string, unknown>).ownerId === "string" &&
    ((input as Record<string, unknown>).ownerId as string).length <= 128
  ) {
    return (input as Record<string, unknown>).ownerId as string;
  }
  return "<unparsed>";
}
