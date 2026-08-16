/**
 * Production Unix-socket sandbox broker client (Sandbox Wave 4, Commit 12).
 *
 * A typed RPC adapter over the broker's `sandbox.*` IPC surface. It owns no
 * policy decisions, path authorization, signing authority, session rules or
 * recipe selection: every authoritative decision is delegated to the broker
 * over the Unix socket. Mutating operations are dispatched exactly once and
 * never auto-retried (ambiguous non-idempotent outcomes fail closed).
 *
 * Capability tokens, owner signatures and delegated signatures are accepted
 * across the trusted socket but never serialized into errors, logs, audit
 * metadata or diagnostics.
 */

import {
  isBrokerSandboxRole,
  isSandboxSessionState,
  type BrokerDelegatedAuthorizationAudit,
  type BrokerDelegatedAuthorizationResult,
  type DelegatedApprovalEnvelope,
  type FixedRecipeExecutionRequest,
  type FixedRecipeExecutionResult,
  type ServiceResult,
  type SignedSandboxSessionCapability,
} from "@composer-assistant/sandbox-broker";
import {
  type EngineeringAction,
  type SandboxCapabilityId,
} from "@composer-assistant/sandbox-policy";
import type { EngineeringToolResult } from "./engineering-types.js";
import { env } from "../../env.js";
import type {
  SandboxBrokerClient,
  SandboxBrokerSessionSnapshot,
  SandboxWorkspaceResult,
} from "./broker-client.js";
import type {
  BrokerClientTransport,
  BrokerDispatchResult,
} from "../change-proposal/broker-client.js";
import { UnixBrokerClientTransport } from "../change-proposal/unix-broker-transport.js";

const MAX_RESPONSE_BYTES = 1_048_576;
const HASH64_RE = /^[0-9a-f]{64}$/;
const NONCE_RE = /^[A-Za-z0-9]+$/;

