import { describe, expect, it } from "vitest";
import {
  dispatchPublicKeyFromPem,
  signDispatchEnvelope,
  verifyDispatchEnvelope,
  DISPATCH_KEY_NAMESPACE,
} from "../crypto/dispatch.js";
import { createTestKeys, signedPolicy } from "../test/fixtures/keys.js";

describe("dispatch signatures", () => {
  it("binds owner dispatch to policy authorization", () => {
    const keys = createTestKeys();
    const policy = signedPolicy(keys, { actionId: "bind-action-1" });
    const dispatch = signDispatchEnvelope(
      {
        protocolVersion: 1,
        keyId: DISPATCH_KEY_NAMESPACE,
        ownerId: policy.ownerId,
        scope: "external_dispatch",
        actionId: policy.actionId,
        policyDecisionHash: policy.policyDecisionHash,
        policyContractHash: policy.policyContractHash,
        capabilityContractHash: policy.capabilityContractHash,
        expiresAt: Date.now() + 60_000,
        nonce: "dispatch-nonce-1",
      },
      keys.dispatchPrivateKeyPem,
    );
    const result = verifyDispatchEnvelope(dispatch, {
      keys: [
        {
          keyId: DISPATCH_KEY_NAMESPACE,
          publicKey: dispatchPublicKeyFromPem(keys.dispatchPublicKeyPem),
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects dispatch with mismatched policy hash", () => {
    const keys = createTestKeys();
    const policy = signedPolicy(keys, { actionId: "bind-action-2" });
    const dispatch = signDispatchEnvelope(
      {
        protocolVersion: 1,
        keyId: DISPATCH_KEY_NAMESPACE,
        ownerId: policy.ownerId,
        scope: "external_dispatch",
        actionId: policy.actionId,
        policyDecisionHash: "wrong-hash",
        policyContractHash: policy.policyContractHash,
        capabilityContractHash: policy.capabilityContractHash,
        expiresAt: Date.now() + 60_000,
        nonce: "dispatch-nonce-2",
      },
      keys.dispatchPrivateKeyPem,
    );
    const result = verifyDispatchEnvelope(dispatch, {
      keys: [
        {
          keyId: DISPATCH_KEY_NAMESPACE,
          publicKey: dispatchPublicKeyFromPem(keys.dispatchPublicKeyPem),
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(dispatch.policyDecisionHash).not.toBe(policy.policyDecisionHash);
  });
});
