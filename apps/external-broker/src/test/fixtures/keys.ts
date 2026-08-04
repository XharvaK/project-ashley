import { randomBytes } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import {
  dispatchPublicKeyFromPem,
  signDispatchEnvelope,
  DISPATCH_KEY_NAMESPACE,
} from "../../crypto/dispatch.js";
import {
  forgetPublicKeyFromPem,
  signForgetEnvelope,
} from "../../crypto/forget.js";
import {
  policyPublicKeyFromPem,
  signPolicyEnvelope,
  POLICY_KEY_NAMESPACE,
} from "../../crypto/policy.js";
import {
  type DispatchEnvelope,
  type ForgetEnvelope,
  type PolicyAuthorizeEnvelope,
  policyDecisionHash,
  randomNonce,
} from "../../crypto/types.js";
import { EVALUATOR_BUILD_ID } from "../../policy/evaluator.js";

export interface TestKeyMaterial {
  policyPrivateKeyPem: string;
  policyPublicKeyPem: string;
  dispatchPrivateKeyPem: string;
  dispatchPublicKeyPem: string;
  continuityPrivateKeyPem: string;
  continuityPublicKeyPem: string;
  vaultMasterKey: Buffer;
}

export function createTestKeys(): TestKeyMaterial {
  const policy = generateKeyPairSync("ed25519");
  const dispatch = generateKeyPairSync("ed25519");
  const continuity = generateKeyPairSync("ed25519");
  return {
    policyPrivateKeyPem: policy.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    policyPublicKeyPem: policy.publicKey.export({ type: "spki", format: "pem" }).toString(),
    dispatchPrivateKeyPem: dispatch.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    dispatchPublicKeyPem: dispatch.publicKey.export({ type: "spki", format: "pem" }).toString(),
    continuityPrivateKeyPem: continuity.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    continuityPublicKeyPem: continuity.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    vaultMasterKey: randomBytes(32),
  };
}

export function basePolicyToken(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    actionKind: "observe",
    riskClass: "observe",
    destinationId: "dest-1",
    capabilityReleaseState: "active",
    ...overrides,
  };
}

export function basePolicy(
  overrides: Partial<PolicyAuthorizeEnvelope> = {},
): Omit<PolicyAuthorizeEnvelope, "signature" | "policyDecisionHash"> & {
  policyDecisionToken: Record<string, unknown>;
} {
  const now = Date.now();
  const policyDecisionToken = basePolicyToken(
    (overrides.policyDecisionToken as Record<string, unknown> | undefined) ?? {},
  );
  const {
    policyDecisionToken: _ignored,
    ...restOverrides
  } = overrides;
  return {
    protocolVersion: 1,
    keyId: POLICY_KEY_NAMESPACE,
    ownerId: "owner-1",
    scope: "external_policy_authorize",
    actionId: "action-1",
    destinationId: "dest-1",
    accountRef: "acct-ref-1",
    adapterId: "fake-local-v1",
    actionKind: "observe",
    riskClass: "observe",
    requestedScope: ["read"],
    policyContractId: "policy-contract-v1",
    policyContractHash: "pch-1",
    capabilityContractId: "cap-contract-v1",
    capabilityContractHash: "cch-1",
    capabilityReleaseId: "release-1",
    evaluatorBuildId: EVALUATOR_BUILD_ID,
    classificationInputsHash: "cls-1",
    policyDecisionToken,
    idempotencyKey: "idem-1",
    expiresAt: now + 60_000,
    nonce: randomNonce(),
    ...restOverrides,
  };
}

export function signedPolicy(
  keys: TestKeyMaterial,
  overrides: Partial<PolicyAuthorizeEnvelope> = {},
): PolicyAuthorizeEnvelope {
  const partial = basePolicy(overrides);
  const policyDecisionHash = policyDecisionHashFromToken(partial.policyDecisionToken);
  return signPolicyEnvelope(
    { ...partial, policyDecisionHash },
    keys.policyPrivateKeyPem,
  );
}

export function policyDecisionHashFromToken(token: Record<string, unknown>): string {
  return policyDecisionHash(token);
}

export function signedDispatch(
  keys: TestKeyMaterial,
  policy: PolicyAuthorizeEnvelope,
  overrides: Partial<DispatchEnvelope> = {},
): DispatchEnvelope {
  const now = Date.now();
  return signDispatchEnvelope(
    {
      protocolVersion: 1,
      keyId: DISPATCH_KEY_NAMESPACE,
      ownerId: policy.ownerId,
      scope: "external_dispatch",
      actionId: policy.actionId,
      payloadRef: policy.payloadRef,
      payloadHash: policy.payloadHash,
      policyDecisionHash: policy.policyDecisionHash,
      policyContractHash: policy.policyContractHash,
      capabilityContractHash: policy.capabilityContractHash,
      publicDisclosureResultHash: policy.publicDisclosureResultHash,
      expiresAt: now + 60_000,
      nonce: randomNonce(),
      ...overrides,
    },
    keys.dispatchPrivateKeyPem,
  );
}

export function signedForget(
  keys: TestKeyMaterial,
  overrides: Partial<ForgetEnvelope> = {},
): ForgetEnvelope {
  const now = Date.now();
  return signForgetEnvelope(
    {
      protocolVersion: 1,
      continuityKeyId: "continuity-external-forget-ed25519-v1",
      tombstoneId: "tomb-1",
      ownerId: "owner-1",
      scope: "external_forget",
      targets: [],
      issuedAt: now,
      expiresAt: now + 60_000,
      ...overrides,
    },
    keys.continuityPrivateKeyPem,
  );
}

export function policyVerifier(keys: TestKeyMaterial) {
  return {
    keys: [
      {
        keyId: POLICY_KEY_NAMESPACE,
        publicKey: policyPublicKeyFromPem(keys.policyPublicKeyPem),
      },
    ],
  };
}

export function dispatchVerifier(keys: TestKeyMaterial) {
  return {
    keys: [
      {
        keyId: DISPATCH_KEY_NAMESPACE,
        publicKey: dispatchPublicKeyFromPem(keys.dispatchPublicKeyPem),
      },
    ],
  };
}

export function forgetVerifier(keys: TestKeyMaterial) {
  return {
    keys: [
      {
        continuityKeyId: "continuity-external-forget-ed25519-v1",
        publicKey: forgetPublicKeyFromPem(keys.continuityPublicKeyPem),
      },
    ],
  };
}
