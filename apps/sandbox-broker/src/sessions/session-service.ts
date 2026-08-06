/**
 * Broker session service (Sandbox Wave 4, Commit 8).
 *
 * The broker-facing orchestration surface for execution sessions: creation
 * under an active verified policy, lifecycle transitions with the optimistic
 * revision guard, short-lived signed capability issuance and verification,
 * and atomic tool-execution budget reservation.
 *
 * Boundaries observed here:
 *  - Policy identity comes only from the injected active verified policy.
 *  - Sessions never issue, verify, or reserve after expiry (lazily
 *    materialized) or in terminal / awaiting_owner state.
 *  - Capabilities are only granted if explicitly allowed by the policy and
 *    the session; workspace-bound capabilities require a bound workspace.
 *  - A signed capability is a reusable token for its short lifetime, but
 *    every reservation is atomic, single-use, and budgeted.
 *  - Nothing here executes, spawns processes, or activates routes.
 */

import { capabilitySpec } from "@composer-assistant/sandbox-policy";
import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";
import { DELEGATED_RUNTIME_KEY_ID } from "../crypto/delegated-approval.js";
import { randomNonce, randomRef } from "../crypto/types.js";
import type { ActiveVerifiedSandboxPolicy } from "../policy/delegated-authorization.js";
import {
  createBrokerCapabilitySigner,
  type BrokerCapabilitySigner,
  type CapabilitySigningKeyMaterial,
} from "./capability-custody.js";
import {
  CAPABILITY_SIGNING_KEY_ID,
  CAPABILITY_USE_ID_MAX_LENGTH,
  MAX_TOOL_EXECUTIONS_PER_SESSION,
  SESSION_CAPABILITY_DEFAULT_TTL_MS,
  SESSION_CAPABILITY_MAX_TTL_MS,
  SESSION_MAX_TTL_MS,
  SESSION_STRING_MAX_LENGTH,
  capabilityRequiresWorkspace,
} from "./session-limits.js";
import {
  signSessionCapability,
  verifySessionCapability,
  type SignedSandboxSessionCapability,
} from "./session-capability.js";
import { BrokerSessionLedger } from "./session-ledger.js";
import type { OwnerAuthorizedTransition } from "./session-types.js";
import {
  BROKER_SANDBOX_ROLES,
  isBrokerSandboxRole,
  type BrokerSandboxRole,
  type BrokerSandboxSession,
} from "./session-types.js";

export type SessionServiceOptions = {
  ledger: BrokerSessionLedger;
  /** Injected broker capability-signing material; null means unprovisioned. */
  capabilitySigningMaterial?: CapabilitySigningKeyMaterial | null;
  nowMs?: () => number;
};

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: string; reason: string };

export type CreateBrokerSessionInput = {
  ownerId: string;
  proposalId: string;
  role: BrokerSandboxRole;
  activePolicy: ActiveVerifiedSandboxPolicy;
  allowedCapabilities: SandboxCapabilityId[];
  maxToolExecutions: number;
  expiresAtMs: number;
  workspace?: { workspaceId: string; workspaceManifestHash: string };
  nowMs: number;
};

const MANIFEST_HASH_PATTERN = /^[0-9a-f]{64}$/;

export class BrokerSessionService {
  private readonly ledger: BrokerSessionLedger;
  private readonly signer: BrokerCapabilitySigner | null;
  private readonly nowMs: () => number;

  constructor(options: SessionServiceOptions) {
    this.ledger = options.ledger;
    this.nowMs = options.nowMs ?? (() => Date.now());
    if (options.capabilitySigningMaterial) {
      const created = createBrokerCapabilitySigner(options.capabilitySigningMaterial);
      if (!created.ok) {
        throw new Error(`capability_signer_unavailable:${created.errorCode}`);
      }
      this.signer = created.signer;
    } else {
      this.signer = null;
    }
  }

