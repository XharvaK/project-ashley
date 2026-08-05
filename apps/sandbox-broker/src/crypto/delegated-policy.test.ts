import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalizeSandboxPolicyPayload,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import {
  loadVerifiedDelegatedPolicy,
  signDelegatedPolicyArtifact,
  verifyDelegatedPolicyArtifact,
} from "./delegated-policy.js";
import { sha256Hex } from "./types.js";
import {
  createDelegatedPolicyKeys,
  DELEGATED_KEY_ID,
  ownerPolicyKeys,
  policyPayload,
  signedPolicyArtifact,
} from "../test/fixtures/delegated-policy.js";

const NOW_MS = Date.parse("2026-08-05T12:00:00.000Z");

function verifierConfig() {
  const keys = createDelegatedPolicyKeys();
  return {
    keys,
    config: { keys: ownerPolicyKeys(keys) },
  };
}

describe("verifyDelegatedPolicyArtifact", () => {
  it("10. valid owner-signed policy verifies", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.policyId).toBe("test-policy-1");
      expect(result.signerKeyId).toBe("owner-ed25519-v1");
      expect(result.policyHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("11. tampered policy fails", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    artifact.payload.policyId = "evil-policy";
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("signature_invalid");
  });

  it("12. tampered signature fails", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    artifact.signature.value = Buffer.from("not-a-real-signature").toString("base64");
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("signature_invalid");
  });

  it("13. wrong owner key fails", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    const otherKeys = createDelegatedPolicyKeys();
    const result = verifyDelegatedPolicyArtifact(
      artifact,
      {
        keys: [
          {
            keyId: "owner-ed25519-v1",
            publicKey: ownerPolicyKeys(otherKeys)[0].publicKey,
          },
        ],
      },
      NOW_MS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("signature_invalid");
    expect(config).toBeDefined();
  });

  it("14. unknown key ID fails", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    artifact.signature.keyId = "mystery-key-1";
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unknown_signer_key");
  });

  it("15. malformed base64 fails", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    artifact.signature.value = "@@@@not-base64@@@@";
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed_signature");
  });

  it("16. unsupported algorithm fails", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    artifact.signature.algorithm = "RSA-PSS" as "Ed25519";
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unsupported_signature_algorithm");
  });

  it("17. empty signature fails", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    artifact.signature.value = "";
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed_signature");
  });

  it("18. delegated runtime key cannot sign the owner policy", () => {
    const keys = createDelegatedPolicyKeys();
    const artifact = signDelegatedPolicyArtifact(
      policyPayload(),
      keys.delegated.privateKeyPem,
      DELEGATED_KEY_ID,
    );
    const result = verifyDelegatedPolicyArtifact(
      artifact,
      { keys: ownerPolicyKeys(keys) },
      NOW_MS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unknown_signer_key");
  });

  it("19. signature covers all policy fields", () => {
    const { keys, config } = verifierConfig();
    const base = signedPolicyArtifact(keys);
    const withExtra = {
      payload: { ...base.payload, sneakyExtraField: true },
      signature: base.signature,
    };
    const extra = verifyDelegatedPolicyArtifact(withExtra, config, NOW_MS);
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.error).toBe("signature_invalid");

    const missing = verifyDelegatedPolicyArtifact(
      {
        payload: { ...base.payload, maxActiveSessions: undefined } as unknown as SandboxPolicyDocument,
        signature: base.signature,
      },
      config,
      NOW_MS,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe("policy_schema_invalid");
  });

  it("20. reordered source JSON with identical semantic payload still verifies", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    const raw = JSON.stringify(artifact);
    const parsed = JSON.parse(raw) as {
      payload: Record<string, unknown>;
      signature: unknown;
    };
    const reversedKeys: Record<string, unknown> = {};
    for (const key of Object.keys(parsed.payload).reverse()) {
      reversedKeys[key] = parsed.payload[key];
    }
    const reordered = JSON.parse(JSON.stringify({ payload: reversedKeys, signature: parsed.signature }));
    const result = verifyDelegatedPolicyArtifact(reordered, config, NOW_MS);
    expect(result.ok).toBe(true);
  });

  it("21. valid non-expired policy verifies", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    const result = verifyDelegatedPolicyArtifact(
      artifact,
      config,
      Date.parse("2026-08-05T06:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
  });

  it("22. expired policy fails", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys, {
      expiresAt: "2026-08-05T06:00:00.000Z",
    });
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("policy_expired");
  });

  it("23. expiry before issue time fails schema validation", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys, {
      expiresAt: "2026-08-04T00:00:00.000Z",
    });
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("policy_schema_invalid");
  });

  it("24. far-future issue time fails as not-yet-valid", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys, {
      issuedAt: "2030-01-01T00:00:00.000Z",
    });
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("policy_not_yet_valid");
  });

  it("25. clock is injected and results are deterministic", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys, {
      expiresAt: "2026-08-05T18:00:00.000Z",
    });
    const first = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    const second = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(second).toEqual(first);
    const later = verifyDelegatedPolicyArtifact(
      artifact,
      config,
      Date.parse("2026-08-05T19:00:00.000Z"),
    );
    expect(later.ok).toBe(false);
    if (!later.ok) expect(later.error).toBe("policy_expired");
  });

  it("26. same canonical payload gives the same SHA-256 hash", () => {
    const { keys, config } = verifierConfig();
    const a = verifyDelegatedPolicyArtifact(signedPolicyArtifact(keys), config, NOW_MS);
    const b = verifyDelegatedPolicyArtifact(signedPolicyArtifact(keys), config, NOW_MS);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.policyHash).toBe(b.policyHash);
  });

  it("27. any signed field change changes the hash", () => {
    const { keys, config } = verifierConfig();
    const original = verifyDelegatedPolicyArtifact(signedPolicyArtifact(keys), config, NOW_MS);
    const changed = verifyDelegatedPolicyArtifact(
      signedPolicyArtifact(keys, { policyVersion: 2 }),
      config,
      NOW_MS,
    );
    expect(original.ok && changed.ok).toBe(true);
    if (original.ok && changed.ok) {
      expect(changed.policyHash).not.toBe(original.policyHash);
    }
  });

  it("28. hash encoding is stable and documented (lowercase hex of canonical UTF-8)", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    const canonical = canonicalizeSandboxPolicyPayload(artifact.payload);
    if (!canonical.ok) throw new Error("unexpected canonicalization failure");
    const result = verifyDelegatedPolicyArtifact(artifact, config, NOW_MS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policyHash).toBe(
        sha256Hex(Buffer.from(canonical.payload, "utf8")),
      );
      expect(result.policyHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("fail-closed on missing payload or signature structures", () => {
    const { keys, config } = verifierConfig();
    const artifact = signedPolicyArtifact(keys);
    const noPayload = verifyDelegatedPolicyArtifact({ signature: artifact.signature }, config, NOW_MS);
    expect(noPayload.ok).toBe(false);
    if (!noPayload.ok) expect(noPayload.error).toBe("policy_schema_invalid");
    const noSignature = verifyDelegatedPolicyArtifact({ payload: artifact.payload }, config, NOW_MS);
    expect(noSignature.ok).toBe(false);
    if (!noSignature.ok) expect(noSignature.error).toBe("malformed_signature");
  });
});

