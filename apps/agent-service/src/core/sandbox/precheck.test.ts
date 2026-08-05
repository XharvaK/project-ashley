import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type {
  SandboxCapabilityId,
  SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import { buildSandboxPrecheckAudit, type SandboxPrecheckAudit } from "./audit.js";
import {
  computePolicyHash,
  type CanonicalPathFact,
  type SandboxPolicyTrustedContext,
} from "./policy-context.js";
import { runSandboxPrecheck } from "./precheck.js";
import type { SandboxActionProposal } from "./proposal-types.js";

const NOW_MS = Date.parse("2026-06-01T00:00:00.000Z");

const POLICY_BASE: SandboxPolicyDocument = {
  policyId: "pol-sandbox-precheck-test-001",
  policyVersion: 1,
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-12-31T23:59:59.999Z",
  allowedDelegatedSignerKeyIds: ["delegated-ed25519-v1"],
  allowedCapabilities: [
    "approved_project_read",
    "candidate_workspace_read_write_delete",
    "fixed_test_recipe",
    "bounded_diagnostic_execution",
    "apply_candidate_patch_live",
  ],
  readOnlyRoots: ["/sandbox/repo"],
  writableDisposableRoots: ["/sandbox/disposable"],
  protectedRoots: [
    { path: "/sandbox/state", class: "absolute_denial" },
    { path: "/sandbox/handoff-notes", class: "delegated_write_denied_owner_approvable" },
  ],
  allowedRecipeIds: ["test-run-recipes/mocha-run"],
  allowedExecutableIds: ["diagnostics/node-memory-check"],
  resourceCeilings: {
    wallMsMax: 60_000,
    maxProcesses: 1,
    maxOutputBytes: 1_048_576,
    workspaceBytesMax: 67_108_864,
  },
  networkMode: "none",
  maxActiveSessions: 1,
  payloadVersion: 1,
};

function policyFixture(
  overrides: Partial<SandboxPolicyDocument> = {},
): SandboxPolicyDocument {
  return { ...POLICY_BASE, ...overrides };
}

const DEFAULT_FACTS: readonly CanonicalPathFact[] = [
  { claimedPath: "/sandbox/repo/src/main.ts", canonicalPath: "/sandbox/repo/src/main.ts" },
  { claimedPath: "/sandbox/repo/logs/app.log", canonicalPath: "/sandbox/repo/logs/app.log" },
  { claimedPath: "/sandbox/disposable/w/notes.md", canonicalPath: "/sandbox/disposable/w/notes.md" },
  { claimedPath: "/sandbox/state/secrets.json", canonicalPath: "/sandbox/state/secrets.json" },
  { claimedPath: "/sandbox/handoff-notes/todo.md", canonicalPath: "/sandbox/handoff-notes/todo.md" },
  { claimedPath: "/sandbox/elsewhere/x.ts", canonicalPath: "/sandbox/elsewhere/x.ts" },
];

function trustedContext(
  overrides: Partial<SandboxPolicyTrustedContext> = {},
): { context: SandboxPolicyTrustedContext; audits: SandboxPrecheckAudit[] } {
  const audits: SandboxPrecheckAudit[] = [];
  const policy =
    overrides.policy === undefined ? policyFixture() : overrides.policy;
  const policyHash =
    overrides.policyHash === undefined
      ? policy === null
        ? null
        : computePolicyHash(policy)
      : overrides.policyHash;
  const context: SandboxPolicyTrustedContext = {
    source: "injected_verified_policy",
    policy,
    policyHash,
    signerClass: "delegated_runtime",
    ownerId: "owner-ashley-test",
    nowMs: NOW_MS,
    canonicalPathFacts: DEFAULT_FACTS,
    auditSink: (record) => audits.push(record),
    ...overrides,
  };
  return { context, audits };
}

function propose(
  overrides: Partial<SandboxActionProposal> = {},
): SandboxActionProposal {
  return {
    proposalId: "prop-2026-0001",
    ownerId: "owner-ashley-test",
    requestedCapability: "approved_project_read",
    targetPaths: [{ path: "/sandbox/repo/src/main.ts", intent: "read" }],
    requiresNetwork: false,
    externalSideEffect: false,
    persistence: "temporary",
    modelSuggestedRisk: "low",
    rationale: "review the candidate patch site",
    ...overrides,
  };
}

const activeSession = {
  sessionUuid: "session-1",
  role: "sandbox_operator_light" as const,
  state: "active" as const,
  expiresAt: "2026-12-31T23:59:59.999Z",
};

describe("runSandboxPrecheck", () => {
  it("1: returns owner_approval_required for an owner-approvable capability", () => {
    const { context, audits } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        requestedCapability: "apply_candidate_patch_live",
        targetPaths: [{ path: "/sandbox/disposable/w/notes.md", intent: "write" }],
      }),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preliminary).toBe(true);
    expect(result.preliminaryDecision).toBe("owner_approval_required");
    if (result.preliminaryDecision !== "owner_approval_required") return;
    expect(result.brokerVerificationRequired).toBe(true);
    expect(result.policyRuleId).toBe("sandbox-policy/rule/owner-approval-required");
    expect(result.approvalRequired.capabilityId).toBe("apply_candidate_patch_live");
    expect(result.approvalRequired.reason).toBe("owner_approval_required_for_capability");
    expect(result.approvalRequired.policyRuleId).toBe("sandbox-policy/rule/owner-approval-required");
    expect(["low", "medium", "high", "consultation"]).toContain(
      result.approvalRequired.authoritativeRiskClass,
    );
    expect(audits).toHaveLength(1);
  });

  it("2: returns autonomous_safe for a read inside the read-only root", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preliminaryDecision).toBe("autonomous_safe");
    expect(result.preliminary).toBe(true);
    expect(result.brokerVerificationRequired).toBe(true);
    expect(result.authoritativeRiskClass).toBe("low");
    expect(result.policyRuleId).toBe("sandbox-policy/rule/delegated-autonomy");
  });

  it("3: absolute denial fails closed with a security-relevant audit", () => {
    const { context, audits } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        targetPaths: [{ path: "/sandbox/state/secrets.json", intent: "read" }],
      }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("absolute_denial");
    expect(result.policyRuleId).toBe("sandbox-policy/rule/absolute-denial");
    expect(result.preliminary).toBe(true);
    expect(audits[0].securityRelevant).toBe(true);
    expect(audits[0].preliminaryDecision).toBe("denied");
  });

  it("4: policy_unavailable when no policy is injected", () => {
    const { context } = trustedContext({ policy: null, policyHash: null });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("policy_unavailable");
    expect(result.reason).toBe("no_active_policy");
  });

  it("5: policy_mismatch when the injected hash disagrees with the policy", () => {
    const { context } = trustedContext({ policyHash: "f".repeat(64) });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("policy_mismatch");
    expect(result.reason).toBe("policy_hash_mismatch");
  });

  it("6: owner_mismatch fails closed", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({ ownerId: "someone-else" }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("owner_mismatch");
  });

  it("7: session facts required but missing fails closed", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(propose({ sessionUuid: "session-1" }), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("session_invalid");
    expect(result.reason).toBe("session_facts_required_but_missing");
  });

  it("8: session uuid mismatch fails closed", () => {
    const { context } = trustedContext({ activeSession: activeSession });
    const result = runSandboxPrecheck(propose({ sessionUuid: "session-other" }), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("session_invalid");
    expect(result.reason).toBe("session_uuid_mismatch");
  });

  it("9: invalid session role fails closed", () => {
    const { context } = trustedContext({
      activeSession: { ...activeSession, role: "guest" as never },
    });
    const result = runSandboxPrecheck(propose({ sessionUuid: "session-1" }), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("session_invalid");
    expect(result.reason).toBe("session_role_invalid");
  });

  it("10: expired session fails closed", () => {
    const { context } = trustedContext({
      activeSession: { ...activeSession, expiresAt: "2020-01-01T00:00:00.000Z" },
    });
    const result = runSandboxPrecheck(propose({ sessionUuid: "session-1" }), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("session_invalid");
    expect(result.reason).toBe("session_expired");
  });

  it("11: valid session passes and flows into the audit", () => {
    const { context, audits } = trustedContext({ activeSession: activeSession });
    const result = runSandboxPrecheck(propose({ sessionUuid: "session-1" }), context);
    expect(result.ok).toBe(true);
    expect(audits[0].sessionUuid).toBe("session-1");
  });

  it("12: missing canonical path facts fail closed", () => {
    const { context } = trustedContext({
      canonicalPathFacts: DEFAULT_FACTS.filter(
        (fact) => fact.claimedPath !== "/sandbox/repo/src/main.ts",
      ),
    });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("path_facts_unavailable");
    expect(result.reason).toBe("path_fact_missing_for_target");
  });

  it("13: non-canonical trusted facts are denied by the shared module", () => {
    const { context } = trustedContext({
      canonicalPathFacts: DEFAULT_FACTS.map((fact) =>
        fact.claimedPath === "/sandbox/repo/src/main.ts"
          ? { claimedPath: fact.claimedPath, canonicalPath: "/sandbox/repo/../x.ts" }
          : fact,
      ),
    });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("path_not_canonical");
  });

  it("14: multi-target proposals deny if any target is denied", () => {
    const { context, audits } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        requestedCapability: "candidate_workspace_read_write_delete",
        targetPaths: [
          { path: "/sandbox/repo/src/main.ts", intent: "read" },
          { path: "/sandbox/elsewhere/x.ts", intent: "write" },
        ],
      }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("path_outside_permitted_roots");
    expect(audits[0].redactedPathClasses).toHaveLength(2);
  });

  it("15: multi-target proposals escalate to owner approval when a target escalates", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        requestedCapability: "candidate_workspace_read_write_delete",
        targetPaths: [
          { path: "/sandbox/repo/src/main.ts", intent: "read" },
          { path: "/sandbox/handoff-notes/todo.md", intent: "write" },
        ],
      }),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preliminaryDecision).toBe("owner_approval_required");
    if (result.preliminaryDecision !== "owner_approval_required") return;
    expect(result.policyRuleId).toBe("sandbox-policy/rule/owner-approval-escalated");
    expect(result.approvalRequired.reason).toBe(
      "delegated_write_denied_root_requires_owner_approval",
    );
    expect(result.approvalRequired.affectedCanonicalPaths).toHaveLength(2);
    expect(result.approvalRequired.affectedCanonicalPaths).toContain(
      "/sandbox/repo/src/main.ts",
    );
    expect(result.approvalRequired.affectedCanonicalPaths).toContain(
      "/sandbox/handoff-notes/todo.md",
    );
  });

  it("16: multi-target proposals with all-autonomous targets stay autonomous", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        targetPaths: [
          { path: "/sandbox/repo/src/main.ts", intent: "read" },
          { path: "/sandbox/repo/logs/app.log", intent: "read" },
        ],
      }),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preliminaryDecision).toBe("autonomous_safe");
    expect(result.authoritativeRiskClass).toBe("low");
  });

  it("17: recipe not allowed by policy is denied", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        requestedCapability: "fixed_test_recipe",
        recipeId: "some/other-recipe",
        targetPaths: undefined,
      }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("recipe_not_allowed_by_policy");
  });

  it("18: executable not allowed by policy is denied", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        requestedCapability: "bounded_diagnostic_execution",
        executableId: "other-tool",
        targetPaths: undefined,
      }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("executable_not_allowed_by_policy");
  });

  it("19: capability not allowed by policy is denied", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({ requestedCapability: "approved_bounded_log_read" }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("capability_not_allowed_by_policy");
  });

  it("20: expired policy is denied", () => {
    const { context } = trustedContext({
      policy: policyFixture({
        issuedAt: "2025-01-01T00:00:00.000Z",
        expiresAt: "2025-06-01T00:00:00.000Z",
      }),
    });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("policy_expired");
  });

  it("21: policy not yet valid is denied", () => {
    const { context } = trustedContext({
      policy: policyFixture({
        issuedAt: "2027-01-01T00:00:00.000Z",
        expiresAt: "2027-12-31T00:00:00.000Z",
      }),
    });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("policy_not_yet_valid");
  });

  it("22: policy without any delegated signer key fails closed", () => {
    const { context } = trustedContext({
      policy: policyFixture({ allowedDelegatedSignerKeyIds: [] }),
    });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("delegated_signer_key_not_allowed_by_policy");
  });

  it("23: model risk can raise the authoritative risk but never lower it", () => {
    const recipe = {
      requestedCapability: "fixed_test_recipe" as SandboxCapabilityId,
      recipeId: "test-run-recipes/mocha-run",
      targetPaths: undefined,
    };
    const { context } = trustedContext();
    const raised = runSandboxPrecheck(propose({ ...recipe, modelSuggestedRisk: "high" }), context);
    expect(raised.ok).toBe(true);
    if (!raised.ok) return;
    expect(raised.authoritativeRiskClass).toBe("high");

    const { context: context2 } = trustedContext();
    const lowered = runSandboxPrecheck(propose({ ...recipe, modelSuggestedRisk: "low" }), context2);
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;
    expect(lowered.authoritativeRiskClass).toBe("medium");
  });

  it("24: audit is emitted through the injected sink with full policy facts", () => {
    const { context, audits } = trustedContext();
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(true);
    expect(audits).toHaveLength(1);
    const audit = audits[0];
    expect(audit.kind).toBe("sandbox_precheck");
    expect(audit.preliminaryDecision).toBe("autonomous_safe");
    expect(audit.requestedCapability).toBe("approved_project_read");
    expect(audit.policyId).toBe("pol-sandbox-precheck-test-001");
    expect(audit.policyVersion).toBe(1);
    expect(audit.policyHash).toBe(computePolicyHash(policyFixture()));
    expect(audit.createdAtIso).toBe(new Date(NOW_MS).toISOString());
    expect(audit.securityRelevant).toBe(false);
    expect(audit.reason).toBeNull();
    expect(audit.redactedPathClasses).toEqual(["read:/sandbox/repo/src/main.ts"]);
  });

  it("25: invalid proposals fail before any policy check", () => {
    const { context, audits } = trustedContext({ policy: null, policyHash: null });
    const result = runSandboxPrecheck({ wrong: true }, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("proposal_invalid");
    expect(result.reason).toBe("extra_fields");
    expect(audits).toHaveLength(1);
    expect(audits[0].preliminaryDecision).toBe("proposal_invalid");
    expect(audits[0].proposalId).toBe("<unparsed>");
  });

  it("26: unknown capabilities fail at the validation layer", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({ requestedCapability: "surprise_attack" } as never),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("proposal_invalid");
    expect(result.reason).toBe("unknown_capability");
  });

  it("27: non-finite clock fails closed", () => {
    const { context } = trustedContext({ nowMs: Number.NaN });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_clock");
    expect(result.audit.createdAtIso).toBe("1970-01-01T00:00:00.000Z");
  });

  it("28: intent not permitted by capability is denied", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        targetPaths: [{ path: "/sandbox/repo/src/main.ts", intent: "write" }],
      }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("precheck_denied");
    expect(result.reason).toBe("intent_not_permitted_by_capability");
    expect(result.policyRuleId).toBe("sandbox-policy/rule/intent-not-permitted");
  });

  it("29: sessions are optional when the proposal carries no session uuid", () => {
    const { context } = trustedContext({ activeSession: activeSession });
    const result = runSandboxPrecheck(propose(), context);
    expect(result.ok).toBe(true);
  });

  it("30: no-target recipe proposals authorize autonomously", () => {
    const { context } = trustedContext();
    const result = runSandboxPrecheck(
      propose({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        argv: ["--reporter", "dot"],
        targetPaths: undefined,
      }),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preliminaryDecision).toBe("autonomous_safe");
  });
});

