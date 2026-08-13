/**
 * Broker-final delegated sandbox authorization (Sandbox Wave 4, Commit 5).
 *
 * The broker is the authoritative sandbox authorization boundary for
 * delegated requests. This module verifies the delegated envelope, verifies
 * the delegated signer identity, consumes an already verified active
 * owner-signed policy, reconstructs authoritative policy input from trusted
 * broker facts, recomputes capability/path/risk/authorization with the
 * shared deterministic module, and returns a typed authorization result.
 *
 * Trust boundaries
 * ----------------
 * The signed envelope protects integrity, not authority. Every security
 * claim inside it is re-derived or re-validated here:
 *
 * - The envelope's capability label is reclassified by the shared policy
 *   module; an unregistered label yields `capability_mismatch` plus denial.
 * - The envelope's `authoritativeRiskClass` is advisory only (it may raise
 *   the broker result, never lower it).
 * - The envelope's `canonicalTargetPaths` are claims; the broker resolves
 *   each target through an injected path-fact resolver and fails closed when
 *   a fact is unavailable or differs from the claim.
 * - The envelope's `policyRuleId` is audit metadata only; the broker records
 *   its own matched rule ID.
 *
 * No active policy, no trusted key, no policy identity match, no nonce
 * reservation, no canonical path fact, and no permitted operation is
 * assumed: every one of those failures is typed and fail-closed. The owner
 * key can never enter the delegated slot, and an unknown key fails closed.
 *
 * Nonce ordering (following the repository's replay contract)
 * -----------------------------------------------------------
 * parse -> schema validation -> key lookup -> signature verification ->
 * expiry validation -> active-policy identity validation -> nonce replay
 * check/reservation -> broker policy recomputation -> authorization result.
 *
 * The `reserveNonce` seam maps to the same global store used by owner
 * approvals (BrokerStore.spentNonces), so a nonce can never be replayed
 * across owner and delegated signer classes. Invalid signatures never
 * consume a nonce; once a nonce is accepted, the signed request is spent
 * even when authorization refuses it, so a denied request cannot be replayed
 * later.
 *
 * No execution happens here: no process, no file writes, no providers, no
 * routes, no sessions. The path-fact resolver is an injection seam; when a
 * canonical `rootConfig` is provided the broker's own realpath resolver is
 * used, otherwise the default resolver fails closed until production
 * realpath wiring is introduced in a later commit.
 */

import type { KeyObject } from "node:crypto";
import {
  DELEGATED_RUNTIME_KEY_ID,
  verifyDelegatedApprovalEnvelope,
  type DelegatedApprovalEnvelope,
  type DelegatedSandboxTarget,
} from "../crypto/delegated-approval.js";
import {
  computeOwnerApprovalPayloadHash,
  OWNER_APPROVAL_SIGNER_CLASS,
  verifyOwnerApprovalEnvelope,
  type OwnerApprovalVerifierConfig,
  type SandboxOwnerApprovalEnvelope,
} from "../crypto/owner-approval.js";
import { CAPABILITY_SIGNING_KEY_ID } from "../sessions/session-limits.js";
import { sha256Hex } from "../crypto/types.js";
import {
  MAX_CHILD_PROCESSES,
  MAX_OUTPUT_BYTES,
  MAX_WALL_MS,
  MAX_WORKSPACE_BYTES,
} from "../constants/limits.js";
import { createBrokerPathFactResolver } from "./path.js";
import type { BrokerRootConfig } from "./root-config.js";
import {
  authorizeSandboxOperation,
  canonicalizeSandboxPolicyPayload,
  capabilitySpec,
  classifyProtectedPath,
  isCanonicalForm,
  maxRisk,
  SANDBOX_RISK_ORDER,
  toProtectedRootsConfig,
  validateSandboxPolicyDocument,
  type ProtectedPathClass,
  type ResourceCeilings,
  type SandboxAuthorizationDecision,
  type SandboxCapabilityId,
  type SandboxPathIntent,
  type SandboxPolicyDocument,
  type SandboxRiskClass,
} from "@composer-assistant/sandbox-policy";