  createSession(input: CreateBrokerSessionInput): ServiceResult<BrokerSandboxSession> {
    const bad = (errorCode: string, reason: string): ServiceResult<BrokerSandboxSession> => ({
      ok: false,
      errorCode,
      reason,
    });

    if (
      typeof input.ownerId !== "string" ||
      input.ownerId.length === 0 ||
      input.ownerId.length > SESSION_STRING_MAX_LENGTH
    ) {
      return bad("owner_id_invalid", "owner id must be a bounded non-empty string");
    }
    if (
      typeof input.proposalId !== "string" ||
      input.proposalId.length === 0 ||
      input.proposalId.length > SESSION_STRING_MAX_LENGTH
    ) {
      return bad("proposal_id_invalid", "proposal id must be a bounded non-empty string");
    }
    if (!isBrokerSandboxRole(input.role)) {
      return bad("role_invalid", `role must be one of ${BROKER_SANDBOX_ROLES.join(",")}`);
    }
    const policy = input.activePolicy;
    if (!policy || !policy.policy || !policy.policyId || !policy.policyHash) {
      return bad("no_active_policy", "active verified policy is required");
    }
    if (policy.policyVersion < 1 || !Number.isInteger(policy.policyVersion)) {
      return bad("policy_version_invalid", "policy version must be a positive integer");
    }
    const allowedRoles = policy.policy.sessionRoles ?? [];
    if (!allowedRoles.includes(input.role)) {
      return bad("role_not_allowed_by_policy", "role is not allowed by the active policy");
    }
    if (!policy.policy.allowedDelegatedSignerKeyIds.includes(DELEGATED_RUNTIME_KEY_ID)) {
      return bad("delegated_signer_not_allowed", "delegated runtime signer not allowed by policy");
    }
    if (
      !Array.isArray(input.allowedCapabilities) ||
      input.allowedCapabilities.length === 0 ||
      new Set(input.allowedCapabilities).size !== input.allowedCapabilities.length
    ) {
      return bad("capabilities_invalid", "allowed capabilities must be non-empty and unique");
    }
    for (const capability of input.allowedCapabilities) {
      if (capabilitySpec(capability) === undefined) {
        return bad("unknown_capability", `unknown capability ${capability}`);
      }
      if (!policy.policy.allowedCapabilities.includes(capability)) {
        return bad("capability_not_allowed_by_policy", `capability ${capability} not allowed by policy`);
      }
    }
    const workspaceBound = input.allowedCapabilities.some(capabilityRequiresWorkspace);
    if (workspaceBound) {
      if (
        !input.workspace ||
        typeof input.workspace.workspaceId !== "string" ||
        input.workspace.workspaceId.length === 0 ||
        input.workspace.workspaceId.length > SESSION_STRING_MAX_LENGTH ||
        !MANIFEST_HASH_PATTERN.test(input.workspace.workspaceManifestHash ?? "")
      ) {
        return bad("workspace_binding_required", "workspace-bound capability requires a bound workspace");
      }
    } else if (
      input.workspace &&
      (typeof input.workspace.workspaceId !== "string" ||
        input.workspace.workspaceId.length === 0 ||
        !MANIFEST_HASH_PATTERN.test(input.workspace.workspaceManifestHash ?? ""))
    ) {
      return bad("workspace_binding_invalid", "workspace binding must have a valid manifest hash");
    }
    if (
      !Number.isInteger(input.maxToolExecutions) ||
      input.maxToolExecutions < 1 ||
      input.maxToolExecutions > MAX_TOOL_EXECUTIONS_PER_SESSION
    ) {
      return bad(
        "max_tool_executions_invalid",
        `max tool executions must be an integer in [1, ${MAX_TOOL_EXECUTIONS_PER_SESSION}]`,
      );
    }
    if (
      !Number.isFinite(input.expiresAtMs) ||
      input.expiresAtMs <= input.nowMs ||
      input.expiresAtMs > input.nowMs + SESSION_MAX_TTL_MS
    ) {
      return bad(
        "expires_at_invalid",
        `expires at must be within (now, now + ${SESSION_MAX_TTL_MS}ms]`,
      );
    }

    const session: BrokerSandboxSession = {
      sessionUuid: randomRef(16),
      ownerId: input.ownerId,
      proposalId: input.proposalId,
      role: input.role,
      state: "created",
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyHash: policy.policyHash,
      delegatedSignerKeyId: DELEGATED_RUNTIME_KEY_ID,
      capabilitySigningKeyId: CAPABILITY_SIGNING_KEY_ID,
      ...(input.workspace ? { workspaceId: input.workspace.workspaceId } : {}),
      ...(input.workspace ? { workspaceManifestHash: input.workspace.workspaceManifestHash } : {}),
      allowedCapabilities: [...input.allowedCapabilities],
      maxToolExecutions: input.maxToolExecutions,
      toolExecutionsUsed: 0,
      createdAt: new Date(input.nowMs).toISOString(),
      expiresAt: new Date(input.expiresAtMs).toISOString(),
      revision: 1,
    };
    try {
      this.ledger.createSession(session);
      const event = this.ledger.recordEvent({
        sessionUuid: session.sessionUuid,
        eventType: "session_created",
        atMs: input.nowMs,
        metadata: { role: session.role, policyId: session.policyId, policyVersion: session.policyVersion },
      });
      if (!event.ok) {
        return bad("session_create_failed", "failed to persist session event");
      }
    } catch {
      return bad("session_create_failed", "failed to persist session");
    }
    return { ok: true, value: session };
  }