export interface UnixSandboxBrokerClientOptions {
  transport: BrokerClientTransport;
  /** Bound on the serialized size of a deserialized response. */
  maxResponseBytes?: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function boundedString(value: unknown, max: number, min = 1): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isIsoDate(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function oversized(data: unknown, max: number): boolean {
  try {
    return JSON.stringify(data).length > max;
  } catch {
    return true;
  }
}

function isSessionSnapshot(data: unknown): data is SandboxBrokerSessionSnapshot {
  if (!isPlainRecord(data)) return false;
  if (!boundedString(data.sessionUuid, 128)) return false;
  if (!boundedString(data.ownerId, 128)) return false;
  if (!isBrokerSandboxRole(data.role)) return false;
  if (!isSandboxSessionState(data.state)) return false;
  if (!boundedString(data.policyId, 128)) return false;
  if (typeof data.policyVersion !== "number" || !Number.isInteger(data.policyVersion) || data.policyVersion < 1) return false;
  if (!HASH64_RE.test(data.policyHash as string)) return false;
  if (!Array.isArray(data.allowedCapabilities) || data.allowedCapabilities.length > 32) return false;
  if (data.workspaceId !== null && !boundedString(data.workspaceId, 128)) return false;
  if (typeof data.maxToolExecutions !== "number" || !Number.isInteger(data.maxToolExecutions) || data.maxToolExecutions < 0) return false;
  if (typeof data.toolExecutionsUsed !== "number" || !Number.isInteger(data.toolExecutionsUsed) || data.toolExecutionsUsed < 0) return false;
  if (!isIsoDate(data.expiresAt)) return false;
  if (typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 1) return false;
  return true;
}

function isServiceResult<T>(data: unknown, valueCheck: (v: unknown) => boolean): data is ServiceResult<T> {
  if (!isPlainRecord(data)) return false;
  if (data.ok === true) {
    return valueCheck(data.value);
  }
  if (data.ok === false) {
    return typeof data.errorCode === "string" && typeof data.reason === "string";
  }
  return false;
}

function isCapability(data: unknown): data is SignedSandboxSessionCapability {
  if (!isPlainRecord(data)) return false;
  const payload = data.payload;
  if (!isPlainRecord(payload)) return false;
  if (typeof payload.capabilityVersion !== "number") return false;
  if (!boundedString(payload.capabilityId, 64)) return false;
  if (!boundedString(payload.sessionUuid, 128)) return false;
  if (!boundedString(payload.ownerId, 128)) return false;
  if (!isBrokerSandboxRole(payload.role)) return false;
  if (payload.sessionState !== "active") return false;
  if (!boundedString(payload.policyId, 128)) return false;
  if (typeof payload.policyVersion !== "number" || !Number.isInteger(payload.policyVersion) || payload.policyVersion < 1) return false;
  if (!HASH64_RE.test(payload.policyHash as string)) return false;
  if (!Array.isArray(payload.allowedCapabilities)) return false;
  if (typeof payload.maxToolExecutions !== "number" || !Number.isInteger(payload.maxToolExecutions) || payload.maxToolExecutions < 0) return false;
  if (!boundedString(payload.nonce, 128)) return false;
  if (!isIsoDate(payload.issuedAt) || !isIsoDate(payload.expiresAt)) return false;
  const sig = data.signature;
  if (!isPlainRecord(sig)) return false;
  if (sig.algorithm !== "Ed25519") return false;
  if (!boundedString(sig.keyId, 128)) return false;
  if (sig.encoding !== "base64url") return false;
  if (typeof sig.value !== "string" || sig.value.length === 0 || sig.value.length > 4096) return false;
  return true;
}

function isAuthorizationResult(data: unknown): data is BrokerDelegatedAuthorizationResult {
  if (!isPlainRecord(data)) return false;
  if (data.ok === true) {
    if (data.decision !== "autonomous_safe" && data.decision !== "owner_approved") return false;
    if (data.signerClass !== "delegated_runtime") return false;
    if (!boundedString(data.signerKeyId, 128)) return false;
    if (!HASH64_RE.test(data.publicKeyFingerprint as string)) return false;
    if (!boundedString(data.capability as string, 128)) return false;
    if (typeof data.authoritativeRiskClass !== "string") return false;
    if (!boundedString(data.policyRuleId, 128)) return false;
    if (!boundedString(data.policyId, 128)) return false;
    if (typeof data.policyVersion !== "number" || !Number.isInteger(data.policyVersion) || data.policyVersion < 1) return false;
    if (!HASH64_RE.test(data.policyHash as string)) return false;
    if (!Array.isArray(data.canonicalPaths)) return false;
    if (!isPlainRecord(data.effectiveLimits)) return false;
    if (!Array.isArray(data.metadataMismatches)) return false;
    return true;
  }
  if (data.ok === false) {
    if (data.decision !== "owner_approval_required" && data.decision !== "denied") return false;
    if (typeof data.errorCode !== "string") return false;
    return true;
  }
  return false;
}

function isWorkspaceResult(data: unknown): data is SandboxWorkspaceResult {
  if (!isPlainRecord(data)) return false;
  if (data.ok === true) {
    if (!boundedString(data.workspaceId, 128)) return false;
    if (!boundedString(data.treeRoot, 1024)) return false;
    if (!HASH64_RE.test(data.manifestHash as string)) return false;
    return true;
  }
  if (data.ok === false) {
    return typeof data.errorCode === "string" && typeof data.reason === "string";
  }
  return false;
}

function isExecutionResult(data: unknown): data is FixedRecipeExecutionResult {
  if (!isPlainRecord(data)) return false;
  if (data.ok === true) {
    if (data.outcome !== "succeeded" && data.outcome !== "failed") return false;
    if (!isPlainRecord(data.receipt)) return false;
    if (!isPlainRecord(data.audit)) return false;
    return true;
  }
  if (data.ok === false) {
    return (
      (data.outcome === "refused" || data.outcome === "outcome_unknown") &&
      typeof data.errorCode === "string" &&
      typeof data.reason === "string" &&
      typeof data.stage === "string"
    );
  }
  return false;
}

const BROKER_SUCCESS_FIELD_NAMES = new Set([
  "workspaceId", "treeRoot", "created", "written", "deleted",
  "content", "entries", "matches", "stdout", "stderr", "exitCode",
  "applied", "artifactRef", "title",
]);

function hasBrokerSuccessField(data: Record<string, unknown>): boolean {
  return Object.keys(data).some(key => BROKER_SUCCESS_FIELD_NAMES.has(key));
}

function isEngineeringToolResult(data: unknown): data is EngineeringToolResult {
  if (!isPlainRecord(data)) return false;
  if (data.ok === true) {
    return "data" in data && (data.artifactRef === null || typeof data.artifactRef === "string");
  }
  if (data.ok === false) {
    return typeof data.errorCode === "string" && typeof data.reason === "string";
  }
  // Broker canonical success: plain record without ok field,
  // without errorCode/reason pattern (those are error responses),
  // and with at least one own property and a known broker success field name
  // (rejects arbitrary records like {banana: 123} or {})
  if (!("ok" in data) && !(typeof data.errorCode === "string" && typeof data.reason === "string")) {
    if (Object.keys(data).length === 0) return false;
    if (!hasBrokerSuccessField(data)) return false;
    return true;
  }
  return false;
}

const READINESS_STATE_RE = /^(unavailable|none)$/;

function isDelegatedReadiness(data: unknown): boolean {
  if (!isPlainRecord(data)) return false;
  if (typeof data.enabled !== "boolean") return false;
  if (typeof data.ready !== "boolean") return false;
  if (!boundedString(data.ownerKeyId, 128)) return false;
  if (!boundedString(data.delegatedKeyId, 128)) return false;
  if (!boundedString(data.capabilityKeyId, 128)) return false;
  if (!boundedString(data.continuityKeyId, 128)) return false;
  if (data.policyId !== null && !boundedString(data.policyId, 128)) return false;
  if (data.policyVersion !== null && (typeof data.policyVersion !== "number" || !Number.isInteger(data.policyVersion) || data.policyVersion < 1)) return false;
  if (data.policyHash !== null && !HASH64_RE.test(data.policyHash as string)) return false;
  if (data.networkMode !== null && !READINESS_STATE_RE.test(data.networkMode as string)) return false;
  if (typeof data.networkIsolationOperational !== "boolean") return false;
  if (typeof data.maxConcurrentTasks !== "number" || !Number.isInteger(data.maxConcurrentTasks) || data.maxConcurrentTasks < 0) return false;
  return true;
}

export interface DelegatedReadinessSnapshot {
  ready: boolean;
  /** The broker-reported readiness flag, or null when the broker could not be reached. */
  brokerReady: boolean | null;
  networkMode: "unavailable" | "none" | null;
  networkIsolationOperational: boolean | null;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: string | null;
}

function deniedAuthorization(
  errorCode: string,
  reason: string,
  envelope?: DelegatedApprovalEnvelope,
): BrokerDelegatedAuthorizationResult {
  return {
    ok: false,
    decision: "denied",
    errorCode,
    reason,
    signerClass: null,
    signerKeyId: null,
    publicKeyFingerprint: null,
    audit: {
      kind: "broker_delegated_authorization",
      outcome: "refused",
      decision: "denied",
      errorCode,
      proposalId: envelope?.proposalId ?? "",
      ownerId: envelope?.ownerId ?? "",
      sessionUuid: envelope?.sessionUuid ?? null,
      signerClass: null,
      signerKeyId: null,
      publicKeyFingerprint: null,
      policyId: envelope?.policyId ?? null,
      policyVersion: typeof envelope?.policyVersion === "number" && Number.isInteger(envelope.policyVersion) ? envelope.policyVersion : null,
      policyHash: (envelope?.policyHash as string | undefined) ?? null,
      agentCapability: envelope?.capabilityId ?? "",
      agentRiskClass: (envelope?.authoritativeRiskClass as string | undefined) ?? "",
      agentPolicyRuleId: envelope?.policyRuleId ?? "",
      brokerCapability: null,
      brokerRiskClass: null,
      brokerPolicyRuleId: null,
      canonicalPathClasses: [],
      effectiveLimits: null,
      metadataMismatches: [],
      ownerApprovalProposalId: null,
      ownerApprovalKeyId: null,
      nonceHash: "",
      createdAtIso: new Date().toISOString(),
    },
  };
}

function executionRefusal(
  errorCode: string,
  reason: string,
): FixedRecipeExecutionResult {
  const now = new Date().toISOString();
  return {
    ok: false,
    outcome: "refused",
    errorCode,
    reason,
    stage: "transport",
    receipt: null,
    audit: {
      kind: "broker_fixed_recipe_execution",
      outcome: "refused",
      errorCode,
      stage: "transport",
      proposalId: "",
      ownerId: "",
      sessionUuid: "",
      capabilityUseId: null,
      recipeId: "",
      readiness: "disabled",
      category: null,
      exitCode: null,
      terminalReason: null,
      stdoutHash: null,
      stderrHash: null,
      truncated: false,
      stdoutBytes: null,
      stderrBytes: null,
      wallMs: null,
      networkIsolation: "not_attempted",
      receiptHash: null,
      nonceHash: "",
      createdAtIso: now,
      isolationEvidenceSummary: null,
    },
  };
}

function executionUnknown(
  errorCode: string,
  reason: string,
): FixedRecipeExecutionResult {
  const now = new Date().toISOString();
  return {
    ok: false,
    outcome: "outcome_unknown",
    errorCode: "outcome_unknown",
    reason: `transport error ${errorCode}: ${reason}`,
    stage: "transport",
    receipt: null,
    audit: {
      kind: "broker_fixed_recipe_execution",
      outcome: "outcome_unknown",
      errorCode: "outcome_unknown",
      stage: "transport",
      proposalId: "",
      ownerId: "",
      sessionUuid: "",
      capabilityUseId: null,
      recipeId: "",
      readiness: "disabled",
      category: null,
      exitCode: null,
      terminalReason: null,
      stdoutHash: null,
      stderrHash: null,
      truncated: false,
      stdoutBytes: null,
      stderrBytes: null,
      wallMs: null,
      networkIsolation: "not_attempted",
      receiptHash: null,
      nonceHash: "",
      createdAtIso: now,
      isolationEvidenceSummary: null,
    },
  };
}

export class UnixSandboxBrokerClient implements SandboxBrokerClient {
  readonly kind = "unix_socket" as const;
  private readonly maxResponseBytes: number;
  private transport: BrokerClientTransport | null;
  private closed = false;

  constructor(options: UnixSandboxBrokerClientOptions) {
    this.transport = options.transport;
    this.maxResponseBytes = Math.max(1024, options.maxResponseBytes ?? MAX_RESPONSE_BYTES);
  }

  /** The owned transport, or null after `close()`. Test-only observation of ownership. */
  get transportForTest(): BrokerClientTransport | null {
    return this.transport;
  }

  private async dispatch(
    messageType: string,
    payload: unknown,
  ): Promise<BrokerDispatchResult> {
    if (this.closed || this.transport === null) {
      return {
        ok: false,
        errorCode: "broker_closed",
        message: "sandbox broker client is closed",
        requestDelivery: "not_sent",
      };
    }
    try {
      return await this.transport.dispatch(messageType, payload);
    } catch (error) {
      return this.mapTransportError(error);
    }
  }

  private mapTransportError(error: unknown): BrokerDispatchResult {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        errorCode: "broker_timeout",
        message: "sandbox broker timed out",
        requestDelivery: "sent_or_unknown",
      };
    }
    return {
      ok: false,
      errorCode: "broker_unavailable",
      message: "sandbox broker request failed",
      requestDelivery: "sent_or_unknown",
    };
  }

