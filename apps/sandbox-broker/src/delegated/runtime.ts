/**
 * Delegated sandbox runtime adapter (Sandbox Wave 4, Commit 10).
 *
 * A thin, schema-validated dispatch surface that wires the already-implemented
 * authority services into the broker's `sandbox.*` IPC message types. The broker
 * owns durable state (it shares its `BrokerSessionLedger` and audit sink with
 * this adapter) and remains the final authority for every tool action; this
 * module performs NO authorization logic of its own — it only validates the
 * bounded wire payload, dispatches to the authority service, maps the typed
 * service result onto the broker response envelope, and emits an audit trace.
 *
 * The adapter is constructed only when `ASHLEY_SANDBOX_DELEGATED_ENABLED=true`
 * on the broker host (see `main.ts`); otherwise it is absent and every
 * `sandbox.*` message is refused with `sandbox_surface_disabled`. This surface
 * is Wave_accepted / not release-qualified / not deployed (see Sandbox_Design.md
 * and docs/handoffs/wave-07c-gate-packet.md) and defaults to a fail-closed
 * absence.
 */

import { createPublicKey, type KeyObject } from "node:crypto";
import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";
import { toProtectedRootsConfig } from "@composer-assistant/sandbox-policy";
import type { ApprovalKeyConfig } from "../crypto/approval.js";
import type { OwnerApprovalVerifierConfig } from "../crypto/owner-approval.js";
import {
  type OwnerPolicyKeyConfig,
  ownerPolicyKeyFromPem,
  type DelegatedPolicyLoadResult,
  loadVerifiedDelegatedPolicy,
} from "../crypto/delegated-policy.js";
import type { DelegatedApprovalEnvelope } from "../crypto/delegated-approval.js";
import { sha256Hex } from "../crypto/types.js";
import { serializeDisposableWorkspaceManifest } from "../workspace/workspace-manifest.js";
import { createDisposableWorkspace } from "../workspace/workspace-create.js";
import {
  revalidateDisposableWorkspace,
  type RevalidateWorkspaceResult,
} from "../workspace/workspace-revalidate.js";
import {
  cleanupDisposableWorkspace,
  type CleanupWorkspaceResult,
} from "../workspace/workspace-cleanup.js";
import {
  authorizeDelegatedSandboxRequest,
  type ActiveVerifiedSandboxPolicy,
  type BrokerDelegatedAuthorizationResult,
  type DelegatedTrustedKeyConfig,
} from "../policy/delegated-authorization.js";
import { validateBrokerRootConfig, type BrokerRootConfig } from "../policy/root-config.js";
import { toCanonicalBrokerPath } from "../policy/path.js";
import { BrokerSessionLedger } from "../sessions/session-ledger.js";
import {
  BrokerSessionService,
  type ServiceResult,
} from "../sessions/session-service.js";
import type {
  BrokerSandboxRole,
  BrokerSandboxSession,
  SandboxSessionState,
} from "../sessions/session-types.js";
import type { SignedSandboxSessionCapability } from "../sessions/session-capability.js";
import type { CapabilitySigningKeyMaterial, BrokerCapabilitySigner } from "../sessions/capability-custody.js";
import { createBrokerCapabilitySigner } from "../sessions/capability-custody.js";
import { OWNER_APPROVAL_SIGNER_CLASS } from "../crypto/owner-approval.js";
import {
  FixedRecipeExecutionService,
  type BrokerAuditRecord,
} from "../execution/fixed-recipe-execution-service.js";
import {
  type FixedRecipeExecutionRequest,
  type FixedRecipeExecutionResult,
} from "../execution/execution-types.js";
import type { NetworkIsolationProvider } from "../execution/network-isolation.js";
import type { ExecutionIsolationProvider } from "../execution/execution-isolation.js";
import type { ProcessRunner } from "../process/fake-runner.js";
import type { ExecutableMappings } from "../execution/executable-resolver.js";
import type { BrokerResponse, RequestContext } from "../protocol/frame.js";
import type { FixedRecipe } from "../policy/recipe-registry.js";
import { fixedRecipeRegistry } from "../policy/recipe-registry.js";

