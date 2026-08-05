/**
 * Broker-final delegated authorization tests (Sandbox Wave 4, Commit 5).
 *
 * Behaviors 1-58 cover the authorization contract: signature and signer
 * profile (1-10), active policy identity (11-17), broker recomputation
 * (18-34), recipes and execution fields (35-43), limits and network
 * (44-50), metadata comparison and audit (51-58). Behaviors 59-63 assert
 * isolation. Behaviors 64-71 are whole-suite and repository gates verified
 * in the commit pipeline (owner approval/nonce suites, agent suites, shared
 * policy suites, Thought/Expression/Governance unchanged, routes disabled).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  authorizeDelegatedSandboxRequest,
  DELEGATED_RUNTIME_KEY_ID,
  generateEd25519KeyPairPem,
  publicKeyFromPem,
  sha256Hex,
  signDelegatedApprovalEnvelope,
  type ActiveVerifiedSandboxPolicy,
  type BrokerDelegatedAuthorizationAudit,
  type BrokerDelegatedAuthorizationInput,
  type BrokerDelegatedAuthorizationResult,
  type BrokerDelegatedPathFactResolver,
  type DelegatedApprovalEnvelope,
  type SandboxMetadataMismatch,
} from "../index.js";
import {
  canonicalizePath,
  canonicalizeSandboxPolicyPayload,
  SANDBOX_POLICY_PAYLOAD_VERSION,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import type { Ed25519KeyPairPem } from "../crypto/key-custody.js";
import { randomNonce } from "../crypto/types.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const OWNER_ID = "owner-1";
const OWNER_POLICY_KEY_ID = "owner-ed25519-v1";
const POLICY_ID = "test-policy-1";
const POLICY_VERSION = 1;
const README = "/srv/ashley/live-checkout/README.md";
const SECRET_ENV = "/home/doc/.composer-assistant/.env";
const WORKSPACE_FILE = "/var/lib/ashley-sandbox/work/candidate/x.txt";

function makePolicy(overrides: Partial<SandboxPolicyDocument> = {}): SandboxPolicyDocument {
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
      { path: "/home/doc/.composer-assistant/.env", class: "absolute_denial" },
      { path: "/var/lib/ashley-sandbox/meta/keys", class: "absolute_denial" },
      { path: "/var/lib/ashley-sandbox/meta/policy", class: "absolute_denial" },
      { path: "/var/lib/ashley-sandbox/meta/audit", class: "absolute_denial" },
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
    ...overrides,
  };
}

function policyHashOf(policy: SandboxPolicyDocument): string {
  const canonical = canonicalizeSandboxPolicyPayload(policy);
  if (!canonical.ok) throw new Error("policy_canonicalization_failed");
  return sha256Hex(Buffer.from(canonical.payload, "utf8"));
}

function makeActivePolicy(
  overrides: Partial<SandboxPolicyDocument> = {},
  signerKeyId = OWNER_POLICY_KEY_ID,
): ActiveVerifiedSandboxPolicy {
  const policy = makePolicy(overrides);
  return {
    policy,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: policyHashOf(policy),
    signerKeyId,
  };
}

function makeEnvelopePayload(): Omit<DelegatedApprovalEnvelope, "signature"> {
  return {
    protocolVersion: 1,
    keyId: DELEGATED_RUNTIME_KEY_ID,
    signerClass: "delegated_runtime",
    proposalId: "prop-001",
    ownerId: OWNER_ID,
    sessionUuid: "session-1",
    capabilityId: "approved_project_read",
    authoritativeRiskClass: "low",
    canonicalTargetPaths: [{ path: README, intent: "read" }],
    policyRuleId: "sandbox-policy/rule/delegated-autonomy",
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    policyHash: "unset",
    networkMode: "none",
    persistence: "temporary",
    externalSideEffect: false,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 60_000,
    nonce: randomNonce(),
  };
}

function makeSignedEnvelope(
  pair: Ed25519KeyPairPem,
  active: ActiveVerifiedSandboxPolicy,
  overrides: Record<string, unknown> = {},
): DelegatedApprovalEnvelope {
  return signDelegatedApprovalEnvelope(
    {
      ...makeEnvelopePayload(),
      policyHash: active.policyHash,
      ...overrides,
    } as Omit<DelegatedApprovalEnvelope, "signature">,
    pair.privateKeyPem,
  );
}

const canonicalResolver: BrokerDelegatedPathFactResolver = (target) => {
  const result = canonicalizePath(target.path);
  return result.ok
    ? { ok: true, canonicalPath: result.value }
    : { ok: false, reason: "path_not_canonical" };
};

function baseInput(
  overrides: Partial<BrokerDelegatedAuthorizationInput> = {},
  pair: Ed25519KeyPairPem = generateEd25519KeyPairPem(),
): BrokerDelegatedAuthorizationInput {
  const active = makeActivePolicy();
  const spent = new Set<string>();
  return {
    envelope: makeSignedEnvelope(pair, active),
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
    pathFactResolver: canonicalResolver,
    auditSink: () => {},
    ...overrides,
  };
}

function expectRefusal(
  result: BrokerDelegatedAuthorizationResult,
  errorCode: string,
) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errorCode).toBe(errorCode);
    expect(result.audit.outcome).toBe("refused");
  }
}

function expectMismatch(
  result: BrokerDelegatedAuthorizationResult,
  code: SandboxMetadataMismatch["code"],
) {
  const mismatches = result.ok
    ? result.metadataMismatches
    : (result.metadataMismatches ?? []);
  expect(mismatches.some((m) => m.code === code)).toBe(true);
}

describe("signature and signer profile", () => {
  it("1. valid delegated envelope authorizes autonomous_safe", () => {
    const result = authorizeDelegatedSandboxRequest(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("autonomous_safe");
    expect(result.signerClass).toBe("delegated_runtime");
    expect(result.signerKeyId).toBe(DELEGATED_RUNTIME_KEY_ID);
    expect(result.capability).toBe("approved_project_read");
    expect(result.authoritativeRiskClass).toBe("low");
  });

  it("2. unknown delegated key rejected", () => {
    const result = authorizeDelegatedSandboxRequest(baseInput({ trustedDelegatedKey: null }));
    expectRefusal(result, "unknown_key");
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const forged = baseInput({
      envelope: makeSignedEnvelope(pair, active, { keyId: "attacker-key-1" }),
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(forged), "unknown_key");
  });

  it("3. delegated key not listed in active policy rejected", () => {
    const active = makeActivePolicy({ allowedDelegatedSignerKeyIds: ["other-key"] });
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "delegated_signer_not_allowed_by_policy");
  });

  it("4. delegated key cannot be treated as an owner key", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const ownerClass = baseInput({
      envelope: makeSignedEnvelope(pair, active, { signerClass: "owner" }),
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(ownerClass), "envelope_invalid");
    const ownerKeyId = baseInput({
      envelope: makeSignedEnvelope(pair, active, { keyId: "owner-ed25519-v1" }),
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(ownerKeyId), "unknown_key");
  });

  it("5. owner key cannot enter the delegated path accidentally", () => {
    const owner = generateEd25519KeyPairPem();
    const input = baseInput({
      trustedDelegatedKey: {
        keyId: "owner-ed25519-v1",
        publicKey: publicKeyFromPem(owner.publicKeyPem),
      },
    });
    expectRefusal(authorizeDelegatedSandboxRequest(input), "invalid_key_id");
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const ownerSigned = baseInput({
      envelope: signDelegatedApprovalEnvelope(
        { ...makeEnvelopePayload(), policyHash: active.policyHash },
        owner.privateKeyPem,
      ),
    });
    expectRefusal(authorizeDelegatedSandboxRequest(ownerSigned), "invalid_signature");
    expect(pair).toBeDefined();
  });

  it("6. tampered envelope rejected", () => {
    const input = baseInput();
    if (!input.envelope) return;
    const tamperCases: Array<[string, unknown]> = [
      ["capabilityId", "write_live_repository"],
      ["canonicalTargetPaths", []],
      ["nonce", "nonce-forged"],
      ["authoritativeRiskClass", "high"],
      ["externalSideEffect", true],
    ];
    for (const [field, value] of tamperCases) {
      const tampered = {
        ...input.envelope,
        [field]: value,
      };
      const result = authorizeDelegatedSandboxRequest(baseInput({ envelope: tampered }));
      expectRefusal(result, "invalid_signature");
    }
  });

  it("7. expired envelope rejected", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, { expiresAt: NOW }),
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "expired");
  });

  it("8. invalid signature does not consume a nonce", () => {
    let reserved = 0;
    const pair = generateEd25519KeyPairPem();
    const attacker = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active),
      trustedDelegatedKey: {
        keyId: DELEGATED_RUNTIME_KEY_ID,
        publicKey: publicKeyFromPem(attacker.publicKeyPem),
      },
      activePolicy: active,
      reserveNonce: () => {
        reserved += 1;
        return true;
      },
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "invalid_signature");
    expect(reserved).toBe(0);
  });

  it("9. valid replay rejected", () => {
    const input = baseInput();
    const first = authorizeDelegatedSandboxRequest(input);
    expect(first.ok).toBe(true);
    const second = authorizeDelegatedSandboxRequest(input);
    expectRefusal(second, "replay");
  });

  it("10. replayed denied request cannot later execute", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const envelope = makeSignedEnvelope(pair, active, {
      canonicalTargetPaths: [{ path: SECRET_ENV, intent: "read" }],
    });
    const input = baseInput({
      envelope,
      activePolicy: active,
      trustedDelegatedKey: {
        keyId: DELEGATED_RUNTIME_KEY_ID,
        publicKey: publicKeyFromPem(pair.publicKeyPem),
      },
    });
    const first = authorizeDelegatedSandboxRequest(input);
    expectRefusal(first, "absolute-denial");
    const second = authorizeDelegatedSandboxRequest(input);
    expectRefusal(second, "replay");
  });
});

describe("active policy identity", () => {
  it("11. missing active policy fails closed", () => {
    const result = authorizeDelegatedSandboxRequest(baseInput({ activePolicy: null }));
    expectRefusal(result, "no_active_policy");
  });

  it("12. policy ID mismatch rejected", () => {
    const active = makeActivePolicy();
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, { policyId: "other-policy" }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "policy_identity_mismatch");
  });

  it("13. policy version mismatch rejected", () => {
    const active = makeActivePolicy();
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, { policyVersion: 7 }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "policy_identity_mismatch");
  });

  it("14. policy hash mismatch rejected", () => {
    const active = makeActivePolicy();
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, { policyHash: "f".repeat(64) }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "policy_identity_mismatch");
  });

  it("15. expired active policy rejected", () => {
    const active = makeActivePolicy({ expiresAt: "2026-08-05T11:00:00.000Z" });
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "active_policy_expired");
  });

  it("16. request cannot replace the active policy", () => {
    const active = makeActivePolicy();
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        policyId: "attacker-policy",
        policyVersion: 99,
        policyHash: "a".repeat(64),
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "policy_identity_mismatch");
  });

  it("17. wrong owner-policy signer fails closed", () => {
    const active = makeActivePolicy({}, "mystery-owner-key-1");
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "policy_signer_not_trusted");
  });
});

describe("broker recomputation", () => {
  it("18. broker ignores a forged autonomous-safe label", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const shell = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "unrestricted_shell",
        authoritativeRiskClass: "low",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(shell), "absolute-denial");
    const live = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "write_live_repository",
        canonicalTargetPaths: [{ path: README, intent: "write" }],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(
      authorizeDelegatedSandboxRequest(live),
      "owner-approval-required",
    );
  });

  it("19. broker ignores a model-provided low risk", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "fixed_test_recipe",
        recipeId: "verify:agent-tsc",
        authoritativeRiskClass: "low",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.authoritativeRiskClass).toBe("medium");
    expectMismatch(result, "risk_lower_than_authoritative");
  });

  it("20. broker recomputes approved project read as autonomous-safe", () => {
    const result = authorizeDelegatedSandboxRequest(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capability).toBe("approved_project_read");
    expect(result.authoritativeRiskClass).toBe("low");
    expect(result.policyRuleId).toBe("sandbox-policy/rule/delegated-autonomy");
  });

  it("21. broker recomputes disposable-workspace write as autonomous-safe", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "candidate_workspace_read_write_delete",
        canonicalTargetPaths: [{ path: WORKSPACE_FILE, intent: "write" }],
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canonicalPaths[0]?.canonicalPath).toBe(WORKSPACE_FILE);
  });

  it("22. broker recomputes live-checkout write as owner approval required", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "candidate_workspace_read_write_delete",
        canonicalTargetPaths: [
          { path: "/srv/ashley/live-checkout/src/x.ts", intent: "write" },
        ],
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "owner-approval-escalated");
    if (result.ok) return;
    expect(result.decision).toBe("owner_approval_required");
    expect(result.authoritativeRiskClass).toBe("consultation");
  });

  it("23. broker recomputes live .git write as owner approval required", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "candidate_workspace_read_write_delete",
        canonicalTargetPaths: [
          { path: "/srv/ashley/live-checkout/.git/config", intent: "write" },
        ],
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "owner-approval-escalated");
    if (result.ok) return;
    expect(result.decision).toBe("owner_approval_required");
  });

  it("24. secret path access denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        canonicalTargetPaths: [{ path: SECRET_ENV, intent: "read" }],
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "absolute-denial");
    if (result.ok) return;
    expect(result.authoritativeRiskClass).toBe("high");
  });

  it("25. signing-key path access denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        canonicalTargetPaths: [
          { path: "/var/lib/ashley-sandbox/meta/keys/delegated.pub", intent: "read" },
        ],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "absolute-denial");
  });

  it("26. active policy modification denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "authorization_policy_modification",
        canonicalTargetPaths: [
          { path: "/var/lib/ashley-sandbox/meta/policy/policy.json", intent: "write" },
        ],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "absolute-denial");
  });

  it("27. broker safeguard modification denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "safeguard_weakening",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "absolute-denial");
  });

  it("28. unrestricted shell denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "unrestricted_shell",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "absolute-denial");
  });

  it("29. unknown capability denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "not-a-real-capability",
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "unknown-capability");
    expectMismatch(result, "capability_mismatch");
  });

  it("30. missing canonical path facts fail closed", () => {
    const input = baseInput({
      pathFactResolver: () => ({ ok: false, reason: "path_not_found" }),
    });
    expectRefusal(authorizeDelegatedSandboxRequest(input), "path_facts_unavailable");
    const noResolver = baseInput({ pathFactResolver: undefined });
    expectRefusal(
      authorizeDelegatedSandboxRequest(noResolver),
      "path_facts_unavailable",
    );
  });

  it("31. string-prefix path trick rejected", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        canonicalTargetPaths: [
          { path: "/srv/ashley/live-checkout-work/README.md", intent: "read" },
        ],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "path-not-permitted");
  });

  it("32. most-specific protected root wins", () => {
    const active = makeActivePolicy({
      protectedRoots: [
        {
          path: "/srv/ashley/state/config",
          class: "delegated_write_denied_owner_approvable",
        },
        {
          path: "/srv/ashley/state/config/keys",
          class: "absolute_denial",
        },
      ],
    });
    const pair = generateEd25519KeyPairPem();
    const keysWrite = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "candidate_workspace_read_write_delete",
        canonicalTargetPaths: [
          { path: "/srv/ashley/state/config/keys/ed25519.key", intent: "write" },
        ],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(keysWrite), "absolute-denial");
    const configWrite = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "candidate_workspace_read_write_delete",
        canonicalTargetPaths: [
          { path: "/srv/ashley/state/config/app.conf", intent: "write" },
        ],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(
      authorizeDelegatedSandboxRequest(configWrite),
      "owner-approval-escalated",
    );
  });

  it("33. nonexistent unsafe target fails closed", () => {
    const input = baseInput({
      pathFactResolver: () => ({ ok: false, reason: "path_not_found" }),
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "path_facts_unavailable");
    expect(result.ok).toBe(false);
  });

  it("34. path-intent mismatch rejected", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        canonicalTargetPaths: [{ path: README, intent: "write" }],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "intent_mismatch");
  });

  it("claimed disposable path but broker resolves live checkout is denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        canonicalTargetPaths: [{ path: WORKSPACE_FILE, intent: "write" }],
      }),
      activePolicy: active,
      pathFactResolver: (target) => {
        expect(target.path).toBe(WORKSPACE_FILE);
        return {
          ok: true,
          canonicalPath: "/srv/ashley/live-checkout/other.txt",
        };
      },
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "path_facts_mismatch");
    expectMismatch(result, "path_mismatch");
  });
});

describe("recipes and execution fields", () => {
  it("35. allowed fixed recipe may become autonomous-safe", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "fixed_test_recipe",
        recipeId: "verify:agent-tsc",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capability).toBe("fixed_test_recipe");
  });

  it("36. unknown recipe denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "fixed_test_recipe",
        recipeId: "not-a-recipe",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "recipe-not-allowed");
  });

  it("37. recipe not permitted by active policy denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "fixed_test_recipe",
        recipeId: "verify:repo-tsc",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "recipe-not-allowed");
  });

  it("38. arbitrary executable denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "bounded_diagnostic_execution",
        executableId: "evil.sh",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "executable-not-allowed");
  });

  it("39. argv mutation invalidates signature", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const envelope = makeSignedEnvelope(pair, active, {
      capabilityId: "fixed_test_recipe",
      recipeId: "verify:agent-tsc",
      canonicalTargetPaths: [],
    });
    const tampered = { ...envelope, argv: ["--unsafe"] };
    const result = authorizeDelegatedSandboxRequest(
      baseInput({ envelope: tampered, activePolicy: active }),
    );
    expectRefusal(result, "invalid_signature");
  });

  it("40. cwd mutation invalidates signature", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const envelope = makeSignedEnvelope(pair, active, {
      capabilityId: "fixed_test_recipe",
      recipeId: "verify:agent-tsc",
      canonicalTargetPaths: [],
    });
    const tampered = { ...envelope, cwd: "/tmp/attacker" };
    const result = authorizeDelegatedSandboxRequest(
      baseInput({ envelope: tampered, activePolicy: active }),
    );
    expectRefusal(result, "invalid_signature");
  });

  it("41. capability mismatch between envelope and broker facts denied", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "approved_bounded_log_read",
        canonicalTargetPaths: [{ path: SECRET_ENV, intent: "read" }],
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "absolute-denial");
    if (result.ok) return;
    expect(result.authoritativeRiskClass).toBe("high");
  });

  it("42. claimed temporary operation with persistent effect denies", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "candidate_workspace_read_write_delete",
        persistence: "persistent",
        canonicalTargetPaths: [{ path: WORKSPACE_FILE, intent: "write" }],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "persistence_not_temporary");
  });

  it("43. external-side-effect mismatch escalates or denies", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const forgedFalse = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "service_restart_management",
        externalSideEffect: false,
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(
      authorizeDelegatedSandboxRequest(forgedFalse),
      "owner-approval-required",
    );
    const declaredTrue = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "approved_project_read",
        externalSideEffect: true,
      }),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(declaredTrue), "external-effects");
  });
});

describe("limits and network", () => {
  it("44. network none passes when policy permits", () => {
    const result = authorizeDelegatedSandboxRequest(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effectiveLimits.wallMsMax).toBe(120_000);
  });

  it("45. non-none network cannot be autonomous", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const envelopeRequest = baseInput({
      envelope: makeSignedEnvelope(pair, active, { networkMode: "networked" }),
      activePolicy: active,
    }, pair);
    expectRefusal(
      authorizeDelegatedSandboxRequest(envelopeRequest),
      "envelope_invalid",
    );
    const networkedPolicy = makeActivePolicy({ networkMode: "networked" });
    const policyPair = generateEd25519KeyPairPem();
    const policyRequest = baseInput({
      envelope: makeSignedEnvelope(policyPair, networkedPolicy),
      activePolicy: networkedPolicy,
    }, policyPair);
    expectRefusal(
      authorizeDelegatedSandboxRequest(policyRequest),
      "policy_network_mode_not_none",
    );
  });

  it("46. requested limit above policy is clamped to policy", () => {
    const active = makeActivePolicy({
      resourceCeilings: {
        wallMsMax: 60_000,
        maxProcesses: 16,
        maxOutputBytes: 4_194_304,
        workspaceBytesMax: 2_000_000_000,
      },
    });
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effectiveLimits.wallMsMax).toBe(60_000);
  });

  it("47. limit above broker hard max is clamped to the hard max", () => {
    const active = makeActivePolicy({
      resourceCeilings: {
        wallMsMax: 500_000,
        maxProcesses: 16,
        maxOutputBytes: 4_194_304,
        workspaceBytesMax: 2_000_000_000,
      },
    });
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effectiveLimits.wallMsMax).toBe(120_000);
  });

  it("48. effective limit uses the strictest bound", () => {
    const active = makeActivePolicy({
      resourceCeilings: {
        wallMsMax: 120_000,
        maxProcesses: 4,
        maxOutputBytes: 1_048_576,
        workspaceBytesMax: 2_000_000_000,
      },
    });
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effectiveLimits.maxProcesses).toBe(4);
    expect(result.effectiveLimits.maxOutputBytes).toBe(1_048_576);
    expect(result.effectiveLimits.workspaceBytesMax).toBe(2_000_000_000);
  });

  it("49. negative or malformed limits rejected", () => {
    const active = makeActivePolicy({
      resourceCeilings: {
        wallMsMax: -5,
        maxProcesses: 16,
        maxOutputBytes: 4_194_304,
        workspaceBytesMax: 2_000_000_000,
      },
    });
    const pair = generateEd25519KeyPairPem();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active),
      activePolicy: active,
    }, pair);
    expectRefusal(authorizeDelegatedSandboxRequest(input), "active_policy_invalid");
  });

  it("50. limit mutation invalidates the envelope", () => {
    const input = baseInput();
    const smuggled = {
      ...input.envelope,
      limits: { wallMs: 1, maxProcesses: 1, maxOutputBytes: 1 },
    };
    const result = authorizeDelegatedSandboxRequest(baseInput({ envelope: smuggled }));
    expectRefusal(result, "envelope_invalid");
    if (!result.ok) expect(result.reason).toContain("unsupported_field:limits");
  });
});

describe("metadata comparison and audit", () => {
  it("51. broker rule ID overrides the preliminary rule ID", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        policyRuleId: "sandbox-policy/rule/forged",
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policyRuleId).toBe("sandbox-policy/rule/delegated-autonomy");
    expectMismatch(result, "rule_id_mismatch");
  });

  it("52. lower agent risk produces a mismatch record", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "fixed_test_recipe",
        recipeId: "verify:agent-tsc",
        authoritativeRiskClass: "low",
        canonicalTargetPaths: [],
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.authoritativeRiskClass).toBe("medium");
    const mismatch = result.metadataMismatches.find(
      (m) => m.code === "risk_lower_than_authoritative",
    );
    expect(mismatch).toBeDefined();
    if (mismatch && mismatch.code === "risk_lower_than_authoritative") {
      expect(mismatch.agentRisk).toBe("low");
      expect(mismatch.brokerRisk).toBe("medium");
    }
  });

  it("53. capability mismatch produces denial", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "not-a-real-capability",
      }),
      activePolicy: active,
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "unknown-capability");
    expectMismatch(result, "capability_mismatch");
  });

  it("54. audit records policy identity and the authoritative decision", () => {
    const audits: BrokerDelegatedAuthorizationAudit[] = [];
    const input = baseInput({ auditSink: (record) => audits.push(record) });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    expect(audits).toHaveLength(1);
    const audit = audits[0];
    expect(audit.kind).toBe("broker_delegated_authorization");
    expect(audit.outcome).toBe("authorized");
    expect(audit.decision).toBe("autonomous_safe");
    expect(audit.errorCode).toBeNull();
    expect(audit.policyId).toBe(POLICY_ID);
    expect(audit.policyVersion).toBe(POLICY_VERSION);
    expect(audit.policyHash).toBe(input.activePolicy?.policyHash);
    expect(audit.brokerCapability).toBe("approved_project_read");
    expect(audit.brokerRiskClass).toBe("low");
    expect(audit.brokerPolicyRuleId).toBe("sandbox-policy/rule/delegated-autonomy");
    expect(audit.signerKeyId).toBe(DELEGATED_RUNTIME_KEY_ID);
    expect(audit.signerClass).toBe("delegated_runtime");
    expect(audit.publicKeyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(audit.nonceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("55. audit excludes private material", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const audits: BrokerDelegatedAuthorizationAudit[] = [];
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        capabilityId: "fixed_test_recipe",
        recipeId: "verify:agent-tsc",
        argv: ["--secret-flavored"],
        cwd: "/var/lib/ashley-sandbox/work",
        canonicalTargetPaths: [],
        nonce: "distinct-nonce-audit-1",
      }),
      activePolicy: active,
      auditSink: (record) => audits.push(record),
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain(pair.privateKeyPem);
    expect(serialized).not.toContain(pair.publicKeyPem);
    expect(serialized).not.toContain("distinct-nonce-audit-1");
    expect(serialized).not.toContain("--secret-flavored");
    expect(serialized).not.toContain("/var/lib/ashley-sandbox/work");
    if (!result.ok) return;
    expect(result.audit).toBeDefined();
  });

  it("56. audit redacts secret-bearing values", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const audits: BrokerDelegatedAuthorizationAudit[] = [];
    const input = baseInput({
      envelope: makeSignedEnvelope(pair, active, {
        canonicalTargetPaths: [{ path: SECRET_ENV, intent: "read" }],
      }),
      activePolicy: active,
      auditSink: (record) => audits.push(record),
    }, pair);
    const result = authorizeDelegatedSandboxRequest(input);
    expectRefusal(result, "absolute-denial");
    expect(audits).toHaveLength(1);
    expect(audits[0].canonicalPathClasses).toContain(
      "read:[redacted-secret-path]:absolute_denial",
    );
    expect(JSON.stringify(audits)).not.toContain(SECRET_ENV);
  });

  it("57. stable error codes returned", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const cases: Array<[BrokerDelegatedAuthorizationInput, string]> = [
      [baseInput({ trustedDelegatedKey: null }), "unknown_key"],
      [
        baseInput({
          envelope: makeSignedEnvelope(pair, active, { expiresAt: NOW }),
          activePolicy: active,
        }, pair),
        "expired",
      ],
      [baseInput({ activePolicy: null }), "no_active_policy"],
      [baseInput({ pathFactResolver: undefined }), "path_facts_unavailable"],
      [
        baseInput({
          envelope: makeSignedEnvelope(pair, active, {
            persistence: "persistent",
            canonicalTargetPaths: [{ path: WORKSPACE_FILE, intent: "write" }],
          }),
          activePolicy: active,
        }, pair),
        "persistence_not_temporary",
      ],
      [
        baseInput({
          envelope: makeSignedEnvelope(pair, active, { policyId: "x" }),
          activePolicy: active,
        }, pair),
        "policy_identity_mismatch",
      ],
      [
        baseInput({
          envelope: makeSignedEnvelope(pair, active, {
            capabilityId: "unrestricted_shell",
            canonicalTargetPaths: [],
          }),
          activePolicy: active,
        }, pair),
        "absolute-denial",
      ],
    ];
    for (const [input, expected] of cases) {
      expectRefusal(authorizeDelegatedSandboxRequest(input), expected);
    }
  });

  it("58. no raw crypto stack traces escape", () => {
    const pair = generateEd25519KeyPairPem();
    const active = makeActivePolicy();
    const deniedCases = [
      baseInput({ trustedDelegatedKey: null }),
      baseInput({ activePolicy: null }),
      baseInput({
        envelope: makeSignedEnvelope(pair, active, {
          canonicalTargetPaths: [{ path: SECRET_ENV, intent: "read" }],
        }),
        activePolicy: active,
      }, pair),
    ];
    for (const input of deniedCases) {
      const result = authorizeDelegatedSandboxRequest(input);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).not.toMatch(/Error|at |node:|crypto|stack/i);
      expect(result.audit.errorCode).toBe(result.errorCode);
    }
  });
});

describe("isolation", () => {
  const source = readFileSync(
    new URL("./delegated-authorization.ts", import.meta.url),
    "utf8",
  );

  it("59. authorization module spawns no process", () => {
    expect(source).not.toContain("child_process");
    expect(source).not.toContain("spawn");
  });

  it("60. authorization module writes no file", () => {
    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("writeFile");
  });

  it("61. authorization module calls no provider", () => {
    expect(source).not.toContain("node:http");
    expect(source).not.toContain("node:https");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("mistral");
    expect(source).not.toContain("openai");
  });

  it("62. authorization module does not activate routes", () => {
    expect(source).not.toContain("server.js");
    expect(source).not.toContain("dispatch");
    expect(source).not.toContain("listen");
    expect(source).not.toContain("index.js");
  });

  it("63. no sandbox session created", () => {
    expect(source).not.toContain("broker-store");
    expect(source).not.toContain("createUploadSession");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("generateKeyPair");
  });
});
