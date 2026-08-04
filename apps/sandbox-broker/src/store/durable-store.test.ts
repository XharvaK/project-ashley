import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DurableBrokerStore } from "./broker-store.js";

describe("DurableBrokerStore", () => {
  it("retains nonces, tombstones, artifacts, and task receipts across reopen", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ashley-durable-store-"));
    try {
      const first = new DurableBrokerStore(root);
      expect(first.recordNonce("nonce-1")).toBe(true);
      expect(first.recordAppliedTombstone("tombstone-1")).toBe(true);
      const artifact = first.commitArtifact("owner-1", Buffer.from("patch"));
      first.tasks.set("task-1", {
        taskId: "task-1",
        ownerId: "owner-1",
        state: "succeeded",
        exitCode: 0,
        stdout: artifact.artifactRef,
        stderr: "",
        truncated: false,
        terminalReason: "success",
        envelope: {
          protocolVersion: 1,
          keyId: "owner-ed25519-v1",
          taskId: "task-1",
          ownerId: "owner-1",
          scope: "source_diff",
          networkMode: "none",
          expiresAt: Date.now() + 60_000,
          nonce: "nonce-1",
        },
        uploadAuthorized: false,
      });
      first.flush();
      first.close();

      const second = new DurableBrokerStore(root);
      expect(second.hasNonce("nonce-1")).toBe(true);
      expect(second.appliedTombstones.has("tombstone-1")).toBe(true);
      expect(second.artifacts.get(artifact.artifactRef)?.bytes.toString()).toBe("patch");
      expect(second.tasks.get("task-1")?.state).toBe("succeeded");
      second.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
