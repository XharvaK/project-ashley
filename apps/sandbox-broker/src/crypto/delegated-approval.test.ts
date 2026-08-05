/**
 * Delegated runtime approval envelope tests (Sandbox Wave 4, Commit 4).
 *
 * Integrity suite: the envelope must verify only when every signed field is
 * unmodified, the signature follows the repository's canonical format, and
 * freshness/revocation checks fail closed.
 */

import { describe, expect, it } from "vitest";
import { verify } from "node:crypto";
import {
  delegatedRuntimePublicKeyFingerprint,
  DELEGATED_APPROVAL_PREFIX,
  DELEGATED_RUNTIME_KEY_ID,
  signDelegatedApprovalEnvelope,
  verifyDelegatedApprovalEnvelope,
  type DelegatedApprovalEnvelope,
} from "../index.js";
import {
  generateEd25519KeyPairPem,
  type Ed25519KeyPairPem,
} from "./key-custody.js";
import { publicKeyFromPem } from "./approval.js";
import { canonicalJson } from "./canonical-json.js";

const BASE: Omit<DelegatedApprovalEnvelope, "signature"> = {
  protocolVersion: 1,
  keyId: DELEGATED_RUNTIME_KEY_ID,
  signerClass: "delegated_runtime",
  proposalId: "prop-1",
  ownerId: "owner-1",
  sessionUuid: "session-1",
  capabilityId: "approved_project_read",
  authoritativeRiskClass: "low",
  canonicalTargetPaths: [
    { path: "/var/lib/ashley-sandbox/work/candidate/notes.md", intent: "read" },
  ],
  policyRuleId: "sandbox-policy/rule/delegated-autonomy",
  policyId: "test-policy-1",
  policyVersion: 1,
  policyHash: "a".repeat(64),
  recipeId: "verify:agent-tsc",
  executableId: "ashley-tools/check.sh",
  argv: ["--bounded"],
  cwd: "/var/lib/ashley-sandbox/work/candidate",
  networkMode: "none",
  persistence: "temporary",
  externalSideEffect: false,
  issuedAt: 1_000_000,
  expiresAt: 1_100_000,
  nonce: "nonce-abc123",
};

function sign(
  pair: Ed25519KeyPairPem,
  overrides: Record<string, unknown> = {},
): DelegatedApprovalEnvelope {
  return signDelegatedApprovalEnvelope(
    { ...BASE, ...overrides } as Omit<DelegatedApprovalEnvelope, "signature">,
    pair.privateKeyPem,
  );
}

function verifier(
  pair: Ed25519KeyPairPem,
  nowMs = 1_050_000,
): { ok: true } | { ok: false; reason: string } {
  return verifyDelegatedApprovalEnvelope(sign(pair), {
    keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
  }, nowMs);
}

