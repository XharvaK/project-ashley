import { describe, expect, it, vi } from "vitest";

vi.mock("./precheck.js", () => ({
  runSandboxPrecheck: vi.fn(),
}));

import { runSandboxPrecheck } from "./precheck.js";
import {
  createEngineeringEnvelopeProvider,
  verifyEngineeringReadiness,
  type EngineeringEnvelopeProviderConfig,
} from "./engineering-envelope.js";
import type { SandboxCapabilityId, SandboxPolicyDocument } from "@composer-assistant/sandbox-policy";
import type { DelegatedRuntimeKeyMaterial } from "./delegated-key-custody.js";

const policy = {
  policyId: "pol-production-r4-006",
  policyVersion: 6,
} as unknown as SandboxPolicyDocument;

const delegatedKey: DelegatedRuntimeKeyMaterial = {
  keyId: "delegated-ed25519-v1",
  privateKeyPem: "x",
  publicKeyPem: "y",
};

const config: EngineeringEnvelopeProviderConfig = {
  ownerId: "owner-1",
  policy,
  policyHash: "a".repeat(64),
  delegatedKey,
  roots: { projectRoots: ["/p"], candidateRepoRoot: "/p", workspaceRoots: ["/p"] },
};

function safePrecheck(over: Record<string, unknown>) {
  return {
    ok: true,
    preliminary: true,
    preliminaryDecision: "autonomous_safe",
    capabilityId: "engineering_project_read" as SandboxCapabilityId,
    authoritativeRiskClass: "low",
    policyRuleId: "r",
    policyId: "pol-production-r4-006",
    policyVersion: 6,
    policyHash: "a".repeat(64),
    audit: null,
    brokerVerificationRequired: true,
    ...over,
  };
}

describe("engineering envelope signing gate", () => {
  it("refuses to sign when the precheck is autonomous-safe but broker verification is not required", () => {
    vi.mocked(runSandboxPrecheck).mockReturnValue(
      safePrecheck({ brokerVerificationRequired: false }) as never,
    );
    const provider = createEngineeringEnvelopeProvider(config);
    expect(() =>
      provider(
        { type: "inspect_project_file", fields: { projectId: "p", relativePath: "a.ts" } },
        "engineering_project_read",
        1,
      ),
    ).toThrow(/brokerVerificationRequired=false/);
  });

  it("refuses to sign when the precheck requires owner approval (not autonomous-safe)", () => {
    vi.mocked(runSandboxPrecheck).mockReturnValue(
      safePrecheck({ preliminaryDecision: "owner_approval_required" }) as never,
    );
    const provider = createEngineeringEnvelopeProvider(config);
    expect(() =>
      provider(
        { type: "inspect_project_file", fields: { projectId: "p", relativePath: "a.ts" } },
        "engineering_project_read",
        1,
      ),
    ).toThrow(/owner_approval_required/);
  });
});

describe("verifyEngineeringReadiness", () => {
  it("returns ok when trust anchors load successfully", () => {
    const res = verifyEngineeringReadiness({
      ownerId: "owner-1",
      nowMs: 1,
      loadAnchors: () => ({}) as never,
    });
    expect(res.ok).toBe(true);
  });

  it("fails closed with the underlying reason when authority material is missing", () => {
    const res = verifyEngineeringReadiness({
      ownerId: "owner-1",
      nowMs: 1,
      loadAnchors: () => {
        throw new Error("engineering_policy_artifact_missing");
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("engineering_policy_artifact_missing");
  });
});
