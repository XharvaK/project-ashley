import { describe, expect, it } from "vitest";
import { BrokerSessionLedger } from "./session-ledger.js";
import { reconcileBrokerState } from "./session-reconcile.js";
import type { BrokerSandboxSession } from "./session-types.js";
import { createDisposableWorkspace } from "../workspace/workspace-create.js";
import {
  makeWorkspaceAuthorization,
  makeWorkspaceTestRoots,
} from "../test/fixtures/workspace.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");
const ACTIVE_HASH = "a".repeat(64);
const OLD_HASH = "b".repeat(64);

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

describe("reconcileBrokerState", () => {
  it("reports no drift for a fully aligned active session", () => {
    const ledger = new BrokerSessionLedger();
    ledger.createSession(session());
    const result = reconcileBrokerState({
      ledger,
      activePolicy: { policyId: "policy-1", policyVersion: 1, policyHash: ACTIVE_HASH },
      nowMs: NOW,
    });
    expect(result).toEqual({
      activeSessions: 1,
      policySuperseded: [],
      missingWorkspace: [],
    });
  });

  it("surfaces sessions under a superseded policy and records an idempotent event", () => {
    const ledger = new BrokerSessionLedger();
    ledger.createSession(session({ policyHash: OLD_HASH }));
    const result = reconcileBrokerState({
      ledger,
      activePolicy: { policyId: "policy-1", policyVersion: 2, policyHash: ACTIVE_HASH },
      nowMs: NOW,
    });
    expect(result.policySuperseded).toEqual([
      {
        sessionUuid: "sess-1",
        sessionPolicyHash: OLD_HASH,
        activePolicyHash: ACTIVE_HASH,
      },
    ]);
    expect(
      ledger.listEvents("sess-1").map((event) => event.eventType),
    ).toContain("session_policy_superseded");
    const again = reconcileBrokerState({
      ledger,
      activePolicy: { policyId: "policy-1", policyVersion: 2, policyHash: ACTIVE_HASH },
      nowMs: NOW + 1_000,
    });
    expect(again.policySuperseded).toHaveLength(1);
    expect(
      ledger.listEvents("sess-1").filter((event) => event.eventType === "session_policy_superseded"),
    ).toHaveLength(1);
  });

  it("surfaces a session bound to a missing workspace", async () => {
    const ledger = new BrokerSessionLedger();
    const roots = makeWorkspaceTestRoots();
    const created = await createDisposableWorkspace({
      authorization: makeWorkspaceAuthorization(),
      rootConfig: roots.rootConfig,
      sourceRoot: roots.sourceRoot,
      nowMs: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.errorCode);
    const intact = ledger;
    intact.createSession(session({ sessionUuid: "sess-intact", workspaceId: created.workspaceId }));
    intact.createSession(session({ sessionUuid: "sess-gone", workspaceId: "AAAAAAAAAAAAAAAAAAAAAA" }));
    const result = reconcileBrokerState({
      ledger,
      activePolicy: { policyId: "policy-1", policyVersion: 1, policyHash: ACTIVE_HASH },
      nowMs: NOW,
      workspaceRootConfig: roots.rootConfig,
    });
    expect(result.missingWorkspace).toEqual([
      { sessionUuid: "sess-gone", workspaceId: "AAAAAAAAAAAAAAAAAAAAAA" },
    ]);
    expect(
      ledger.listEvents("sess-gone").map((event) => event.eventType),
    ).toContain("session_workspace_missing");
    expect(
      ledger.listEvents("sess-intact").map((event) => event.eventType),
    ).not.toContain("session_workspace_missing");
  });

  it("skips terminal sessions", () => {
    const ledger = new BrokerSessionLedger();
    ledger.createSession(session({ state: "expired", policyHash: OLD_HASH }));
    const result = reconcileBrokerState({
      ledger,
      activePolicy: { policyId: "policy-1", policyVersion: 2, policyHash: ACTIVE_HASH },
      nowMs: NOW,
    });
    expect(result).toEqual({
      activeSessions: 0,
      policySuperseded: [],
      missingWorkspace: [],
    });
  });
});
