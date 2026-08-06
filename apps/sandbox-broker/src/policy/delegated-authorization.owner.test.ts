/**
 * Owner-approval branch of delegated sandbox authorization (Sandbox Wave 4,
 * Commit 11).
 *
 * When the broker's deterministic decision requires owner approval, the
 * request must carry a verified owner-signed approval envelope bound to the
 * delegated envelope's exact authority fields, the session, the owner and
 * the active policy — with a fresh nonce. Delegated, capability and unknown
 * keys fail closed; any field mismatch fails closed.
 */

import { describe, expect, it } from "vitest";
import { authorizeDelegatedSandboxRequest, type BrokerDelegatedAuthorizationAudit, type BrokerDelegatedAuthorizationResult } from "./delegated-authorization.js";
import { DELEGATED_RUNTIME_KEY_ID } from "../crypto/delegated-approval.js";
import { CAPABILITY_SIGNING_KEY_ID } from "../sessions/session-limits.js";
import { makeExecutionHarness, signOwnerApprovalForHarness, signExecutionEnvelope } from "../test/fixtures/execution.js";
import type { OwnerApprovalVerifierConfig } from "../crypto/owner-approval.js";
import { createPublicKey } from "node:crypto";

const NOW = 1_800_000_000_000;

function authorize(
  harness: ReturnType<typeof makeExecutionHarness>,
  input: {
    envelope?: ReturnType<typeof signExecutionEnvelope>;
    ownerApproval?: ReturnType<typeof signOwnerApprovalForHarness> | null;
    trustedOwnerApprovalKeys?: OwnerApprovalVerifierConfig | null;
    reserveNonce?: (nonce: string) => boolean;
  } = {},
): BrokerDelegatedAuthorizationResult {
  const used = new Set<string>();
  const sessionUuid = "session-owner-1";
  const target = { path: harness.liveFile, intent: "write" as const };
  const ownerApproval =
    input.ownerApproval === undefined
      ? signOwnerApprovalForHarness(harness, {
          proposalId: "owner-proposal-1",
          sessionUuid,
          capabilityId: "write_live_repository",
          authoritativeRiskClass: "consultation",
          policyRuleId: "sandbox-policy/rule/owner-approval-required",
          canonicalTargetPaths: [target],
        })
      : input.ownerApproval;
  const envelope =
    input.envelope ??
    signExecutionEnvelope(
      harness,
      {
        sessionUuid,
        capabilityId: "write_live_repository",
        authoritativeRiskClass: "consultation",
        policyRuleId: "sandbox-policy/rule/owner-approval-required",
        canonicalTargetPaths: [target],
      },
      NOW,
    );
  return authorizeDelegatedSandboxRequest({
    envelope,
    trustedDelegatedKey: harness.trustedDelegatedKey,
    activePolicy: harness.activePolicy,
    trustedOwnerId: "owner-1",
    trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
    trustedOwnerApprovalKeys:
      input.trustedOwnerApprovalKeys === undefined
        ? {
            keys: [
              {
                keyId: harness.ownerApprovalKeyId,
                publicKey: createPublicKey(harness.ownerPublicKeyPem),
              },
            ],
          }
        : input.trustedOwnerApprovalKeys,
    reserveNonce:
      input.reserveNonce ?? ((nonce) => {
        if (used.has(nonce)) return false;
        used.add(nonce);
        return true;
      }),
    nowMs: NOW,
    rootConfig: harness.roots.rootConfig,
    auditSink: () => undefined,
    ownerApproval,
  });
}

