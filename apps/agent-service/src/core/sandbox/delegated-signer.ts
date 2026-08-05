/**
 * Delegated runtime signer (Sandbox Wave 4, Commit 4).
 *
 * Signs sandbox request envelopes on behalf of the delegated runtime, and
 * ONLY for requests the shared deterministic policy has judged
 * `autonomous_safe` with broker verification required. Every eligibility
 * claim is revalidated here from the trusted precheck result, the trusted
 * policy context and the validated proposal; the shared authorization
 * module is re-run so a forged or inconsistent precheck claim fails closed
 * before anything is signed. The signer never calls the broker, never
 * executes anything, never reads keys from disk, never falls back to the
 * owner key, and emits only a redacted, nonce-hashed audit record.
 */

import {
  DELEGATED_RUNTIME_KEY_ID,
  REQUIRED_NETWORK_MODE,
  randomNonce,
  sha256Hex,
  signDelegatedApprovalEnvelope,
  type DelegatedApprovalEnvelope,
  type DelegatedSandboxTarget,
} from "@composer-assistant/sandbox-broker";
import {
  authorizeSandboxOperation,
} from "@composer-assistant/sandbox-policy";
import { redactSecretShapes } from "../privacy/redact-logs.js";
import type { SandboxPrecheckResult } from "./precheck.js";
import {
  computePolicyHash,
  type SandboxPolicyTrustedContext,
} from "./policy-context.js";
import type { SandboxActionProposal } from "./proposal-types.js";
import {
  validateDelegatedRuntimeKeyMaterial,
  type DelegatedRuntimeKeyMaterial,
} from "./delegated-key-custody.js";

/** Default envelope lifetime when no expiry is supplied. */
export const DELEGATED_SIGNING_DEFAULT_TTL_MS = 60_000;

/** Upper bound on any signed envelope lifetime. */
export const MAX_DELEGATED_SIGNING_TTL_MS = 300_000;

export type DelegatedSigningErrorCode =
  | "precheck_not_autonomous"
  | "precheck_invalid"
  | "policy_identity_mismatch"
  | "capability_not_delegated_safe"
  | "unsupported_network_mode"
  | "invalid_expiry"
  | "key_unavailable"
  | "key_invalid"
  | "signing_failed";

export type DelegatedSigningAudit = {
  kind: "delegated_signing";
  outcome: "signed" | "refused";
  error: DelegatedSigningErrorCode | null;
  proposalId: string;
  ownerId: string;
  sessionUuid: string | null;
  capabilityId: string;
  authoritativeRiskClass: string;
  policyRuleId: string;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  signerKeyId: string;
  signerClass: "delegated_runtime";
  publicKeyFingerprint: string | null;
  expiryMs: number | null;
  nonceHash: string | null;
  networkMode: string;
  persistence: string;
  externalSideEffect: boolean;
  canonicalTargetPaths: string[];
  reason: string | null;
  createdAtIso: string;
};

export type DelegatedSigningInput = {
  proposal: SandboxActionProposal;
  precheck: SandboxPrecheckResult;
  context: SandboxPolicyTrustedContext;
  key: DelegatedRuntimeKeyMaterial | null;
  nowMs: number;
  expiresAt?: number;
  nonce?: string;
  networkMode?: string;
  auditSink?: (record: DelegatedSigningAudit) => void;
};

export type DelegatedSigningResult =
  | {
      ok: true;
      envelope: DelegatedApprovalEnvelope;
      fingerprint: string;
      issuedAt: number;
      expiresAt: number;
      audit: DelegatedSigningAudit;
    }
  | {
      ok: false;
      error: DelegatedSigningErrorCode;
      reason: string;
      audit: DelegatedSigningAudit;
    };

function safeIso(nowMs: number): string {
  return Number.isFinite(nowMs)
    ? new Date(nowMs).toISOString()
    : "1970-01-01T00:00:00.000Z";
}

