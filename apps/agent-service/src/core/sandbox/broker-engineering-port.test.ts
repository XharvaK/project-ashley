import { describe, expect, it } from "vitest";
import type { DelegatedApprovalEnvelope } from "@composer-assistant/sandbox-broker";
import type { EngineeringAction } from "@composer-assistant/sandbox-policy";
import { createBrokerEngineeringPort } from "./broker-engineering-port.js";
import type { EngineeringToolResult } from "./engineering-types.js";
import type { SandboxBrokerClient } from "./broker-client.js";

function envelope(id: string): DelegatedApprovalEnvelope {
  return {
    protocolVersion: 1,
    keyId: "delegated-ed25519-v1",
    signerClass: "delegated_runtime",
    proposalId: `prop-${id}`,
    ownerId: "owner-1",
    capabilityId: "engineering_project_read",
    authoritativeRiskClass: "low",
    canonicalTargetPaths: [],
    policyRuleId: "sandbox-policy/rule/delegated-autonomy",
    policyId: "pol-production-r4-006",
    policyVersion: 6,
    policyHash: "a".repeat(64),
    networkMode: "none",
    persistence: "temporary",
    externalSideEffect: false,
    issuedAt: 0,
    expiresAt: 1,
    nonce: `n-${id}`,
    signature: "sig",
  } as unknown as DelegatedApprovalEnvelope;
}

function fakeClient() {
  const engineeringCalls: { envelope: DelegatedApprovalEnvelope; action: EngineeringAction }[] = [];
  const client = {
    kind: "in_process_fake",
    async authorizeRequest() {
      return {
        ok: true,
        decision: "autonomous_safe",
        policyRuleId: "r",
        policyId: "p",
        policyVersion: 6,
        policyHash: "h",
        authoritativeRiskClass: "low",
        audit: null,
      } as never;
    },
    async engineeringAction(input: { envelope: DelegatedApprovalEnvelope; action: EngineeringAction }) {
      engineeringCalls.push({ envelope: input.envelope, action: input.action });
      return { ok: true, data: { ok: true }, artifactRef: null } as EngineeringToolResult;
    },
  } as unknown as SandboxBrokerClient;
  return { client, engineeringCalls };
}

describe("createBrokerEngineeringPort envelope forwarding", () => {
  it("forwards the per-call envelope to engineeringAction, not a baked config envelope", async () => {
    const { client, engineeringCalls } = fakeClient();
    const callEnvelope = envelope("call");
    const port = createBrokerEngineeringPort({ client, nowMs: () => 1234 });

    await port.executeAction(
      { type: "inspect_project_file", fields: { projectId: "p", relativePath: "a.ts" } },
      callEnvelope,
    );

    expect(engineeringCalls).toHaveLength(1);
    expect(engineeringCalls[0]!.envelope).toBe(callEnvelope);
  });
});
