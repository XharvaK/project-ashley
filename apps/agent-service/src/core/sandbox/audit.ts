/**
 * Sandbox precheck audit record: typed, redacted, sink-injected.
 *
 * The audit record is advisory only (preliminary decision), redacts
 * credential-shaped material before it leaves the module, and is delivered
 * through an injected sink so no database migration is required.
 */

import { type SandboxPathIntent } from "@composer-assistant/sandbox-policy";
import { redactSecretShapes } from "../privacy/redact-logs.js";

export type SandboxPrecheckPreliminaryDecision =
  | "proposal_invalid"
  | "denied"
  | "owner_approval_required"
  | "autonomous_safe";

export type SandboxPrecheckAudit = {
  kind: "sandbox_precheck";
  proposalId: string;
  ownerId: string;
  sessionUuid: string | null;
  requestedCapability: string;
  modelSuggestedRisk: string | null;
  authoritativeRiskClass: string;
  preliminaryDecision: SandboxPrecheckPreliminaryDecision;
  policyRuleId: string | null;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: string | null;
  recipeId: string | null;
  executableId: string | null;
  redactedPathClasses: string[];
  rationalePreview: string | null;
  reason: string | null;
  securityRelevant: boolean;
  createdAtIso: string;
};

export type AuditTarget = {
  canonicalPath: string;
  intent: SandboxPathIntent;
};

const REDACTED_PATH_PREVIEW_MAX = 300;
const RATIONALE_PREVIEW_MAX = 200;

export type SandboxPrecheckAuditInput = {
  proposalId: string;
  ownerId: string;
  sessionUuid: string | null;
  requestedCapability: string;
  modelSuggestedRisk: string | null;
  authoritativeRiskClass: string;
  preliminaryDecision: SandboxPrecheckPreliminaryDecision;
  policyRuleId: string | null;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: string | null;
  recipeId: string | null;
  executableId: string | null;
  targets: readonly AuditTarget[];
  rationale: string | null;
  reason: string | null;
  securityRelevant: boolean;
  nowIso: string;
};

export function buildSandboxPrecheckAudit(
  input: SandboxPrecheckAuditInput,
): SandboxPrecheckAudit {
  const redactedPathClasses = input.targets.map((target) => {
    const redacted = redactSecretShapes(target.canonicalPath);
    const preview =
      redacted.length > REDACTED_PATH_PREVIEW_MAX
        ? redacted.slice(0, REDACTED_PATH_PREVIEW_MAX)
        : redacted;
    return `${target.intent}:${preview}`;
  });
  let rationalePreview: string | null = null;
  if (input.rationale !== null) {
    const redacted = redactSecretShapes(input.rationale);
    rationalePreview =
      redacted.length > RATIONALE_PREVIEW_MAX
        ? redacted.slice(0, RATIONALE_PREVIEW_MAX)
        : redacted;
  }
  return {
    kind: "sandbox_precheck",
    proposalId: input.proposalId,
    ownerId: input.ownerId,
    sessionUuid: input.sessionUuid,
    requestedCapability: input.requestedCapability,
    modelSuggestedRisk: input.modelSuggestedRisk,
    authoritativeRiskClass: input.authoritativeRiskClass,
    preliminaryDecision: input.preliminaryDecision,
    policyRuleId: input.policyRuleId,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    policyHash: input.policyHash,
    recipeId: input.recipeId,
    executableId: input.executableId,
    redactedPathClasses,
    rationalePreview,
    reason: input.reason,
    securityRelevant: input.securityRelevant,
    createdAtIso: input.nowIso,
  };
}
