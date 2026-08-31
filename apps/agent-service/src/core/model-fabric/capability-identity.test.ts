import { describe, expect, it } from "vitest";
import {
  buildThoughtCapabilityIdentity,
  thoughtResourcePolicyIdentity,
  type ThoughtCapabilityComponents,
} from "./capability-identity.js";

const base: ThoughtCapabilityComponents = {
  executableBuildIdentity: "build:fixture",
  semanticContractFingerprint: "sha256:" + "a".repeat(64),
  kernelEnvelopeContractVersion: "ashley.thought.kernel-envelope.v1",
  parserValidatorFingerprint: "sha256:" + "b".repeat(64),
  provider: "nim",
  configuredModelId: "openai/gpt-oss-20b",
  occupantId: "nim-primary",
  logicalBindingId: "logical:thought:v1",
  wireBindingId: "wire:nim-guided-json:v1",
  schemaEnforcementMode: "guided_json" as const,
  resourcePolicyFingerprint: "sha256:" + "c".repeat(64),
  adapterCompatibilityFingerprint: "sha256:" + "d".repeat(64),
};

describe("Thought capability identity", () => {
  it("hashes and freezes every required component", () => {
    const identity = buildThoughtCapabilityIdentity(base);
    expect(identity.schema).toBe("ashley.thought.capability_identity.v1");
    expect(identity.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(buildThoughtCapabilityIdentity({ ...base, wireBindingId: "wire:other" }).fingerprint).not.toBe(identity.fingerprint);
  });

  it("binds the frozen resource policy and rejects malformed fingerprints", () => {
    const policy = thoughtResourcePolicyIdentity();
    expect(policy).toMatchObject({
      ordinaryThoughtBudgetMs: 30000,
      interactiveMaxOutput: 4096,
      durableProactiveMaxOutput: 4096,
      structuralRetryMaxOutput: 2048,
      structuralRetriesMaxPerSemanticPass: 2,
    });
    expect(policy.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(() => buildThoughtCapabilityIdentity({ ...base, semanticContractFingerprint: "not-a-fingerprint" })).toThrow("capability_component_invalid");
  });

  it("changes the aggregate fingerprint when any component changes", () => {
    const original = buildThoughtCapabilityIdentity(base);
    const variants: ThoughtCapabilityComponents[] = [
      { ...base, executableBuildIdentity: "build:fixture-2" },
      { ...base, semanticContractFingerprint: "sha256:" + "e".repeat(64) },
      { ...base, kernelEnvelopeContractVersion: "ashley.thought.kernel-envelope.v2" },
      { ...base, parserValidatorFingerprint: "sha256:" + "f".repeat(64) },
      { ...base, provider: "groq" },
      { ...base, configuredModelId: "openai/gpt-oss-120b" },
      { ...base, occupantId: "groq-secondary" },
      { ...base, logicalBindingId: "logical:thought:v2" },
      { ...base, wireBindingId: "wire:native-json-schema:v1" },
      { ...base, schemaEnforcementMode: "json_object_compatibility" },
      { ...base, resourcePolicyFingerprint: "sha256:" + "7".repeat(64) },
      { ...base, adapterCompatibilityFingerprint: "sha256:" + "8".repeat(64) },
    ];

    for (const variant of variants) {
      expect(buildThoughtCapabilityIdentity(variant).fingerprint).not.toBe(
        original.fingerprint,
      );
    }
  });
});