const SHARED_RULE_PREFIX = "sandbox-policy/rule/";
const SECRETISH =
  /\b(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{8,}|Bearer\s+eyJ[A-Za-z0-9._-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;

/** Fixed delegated signer profile. Only this profile enters the delegated path. */
export type BrokerSignerProfile =
  | {
      signerClass: "owner";
      keyId: string;
    }
  | {
      signerClass: "delegated_runtime";
      keyId: "delegated-runtime-ed25519-v1";
      allowedPolicyId: string;
      allowedPolicyVersion: number;
      allowedPolicyHash: string;
    };

/**
 * An already verified owner-signed policy. The broker never loads or accepts
 * unsigned policy content from a request; this state is injected by the
 * caller (future: the broker's verified active-policy holder).
 */
export type ActiveVerifiedSandboxPolicy = {
  policy: SandboxPolicyDocument;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  signerKeyId: string;
};

/** The trusted delegated public key slot. Separate from all owner key slots. */
export type DelegatedTrustedKeyConfig = {
  keyId: string;
  publicKey: KeyObject;
};

/**
 * Broker-owned canonical path facts. The resolver is the broker's own
 * path-resolution authority (realpath in production); it is injected so
 * tests stay deterministic. The envelope's path strings are claims and are
 * never used for authorization decisions.
 */
export type BrokerDelegatedPathFactResolver = (
  target: DelegatedSandboxTarget,
) => { ok: true; canonicalPath: string } | { ok: false; reason: string };

export type BrokerCanonicalPathFacts = {
  canonicalPath: string;
  intent: SandboxPathIntent;
  pathClass: ProtectedPathClass;
};

export type SandboxMetadataMismatch =
  | {
      code: "capability_mismatch";
      agentCapability: string;
      brokerCapability: string;
    }
  | {
      code: "risk_lower_than_authoritative";
      agentRisk: SandboxRiskClass;
      brokerRisk: SandboxRiskClass;
    }
  | {
      code: "rule_id_mismatch";
      agentRuleId: string;
      brokerRuleId: string;
    }
  | {
      code: "path_mismatch";
      claimedPath: string;
      canonicalPath: string;
    };

export type EffectiveSandboxLimits = {
  wallMsMax: number;
  maxProcesses: number;
  maxOutputBytes: number;
  workspaceBytesMax: number;
};

export type BrokerDelegatedAuthorizationAudit = {
  kind: "broker_delegated_authorization";
  outcome: "authorized" | "refused";
  decision: "autonomous_safe" | "owner_approved" | "owner_approval_required" | "denied";
  errorCode: string | null;
  proposalId: string;
  ownerId: string;
  sessionUuid: string | null;
  signerClass: "delegated_runtime" | null;
  signerKeyId: string | null;
  publicKeyFingerprint: string | null;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: string | null;
  agentCapability: string;
  agentRiskClass: string;
  agentPolicyRuleId: string;
  brokerCapability: string | null;
  brokerRiskClass: SandboxRiskClass | null;
  brokerPolicyRuleId: string | null;
  canonicalPathClasses: string[];
  effectiveLimits: EffectiveSandboxLimits | null;
  metadataMismatches: SandboxMetadataMismatch[];
  ownerApprovalProposalId: string | null;
  ownerApprovalKeyId: string | null;
  nonceHash: string;
  createdAtIso: string;
};

export type BrokerDelegatedAuthorizationInput = {
  envelope: DelegatedApprovalEnvelope;
  /** Injected trusted delegated public key; null means the key is not configured. */
  trustedDelegatedKey: DelegatedTrustedKeyConfig | null;
  /** Injected already-verified active policy; null means no active policy. */
  activePolicy: ActiveVerifiedSandboxPolicy | null;
  /** Trusted owner identity from broker configuration, never from the request. */
  trustedOwnerId: string;
  /** Trusted owner policy-signer key IDs the active policy may be signed by. */
  trustedOwnerPolicyKeyIds: ReadonlySet<string>;
  /** Replay-protection seam (global BrokerStore nonce domain). */
  reserveNonce: (nonce: string) => boolean;
  nowMs: number;
  pathFactResolver?: BrokerDelegatedPathFactResolver;
  /**
   * Broker canonical root configuration. When set (and no explicit
   * `pathFactResolver` is injected), facts are derived by the broker's own
   * realpath resolver instead of the envelope's path claims.
   */
  rootConfig?: BrokerRootConfig;
  auditSink?: (record: BrokerDelegatedAuthorizationAudit) => void;
  /**
   * Owner-signed sandbox approval (Commit 11). When present and the shared
   * policy decides `owner_approval_required`, the broker verifies this
   * envelope against the trusted owner key config and binds it exactly to the
   * request's structured authority fields before authorizing.
   */
  ownerApproval?: SandboxOwnerApprovalEnvelope | null;
  /**
   * Trusted owner approval keys. Null means owner approval verification is
   * not configured; an `owner_approval_required` decision then fails closed.
   */
  trustedOwnerApprovalKeys?: OwnerApprovalVerifierConfig | null;
};

export type BrokerDelegatedAuthorizationResult =
  | {
      ok: true;
      decision: "autonomous_safe" | "owner_approved";
      signerClass: "delegated_runtime";
      signerKeyId: string;
      publicKeyFingerprint: string;
      capability: SandboxCapabilityId;
      authoritativeRiskClass: SandboxRiskClass;
      policyRuleId: string;
      policyId: string;
      policyVersion: number;
      policyHash: string;
      canonicalPaths: BrokerCanonicalPathFacts[];
      effectiveLimits: EffectiveSandboxLimits;
      metadataMismatches: SandboxMetadataMismatch[];
      ownerApprovalProposalId?: string;
      audit: BrokerDelegatedAuthorizationAudit;
    }
  | {
      ok: false;
      decision: "owner_approval_required" | "denied";
      errorCode: string;
      reason: string;
      signerClass: "delegated_runtime" | null;
      signerKeyId: string | null;
      publicKeyFingerprint: string | null;
      authoritativeRiskClass?: SandboxRiskClass;
      policyRuleId?: string;
      metadataMismatches?: SandboxMetadataMismatch[];
      audit: BrokerDelegatedAuthorizationAudit;
    };

const RISK_CLASSES: ReadonlySet<string> = new Set([
  "low",
  "medium",
  "high",
  "consultation",
]);
const INTENTS: ReadonlySet<string> = new Set(["read", "write", "delete"]);

const ENVELOPE_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "protocolVersion",
  "keyId",
  "signerClass",
  "proposalId",
  "ownerId",
  "sessionUuid",
  "capabilityId",
  "authoritativeRiskClass",
  "canonicalTargetPaths",
  "policyRuleId",
  "policyId",
  "policyVersion",
  "policyHash",
  "recipeId",
  "executableId",
  "argv",
  "cwd",
  "networkMode",
  "persistence",
  "externalSideEffect",
  "issuedAt",
  "expiresAt",
  "nonce",
  "effectHash",
  "signature",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(
  value: unknown,
  max: number,
  min = 1,
): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

/** Scrub credential-shaped substrings from audit output. Never echo raw secrets. */
export function redactSecretShapes(text: string): string {
  return text.replace(SECRETISH, "[redacted-credential]");
}

const DEFAULT_PATH_FACT_RESOLVER: BrokerDelegatedPathFactResolver = () => ({
  ok: false,
  reason: "path_fact_unavailable",
});

function ruleErrorCode(decision: SandboxAuthorizationDecision): string {
  return decision.policyRuleId.startsWith(SHARED_RULE_PREFIX)
    ? decision.policyRuleId.slice(SHARED_RULE_PREFIX.length)
    : "policy_denied";
}

/** Strictest combination: broker hard maximum, then active policy ceiling. */
export function combineEffectiveLimits(
  ceilings: ResourceCeilings,
): EffectiveSandboxLimits {
  return {
    wallMsMax: Math.min(MAX_WALL_MS, ceilings.wallMsMax),
    maxProcesses: Math.min(MAX_CHILD_PROCESSES, ceilings.maxProcesses),
    maxOutputBytes: Math.min(MAX_OUTPUT_BYTES, ceilings.maxOutputBytes),
    workspaceBytesMax: Math.min(MAX_WORKSPACE_BYTES, ceilings.workspaceBytesMax),
  };
}

/**
 * Exact structured binding between an owner approval and the delegated
 * request: same canonical target paths, same order, same intents. Any
 * difference means the owner approved a different action than the one the
 * runtime is requesting.
 */
function targetsMatchOwnerApproval(
  requestTargets: DelegatedSandboxTarget[],
  ownerApproval: SandboxOwnerApprovalEnvelope,
): boolean {
  if (requestTargets.length !== ownerApproval.canonicalTargetPaths.length) {
    return false;
  }
  for (let index = 0; index < requestTargets.length; index += 1) {
    const left = requestTargets[index];
    const right = ownerApproval.canonicalTargetPaths[index];
    if (left.path !== right.path || left.intent !== right.intent) {
      return false;
    }
  }
  return true;
}

function compareMetadata(
  envelope: DelegatedApprovalEnvelope,
  decision: SandboxAuthorizationDecision,
  brokerCapability: string,
): SandboxMetadataMismatch[] {  const mismatches: SandboxMetadataMismatch[] = [];
  if (
    SANDBOX_RISK_ORDER[envelope.authoritativeRiskClass] <
    SANDBOX_RISK_ORDER[decision.authoritativeRiskClass]
  ) {
    mismatches.push({
      code: "risk_lower_than_authoritative",
      agentRisk: envelope.authoritativeRiskClass,
      brokerRisk: decision.authoritativeRiskClass,
    });
  }
  if (envelope.policyRuleId !== decision.policyRuleId) {
    mismatches.push({
      code: "rule_id_mismatch",
      agentRuleId: envelope.policyRuleId,
      brokerRuleId: decision.policyRuleId,
    });
  }
  if (envelope.capabilityId !== brokerCapability) {
    mismatches.push({
      code: "capability_mismatch",
      agentCapability: envelope.capabilityId,
      brokerCapability,
    });
  }
  return mismatches;
}

type AuditDraft = {
  proposalId: string;
  ownerId: string;
  sessionUuid: string | null;
  agentCapability: string;
  agentRiskClass: string;
  agentPolicyRuleId: string;
  nonceHash: string;
};

function bounded(value: unknown, max: number): string | null {
  return isBoundedString(value, max) ? value : null;
}

function extractAuditDraft(input: unknown): AuditDraft {
  const record = isRecord(input) ? input : {};
  const nonce = bounded(record.nonce, 128);
  return {
    proposalId: bounded(record.proposalId, 128) ?? "<invalid>",
    ownerId: bounded(record.ownerId, 128) ?? "<invalid>",
    sessionUuid:
      record.sessionUuid === undefined
        ? null
        : (bounded(record.sessionUuid, 64) ?? "<invalid>"),
    agentCapability: bounded(record.capabilityId, 128) ?? "<invalid>",
    agentRiskClass: bounded(record.authoritativeRiskClass, 32) ?? "<invalid>",
    agentPolicyRuleId: bounded(record.policyRuleId, 256) ?? "<invalid>",
    nonceHash: nonce === null ? "<invalid>" : sha256Hex(nonce),
  };
}

export type EnvelopeShapeResult =
  | { ok: true; envelope: DelegatedApprovalEnvelope }
  | { ok: false; reasons: string[] };

/**
 * Strict structural validation of an untrusted delegated envelope. Any
 * unsupported field (including attempts to smuggle limits or policies inside
 * the envelope) is rejected here before any key material is consulted.
 */
export function validateDelegatedEnvelopeShape(
  value: unknown,
): EnvelopeShapeResult {
  const reasons: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, reasons: ["envelope_not_an_object"] };
  }
  for (const key of Object.keys(value)) {
    if (!ENVELOPE_ALLOWED_KEYS.has(key)) {
      reasons.push(`unsupported_field:${key}`);
    }
  }
  if (value.protocolVersion !== 1) reasons.push("protocol_version_must_be_1");
  if (value.signerClass !== "delegated_runtime") {
    reasons.push("signer_class_must_be_delegated_runtime");
  }
  if (!isBoundedString(value.keyId, 128)) reasons.push("key_id_invalid");
  if (!isBoundedString(value.proposalId, 128)) reasons.push("proposal_id_invalid");
  if (!isBoundedString(value.ownerId, 128)) reasons.push("owner_id_invalid");
  if (value.sessionUuid !== undefined && !isBoundedString(value.sessionUuid, 64)) {
    reasons.push("session_uuid_invalid");
  }
  if (!isBoundedString(value.capabilityId, 128)) reasons.push("capability_id_invalid");
  if (!RISK_CLASSES.has(String(value.authoritativeRiskClass))) {
    reasons.push("authoritative_risk_class_invalid");
  }
  if (!isBoundedString(value.policyRuleId, 256)) reasons.push("policy_rule_id_invalid");
  if (!isBoundedString(value.policyId, 256)) reasons.push("policy_id_invalid");
  if (
    typeof value.policyVersion !== "number" ||
    !Number.isInteger(value.policyVersion) ||
    value.policyVersion < 1
  ) {
    reasons.push("policy_version_invalid");
  }
  if (
    typeof value.policyHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.policyHash)
  ) {
    reasons.push("policy_hash_invalid");
  }
  if (value.recipeId !== undefined && !isBoundedString(value.recipeId, 256)) {
    reasons.push("recipe_id_invalid");
  }
  if (value.executableId !== undefined && !isBoundedString(value.executableId, 256)) {
    reasons.push("executable_id_invalid");
  }
  if (value.cwd !== undefined && !isBoundedString(value.cwd, 1024)) {
    reasons.push("cwd_invalid");
  }
  if (value.argv !== undefined) {
    if (
      !Array.isArray(value.argv) ||
      value.argv.length > 16 ||
      !value.argv.every((entry) => isBoundedString(entry, 256))
    ) {
      reasons.push("argv_invalid");
    }
  }
  if (value.networkMode !== "none") reasons.push("network_mode_invalid");
  if (value.persistence !== "temporary" && value.persistence !== "persistent") {
    reasons.push("persistence_invalid");
  }
  if (typeof value.externalSideEffect !== "boolean") {
    reasons.push("external_side_effect_invalid");
  }
  if (typeof value.issuedAt !== "number" || !Number.isFinite(value.issuedAt)) {
    reasons.push("issued_at_invalid");
  }
  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) {
    reasons.push("expires_at_invalid");
  }
  if (!isBoundedString(value.nonce, 128)) reasons.push("nonce_invalid");
  if (value.effectHash !== undefined && !/^[0-9a-f]{64}$/.test(String(value.effectHash))) {
    reasons.push("effect_hash_invalid");
  }
  if (value.signature !== undefined && typeof value.signature !== "string") {
    reasons.push("signature_invalid");
  }
  if (
    !Array.isArray(value.canonicalTargetPaths) ||
    value.canonicalTargetPaths.length > 8
  ) {
    reasons.push("canonical_target_paths_invalid");
  } else {
    const seen = new Set<string>();
    for (const entry of value.canonicalTargetPaths) {
      if (
        !isRecord(entry) ||
        Object.keys(entry).length !== 2 ||
        !isBoundedString(entry.path, 4096) ||
        !INTENTS.has(String(entry.intent))
      ) {
        reasons.push("canonical_target_path_entry_invalid");
        continue;
      }
      if (seen.has(String(entry.path))) reasons.push("duplicate_target_path");
      seen.add(String(entry.path));
    }
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, envelope: value as unknown as DelegatedApprovalEnvelope };
}

