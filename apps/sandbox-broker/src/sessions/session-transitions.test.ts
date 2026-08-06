import { describe, expect, it } from "vitest";
import { capabilityKeyMaterial, activeSessionPolicy } from "../test/fixtures/session.js";
import { createBrokerCapabilitySigner } from "./capability-custody.js";
import { CAPABILITY_SIGNING_KEY_ID } from "./session-limits.js";
import {
  isAllowedSessionTransition,
  validateSessionTransition,
} from "./session-transitions.js";
import type { OwnerAuthorizedTransition } from "./session-types.js";
import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";
import { randomRef } from "../crypto/types.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function sessionSnapshot() {
  const policy = activeSessionPolicy();
  return {
    sessionUuid: "session-uuid-1",
    ownerId: "owner-1",
    proposalId: "proposal-1",
    role: "sandbox_operator_light" as const,
    state: "created" as const,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: policy.policyHash,
    delegatedSignerKeyId: "delegated-runtime-ed25519-v1",
    capabilitySigningKeyId: CAPABILITY_SIGNING_KEY_ID,
    allowedCapabilities: ["approved_project_read" as SandboxCapabilityId],
    maxToolExecutions: 10,
    toolExecutionsUsed: 0,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 60_000).toISOString(),
    revision: 1,
  };
}

function ownerAuth(overrides: Partial<OwnerAuthorizedTransition> = {}): OwnerAuthorizedTransition {
  return {
    authorizationId: "authz-1",
    ownerId: "owner-1",
    policyHash: activeSessionPolicy().policyHash,
    authorizedAtMs: NOW,
    ...overrides,
  };
}

