import { describe, expect, it } from "vitest";
import { SandboxBroker } from "./broker.js";
import { BrokerStore } from "./store/broker-store.js";
import type { BrokerSandboxSession } from "./sessions/session-types.js";
import {
  makeWorkspaceTestRoots,
} from "./test/fixtures/workspace.js";
import { approvalVerifier, createTestKeys, tombstoneVerifier } from "./test/fixtures/keys.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");
const ACTIVE_HASH = "a".repeat(64);

function session(overrides: Partial<BrokerSandboxSession> = {}): BrokerSandboxSession {
  return {
    sessionUuid: "sess-1",
    ownerId: "owner-1",
    proposalId: "prop-1",
    role: "sandbox_operator_light",
    state: "active",
    policyId: "policy-1",
    policyVersion: 1,
    policyHash: ACTIVE_HASH,
    delegatedSignerKeyId: "key-1",
    capabilitySigningKeyId: "key-2",
    allowedCapabilities: ["approved_project_read"],
    maxToolExecutions: 4,
    toolExecutionsUsed: 0,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 3_600_000).toISOString(),
    revision: 1,
    ...overrides,
  };
}

function makeBroker() {
  const roots = makeWorkspaceTestRoots();
  const keys = createTestKeys();
  const broker = new SandboxBroker({
    workspaceRoot: roots.base,
    ownerId: "owner-1",
    approval: approvalVerifier(keys),
    tombstone: tombstoneVerifier(keys),
    interpreterAllowlist: new Set(["/bin/echo"]),
    envAllowlist: new Set(["PATH"]),
    processRunner: {
      async run() {
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          truncated: false,
          terminalReason: "success",
        };
      },
    },
    store: new BrokerStore(),
    rootConfig: roots.rootConfig,
  });
  return { broker, roots };
}

const ctx = { peerOwnerId: "owner-1", ownerId: "owner-1", nowMs: NOW };

describe("broker.reconcile dispatch", () => {
  it("reports and audits a superseded session", () => {
    const { broker } = makeBroker();
    broker.store.sessionLedger.createSession(session({ policyHash: "b".repeat(64) }));
    const result = broker.dispatch(
      "broker.reconcile",
      {
        ownerId: "owner-1",
        activePolicy: { policyId: "policy-1", policyVersion: 2, policyHash: ACTIVE_HASH },
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        policySuperseded: unknown[];
        missingWorkspace: unknown[];
        activeSessions: number;
      };
      expect(data.policySuperseded).toHaveLength(1);
    }
    expect(
      broker.store.auditEvents.some(
        (event) => event.code === "broker_reconcile" && event.metadata.policySuperseded === 1,
      ),
    ).toBe(true);
  });

  it("rejects an invalid active policy identity", () => {
    const { broker } = makeBroker();
    const result = broker.dispatch(
      "broker.reconcile",
      { ownerId: "owner-1", activePolicy: { policyId: "", policyVersion: 1, policyHash: ACTIVE_HASH } },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("active_policy_invalid");
  });

  it("rejects a non-owner peer", () => {
    const { broker } = makeBroker();
    const result = broker.dispatch(
      "broker.reconcile",
      {
        ownerId: "owner-1",
        activePolicy: { policyId: "policy-1", policyVersion: 1, policyHash: ACTIVE_HASH },
      },
      { ...ctx, peerOwnerId: "intruder" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("peer_not_owner");
  });
});
