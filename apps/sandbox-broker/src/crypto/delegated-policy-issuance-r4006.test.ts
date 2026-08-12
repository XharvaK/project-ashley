import { describe, expect, it } from "vitest";
import type { SandboxPolicyDocument } from "@composer-assistant/sandbox-policy";
import { policyPayload } from "../test/fixtures/delegated-policy.js";
import {
  prepareR4006Policy,
  R4005_POLICY_ID,
  R4005_POLICY_VERSION,
  R4006_POLICY_ID,
  R4006_POLICY_VERSION,
  R4006_ENGINEERING_CAPABILITIES,
  R4006_ENGINEERING_RECIPE_IDS,
  R4006_ENGINEERING_EXECUTABLE_IDS,
  R4006_MAX_LIFETIME_MS,
} from "./delegated-policy-issuance.js";

const ISSUED_AT = "2026-08-20T00:00:00.000Z";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRES_AT = new Date(Date.parse(ISSUED_AT) + THIRTY_DAYS_MS).toISOString();

function r4005Policy(overrides: Partial<SandboxPolicyDocument> = {}) {
  return policyPayload({
    policyId: R4005_POLICY_ID,
    policyVersion: R4005_POLICY_VERSION,
    allowedCapabilities: [
      "approved_project_read",
      "local_health_status_inspection",
      "ashley_agent_service_restart",
    ],
    allowedRecipeIds: ["verify:agent-tsc"],
    allowedExecutableIds: ["df"],
    ...overrides,
  });
}

describe("prepareR4006Policy", () => {
  it("derives R4-006 with the approved engineering capability set and preserves owner/absolute protections", () => {
    const source = r4005Policy();
    const result = prepareR4006Policy(source, {
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.policy.policyId).toBe(R4006_POLICY_ID);
    expect(result.policy.policyVersion).toBe(R4006_POLICY_VERSION);
    expect(result.policy.issuedAt).toBe(ISSUED_AT);
    expect(result.policy.expiresAt).toBe(EXPIRES_AT);
    expect(result.lifetimeMs).toBe(THIRTY_DAYS_MS);
    expect(result.lifetimeSource).toBe("explicit_owner_decision");

    for (const cap of R4006_ENGINEERING_CAPABILITIES) {
      expect(result.policy.allowedCapabilities).toContain(cap);
    }
    for (const recipe of R4006_ENGINEERING_RECIPE_IDS) {
      expect(result.policy.allowedRecipeIds).toContain(recipe);
    }
    for (const exe of R4006_ENGINEERING_EXECUTABLE_IDS) {
      expect(result.policy.allowedExecutableIds).toContain(exe);
    }
    // Source capabilities are preserved verbatim.
    expect(result.policy.allowedCapabilities).toContain("approved_project_read");
    // Absolute denials and owner-approvable live checkout preserved.
    const liveCheckout = result.policy.protectedRoots.find(
      (r) => r.path === "/srv/ashley/live-checkout",
    );
    expect(liveCheckout?.class).toBe("delegated_write_denied_owner_approvable");
    const secrets = result.policy.protectedRoots.find((r) =>
      r.path.includes(".env"),
    );
    expect(secrets?.class).toBe("absolute_denial");
  });

  it("rejects a non-R4-005 source identity", () => {
    const source = policyPayload({ policyId: "pol-production-r4-004", policyVersion: 4 });
    const result = prepareR4006Policy(source, {
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("source_policy_identity_invalid");
  });

  it("requires an explicit owner expiry decision (no silent lifetime)", () => {
    const source = r4005Policy();
    const result = prepareR4006Policy(source, { issuedAt: ISSUED_AT } as never);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("policy_lifetime_decision_required");
  });

  it("rejects an effectively-indefinite lifetime", () => {
    const source = r4005Policy();
    const indefinite = new Date(Date.parse(ISSUED_AT) + R4006_MAX_LIFETIME_MS + 1).toISOString();
    const result = prepareR4006Policy(source, {
      issuedAt: ISSUED_AT,
      expiresAt: indefinite,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("policy_expiry_indefinite");
  });

  it("rejects a non-positive lifetime", () => {
    const source = r4005Policy();
    const result = prepareR4006Policy(source, {
      issuedAt: ISSUED_AT,
      expiresAt: ISSUED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("policy_expiry_invalid");
  });
});