/**
 * Host-provided, already-decrypted material for the delegated runtime. All
 * private-key material is decrypted by the host (`main.ts`) and passed as PEM;
 * this module never reads passphrase-protected envelopes directly.
 */
export interface DelegatedRuntimeConfig {
  ownerId: string;
  ownerKeyId: string;
  ownerPublicKeyPem: string;
  continuityKeyId: string;
  continuityPublicKeyPem: string;
  delegatedKeyId: string;
  delegatedPublicKeyPem: string;
  capabilitySigning: CapabilitySigningKeyMaterial;
  policyArtifactPath: string;
  policySignaturePath: string;
  /** Canonical broker workspace root (validated, host-realpath-resolved). */
  workspaceRoot: string;
  /** Bounded fixed-recipe registry the broker owns and executes from. */
  recipes: ReadonlyMap<string, FixedRecipe>;
  envAllowlist: Set<string>;
  executableMappings: ExecutableMappings;
  /**
   * Broker-resolved source identities (SANDBOX-ISOLATION-01): bounded ids
   * to read-only roots, read from the host `ASHLEY_SANDBOX_SOURCE_IDENTITY_<ID>`
   * seam. A `default` identity is always derived for the first read-only
   * root when absent, preserving single-root semantics for tasks that do
   * not bind an identity.
   */
  sourceIdentities?: ReadonlyMap<string, string>;
  /** Readiness-only label of the host-selected network provider. */
  networkProvider: "unavailable" | "none";
}

export type DelegatedRuntimeReadiness = {
  enabled: boolean;
  ready: boolean;
  ownerKeyId: string;
  delegatedKeyId: string;
  capabilityKeyId: string;
  continuityKeyId: string;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: string | null;
  signerClass: "delegated_runtime";
  networkMode: "unavailable" | "none";
  /**
   * Truthful isolation readiness (R5A). True only when the configured
   * provider's host prerequisites are verified — never merely because
   * isolation code exists. `networkMode` labels the configured seam;
   * this field reports whether that seam is actually operational.
   */
  networkIsolationOperational: boolean;
  maxConcurrentTasks: number;
};

export type SandboxBrokerSessionSnapshot = {
  sessionUuid: string;
  ownerId: string;
  role: BrokerSandboxRole;
  state: SandboxSessionState;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  workspaceId: string | null;
  allowedCapabilities: readonly SandboxCapabilityId[];
  maxToolExecutions: number;
  toolExecutionsUsed: number;
  expiresAt: string;
  revision: number;
};

export type WorkspaceCreateResult =
  | { ok: true; workspaceId: string; treeRoot: string; manifestHash: string }
  | { ok: false; errorCode: string; reason: string };

export type WorkspaceCheckResult = {
  valid: boolean;
  treeRoot?: string;
  removedTree?: boolean;
};

export interface ReservedNonceStore {
  reserve: (nonce: string) => boolean;
}

export interface DelegatedRuntimeDependencies {
  ledger: BrokerSessionLedger;
  nowMs: () => number;
  auditSink: (record: BrokerAuditRecord) => void;
  nonceStore: ReservedNonceStore;
  processRunner: ProcessRunner;
  /** Host-instantiated, fail-closed network isolation provider. */
  networkIsolation: NetworkIsolationProvider;
  /** Optional host-selected execution isolation provider. */
  executionIsolation?: ExecutionIsolationProvider;
}

function isBoundedString(value: unknown, max: number, min = 1): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function boundedString(value: unknown, max: number, min = 1): string | null {
  return isBoundedString(value, max, min) ? value : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return true;
}