  async authorizeRequest(
    envelope: DelegatedApprovalEnvelope,
    nowMs: number,
  ): Promise<BrokerDelegatedAuthorizationResult> {
    const result = await this.dispatch("sandbox.authorizeDelegated", { envelope, nowMs });
    if (!result.ok) return deniedAuthorization(result.errorCode, result.message, envelope);
    if (oversized(result.data, this.maxResponseBytes)) {
      return deniedAuthorization("broker_response_oversized", "broker response oversized", envelope);
    }
    if (isAuthorizationResult(result.data)) {
      return result.data as BrokerDelegatedAuthorizationResult;
    }
    return deniedAuthorization("broker_response_invalid", "malformed authorization response", envelope);
  }

  async createSession(input: {
    ownerId: string;
    proposalId: string;
    role: "sandbox_operator_light" | "sandbox_operator_deep";
    allowedCapabilities: readonly SandboxCapabilityId[];
    maxToolExecutions: number;
    expiresAtMs: number;
    workspace?: { workspaceId: string; workspaceManifestHash: string };
    nowMs: number;
  }): Promise<ServiceResult<SandboxBrokerSessionSnapshot>> {
    const result = await this.dispatch("sandbox.session.create", input);
    if (!result.ok) {
      return { ok: false, errorCode: result.errorCode, reason: result.message };
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return { ok: false, errorCode: "broker_response_oversized", reason: "broker response oversized" };
    }
    if (
      isPlainRecord(result.data) &&
      isServiceResult<SandboxBrokerSessionSnapshot>(result.data, (v) => isSessionSnapshot(v))
    ) {
      const data = result.data as ServiceResult<SandboxBrokerSessionSnapshot>;
      return data.ok ? { ok: true, value: data.value } : { ok: false, errorCode: data.errorCode, reason: data.reason };
    }
    return { ok: false, errorCode: "broker_response_invalid", reason: "malformed createSession response" };
  }

