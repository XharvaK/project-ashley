import { canonicalJson } from "../crypto/canonical-json.js";
import { sha256Hex } from "../crypto/types.js";

export const EVALUATOR_BUILD_ID = "external-evaluator-v1";

export interface PolicyEvaluationResult {
  decision: "allow" | "deny";
  reason?: string;
}

const HARD_DENY_ACTIONS = new Set(["password_change", "account_delete"]);

export function evaluatePolicyDecisionToken(
  token: Record<string, unknown>,
): PolicyEvaluationResult {
  const actionKind = String(token.actionKind ?? "");
  if (HARD_DENY_ACTIONS.has(actionKind)) {
    return { decision: "deny", reason: "hard_deny_lifecycle" };
  }
  const deniedActions = token.deniedActions;
  if (Array.isArray(deniedActions)) {
    for (const item of deniedActions) {
      if (HARD_DENY_ACTIONS.has(String(item))) {
        return { decision: "deny", reason: "hard_deny_lifecycle" };
      }
    }
  }
  const capabilityReleaseState = String(token.capabilityReleaseState ?? "observe");
  if (capabilityReleaseState !== "active") {
    return { decision: "deny", reason: "capability_not_active" };
  }
  const explicitDeny = token.explicitDeny;
  if (explicitDeny === true) {
    return { decision: "deny", reason: String(token.denyReason ?? "policy_denied") };
  }
  return { decision: "allow" };
}

export function hashPolicyDecisionToken(token: Record<string, unknown>): string {
  return sha256Hex(canonicalJson(token));
}

export function verifyPolicyDecisionHash(
  token: Record<string, unknown>,
  expectedHash: string,
): boolean {
  return hashPolicyDecisionToken(token) === expectedHash;
}
