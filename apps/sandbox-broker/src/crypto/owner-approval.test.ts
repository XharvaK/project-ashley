/**
 * Owner approval envelope crypto tests (Sandbox Wave 4, Commit 11).
 *
 * The distinct `ASHLEY-SANDBOX-OWNER-APPROVAL-v1` domain: owner-signed
 * structured authority payloads whose hash binds every field. Any mutation
 * must invalidate the envelope via payload-hash mismatch or signature
 * failure, and only trusted owner keys may verify.
 */

import { describe, expect, it } from "vitest";
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import {
  computeOwnerApprovalPayloadHash,
  ownerApprovalPublicKeyFingerprint,
  signOwnerApprovalEnvelope,
  verifyOwnerApprovalEnvelope,
  OWNER_APPROVAL_PREFIX,
  OWNER_APPROVAL_SIGNER_CLASS,
  type SandboxOwnerApprovalEnvelope,
} from "./owner-approval.js";
import { randomNonce } from "./types.js";
import { DELEGATED_RUNTIME_KEY_ID } from "./delegated-approval.js";

const NOW = 1_800_000_000_000;

function keyPair(keyId: string): {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const pair = generateKeyPairSync("ed25519");
  return {
    keyId,
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

const ownerKey = keyPair("owner-approval-ed25519-v1");
const otherOwnerKey = keyPair("owner-approval-other-v1");

function baseEnvelope(overrides: Partial<SandboxOwnerApprovalEnvelope> = {}): Omit<SandboxOwnerApprovalEnvelope, "signature" | "payloadHash"> {
  return {
    protocolVersion: 1,
    keyId: ownerKey.keyId,
    signerClass: OWNER_APPROVAL_SIGNER_CLASS,
    proposalId: "proposal-1",
    ownerId: "owner-1",
    sessionUuid: "session-1",
    capabilityId: "approved_project_read",
    authoritativeRiskClass: "high",
    canonicalTargetPaths: [{ path: "/repo/README.md", intent: "write" }],
    policyRuleId: "sandbox-policy/rule/owner_approval",
    policyId: "policy-1",
    policyVersion: 3,
    policyHash: "a".repeat(64),
    recipeId: "git:status",
    executableId: null,
    persistence: "temporary",
    requiresNetwork: false,
    externalSideEffect: false,
    networkMode: "none",
    issuedAt: NOW - 10_000,
    expiresAt: NOW + 60_000,
    nonce: randomNonce(),
    ...overrides,
  };
}

function signed(overrides: Partial<SandboxOwnerApprovalEnvelope> = {}): SandboxOwnerApprovalEnvelope {
  return signOwnerApprovalEnvelope(baseEnvelope(overrides), ownerKey.privateKeyPem);
}

function verifierConfig() {
  return {
    keys: [
      { keyId: ownerKey.keyId, publicKey: createPublicKey(ownerKey.publicKeyPem) },
      { keyId: otherOwnerKey.keyId, publicKey: createPublicKey(otherOwnerKey.publicKeyPem) },
    ],
  };
}

describe("owner approval envelope crypto", () => {
  it("signs and verifies a valid envelope", () => {
    const envelope = signed();
    expect(verifyOwnerApprovalEnvelope(envelope, verifierConfig(), NOW)).toEqual({ ok: true });
  });

  it("binds the exact authority payload via canonical hash", () => {
    const envelope = signed();
    expect(envelope.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    const recomputed = computeOwnerApprovalPayloadHash({
      proposalId: envelope.proposalId,
      ownerId: envelope.ownerId,
      sessionUuid: envelope.sessionUuid,
      capabilityId: envelope.capabilityId,
      authoritativeRiskClass: envelope.authoritativeRiskClass,
      canonicalTargetPaths: envelope.canonicalTargetPaths,
      policyRuleId: envelope.policyRuleId,
      policyId: envelope.policyId,
      policyVersion: envelope.policyVersion,
      policyHash: envelope.policyHash,
      recipeId: envelope.recipeId,
      executableId: envelope.executableId,
      persistence: envelope.persistence,
      requiresNetwork: envelope.requiresNetwork,
      externalSideEffect: envelope.externalSideEffect,
    });
    expect(recomputed).toBe(envelope.payloadHash);
  });

  it("rejects a tampered target path (payload hash mismatch)", () => {
    const envelope = signed();
    const tampered: SandboxOwnerApprovalEnvelope = {
      ...envelope,
      canonicalTargetPaths: [{ path: "/repo/SECRETS.md", intent: "write" }],
      signature: envelope.signature,
    };
    const result = verifyOwnerApprovalEnvelope(tampered, verifierConfig(), NOW);
    expect(result).toEqual({ ok: false, reason: "payload_hash_mismatch" });
  });

  it("rejects a tampered payload hash", () => {
    const envelope = signed();
    const tampered = {
      ...envelope,
      payloadHash: "b".repeat(64),
    };
    const result = verifyOwnerApprovalEnvelope(tampered, verifierConfig(), NOW);
    expect(result).toEqual({ ok: false, reason: "payload_hash_mismatch" });
  });

  it("rejects a mutated bound field without payload-hash update (signature failure)", () => {
    const envelope = signed();
    const tampered = {
      ...envelope,
      policyHash: "c".repeat(64),
      payloadHash: computeOwnerApprovalPayloadHash({
        proposalId: envelope.proposalId,
        ownerId: envelope.ownerId,
        sessionUuid: envelope.sessionUuid,
        capabilityId: envelope.capabilityId,
        authoritativeRiskClass: envelope.authoritativeRiskClass,
        canonicalTargetPaths: envelope.canonicalTargetPaths,
        policyRuleId: envelope.policyRuleId,
        policyId: envelope.policyId,
        policyVersion: envelope.policyVersion,
        policyHash: "c".repeat(64),
        recipeId: envelope.recipeId,
        executableId: envelope.executableId,
        persistence: envelope.persistence,
        requiresNetwork: envelope.requiresNetwork,
        externalSideEffect: envelope.externalSideEffect,
      }),
    };
    const result = verifyOwnerApprovalEnvelope(tampered, verifierConfig(), NOW);
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a signature from another owner key", () => {
    const envelope = signOwnerApprovalEnvelope(baseEnvelope(), otherOwnerKey.privateKeyPem);
    const result = verifyOwnerApprovalEnvelope(envelope, verifierConfig(), NOW);
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects unknown, revoked and non-owner keys", () => {
    const unknown = keyPair("owner-approval-unknown-v1");
    const envelopeUnknown = signOwnerApprovalEnvelope(baseEnvelope({ keyId: unknown.keyId }), unknown.privateKeyPem);
    expect(verifyOwnerApprovalEnvelope(envelopeUnknown, verifierConfig(), NOW)).toEqual({
      ok: false,
      reason: "unknown_key",
    });

    const revoked = signed();
    expect(
      verifyOwnerApprovalEnvelope(revoked, verifierConfig(), NOW),
    ).toEqual({ ok: true });
    expect(
      verifyOwnerApprovalEnvelope(revoked, { ...verifierConfig(), revokedKeyIds: new Set([ownerKey.keyId]) }, NOW),
    ).toEqual({ ok: false, reason: "revoked_key" });

    const delegatedKeyId = signOwnerApprovalEnvelope(
      baseEnvelope({ keyId: DELEGATED_RUNTIME_KEY_ID }),
      ownerKey.privateKeyPem,
    );
    expect(
      verifyOwnerApprovalEnvelope(delegatedKeyId, verifierConfig(), NOW),
    ).toEqual({ ok: false, reason: "unknown_key" });
  });

  it("rejects a wrong signer class", () => {
    const envelope = signed({ signerClass: "delegated_runtime" as never });
    expect(verifyOwnerApprovalEnvelope(envelope, verifierConfig(), NOW)).toEqual({
      ok: false,
      reason: "invalid_signer_class",
    });
  });

  it("rejects expired and not-yet-valid envelopes", () => {
    expect(verifyOwnerApprovalEnvelope(signed(), verifierConfig(), NOW + 120_000)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(verifyOwnerApprovalEnvelope(signed(), verifierConfig(), NOW - 60_000)).toEqual({
      ok: false,
      reason: "not_yet_valid",
    });
  });

  it("rejects a network-capable approval in a none-only policy", () => {
    const envelope = signed({ requiresNetwork: true });
    expect(verifyOwnerApprovalEnvelope(envelope, verifierConfig(), NOW)).toEqual({
      ok: false,
      reason: "invalid_network_mode",
    });
  });

  it("rejects malformed payload hashes", () => {
    const envelope = signed();
    const tampered = { ...envelope, payloadHash: "not-a-hash" };
    expect(verifyOwnerApprovalEnvelope(tampered, verifierConfig(), NOW)).toEqual({
      ok: false,
      reason: "invalid_payload_hash",
    });
  });

  it("rejects invalid protocol versions and missing signatures", () => {
    const badProtocol = signed({ protocolVersion: 2 as never });
    expect(verifyOwnerApprovalEnvelope(badProtocol, verifierConfig(), NOW)).toEqual({
      ok: false,
      reason: "invalid_protocol_version",
    });
    const missingSig = signed();
    delete (missingSig as { signature?: string }).signature;
    expect(verifyOwnerApprovalEnvelope(missingSig, verifierConfig(), NOW)).toEqual({
      ok: false,
      reason: "missing_signature",
    });
  });

  it("is deterministic in payload hash and stable in prefix", () => {
    expect(OWNER_APPROVAL_PREFIX).toBe("ASHLEY-SANDBOX-OWNER-APPROVAL-v1\n");
    const a = computeOwnerApprovalPayloadHash({
      proposalId: "p",
      ownerId: "o",
      sessionUuid: "s",
      capabilityId: "approved_project_read",
      authoritativeRiskClass: "low",
      canonicalTargetPaths: [],
      policyRuleId: "r",
      policyId: "i",
      policyVersion: 1,
      policyHash: "h",
      recipeId: null,
      executableId: null,
      persistence: "temporary",
      requiresNetwork: false,
      externalSideEffect: false,
    });
    const b = computeOwnerApprovalPayloadHash({
      proposalId: "p",
      ownerId: "o",
      sessionUuid: "s",
      capabilityId: "approved_project_read",
      authoritativeRiskClass: "low",
      canonicalTargetPaths: [],
      policyRuleId: "r",
      policyId: "i",
      policyVersion: 1,
      policyHash: "h",
      recipeId: null,
      executableId: null,
      persistence: "temporary",
      requiresNetwork: false,
      externalSideEffect: false,
    });
    expect(a).toBe(b);
  });

  it("computes a stable public key fingerprint", () => {
    const first = ownerApprovalPublicKeyFingerprint(ownerKey.publicKeyPem);
    const second = ownerApprovalPublicKeyFingerprint(ownerKey.publicKeyPem);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});
