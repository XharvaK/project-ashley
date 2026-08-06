/**
 * Fixed-recipe execution test fixtures (Sandbox Wave 4, Commit 9).
 *
 * A complete in-memory/temp-directory harness: ephemeral delegated key,
 * active session policy rooted at temp directories, broker session ledger
 * and service, scripted process runner, fixture executables, a fake
 * network isolation provider, and envelope signing. The real Ashley
 * checkout is never used.
 */

import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { KeyObject } from "node:crypto";
import type { SandboxCapabilityId, SandboxPolicyDocument } from "@composer-assistant/sandbox-policy";
import {
  DELEGATED_RUNTIME_KEY_ID,
  signDelegatedApprovalEnvelope,
  type DelegatedApprovalEnvelope,
} from "../../crypto/delegated-approval.js";
import { randomNonce, sha256Hex } from "../../crypto/types.js";
import type { BrokerAuditRecord } from "../../execution/fixed-recipe-execution-service.js";
import { FixedRecipeExecutionService } from "../../execution/fixed-recipe-execution-service.js";
import type { NetworkIsolationEnforcement, NetworkIsolationProvider } from "../../execution/network-isolation.js";
import { NETWORK_ISOLATION_UNAVAILABLE } from "../../execution/network-isolation.js";
import type { ActiveVerifiedSandboxPolicy } from "../../policy/delegated-authorization.js";
import type { DelegatedTrustedKeyConfig } from "../../policy/delegated-authorization.js";
import { ScriptedProcessRunner } from "../../process/fake-runner.js";
import { BrokerSessionLedger } from "../../sessions/session-ledger.js";
import { BrokerSessionService } from "../../sessions/session-service.js";
import type { SignedSandboxSessionCapability } from "../../sessions/session-capability.js";
import type { BrokerSandboxSession } from "../../sessions/session-types.js";
import {
  createDisposableWorkspace,
  type DisposableWorkspaceAuthorization,
} from "../../workspace/workspace-create.js";
import { serializeDisposableWorkspaceManifest } from "../../workspace/workspace-manifest.js";
import { toCanonicalBrokerPath } from "../../policy/path.js";
import type { ExecutableMappings } from "../../execution/executable-resolver.js";
import { capabilityKeyMaterial, activeSessionPolicy } from "./session.js";
import { makeWorkspaceTestRoots, makeWorkspaceAuthorization, type WorkspaceTestRoots } from "./workspace.js";
import type { FixedRecipeExecutionEnvelope, FixedRecipeExecutionRequest } from "../../execution/execution-types.js";

export class FakeNetworkIsolationProvider implements NetworkIsolationProvider {
  mode: "enforced" | "unavailable" = "enforced";
  enforceCalls = 0;

  async enforce(): Promise<NetworkIsolationEnforcement> {
    this.enforceCalls += 1;
    if (this.mode === "unavailable") return NETWORK_ISOLATION_UNAVAILABLE;
    return { ok: true };
  }
}

export function delegatedKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function keyObjectFromPem(publicKeyPem: string): KeyObject {
  return createPublicKey(publicKeyPem);
}

export type ExecutionHarness = {
  base: string;
  roots: WorkspaceTestRoots;
  liveFile: string;
  binDir: string;
  gitFixture: string;
  npmFixture: string;
  privateKeyPem: string;
  trustedDelegatedKey: DelegatedTrustedKeyConfig;
  activePolicy: ActiveVerifiedSandboxPolicy;
  ledger: BrokerSessionLedger;
  sessionService: BrokerSessionService;
  runner: ScriptedProcessRunner;
  network: FakeNetworkIsolationProvider;
  executableMappings: ExecutableMappings;
  service: FixedRecipeExecutionService;
  usedNonces: Set<string>;
  audits: BrokerAuditRecord[];
  nowMs: () => number;
  close: () => void;
};

