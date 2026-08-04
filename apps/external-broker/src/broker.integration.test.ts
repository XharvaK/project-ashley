import { describe, expect, it } from "vitest";
import { FRAME_VERSION } from "./constants/limits.js";
import { encodeFrame } from "./protocol/frame.js";
import { MemoryTransport } from "./index.js";
import {
  createTestBroker,
  operatorCtx,
  testCtx,
} from "./test/fixtures/broker.js";
import {
  policyDecisionHashFromToken,
  signedDispatch,
  signedPolicy,
} from "./test/fixtures/keys.js";

describe("external broker integration", () => {
  it("rejects unsigned observe dispatch", () => {
    const { broker, keys } = createTestBroker();
    const policy = signedPolicy(keys, {
      actionId: "unsigned-1",
      idempotencyKey: "unsigned-idem-1",
      nonce: "policy-nonce-unsigned-1",
    });
    const unsigned = { ...policy };
    delete unsigned.signature;
    const result = broker.dispatchSubmit({ policy: unsigned }, testCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("unsigned_policy");
    }
  });

  it("accepts policy-signed observe without owner dispatch", () => {
    const { broker, keys } = createTestBroker();
    const policy = signedPolicy(keys, {
      actionId: "observe-1",
      actionKind: "observe",
      riskClass: "observe",
      idempotencyKey: "observe-idem-1",
      nonce: "policy-nonce-observe-1",
    });
    const result = broker.dispatchSubmit({ policy }, testCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("committed");
    }
  });

  it("requires owner dispatch signature for private actions", () => {
    const { broker, keys } = createTestBroker();
    const token = {
      actionKind: "send_private",
      riskClass: "reversible_private",
      destinationId: "dest-1",
      capabilityReleaseState: "active",
    };
    const policy = signedPolicy(keys, {
      actionId: "private-1",
      actionKind: "send_private",
      riskClass: "reversible_private",
      policyDecisionToken: token,
      idempotencyKey: "private-idem-1",
      nonce: "policy-nonce-private-1",
    });
    const withoutDispatch = broker.dispatchSubmit({ policy }, testCtx);
    expect(withoutDispatch.ok).toBe(false);
    if (!withoutDispatch.ok) {
      expect(withoutDispatch.errorCode).toBe("dispatch_required");
    }

    const dispatch = signedDispatch(keys, policy, { nonce: "dispatch-nonce-private-1" });
    const withDispatch = broker.dispatchSubmit({ policy, dispatch }, testCtx);
    expect(withDispatch.ok).toBe(true);
    if (withDispatch.ok) {
      expect(withDispatch.data.state).toBe("committed");
    }
  });

  it("uses fake adapter and blocks under emergency stop", () => {
    const { broker, keys } = createTestBroker();
    const policy = signedPolicy(keys, {
      actionId: "stop-1",
      idempotencyKey: "stop-idem-1",
      nonce: "policy-nonce-stop-1",
    });
    broker.setEmergencyStop(true);
    const blocked = broker.dispatchSubmit({ policy }, testCtx);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.errorCode).toBe("emergency_stop");
    }

    broker.setEmergencyStop(false);
    const allowed = broker.dispatchSubmit({ policy }, testCtx);
    expect(allowed.ok).toBe(true);
  });

  it("returns idempotent replay without re-dispatching", () => {
    const { broker, keys } = createTestBroker();
    const policy = signedPolicy(keys, {
      actionId: "idem-1",
      idempotencyKey: "shared-idem",
      nonce: "policy-nonce-idem-1",
    });
    const first = broker.dispatchSubmit({ policy }, testCtx);
    expect(first.ok).toBe(true);

    const replayPolicy = signedPolicy(keys, {
      actionId: "idem-2",
      idempotencyKey: "shared-idem",
      nonce: "policy-nonce-idem-2",
    });
    const second = broker.dispatchSubmit({ policy: replayPolicy }, testCtx);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.idempotentReplay).toBe(true);
      expect(second.data.actionId).toBe("idem-1");
    }
  });

  it("round-trips dispatch.submit via encoded frames", () => {
    const { broker, keys } = createTestBroker();
    const transport = new MemoryTransport(broker);
    const policy = signedPolicy(keys, {
      actionId: "frame-1",
      idempotencyKey: "frame-idem-1",
      nonce: "policy-nonce-frame-1",
    });
    const request = encodeFrame({
      frameVersion: FRAME_VERSION,
      requestId: "req-1",
      messageType: "dispatch.submit",
      payload: { policy },
    });
    const responseBuffer = transport.sendEncoded(request, testCtx);
    const response = JSON.parse(
      responseBuffer.subarray(responseBuffer.indexOf(10) + 1).toString("utf8"),
    ) as { ok: boolean; data?: { actionId: string } };
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data?.actionId).toBe("frame-1");
    }
  });

  it("denies password_change at evaluator", () => {
    const { broker, keys } = createTestBroker();
    const token = {
      actionKind: "password_change",
      riskClass: "irreversible",
      destinationId: "dest-1",
      capabilityReleaseState: "active",
    };
    const policy = signedPolicy(keys, {
      actionId: "deny-1",
      actionKind: "observe",
      riskClass: "observe",
      policyDecisionToken: token,
      idempotencyKey: "deny-idem-1",
      nonce: "policy-nonce-deny-1",
    });
    const result = broker.dispatchSubmit({ policy }, testCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("hard_deny_lifecycle");
    }
  });

  it("stores operator-ingested credentials without leaking plaintext in audit", () => {
    const { broker } = createTestBroker();
    const secret = Buffer.from("audit-secret-value", "utf8");
    broker.vaultIngestOperator(
      {
        ownerId: "owner-1",
        label: "audit-test",
        plaintextBase64: secret.toString("base64"),
      },
      operatorCtx,
    );
    const audit = JSON.stringify(broker.store.auditEvents);
    expect(audit).not.toContain("audit-secret-value");
  });
});

describe("policy token hashing helper", () => {
  it("hashes decision tokens deterministically", () => {
    const token = {
      actionKind: "observe",
      riskClass: "observe",
      destinationId: "dest-1",
      capabilityReleaseState: "active",
    };
    expect(policyDecisionHashFromToken(token)).toBe(policyDecisionHashFromToken(token));
  });
});