  activateSession(
    sessionUuid: string,
    expectedRevision: number,
    nowMs = this.nowMs(),
  ): ServiceResult<BrokerSandboxSession> {
    return this.transitionTo(sessionUuid, "active", "session_activated", nowMs, {
      expectedRevision,
      stamps: { activatedAt: new Date(nowMs).toISOString() },
    });
  }

  transitionSession(
    sessionUuid: string,
    to: "awaiting_owner" | "completed" | "aborted",
    input: { expectedRevision: number; ownerAuthorization?: OwnerAuthorizedTransition; nowMs?: number },
  ): ServiceResult<BrokerSandboxSession> {
    const nowMs = input.nowMs ?? this.nowMs();
    const eventType =
      to === "awaiting_owner"
        ? "session_awaiting_owner"
        : to === "completed"
          ? "session_completed"
          : "session_aborted";
    return this.transitionTo(sessionUuid, to, eventType, nowMs, {
      expectedRevision: input.expectedRevision,
      ownerAuthorization: input.ownerAuthorization,
      stamps:
        to === "completed"
          ? { completedAt: new Date(nowMs).toISOString() }
          : to === "aborted"
            ? { abortedAt: new Date(nowMs).toISOString() }
            : {},
      metadata:
        to === "awaiting_owner" && input.ownerAuthorization
          ? { authorizationId: input.ownerAuthorization.authorizationId }
          : {},
    });
  }

  /**
   * Resumes a paused session. Requires a broker-recorded owner
   * authorization; the authorization must bind the session owner and the
   * session's policy hash.
   */
  resumeSession(
    sessionUuid: string,
    input: {
      expectedRevision: number;
      ownerAuthorization?: OwnerAuthorizedTransition;
      nowMs?: number;
    },
  ): ServiceResult<BrokerSandboxSession> {
    return this.transitionTo(sessionUuid, "active", "session_activated", input.nowMs ?? this.nowMs(), {
      expectedRevision: input.expectedRevision,
      ownerAuthorization: input.ownerAuthorization,
      stamps: { activatedAt: new Date(input.nowMs ?? this.nowMs()).toISOString() },
    });
  }