  async activateSession(
    sessionUuid: string,
    expectedRevision: number,
    nowMs: number,
  ): Promise<ServiceResult<SandboxBrokerSessionSnapshot>> {
    const result = await this.dispatch("sandbox.session.activate", {
      sessionUuid,
      expectedRevision,
      nowMs,
    });
    if (!result.ok) {
      return { ok: false, errorCode: result.errorCode, reason: result.message };
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return { ok: false, errorCode: "broker_response_oversized", reason: "broker response oversized" };
    }
    if (
      isPlainRecord(result.data) &&
      isServiceResult<SandboxBrokerSessionSnapshot>(result.data, (v) => isSessionSnapshot(v))
    ) {
      const data = result.data as ServiceResult<SandboxBrokerSessionSnapshot>;
      return data.ok ? { ok: true, value: data.value } : { ok: false, errorCode: data.errorCode, reason: data.reason };
    }
    return { ok: false, errorCode: "broker_response_invalid", reason: "malformed activateSession response" };
  }

  async transitionSession(
    sessionUuid: string,
    to: "awaiting_owner" | "completed" | "aborted",
    input: { expectedRevision: number; nowMs?: number },
  ): Promise<ServiceResult<SandboxBrokerSessionSnapshot>> {
    const result = await this.dispatch("sandbox.session.transition", { sessionUuid, to, input });
    if (!result.ok) {
      return { ok: false, errorCode: result.errorCode, reason: result.message };
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return { ok: false, errorCode: "broker_response_oversized", reason: "broker response oversized" };
    }
    if (
      isPlainRecord(result.data) &&
      isServiceResult<SandboxBrokerSessionSnapshot>(result.data, (v) => isSessionSnapshot(v))
    ) {
      const data = result.data as ServiceResult<SandboxBrokerSessionSnapshot>;
      return data.ok ? { ok: true, value: data.value } : { ok: false, errorCode: data.errorCode, reason: data.reason };
    }
    return { ok: false, errorCode: "broker_response_invalid", reason: "malformed transitionSession response" };
  }