export function makeExecutionHarness(options: {
  recipeIds?: string[];
  nowMs?: number;
  harnessPolicy?: (policy: SandboxPolicyDocument) => SandboxPolicyDocument;
} = {}): ExecutionHarness {
  const nowMs = options.nowMs ?? Date.now();
  const keys = delegatedKeyPair();
  const roots = makeWorkspaceTestRoots();
  const liveFileNative = path.join(roots.base, "source", "README.md");
  writeFileSync(liveFileNative, "hello\n", "utf8");
  const liveFileCanonical = toCanonicalBrokerPath(liveFileNative);
  const liveFile = liveFileCanonical.ok ? liveFileCanonical.value : liveFileNative;
  const binDir = mkdtempSync(path.join(tmpdir(), "ashley-recipe-bin-"));
  const gitFixture = path.join(binDir, "git-fixture.bin");
  const npmFixture = path.join(binDir, "npm-fixture.bin");
  writeFileSync(gitFixture, "#!/bin/sh\necho fixture-git\n", "utf8");
  writeFileSync(npmFixture, "#!/bin/sh\necho fixture-npm\n", "utf8");

  const recipeIds = options.recipeIds ?? ["git:status"];
  const policy = {
    ...options.harnessPolicy?.(basePolicy(roots, recipeIds)) ?? basePolicy(roots, recipeIds),
  };
  const activePolicy = activeSessionPolicy(policy, "owner-ed25519-v1");

  const ledger = new BrokerSessionLedger();
  const sessionService = new BrokerSessionService({
    ledger,
    capabilitySigningMaterial: capabilityKeyMaterial(),
  });
  const runner = new ScriptedProcessRunner();
  const network = new FakeNetworkIsolationProvider();
  const usedNonces = new Set<string>();
  const audits: BrokerAuditRecord[] = [];
  const service = new FixedRecipeExecutionService({
    sessionService,
    trustedDelegatedKey: {
      keyId: DELEGATED_RUNTIME_KEY_ID,
      publicKey: keyObjectFromPem(keys.publicKeyPem),
    },
    activePolicy,
    trustedOwnerId: "owner-1",
    trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
    reserveNonce: (nonce) => {
      if (usedNonces.has(nonce)) return false;
      usedNonces.add(nonce);
      return true;
    },
    rootConfig: roots.rootConfig,
    processRunner: runner,
    networkIsolation: network,
    executableMappings: { git: gitFixture, npm: npmFixture },
    environmentSource: () => ({ PATH: process.env.PATH ?? "/usr/bin:/bin" }),
    auditSink: (record) => audits.push(record),
    nowMs: () => nowMs,
  });

  return {
    base: roots.base,
    roots,
    liveFile,
    binDir,
    gitFixture,
    npmFixture,
    privateKeyPem: keys.privateKeyPem,
    trustedDelegatedKey: {
      keyId: DELEGATED_RUNTIME_KEY_ID,
      publicKey: keyObjectFromPem(keys.publicKeyPem),
    },
    activePolicy,
    ledger,
    sessionService,
    runner,
    network,
    executableMappings: { git: gitFixture, npm: npmFixture },
    service,
    usedNonces,
    audits,
    nowMs: () => nowMs,
    close: () => {
      // in-memory ledger; nothing to close
    },
  };
}

function basePolicy(
  roots: WorkspaceTestRoots,
  recipeIds: string[],
): SandboxPolicyDocument {
  return {
    policyId: "policy-execution-1",
    policyVersion: 3,
    issuedAt: "2026-08-05T00:00:00.000Z",
    allowedDelegatedSignerKeyIds: [DELEGATED_RUNTIME_KEY_ID],
    allowedCapabilities: [
      "approved_project_read",
      "candidate_workspace_create",
      "candidate_workspace_read_write_delete",
    ],
    sessionRoles: ["sandbox_operator_light", "sandbox_operator_deep"],
    readOnlyRoots: [roots.sourceRoot],
    writableDisposableRoots: [roots.destinationRoot],
    protectedRoots: [
      { path: `${roots.sourceRoot}/.git`, class: "delegated_write_denied_owner_approvable" },
    ],
    allowedRecipeIds: recipeIds,
    allowedExecutableIds: ["ashley-tools/check.sh"],
    resourceCeilings: {
      wallMsMax: 120_000,
      maxProcesses: 16,
      maxOutputBytes: 4_194_304,
      workspaceBytesMax: 2_000_000_000,
    },
    networkMode: "none",
    maxActiveSessions: 1,
    payloadVersion: 1,
  };
}

export type ActiveSessionFixture = {
  session: BrokerSandboxSession;
  capability: SignedSandboxSessionCapability;
};

