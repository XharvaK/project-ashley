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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  type NetworkIsolationStatus,
  type ProcessRunner,
  type SandboxSessionState,
  type ServiceResult,
  type SignedSandboxSessionCapability,
} from "@composer-assistant/sandbox-broker";
import {
  canonicalizeSandboxPolicyPayload,
  type EngineeringAction,
  type SandboxCapabilityId,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import { DELEGATED_RUNTIME_KEY_ID } from "@composer-assistant/sandbox-broker";
import type { EngineeringToolResult } from "./engineering-types.js";
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
  readonly kind: "in_process_fake" | "unix_socket";

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

  /**
   * Dispatch a bounded engineering action to the broker (Autonomous
   * Engineering Workstation wave). The broker re-validates and authorizes the
   * structured action; the client only transports it.
   */
  engineeringAction(input: {
    envelope: DelegatedApprovalEnvelope;
    nowMs: number;
    action: EngineeringAction;
  }): Promise<EngineeringToolResult>;

  /**
   * Dispatch a bounded ashley-agent restart request (max one per incident,
   * cooldown-enforced). The broker decides and performs the restart.
   */
  agentRestart(input: {
    envelope: DelegatedApprovalEnvelope;
    nowMs: number;
    unit: string;
    incidentId: string;
    health: { healthy: boolean; deterministic: boolean };
    restartState: {
      incidentId: string;
      lastAttemptAtMs: number | null;
      attemptsForIncident: number;
      cooldownMs: number;
    };
  }): Promise<EngineeringToolResult>;

  getSession(sessionUuid: string): Promise<SandboxBrokerSessionSnapshot | null>;

  close(): void;
}

/**
 * Test-only diagnostics exposed by in-process fake clients. The production
 * operational interface (`SandboxBrokerClient`) does not carry local policy
 * documents, canonical path facts, or audit arrays — those are broker-owned
 * facts that must not be derived from a local copy. Orchestration modules that
 * require diagnostics accept `SandboxBrokerClient & SandboxBrokerClientTestDiagnostics`,
 * which only the in-process fake satisfies; the Unix socket client never does.
 */
export interface SandboxBrokerClientTestDiagnostics {
  readonly policy: ActiveVerifiedSandboxPolicy;
  readonly pathFacts: readonly CanonicalPathFact[];
  readonly liveFileCanonical: string;
  readonly audits: readonly BrokerAuditRecord[];
}

class FixtureNetworkIsolationProvider implements NetworkIsolationProvider {
  mode: "enforced" | "unavailable" = "enforced";
  enforceCalls = 0;

  async prepare(request: FakeRunRequest): Promise<NetworkIsolationEnforcement> {
    this.enforceCalls += 1;
    if (this.mode === "unavailable") return NETWORK_ISOLATION_UNAVAILABLE;
    return { ok: true, request };
  }

  status(): NetworkIsolationStatus {
    return this.mode === "enforced" ? "operational" : "unavailable";
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

function isDir(native: string): boolean {
  try {
    return statSync(native).isDirectory();
  } catch {
    return false;
  }
}

function isDescendant(target: string, ancestor: string): boolean {
  const rel = path.relative(ancestor, target);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function refuse(reason: string): EngineeringToolResult {
  return { ok: false, errorCode: "fake_refused", reason };
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

export class FakeSandboxBrokerClient implements SandboxBrokerClient, SandboxBrokerClientTestDiagnostics {
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

  async getSession(sessionUuid: string): Promise<SandboxBrokerSessionSnapshot | null> {
    const session = this.sessionService.getSession(sessionUuid);
    return session === null ? null : toSessionSnapshot(session);
  }

  async engineeringAction(input: {
    envelope: DelegatedApprovalEnvelope;
    nowMs: number;
    action: EngineeringAction;
  }): Promise<EngineeringToolResult> {
    // In-process fake: bounded local operations against the ephemeral roots.
    // Candidate repository writes, patch apply, and agent restart are rejected
    // here because the fake has no real broker runtime / systemd surface.
    const { action } = input;
    const f = action.fields as Record<string, unknown>;
    const rel = (v: unknown) => String(v ?? "");
    try {
      switch (action.type) {
        case "inspect_project_file":
        case "read_workspace_file": {
          const root = action.type === "inspect_project_file" ? this.sourceRoot : this.destinationRoot;
          const p = path.join(root, rel(f.relativePath));
          if (!isDescendant(p, root)) return refuse("path_escape");
          const buf = readFileSync(p, "utf8");
          return { ok: true, data: { content: buf, truncated: false, bytes: buf.length }, artifactRef: null };
        }
        case "list_project_directory":
        case "list_workspace_directory": {
          const root = action.type === "list_project_directory" ? this.sourceRoot : this.destinationRoot;
          const dir = path.join(root, rel(f.relativePath));
          if (!isDescendant(dir, root)) return refuse("path_escape");
          const entries = existsSync(dir) ? readdirSync(dir) : [];
          return { ok: true, data: { entries }, artifactRef: null };
        }
        case "search_project_text":
        case "search_workspace_text": {
          const root = action.type === "search_project_text" ? this.sourceRoot : this.destinationRoot;
          const needle = rel(f.pattern);
          const found: string[] = [];
          for (const name of readdirSync(root)) {
            if (found.length >= 100) break;
            const p = path.join(root, name);
            if (existsSync(p) && !isDir(p)) {
              const content = readFileSync(p, "utf8");
              if (content.includes(needle)) found.push(name);
            }
          }
          return { ok: true, data: { matches: found, truncated: false }, artifactRef: null };
        }
        case "write_workspace_file": {
          const p = path.join(this.destinationRoot, rel(f.relativePath));
          if (!isDescendant(p, this.destinationRoot)) return refuse("path_escape");
          mkdirSync(path.dirname(p), { recursive: true });
          const b64 = typeof f.contentBase64 === "string" ? f.contentBase64 : "";
          writeFileSync(p, Buffer.from(b64, "base64"), "binary");
          return { ok: true, data: { bytes: Buffer.from(b64, "base64").length }, artifactRef: null };
        }
        case "delete_workspace_file": {
          const p = path.join(this.destinationRoot, rel(f.relativePath));
          if (!isDescendant(p, this.destinationRoot)) return refuse("path_escape");
          if (existsSync(p)) rmSync(p, { force: true });
          return { ok: true, data: { deleted: true }, artifactRef: null };
        }
        case "run_diagnostic":
          return { ok: true, data: { stdout: "fake-diagnostic-ok", stderr: "", exitCode: 0 }, artifactRef: null };
        default:
          return refuse("not_supported_in_fake");
      }
    } catch (err) {
      return refuse(`fake_engineer_error:${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  async agentRestart(input: {
    envelope: DelegatedApprovalEnvelope;
    nowMs: number;
    unit: string;
    incidentId: string;
    health: { healthy: boolean; deterministic: boolean };
    restartState: {
      incidentId: string;
      lastAttemptAtMs: number | null;
      attemptsForIncident: number;
      cooldownMs: number;
    };
  }): Promise<EngineeringToolResult> {
    // The fake has no systemd surface; reject rather than fabricate a restart.
    return refuse("not_supported_in_fake");
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
