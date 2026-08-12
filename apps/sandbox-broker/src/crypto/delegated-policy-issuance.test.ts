import { describe, expect, it } from "vitest";
import type { SandboxPolicyDocument } from "@composer-assistant/sandbox-policy";
import { policyPayload } from "../test/fixtures/delegated-policy.js";
import {
  prepareR4005Policy,
  R4004_POLICY_ID,
  R4004_POLICY_VERSION,
  R4005_POLICY_ID,
  R4005_POLICY_VERSION,
} from "./delegated-policy-issuance.js";

const SOURCE_ISSUED_AT = "2026-08-07T15:29:35.707Z";
const SOURCE_EXPIRES_AT = "2026-08-08T13:27:00.820Z";
const SOURCE_LIFETIME_MS =
  Date.parse(SOURCE_EXPIRES_AT) - Date.parse(SOURCE_ISSUED_AT);
const NEW_ISSUED_AT = "2026-08-12T12:00:00.000Z";

function r4004Policy(overrides: Partial<SandboxPolicyDocument> = {}) {
  return policyPayload({
    policyId: R4004_POLICY_ID,
    policyVersion: R4004_POLICY_VERSION,
    issuedAt: SOURCE_ISSUED_AT,
    expiresAt: SOURCE_EXPIRES_AT,
    ...overrides,
  });
}

describe("prepareR4005Policy", () => {
  it("creates only the next lifecycle version and preserves the authority surface", () => {
    const source = r4004Policy();
    const result = prepareR4005Policy(source, { issuedAt: NEW_ISSUED_AT });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.policy.policyId).toBe(R4005_POLICY_ID);
    expect(result.policy.policyVersion).toBe(R4005_POLICY_VERSION);
    expect(result.policy.issuedAt).toBe(NEW_ISSUED_AT);
    expect(result.policy.expiresAt).toBe(
      new Date(Date.parse(NEW_ISSUED_AT) + SOURCE_LIFETIME_MS).toISOString(),
    );
    expect(result.lifetimeMs).toBe(SOURCE_LIFETIME_MS);
    expect(result.lifetimeSource).toBe("source_policy");

    const { policyId: _sourceId, policyVersion: _sourceVersion, issuedAt: _sourceIssued,
      expiresAt: _sourceExpires, ...sourceAuthority } = source;
    const { policyId: _resultId, policyVersion: _resultVersion, issuedAt: _resultIssued,
      expiresAt: _resultExpires, ...resultAuthority } = result.policy;
    expect(resultAuthority).toEqual(sourceAuthority);
  });

  it("requires an explicit owner lifetime decision when the source has no expiry convention", () => {
    const source = r4004Policy({ expiresAt: undefined });
    const result = prepareR4005Policy(source, { issuedAt: NEW_ISSUED_AT });
    expect(result).toEqual({
      ok: false,
      reason: "policy_lifetime_decision_required",
    });
  });

  it("accepts an explicit lifetime only when it does not widen the source lifetime", () => {
    const shorterExpiry = new Date(
      Date.parse(NEW_ISSUED_AT) + SOURCE_LIFETIME_MS - 1,
    ).toISOString();
    const shorter = prepareR4005Policy(r4004Policy(), {
      issuedAt: NEW_ISSUED_AT,
      expiresAt: shorterExpiry,
    });
    expect(shorter.ok).toBe(true);
    if (shorter.ok) expect(shorter.lifetimeSource).toBe("explicit_owner_decision");

    const longerExpiry = new Date(
      Date.parse(NEW_ISSUED_AT) + SOURCE_LIFETIME_MS + 1,
    ).toISOString();
    expect(
      prepareR4005Policy(r4004Policy(), {
        issuedAt: NEW_ISSUED_AT,
        expiresAt: longerExpiry,
      }),
    ).toEqual({
      ok: false,
      reason: "policy_expiry_widening",
    });
  });

  it("rejects a source that is not the accepted R4-004 policy identity", () => {
    expect(
      prepareR4005Policy(
        policyPayload({ policyId: "pol-production-r4-003", policyVersion: 3 }),
        { issuedAt: NEW_ISSUED_AT },
      ),
    ).toEqual({
      ok: false,
      reason: "source_policy_identity_invalid",
    });
  });

  it("rejects invalid or non-positive lifetimes", () => {
    expect(
      prepareR4005Policy(r4004Policy(), {
        issuedAt: NEW_ISSUED_AT,
        expiresAt: NEW_ISSUED_AT,
      }),
    ).toEqual({
      ok: false,
      reason: "policy_expiry_invalid",
    });
  });
});
