/**
 * Owner-approved execution flow (Sandbox Wave 4, Commit 11).
 *
 * End-to-end: an approved proposal resumes the paused session (recording the
 * owner authorization atomically with the transition) and the subsequent
 * owner-approved execution is verified by the broker — envelope binding,
 * nonce freshness and the recorded authorization all must line up before any
 * process spawns.
 */

import { describe, expect, it } from "vitest";
import {
  createActiveSession,
  makeExecutionHarness,
  makeExecutionRequest,
  recordOwnerAuthorizationForSession,
  signOwnerApprovalForHarness,
} from "../test/fixtures/execution.js";
import type { SandboxOwnerApprovalEnvelope } from "../crypto/owner-approval.js";

const NOW = 1_800_000_000_000;

function runRecipe(harness: ReturnType<typeof makeExecutionHarness>, useId: string): void {
  harness.runner.setScript(useId, {
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    truncated: false,
    terminalReason: "success",
  });
}

const OWNER_APPROVAL_CAPABILITY = "write_live_repository";

function ownerApprovalAuthority(
  harness: ReturnType<typeof makeExecutionHarness>,
  sessionUuid: string,
) {
  return {
    capabilityId: OWNER_APPROVAL_CAPABILITY,
    authoritativeRiskClass: "consultation" as const,
    policyRuleId: "sandbox-policy/rule/owner-approval-required",
    canonicalTargetPaths: [{ path: harness.liveFile, intent: "write" as const }],
    sessionUuid,
  };
}

describe("owner-approved execution", () => {
  it("executes after resume recorded the owner authorization", async () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness, { capabilityId: OWNER_APPROVAL_CAPABILITY });
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;

    const recorded = recordOwnerAuthorizationForSession(harness, sessionUuid, {
      authorizationId: "owner-proposal-exec-1",
      authorizedAtMs: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    const authority = ownerApprovalAuthority(harness, sessionUuid);
    const ownerApproval: SandboxOwnerApprovalEnvelope = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-exec-1",
      ...authority,
    });
    const useId = "use-owner-approved-1";
    runRecipe(harness, useId);
    const result = await harness.service.executeFixedRecipe(
      makeExecutionRequest(
        harness,
        { session: recorded.session, capability: active.session.capability },
        authority,
        { ownerApproval, capabilityUseId: useId },
        NOW,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe("succeeded");
  });

  it("refuses an owner-approved execution with no recorded authorization", async () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness, { capabilityId: OWNER_APPROVAL_CAPABILITY });
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;

    const authority = ownerApprovalAuthority(harness, sessionUuid);
    const ownerApproval: SandboxOwnerApprovalEnvelope = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-unrecorded",
      ...authority,
    });
    const result = await harness.service.executeFixedRecipe(
      makeExecutionRequest(
        harness,
        active.session,
        authority,
        { ownerApproval, capabilityUseId: "use-unrecorded-1" },
        NOW,
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("owner_approval_not_recorded");
    expect(result.stage).toBe("session");
  });

  it("refuses when the recorded authorization is bound to another session", async () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const first = createActiveSession(harness, { capabilityId: OWNER_APPROVAL_CAPABILITY });
    const second = createActiveSession(harness, { capabilityId: OWNER_APPROVAL_CAPABILITY, maxToolExecutions: 20 });
    if (!first.ok || !second.ok) return;

    const recorded = recordOwnerAuthorizationForSession(harness, first.session.session.sessionUuid, {
      authorizationId: "owner-proposal-other-session",
      authorizedAtMs: NOW,
    });
    expect(recorded.ok).toBe(true);

    const authority = ownerApprovalAuthority(harness, second.session.session.sessionUuid);
    const ownerApproval: SandboxOwnerApprovalEnvelope = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-other-session",
      ...authority,
    });
    const result = await harness.service.executeFixedRecipe(
      makeExecutionRequest(
        harness,
        second.session,
        authority,
        { ownerApproval, capabilityUseId: "use-other-session-1" },
        NOW,
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("owner_approval_not_recorded");
  });

  it("refuses when the recorded authorization carries a different policy hash", async () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness, { capabilityId: OWNER_APPROVAL_CAPABILITY });
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;

    const recorded = recordOwnerAuthorizationForSession(harness, sessionUuid, {
      authorizationId: "owner-proposal-policy-drift",
      policyHash: "e".repeat(64),
      authorizedAtMs: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    const authority = ownerApprovalAuthority(harness, sessionUuid);
    const ownerApproval: SandboxOwnerApprovalEnvelope = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-policy-drift",
      ...authority,
    });
    const result = await harness.service.executeFixedRecipe(
      makeExecutionRequest(
        harness,
        { session: recorded.session, capability: active.session.capability },
        authority,
        { ownerApproval, capabilityUseId: "use-policy-drift-1" },
        NOW,
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("owner_approval_not_recorded");
  });

  it("refuses a tampered owner approval at the authorization stage", async () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness, { capabilityId: OWNER_APPROVAL_CAPABILITY });
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;

    const recorded = recordOwnerAuthorizationForSession(harness, sessionUuid, {
      authorizationId: "owner-proposal-tampered-exec",
      authorizedAtMs: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    const authority = ownerApprovalAuthority(harness, sessionUuid);
    const ownerApproval: SandboxOwnerApprovalEnvelope = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-tampered-exec",
      ...authority,
    });
    const tampered: SandboxOwnerApprovalEnvelope = {
      ...ownerApproval,
      canonicalTargetPaths: [{ path: "/attacker/target", intent: "write" }],
    };
    const result = await harness.service.executeFixedRecipe(
      makeExecutionRequest(
        harness,
        { session: recorded.session, capability: active.session.capability },
        authority,
        { ownerApproval: tampered, capabilityUseId: "use-tampered-1" },
        NOW,
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("authorization");
    expect(result.errorCode).toBe("owner_approval_invalid");
  });

  it("consumes the owner approval nonce once and refuses replay at execution", async () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness, { capabilityId: OWNER_APPROVAL_CAPABILITY });
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;

    const recorded = recordOwnerAuthorizationForSession(harness, sessionUuid, {
      authorizationId: "owner-proposal-replay-exec",
      authorizedAtMs: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    const authority = ownerApprovalAuthority(harness, sessionUuid);
    const ownerApproval: SandboxOwnerApprovalEnvelope = signOwnerApprovalForHarness(harness, {
      proposalId: "owner-proposal-replay-exec",
      ...authority,
    });
    const useId = "use-replay-1";
    runRecipe(harness, useId);
    const first = await harness.service.executeFixedRecipe(
      makeExecutionRequest(
        harness,
        { session: recorded.session, capability: active.session.capability },
        authority,
        { ownerApproval, capabilityUseId: useId },
        NOW,
      ),
    );
    expect(first.ok).toBe(true);

    const second = await harness.service.executeFixedRecipe(
      makeExecutionRequest(
        harness,
        { session: recorded.session, capability: active.session.capability },
        authority,
        { ownerApproval, capabilityUseId: "use-replay-2" },
        NOW,
      ),
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.errorCode).toBe("replay");
  });
});
