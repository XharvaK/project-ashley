/**
 * Injected sandbox broker client (Sandbox Wave 4, Commit 10).
 *
 * The loop never speaks a broker transport; it talks to an injected
 * `SandboxBrokerClient`. This commit provides only an in-process fake that
 * wraps the real broker library surfaces (session ledger/service, delegated
 * authorization, fixed-recipe execution, disposable workspace creation)
 * against ephemeral temp roots and fixture executables. The broker remains
 * the final authority for every tool action: every recipe execution
 * verifies the signed envelope, nonce, policy, session, capability and
 * workspace before reserving and running.
 */

import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BrokerSessionLedger,
  BrokerSessionService,
  FixedRecipeExecutionService,
  MAX_WORKSPACE_BYTES,
  NETWORK_ISOLATION_UNAVAILABLE,
  authorizeDelegatedSandboxRequest,
  createDisposableWorkspace,
  serializeDisposableWorkspaceManifest,
  sha256Hex,
  toCanonicalBrokerPath,
  type ActiveVerifiedSandboxPolicy,
  type BrokerAuditRecord,
  type BrokerDelegatedAuthorizationResult,
  type BrokerRootConfig,
  type BrokerSandboxRole,
  type BrokerSandboxSession,
  type CapabilitySigningKeyMaterial,
  type DelegatedApprovalEnvelope,
  type DelegatedTrustedKeyConfig,
  type FakeRunRequest,
  type FakeRunResult,
  type FixedRecipeExecutionEnvelope,
  type FixedRecipeExecutionRequest,
  type FixedRecipeExecutionResult,
  type NetworkIsolationEnforcement,
  type NetworkIsolationProvider,
  type ProcessRunner,
  type SandboxSessionState,
  type ServiceResult,
  type SignedSandboxSessionCapability,
} from "@composer-assistant/sandbox-broker";
import {
  canonicalizeSandboxPolicyPayload,
  type SandboxCapabilityId,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import { DELEGATED_RUNTIME_KEY_ID } from "@composer-assistant/sandbox-broker";
import type { CanonicalPathFact } from "./policy-context.js";

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

export function toSessionSnapshot(
  session: BrokerSandboxSession,
): SandboxBrokerSessionSnapshot {
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

export type SandboxWorkspaceResult =
  | { ok: true; workspaceId: string; treeRoot: string; manifestHash: string }
  | { ok: false; errorCode: string; reason: string };

export interface SandboxBrokerClient {
  readonly kind: "in_process_fake";
  readonly policy: ActiveVerifiedSandboxPolicy;
  readonly pathFacts: readonly CanonicalPathFact[];
  readonly liveFileCanonical: string;
  readonly audits: readonly BrokerAuditRecord[];

  authorizeRequest(
    envelope: DelegatedApprovalEnvelope,
    nowMs: number,
  ): Promise<BrokerDelegatedAuthorizationResult>;

  createSession(input: {
    ownerId: string;
    proposalId: string;
    role: BrokerSandboxRole;
    allowedCapabilities: readonly SandboxCapabilityId[];
    maxToolExecutions: number;
    expiresAtMs: number;
    workspace?: { workspaceId: string; workspaceManifestHash: string };
    nowMs: number;
  }): Promise<ServiceResult<SandboxBrokerSessionSnapshot>>;

  activateSession(
    sessionUuid: string,
    expectedRevision: number,
    nowMs: number,
  ): Promise<ServiceResult<SandboxBrokerSessionSnapshot>>;

  transitionSession(
    sessionUuid: string,
    to: "awaiting_owner" | "completed" | "aborted",
    input: { expectedRevision: number; nowMs?: number },
  ): Promise<ServiceResult<SandboxBrokerSessionSnapshot>>;

  /**
   * Owner-authorized resume (`awaiting_owner -> active`). The broker records
   * the owner authorization (idempotent by authorization id) in the same
   * transaction as the transition, increments the revision, preserves
   * budgets and never widens capabilities.
   */
  resumeSession(
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
  ): Promise<ServiceResult<SandboxBrokerSessionSnapshot>>;

  issueSessionCapability(
    sessionUuid: string,
    capabilityId: SandboxCapabilityId,
    input: { ttlMs?: number; nowMs?: number },
  ): Promise<ServiceResult<SignedSandboxSessionCapability>>;

  createWorkspace(input: {
    envelope: DelegatedApprovalEnvelope;
    nowMs: number;
    ttlMs?: number;
  }): Promise<SandboxWorkspaceResult>;

  executeRecipe(
    request: FixedRecipeExecutionRequest,
  ): Promise<FixedRecipeExecutionResult>;

  getSession(sessionUuid: string): SandboxBrokerSessionSnapshot | null;

  close(): void;
}

class FixtureNetworkIsolationProvider implements NetworkIsolationProvider {
  mode: "enforced" | "unavailable" = "enforced";
  enforceCalls = 0;

  async enforce(): Promise<NetworkIsolationEnforcement> {
    this.enforceCalls += 1;
    if (this.mode === "unavailable") return NETWORK_ISOLATION_UNAVAILABLE;
    return { ok: true };
  }
}

/**
 * Scripted process runner keyed by the exact argv vector. Defaults to a
 * successful "ok" run, mirroring the broker's fixture runner.
 */
export class SandboxRecipeRunner implements ProcessRunner {
  private readonly scripts = new Map<string, FakeRunResult>();

  script(argvKey: string, result: FakeRunResult): void {
    this.scripts.set(argvKey, result);
  }

  async run(request: FakeRunRequest): Promise<FakeRunResult> {
    const scripted = this.scripts.get(request.argv.join("\u0000"));
    if (scripted !== undefined) return scripted;
    return {
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      truncated: false,
      terminalReason: "success",
    };
  }
}

function canonicalTempRoot(prefix: string): string {
  const native = mkdtempSync(path.join(tmpdir(), prefix));
  return canonicalPathOf(native);
}

function canonicalPathOf(native: string): string {
  const result = toCanonicalBrokerPath(native);
  if (!result.ok) throw new Error(`path_not_canonical:${native}`);
  return result.value;
}

function capabilityKeyMaterial(): CapabilitySigningKeyMaterial {
  const pair = generateKeyPairSync("ed25519");
  return {
    keyId: "broker-session-capability-ed25519-v1",
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function policyHashOf(policy: SandboxPolicyDocument): string {
  const canonical = canonicalizeSandboxPolicyPayload(policy);
  if (!canonical.ok) throw new Error("policy_canonicalization_failed");
  return sha256Hex(Buffer.from(canonical.payload, "utf8"));
}

export type FakeSandboxBrokerClientOptions = {
  ownerId: string;
  /** The agent-side delegated public key this broker trusts (same keypair). */
  delegatedPublicKeyPem: string;
  policyOverrides?: Partial<SandboxPolicyDocument>;
  recipeIds?: readonly string[];
  nowMs?: () => number;
};

export class FakeSandboxBrokerClient implements SandboxBrokerClient {
  readonly kind = "in_process_fake" as const;
  readonly policy: ActiveVerifiedSandboxPolicy;
  readonly pathFacts: readonly CanonicalPathFact[];
  readonly liveFileCanonical: string;
  readonly audits: BrokerAuditRecord[] = [];
  readonly runner: SandboxRecipeRunner;
  readonly network: FixtureNetworkIsolationProvider;
  /** Fixture executable paths used by the execution service (test aid). */
  readonly executablePaths: Readonly<{ git: string; npm: string }>;
  /** Ephemeral base directory; removed by close() (test aid). */
  readonly baseDir: string;

  private readonly ownerId: string;
  private readonly base: string;
  private readonly sourceRoot: string;
  private readonly destinationRoot: string;
  private readonly workspaceRoot: string;
  private readonly delegatedPublicKeyPem: string;
  private readonly ledger: BrokerSessionLedger;
  private readonly sessionService: BrokerSessionService;
  private readonly executionService: FixedRecipeExecutionService;
  private readonly usedNonces = new Set<string>();
  private readonly nowMs: () => number;

  constructor(options: FakeSandboxBrokerClientOptions) {
    this.ownerId = options.ownerId;
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.delegatedPublicKeyPem = options.delegatedPublicKeyPem;

    this.base = mkdtempSync(path.join(tmpdir(), "ashley-orchestration-"));
    const sourceNative = path.join(this.base, "source");
    const destNative = path.join(this.base, "dest");
    mkdirSync(sourceNative, { recursive: true });
    mkdirSync(destNative, { recursive: true });
    this.sourceRoot = canonicalPathOf(sourceNative);
    this.destinationRoot = canonicalPathOf(destNative);
    this.workspaceRoot = canonicalPathOf(this.base);

    const liveFileNative = path.join(sourceNative, "README.md");
    writeFileSync(liveFileNative, "hello\n", "utf8");
    this.liveFileCanonical = canonicalPathOf(liveFileNative);

    const binDir = mkdtempSync(path.join(tmpdir(), "ashley-orchestration-bin-"));
    const gitFixture = path.join(binDir, "git-fixture.bin");
    const npmFixture = path.join(binDir, "npm-fixture.bin");
    writeFileSync(gitFixture, "fixture-git\n", "utf8");
    writeFileSync(npmFixture, "fixture-npm\n", "utf8");
    this.executablePaths = { git: gitFixture, npm: npmFixture };
    this.baseDir = this.base;
    const executableMappings = { git: gitFixture, npm: npmFixture };

    const recipeIds =
      options.recipeIds === undefined
        ? [
            "git:status",
            "git:diff",
            "git:log",
            "git:rev-parse",
            "verify:agent-tsc",
            "test:agent-vitest",
            "patch:generate",
          ]
        : [...options.recipeIds];

    const policyDoc: SandboxPolicyDocument = {
      policyId: "policy-orchestration-1",
      policyVersion: 1,
      issuedAt: "2026-08-06T00:00:00.000Z",
      allowedDelegatedSignerKeyIds: [DELEGATED_RUNTIME_KEY_ID],
      allowedCapabilities: [
        "approved_project_read",
        "candidate_workspace_create",
        "candidate_workspace_read_write_delete",
        "fixed_test_recipe",
        "fixed_build_recipe",
        "fixed_lint_verification_recipe",
      ],
      sessionRoles: ["sandbox_operator_light", "sandbox_operator_deep"],
      readOnlyRoots: [this.sourceRoot],
      writableDisposableRoots: [this.destinationRoot],
      protectedRoots: [
        {
          path: `${this.sourceRoot}/.git`,
          class: "delegated_write_denied_owner_approvable",
        },
      ],
      allowedRecipeIds: recipeIds,
      allowedExecutableIds: ["ashley-tools/check.sh"],
      resourceCeilings: {
        wallMsMax: 120_000,
        maxProcesses: 16,
        maxOutputBytes: 4_194_304,
        workspaceBytesMax: MAX_WORKSPACE_BYTES,
      },
      networkMode: "none",
      maxActiveSessions: 1,
      payloadVersion: 1,
      ...options.policyOverrides,
    };
    this.policy = {
      policy: policyDoc,
      policyId: policyDoc.policyId,
      policyVersion: policyDoc.policyVersion,
      policyHash: policyHashOf(policyDoc),
      signerKeyId: "owner-ed25519-v1",
    };

    this.ledger = new BrokerSessionLedger();
    this.sessionService = new BrokerSessionService({
      ledger: this.ledger,
      capabilitySigningMaterial: capabilityKeyMaterial(),
      nowMs: this.nowMs,
    });

    const trustedDelegatedKey: DelegatedTrustedKeyConfig = {
      keyId: DELEGATED_RUNTIME_KEY_ID,
      publicKey: createPublicKey(options.delegatedPublicKeyPem),
    };

    this.runner = new SandboxRecipeRunner();
    this.network = new FixtureNetworkIsolationProvider();
    this.executionService = new FixedRecipeExecutionService({
      sessionService: this.sessionService,
      trustedDelegatedKey,
      activePolicy: this.policy,
      trustedOwnerId: options.ownerId,
      trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
      reserveNonce: (nonce) => {
        if (this.usedNonces.has(nonce)) return false;
        this.usedNonces.add(nonce);
        return true;
      },
      rootConfig: this.rootConfig(),
      processRunner: this.runner,
      networkIsolation: this.network,
      executableMappings,
      environmentSource: () => ({ PATH: "/usr/bin:/bin" }),
      auditSink: (record) => this.audits.push(record),
      nowMs: this.nowMs,
    });

    this.pathFacts = [
      { claimedPath: this.sourceRoot, canonicalPath: this.sourceRoot },
      { claimedPath: this.liveFileCanonical, canonicalPath: this.liveFileCanonical },
      { claimedPath: this.destinationRoot, canonicalPath: this.destinationRoot },
      { claimedPath: this.workspaceRoot, canonicalPath: this.workspaceRoot },
    ];
  }

  async authorizeRequest(
    envelope: DelegatedApprovalEnvelope,
    nowMs: number,
  ): Promise<BrokerDelegatedAuthorizationResult> {
    return authorizeDelegatedSandboxRequest({
      envelope,
      trustedDelegatedKey: this.trustedKey(),
      activePolicy: this.policy,
      trustedOwnerId: this.ownerId,
      trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
      reserveNonce: (nonce) => {
        if (this.usedNonces.has(nonce)) return false;
        this.usedNonces.add(nonce);
        return true;
      },
      nowMs,
      rootConfig: this.rootConfig(),
      auditSink: (record) => this.audits.push(record),
    });
  }

  async createSession(input: {
    ownerId: string;
    proposalId: string;
    role: BrokerSandboxRole;
    allowedCapabilities: readonly SandboxCapabilityId[];
    maxToolExecutions: number;
    expiresAtMs: number;
    workspace?: { workspaceId: string; workspaceManifestHash: string };
    nowMs: number;
  }): Promise<ServiceResult<SandboxBrokerSessionSnapshot>> {
    const created = this.sessionService.createSession({
      ownerId: input.ownerId,
      proposalId: input.proposalId,
      role: input.role,
      activePolicy: this.policy,
      allowedCapabilities: [...input.allowedCapabilities],
      maxToolExecutions: input.maxToolExecutions,
      expiresAtMs: input.expiresAtMs,
      ...(input.workspace ? { workspace: input.workspace } : {}),
      nowMs: input.nowMs,
    });
    if (!created.ok) return created;
    return { ok: true, value: toSessionSnapshot(created.value) };
  }

  async activateSession(
    sessionUuid: string,
    expectedRevision: number,
    nowMs: number,
  ): Promise<ServiceResult<SandboxBrokerSessionSnapshot>> {
    const activated = this.sessionService.activateSession(
      sessionUuid,
      expectedRevision,
      nowMs,
    );
    if (!activated.ok) return activated;
    return { ok: true, value: toSessionSnapshot(activated.value) };
  }

  async transitionSession(
    sessionUuid: string,
    to: "awaiting_owner" | "completed" | "aborted",
    input: { expectedRevision: number; nowMs?: number },
  ): Promise<ServiceResult<SandboxBrokerSessionSnapshot>> {
    const transitioned = this.sessionService.transitionSession(
      sessionUuid,
      to,
      { expectedRevision: input.expectedRevision, nowMs: input.nowMs },
    );
    if (!transitioned.ok) return transitioned;
    return { ok: true, value: toSessionSnapshot(transitioned.value) };
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
    const resumed = this.sessionService.resumeSession(sessionUuid, {
      expectedRevision: input.expectedRevision,
      ownerAuthorization: {
        authorizationId: input.ownerAuthorization.authorizationId,
        ownerId: input.ownerAuthorization.ownerId,
        policyHash: input.ownerAuthorization.policyHash,
        authorizedAtMs: input.ownerAuthorization.authorizedAtMs,
      },
      nowMs: input.nowMs,
    });
    if (!resumed.ok) return resumed;
    return { ok: true, value: toSessionSnapshot(resumed.value) };
  }

  async issueSessionCapability(
    sessionUuid: string,
    capabilityId: SandboxCapabilityId,
    input: { ttlMs?: number; nowMs?: number },
  ): Promise<ServiceResult<SignedSandboxSessionCapability>> {
    return this.sessionService.issueSessionCapability(sessionUuid, capabilityId, {
      ttlMs: input.ttlMs,
      nowMs: input.nowMs,
    });
  }

  async createWorkspace(input: {
    envelope: DelegatedApprovalEnvelope;
    nowMs: number;
    ttlMs?: number;
  }): Promise<SandboxWorkspaceResult> {
    const authorization = await authorizeDelegatedSandboxRequest({
      envelope: input.envelope,
      trustedDelegatedKey: this.trustedKey(),
      activePolicy: this.policy,
      trustedOwnerId: this.ownerId,
      trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
      reserveNonce: (nonce) => {
        if (this.usedNonces.has(nonce)) return false;
        this.usedNonces.add(nonce);
        return true;
      },
      nowMs: input.nowMs,
      rootConfig: this.rootConfig(),
      auditSink: (record) => this.audits.push(record),
    });
    if (!authorization.ok) {
      return { ok: false, errorCode: authorization.errorCode, reason: authorization.reason };
    }
    const created = await createDisposableWorkspace({
      authorization: {
        decision: "autonomous_safe",
        capability: authorization.capability,
        policyId: authorization.policyId,
        policyVersion: authorization.policyVersion,
        policyHash: authorization.policyHash,
        ownerId: this.ownerId,
        proposalId: input.envelope.proposalId,
        sessionUuid: input.envelope.sessionUuid ?? null,
        workspaceBytesMax: authorization.effectiveLimits.workspaceBytesMax,
      },
      rootConfig: this.rootConfig(),
      sourceRoot: this.sourceRoot,
      limits: { ttlMs: input.ttlMs ?? 60_000 },
      symlinkPolicy: "skip",
      nowMs: input.nowMs,
    });
    if (!created.ok) {
      return { ok: false, errorCode: created.errorCode, reason: created.reason };
    }
    return {
      ok: true,
      workspaceId: created.workspaceId,
      treeRoot: created.treeRoot,
      manifestHash: sha256Hex(serializeDisposableWorkspaceManifest(created.manifest)),
    };
  }

  async executeRecipe(
    request: FixedRecipeExecutionRequest,
  ): Promise<FixedRecipeExecutionResult> {
    return this.executionService.executeFixedRecipe(request);
  }

  getSession(sessionUuid: string): SandboxBrokerSessionSnapshot | null {
    const session = this.sessionService.getSession(sessionUuid);
    return session === null ? null : toSessionSnapshot(session);
  }

  close(): void {
    try {
      rmSync(this.base, { recursive: true, force: true });
    } catch {
      // best-effort temp cleanup
    }
  }

  private trustedKey(): DelegatedTrustedKeyConfig {
    return {
      keyId: DELEGATED_RUNTIME_KEY_ID,
      publicKey: createPublicKey(this.delegatedPublicKeyPem),
    };
  }

  private rootConfig(): BrokerRootConfig {
    return {
      workspaceRoot: this.workspaceRoot,
      readOnlyRoots: [this.sourceRoot],
      writableDisposableRoots: [this.destinationRoot],
      protectedRoots: { delegatedWriteDeniedOwnerApprovable: [], absoluteDenial: [] },
    };
  }
}