  issueSessionCapability(
    sessionUuid: string,
    capabilityId: SandboxCapabilityId,
    input: { ttlMs?: number; nowMs?: number },
  ): ServiceResult<SignedSandboxSessionCapability> {
    const nowMs = input.nowMs ?? this.nowMs();
    if (!this.signer) {
      return { ok: false, errorCode: "capability_key_unavailable", reason: "capability signing key not provisioned" };
    }
    const session = this.expireIfDue(sessionUuid, nowMs);
    if (!session) {
      return { ok: false, errorCode: "unknown_session", reason: "session not found" };
    }
    if (session.state !== "active") {
      return { ok: false, errorCode: "session_not_active", reason: `session is ${session.state}` };
    }
    if (capabilitySpec(capabilityId) === undefined) {
      return { ok: false, errorCode: "unknown_capability", reason: "unknown capability id" };
    }
    if (!session.allowedCapabilities.includes(capabilityId)) {
      return { ok: false, errorCode: "capability_not_allowed", reason: "capability not allowed for this session" };
    }
    const ttlMs = input.ttlMs ?? SESSION_CAPABILITY_DEFAULT_TTL_MS;
    if (
      !Number.isInteger(ttlMs) ||
      ttlMs < 1 ||
      ttlMs > SESSION_CAPABILITY_MAX_TTL_MS
    ) {
      return {
        ok: false,
        errorCode: "capability_ttl_invalid",
        reason: `ttl must be in [1, ${SESSION_CAPABILITY_MAX_TTL_MS}]ms`,
      };
    }
    const sessionExpiresMs = Date.parse(session.expiresAt);
    const tokenExpiresAtMs = Math.min(nowMs + ttlMs, sessionExpiresMs);
    const artifact = signSessionCapability(
      {
        capabilityVersion: 1,
        capabilityId,
        sessionUuid: session.sessionUuid,
        ownerId: session.ownerId,
        role: session.role,
        sessionState: "active",
        policyId: session.policyId,
        policyVersion: session.policyVersion,
        policyHash: session.policyHash,
        allowedCapabilities: session.allowedCapabilities,
        maxToolExecutions: session.maxToolExecutions,
        issuedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(tokenExpiresAtMs).toISOString(),
        nonce: randomNonce(),
      },
      this.signer,
    );
    this.ledger.recordEvent({
      sessionUuid: session.sessionUuid,
      eventType: "capability_issued",
      atMs: nowMs,
      metadata: {
        capability: capabilityId,
        ttlMs,
        nonce: artifact.payload.nonce,
      },
    });
    return { ok: true, value: artifact };
  }

  verifySessionCapability(
    artifact: SignedSandboxSessionCapability,
    nowMs = this.nowMs(),
  ): ServiceResult<{
    sessionUuid: string;
    capabilityId: SandboxCapabilityId;
    ownerId: string;
    role: BrokerSandboxRole;
    policyId: string;
    policyHash: string;
  }> {
    if (!this.signer) {
      return { ok: false, errorCode: "capability_key_unavailable", reason: "capability signing key not provisioned" };
    }
    const verified = verifySessionCapability(artifact, this.signer, nowMs);
    if (!verified.ok) {
      return { ok: false, errorCode: verified.errorCode, reason: verified.reason };
    }
    const payload = verified.payload;
    const session = this.expireIfDue(payload.sessionUuid, nowMs);
    if (!session) {
      return { ok: false, errorCode: "unknown_session", reason: "session not found" };
    }
    if (session.state !== "active") {
      return { ok: false, errorCode: "session_not_active", reason: `session is ${session.state}` };
    }
    if (
      session.policyId !== payload.policyId ||
      session.policyVersion !== payload.policyVersion ||
      session.policyHash !== payload.policyHash
    ) {
      return { ok: false, errorCode: "policy_mismatch", reason: "capability policy does not match session" };
    }
    if (session.ownerId !== payload.ownerId) {
      return { ok: false, errorCode: "owner_mismatch", reason: "capability owner does not match session" };
    }
    if (session.role !== payload.role) {
      return { ok: false, errorCode: "role_mismatch", reason: "capability role does not match session" };
    }
    for (const capability of payload.allowedCapabilities) {
      if (!session.allowedCapabilities.includes(capability)) {
        return { ok: false, errorCode: "capability_scope_exceeds_session", reason: "capability scope exceeds session" };
      }
    }
    if (payload.maxToolExecutions > session.maxToolExecutions) {
      return { ok: false, errorCode: "capability_budget_exceeds_session", reason: "capability budget exceeds session" };
    }
    if (!session.allowedCapabilities.includes(payload.capabilityId)) {
      return { ok: false, errorCode: "capability_not_allowed", reason: "capability not allowed for this session" };
    }
    this.ledger.recordEvent({
      sessionUuid: session.sessionUuid,
      eventType: "capability_verified",
      atMs: nowMs,
      metadata: { capability: payload.capabilityId, nonce: payload.nonce },
    });
    return {
      ok: true,
      value: {
        sessionUuid: session.sessionUuid,
        capabilityId: payload.capabilityId,
        ownerId: session.ownerId,
        role: session.role,
        policyId: session.policyId,
        policyHash: session.policyHash,
      },
    };
  }