function toSessionSnapshot(session: BrokerSandboxSession): SandboxBrokerSessionSnapshot {
  return {
    sessionUuid: session.sessionUuid,
    ownerId: session.ownerId,
    role: session.role,
    state: session.state,
    policyId: session.policyId,
    policyVersion: session.policyVersion,
    policyHash: session.policyHash,
    workspaceId: session.workspaceId ?? null,
    allowedCapabilities: session.allowedCapabilities,
    maxToolExecutions: session.maxToolExecutions,
    toolExecutionsUsed: session.toolExecutionsUsed,
    expiresAt: session.expiresAt,
    revision: session.revision,
  };
}

function mapSessionResult(
  raw: ServiceResult<BrokerSandboxSession>,
): ServiceResult<SandboxBrokerSessionSnapshot> {
  if (!raw.ok) return { ok: false, errorCode: raw.errorCode, reason: raw.reason };
  return { ok: true, value: toSessionSnapshot(raw.value) };
}

function envForAllowlist(allowlist: Set<string>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {
    PATH: process.env.ASHLEY_SANDBOX_RECIPE_PATH ?? "/usr/bin:/bin",
  };
  for (const key of allowlist) {
    if (key === "PATH") continue;
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  return out;
}

export class DelegatedRuntime {
  private readonly config: DelegatedRuntimeConfig;
  private readonly activePolicy: ActiveVerifiedSandboxPolicy;
  private readonly trustedDelegatedKey: DelegatedTrustedKeyConfig;
  private readonly capabilitySigner: BrokerCapabilitySigner;
  private readonly sessionService: BrokerSessionService;
  private readonly executionService: FixedRecipeExecutionService;
  private readonly networkIsolation: NetworkIsolationProvider;
  private readonly deps: DelegatedRuntimeDependencies;
  private readonly trustedOwnerApprovalKeys: OwnerApprovalVerifierConfig;
  private readonly rootConfig: BrokerRootConfig;
  private readonly ownerKeyId: string;

  private constructor(init: {
    config: DelegatedRuntimeConfig;
    deps: DelegatedRuntimeDependencies;
    activePolicy: ActiveVerifiedSandboxPolicy;
    capabilitySigner: BrokerCapabilitySigner;
    trustedDelegatedKey: DelegatedTrustedKeyConfig;
    ownerApprovalKeys: ApprovalKeyConfig[];
    sessionService: BrokerSessionService;
    executionService: FixedRecipeExecutionService;
    networkIsolation: NetworkIsolationProvider;
    rootConfig: BrokerRootConfig;
  }) {
    this.config = init.config;
    this.deps = init.deps;
    this.activePolicy = init.activePolicy;
    this.capabilitySigner = init.capabilitySigner;
    this.trustedDelegatedKey = init.trustedDelegatedKey;
    this.trustedOwnerApprovalKeys = { keys: init.ownerApprovalKeys };
    this.sessionService = init.sessionService;
    this.executionService = init.executionService;
    this.networkIsolation = init.networkIsolation;
    this.rootConfig = init.rootConfig;
    this.ownerKeyId = init.config.ownerKeyId;
  }

  readiness(): DelegatedRuntimeReadiness {
    const networkIsolationOperational =
      this.networkIsolation.status() === "operational";
    const maxConcurrentTasks = Array.from(this.config.recipes.values()).some(
      (recipe) => recipe.supported,
    )
      ? 1
      : 0;
    const materialReady =
      this.ownerKeyId.trim().length > 0 &&
      this.config.delegatedKeyId.trim().length > 0 &&
      this.config.continuityKeyId.trim().length > 0 &&
      this.capabilitySigner.keyId.trim().length > 0 &&
      typeof this.activePolicy.policyId === "string" &&
      this.activePolicy.policyId.length > 0 &&
      Number.isInteger(this.activePolicy.policyVersion) &&
      this.activePolicy.policyVersion > 0 &&
      /^[0-9a-f]{64}$/.test(this.activePolicy.policyHash);
    const ready =
      materialReady &&
      this.config.networkProvider === "none" &&
      networkIsolationOperational &&
      maxConcurrentTasks > 0;
    return {
      enabled: true,
      ready,
      ownerKeyId: this.ownerKeyId,
      delegatedKeyId: this.config.delegatedKeyId,
      capabilityKeyId: this.capabilitySigner.keyId,
      continuityKeyId: this.config.continuityKeyId,
      policyId: this.activePolicy.policyId ?? null,
      policyVersion: this.activePolicy.policyVersion ?? null,
      policyHash: this.activePolicy.policyHash ?? null,
      signerClass: "delegated_runtime",
      networkMode: this.config.networkProvider,
      networkIsolationOperational,
      maxConcurrentTasks,
    };
  }

  async handle(messageType: string, payload: unknown, ctx: RequestContext): Promise<BrokerResponse<unknown>> {
    switch (messageType) {
      case "sandbox.readiness":
        return { ok: true, data: this.readiness() };
      case "sandbox.authorizeDelegated":
        return this.authorizeDelegated(payload);
      case "sandbox.session.create":
        return this.sessionCreate(payload, ctx);
      case "sandbox.session.get":
        return this.sessionGet(payload);
      case "sandbox.session.activate":
        return this.sessionActivate(payload);
      case "sandbox.session.transition":
        return this.sessionTransition(payload);
      case "sandbox.session.resume":
      case "sandbox.ownerApproval.resume":
        return this.sessionResume(payload);
      case "sandbox.session.issueCapability":
        return this.sessionIssueCapability(payload);
      case "sandbox.workspace.create":
        return this.workspaceCreate(payload);
      case "sandbox.workspace.revalidate":
        return this.workspaceRevalidate(payload);
      case "sandbox.workspace.cleanup":
        return this.workspaceCleanup(payload);
      case "sandbox.recipe.execute":
        return this.recipeExecute(payload, ctx);
      default:
        return {
          ok: false,
          errorCode: "unknown_message",
          message: `unknown sandbox message type: ${messageType}`,
        };
    }
  }

  private authorizeDelegated(payload: unknown): BrokerResponse<BrokerDelegatedAuthorizationResult> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const envelope = payload.envelope;
    const nowMs = payload.nowMs;
    if (!isPlainRecord(envelope) || typeof envelope.signature !== "string") {
      return { ok: false, errorCode: "request_invalid", message: "envelope with signature required" };
    }
    if (!Number.isFinite(nowMs as number)) {
      return { ok: false, errorCode: "invalid_clock", message: "invalid now_ms" };
    }
    const result = authorizeDelegatedSandboxRequest({
      envelope: envelope as unknown as DelegatedApprovalEnvelope,
      trustedDelegatedKey: this.trustedDelegatedKey,
      activePolicy: this.activePolicy,
      trustedOwnerId: this.config.ownerId,
      trustedOwnerPolicyKeyIds: new Set([this.ownerKeyId]),
      reserveNonce: (nonce) => this.deps.nonceStore.reserve(nonce),
      nowMs: nowMs as number,
      rootConfig: this.rootConfig,
      trustedOwnerApprovalKeys: this.trustedOwnerApprovalKeys,
      auditSink: this.deps.auditSink,
    });
    return { ok: true, data: result };
  }

  private sessionCreate(payload: unknown, ctx: RequestContext): BrokerResponse<ServiceResult<SandboxBrokerSessionSnapshot>> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const ownerId = boundedString(payload.ownerId, 128);
    const proposalId = boundedString(payload.proposalId, 256);
    const role = payload.role;
    const nowMs = payload.nowMs;
    if (ownerId === null || proposalId === null) {
      return { ok: false, errorCode: "request_invalid", message: "owner_id and proposal_id required" };
    }
    if (typeof role !== "string") {
      return { ok: false, errorCode: "request_invalid", message: "role required" };
    }
    if (!Number.isFinite(nowMs as number)) {
      return { ok: false, errorCode: "invalid_clock", message: "invalid now_ms" };
    }
    if (ownerId !== ctx.ownerId) {
      return { ok: false, errorCode: "owner_mismatch", message: "owner mismatch" };
    }
    const allowed = Array.isArray(payload.allowedCapabilities)
      ? payload.allowedCapabilities.map((v) => String(v))
      : [];
    if (allowed.length > 32) {
      return { ok: false, errorCode: "request_invalid", message: "capability list out of bounds" };
    }
    const result = this.sessionService.createSession({
      ownerId,
      proposalId,
      role: role as BrokerSandboxRole,
      activePolicy: this.activePolicy,
      allowedCapabilities: allowed as SandboxCapabilityId[],
      maxToolExecutions: Number(payload.maxToolExecutions) || 0,
      expiresAtMs: Number(payload.expiresAtMs) || 0,
      ...(payload.workspace && isPlainRecord(payload.workspace)
        ? {
            workspace: {
              workspaceId: String(payload.workspace.workspaceId),
              workspaceManifestHash: String(payload.workspace.workspaceManifestHash),
            },
          }
        : {}),
      nowMs: nowMs as number,
    });
    return { ok: true, data: mapSessionResult(result) };
  }

  private sessionGet(payload: unknown): BrokerResponse<SandboxBrokerSessionSnapshot | null> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const sessionUuid = boundedString(payload.sessionUuid, 64);
    if (sessionUuid === null) {
      return { ok: false, errorCode: "request_invalid", message: "session_uuid required" };
    }
    const session = this.sessionService.getSession(sessionUuid);
    return { ok: true, data: session === null ? null : toSessionSnapshot(session) };
  }

  private sessionActivate(payload: unknown): BrokerResponse<ServiceResult<SandboxBrokerSessionSnapshot>> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const sessionUuid = boundedString(payload.sessionUuid, 64);
    const expectedRevision = Number(payload.expectedRevision);
    const nowMs = Number(payload.nowMs);
    if (sessionUuid === null) {
      return { ok: false, errorCode: "request_invalid", message: "session_uuid required" };
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return { ok: false, errorCode: "request_invalid", message: "expected_revision required" };
    }
    if (!Number.isFinite(nowMs)) {
      return { ok: false, errorCode: "invalid_clock", message: "invalid now_ms" };
    }
    const result = this.sessionService.activateSession(sessionUuid, expectedRevision, nowMs);
    return { ok: true, data: mapSessionResult(result) };
  }

  private sessionTransition(payload: unknown): BrokerResponse<ServiceResult<SandboxBrokerSessionSnapshot>> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const sessionUuid = boundedString(payload.sessionUuid, 64);
    const to = boundedString(payload.to, 32);
    if (sessionUuid === null || to === null) {
      return { ok: false, errorCode: "request_invalid", message: "session_uuid and target state required" };
    }
    const input = payload.input;
    const expectedRevision = isPlainRecord(input) ? Number(input.expectedRevision) : NaN;
    const nowMs = isPlainRecord(input) ? Number(input.nowMs) : NaN;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return { ok: false, errorCode: "request_invalid", message: "expected_revision required" };
    }
    const result = this.sessionService.transitionSession(
      sessionUuid,
      to as "awaiting_owner" | "completed" | "aborted",
      { expectedRevision, nowMs: Number.isFinite(nowMs) ? nowMs : undefined },
    );
    return { ok: true, data: mapSessionResult(result) };
  }

  private sessionResume(payload: unknown): BrokerResponse<ServiceResult<SandboxBrokerSessionSnapshot>> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const sessionUuid = boundedString(payload.sessionUuid, 64);
    const input = payload.input;
    if (sessionUuid === null || !isPlainRecord(input)) {
      return { ok: false, errorCode: "request_invalid", message: "session_uuid and input required" };
    }
    const ownerAuthorization = input.ownerAuthorization;
    if (!isPlainRecord(ownerAuthorization)) {
      return { ok: false, errorCode: "request_invalid", message: "owner_authorization required" };
    }
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return { ok: false, errorCode: "request_invalid", message: "expected_revision required" };
    }
    const nowMs = Number(input.nowMs);
    const result = this.sessionService.resumeSession(sessionUuid, {
      expectedRevision,
      ownerAuthorization: {
        authorizationId: String(ownerAuthorization.authorizationId),
        ownerId: String(ownerAuthorization.ownerId),
        policyHash: String(ownerAuthorization.policyHash),
        authorizedAtMs: Number(ownerAuthorization.authorizedAtMs),
      },
      nowMs: Number.isFinite(nowMs) ? nowMs : undefined,
    });
    return { ok: true, data: mapSessionResult(result) };
  }

  private sessionIssueCapability(payload: unknown): BrokerResponse<ServiceResult<SignedSandboxSessionCapability>> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const sessionUuid = boundedString(payload.sessionUuid, 64);
    const capabilityId = boundedString(payload.capabilityId, 64);
    if (sessionUuid === null || capabilityId === null) {
      return { ok: false, errorCode: "request_invalid", message: "session_uuid and capability_id required" };
    }
    const input = isPlainRecord(payload.input) ? payload.input : {};
    const ttlMs = Number(input.ttlMs);
    const nowMs = Number(input.nowMs);
    const result = this.sessionService.issueSessionCapability(sessionUuid, capabilityId as SandboxCapabilityId, {
      ttlMs: Number.isFinite(ttlMs) ? ttlMs : undefined,
      nowMs: Number.isFinite(nowMs) ? nowMs : undefined,
    });
    return { ok: true, data: result };
  }

  private async workspaceCreate(payload: unknown): Promise<BrokerResponse<WorkspaceCreateResult>> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const input = payload.input;
    if (!isPlainRecord(input)) {
      return { ok: false, errorCode: "request_invalid", message: "input required" };
    }
    const envelope = input.envelope;
    if (!isPlainRecord(envelope) || typeof envelope.signature !== "string") {
      return { ok: false, errorCode: "request_invalid", message: "envelope with signature required" };
    }
    const nowMs = Number(input.nowMs);
    if (!Number.isFinite(nowMs)) {
      return { ok: false, errorCode: "invalid_clock", message: "invalid now_ms" };
    }
    const authorization = await authorizeDelegatedSandboxRequest({
      envelope: envelope as unknown as DelegatedApprovalEnvelope,
      trustedDelegatedKey: this.trustedDelegatedKey,
      activePolicy: this.activePolicy,
      trustedOwnerId: this.config.ownerId,
      trustedOwnerPolicyKeyIds: new Set([this.ownerKeyId]),
      reserveNonce: (nonce) => this.deps.nonceStore.reserve(nonce),
      nowMs,
      rootConfig: this.rootConfig,
      trustedOwnerApprovalKeys: this.trustedOwnerApprovalKeys,
      auditSink: this.deps.auditSink,
    });
    if (!authorization.ok) {
      return { ok: false, errorCode: authorization.errorCode, message: authorization.reason };
    }
    if (authorization.decision !== "autonomous_safe") {
      return {
        ok: false,
        errorCode: "unsupported_decision",
        message: `workspace create requires autonomous_safe, got ${authorization.decision}`,
      };
    }
    const ttlMs = Number(input.ttlMs);
    const sourceRootId =
      typeof input.sourceRootId === "string" && input.sourceRootId.length > 0
        ? input.sourceRootId
        : "default";
    const created = await createDisposableWorkspace({
      authorization: {
        decision: "autonomous_safe",
        capability: authorization.capability,
        policyId: authorization.policyId,
        policyVersion: authorization.policyVersion,
        policyHash: authorization.policyHash,
        ownerId: this.config.ownerId,
        proposalId: (envelope as unknown as DelegatedApprovalEnvelope).proposalId,
        sessionUuid: (envelope as unknown as DelegatedApprovalEnvelope).sessionUuid ?? null,
        workspaceBytesMax: authorization.effectiveLimits.workspaceBytesMax,
      },
      rootConfig: this.rootConfig,
      sourceRootId,
      limits: { ttlMs: Number.isFinite(ttlMs) ? ttlMs : undefined },
      symlinkPolicy: "skip",
      nowMs,
    });
    if (!created.ok) {
      return { ok: false, errorCode: created.errorCode, message: created.reason };
    }
    return {
      ok: true,
      data: {
        ok: true,
        workspaceId: created.workspaceId,
        treeRoot: created.treeRoot,
        manifestHash: sha256Hex(serializeDisposableWorkspaceManifest(created.manifest)),
      },
    };
  }

  private async workspaceRevalidate(payload: unknown): Promise<BrokerResponse<WorkspaceCheckResult>> {
    const check = this.parseWorkspaceRef(payload);
    if (!check.ok) return check;
    const result: RevalidateWorkspaceResult = revalidateDisposableWorkspace({
      workspaceId: check.data.workspaceId,
      rootConfig: this.rootConfig,
      nowMs: check.data.nowMs,
    });
    return {
      ok: true,
      data: {
        valid: result.ok,
        ...(result.ok ? { treeRoot: result.locations.treeRoot } : {}),
      },
    };
  }

  private async workspaceCleanup(payload: unknown): Promise<BrokerResponse<WorkspaceCheckResult>> {
    const check = this.parseWorkspaceRef(payload);
    if (!check.ok) return check;
    const result: CleanupWorkspaceResult = cleanupDisposableWorkspace({
      workspaceId: check.data.workspaceId,
      rootConfig: this.rootConfig,
    });
    return {
      ok: true,
      data: {
        valid: result.ok,
        ...(result.ok ? { removedTree: result.removedTree, treeRoot: result.treeRoot } : {}),
      },
    };
  }

  private parseWorkspaceRef(
    payload: unknown,
  ): BrokerResponse<{ workspaceId: string; nowMs: number }> {
    if (!isPlainRecord(payload)) {
      return { ok: false, errorCode: "request_invalid", message: "payload must be an object" };
    }
    const workspaceId = boundedString(payload.workspaceId, 64);
    const nowMs = Number(payload.nowMs);
    if (workspaceId === null || !Number.isFinite(nowMs)) {
      return { ok: false, errorCode: "request_invalid", message: "workspace_id and now_ms required" };
    }
    return { ok: true, data: { workspaceId, nowMs } };
  }

  private async recipeExecute(payload: unknown, ctx: RequestContext): Promise<BrokerResponse<FixedRecipeExecutionResult>> {
    if (!isPlainRecord(payload) || !isPlainRecord(payload.request)) {
      return { ok: false, errorCode: "request_invalid", message: "request required" };
    }
    if (ctx.peerOwnerId !== ctx.ownerId) {
      return { ok: false, errorCode: "peer_unauthorized", message: "peer ownership mismatch" };
    }
    const executed = await this.executionService.executeFixedRecipe(
      payload.request as unknown as FixedRecipeExecutionRequest,
    );
    return { ok: true, data: executed };
  }

  static create(config: DelegatedRuntimeConfig, deps: DelegatedRuntimeDependencies): DelegatedRuntime {
    const policyPathCanonical = toCanonicalBrokerPath(config.policyArtifactPath);
    if (!policyPathCanonical.ok) {
      throw new Error("sandbox_delegated_runtime: policy_artifact_path_not_canonical");
    }
    const signaturePath = config.policySignaturePath
      ? toCanonicalBrokerPath(config.policySignaturePath)
      : undefined;
    if (signaturePath && !signaturePath.ok) {
      throw new Error("sandbox_delegated_runtime: policy_signature_path_not_canonical");
    }
    const signatureCanonical = signaturePath?.ok ? signaturePath.value : undefined;
    const ownerPublicKey: KeyObject = ownerPolicyKeyFromPem(config.ownerPublicKeyPem);
    const delegatedPublicKey: KeyObject = createPublicKey(config.delegatedPublicKeyPem);

    const loaded: DelegatedPolicyLoadResult = loadVerifiedDelegatedPolicy({
      artifactPath: policyPathCanonical.value,
      signaturePath: signatureCanonical,
      keys: [{ keyId: config.ownerKeyId, publicKey: ownerPublicKey }],
      enabled: true,
      nowMs: deps.nowMs(),
    });
    if (!loaded.ok) {
      throw new Error(`sandbox_delegated_runtime: policy_load_failed:${loaded.reason}`);
    }
    if (!("policy" in loaded)) {
      throw new Error("sandbox_delegated_runtime: policy_load_failed:disabled");
    }
    const activePolicy: ActiveVerifiedSandboxPolicy = {
      policy: loaded.policy,
      policyId: loaded.policy.policyId,
      policyVersion: loaded.policy.policyVersion,
      policyHash: loaded.policyHash,
      signerKeyId: loaded.signerKeyId,
    };

    const readOnlyRoots = loaded.policy.readOnlyRoots;
    const sourceIdentities = new Map<string, string>(config.sourceIdentities ?? []);
    if (!sourceIdentities.has("default") && readOnlyRoots.length > 0) {
      sourceIdentities.set("default", readOnlyRoots[0]);
    }
    const rootConfigValidation = validateBrokerRootConfig({
      workspaceRoot: config.workspaceRoot,
      readOnlyRoots,
      writableDisposableRoots: loaded.policy.writableDisposableRoots,
      protectedRoots: toProtectedRootsConfig(loaded.policy.protectedRoots),
      sourceIdentities,
    });
    if (!rootConfigValidation.ok) {
      throw new Error(`sandbox_delegated_runtime: root_config_invalid:${rootConfigValidation.reasons.join(",")}`);
    }
    const rootConfig = rootConfigValidation.value;

    const capabilitySignerResult = createBrokerCapabilitySigner(config.capabilitySigning);
    if (!capabilitySignerResult.ok) {
      throw new Error(`sandbox_delegated_runtime: capability_signer_unavailable:${capabilitySignerResult.errorCode}`);
    }

    const trustedDelegatedKey: DelegatedTrustedKeyConfig = {
      keyId: config.delegatedKeyId,
      publicKey: delegatedPublicKey,
    };

    const ownerApprovalKeys: ApprovalKeyConfig[] = [
      { keyId: config.ownerKeyId, publicKey: ownerPublicKey },
    ];

    const sessionService = new BrokerSessionService({
      ledger: deps.ledger,
      capabilitySigningMaterial: config.capabilitySigning,
      nowMs: deps.nowMs,
    });

    const executionService = new FixedRecipeExecutionService({
      sessionService,
      trustedDelegatedKey,
      activePolicy,
      trustedOwnerId: config.ownerId,
      trustedOwnerPolicyKeyIds: new Set([config.ownerKeyId]),
      trustedOwnerApprovalKeys: { keys: ownerApprovalKeys },
      reserveNonce: (nonce) => deps.nonceStore.reserve(nonce),
      rootConfig,
      processRunner: deps.processRunner,
      networkIsolation: deps.networkIsolation,
      executionIsolation: deps.executionIsolation,
      executableMappings: config.executableMappings,
      registry: config.recipes,
      environmentSource: () => envForAllowlist(config.envAllowlist),
      auditSink: deps.auditSink,
      nowMs: deps.nowMs,
    });

    return new DelegatedRuntime({
      config,
      deps,
      activePolicy,
      capabilitySigner: capabilitySignerResult.signer,
      trustedDelegatedKey,
      ownerApprovalKeys,
      sessionService,
      executionService,
      networkIsolation: deps.networkIsolation,
      rootConfig,
    });
  }
}

export function createRuntimeNonceStore(): ReservedNonceStore & { reserved: Set<string> } {
  const reserved = new Set<string>();
  return {
    reserved,
    reserve: (nonce: string) => {
      if (reserved.has(nonce)) return false;
      reserved.add(nonce);
      return true;
    },
  };
}
