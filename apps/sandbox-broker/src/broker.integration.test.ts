import { describe, expect, it } from "vitest";
import { createBroker, MemoryTransport } from "./index.js";
import { FRAME_VERSION } from "./constants/limits.js";
import { encodeFrame } from "./protocol/frame.js";
import {
  approvalVerifier,
  createTestKeys,
  signedApproval,
  tombstoneVerifier,
} from "./test/fixtures/keys.js";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function createIntegrationBroker() {
  const keys = createTestKeys();
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "ashley-broker-int-"));
  mkdirSync(path.join(workspaceRoot, "workspace"), { recursive: true });
  const broker = createBroker({
    workspaceRoot,
    ownerId: "owner-1",
    approval: approvalVerifier(keys),
    tombstone: tombstoneVerifier(keys),
    interpreterAllowlist: new Set(["/bin/echo"]),
    envAllowlist: new Set(["PATH"]),
    processRunner: {
      async run() {
        return {
          exitCode: 0,
          stdout: "ok",
          stderr: "",
          truncated: false,
          terminalReason: "success",
        };
      },
    },
  });
  return { broker, keys, transport: new MemoryTransport(broker) };
}

const ownerCtx = {
  peerOwnerId: "owner-1",
  ownerId: "owner-1",
  nowMs: Date.now(),
};

describe("broker integration", () => {
  it("round-trips task.submit via encoded frames", () => {
    const { keys, transport } = createIntegrationBroker();
    const approval = signedApproval(keys, { taskId: "int-task-1", nonce: "nonce-int-1" });
    const request = encodeFrame({
      frameVersion: FRAME_VERSION,
      requestId: "req-1",
      messageType: "task.submit",
      payload: { approval },
    });
    const responseBuffer = transport.sendEncoded(request, ownerCtx);
    const response = JSON.parse(
      responseBuffer.subarray(responseBuffer.indexOf(10) + 1).toString("utf8"),
    ) as { ok: boolean; data?: { taskId: string; state: string } };
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data?.taskId).toBe("int-task-1");
      expect(response.data?.state).toBe("running");
    }
  });

  it("rejects non-owner peer on mutating paths", () => {
    const { keys, transport } = createIntegrationBroker();
    const approval = signedApproval(keys, { taskId: "int-task-2", nonce: "nonce-int-2" });
    const request = encodeFrame({
      frameVersion: FRAME_VERSION,
      requestId: "req-2",
      messageType: "task.submit",
      payload: { approval },
    });
    const responseBuffer = transport.sendEncoded(request, {
      ...ownerCtx,
      peerOwnerId: "intruder",
    });
    const response = JSON.parse(
      responseBuffer.subarray(responseBuffer.indexOf(10) + 1).toString("utf8"),
    ) as { ok: boolean; errorCode?: string };
    expect(response.ok).toBe(false);
    expect(response.errorCode).toBe("peer_not_owner");
  });

  it("rejects nonce replay at broker level", () => {
    const { broker, keys } = createIntegrationBroker();
    const approval = signedApproval(keys, { taskId: "replay-task", nonce: "shared-nonce" });
    const first = broker.taskSubmit({ approval }, ownerCtx);
    const second = broker.taskSubmit({ approval }, ownerCtx);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.errorCode).toBe("replay");
    }
  });

  it("does not leak secrets in audit metadata", () => {
    const { broker, keys } = createIntegrationBroker();
    const fields = {
      proposalId: "prop-1",
      baseCommit: "abc123",
      baseTreeHash: "tree456",
      sourceCleanliness: "clean",
      archiveManifestRef: "manifest-ref",
      archiveAggregateHash: "hash789",
      excludeRules: ["**/.env"],
      destinationNamespace: "proposal/prop-1",
    };
    const approval = signedApproval(keys, {
      scope: "source_prepare",
      taskId: "sp-int",
      nonce: "nonce-sp",
      argv: undefined,
      cwd: undefined,
      ...fields,
    });
    broker.taskSubmit({ approval }, ownerCtx);
    const audit = broker.store.auditEvents.find((event) => event.code === "source_prepare_validated");
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit)).not.toMatch(/BEGIN PRIVATE KEY|signature/i);
  });
});
