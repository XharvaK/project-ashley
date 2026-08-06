/**
 * Owner approval proposal domain (Sandbox Wave 4, Commit 11).
 *
 * A proposal is the agent-side record of an owner-facing sandbox approval
 * decision. It carries ONLY structured authority fields (capability, risk
 * class, canonical target paths, policy identity, recipe, persistence,
 * network and side-effect flags) plus a bounded, non-authoritative model
 * summary. The authority payload is exactly what the broker signs and
 * verifies; any proposal whose bound fields change must be re-created, never
 * rebased.
 *
 * Pure domain: no database, no keys, no broker calls.
 */

import { randomBytes } from "node:crypto";
import type {
  SandboxCapabilityId,
  SandboxPathIntent,
  SandboxRiskClass,
} from "@composer-assistant/sandbox-policy";
import type { OwnerApprovalAuthorityPayload } from "@composer-assistant/sandbox-broker";

export const SANDBOX_APPROVAL_PROPOSAL_TTL_MS = 60 * 60 * 1000;
export const SANDBOX_APPROVAL_ENVELOPE_TTL_MS = 30 * 60 * 1000;
export const SANDBOX_APPROVAL_MAX_MODEL_SUMMARY_CHARS = 1200;
export const SANDBOX_APPROVAL_MAX_REASON_CHARS = 500;
export const SANDBOX_APPROVAL_MAX_AFFECTED_PATHS = 8;

export type SandboxApprovalPathTarget = {
  path: string;
  intent: SandboxPathIntent;
};

export type SandboxApprovalProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "stale"
  | "expired";

export type SandboxApprovalProposalSource = "policy_precheck" | "model_claim";

export type SandboxApprovalProposal = {
  id: number;
  entityUuid: string;
  ownerId: string;
  proposalId: string;
  taskId: string | null;
  sessionUuid: string | null;
  capabilityId: SandboxCapabilityId;
  authoritativeRiskClass: SandboxRiskClass;
  affectedCanonicalPaths: SandboxApprovalPathTarget[];
  policyRuleId: string;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  recipeId: string | null;
  executableId: string | null;
  persistence: "temporary" | "persistent";
  requiresNetwork: boolean;
  externalSideEffect: boolean;
  modelSummary: string | null;
  source: SandboxApprovalProposalSource;
  status: SandboxApprovalProposalStatus;
  decisionReason: string | null;
  payloadHash: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  decidedAtMs: number | null;
  expiresAtIso: string;
  envelopeJson: string | null;
};

export function newSandboxApprovalProposalId(): string {
  return randomBytes(18).toString("base64url");
}

export function newSandboxApprovalNonce(): string {
  return randomBytes(24).toString("base64url");
}

const KNOWN_RISK_CLASSES: readonly SandboxRiskClass[] = [
  "low",
  "medium",
  "high",
  "consultation",
];

const KNOWN_INTENTS: readonly SandboxPathIntent[] = ["read", "write", "delete"];

/**
 * The exact structured authority payload the owner approval binds. Mirrors
 * the broker-side `OwnerApprovalAuthorityPayload` field-for-field; the
 * payload hash covers the canonical JSON of this object.
 */
export function approvalAuthorityPayloadOf(
  proposal: Pick<
    SandboxApprovalProposal,
    | "proposalId"
    | "ownerId"
    | "sessionUuid"
    | "capabilityId"
    | "authoritativeRiskClass"
    | "affectedCanonicalPaths"
    | "policyRuleId"
    | "policyId"
    | "policyVersion"
    | "policyHash"
    | "recipeId"
    | "executableId"
    | "persistence"
    | "requiresNetwork"
    | "externalSideEffect"
  >,
): OwnerApprovalAuthorityPayload {
  if (!proposal.sessionUuid) {
    throw new Error("approval_session_unbound");
  }
  return {
    proposalId: proposal.proposalId,
    ownerId: proposal.ownerId,
    sessionUuid: proposal.sessionUuid,
    capabilityId: proposal.capabilityId,
    authoritativeRiskClass: proposal.authoritativeRiskClass,
    canonicalTargetPaths: proposal.affectedCanonicalPaths.map((target) => ({
      path: target.path,
      intent: target.intent,
    })),
    policyRuleId: proposal.policyRuleId,
    policyId: proposal.policyId,
    policyVersion: proposal.policyVersion,
    policyHash: proposal.policyHash,
    recipeId: proposal.recipeId,
    executableId: proposal.executableId,
    persistence: proposal.persistence,
    requiresNetwork: proposal.requiresNetwork,
    externalSideEffect: proposal.externalSideEffect,
  };
}

export type CreateSandboxApprovalProposalInput = {
  ownerId: string;
  taskId?: string | null;
  sessionUuid?: string | null;
  capabilityId: SandboxCapabilityId;
  authoritativeRiskClass: SandboxRiskClass;
  affectedCanonicalPaths: SandboxApprovalPathTarget[];
  policyRuleId: string;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  recipeId?: string | null;
  executableId?: string | null;
  persistence?: "temporary" | "persistent";
  requiresNetwork?: boolean;
  externalSideEffect?: boolean;
  modelSummary?: string | null;
  source?: SandboxApprovalProposalSource;
  nowMs?: number;
};

export type CreateSandboxApprovalProposalResult =
  | { ok: true; value: SandboxApprovalProposal }
  | { ok: false; errorCode: string; reason: string };

/**
 * Creates a pending proposal. Fails closed on unbounded or inconsistent
 * input: unknown risk classes or path intents, an empty path list, more than
 * the bound of affected paths, oversized model summaries, or any proposal
 * that claims network access in a policy where only "none" is possible.
 */