  async resumeSession(
    sessionUuid: string,
    input: {
      expectedRevision: number;
      ownerAuthorization: {
        authorizationId: string;
        ownerId: string;
        policyHash: string;
        authorizedAtMs: number;
      };
      nowMs?: number;
    },
  ): Promise<ServiceResult<SandboxBrokerSessionSnapshot>> {
    const result = await this.dispatch("sandbox.session.resume", { sessionUuid, input });
    if (!result.ok) {
      return { ok: false, errorCode: result.errorCode, reason: result.message };
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return { ok: false, errorCode: "broker_response_oversized", reason: "broker response oversized" };
    }
    if (
      isPlainRecord(result.data) &&
      isServiceResult<SandboxBrokerSessionSnapshot>(result.data, (v) => isSessionSnapshot(v))
    ) {
      const data = result.data as ServiceResult<SandboxBrokerSessionSnapshot>;
      return data.ok ? { ok: true, value: data.value } : { ok: false, errorCode: data.errorCode, reason: data.reason };
    }
    return { ok: false, errorCode: "broker_response_invalid", reason: "malformed resumeSession response" };
  }

  async issueSessionCapability(
    sessionUuid: string,
    capabilityId: SandboxCapabilityId,
    input: { ttlMs?: number; nowMs?: number },
  ): Promise<ServiceResult<SignedSandboxSessionCapability>> {
    const result = await this.dispatch("sandbox.session.issueCapability", { sessionUuid, capabilityId, input });
    if (!result.ok) {
      return { ok: false, errorCode: result.errorCode, reason: result.message };
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return { ok: false, errorCode: "broker_response_oversized", reason: "broker response oversized" };
    }
    if (
      isPlainRecord(result.data) &&
      isServiceResult<SignedSandboxSessionCapability>(result.data, (v) => isCapability(v))
    ) {
      const data = result.data as ServiceResult<SignedSandboxSessionCapability>;
      return data.ok ? { ok: true, value: data.value } : { ok: false, errorCode: data.errorCode, reason: data.reason };
    }
    return { ok: false, errorCode: "broker_response_invalid", reason: "malformed issueSessionCapability response" };
  }