export function createActiveSession(
  harness: ExecutionHarness,
  options: {
    capabilityId?: SandboxCapabilityId;
    maxToolExecutions?: number;
    workspace?: { workspaceId: string; workspaceManifestHash: string };
  } = {},
): { ok: true; session: ActiveSessionFixture } | { ok: false; errorCode: string; reason: string } {
  const capabilityId = options.capabilityId ?? "approved_project_read";
  const nowMs = harness.nowMs();
  const created = harness.sessionService.createSession({
    ownerId: "owner-1",
    proposalId: "prop-1",
    role: "sandbox_operator_light",
    activePolicy: harness.activePolicy,
    allowedCapabilities: [capabilityId],
    maxToolExecutions: options.maxToolExecutions ?? 100,
    expiresAtMs: nowMs + 3_600_000,
    ...(options.workspace ? { workspace: options.workspace } : {}),
    nowMs,
  });
  if (!created.ok) return { ok: false, errorCode: created.errorCode, reason: created.reason };
  const activated = harness.sessionService.activateSession(created.value.sessionUuid, 1, nowMs);
  if (!activated.ok) return { ok: false, errorCode: activated.errorCode, reason: activated.reason };
  const capability = harness.sessionService.issueSessionCapability(
    created.value.sessionUuid,
    capabilityId,
    { ttlMs: 60_000, nowMs },
  );
  if (!capability.ok) {
    return { ok: false, errorCode: capability.errorCode, reason: capability.reason };
  }
  return {
    ok: true,
    session: { session: activated.value, capability: capability.value },
  };
}

export function signExecutionEnvelope(
  harness: ExecutionHarness,
  partial: Partial<DelegatedApprovalEnvelope>,
  nowMs = harness.nowMs(),
): DelegatedApprovalEnvelope {
  return signDelegatedApprovalEnvelope(
    {
      protocolVersion: 1,
      keyId: DELEGATED_RUNTIME_KEY_ID,
      signerClass: "delegated_runtime",
      proposalId: "prop-1",
      ownerId: "owner-1",
      sessionUuid: "unset",
      capabilityId: "approved_project_read",
      authoritativeRiskClass: "low",
      canonicalTargetPaths: [{ path: harness.liveFile, intent: "read" }],
      policyRuleId: "sandbox-policy/rule/low",
      policyId: harness.activePolicy.policyId,
      policyVersion: harness.activePolicy.policyVersion,
      policyHash: harness.activePolicy.policyHash,
      recipeId: "git:status",
      networkMode: "none",
      persistence: "temporary",
      externalSideEffect: false,
      issuedAt: nowMs,
      expiresAt: nowMs + 60_000,
      nonce: randomNonce(),
      ...partial,
    },
    harness.privateKeyPem,
  );
}

export function makeExecutionRequest(
  harness: ExecutionHarness,
  active: ActiveSessionFixture,
  partial: Partial<DelegatedApprovalEnvelope> = {},
  requestOverrides: Partial<FixedRecipeExecutionRequest> = {},
  nowMs = harness.nowMs(),
): FixedRecipeExecutionRequest {
  return {
    envelope: signExecutionEnvelope(
      harness,
      {
        sessionUuid: active.session.sessionUuid,
        capabilityId: active.capability.payload.capabilityId,
        recipeId: "git:status",
        ...partial,
      },
      nowMs,
    ) as FixedRecipeExecutionEnvelope,
    sessionUuid: active.session.sessionUuid,
    capability: active.capability,
    capabilityUseId: `use-${randomNonce()}`,
    expectedSessionRevision: active.session.revision,
    nowMs,
    ...requestOverrides,
  };
}

/** Creates a real disposable workspace under the harness destination root. */
export async function createLiveDisposableWorkspace(
  harness: ExecutionHarness,
  authOverrides: Partial<DisposableWorkspaceAuthorization> = {},
  nowMs = harness.nowMs(),
  limits: { ttlMs: number } = { ttlMs: 60_000 },
): Promise<
  | { ok: true; workspaceId: string; treeRoot: string; manifestHash: string }
  | { ok: false; errorCode: string; reason: string }
> {
  const policy = harness.activePolicy;
  const created = await createDisposableWorkspace({
    authorization: makeWorkspaceAuthorization({
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyHash: policy.policyHash,
      ownerId: "owner-1",
      proposalId: "prop-1",
      ...authOverrides,
    }),
    rootConfig: harness.roots.rootConfig,
    sourceRoot: harness.roots.sourceRoot,
    limits,
    symlinkPolicy: "skip",
    nowMs,
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
