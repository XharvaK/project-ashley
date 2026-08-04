import { describe, expect, it } from "vitest";
import { createTestBroker, testCtx } from "../test/fixtures/broker.js";
import { signedApproval, signedTombstone } from "../test/fixtures/keys.js";
import { sha256Hex } from "../crypto/types.js";

describe("forget.apply", () => {
  it("deletes only exact tombstone targets and replays idempotently", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, { scope: "artifact_upload", taskId: "t1" });
    const begin = broker.artifactWriteBegin(
      { ownerId: "owner-1", declaredSize: 2, approval },
      testCtx,
    );
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    broker.artifactWriteChunk({
      uploadId: begin.data.uploadId,
      sessionCapability: begin.data.sessionCapability,
      chunkBase64: Buffer.from("ok").toString("base64"),
    });
    const commit = broker.artifactWriteCommit({
      uploadId: begin.data.uploadId,
      sessionCapability: begin.data.sessionCapability,
      contentHash: sha256Hex("ok"),
    });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    const tombstone = signedTombstone(keys, {
      targets: [{ entityUuid: commit.data.entityUuid, artifactRef: commit.data.artifactRef }],
    });
    const first = broker.forgetApply({ tombstone }, testCtx);
    expect(first.ok).toBe(true);
    const second = broker.forgetApply({ tombstone }, testCtx);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.alreadyApplied).toBe(true);
    }
    const read = broker.artifactRead(
      { ownerId: "owner-1", artifactRef: commit.data.artifactRef },
      testCtx,
    );
    expect(read.ok).toBe(false);
  });
});
