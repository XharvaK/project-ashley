import { describe, expect, it } from "vitest";
import { VaultStore } from "../vault/store.js";
import { createTestBroker, operatorCtx, testCtx } from "../test/fixtures/broker.js";

describe("vault store", () => {
  it("allows operator-only ingest", () => {
    const { broker } = createTestBroker();
    const secret = Buffer.from("synthetic-test-secret-value", "utf8");
    const denied = broker.vaultIngestOperator(
      {
        ownerId: "owner-1",
        label: "test-credential",
        plaintextBase64: secret.toString("base64"),
      },
      testCtx,
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.errorCode).toBe("operator_only");
    }

    const allowed = broker.vaultIngestOperator(
      {
        ownerId: "owner-1",
        label: "test-credential",
        plaintextBase64: secret.toString("base64"),
      },
      operatorCtx,
    );
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.data.credentialRef).toBeTruthy();
    }
  });

  it("never includes plaintext in vault errors", () => {
    const { broker } = createTestBroker();
    const secret = Buffer.from("super-secret-plaintext-12345", "utf8");
    broker.vaultIngestOperator(
      {
        ownerId: "owner-1",
        label: "test",
        plaintextBase64: secret.toString("base64"),
      },
      operatorCtx,
    );
    const use = broker.vaultUse(
      { credentialRef: "missing-ref", actionId: "action-1" },
      testCtx,
    );
    expect(use.ok).toBe(false);
    if (!use.ok) {
      expect(use.message).not.toContain("super-secret-plaintext-12345");
      expect(use.message).toMatch(/^vault_error:/);
    }
  });

  it("issues session handles with TTL and invalidates on restart", () => {
    const keys = createTestBroker().keys;
    const vault = new VaultStore(keys.vaultMasterKey);
    const credential = vault.vaultIngestOperator(
      "owner-1",
      "session-test",
      Buffer.from("session-secret", "utf8"),
    );
    const session = vault.createSession("owner-1", credential.credentialRef, "action-ttl");
    expect(session.ok).toBe(true);
    if (!session.ok) {
      return;
    }
    expect(session.session.expiresAtMs).toBeGreaterThan(Date.now());

    vault.invalidateSessionsOnRestart();
    const resolved = vault.resolveSession(session.session.sessionHandle, "action-ttl");
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toBe("invalid_session");
    }
  });
});
