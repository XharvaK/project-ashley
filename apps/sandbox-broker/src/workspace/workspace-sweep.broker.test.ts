import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { SandboxBroker } from "../broker.js";
import { BrokerStore } from "../store/broker-store.js";
import { BrokerSessionLedger } from "../sessions/session-ledger.js";
import type { BrokerSandboxSession } from "../sessions/session-types.js";
import { createDisposableWorkspace } from "./workspace-create.js";
import { toNativeBrokerPath } from "../policy/path.js";
import {
  makeWorkspaceAuthorization,
  makeWorkspaceTestRoots,
} from "../test/fixtures/workspace.js";
import { approvalVerifier, createTestKeys, tombstoneVerifier } from "../test/fixtures/keys.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");

function makeBroker(rootConfig: ReturnType<typeof makeWorkspaceTestRoots>["rootConfig"]) {
  const keys = createTestKeys();
  const store = new BrokerStore();
  const broker = new SandboxBroker({
    workspaceRoot: rootConfig.workspaceRoot,
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
    store,
    rootConfig,
  });
  return { broker, store, keys };
}

const ctx = { peerOwnerId: "owner-1", ownerId: "owner-1", nowMs: NOW + 2_000 };

function sessionWith(
  workspaceId: string,
  state: BrokerSandboxSession["state"],
  sessionUuid: string,
): BrokerSandboxSession {
  return {
    sessionUuid,
    ownerId: "owner-1",
    proposalId: "prop-1",
    role: "sandbox_operator_light",
    state,
    policyId: "policy-1",
    policyVersion: 1,
    policyHash: "a".repeat(64),
    delegatedSignerKeyId: "key-1",
    capabilitySigningKeyId: "key-2",
    workspaceId,
    allowedCapabilities: ["approved_project_read"],
    maxToolExecutions: 4,
    toolExecutionsUsed: 0,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 1_000).toISOString(),
    revision: 1,
  };
}

async function createWorkspace(
  roots: ReturnType<typeof makeWorkspaceTestRoots>,
): Promise<{ workspaceId: string; treeRoot: string }> {
  const result = await createDisposableWorkspace({
    authorization: makeWorkspaceAuthorization(),
    rootConfig: roots.rootConfig,
    sourceRoot: roots.sourceRoot,
    limits: { ttlMs: 1_000 },
    nowMs: NOW,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errorCode);
  return { workspaceId: result.workspaceId, treeRoot: result.treeRoot };
}

describe("workspace.sweep dispatch", () => {
  it("sweeps workspaces of terminal sessions only when no candidates are offered", async () => {
    const roots = makeWorkspaceTestRoots();
    const { broker } = makeBroker(roots.rootConfig);
    const terminal = await createWorkspace(roots);
    const live = await createWorkspace(roots);
    const ledger = broker.store.sessionLedger;
    ledger.createSession(sessionWith(terminal.workspaceId, "expired", "sess-expired"));
    ledger.createSession(sessionWith(live.workspaceId, "active", "sess-active"));

    const result = broker.workspaceSweep({ ownerId: "owner-1" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errorCode);
    expect(result.data.removed.map((entry) => entry.workspaceId)).toEqual([
      terminal.workspaceId,
    ]);
    expect(existsSync(toNativeBrokerPath(terminal.treeRoot))).toBe(false);
    expect(existsSync(toNativeBrokerPath(live.treeRoot))).toBe(true);
  });

  it("never removes a workspace of a live session even when offered as a candidate", async () => {
    const roots = makeWorkspaceTestRoots();
    const { broker } = makeBroker(roots.rootConfig);
    const live = await createWorkspace(roots);
    broker.store.sessionLedger.createSession(
      sessionWith(live.workspaceId, "active", "sess-live"),
    );
    const result = broker.workspaceSweep(
      { ownerId: "owner-1", candidates: [live.workspaceId], maxWorkspaces: 100 },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errorCode);
    expect(result.data.removed).toHaveLength(0);
    expect(result.data.candidatesScanned).toBe(0);
    expect(existsSync(toNativeBrokerPath(live.treeRoot))).toBe(true);
  });

  it("rejects a non-owner peer", async () => {
    const roots = makeWorkspaceTestRoots();
    const { broker } = makeBroker(roots.rootConfig);
    const result = broker.workspaceSweep(
      { ownerId: "owner-1" },
      { ...ctx, peerOwnerId: "intruder" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("peer_not_owner");
  });

  it("rejects an ownerId that does not match the request context", async () => {
    const roots = makeWorkspaceTestRoots();
    const { broker } = makeBroker(roots.rootConfig);
    const result = broker.workspaceSweep({ ownerId: "someone-else" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("owner_mismatch");
  });

  it("fails closed when no root config is configured", async () => {
    const roots = makeWorkspaceTestRoots();
    const { broker } = makeBroker(roots.rootConfig);
    broker.config.rootConfig = undefined;
    const result = broker.workspaceSweep({ ownerId: "owner-1" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("root_config_missing");
  });

  it("rejects out-of-bounds maxWorkspaces", async () => {
    const roots = makeWorkspaceTestRoots();
    const { broker } = makeBroker(roots.rootConfig);
    const result = broker.workspaceSweep(
      { ownerId: "owner-1", maxWorkspaces: 0 },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_max_workspaces");
  });
});
