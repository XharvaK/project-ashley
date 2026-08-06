import { describe, expect, it } from "vitest";
import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";
import { createBrokerCapabilitySigner } from "./capability-custody.js";
import {
  canonicalSessionCapabilityBytes,
  SESSION_CAPABILITY_PREFIX,
  signSessionCapability,
  verifySessionCapability,
  type SignedSandboxSessionCapability,
} from "./session-capability.js";
import { CAPABILITY_SIGNING_KEY_ID } from "./session-limits.js";
import { capabilityKeyMaterial, activeSessionPolicy } from "../test/fixtures/session.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function basePayload() {
  const policy = activeSessionPolicy();
  return {
    capabilityVersion: 1 as const,
    capabilityId: "approved_project_read" as const,
    sessionUuid: "session-uuid-1",
    ownerId: "owner-1",
    role: "sandbox_operator_light" as const,
    sessionState: "active" as const,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: policy.policyHash,
    allowedCapabilities: ["approved_project_read"] as SandboxCapabilityId[],
    maxToolExecutions: 10,
    issuedAt: new Date(NOW - 1_000).toISOString(),
    expiresAt: new Date(NOW + 59_000).toISOString(),
    nonce: "nonce-abc",
  };
}

describe("session-capability", () => {
  it("signs with a domain prefix and canonical bytes", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const artifact = signSessionCapability(basePayload(), signer.signer);
    expect(artifact.signature.algorithm).toBe("Ed25519");
    expect(artifact.signature.encoding).toBe("base64url");
    expect(artifact.signature.keyId).toBe(CAPABILITY_SIGNING_KEY_ID);
    const bytes = canonicalSessionCapabilityBytes(artifact.payload);
    expect(bytes.toString("utf8")).toContain(SESSION_CAPABILITY_PREFIX);
    expect(signer.signer.verifySignature(bytes, artifact.signature.value)).toBe(true);
  });

  it("verifies an untampered artifact", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const artifact = signSessionCapability(basePayload(), signer.signer);
    const result = verifySessionCapability(artifact, signer.signer, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sessionUuid).toBe("session-uuid-1");
    }
  });

  it("rejects every tampered payload field (full signature coverage)", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const fields: Array<[string, unknown]> = [
      ["sessionUuid", "session-uuid-evil"],
      ["ownerId", "owner-evil"],
      ["role", "sandbox_operator_deep"],
      ["policyId", "policy-evil"],
      ["policyVersion", 999],
      ["policyHash", "0".repeat(64)],
      ["capabilityId", "candidate_workspace_create"],
      ["allowedCapabilities", ["candidate_workspace_create", "approved_project_read"]],
      ["maxToolExecutions", 9999],
      ["nonce", "nonce-evil"],
      ["issuedAt", new Date(NOW - 5_000).toISOString()],
      ["expiresAt", new Date(NOW + 120_000).toISOString()],
    ];
    const artifact = signSessionCapability(basePayload(), signer.signer);
    for (const [field, value] of fields) {
      const tampered = {
        ...artifact,
        payload: { ...artifact.payload, [field]: value },
      } as unknown as SignedSandboxSessionCapability;
      const result = verifySessionCapability(tampered, signer.signer, NOW);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a signature made by a different key", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    const other = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok && other.ok).toBe(true);
    if (!signer.ok || !other.ok) return;
    const artifact = signSessionCapability(basePayload(), signer.signer);
    const result = verifySessionCapability(artifact, other.signer, NOW);
    expect(result).toMatchObject({ ok: false, errorCode: "invalid_signature" });
  });

  it("rejects an artifact signed with a non-capability key id", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const artifact = signSessionCapability(basePayload(), signer.signer);
    const wrongKeyId = {
      ...artifact,
      signature: { ...artifact.signature, keyId: "owner-ed25519-v1" },
    };
    const result = verifySessionCapability(wrongKeyId, signer.signer, NOW);
    expect(result).toMatchObject({ ok: false, errorCode: "key_id_mismatch" });
  });

  it("rejects a tampered signature value", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const artifact = signSessionCapability(basePayload(), signer.signer);
    const tampered = {
      ...artifact,
      signature: { ...artifact.signature, value: artifact.signature.value.slice(0, -2) + "ab" },
    };
    const result = verifySessionCapability(tampered, signer.signer, NOW);
    expect(result).toMatchObject({ ok: false, errorCode: "invalid_signature" });
  });

  it("rejects wrong algorithm and encoding", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const artifact = signSessionCapability(basePayload(), signer.signer);
    const wrongAlg = {
      ...artifact,
      signature: { ...artifact.signature, algorithm: "RSA" as const },
    } as unknown as SignedSandboxSessionCapability;
    expect(verifySessionCapability(wrongAlg, signer.signer, NOW)).toMatchObject({
      ok: false,
      errorCode: "wrong_signature_algorithm",
    });
    const wrongEnc = {
      ...artifact,
      signature: { ...artifact.signature, encoding: "hex" as const },
    } as unknown as SignedSandboxSessionCapability;
    expect(verifySessionCapability(wrongEnc, signer.signer, NOW)).toMatchObject({
      ok: false,
      errorCode: "wrong_signature_encoding",
    });
  });

  it("rejects unsupported capability version", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const artifact = signSessionCapability(
      { ...basePayload(), capabilityVersion: 2 } as never,
      signer.signer,
    );
    const result = verifySessionCapability(artifact, signer.signer, NOW);
    expect(result).toMatchObject({ ok: false, errorCode: "unsupported_capability_version" });
  });

  it("rejects expired and not-yet-valid tokens", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const artifact = signSessionCapability(basePayload(), signer.signer);
    expect(verifySessionCapability(artifact, signer.signer, NOW + 60_000)).toMatchObject({
      ok: false,
      errorCode: "expired",
    });
    expect(verifySessionCapability(artifact, signer.signer, NOW - 5_000)).toMatchObject({
      ok: false,
      errorCode: "not_yet_valid",
    });
  });

  it("rejects unknown capabilities and malformed payloads", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const unknown = signSessionCapability(
      { ...basePayload(), capabilityId: "not_a_capability" } as never,
      signer.signer,
    );
    expect(verifySessionCapability(unknown, signer.signer, NOW)).toMatchObject({
      ok: false,
      errorCode: "invalid_capability",
    });
    const nonActive = signSessionCapability(
      { ...basePayload(), sessionState: "created" } as never,
      signer.signer,
    );
    expect(verifySessionCapability(nonActive, signer.signer, NOW)).toMatchObject({
      ok: false,
      errorCode: "invalid_session_state",
    });
    const badRole = signSessionCapability(
      { ...basePayload(), role: "sandbox_root" } as never,
      signer.signer,
    );
    expect(verifySessionCapability(badRole, signer.signer, NOW)).toMatchObject({
      ok: false,
      errorCode: "invalid_role",
    });
  });

  it("rejects invalid lifetimes and malformed artifact shape", () => {
    const signer = createBrokerCapabilitySigner(capabilityKeyMaterial());
    expect(signer.ok).toBe(true);
    if (!signer.ok) return;
    const inverted = signSessionCapability(
      { ...basePayload(), expiresAt: basePayload().issuedAt } as never,
      signer.signer,
    );
    expect(verifySessionCapability(inverted, signer.signer, NOW)).toMatchObject({
      ok: false,
      errorCode: "invalid_lifetime",
    });
    const garbage = { payload: { bogus: true }, signature: { algorithm: "Ed25519" } } as never;
    expect(verifySessionCapability(garbage, signer.signer, NOW)).toMatchObject({
      ok: false,
      errorCode: "wrong_signature_encoding",
    });
  });
});
