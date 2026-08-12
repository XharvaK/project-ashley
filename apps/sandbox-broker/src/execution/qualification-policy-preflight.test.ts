import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDelegatedPolicyKeys,
  signedPolicyArtifact,
} from "../test/fixtures/delegated-policy.js";
import { runQualificationPolicyPreflight } from "./qualification-policy-preflight.js";

const NOW_MS = Date.parse("2026-08-07T00:00:00.000Z");

function withPolicyFixture(
  mutate: (artifact: ReturnType<typeof signedPolicyArtifact>) => void = () => undefined,
  test: (paths: {
    artifactPath: string;
    signaturePath: string;
    ownerPublicKeyPath: string;
  }) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), "ashley-policy-preflight-"));
  const keys = createDelegatedPolicyKeys();
  const artifact = signedPolicyArtifact(keys, {
    expiresAt: "2026-08-08T00:00:00.000Z",
  });
  mutate(artifact);
  const artifactPath = join(dir, "policy.json");
  const signaturePath = join(dir, "policy.json.sig");
  const ownerPublicKeyPath = join(dir, "owner.pub");
  writeFileSync(artifactPath, JSON.stringify(artifact.payload), "utf8");
  writeFileSync(signaturePath, JSON.stringify(artifact.signature), "utf8");
  writeFileSync(ownerPublicKeyPath, keys.owner.publicKeyPem, "utf8");
  try {
    test({ artifactPath, signaturePath, ownerPublicKeyPath });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("runQualificationPolicyPreflight", () => {
  it("reports disabled without reading a policy artifact", () => {
    const result = runQualificationPolicyPreflight({
      enabled: false,
      artifactPath: "/missing/policy.json",
      signaturePath: "/missing/policy.json.sig",
      ownerPublicKeyPath: "/missing/owner.pub",
      ownerKeyId: "owner-ed25519-v1",
      nowMs: NOW_MS,
    });

    expect(result).toEqual({
      status: "disabled",
      reason: "delegated_runtime_disabled",
      nowMs: NOW_MS,
    });
  });

  it("accepts a valid unexpired policy through the canonical verifier", () => {
    withPolicyFixture((_artifact) => undefined, (paths) => {
      const result = runQualificationPolicyPreflight({
      enabled: true,
      ...paths,
      ownerKeyId: "owner-ed25519-v1",
      nowMs: NOW_MS,
      });

      expect(result).toMatchObject({
        status: "valid",
        policyId: "test-policy-1",
        policyVersion: 1,
        expiresAt: "2026-08-08T00:00:00.000Z",
        signerKeyId: "owner-ed25519-v1",
        nowMs: NOW_MS,
      });
      if (result.status === "valid") expect(result.policyHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it("reports deterministic expiry before service startup can be attempted", () => {
    withPolicyFixture((artifact) => {
      artifact.payload.expiresAt = "2026-08-06T00:00:00.000Z";
    }, (paths) => {
      const result = runQualificationPolicyPreflight({
        enabled: true,
        ...paths,
        ownerKeyId: "owner-ed25519-v1",
        nowMs: NOW_MS,
      });

      expect(result).toMatchObject({
        status: "blocked",
        reason: "delegated_policy_expired",
        policyId: "test-policy-1",
        policyVersion: 1,
        expiresAt: "2026-08-06T00:00:00.000Z",
        nowMs: NOW_MS,
      });
    });
  });

  it("fails closed on malformed policy material", () => {
    withPolicyFixture((_artifact) => undefined, (paths) => {
      writeFileSync(paths.artifactPath, "{not-json", "utf8");
      const result = runQualificationPolicyPreflight({
        enabled: true,
        ...paths,
        ownerKeyId: "owner-ed25519-v1",
        nowMs: NOW_MS,
      });

      expect(result).toMatchObject({
        status: "blocked",
        reason: "delegated_policy_invalid",
        error: "artifact_json_invalid",
      });
    });
  });

  it("fails closed on an invalid signature", () => {
    withPolicyFixture((artifact) => {
      artifact.signature.value = "AAAA";
    }, (paths) => {
      const result = runQualificationPolicyPreflight({
        enabled: true,
        ...paths,
        ownerKeyId: "owner-ed25519-v1",
        nowMs: NOW_MS,
      });

      expect(result).toMatchObject({
        status: "blocked",
        reason: "delegated_policy_invalid",
        error: "signature_invalid",
      });
    });
  });
});