describe("delegated runtime approval envelope", () => {
  it("signs with the canonical prefix + canonical JSON + base64url Ed25519 format", () => {
    const pair = generateEd25519KeyPairPem();
    const envelope = sign(pair);
    expect(envelope.signature).toBeTypeOf("string");
    expect(/^[A-Za-z0-9_-]+$/.test(envelope.signature ?? "")).toBe(true);
    const verified = verifyDelegatedApprovalEnvelope(envelope, {
      keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
    }, 1_050_000);
    expect(verified).toEqual({ ok: true });
  });

  it("signs the canonical prefix + canonical JSON message and verifies against it", () => {
    const pair = generateEd25519KeyPairPem();
    const envelope = sign(pair);
    const payload = { ...envelope } as Omit<DelegatedApprovalEnvelope, "signature">;
    delete (payload as { signature?: string }).signature;
    const message = Buffer.from(
      DELEGATED_APPROVAL_PREFIX + canonicalJson(payload),
      "utf8",
    );
    const valid = verify(
      null,
      message,
      publicKeyFromPem(pair.publicKeyPem),
      Buffer.from(envelope.signature ?? "", "base64url"),
    );
    expect(valid).toBe(true);
  });

  it("rejects tampering of every signed field", () => {
    const pair = generateEd25519KeyPairPem();
    const base = sign(pair);
    const tamperCases: Array<[string, unknown]> = [
      ["protocolVersion", 2],
      ["keyId", "attacker-key"],
      ["signerClass", "owner"],
      ["proposalId", "prop-forged"],
      ["ownerId", "owner-forged"],
      ["sessionUuid", "session-forged"],
      ["capabilityId", "write_live_repository"],
      ["authoritativeRiskClass", "high"],
      ["canonicalTargetPaths", []],
      ["policyRuleId", "sandbox-policy/rule/forged"],
      ["policyId", "policy-forged"],
      ["policyVersion", 99],
      ["policyHash", "b".repeat(64)],
      ["recipeId", "recipe-forged"],
      ["executableId", "exec-forged"],
      ["argv", ["--unsafe"]],
      ["cwd", "/tmp/attacker"],
      ["networkMode", "internet"],
      ["persistence", "persistent"],
      ["externalSideEffect", true],
      ["issuedAt", 2_000_000_000],
      ["expiresAt", 1],
      ["nonce", "nonce-forged"],
    ];
    for (const [field, value] of tamperCases) {
      const tampered = { ...base, [field]: value };
      const result = verifyDelegatedApprovalEnvelope(tampered, {
        keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
      }, 1_050_000);
      expect(result.ok, `tampered field ${field} must fail verification`).toBe(false);
    }
  });

  it("rejects an expired envelope", () => {
    const pair = generateEd25519KeyPairPem();
    const result = verifyDelegatedApprovalEnvelope(sign(pair), {
      keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
    }, 1_200_000);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects an envelope whose issuedAt is in the future", () => {
    const pair = generateEd25519KeyPairPem();
    const result = verifyDelegatedApprovalEnvelope(
      sign(pair, { ...BASE, issuedAt: 2_000_000_000, expiresAt: 2_100_000_000 }),
      {
        keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
      },
      1_050_000,
    );
    expect(result).toEqual({ ok: false, reason: "not_yet_valid" });  });

  it("rejects a non-none network mode", () => {
    const pair = generateEd25519KeyPairPem();
    const result = verifyDelegatedApprovalEnvelope(
      sign(pair, { ...BASE, networkMode: "internet" }),
      {
        keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
      },
      1_050_000,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_network_mode" });
  });

  it("rejects a non-v1 protocol version", () => {
    const pair = generateEd25519KeyPairPem();
    const result = verifyDelegatedApprovalEnvelope(
      sign(pair, { ...BASE, protocolVersion: 2 }),
      {
        keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
      },
      1_050_000,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_protocol_version" });
  });

  it("rejects a non-delegated-runtime signer class", () => {
    const pair = generateEd25519KeyPairPem();
    const result = verifyDelegatedApprovalEnvelope(
      sign(pair, { ...BASE, signerClass: "owner" }),
      {
        keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
      },
      1_050_000,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_signer_class" });
  });

  it("rejects revoked and unknown keys", () => {
    const pair = generateEd25519KeyPairPem();
    const config = {
      keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
      revokedKeyIds: new Set([DELEGATED_RUNTIME_KEY_ID]),
    };
    const revoked = verifyDelegatedApprovalEnvelope(sign(pair), config, 1_050_000);
    expect(revoked).toEqual({ ok: false, reason: "revoked_key" });
    const unknown = verifyDelegatedApprovalEnvelope(
      sign(pair, { ...BASE, keyId: "not-in-config" }),
      {
        keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
      },
      1_050_000,
    );
    expect(unknown).toEqual({ ok: false, reason: "unknown_key" });
  });

  it("rejects a missing signature", () => {
    const pair = generateEd25519KeyPairPem();
    const envelope = sign(pair);
    const unsigned = { ...envelope } as DelegatedApprovalEnvelope;
    delete (unsigned as { signature?: string }).signature;
    const result = verifyDelegatedApprovalEnvelope(unsigned, {
      keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
    }, 1_050_000);
    expect(result).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("rejects a signature produced by a different key", () => {
    const pair = generateEd25519KeyPairPem();
    const attacker = generateEd25519KeyPairPem();
    const envelope = sign(pair);
    const result = verifyDelegatedApprovalEnvelope(envelope, {
      keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(attacker.publicKeyPem) }],
    }, 1_050_000);
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("computes a stable fingerprint and distinguishes keys", () => {
    const pair = generateEd25519KeyPairPem();
    const other = generateEd25519KeyPairPem();
    const fingerprint = delegatedRuntimePublicKeyFingerprint(pair.publicKeyPem);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(delegatedRuntimePublicKeyFingerprint(pair.publicKeyPem)).toBe(fingerprint);
    expect(delegatedRuntimePublicKeyFingerprint(other.publicKeyPem)).not.toBe(fingerprint);
  });

  it("verifies the canonical envelope used by the agent signer end to end", () => {
    const pair = generateEd25519KeyPairPem();
    const payload: Omit<DelegatedApprovalEnvelope, "signature"> = {
      ...BASE,
      canonicalTargetPaths: [
        { path: "/srv/ashley/live-checkout/README.md", intent: "read" },
      ],
    };
    const envelope = signDelegatedApprovalEnvelope(payload, pair.privateKeyPem);
    expect(envelope.signature).toBeDefined();
    const result = verifyDelegatedApprovalEnvelope(envelope, {
      keys: [{ keyId: DELEGATED_RUNTIME_KEY_ID, publicKey: publicKeyFromPem(pair.publicKeyPem) }],
    }, 1_050_000);
    expect(result).toEqual({ ok: true });
  });
});
