import { describe, expect, it } from "vitest";
import { canonicalJson } from "../crypto/canonical-json.js";
import {
  signApprovalEnvelope,
  verifyApprovalEnvelope,
  publicKeyFromPem,
} from "../crypto/approval.js";
import { createTestKeys, baseApproval, signedApproval } from "../test/fixtures/keys.js";
import { createTestBroker, testCtx } from "../test/fixtures/broker.js";

describe("approval signatures", () => {
  it("preserves array order in canonical JSON", () => {
    const json = canonicalJson({ b: [3, 1, 2], a: 1 });
    expect(json).toBe('{"a":1,"b":[3,1,2]}');
  });

  it("verifies valid approval envelope", () => {
    const keys = createTestKeys();
    const signed = signApprovalEnvelope(baseApproval(), keys.ownerPrivateKeyPem);
    const result = verifyApprovalEnvelope(signed, {
      keys: [{ keyId: "owner-ed25519-v1", publicKey: publicKeyFromPem(keys.ownerPublicKeyPem) }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects networkMode other than none", () => {
    const keys = createTestKeys();
    const signed = signApprovalEnvelope(
      baseApproval({ networkMode: "enabled" }),
      keys.ownerPrivateKeyPem,
    );
    const result = verifyApprovalEnvelope(signed, {
      keys: [{ keyId: "owner-ed25519-v1", publicKey: publicKeyFromPem(keys.ownerPublicKeyPem) }],
    });
    expect(result).toEqual({ ok: false, reason: "invalid_network_mode" });
  });

  it("rejects replayed nonce at broker level", () => {
    const { broker, keys } = createTestBroker();
    const approval = signedApproval(keys, { taskId: "nonce-task", nonce: "broker-nonce-1" });
    expect(broker.taskSubmit({ approval }, testCtx).ok).toBe(true);
    const replay = broker.taskSubmit({ approval }, testCtx);
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.errorCode).toBe("replay");
    }
  });
});