describe("session-transitions", () => {
  it("allows created -> active and created -> aborted", () => {
    expect(isAllowedSessionTransition("created", "active")).toBe(true);
    expect(isAllowedSessionTransition("created", "aborted")).toBe(true);
    expect(isAllowedSessionTransition("created", "expired")).toBe(true);
  });

  it("allows active -> awaiting_owner, completed, aborted, expired", () => {
    expect(isAllowedSessionTransition("active", "awaiting_owner")).toBe(true);
    expect(isAllowedSessionTransition("active", "completed")).toBe(true);
    expect(isAllowedSessionTransition("active", "aborted")).toBe(true);
    expect(isAllowedSessionTransition("active", "expired")).toBe(true);
  });

  it("allows awaiting_owner -> active (owner-authorized)", () => {
    expect(isAllowedSessionTransition("awaiting_owner", "active")).toBe(true);
  });

  it("forbids terminal states from transitioning anywhere", () => {
    expect(isAllowedSessionTransition("completed", "active")).toBe(false);
    expect(isAllowedSessionTransition("aborted", "completed")).toBe(false);
    expect(isAllowedSessionTransition("expired", "active")).toBe(false);
  });

  it("rejects created -> completed", () => {
    expect(isAllowedSessionTransition("created", "completed")).toBe(false);
    const result = validateSessionTransition({
      from: "created",
      to: "completed",
      expectedRevision: 1,
      currentRevision: 1,
    });
    expect(result).toMatchObject({ ok: false, errorCode: "transition_not_allowed" });
  });

  it("rejects revision mismatch", () => {
    const result = validateSessionTransition({
      from: "created",
      to: "active",
      expectedRevision: 1,
      currentRevision: 3,
    });
    expect(result).toMatchObject({ ok: false, errorCode: "revision_mismatch" });
  });

  it("rejects unknown states", () => {
    const result = validateSessionTransition({
      from: "ghost" as never,
      to: "active",
      expectedRevision: 1,
      currentRevision: 1,
    });
    expect(result).toMatchObject({ ok: false, errorCode: "unknown_session_state" });
  });

  it("requires owner authorization for awaiting_owner -> active", () => {
    const result = validateSessionTransition({
      from: "awaiting_owner",
      to: "active",
      expectedRevision: 4,
      currentRevision: 4,
      session: { ...sessionSnapshot(), state: "awaiting_owner", revision: 4 },
    });
    expect(result).toMatchObject({
      ok: false,
      errorCode: "transition_requires_owner_authorization",
    });
  });

  it("accepts a valid owner authorization for awaiting_owner -> active", () => {
    const session = { ...sessionSnapshot(), state: "awaiting_owner" as const, revision: 4 };
    const result = validateSessionTransition({
      from: "awaiting_owner",
      to: "active",
      expectedRevision: 4,
      currentRevision: 4,
      session,
      ownerAuthorization: ownerAuth(),
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects owner authorization for a different owner", () => {
    const session = { ...sessionSnapshot(), state: "awaiting_owner" as const, revision: 4 };
    const result = validateSessionTransition({
      from: "awaiting_owner",
      to: "active",
      expectedRevision: 4,
      currentRevision: 4,
      session,
      ownerAuthorization: ownerAuth({ ownerId: "other-owner" }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_authorization_mismatch" });
  });

  it("rejects owner authorization bound to a different policy hash", () => {
    const session = { ...sessionSnapshot(), state: "awaiting_owner" as const, revision: 4 };
    const result = validateSessionTransition({
      from: "awaiting_owner",
      to: "active",
      expectedRevision: 4,
      currentRevision: 4,
      session,
      ownerAuthorization: ownerAuth({ policyHash: "a".repeat(64) }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_authorization_mismatch" });
  });

  it("rejects an authorization id that is empty", () => {
    const session = { ...sessionSnapshot(), state: "awaiting_owner" as const, revision: 4 };
    const result = validateSessionTransition({
      from: "awaiting_owner",
      to: "active",
      expectedRevision: 4,
      currentRevision: 4,
      session,
      ownerAuthorization: ownerAuth({ authorizationId: "" }),
    });
    expect(result).toMatchObject({ ok: false, errorCode: "owner_authorization_mismatch" });
  });
});

describe("capability-custody", () => {
  it("accepts valid injected ed25519 material with the fixed key id", () => {
    const material = capabilityKeyMaterial();
    const created = createBrokerCapabilitySigner(material);
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.signer.keyId).toBe(CAPABILITY_SIGNING_KEY_ID);
      expect(created.signer.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(created.signer.publicKeyPem).toContain("BEGIN PUBLIC KEY");
      expect(created.signer).not.toHaveProperty("privateKeyPem");
    }
  });

  it("rejects any key id other than the fixed capability key id", () => {
    const created = createBrokerCapabilitySigner(capabilityKeyMaterial("some-other-key"));
    expect(created).toMatchObject({ ok: false, errorCode: "key_id_mismatch" });
  });

  it("rejects non-ed25519 key material", () => {
    const rsa = require("node:crypto").generateKeyPairSync("rsa", { modulusLength: 2048 }) as {
      privateKey: { export: (o: { type: string; format: string }) => Buffer };
      publicKey: { export: (o: { type: string; format: string }) => Buffer };
    };
    const created = createBrokerCapabilitySigner({
      keyId: CAPABILITY_SIGNING_KEY_ID,
      privateKeyPem: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      publicKeyPem: rsa.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    expect(created).toMatchObject({ ok: false, errorCode: "unsupported_key_algorithm" });
  });

  it("rejects mismatched key pair material", () => {
    const one = capabilityKeyMaterial();
    const two = capabilityKeyMaterial();
    const created = createBrokerCapabilitySigner({
      keyId: CAPABILITY_SIGNING_KEY_ID,
      privateKeyPem: one.privateKeyPem,
      publicKeyPem: two.publicKeyPem,
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      const signature = created.signer.signMessage(Buffer.from("hello"));
      expect(created.signer.verifySignature(Buffer.from("hello"), signature)).toBe(false);
    }
  });

  it("signs and verifies round-trip", () => {
    const created = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(created.ok).toBe(true);
    if (created.ok) {
      const signature = created.signer.signMessage(Buffer.from("payload-bytes"));
      expect(created.signer.verifySignature(Buffer.from("payload-bytes"), signature)).toBe(true);
      expect(created.signer.verifySignature(Buffer.from("other-bytes"), signature)).toBe(false);
      expect(created.signer.verifySignature(Buffer.from("payload-bytes"), "not-base64url!!!")).toBe(false);
    }
  });

  it("fingerprint is stable per key and unique across keys", () => {
    const a = createBrokerCapabilitySigner(capabilityKeyMaterial());
    const b = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.signer.fingerprint).toBe(a.signer.fingerprint);
      expect(a.signer.fingerprint).not.toBe(b.signer.fingerprint);
      expect(randomRef).toBeDefined();
    }
  });
});