  reserveToolExecution(
    sessionUuid: string,
    capabilityId: SandboxCapabilityId,
    capabilityUseId: string,
    input: { policyHash: string; expectedRevision: number; nowMs?: number },
  ): ServiceResult<{
    sessionUuid: string;
    capabilityUseId: string;
    capability: SandboxCapabilityId;
    toolExecutionsUsed: number;
    remainingBudget: number;
  }> {
    const nowMs = input.nowMs ?? this.nowMs();
    if (
      typeof capabilityUseId !== "string" ||
      capabilityUseId.length === 0 ||
      capabilityUseId.length > CAPABILITY_USE_ID_MAX_LENGTH
    ) {
      return { ok: false, errorCode: "capability_use_id_invalid", reason: "capability use id out of bounds" };
    }
    const session = this.expireIfDue(sessionUuid, nowMs);
    if (!session) {
      return { ok: false, errorCode: "unknown_session", reason: "session not found" };
    }
    if (session.state !== "active") {
      return { ok: false, errorCode: "session_not_active", reason: `session is ${session.state}` };
    }
    if (session.revision !== input.expectedRevision) {
      return {
        ok: false,
        errorCode: "revision_mismatch",
        reason: `expected revision ${input.expectedRevision}, current ${session.revision}`,
      };
    }
    const reserved = this.ledger.reserveCapabilityUse({
      sessionUuid,
      expectedRevision: input.expectedRevision,
      capabilityUseId,
      capability: capabilityId,
      policyHash: input.policyHash,
      nowMs,
    });
    if (!reserved.ok) {
      return { ok: false, errorCode: reserved.errorCode, reason: reserved.reason };
    }
    return {
      ok: true,
      value: {
        sessionUuid,
        capabilityUseId,
        capability: capabilityId,
        toolExecutionsUsed: reserved.value.session.toolExecutionsUsed,
        remainingBudget: reserved.value.session.maxToolExecutions - reserved.value.session.toolExecutionsUsed,
      },
    };
  }

  finalizeToolExecution(
    capabilityUseId: string,
    outcome: "succeeded" | "failed" | "cancelled",
    nowMs = this.nowMs(),
  ): ServiceResult<{ capabilityUseId: string; outcome: string }> {
    const finalized = this.ledger.finalizeCapabilityUse(capabilityUseId, outcome, nowMs);
    if (!finalized.ok) {
      return { ok: false, errorCode: finalized.errorCode, reason: finalized.reason };
    }
    return { ok: true, value: { capabilityUseId, outcome: finalized.value.outcome } };
  }

  getSession(sessionUuid: string): BrokerSandboxSession | null {
    return this.ledger.getSession(sessionUuid);
  }

  listEvents(sessionUuid: string) {
    return this.ledger.listEvents(sessionUuid);
  }

  private expireIfDue(sessionUuid: string, nowMs: number): BrokerSandboxSession | null {
    const session = this.ledger.getSession(sessionUuid);
    if (!session) return null;
    if (
      (session.state === "created" || session.state === "active" || session.state === "awaiting_owner") &&
      nowMs >= Date.parse(session.expiresAt)
    ) {
      const expired = this.ledger.applyTransition({
        sessionUuid,
        expectedRevision: session.revision,
        to: "expired",
        eventType: "session_expired",
        atMs: nowMs,
      });
      if (expired.ok) {
        return expired.value;
      }
      return this.ledger.getSession(sessionUuid);
    }
    return session;
  }

  private transitionTo(
    sessionUuid: string,
    to: BrokerSandboxSession["state"],
    eventType: string,
    nowMs: number,
    input: {
      expectedRevision: number;
      ownerAuthorization?: OwnerAuthorizedTransition;
      stamps?: { activatedAt?: string; completedAt?: string; abortedAt?: string };
      metadata?: Record<string, string | number | boolean>;
    },
  ): ServiceResult<BrokerSandboxSession> {
    const session = this.expireIfDue(sessionUuid, nowMs);
    if (!session) {
      return { ok: false, errorCode: "unknown_session", reason: "session not found" };
    }
    const applied = this.ledger.applyTransition({
      sessionUuid,
      expectedRevision: input.expectedRevision,
      to,
      eventType,
      atMs: nowMs,
      ownerAuthorization: input.ownerAuthorization,
      stamps: input.stamps,
      metadata: input.metadata,
    });
    if (!applied.ok) {
      return { ok: false, errorCode: applied.errorCode, reason: applied.reason };
    }
    return { ok: true, value: applied.value };
  }
}