export function signDelegatedSandboxEnvelope(
  input: DelegatedSigningInput,
): DelegatedSigningResult {
  const nowIso = safeIso(input.nowMs);
  const precheckAudit = input.precheck.audit;
  const precheckOf = (field: "authoritativeRiskClass" | "policyRuleId" | "policyId" | "policyVersion" | "policyHash"): unknown =>
    (input.precheck as { [key: string]: unknown })[field] ?? null;

  const emitAudit = (
    outcome: "signed" | "refused",
    error: DelegatedSigningErrorCode | null,
    reason: string | null,
    resolvedTargets: DelegatedSandboxTarget[],
    fingerprint: string | null,
    expiryMs: number | null,
    nonceHash: string | null,
  ): DelegatedSigningAudit => {
    const record: DelegatedSigningAudit = {
      kind: "delegated_signing",
      outcome,
      error,
      proposalId: precheckAudit.proposalId,
      ownerId: precheckAudit.ownerId,
      sessionUuid: precheckAudit.sessionUuid,
      capabilityId: precheckAudit.requestedCapability,
      authoritativeRiskClass: String(precheckOf("authoritativeRiskClass") ?? ""),
      policyRuleId: String(precheckOf("policyRuleId") ?? ""),
      policyId: String(precheckOf("policyId") ?? ""),
      policyVersion: Number(precheckOf("policyVersion") ?? 0),
      policyHash: String(precheckOf("policyHash") ?? ""),
      signerKeyId: DELEGATED_RUNTIME_KEY_ID,
      signerClass: "delegated_runtime",
      publicKeyFingerprint: fingerprint,
      expiryMs,
      nonceHash,
      networkMode: input.networkMode ?? REQUIRED_NETWORK_MODE,
      persistence: input.proposal.persistence,
      externalSideEffect: input.proposal.externalSideEffect,
      canonicalTargetPaths: resolvedTargets.map((target) =>
        redactSecretShapes(`${target.intent}:${target.path}`),
      ),
      reason,
      createdAtIso: nowIso,
    };
    input.auditSink?.(record);
    return record;
  };

  const fail = (
    error: DelegatedSigningErrorCode,
    reason: string,
    resolvedTargets: DelegatedSandboxTarget[] = [],
  ): DelegatedSigningResult => {
    const audit = emitAudit(
      "refused",
      error,
      reason,
      resolvedTargets,
      null,
      null,
      null,
    );
    return { ok: false, error, reason, audit };
  };

  if (input.precheck.ok !== true) {
    return fail("precheck_not_autonomous", "precheck_did_not_succeed");
  }
  if (input.precheck.preliminaryDecision !== "autonomous_safe") {
    return fail("precheck_not_autonomous", "precheck_not_autonomous_safe");
  }
  if (input.precheck.brokerVerificationRequired !== true) {
    return fail("precheck_invalid", "broker_verification_not_required");
  }
  if (
    typeof precheckAudit.proposalId !== "string" ||
    typeof precheckAudit.ownerId !== "string" ||
    typeof precheckAudit.requestedCapability !== "string"
  ) {
    return fail("precheck_invalid", "precheck_audit_malformed");
  }
  if (
    typeof input.precheck.policyRuleId !== "string" ||
    typeof input.precheck.policyId !== "string" ||
    typeof input.precheck.policyVersion !== "number" ||
    typeof input.precheck.policyHash !== "string"
  ) {
    return fail("precheck_invalid", "precheck_policy_identity_malformed");
  }
  if (
    precheckAudit.sessionUuid !== null &&
    typeof precheckAudit.sessionUuid !== "string"
  ) {
    return fail("precheck_invalid", "precheck_session_malformed");
  }
  if (
    precheckAudit.recipeId !== null &&
    typeof precheckAudit.recipeId !== "string"
  ) {
    return fail("precheck_invalid", "precheck_recipe_malformed");
  }
  if (
    precheckAudit.executableId !== null &&
    typeof precheckAudit.executableId !== "string"
  ) {
    return fail("precheck_invalid", "precheck_executable_malformed");
  }

  const proposal = input.proposal;
  if (proposal.proposalId !== precheckAudit.proposalId) {
    return fail("precheck_invalid", "proposal_id_mismatch");
  }
  if (proposal.ownerId !== precheckAudit.ownerId) {
    return fail("precheck_invalid", "owner_id_mismatch");
  }
  if (input.context.ownerId !== proposal.ownerId) {
    return fail("precheck_invalid", "owner_id_context_mismatch");
  }
  if ((proposal.sessionUuid ?? null) !== precheckAudit.sessionUuid) {
    return fail("precheck_invalid", "session_uuid_mismatch");
  }
  if (
    proposal.requestedCapability !== precheckAudit.requestedCapability ||
    proposal.requestedCapability !== input.precheck.capabilityId
  ) {
    return fail("precheck_invalid", "capability_mismatch");
  }
  if ((proposal.recipeId ?? null) !== precheckAudit.recipeId) {
    return fail("precheck_invalid", "recipe_id_mismatch");
  }
  if ((proposal.executableId ?? null) !== precheckAudit.executableId) {
    return fail("precheck_invalid", "executable_id_mismatch");
  }

  const policy = input.context.policy;
  if (policy === null || input.context.policyHash === null) {
    return fail("policy_identity_mismatch", "no_trusted_policy");
  }
  const computedHash = computePolicyHash(policy);
  if (computedHash === null || computedHash !== input.context.policyHash) {
    return fail("policy_identity_mismatch", "policy_hash_mismatch");
  }
  if (input.context.policyHash !== input.precheck.policyHash) {
    return fail("policy_identity_mismatch", "precheck_policy_hash_mismatch");
  }
  if (policy.policyId !== input.precheck.policyId) {
    return fail("policy_identity_mismatch", "precheck_policy_id_mismatch");
  }
  if (policy.policyVersion !== input.precheck.policyVersion) {
    return fail("policy_identity_mismatch", "precheck_policy_version_mismatch");
  }

  if (!Number.isFinite(input.nowMs)) {
    return fail("invalid_expiry", "invalid_clock");
  }
  if (proposal.requiresNetwork === true) {
    return fail("capability_not_delegated_safe", "network_required_not_delegated_safe");
  }
  if (proposal.externalSideEffect === true) {
    return fail("capability_not_delegated_safe", "external_side_effect_not_delegated_safe");
  }
  const persistent = proposal.persistence === "persistent";
  if (persistent) {
    return fail("capability_not_delegated_safe", "persistence_not_temporary");
  }
  const networkMode = input.networkMode ?? REQUIRED_NETWORK_MODE;
  if (networkMode !== REQUIRED_NETWORK_MODE) {
    return fail("unsupported_network_mode", "network_mode_not_none");
  }

  const resolvedTargets: DelegatedSandboxTarget[] = [];
  for (const target of proposal.targetPaths ?? []) {
    const fact = input.context.canonicalPathFacts.find(
      (entry) => entry.claimedPath === target.path,
    );
    if (fact === undefined) {
      return fail("precheck_invalid", "path_fact_missing_for_target", resolvedTargets);
    }
    resolvedTargets.push({ path: fact.canonicalPath, intent: target.intent });
  }

  const authorizeCalls: Array<{ intent: "read" | "write" | "delete"; targetPath: string }> =
    resolvedTargets.length > 0
      ? resolvedTargets.map((target) => ({
          intent: target.intent,
          targetPath: target.path,
        }))
      : [{ intent: "read", targetPath: "" }];
  for (const call of authorizeCalls) {
    const decision = authorizeSandboxOperation({
      capabilityId: proposal.requestedCapability,
      policy,
      signer: { class: "delegated", keyId: DELEGATED_RUNTIME_KEY_ID },
      intent: call.targetPath === "" ? undefined : call.intent,
      targetPath: call.targetPath === "" ? undefined : call.targetPath,
      recipeId: proposal.recipeId,
      executableId: proposal.executableId,
      networkRequired: proposal.requiresNetwork,
      externalSideEffects: proposal.externalSideEffect,
      persistence: persistent,
      modelRiskLabel: proposal.modelSuggestedRisk,
      nowIso,
    });
    if (decision.decision !== "autonomous_safe") {
      return fail(
        "capability_not_delegated_safe",
        `shared_policy_recheck_denied:${decision.policyRuleId}`,
        resolvedTargets,
      );
    }
  }

  const expiresAt = input.expiresAt ?? input.nowMs + DELEGATED_SIGNING_DEFAULT_TTL_MS;
  if (!Number.isFinite(expiresAt) || expiresAt <= input.nowMs) {
    return fail("invalid_expiry", "expiry_in_past_or_absent", resolvedTargets);
  }
  if (expiresAt - input.nowMs > MAX_DELEGATED_SIGNING_TTL_MS) {
    return fail("invalid_expiry", "expiry_exceeds_max_ttl", resolvedTargets);
  }

  if (input.key === null) {
    return fail("key_unavailable", "delegated_runtime_key_unavailable", resolvedTargets);
  }
  const keyCheck = validateDelegatedRuntimeKeyMaterial(input.key);
  if (!keyCheck.ok) {
    return fail("key_invalid", keyCheck.reason, resolvedTargets);
  }

  const nonce = input.nonce ?? randomNonce();
  const payload: Omit<DelegatedApprovalEnvelope, "signature"> = {
    protocolVersion: 1,
    keyId: DELEGATED_RUNTIME_KEY_ID,
    signerClass: "delegated_runtime",
    proposalId: proposal.proposalId,
    ownerId: proposal.ownerId,
    ...(proposal.sessionUuid !== undefined ? { sessionUuid: proposal.sessionUuid } : {}),
    capabilityId: proposal.requestedCapability,
    authoritativeRiskClass: input.precheck.authoritativeRiskClass,
    canonicalTargetPaths: resolvedTargets,
    policyRuleId: input.precheck.policyRuleId,
    policyId: input.precheck.policyId,
    policyVersion: input.precheck.policyVersion,
    policyHash: input.precheck.policyHash,
    ...(proposal.recipeId !== undefined ? { recipeId: proposal.recipeId } : {}),
    ...(proposal.executableId !== undefined ? { executableId: proposal.executableId } : {}),
    ...(proposal.argv !== undefined ? { argv: [...proposal.argv] } : {}),
    ...(proposal.cwd !== undefined ? { cwd: proposal.cwd } : {}),
    networkMode: networkMode as "none",
    persistence: proposal.persistence,
    externalSideEffect: proposal.externalSideEffect,
    issuedAt: input.nowMs,
    expiresAt,
    nonce,
  };
  let envelope: DelegatedApprovalEnvelope;
  try {
    envelope = signDelegatedApprovalEnvelope(payload, input.key.privateKeyPem);
  } catch {
    return fail("signing_failed", "envelope_signing_failed", resolvedTargets);
  }

  const audit = emitAudit(
    "signed",
    null,
    null,
    resolvedTargets,
    keyCheck.fingerprint,
    expiresAt,
    sha256Hex(nonce),
  );
  return {
    ok: true,
    envelope,
    fingerprint: keyCheck.fingerprint,
    issuedAt: input.nowMs,
    expiresAt,
    audit,
  };
}
