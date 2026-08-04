import { describe, expect, it } from "vitest";
import { verifyPolicyEnvelope } from "../crypto/policy.js";
import { createTestKeys, policyVerifier, signedPolicy } from "../test/fixtures/keys.js";

describe("policy signatures", () => {
  it("verifies valid policy envelope", () => {
    const keys = createTestKeys();
    const signed = signedPolicy(keys, { nonce: "policy-test-nonce-1" });
    const result = verifyPolicyEnvelope(signed, policyVerifier(keys));
    expect(result.ok).toBe(true);
  });

  it("rejects tampered policy envelope", () => {
    const keys = createTestKeys();
    const signed = signedPolicy(keys, { nonce: "policy-test-nonce-2" });
    signed.destinationId = "tampered";
    const result = verifyPolicyEnvelope(signed, policyVerifier(keys));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_signature");
    }
  });

  it("rejects expired policy envelope", () => {
    const keys = createTestKeys();
    const signed = signedPolicy(keys, {
      expiresAt: Date.now() - 1,
      nonce: "policy-test-nonce-3",
    });
    const result = verifyPolicyEnvelope(signed, policyVerifier(keys));
    expect(result).toEqual({ ok: false, reason: "expired" });
  });
});
