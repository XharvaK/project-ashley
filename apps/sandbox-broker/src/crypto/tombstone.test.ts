import { describe, expect, it } from "vitest";
import {
  signTombstoneEnvelope,
  verifyTombstoneEnvelope,
  tombstonePublicKeyFromPem,
} from "./tombstone.js";
import { createTestKeys } from "../test/fixtures/keys.js";
import { createTestBroker, testCtx } from "../test/fixtures/broker.js";
import { signedApproval, signedTombstone } from "../test/fixtures/keys.js";
import { sha256Hex } from "./types.js";

describe("tombstone signatures", () => {
  it("verifies valid tombstone envelope", () => {
    const keys = createTestKeys();
    const now = Date.now();
    const signed = signTombstoneEnvelope(
      {
        protocolVersion: 1,
        continuityKeyId: "continuity-tombstone-ed25519-v1",
        tombstoneId: "tomb-1",
        ownerId: "owner-1",
        targets: [{ entityUuid: "uuid-1", artifactRef: "ref-1" }],
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      keys.continuityPrivateKeyPem,
    );
    const result = verifyTombstoneEnvelope(signed, {
      keys: [
        {
          continuityKeyId: "continuity-tombstone-ed25519-v1",
          publicKey: tombstonePublicKeyFromPem(keys.continuityPublicKeyPem),
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects expired tombstone", () => {
    const keys = createTestKeys();
    const now = Date.now();
    const signed = signTombstoneEnvelope(
      {
        protocolVersion: 1,
        continuityKeyId: "continuity-tombstone-ed25519-v1",
        tombstoneId: "tomb-expired",
        ownerId: "owner-1",
        targets: [],
        issuedAt: now - 120_000,
        expiresAt: now - 60_000,
      },
      keys.continuityPrivateKeyPem,
    );
    const result = verifyTombstoneEnvelope(
      signed,
      {
        keys: [
          {
            continuityKeyId: "continuity-tombstone-ed25519-v1",
            publicKey: tombstonePublicKeyFromPem(keys.continuityPublicKeyPem),
          },
        ],
      },
      now,
    );
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects unknown continuity key", () => {
    const keys = createTestKeys();
    const tombstone = signedTombstone(keys);
    const result = verifyTombstoneEnvelope(tombstone, { keys: [] });
    expect(result).toEqual({ ok: false, reason: "unknown_key" });
  });

  it("forget.apply replays tombstoneId idempotently", () => {
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
      tombstoneId: "tomb-replay",
      targets: [{ entityUuid: commit.data.entityUuid, artifactRef: commit.data.artifactRef }],
    });
    expect(broker.forgetApply({ tombstone }, testCtx).ok).toBe(true);
    const replay = broker.forgetApply({ tombstone }, testCtx);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.data.alreadyApplied).toBe(true);
    }
  });
});