describe("buildSandboxPrecheckAudit redaction", () => {
  it("31: redacts credential-shaped path material", () => {
    const audit = buildSandboxPrecheckAudit({
      proposalId: "p",
      ownerId: "o",
      sessionUuid: null,
      requestedCapability: "approved_project_read",
      modelSuggestedRisk: null,
      authoritativeRiskClass: "low",
      preliminaryDecision: "autonomous_safe",
      policyRuleId: "x",
      policyId: "p1",
      policyVersion: 1,
      policyHash: "h",
      recipeId: null,
      executableId: null,
      targets: [
        {
          canonicalPath: "/sandbox/repo/sk-abcdefghijklmnopqrst/x",
          intent: "read",
        },
      ],
      rationale: "token sk-abcdefghijklmnopqrst here",
      reason: null,
      securityRelevant: false,
      nowIso: "2026-06-01T00:00:00.000Z",
    });
    expect(audit.redactedPathClasses[0]).toContain("[redacted-credential]");
    expect(audit.redactedPathClasses[0]).not.toContain("sk-abcdefghijklmnopqrst");
    expect(audit.rationalePreview).toContain("[redacted-credential]");
    expect(audit.rationalePreview).not.toContain("sk-abcdefghijklmnopqrst");
  });
});

describe("precheck module isolation", () => {
  const FORBIDDEN = [
    "@composer-assistant/sandbox-broker",
    "./key-store",
    "./approval-signer",
    "./tombstone-signer",
    "./availability",
    "child_process",
    "fetch(",
    "exec(",
    "spawn(",
  ];

  const sources: Record<string, string> = {
    "precheck.ts": readFileSync(new URL("./precheck.ts", import.meta.url), "utf8"),
    "proposal-types.ts": readFileSync(
      new URL("./proposal-types.ts", import.meta.url),
      "utf8",
    ),
    "policy-context.ts": readFileSync(
      new URL("./policy-context.ts", import.meta.url),
      "utf8",
    ),
    "audit.ts": readFileSync(new URL("./audit.ts", import.meta.url), "utf8"),
  };

  it("32: precheck sources never import broker, key stores, signers, execution or networking", () => {
    for (const [name, source] of Object.entries(sources)) {
      for (const token of FORBIDDEN) {
        expect(
          source.includes(token),
          `${name} must not contain ${token}`,
        ).toBe(false);
      }
    }
  });

  it("33: precheck depends on the shared decision module, not identity governance", () => {
    const precheck = sources["precheck.ts"];
    expect(precheck).toContain("@composer-assistant/sandbox-policy");
    expect(precheck).not.toContain("identity");
    expect(precheck).not.toContain("change-proposal");
  });
});
