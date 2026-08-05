/**
 * Delegated runtime signer tests (Sandbox Wave 4, Commit 4).
 *
 * Behaviors 11-55: eligibility revalidation (11-30), envelope integrity
 * through the agent signer and broker verifier (31-40 in the broker
 * package), isolation (41-50), and audit hygiene (51-55).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DELEGATED_RUNTIME_KEY_ID,
  delegatedRuntimePublicKeyFingerprint,
  generateEd25519KeyPairPem,
  publicKeyFromPem,
  REQUIRED_NETWORK_MODE,
  sha256Hex,
  verifyDelegatedApprovalEnvelope,
} from "@composer-assistant/sandbox-broker";
import {
  SANDBOX_POLICY_PAYLOAD_VERSION,
  type SandboxCapabilityId,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import { buildSandboxPrecheckAudit } from "./audit.js";
import {
  computePolicyHash,
  type SandboxPolicyTrustedContext,
} from "./policy-context.js";
import { runSandboxPrecheck, type SandboxPrecheckResult } from "./precheck.js";
import type { SandboxActionProposal } from "./proposal-types.js";
import {
  MAX_DELEGATED_SIGNING_TTL_MS,
  signDelegatedSandboxEnvelope,
  type DelegatedSigningAudit,
  type DelegatedSigningErrorCode,
} from "./delegated-signer.js";
import type { DelegatedRuntimeKeyMaterial } from "./delegated-key-custody.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const POLICY_ID = "test-policy-1";
const POLICY_VERSION = 1;

function makePolicy(): SandboxPolicyDocument {
  return {
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    issuedAt: "2026-08-05T00:00:00.000Z",
    allowedDelegatedSignerKeyIds: [DELEGATED_RUNTIME_KEY_ID],
    allowedCapabilities: [
      "approved_project_read",
      "approved_bounded_log_read",
      "fixed_test_recipe",
      "fixed_build_recipe",
      "candidate_workspace_create",
      "candidate_workspace_read_write_delete",
      "bounded_diagnostic_execution",
    ],
    readOnlyRoots: ["/srv/ashley/live-checkout"],
    writableDisposableRoots: ["/var/lib/ashley-sandbox/work"],
    protectedRoots: [
      {
        path: "/srv/ashley/live-checkout/.git",
        class: "delegated_write_denied_owner_approvable",
      },
      {
        path: "/srv/ashley/live-checkout",
        class: "delegated_write_denied_owner_approvable",
      },
      {
        path: "/home/doc/.composer-assistant/.env",
        class: "absolute_denial",
      },
    ],
    allowedRecipeIds: ["verify:agent-tsc", "test:broker-smoke"],
    allowedExecutableIds: ["ashley-tools/check.sh"],
    resourceCeilings: {
      wallMsMax: 120_000,
      maxProcesses: 16,
      maxOutputBytes: 4_194_304,
      workspaceBytesMax: 2_000_000_000,
    },
    networkMode: "none",
    maxActiveSessions: 1,
    payloadVersion: SANDBOX_POLICY_PAYLOAD_VERSION,
  };
}

function makeProposal(overrides: Partial<SandboxActionProposal> = {}): SandboxActionProposal {
  return {
    proposalId: "prop-001",
    ownerId: "owner-1",
    requestedCapability: "approved_project_read",
    targetPaths: [
      { path: "/srv/ashley/live-checkout/README.md", intent: "read" },
    ],
    requiresNetwork: false,
    externalSideEffect: false,
    persistence: "temporary",
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<SandboxPolicyTrustedContext> = {},
): SandboxPolicyTrustedContext {
  const policy = makePolicy();
  return {
    source: "injected_verified_policy",
    policy,
    policyHash: computePolicyHash(policy),
    signerClass: "delegated_runtime",
    ownerId: "owner-1",
    nowMs: NOW,
    canonicalPathFacts: [
      {
        claimedPath: "/srv/ashley/live-checkout/README.md",
        canonicalPath: "/srv/ashley/live-checkout/README.md",
      },
    ],
    ...overrides,
  };
}

function makeKey(): DelegatedRuntimeKeyMaterial {
  const pair = generateEd25519KeyPairPem();
  return {
    keyId: DELEGATED_RUNTIME_KEY_ID,
    privateKeyPem: pair.privateKeyPem,
    publicKeyPem: pair.publicKeyPem,
  };
}

function happyPrecheck(
  proposal: SandboxActionProposal,
  context: SandboxPolicyTrustedContext,
): SandboxPrecheckResult {
  const result = runSandboxPrecheck(proposal, context);
  if (result.ok !== true || result.preliminaryDecision !== "autonomous_safe") {
    throw new Error("happy-path precheck did not return autonomous_safe");
  }
  return result;
}

function forgeAutonomous(params: {
  proposal: SandboxActionProposal;
  policyId?: string;
  policyVersion?: number;
  policyHash?: string;
  capabilityId?: string;
  auditCapabilityId?: string;
  auditSessionUuid?: string | null;
  auditRecipeId?: string | null;
  auditExecutableId?: string | null;
  brokerVerificationRequired?: boolean;
}): SandboxPrecheckResult {
  const context = makeContext();
  const audit = buildSandboxPrecheckAudit({
    proposalId: params.proposal.proposalId,
    ownerId: params.proposal.ownerId,
    sessionUuid: params.auditSessionUuid === undefined ? (params.proposal.sessionUuid ?? null) : params.auditSessionUuid,
    requestedCapability: params.auditCapabilityId ?? params.capabilityId ?? params.proposal.requestedCapability,
    modelSuggestedRisk: params.proposal.modelSuggestedRisk ?? null,
    authoritativeRiskClass: "low",
    preliminaryDecision: "autonomous_safe",
    policyRuleId: "sandbox-policy/rule/delegated-autonomy",
    policyId: params.policyId ?? POLICY_ID,
    policyVersion: params.policyVersion ?? POLICY_VERSION,
    policyHash: params.policyHash ?? (context.policyHash ?? ""),
    recipeId: params.auditRecipeId === undefined ? (params.proposal.recipeId ?? null) : params.auditRecipeId,
    executableId: params.auditExecutableId === undefined ? (params.proposal.executableId ?? null) : params.auditExecutableId,
    targets: [],
    rationale: params.proposal.rationale ?? null,
    reason: null,
    securityRelevant: false,
    nowIso: new Date(NOW).toISOString(),
  });
  return {
    ok: true,
    preliminary: true,
    preliminaryDecision: "autonomous_safe",
    capabilityId: (params.capabilityId ?? params.proposal.requestedCapability) as SandboxCapabilityId,
    authoritativeRiskClass: "low",
    policyRuleId: "sandbox-policy/rule/delegated-autonomy",
    policyId: params.policyId ?? POLICY_ID,
    policyVersion: params.policyVersion ?? POLICY_VERSION,
    policyHash: params.policyHash ?? (context.policyHash ?? ""),
    audit,
    brokerVerificationRequired: params.brokerVerificationRequired ?? true,
  } as SandboxPrecheckResult;
}

function forgeOwnerApprovalRequired(): SandboxPrecheckResult {
  const proposal = makeProposal();
  const audit = buildSandboxPrecheckAudit({
    proposalId: proposal.proposalId,
    ownerId: proposal.ownerId,
    sessionUuid: null,
    requestedCapability: "write_live_repository",
    modelSuggestedRisk: null,
    authoritativeRiskClass: "high",
    preliminaryDecision: "owner_approval_required",
    policyRuleId: "sandbox-policy/rule/owner-approval-required",
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    policyHash: makeContext().policyHash,
    recipeId: null,
    executableId: null,
    targets: [],
    rationale: null,
    reason: "owner_approval_required_for_capability",
    securityRelevant: false,
    nowIso: new Date(NOW).toISOString(),
  });
  return {
    ok: true,
    preliminary: true,
    preliminaryDecision: "owner_approval_required",
    capabilityId: "write_live_repository",
    authoritativeRiskClass: "high",
    policyRuleId: "sandbox-policy/rule/owner-approval-required",
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    policyHash: makeContext().policyHash ?? "",
    approvalRequired: {
      capabilityId: "write_live_repository",
      authoritativeRiskClass: "high",
      affectedCanonicalPaths: [],
      recipeId: null,
      executableId: null,
      persistence: "temporary",
      requiresNetwork: false,
      externalSideEffect: false,
      sessionUuid: null,
      policyRuleId: "sandbox-policy/rule/owner-approval-required",
      reason: "owner_approval_required_for_capability",
    },
    audit,
    brokerVerificationRequired: true,
  };
}

function forgeDenied(decision: "denied" | "proposal_invalid"): SandboxPrecheckResult {
  const proposal = makeProposal();
  const audit = buildSandboxPrecheckAudit({
    proposalId: proposal.proposalId,
    ownerId: proposal.ownerId,
    sessionUuid: null,
    requestedCapability: proposal.requestedCapability,
    modelSuggestedRisk: null,
    authoritativeRiskClass: "high",
    preliminaryDecision: "denied",
    policyRuleId: "sandbox-policy/rule/absolute-denial",
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    policyHash: makeContext().policyHash,
    recipeId: null,
    executableId: null,
    targets: [],
    rationale: null,
    reason: "absolute_denial",
    securityRelevant: true,
    nowIso: new Date(NOW).toISOString(),
  });
  return {
    ok: false,
    preliminary: true,
    error: decision === "denied" ? "precheck_denied" : decision,
    reason: "absolute_denial",
    audit,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof signDelegatedSandboxEnvelope>[0]> = {},
): Parameters<typeof signDelegatedSandboxEnvelope>[0] {
  const context = makeContext();
  const proposal = makeProposal();
  return {
    proposal,
    precheck: happyPrecheck(proposal, context),
    context,
    key: makeKey(),
    nowMs: NOW,
    nonce: "test-nonce-0001",
    ...overrides,
  };
}

function expectRefusal(
  input: Parameters<typeof signDelegatedSandboxEnvelope>[0],
  error: DelegatedSigningErrorCode,
): void {
  const result = signDelegatedSandboxEnvelope(input);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBe(error);
}

describe("delegated runtime signer eligibility", () => {
  it("signs an autonomous_safe precheck with broker verification required", () => {
    const input = baseInput();
    const result = signDelegatedSandboxEnvelope(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.keyId).toBe(DELEGATED_RUNTIME_KEY_ID);
    expect(result.envelope.signerClass).toBe("delegated_runtime");
    expect(result.envelope.capabilityId).toBe("approved_project_read");
    expect(result.envelope.proposalId).toBe("prop-001");
    expect(result.envelope.policyRuleId).toBe("sandbox-policy/rule/delegated-autonomy");
    expect(result.envelope.policyHash).toBe(input.context.policyHash);
    expect(result.envelope.canonicalTargetPaths).toEqual([
      { path: "/srv/ashley/live-checkout/README.md", intent: "read" },
    ]);
    expect(result.envelope.networkMode).toBe(REQUIRED_NETWORK_MODE);
    expect(result.envelope.issuedAt).toBe(NOW);
    const verified = verifyDelegatedApprovalEnvelope(
      result.envelope,
      {
        keys: [
          { keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(input.key!.publicKeyPem) },
        ],
      },
      NOW,
    );
    expect(verified).toEqual({ ok: true });
  });

  it("refuses an owner_approval_required precheck", () => {
    expectRefusal(
      baseInput({ precheck: forgeOwnerApprovalRequired() }),
      "precheck_not_autonomous",
    );
  });

  it("refuses a denied precheck", () => {
    expectRefusal(baseInput({ precheck: forgeDenied("denied") }), "precheck_not_autonomous");
  });

  it("refuses a proposal_invalid precheck", () => {
    expectRefusal(
      baseInput({ precheck: forgeDenied("proposal_invalid") }),
      "precheck_not_autonomous",
    );
  });

  it("refuses an autonomous_safe precheck that does not require broker verification", () => {
    const forged = forgeAutonomous({ proposal: makeProposal(), brokerVerificationRequired: false });
    expectRefusal(baseInput({ precheck: forged }), "precheck_invalid");
  });

  it("refuses when the proposal ID does not match the precheck", () => {
    const proposal = makeProposal({ proposalId: "prop-X" });
    expectRefusal(
      baseInput({ proposal, precheck: forgeAutonomous({ proposal: makeProposal() }) }),
      "precheck_invalid",
    );
  });

  it("refuses when the owner ID does not match the precheck or context", () => {
    const proposal = makeProposal({ ownerId: "owner-X" });
    const forged = forgeAutonomous({ proposal });
    expectRefusal(baseInput({ proposal, precheck: forged }), "precheck_invalid");
    const mismatch = forgeAutonomous({ proposal: makeProposal(), auditSessionUuid: null });
    expectRefusal(
      baseInput({
        proposal: makeProposal(),
        context: makeContext({ ownerId: "owner-Y" }),
        precheck: mismatch,
      }),
      "precheck_invalid",
    );
  });

  it("refuses when the session UUID does not match the precheck", () => {
    const proposal = makeProposal({ sessionUuid: "sess-1" });
    const forged = forgeAutonomous({ proposal, auditSessionUuid: "sess-2" });
    expectRefusal(baseInput({ proposal, precheck: forged }), "precheck_invalid");
  });

  it("refuses when the capability does not match the precheck", () => {
    const proposal = makeProposal();
    const forged = forgeAutonomous({
      proposal,
      capabilityId: "approved_bounded_log_read",
    });
    expectRefusal(baseInput({ proposal, precheck: forged }), "precheck_invalid");
  });

  it("refuses when recipe or executable identifiers do not match the precheck", () => {
    const proposal = makeProposal();
    const forged = forgeAutonomous({ proposal, auditRecipeId: "verify:agent-tsc" });
    expectRefusal(baseInput({ proposal, precheck: forged }), "precheck_invalid");
    const forgedExec = forgeAutonomous({ proposal, auditExecutableId: "ashley-tools/check.sh" });
    expectRefusal(baseInput({ proposal, precheck: forgedExec }), "precheck_invalid");
  });

  it("refuses when the trusted policy hash does not match the precheck", () => {
    const forged = forgeAutonomous({ proposal: makeProposal(), policyHash: "f".repeat(64) });
    expectRefusal(baseInput({ precheck: forged }), "policy_identity_mismatch");
  });

  it("refuses when the trusted policy ID does not match the precheck", () => {
    const forged = forgeAutonomous({ proposal: makeProposal(), policyId: "other-policy" });
    expectRefusal(baseInput({ precheck: forged }), "policy_identity_mismatch");
  });

  it("refuses when the trusted policy version does not match the precheck", () => {
    const forged = forgeAutonomous({ proposal: makeProposal(), policyVersion: 7 });
    expectRefusal(baseInput({ precheck: forged }), "policy_identity_mismatch");
  });

  it("refuses when no trusted policy is present", () => {
    const forged = forgeAutonomous({ proposal: makeProposal() });
    expectRefusal(
      baseInput({ context: makeContext({ policy: null, policyHash: null }), precheck: forged }),
      "policy_identity_mismatch",
    );
  });

  it("refuses when the trusted context hash is inconsistent with the policy document", () => {
    const context = makeContext({ policyHash: "f".repeat(64) });
    const forged = forgeAutonomous({ proposal: makeProposal() });
    expectRefusal(baseInput({ context, precheck: forged }), "policy_identity_mismatch");
  });

  it("refuses network-requiring proposals even with a forged autonomous precheck", () => {
    const proposal = makeProposal({ requiresNetwork: true });
    const forged = forgeAutonomous({ proposal });
    expectRefusal(
      baseInput({ proposal, precheck: forged }),
      "capability_not_delegated_safe",
    );
  });

  it("refuses external-side-effect proposals even with a forged autonomous precheck", () => {
    const proposal = makeProposal({ externalSideEffect: true });
    const forged = forgeAutonomous({ proposal });
    expectRefusal(
      baseInput({ proposal, precheck: forged }),
      "capability_not_delegated_safe",
    );
  });

  it("refuses persistent proposals even with a forged autonomous precheck", () => {
    const proposal = makeProposal({ persistence: "persistent" });
    const forged = forgeAutonomous({ proposal });
    expectRefusal(
      baseInput({ proposal, precheck: forged }),
      "capability_not_delegated_safe",
    );
  });

  it("refuses an owner-approvable capability even when the precheck claims autonomous_safe", () => {
    const proposal = makeProposal({
      requestedCapability: "write_live_repository",
      targetPaths: [{ path: "/var/lib/ashley-sandbox/work/patch.diff", intent: "write" }],
    });
    const context = makeContext({
      canonicalPathFacts: [
        {
          claimedPath: "/var/lib/ashley-sandbox/work/patch.diff",
          canonicalPath: "/var/lib/ashley-sandbox/work/patch.diff",
        },
      ],
    });
    const forged = forgeAutonomous({
      proposal,
      capabilityId: "write_live_repository",
    });
    expectRefusal(
      baseInput({ proposal, precheck: forged, context }),
      "capability_not_delegated_safe",
    );
  });

  it("refuses an absolute-denial capability even when the precheck claims autonomous_safe", () => {
    const proposal = makeProposal({
      requestedCapability: "secret_extraction_transmission",
      targetPaths: [{ path: "/srv/ashley/live-checkout/secrets.txt", intent: "read" }],
    });
    const context = makeContext({
      canonicalPathFacts: [
        {
          claimedPath: "/srv/ashley/live-checkout/secrets.txt",
          canonicalPath: "/srv/ashley/live-checkout/secrets.txt",
        },
      ],
    });
    const forged = forgeAutonomous({
      proposal,
      capabilityId: "secret_extraction_transmission",
    });
    expectRefusal(
      baseInput({ proposal, precheck: forged, context }),
      "capability_not_delegated_safe",
    );
  });
});

describe("delegated runtime signer isolation", () => {
  it("refuses when the delegated runtime key is unavailable and never generates one", () => {
    const input = baseInput({ key: null });
    const result = signDelegatedSandboxEnvelope(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("key_unavailable");
    expect(result.audit.publicKeyFingerprint).toBeNull();
  });

  it("refuses owner key material and never falls back to the owner key", () => {
    const ownerMaterial: DelegatedRuntimeKeyMaterial = {
      ...makeKey(),
      keyId: "owner-ed25519-v1",
    };
    const input = baseInput({ key: ownerMaterial });
    const result = signDelegatedSandboxEnvelope(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("key_invalid");
    expect(result.reason).toContain("expected_key_id_delegated-runtime-ed25519-v1");
  });

  it("requires no key at startup and never touches disk or environment", () => {
    const source = readFileSync(
      new URL("./delegated-signer.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("generateKeyPair");
    expect(source).not.toContain("key-store");
    expect(source).not.toContain("env.js");
    const input = baseInput({ key: null });
    expect(signDelegatedSandboxEnvelope(input).ok).toBe(false);
  });

  it("leaves the owner approval signer and its conventions untouched", async () => {
    const custodySource = readFileSync(
      new URL("./delegated-key-custody.ts", import.meta.url),
      "utf8",
    );
    expect(custodySource).not.toContain("key-store");
    expect(custodySource).not.toContain("env");
    const { isApprovalScope } = await import("./approval-signer.js");
    expect(isApprovalScope("task.submit")).toBe(true);
    expect(isApprovalScope("artifact_upload")).toBe(true);
  });

  it("produces a unique nonce and signature on every signing", () => {
    const first = signDelegatedSandboxEnvelope(baseInput({ nonce: undefined }));
    const second = signDelegatedSandboxEnvelope(baseInput({ nonce: undefined }));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.envelope.nonce).not.toBe(second.envelope.nonce);
    expect(first.envelope.signature).not.toBe(second.envelope.signature);
  });

  it("never uses Math.random", () => {
    const sources = [
      readFileSync(new URL("./delegated-signer.ts", import.meta.url), "utf8"),
      readFileSync(new URL("./delegated-key-custody.ts", import.meta.url), "utf8"),
    ];
    for (const source of sources) {
      expect(source).not.toContain("Math.random");
    }
  });

  it("imports only the sandbox-safe surface, never broker execution or Ashley layers", () => {
    const files = [
      "./delegated-signer.ts",
      "./delegated-key-custody.ts",
    ];
    const forbidden = /(broker\.js|server\.js|process\/|handlers\/|store\/|protocol\/|peer-credentials|agency\/|conversation\/|identity\/|expression|thought|env\.(js|ts)|key-store)/;
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (match) => match[1],
      );
      expect(specifiers.length).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        expect(
          forbidden.test(specifier),
          `${file} imports forbidden surface ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it("refuses expiry beyond the maximum TTL", () => {
    expectRefusal(
      baseInput({ expiresAt: NOW + MAX_DELEGATED_SIGNING_TTL_MS + 1 }),
      "invalid_expiry",
    );
  });

  it("refuses an expired-at-signing expiry and a non-finite clock", () => {
    expectRefusal(baseInput({ expiresAt: NOW }), "invalid_expiry");
    expectRefusal(baseInput({ expiresAt: NOW - 1 }), "invalid_expiry");
    expectRefusal(baseInput({ nowMs: Number.NaN }), "invalid_expiry");
  });

  it("produces an envelope the broker verifier rejects once tampered", () => {
    const input = baseInput();
    const result = signDelegatedSandboxEnvelope(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tampered = { ...result.envelope, proposalId: "prop-tampered" };
    const verified = verifyDelegatedApprovalEnvelope(
      tampered,
      {
        keys: [
          {
            keyId: DELEGATED_RUNTIME_KEY_ID,
            publicKey: publicKeyFromPem(input.key!.publicKeyPem),
          },
        ],
      },
      NOW,
    );
    expect(verified).toEqual({ ok: false, reason: "invalid_signature" });
  });
});

describe("delegated runtime signer audit", () => {
  it("records signed metadata with a nonce hash and never the raw nonce", () => {
    const records: DelegatedSigningAudit[] = [];
    const nonce = "audit-nonce-abc";
    const input = baseInput({ nonce, auditSink: (record) => records.push(record) });
    const result = signDelegatedSandboxEnvelope(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.kind).toBe("delegated_signing");
    expect(record.outcome).toBe("signed");
    expect(record.error).toBeNull();
    expect(record.nonceHash).toBe(sha256Hex(nonce));
    expect(record.publicKeyFingerprint).toBe(
      delegatedRuntimePublicKeyFingerprint(input.key!.publicKeyPem),
    );
    expect(record.expiryMs).toBe(result.expiresAt);
    expect(record.signerKeyId).toBe(DELEGATED_RUNTIME_KEY_ID);
    expect(record.signerClass).toBe("delegated_runtime");
    expect(record.networkMode).toBe("none");
    expect(record.persistence).toBe("temporary");
    expect(record.externalSideEffect).toBe(false);
    expect(record.createdAtIso).toBe(new Date(NOW).toISOString());
    expect(JSON.stringify(record)).not.toContain(nonce);
  });

  it("records a refused audit with the error code for refusals", () => {
    const records: DelegatedSigningAudit[] = [];
    const input = baseInput({ key: null, auditSink: (record) => records.push(record) });
    const result = signDelegatedSandboxEnvelope(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.outcome).toBe("refused");
    expect(record.error).toBe("key_unavailable");
    expect(record.reason).toBe("delegated_runtime_key_unavailable");
    expect(record.nonceHash).toBeNull();
    expect(record.expiryMs).toBeNull();
    expect(record.publicKeyFingerprint).toBeNull();
    expect(result.error).toBe(record.error);
  });

  it("never includes argv in the audit", () => {
    const records: DelegatedSigningAudit[] = [];
    const proposal = makeProposal({
      argv: ["--token=supersecret-value"],
      cwd: "/srv/ashley/live-checkout",
    });
    const context = makeContext();
    const input = baseInput({
      proposal,
      precheck: forgeAutonomous({ proposal }),
      context,
      auditSink: (record) => records.push(record),
    });
    const result = signDelegatedSandboxEnvelope(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(records).toHaveLength(1);
    expect(records[0]).not.toHaveProperty("argv");
    expect(JSON.stringify(records[0])).not.toContain("supersecret");
    expect(result.envelope.argv).toEqual(["--token=supersecret-value"]);
  });

  it("redacts credential-shaped canonical paths in the audit but not the envelope", () => {
    const records: DelegatedSigningAudit[] = [];
    const claimed = "/var/lib/ashley-sandbox/work/ghp_AbCdEfGhIjK123456789/notes.md";
    const proposal = makeProposal({
      requestedCapability: "candidate_workspace_read_write_delete",
      targetPaths: [{ path: claimed, intent: "write" }],
    });
    const context = makeContext({
      canonicalPathFacts: [{ claimedPath: claimed, canonicalPath: claimed }],
    });
    const forged = forgeAutonomous({ proposal });
    const input = baseInput({
      proposal,
      precheck: forged,
      context,
      auditSink: (record) => records.push(record),
    });
    const result = signDelegatedSandboxEnvelope(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(records[0].canonicalTargetPaths[0]).toContain("[redacted-credential]");
    expect(JSON.stringify(records[0])).not.toContain("ghp_AbCdEfGhIjK123456789");
    expect(result.envelope.canonicalTargetPaths[0].path).toBe(claimed);
  });

  it("emits exactly one audit record per signing attempt", () => {
    const successRecords: DelegatedSigningAudit[] = [];
    const success = signDelegatedSandboxEnvelope(
      baseInput({ auditSink: (record) => successRecords.push(record) }),
    );
    expect(success.ok).toBe(true);
    expect(successRecords).toHaveLength(1);
    const failureRecords: DelegatedSigningAudit[] = [];
    const failure = signDelegatedSandboxEnvelope(
      baseInput({ key: null, auditSink: (record) => failureRecords.push(record) }),
    );
    expect(failure.ok).toBe(false);
    expect(failureRecords).toHaveLength(1);
  });
});