describe("loadVerifiedDelegatedPolicy", () => {
  function tempDir(): string {
    return mkdtempSync(join(tmpdir(), "ashley-policy-"));
  }

  function writeArtifact(dir: string, artifact: unknown): string {
    const artifactPath = join(dir, "delegated-policy.json");
    writeFileSync(artifactPath, JSON.stringify(artifact), "utf8");
    return artifactPath;
  }

  it("29. missing policy artifact fails closed", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const result = loadVerifiedDelegatedPolicy({
        artifactPath: join(dir, "missing.json"),
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("artifact_missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("30. missing detached signature fails closed", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const artifactPath = writeArtifact(dir, policyPayload());
      const result = loadVerifiedDelegatedPolicy({
        artifactPath,
        signaturePath: join(dir, "missing.sig"),
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("signature_missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("31. invalid JSON fails closed", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const artifactPath = join(dir, "broken.json");
      writeFileSync(artifactPath, "{not json", "utf8");
      const result = loadVerifiedDelegatedPolicy({
        artifactPath,
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("artifact_json_invalid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("32. schema-invalid payload fails closed", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const artifact = signedPolicyArtifact(keys, {
        payloadVersion: 99 as 1,
      });
      const artifactPath = writeArtifact(dir, artifact);
      const result = loadVerifiedDelegatedPolicy({
        artifactPath,
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("policy_schema_invalid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("33. unknown trusted key fails closed", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const artifact = signedPolicyArtifact(keys);
      artifact.signature.keyId = "untrusted-key-9";
      const artifactPath = writeArtifact(dir, artifact);
      const result = loadVerifiedDelegatedPolicy({
        artifactPath,
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("unknown_signer_key");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("34. valid injected artifact returns an immutable normalized policy", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const artifact = signedPolicyArtifact(keys);
      const artifactPath = writeArtifact(dir, artifact);
      const result = loadVerifiedDelegatedPolicy({
        artifactPath,
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(result.ok).toBe(true);
      if (result.ok && "policy" in result) {
        expect(result.policy).toEqual(artifact.payload);
        expect(result.policyHash).toMatch(/^[0-9a-f]{64}$/);
        expect(result.signerKeyId).toBe("owner-ed25519-v1");
        expect(result.signatureSource).toBe("embedded");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("34b. detached signature file verifies with embedded payload", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const artifact = signedPolicyArtifact(keys);
      const artifactPath = writeArtifact(dir, artifact.payload);
      const signaturePath = join(dir, "delegated-policy.sig");
      writeFileSync(signaturePath, JSON.stringify(artifact.signature), "utf8");
      const result = loadVerifiedDelegatedPolicy({
        artifactPath,
        signaturePath,
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(result.ok).toBe(true);
      if (result.ok && "policy" in result) {
        expect(result.signatureSource).toBe("detached");
        expect(result.signerKeyId).toBe("owner-ed25519-v1");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("35. loader never returns or logs private key material", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const artifact = signedPolicyArtifact(keys);
      const artifactPath = writeArtifact(dir, artifact);
      const okResult = loadVerifiedDelegatedPolicy({
        artifactPath,
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(JSON.stringify(okResult)).not.toContain("PRIVATE KEY");
      expect(JSON.stringify(okResult)).not.toContain(keys.owner.privateKeyPem);
      const badResult = loadVerifiedDelegatedPolicy({
        artifactPath: join(dir, "missing.json"),
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(JSON.stringify(badResult)).not.toContain("PRIVATE KEY");
      expect(JSON.stringify(badResult)).not.toContain(keys.owner.privateKeyPem);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("36. loader does not modify the policy file", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const artifact = signedPolicyArtifact(keys);
      const artifactPath = writeArtifact(dir, artifact);
      const beforeContent = readFileSync(artifactPath, "utf8");
      const beforeMtime = statSync(artifactPath).mtimeMs;
      const result = loadVerifiedDelegatedPolicy({
        artifactPath,
        keys: ownerPolicyKeys(keys),
        enabled: true,
        nowMs: NOW_MS,
      });
      expect(result.ok).toBe(true);
      const afterContent = readFileSync(artifactPath, "utf8");
      const afterMtime = statSync(artifactPath).mtimeMs;
      expect(afterContent).toBe(beforeContent);
      expect(afterMtime).toBe(beforeMtime);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("37. no policy is generated automatically", () => {
    const { keys } = verifierConfig();
    const dir = tempDir();
    try {
      const result = loadVerifiedDelegatedPolicy({
        artifactPath: join(dir, "should-not-exist.json"),
        keys: ownerPolicyKeys(keys),
        enabled: false,
        nowMs: NOW_MS,
      });
      expect(result).toEqual({ ok: true, disabled: true });
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("38. disabled delegated authorization requires no policy at startup", () => {
    const result = loadVerifiedDelegatedPolicy({
      artifactPath: "/var/lib/ashley-broker/meta/delegated-policy.json",
      keys: [],
      enabled: false,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ ok: true, disabled: true });
  });

  it("39. enabling delegated authorization without a valid policy fails closed", () => {
    const result = loadVerifiedDelegatedPolicy({
      artifactPath: "/var/lib/ashley-broker/meta/delegated-policy.json",
      keys: [],
      enabled: true,
      nowMs: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("artifact_missing");
  });
});