export function createSandboxApprovalProposal(
  input: CreateSandboxApprovalProposalInput,
): CreateSandboxApprovalProposalResult {
  const nowMs =
    Number.isFinite(input.nowMs) && input.nowMs !== undefined ? input.nowMs : Date.now();
  const capabilityId = String(input.capabilityId ?? "").trim() as SandboxCapabilityId;
  if (!capabilityId) {
    return { ok: false, errorCode: "approval_capability_missing", reason: "capability id is required" };
  }
  if (!KNOWN_RISK_CLASSES.includes(input.authoritativeRiskClass)) {
    return {
      ok: false,
      errorCode: "approval_invalid_risk_class",
      reason: `unsupported risk class: ${String(input.authoritativeRiskClass)}`,
    };
  }
  const paths = Array.isArray(input.affectedCanonicalPaths)
    ? input.affectedCanonicalPaths.filter((target) => String(target?.path ?? "").length > 0)
    : [];
  if (paths.length === 0) {
    return { ok: false, errorCode: "approval_no_target_paths", reason: "at least one canonical target path is required" };
  }
  if (paths.length > SANDBOX_APPROVAL_MAX_AFFECTED_PATHS) {
    return {
      ok: false,
      errorCode: "approval_too_many_target_paths",
      reason: `at most ${SANDBOX_APPROVAL_MAX_AFFECTED_PATHS} affected paths are allowed`,
    };
  }
  for (const target of paths) {
    if (!KNOWN_INTENTS.includes(target.intent)) {
      return {
        ok: false,
        errorCode: "approval_invalid_path_intent",
        reason: `unsupported path intent: ${String(target.intent)}`,
      };
    }
  }
  const persistence = input.persistence ?? "temporary";
  if (persistence !== "temporary" && persistence !== "persistent") {
    return { ok: false, errorCode: "approval_invalid_persistence", reason: "persistence must be temporary or persistent" };
  }
  if (input.requiresNetwork === true) {
    return {
      ok: false,
      errorCode: "approval_network_mode_unsupported",
      reason: "sandbox policy networkMode is none; owner approvals cannot require network",
    };
  }
  const modelSummary =
    typeof input.modelSummary === "string" && input.modelSummary.length > 0
      ? input.modelSummary.slice(0, SANDBOX_APPROVAL_MAX_MODEL_SUMMARY_CHARS)
      : null;
  const policyRuleId = String(input.policyRuleId ?? "").trim();
  const policyId = String(input.policyId ?? "").trim();
  const policyHash = String(input.policyHash ?? "").trim();
  if (!policyRuleId || !policyId || !policyHash || !Number.isInteger(input.policyVersion)) {
    return {
      ok: false,
      errorCode: "approval_policy_unbound",
      reason: "proposal must bind the active policy rule, id, version and hash",
    };
  }
  const createdAtIso = new Date(nowMs).toISOString();
  return {
    ok: true,
    value: {
      id: 0,
      entityUuid: "",
      ownerId: String(input.ownerId ?? "").trim(),
      proposalId: newSandboxApprovalProposalId(),
      taskId: input.taskId ?? null,
      sessionUuid: input.sessionUuid ?? null,
      capabilityId,
      authoritativeRiskClass: input.authoritativeRiskClass,
      affectedCanonicalPaths: paths.map((target) => ({ path: target.path, intent: target.intent })),
      policyRuleId,
      policyId,
      policyVersion: Number(input.policyVersion),
      policyHash,
      recipeId: input.recipeId ?? null,
      executableId: input.executableId ?? null,
      persistence,
      requiresNetwork: Boolean(input.requiresNetwork),
      externalSideEffect: input.externalSideEffect === true,
      modelSummary,
      source: input.source ?? "policy_precheck",
      status: "pending",
      decisionReason: null,
      payloadHash: null,
      createdAtIso,
      updatedAtIso: createdAtIso,
      decidedAtMs: null,
      expiresAtIso: new Date(nowMs + SANDBOX_APPROVAL_PROPOSAL_TTL_MS).toISOString(),
      envelopeJson: null,
    },
  };
}

export function isSandboxApprovalExpired(
  proposal: Pick<SandboxApprovalProposal, "status" | "expiresAtIso">,
  nowMs: number,
): boolean {
  if (proposal.status !== "pending" && proposal.status !== "approved") return false;
  const expiresAtMs = Date.parse(proposal.expiresAtIso);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

export function canApproveSandboxApproval(
  proposal: Pick<SandboxApprovalProposal, "status">,
): boolean {
  return proposal.status === "pending";
}

export function canRejectSandboxApproval(
  proposal: Pick<SandboxApprovalProposal, "status">,
): boolean {
  return proposal.status === "pending";
}

export function canWithdrawSandboxApproval(
  proposal: Pick<SandboxApprovalProposal, "status">,
): boolean {
  return proposal.status === "pending" || proposal.status === "approved";
}

export function canStaleSandboxApproval(
  proposal: Pick<SandboxApprovalProposal, "status">,
): boolean {
  return proposal.status === "pending" || proposal.status === "approved";
}

export function canResumeSandboxApproval(
  proposal: Pick<
    SandboxApprovalProposal,
    "status" | "sessionUuid" | "expiresAtIso"
  >,
  nowMs: number,
): boolean {
  if (proposal.status !== "approved") return false;
  if (!proposal.sessionUuid) return false;
  return !isSandboxApprovalExpired(proposal, nowMs);
}
