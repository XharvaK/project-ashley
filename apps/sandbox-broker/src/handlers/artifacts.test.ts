import { describe, expect, it } from "vitest";
import { createTestBroker, testCtx } from "../test/fixtures/broker.js";
import { signedApproval } from "../test/fixtures/keys.js";
import { sha256Hex } from "../crypto/types.js";

describe("artifact authority matrix", () => {
  it("allows artifact.write.begin with signed artifact_upload", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, {
      scope: "artifact_upload",
      taskId: "upload-task",
    });
    const begin = broker.artifactWriteBegin(
      { ownerId: "owner-1", declaredSize: 4, approval },
      testCtx,
    );
    expect(begin.ok).toBe(true);
  });

  it("allows artifact.write.begin with authorized taskId", async () => {
    const { broker, keys } = createTestBroker();
    const submit = broker.taskSubmit(
      { approval: signedApproval(keys, { taskId: "task-upload" }) },
      testCtx,
    );
    expect(submit.ok).toBe(true);
    const begin = broker.artifactWriteBegin(
      { ownerId: "owner-1", declaredSize: 4, taskId: "task-upload" },
      testCtx,
    );
    expect(begin.ok).toBe(true);
  });

  it("rejects unknown taskId upload delegation", () => {
    const { broker } = createTestBroker();
    const begin = broker.artifactWriteBegin(
      { ownerId: "owner-1", declaredSize: 4, taskId: "missing-task" },
      testCtx,
    );
    expect(begin.ok).toBe(false);
    if (!begin.ok) {
      expect(begin.errorCode).toBe("unknown_task");
    }
  });

  it("commits artifact with hash verification", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, { scope: "artifact_upload", taskId: "t1" });
    const begin = broker.artifactWriteBegin(
      { ownerId: "owner-1", declaredSize: 3, approval },
      testCtx,
    );
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    broker.artifactWriteChunk({
      uploadId: begin.data.uploadId,
      sessionCapability: begin.data.sessionCapability,
      chunkBase64: Buffer.from("abc").toString("base64"),
    });
    const commit = broker.artifactWriteCommit({
      uploadId: begin.data.uploadId,
      sessionCapability: begin.data.sessionCapability,
      contentHash: sha256Hex("abc"),
    });
    expect(commit.ok).toBe(true);
  });

  it("rejects hash mismatch on commit", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, { scope: "artifact_upload", taskId: "t2", nonce: "n-art-2" });
    const begin = broker.artifactWriteBegin(
      { ownerId: "owner-1", declaredSize: 3, approval },
      testCtx,
    );
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    broker.artifactWriteChunk({
      uploadId: begin.data.uploadId,
      sessionCapability: begin.data.sessionCapability,
      chunkBase64: Buffer.from("abc").toString("base64"),
    });
    const commit = broker.artifactWriteCommit({
      uploadId: begin.data.uploadId,
      sessionCapability: begin.data.sessionCapability,
      contentHash: sha256Hex("wrong"),
    });
    expect(commit.ok).toBe(false);
    if (!commit.ok) {
      expect(commit.errorCode).toBe("hash_mismatch");
    }
  });

  it("rejects invalid upload session capability", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, { scope: "artifact_upload", taskId: "t3", nonce: "n-art-3" });
    const begin = broker.artifactWriteBegin(
      { ownerId: "owner-1", declaredSize: 1, approval },
      testCtx,
    );
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    const chunk = broker.artifactWriteChunk({
      uploadId: begin.data.uploadId,
      sessionCapability: "wrong-capability",
      chunkBase64: Buffer.from("x").toString("base64"),
    });
    expect(chunk.ok).toBe(false);
    if (!chunk.ok) {
      expect(chunk.errorCode).toBe("invalid_session");
    }
  });
});
