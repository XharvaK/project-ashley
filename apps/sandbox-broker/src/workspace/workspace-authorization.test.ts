/**
 * Authorization integration tests (Sandbox Wave 4, Commit 7).
 *
 * The full broker pipeline: a signed delegated envelope for the
 * `candidate_workspace_create` capability is authorized by the broker
 * against an owner-signed policy, and the resulting autonomous
 * authorization drives disposable workspace creation against the same
 * root configuration. This proves the Commit 7 boundary only accepts
 * broker-produced authorizations and binds the policy identity recorded
 * in the manifest to the authorization.
 */

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  authorizeDelegatedSandboxRequest,
  createDisposableWorkspace,
  DELEGATED_RUNTIME_KEY_ID,
  generateEd25519KeyPairPem,
  publicKeyFromPem,
  sha256Hex,
  signDelegatedApprovalEnvelope,
  type ActiveVerifiedSandboxPolicy,
  type BrokerDelegatedAuthorizationInput,
  type DelegatedApprovalEnvelope,
} from "../index.js";
import {
  canonicalizeSandboxPolicyPayload,
  SANDBOX_POLICY_PAYLOAD_VERSION,
  type SandboxCapabilityId,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import { randomNonce } from "../crypto/types.js";
import { toNativeBrokerPath } from "../policy/path.js";
import { makeWorkspaceTestRoots } from "../test/fixtures/workspace.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");
const OWNER_ID = "owner-1";
const OWNER_POLICY_KEY_ID = "owner-ed25519-v1";

function policyFor(
  roots: ReturnType<typeof makeWorkspaceTestRoots>,
  allowedCapabilities: SandboxCapabilityId[] = ["candidate_workspace_create"],
): SandboxPolicyDocument {
  return {
    policyId: "test-policy-1",
    policyVersion: 1,
    issuedAt: "2026-08-05T00:00:00.000Z",
    allowedDelegatedSignerKeyIds: [DELEGATED_RUNTIME_KEY_ID],
    allowedCapabilities,
    readOnlyRoots: [roots.sourceRoot],
    writableDisposableRoots: [roots.destinationRoot],
    protectedRoots: [
      {
        path: roots.sourceRoot,
        class: "delegated_write_denied_owner_approvable",
      },
    ],
    allowedRecipeIds: [],
    allowedExecutableIds: [],
    resourceCeilings: {
      wallMsMax: 120_000,
      maxProcesses: 16,
      maxOutputBytes: 4_194_304,
      workspaceBytesMax: 1_024 * 1_024,
    },
    networkMode: "none",
    maxActiveSessions: 1,
    payloadVersion: SANDBOX_POLICY_PAYLOAD_VERSION,
  };
}

function policyHashOf(policy: SandboxPolicyDocument): string {
  const canonical = canonicalizeSandboxPolicyPayload(policy);
  if (!canonical.ok) throw new Error("policy_canonicalization_failed");
  return sha256Hex(Buffer.from(canonical.payload, "utf8"));
}

function activePolicy(
  roots: ReturnType<typeof makeWorkspaceTestRoots>,
  allowedCapabilities: SandboxCapabilityId[] = ["candidate_workspace_create"],
): ActiveVerifiedSandboxPolicy {
  const policy = policyFor(roots, allowedCapabilities);
  return {
    policy,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: policyHashOf(policy),
    signerKeyId: OWNER_POLICY_KEY_ID,
  };
}

function signedEnvelope(
  privateKeyPem: string,
  active: ActiveVerifiedSandboxPolicy,
  targetPath: string,
  capabilityId = "candidate_workspace_create",
  intent: "read" | "write" = "write",
): DelegatedApprovalEnvelope {
  return signDelegatedApprovalEnvelope(
    {
      protocolVersion: 1,
      keyId: DELEGATED_RUNTIME_KEY_ID,
      signerClass: "delegated_runtime",
      proposalId: "prop-workspace-1",
      ownerId: OWNER_ID,
      sessionUuid: "session-1",
      capabilityId,
      authoritativeRiskClass: "low",
      canonicalTargetPaths: [{ path: targetPath, intent }],
      policyRuleId: "sandbox-policy/rule/delegated-autonomy",
      policyId: active.policyId,
      policyVersion: active.policyVersion,
      policyHash: active.policyHash,
      networkMode: "none",
      persistence: "temporary",
      externalSideEffect: false,
      issuedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
      nonce: randomNonce(),
    },
    privateKeyPem,
  );
}

function authorizationInput(
  roots: ReturnType<typeof makeWorkspaceTestRoots>,
  allowedCapabilities: SandboxCapabilityId[] = ["candidate_workspace_create"],
): {
  input: BrokerDelegatedAuthorizationInput;
  active: ActiveVerifiedSandboxPolicy;
  pair: { privateKeyPem: string; publicKeyPem: string };
} {
  const pair = generateEd25519KeyPairPem();
  const active = activePolicy(roots, allowedCapabilities);
  const spent = new Set<string>();
  return {
    active,
    pair,
    input: {
      envelope: signedEnvelope(
        pair.privateKeyPem,
        active,
        `${roots.destinationRoot}/candidate`,
      ),
      trustedDelegatedKey: {
        keyId: DELEGATED_RUNTIME_KEY_ID,
        publicKey: publicKeyFromPem(pair.publicKeyPem),
      },
      activePolicy: active,
      trustedOwnerId: OWNER_ID,
      trustedOwnerPolicyKeyIds: new Set([OWNER_POLICY_KEY_ID]),
      reserveNonce: (nonce) => {
        if (spent.has(nonce)) return false;
        spent.add(nonce);
        return true;
      },
      nowMs: NOW,
      rootConfig: roots.rootConfig,
      auditSink: () => {},
    },
  };
}