  async createWorkspace(input: {
    envelope: DelegatedApprovalEnvelope;
    nowMs: number;
    ttlMs?: number;
  }): Promise<SandboxWorkspaceResult> {
    const result = await this.dispatch("sandbox.workspace.create", { input });
    if (!result.ok) {
      return { ok: false, errorCode: result.errorCode, reason: result.message };
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return { ok: false, errorCode: "broker_response_oversized", reason: "broker response oversized" };
    }
    if (isWorkspaceResult(result.data)) {
      return result.data as SandboxWorkspaceResult;
    }
    return { ok: false, errorCode: "broker_response_invalid", reason: "malformed createWorkspace response" };
  }

  async executeRecipe(request: FixedRecipeExecutionRequest): Promise<FixedRecipeExecutionResult> {
    const result = await this.dispatch("sandbox.recipe.execute", { request });
    if (!result.ok) {
      return result.requestDelivery === "not_sent"
        ? executionRefusal(result.errorCode, result.message)
        : executionUnknown(result.errorCode, result.message);
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return executionUnknown("broker_response_oversized", "broker response oversized");
    }
    if (isExecutionResult(result.data)) {
      return result.data as FixedRecipeExecutionResult;
    }
    return executionUnknown("broker_response_invalid", "malformed executeRecipe response");
  }