describe("delegated authorization owner-approval branch", () => {
  it("accepts a valid owner approval and reports owner_approved", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("owner_approved");
    expect(result.ownerApprovalProposalId).toBe("owner-proposal-1");
  });

  it("emits an authorized/owner_approved audit record", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const audits: BrokerDelegatedAuthorizationAudit[] = [];
    const used = new Set<string>();
    const ownerApproval = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-audit",
      sessionUuid: "session-owner-1",
      capabilityId: "write_live_repository",
      authoritativeRiskClass: "consultation",
      policyRuleId: "sandbox-policy/rule/owner-approval-required",
      canonicalTargetPaths: [{ path: harness.liveFile, intent: "write" }],
    });
    const envelope = signExecutionEnvelope(
      harness,
      {
        sessionUuid: "session-owner-1",
        capabilityId: "write_live_repository",
        authoritativeRiskClass: "consultation",
        policyRuleId: "sandbox-policy/rule/owner-approval-required",
        canonicalTargetPaths: [{ path: harness.liveFile, intent: "write" }],
      },
      NOW,
    );
    const result = authorizeDelegatedSandboxRequest({
      envelope,
      trustedDelegatedKey: harness.trustedDelegatedKey,
      activePolicy: harness.activePolicy,
      trustedOwnerId: "owner-1",
      trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
      trustedOwnerApprovalKeys: {
        keys: [
          {
            keyId: harness.ownerApprovalKeyId,
            publicKey: createPublicKey(harness.ownerPublicKeyPem),
          },
        ],
      },
      reserveNonce: (nonce) => {
        if (used.has(nonce)) return false;
        used.add(nonce);
        return true;
      },
      nowMs: NOW,
      rootConfig: harness.roots.rootConfig,
      auditSink: (record) => audits.push(record),
      ownerApproval,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit.decision).toBe("owner_approved");
    expect(result.audit.ownerApprovalProposalId).toBe("owner-proposal-audit");
    const lastAudit = audits[audits.length - 1];
    expect(lastAudit.outcome).toBe("authorized");
    expect(lastAudit.decision).toBe("owner_approved");
    expect(lastAudit.ownerApprovalProposalId).toBe("owner-proposal-audit");
  });

  it("fails closed when the owner approval is signed by the delegated runtime key", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness, {
      ownerApproval: signOwnerApprovalForHarness(harness, {
        keyId: DELEGATED_RUNTIME_KEY_ID,
        proposalId: "owner-proposal-delegated-key",
        sessionUuid: "session-owner-1",
      }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_wrong_signer" });
  });

  it("fails closed when the owner approval key id is the capability signing key", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness, {
      ownerApproval: signOwnerApprovalForHarness(harness, {
        keyId: CAPABILITY_SIGNING_KEY_ID,
        proposalId: "owner-proposal-cap-key",
        sessionUuid: "session-owner-1",
      }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_wrong_signer" });
  });

  it("fails closed on an unknown owner approval key", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness, {
      trustedOwnerApprovalKeys: {
        keys: [],
      },
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_unverifiable" });
  });

  it("fails closed when no owner approval keys are configured", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness, { trustedOwnerApprovalKeys: null });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_unverifiable" });
  });

  it("fails closed on a tampered owner approval target path", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const ownerApproval = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-tampered",
      sessionUuid: "session-owner-1",
      canonicalTargetPaths: [{ path: harness.liveFile, intent: "read" }],
    });
    const tampered: ReturnType<typeof signOwnerApprovalForHarness> = {
      ...ownerApproval,
      canonicalTargetPaths: [{ path: "/attacker/target", intent: "write" }],
    };
    const result = authorize(harness, { ownerApproval: tampered });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_invalid" });
  });

  it("fails closed when the owner approval owner differs from the envelope owner", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness, {
      ownerApproval: signOwnerApprovalForHarness(harness, {
        proposalId: "owner-proposal-owner-mismatch",
        sessionUuid: "session-owner-1",
        ownerId: "owner-2",
      }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_binding_mismatch" });
  });

  it("fails closed when the owner approval session differs from the envelope session", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness, {
      ownerApproval: signOwnerApprovalForHarness(harness, {
        proposalId: "owner-proposal-session-mismatch",
        sessionUuid: "session-other",
      }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_binding_mismatch" });
  });

  it("fails closed when the owner approval authority fields drift from the envelope", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness, {
      ownerApproval: signOwnerApprovalForHarness(harness, {
        proposalId: "owner-proposal-authority-drift",
        sessionUuid: "session-owner-1",
        capabilityId: "candidate_workspace_create",
      }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_binding_mismatch" });
  });

  it("fails closed when the owner approval requires network", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const result = authorize(harness, {
      ownerApproval: signOwnerApprovalForHarness(harness, {
        proposalId: "owner-proposal-network",
        sessionUuid: "session-owner-1",
        requiresNetwork: true,
      }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_approval_invalid" });
  });

  it("fails closed on nonce replay of the owner approval", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const shared = new Set<string>();
    const ownerApproval = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-replay",
      sessionUuid: "session-owner-1",
    });
    const first = authorize(harness, {
      ownerApproval,
      reserveNonce: (nonce) => {
        if (shared.has(nonce)) return false;
        shared.add(nonce);
        return true;
      },
    });
    expect(first.ok).toBe(true);
    const second = authorize(harness, {
      ownerApproval,
      reserveNonce: (nonce) => {
        if (shared.has(nonce)) return false;
        shared.add(nonce);
        return true;
      },
    });
    expect(second).toMatchObject({ ok: false, errorCode: "replay" });
  });

  it("fails closed when the delegated envelope itself is invalid even with an owner approval", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const envelope = signExecutionEnvelope(
      harness,
      { sessionUuid: "session-owner-1" },
      NOW,
    );
    const tamperedEnvelope = {
      ...envelope,
      policyHash: "d".repeat(64),
    };
    const result = authorize(harness, { envelope: tamperedEnvelope });
    expect(result.ok).toBe(false);
  });
});

describe("owner approval envelope signing determinism", () => {
  it("binds the exact same fields the harness verification expects", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const approval = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-determinism",
      sessionUuid: "session-owner-1",
    });
    expect(approval.signerClass).toBe("owner");
    expect(approval.networkMode).toBe("none");
    expect(approval.requiresNetwork).toBe(false);
    expect(approval.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(approval.nonce.length).toBeGreaterThan(16);
    expect(approval.signature).toBeDefined();
  });
});