/**
 * Broker-final delegated authorization entry point. Returns a typed
 * authorization result and never executes anything.
 */
export function authorizeDelegatedSandboxRequest(
  input: BrokerDelegatedAuthorizationInput,
): BrokerDelegatedAuthorizationResult {
  const draft = extractAuditDraft(input.envelope);
  const nowIso = Number.isFinite(input.nowMs)
    ? new Date(input.nowMs).toISOString()
    : "1970-01-01T00:00:00.000Z";
  const auditCtx: Partial<BrokerDelegatedAuthorizationAudit> & AuditDraft = {
    ...draft,
  };

  const emitAudit = (
    outcome: "authorized" | "refused",
    decision: "autonomous_safe" | "owner_approved" | "owner_approval_required" | "denied",
    errorCode: string | null,
  ): BrokerDelegatedAuthorizationAudit => {
    const record: BrokerDelegatedAuthorizationAudit = {
      kind: "broker_delegated_authorization",
      outcome,
      decision,
      errorCode,
      signerClass: null,
      signerKeyId: null,
      publicKeyFingerprint: null,
      policyId: null,
      policyVersion: null,
      policyHash: null,
      brokerCapability: null,
      brokerRiskClass: null,
      brokerPolicyRuleId: null,
      canonicalPathClasses: [],
      effectiveLimits: null,
      metadataMismatches: [],
      ownerApprovalProposalId: input.ownerApproval?.proposalId ?? null,
      ownerApprovalKeyId: input.ownerApproval?.keyId ?? null,
      createdAtIso: nowIso,
      ...auditCtx,
    };
    input.auditSink?.(record);
    return record;
  };

  const fail = (
    decision: "owner_approval_required" | "denied",
    errorCode: string,
    reason: string,
    opts: {
      authoritativeRiskClass?: SandboxRiskClass;
      policyRuleId?: string;
      metadataMismatches?: SandboxMetadataMismatch[];
    } = {},
  ): BrokerDelegatedAuthorizationResult => {
    const audit = emitAudit("refused", decision, errorCode);
    return {
      ok: false,
      decision,
      errorCode,
      reason,
      signerClass: audit.signerClass,
      signerKeyId: audit.signerKeyId,
      publicKeyFingerprint: audit.publicKeyFingerprint,
      ...(opts.authoritativeRiskClass !== undefined
        ? { authoritativeRiskClass: opts.authoritativeRiskClass }
        : {}),
      ...(opts.policyRuleId !== undefined ? { policyRuleId: opts.policyRuleId } : {}),
      ...(opts.metadataMismatches !== undefined
        ? { metadataMismatches: opts.metadataMismatches }
        : {}),
      audit,
    };
  };

  if (!Number.isFinite(input.nowMs)) {
    return fail("denied", "invalid_clock", "invalid_now_ms");
  }

  const shape = validateDelegatedEnvelopeShape(input.envelope);
  if (!shape.ok) {
    return fail("denied", "envelope_invalid", shape.reasons.join(","));
  }
  const envelope = shape.envelope;

  const key = input.trustedDelegatedKey;
  if (key === null) {
    return fail("denied", "unknown_key", "no_trusted_delegated_key_configured");
  }
  if (key.keyId !== DELEGATED_RUNTIME_KEY_ID) {
    return fail(
      "denied",
      "invalid_key_id",
      `expected_key_id_${DELEGATED_RUNTIME_KEY_ID}`,
    );
  }
  if (key.publicKey.asymmetricKeyType !== "ed25519") {
    return fail("denied", "key_not_ed25519", "delegated_key_algorithm_not_ed25519");
  }

  const verified = verifyDelegatedApprovalEnvelope(
    envelope,
    { keys: [key] },
    input.nowMs,
  );
  if (!verified.ok) {
    return fail("denied", verified.reason, "delegated_verification_failed");
  }

  const fingerprint = sha256Hex(
    key.publicKey.export({ type: "spki", format: "der" }),
  );
  auditCtx.signerClass = "delegated_runtime";
  auditCtx.signerKeyId = envelope.keyId;
  auditCtx.publicKeyFingerprint = fingerprint;

  if (envelope.ownerId !== input.trustedOwnerId) {
    return fail("denied", "owner_mismatch", "owner_identity_mismatch");
  }

  const activePolicy = input.activePolicy;
  if (activePolicy === null) {
    return fail("denied", "no_active_policy", "no_active_verified_policy");
  }
  const validatedPolicy = validateSandboxPolicyDocument(activePolicy.policy);
  if (!validatedPolicy.ok) {
    return fail(
      "denied",
      "active_policy_invalid",
      validatedPolicy.reasons.join(","),
    );
  }
  const policy = validatedPolicy.policy;
  if (
    policy.policyId !== activePolicy.policyId ||
    policy.policyVersion !== activePolicy.policyVersion
  ) {
    return fail(
      "denied",
      "active_policy_invalid",
      "active_policy_identity_mismatch",
    );
  }
  const canonical = canonicalizeSandboxPolicyPayload(policy);
  if (!canonical.ok) {
    return fail("denied", "active_policy_invalid", canonical.reasons.join(","));
  }
  const recomputedHash = sha256Hex(Buffer.from(canonical.payload, "utf8"));
  if (recomputedHash !== activePolicy.policyHash) {
    return fail("denied", "active_policy_hash_mismatch", "active_policy_hash_mismatch");
  }
  const issuedMs = Date.parse(policy.issuedAt);
  if (!Number.isFinite(issuedMs) || issuedMs > input.nowMs) {
    return fail("denied", "active_policy_not_yet_valid", "active_policy_not_yet_valid");
  }
  if (
    policy.expiresAt !== undefined &&
    (Number.isNaN(Date.parse(policy.expiresAt)) ||
      Date.parse(policy.expiresAt) <= input.nowMs)
  ) {
    return fail("denied", "active_policy_expired", "active_policy_expired");
  }
  if (!input.trustedOwnerPolicyKeyIds.has(activePolicy.signerKeyId)) {
    return fail(
      "denied",
      "policy_signer_not_trusted",
      `policy_signer_key_not_trusted:${activePolicy.signerKeyId}`,
    );
  }
  if (policy.networkMode !== "none") {
    return fail("denied", "policy_network_mode_not_none", "policy_network_mode_not_none");
  }
  if (!policy.allowedDelegatedSignerKeyIds.includes(DELEGATED_RUNTIME_KEY_ID)) {
    return fail(
      "denied",
      "delegated_signer_not_allowed_by_policy",
      "delegated_signer_not_listed_by_active_policy",
    );
  }

  const profile: BrokerSignerProfile = {
    signerClass: "delegated_runtime",
    keyId: DELEGATED_RUNTIME_KEY_ID,
    allowedPolicyId: activePolicy.policyId,
    allowedPolicyVersion: activePolicy.policyVersion,
    allowedPolicyHash: activePolicy.policyHash,
  };
  if (
    envelope.policyId !== profile.allowedPolicyId ||
    envelope.policyVersion !== profile.allowedPolicyVersion ||
    envelope.policyHash !== profile.allowedPolicyHash
  ) {
    return fail(
      "denied",
      "policy_identity_mismatch",
      "envelope_policy_identity_mismatch",
    );
  }
  auditCtx.policyId = activePolicy.policyId;
  auditCtx.policyVersion = activePolicy.policyVersion;
  auditCtx.policyHash = activePolicy.policyHash;

  if (!input.reserveNonce(envelope.nonce)) {
    return fail("denied", "replay", "nonce_replay");
  }

  const persistenceIsPersistent = envelope.persistence === "persistent";
  if (envelope.persistence !== "temporary") {
    return fail("denied", "persistence_not_temporary", "delegated_persistence_must_be_temporary");
  }

  const resolver =
    input.pathFactResolver ??
    (input.rootConfig !== undefined
      ? createBrokerPathFactResolver(input.rootConfig)
      : DEFAULT_PATH_FACT_RESOLVER);
  const facts: BrokerCanonicalPathFacts[] = [];
  const mismatches: SandboxMetadataMismatch[] = [];
  for (const target of envelope.canonicalTargetPaths) {
    const resolved = resolver(target);
    if (!resolved.ok) {
      return fail(
        "denied",
        "path_facts_unavailable",
        `path_fact_unavailable:${resolved.reason}`,
        { metadataMismatches: [...mismatches] },
      );
    }
    if (!isCanonicalForm(resolved.canonicalPath)) {
      return fail(
        "denied",
        "path_facts_unavailable",
        "path_fact_not_canonical",
        { metadataMismatches: [...mismatches] },
      );
    }
    if (resolved.canonicalPath !== target.path) {
      mismatches.push({
        code: "path_mismatch",
        claimedPath: redactSecretShapes(target.path),
        canonicalPath: redactSecretShapes(resolved.canonicalPath),
      });
      return fail(
        "denied",
        "path_facts_mismatch",
        "envelope_path_claim_mismatches_broker_facts",
        { metadataMismatches: [...mismatches] },
      );
    }
    const pathClass = classifyProtectedPath(
      toProtectedRootsConfig(policy.protectedRoots),
      resolved.canonicalPath,
    );
    facts.push({
      canonicalPath: resolved.canonicalPath,
      intent: target.intent,
      pathClass,
    });
  }
  const pathClassAudit = facts.map((fact) => {
    const visiblePath =
      fact.pathClass.class === "absolute_denial"
        ? "[redacted-secret-path]"
        : redactSecretShapes(fact.canonicalPath);
    return `${fact.intent}:${visiblePath}:${fact.pathClass.class}`;
  });
  auditCtx.canonicalPathClasses = pathClassAudit;

  const brokerCapability = capabilitySpec(envelope.capabilityId)
    ? envelope.capabilityId
    : "unknown";
  if (brokerCapability === "unknown") {
    mismatches.push({
      code: "capability_mismatch",
      agentCapability: envelope.capabilityId,
      brokerCapability: "unknown",
    });
  }

  const capability = capabilitySpec(envelope.capabilityId);
  if (capability !== undefined && capability.allowedIntents.length > 0) {
    for (const fact of facts) {
      if (!capability.allowedIntents.includes(fact.intent)) {
        return fail(
          "denied",
          "intent_mismatch",
          "path_intent_not_permitted_by_capability",
          { metadataMismatches: [...mismatches] },
        );
      }
    }
  }

  const calls: Array<{ intent: SandboxPathIntent; targetPath: string }> =
    facts.length > 0
      ? facts.map((fact) => ({
          intent: fact.intent,
          targetPath: fact.canonicalPath,
        }))
      : [{ intent: "read", targetPath: "" }];

  let brokerRisk: SandboxRiskClass = "low";
  let brokerRuleId = "";
  let sharedDecision: SandboxAuthorizationDecision | null = null;
  for (const call of calls) {
    const decision = authorizeSandboxOperation({
      capabilityId: envelope.capabilityId as SandboxCapabilityId,
      policy,
      signer: { class: "delegated", keyId: DELEGATED_RUNTIME_KEY_ID },
      intent: call.targetPath === "" ? undefined : call.intent,
      targetPath: call.targetPath === "" ? undefined : call.targetPath,
      recipeId: envelope.recipeId,
      executableId: envelope.executableId,
      externalSideEffects: envelope.externalSideEffect,
      persistence: persistenceIsPersistent,
      modelRiskLabel: envelope.authoritativeRiskClass,
      nowIso,
    });
    brokerRisk = maxRisk(brokerRisk, decision.authoritativeRiskClass);
    brokerRuleId = decision.policyRuleId;
    sharedDecision = decision;
    auditCtx.brokerCapability = brokerCapability;
    auditCtx.brokerRiskClass = brokerRisk;
    auditCtx.brokerPolicyRuleId = brokerRuleId;
    if (decision.decision === "denied") {
      const denialMismatches = [
        ...mismatches,
        ...compareMetadata(envelope, decision, brokerCapability),
      ];
      auditCtx.metadataMismatches = denialMismatches;
      return fail("denied", ruleErrorCode(decision), decision.reason, {
        authoritativeRiskClass: decision.authoritativeRiskClass,
        policyRuleId: decision.policyRuleId,
        metadataMismatches: denialMismatches,
      });
    }
    if (decision.decision === "owner_approval_required") {
      const approvalMismatches = [
        ...mismatches,
        ...compareMetadata(envelope, decision, brokerCapability),
      ];
      const ownerApproval = input.ownerApproval;
      const ownerKeys = input.trustedOwnerApprovalKeys;
      if (!ownerApproval) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail("owner_approval_required", ruleErrorCode(decision), decision.reason, {
          authoritativeRiskClass: decision.authoritativeRiskClass,
          policyRuleId: decision.policyRuleId,
          metadataMismatches: approvalMismatches,
        });
      }
      if (!ownerKeys || ownerKeys.keys.length === 0) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_unverifiable",
          "no_trusted_owner_approval_keys_configured",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      if (ownerApproval.signerClass !== OWNER_APPROVAL_SIGNER_CLASS) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_wrong_signer",
          "owner_approval_not_owner_signed",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      if (
        ownerApproval.keyId === DELEGATED_RUNTIME_KEY_ID ||
        ownerApproval.keyId === CAPABILITY_SIGNING_KEY_ID
      ) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_wrong_signer",
          "owner_approval_key_not_owner",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      const verifiedOwner = verifyOwnerApprovalEnvelope(ownerApproval, ownerKeys, input.nowMs);
      if (!verifiedOwner.ok) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_invalid",
          `owner_approval_verification_failed:${verifiedOwner.reason}`,
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      if (!input.reserveNonce(ownerApproval.nonce)) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "replay",
          "owner_approval_nonce_replay",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      if (
        ownerApproval.ownerId !== envelope.ownerId ||
        ownerApproval.ownerId !== input.trustedOwnerId
      ) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_binding_mismatch",
          "owner_approval_owner_mismatch",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      if (ownerApproval.sessionUuid !== envelope.sessionUuid) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_binding_mismatch",
          "owner_approval_session_mismatch",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      if (
        ownerApproval.capabilityId !== envelope.capabilityId ||
        ownerApproval.policyId !== envelope.policyId ||
        ownerApproval.policyVersion !== envelope.policyVersion ||
        ownerApproval.policyHash !== envelope.policyHash ||
        ownerApproval.authoritativeRiskClass !== envelope.authoritativeRiskClass ||
        ownerApproval.policyRuleId !== envelope.policyRuleId ||
        (ownerApproval.recipeId ?? null) !== (envelope.recipeId ?? null) ||
        (ownerApproval.executableId ?? null) !== (envelope.executableId ?? null) ||
        ownerApproval.persistence !== envelope.persistence ||
        ownerApproval.externalSideEffect !== envelope.externalSideEffect ||
        ownerApproval.requiresNetwork !== false
      ) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_binding_mismatch",
          "owner_approval_authority_fields_mismatch",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      if (!targetsMatchOwnerApproval(envelope.canonicalTargetPaths, ownerApproval)) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_binding_mismatch",
          "owner_approval_target_paths_mismatch",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      if (approvalMismatches.length > 0) {
        auditCtx.metadataMismatches = approvalMismatches;
        return fail(
          "owner_approval_required",
          "owner_approval_scope_mismatch",
          "owner_approval_does_not_cover_broker_decision",
          {
            authoritativeRiskClass: decision.authoritativeRiskClass,
            policyRuleId: decision.policyRuleId,
            metadataMismatches: approvalMismatches,
          },
        );
      }
      auditCtx.metadataMismatches = approvalMismatches;
      const ownerAudit = emitAudit("authorized", "owner_approved", null);
      return {
        ok: true,
        decision: "owner_approved",
        signerClass: "delegated_runtime",
        signerKeyId: envelope.keyId,
        publicKeyFingerprint: fingerprint,
        capability: envelope.capabilityId as SandboxCapabilityId,
        authoritativeRiskClass: brokerRisk,
        policyRuleId: brokerRuleId,
        policyId: activePolicy.policyId,
        policyVersion: activePolicy.policyVersion,
        policyHash: activePolicy.policyHash,
        canonicalPaths: facts,
        effectiveLimits: combineEffectiveLimits(policy.resourceCeilings),
        metadataMismatches: approvalMismatches,
        ownerApprovalProposalId: ownerApproval.proposalId,
        audit: ownerAudit,
      };
    }
  }

  const finalDecision = sharedDecision;
  if (finalDecision === null || finalDecision.decision !== "autonomous_safe") {
    return fail("denied", "policy_denied", "no_autonomous_decision");
  }
  const finalMismatches = [
    ...mismatches,
    ...compareMetadata(envelope, finalDecision, brokerCapability),
  ];
  const limits = combineEffectiveLimits(policy.resourceCeilings);
  auditCtx.effectiveLimits = limits;
  auditCtx.metadataMismatches = finalMismatches;

  const audit = emitAudit("authorized", "autonomous_safe", null);
  return {
    ok: true,
    decision: "autonomous_safe",
    signerClass: "delegated_runtime",
    signerKeyId: envelope.keyId,
    publicKeyFingerprint: fingerprint,
    capability: envelope.capabilityId as SandboxCapabilityId,
    authoritativeRiskClass: brokerRisk,
    policyRuleId: brokerRuleId,
    policyId: activePolicy.policyId,
    policyVersion: activePolicy.policyVersion,
    policyHash: activePolicy.policyHash,
    canonicalPaths: facts,
    effectiveLimits: limits,
    metadataMismatches: finalMismatches,
    audit,
  };
}