  async engineeringAction(input: {
    envelope: DelegatedApprovalEnvelope;
    nowMs: number;
    action: EngineeringAction;
  }): Promise<EngineeringToolResult> {
    const result = await this.dispatch("sandbox.engineering.action", {
      envelope: input.envelope,
      nowMs: input.nowMs,
      action: input.action,
    });
    if (!result.ok) {
      return { ok: false, errorCode: result.errorCode, reason: result.message };
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return { ok: false, errorCode: "broker_response_oversized", reason: "broker response oversized" };
    }
    if (isEngineeringToolResult(result.data)) {
      return { ok: true, data: result.data, artifactRef: null } as EngineeringToolResult;
    }
    return { ok: false, errorCode: "broker_response_invalid", reason: "malformed engineeringAction response" };
  }

  async getSession(sessionUuid: string): Promise<SandboxBrokerSessionSnapshot | null> {
    const result = await this.dispatch("sandbox.session.get", { sessionUuid });
    if (!result.ok) {
      // Fail-closed: an unreachable/malformed broker is never treated as a live
      // session. Callers (e.g. resumeSession) gate on the returned snapshot, so
      // a transport failure safely denies resumption rather than authorizing on
      // stale state.
      return null;
    }
    if (oversized(result.data, this.maxResponseBytes)) return null;
    if (result.data === null) return null;
    if (isSessionSnapshot(result.data)) return result.data as SandboxBrokerSessionSnapshot;
    return null;
  }

  async readiness(): Promise<DelegatedReadinessSnapshot> {
    const result = await this.dispatch("sandbox.readiness", {});
    if (!result.ok) {
      return { ready: false, brokerReady: null, networkMode: null, networkIsolationOperational: null, policyId: null, policyVersion: null, policyHash: null };
    }
    if (oversized(result.data, this.maxResponseBytes)) {
      return { ready: false, brokerReady: null, networkMode: null, networkIsolationOperational: null, policyId: null, policyVersion: null, policyHash: null };
    }
    if (!isDelegatedReadiness(result.data)) {
      return { ready: false, brokerReady: null, networkMode: null, networkIsolationOperational: null, policyId: null, policyVersion: null, policyHash: null };
    }
    const data = result.data as Record<string, unknown>;
    const policyReady =
      data.policyId !== null &&
      typeof data.policyId === "string" &&
      data.policyId.length > 0 &&
      typeof data.policyVersion === "number" &&
      Number.isInteger(data.policyVersion) &&
      data.policyVersion > 0 &&
      typeof data.policyHash === "string" &&
      HASH64_RE.test(data.policyHash);
    return {
      ready:
        data.enabled === true &&
        data.ready === true &&
        data.networkMode === "none" &&
        data.networkIsolationOperational === true &&
        typeof data.maxConcurrentTasks === "number" &&
        data.maxConcurrentTasks > 0 &&
        policyReady,
      brokerReady: data.ready === true,
      networkMode: (data.networkMode as "unavailable" | "none" | null) ?? null,
      networkIsolationOperational: data.networkIsolationOperational === true,
      policyId: data.policyId ? (data.policyId as string) : null,
      policyVersion: typeof data.policyVersion === "number" && Number.isInteger(data.policyVersion) ? data.policyVersion : null,
      policyHash: data.policyHash ? (data.policyHash as string) : null,
    };
  }

  close(): void {
    this.closed = true;
    this.transport = null;
  }
}

export function createConfiguredUnixSandboxClient(): UnixSandboxBrokerClient | null {
  if (!env.sandboxDelegatedEnabled) return null;
  const socketPath = env.sandboxBrokerSocket.trim();
  if (!socketPath) return null;
  return new UnixSandboxBrokerClient({
    transport: new UnixBrokerClientTransport({
      socketPath,
      timeoutMs: env.sandboxBrokerTimeoutMs,
    }),
  });
}