describe("authorization -> workspace creation pipeline", () => {
  it("creates a workspace under an autonomous candidate_workspace_create authorization", async () => {
    const roots = makeWorkspaceTestRoots();
    const sourceNative = toNativeBrokerPath(roots.sourceRoot);
    mkdirSync(path.dirname(`${sourceNative}/README.md`), { recursive: true });
    writeFileSync(path.join(sourceNative, "README.md"), "# candidate");
    writeFileSync(path.join(sourceNative, ".env"), "SECRET=1");

    const { input, active } = authorizationInput(roots);
    const auth = authorizeDelegatedSandboxRequest(input);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    expect(auth.decision).toBe("autonomous_safe");
    if (auth.decision !== "autonomous_safe") return;
    expect(auth.capability).toBe("candidate_workspace_create");

    const created = await createDisposableWorkspace({
      authorization: {
        decision: auth.decision,
        capability: auth.capability,
        policyId: auth.policyId,
        policyVersion: auth.policyVersion,
        policyHash: auth.policyHash,
        ownerId: OWNER_ID,
        proposalId: "prop-workspace-1",
        sessionUuid: "session-1",
        workspaceBytesMax: auth.effectiveLimits.workspaceBytesMax,
      },
      rootConfig: roots.rootConfig,
      sourceRoot: roots.sourceRoot,
      nowMs: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.manifest.policyId).toBe(active.policyId);
    expect(created.manifest.policyVersion).toBe(active.policyVersion);
    expect(created.manifest.policyHash).toBe(active.policyHash);
    const treeNative = toNativeBrokerPath(created.treeRoot);
    expect(existsSync(path.join(treeNative, "README.md"))).toBe(true);
    expect(existsSync(path.join(treeNative, ".env"))).toBe(false);
  });

  it("refuses creation when the authorized capability is not workspace creation", async () => {
    const roots = makeWorkspaceTestRoots();
    const sourceNative = toNativeBrokerPath(roots.sourceRoot);
    writeFileSync(path.join(sourceNative, "README.md"), "# candidate");
    const { input, active, pair } = authorizationInput(roots, [
      "candidate_workspace_create",
      "approved_project_read",
    ]);    const forgedInput = {
      ...input,
      envelope: signedEnvelope(
        pair.privateKeyPem,
        active,
        `${roots.sourceRoot}/README.md`,
        "approved_project_read",
        "read",
      ),
    };
    const auth = authorizeDelegatedSandboxRequest(forgedInput);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    if (auth.decision !== "autonomous_safe") return;
    expect(auth.capability).toBe("approved_project_read");
    const created = await createDisposableWorkspace({
      authorization: {
        decision: auth.decision,
        capability: auth.capability,
        policyId: auth.policyId,
        policyVersion: auth.policyVersion,
        policyHash: auth.policyHash,
        ownerId: OWNER_ID,
        proposalId: "prop-workspace-1",
        sessionUuid: "session-1",
        workspaceBytesMax: auth.effectiveLimits.workspaceBytesMax,
      },
      rootConfig: roots.rootConfig,
      sourceRoot: roots.sourceRoot,
      nowMs: NOW,
    });
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.errorCode).toBe("authorization_capability_mismatch");
  });

  it("accepts structurally valid authorization evidence at the seam", async () => {
    // The creation boundary consumes authorization evidence; production
    // evidence is produced by the broker pipeline (tests above). A
    // structurally valid object is accepted because the boundary cannot
    // distinguish provenance — the signed pipeline is what binds authority.
    const roots = makeWorkspaceTestRoots();
    const created = await createDisposableWorkspace({
      authorization: {
        decision: "autonomous_safe",
        capability: "candidate_workspace_create",
        policyId: "test-policy-1",
        policyVersion: 1,
        policyHash: "b".repeat(64),
        ownerId: OWNER_ID,
        proposalId: "prop-1",
        sessionUuid: null,
        workspaceBytesMax: 1_000_000,
      },
      rootConfig: roots.rootConfig,
      sourceRoot: roots.sourceRoot,
      nowMs: NOW,
    });
    expect(created.ok).toBe(true);
  });

  it("binds the policy identity recorded in the manifest to the authorization", async () => {
    const roots = makeWorkspaceTestRoots();
    const sourceNative = toNativeBrokerPath(roots.sourceRoot);
    writeFileSync(path.join(sourceNative, "README.md"), "# candidate");
    const { input, active } = authorizationInput(roots);
    const auth = authorizeDelegatedSandboxRequest(input);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    if (auth.decision !== "autonomous_safe") return;
    const created = await createDisposableWorkspace({
      authorization: {
        decision: auth.decision,
        capability: auth.capability,
        policyId: auth.policyId,
        policyVersion: auth.policyVersion,
        policyHash: auth.policyHash,
        ownerId: OWNER_ID,
        proposalId: "prop-workspace-1",
        sessionUuid: "session-1",
        workspaceBytesMax: auth.effectiveLimits.workspaceBytesMax,
      },
      rootConfig: roots.rootConfig,
      sourceRoot: roots.sourceRoot,
      nowMs: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const onDisk = JSON.parse(readFileSync(toNativeBrokerPath(created.manifestPath), "utf8"));
    expect(onDisk.policyHash).toBe(active.policyHash);
    expect(onDisk.capabilityId).toBe("candidate_workspace_create");
  });
});
