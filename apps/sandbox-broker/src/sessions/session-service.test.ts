import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DELEGATED_RUNTIME_KEY_ID } from "../crypto/delegated-approval.js";
import { activeSessionPolicy, capabilityKeyMaterial, sessionPolicyDocument } from "../test/fixtures/session.js";
import { CAPABILITY_SIGNING_KEY_ID, SESSION_CAPABILITY_DEFAULT_TTL_MS, SESSION_CAPABILITY_MAX_TTL_MS } from "./session-limits.js";
import { BrokerSessionLedger } from "./session-ledger.js";
import { BrokerSessionService } from "./session-service.js";
import type { OwnerAuthorizedTransition } from "./session-types.js";
import { DurableBrokerStore } from "../store/broker-store.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const OWNER = "owner-1";

function makeService(nowMs = NOW, withKey = true) {
  const ledger = new BrokerSessionLedger();
  const service = new BrokerSessionService({
    ledger,
    capabilitySigningMaterial: withKey ? capabilityKeyMaterial() : null,
    nowMs: () => nowMs,
  });
  return { ledger, service, clock: { set(ms: number) { nowMs = ms; } } };
}

function createInput(overrides: Record<string, unknown> = {}) {
  const policy = activeSessionPolicy();
  const base = {
    ownerId: OWNER,
    proposalId: "proposal-1",
    role: "sandbox_operator_light",
    activePolicy: policy,
    allowedCapabilities: ["approved_project_read"],
    maxToolExecutions: 4,
    expiresAtMs: NOW + 3600_000,
    nowMs: NOW,
  };
  return { ...base, ...overrides } as Parameters<BrokerSessionService["createSession"]>[0];
}

function createdSession(service: BrokerSessionService, overrides: Record<string, unknown> = {}) {
  const result = service.createSession(createInput(overrides));
  if (!result.ok) throw new Error(`create failed: ${result.errorCode}`);
  return result.value;
}

function activatedSession(
  service: BrokerSessionService,
  overrides: Record<string, unknown> = {},
) {
  const session = createdSession(service, overrides);
  const activated = service.activateSession(session.sessionUuid, session.revision);
  if (!activated.ok) throw new Error(`activate failed: ${activated.errorCode}`);
  return activated.value;
}

function ownerAuthFor(sessionUuid: string, service: BrokerSessionService): OwnerAuthorizedTransition {
  const session = service.getSession(sessionUuid)!;
  return {
    authorizationId: "authz-owner-1",
    ownerId: session.ownerId,
    policyHash: session.policyHash,
    authorizedAtMs: NOW,
  };
}

describe("BrokerSessionService.createSession", () => {
  it("creates a session with broker-generated uuid and revision 1", () => {
    const { service, ledger } = makeService();
    const session = createdSession(service);
    expect(session.sessionUuid).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(session.state).toBe("created");
    expect(session.revision).toBe(1);
    expect(session.toolExecutionsUsed).toBe(0);
    expect(session.capabilitySigningKeyId).toBe(CAPABILITY_SIGNING_KEY_ID);
    expect(session.delegatedSignerKeyId).toBe(DELEGATED_RUNTIME_KEY_ID);
    expect(ledger.getSession(session.sessionUuid)?.sessionUuid).toBe(session.sessionUuid);
    expect(service.listEvents(session.sessionUuid).map((e) => e.eventType)).toEqual([
      "session_created",
    ]);
  });

  it("rejects an unknown role", () => {
    const { service } = makeService();
    const result = service.createSession(createInput({ role: "sandbox_root" }));
    expect(result).toMatchObject({ ok: false, errorCode: "role_invalid" });
  });

  it("rejects a role not allowed by the policy", () => {
    const { service } = makeService();
    const result = service.createSession(
      createInput({
        role: "sandbox_operator_deep",
        activePolicy: activeSessionPolicy({ sessionRoles: ["sandbox_operator_light"] }),
      }),
    );
    expect(result).toMatchObject({ ok: false, errorCode: "role_not_allowed_by_policy" });
  });

  it("rejects a missing active policy", () => {
    const { service } = makeService();
    const result = service.createSession(createInput({ activePolicy: undefined }));
    expect(result).toMatchObject({ ok: false, errorCode: "no_active_policy" });
  });

  it("rejects a policy that does not allow the delegated runtime signer", () => {
    const { service } = makeService();
    const result = service.createSession(
      createInput({
        activePolicy: activeSessionPolicy({ allowedDelegatedSignerKeyIds: ["owner-key-2"] }),
      }),
    );
    expect(result).toMatchObject({ ok: false, errorCode: "delegated_signer_not_allowed" });
  });

  it("rejects empty or duplicate capability lists", () => {
    const { service } = makeService();
    expect(service.createSession(createInput({ allowedCapabilities: [] }))).toMatchObject({
      ok: false,
      errorCode: "capabilities_invalid",
    });
    expect(
      service.createSession(
        createInput({ allowedCapabilities: ["approved_project_read", "approved_project_read"] }),
      ),
    ).toMatchObject({ ok: false, errorCode: "capabilities_invalid" });
  });

  it("rejects capabilities not allowed by the policy", () => {
    const { service } = makeService();
    const result = service.createSession(
      createInput({ allowedCapabilities: ["bounded_diagnostic_execution"] }),
    );
    expect(result).toMatchObject({ ok: false, errorCode: "capability_not_allowed_by_policy" });
  });

  it("rejects unknown capabilities", () => {
    const { service } = makeService();
    const result = service.createSession(
      createInput({ allowedCapabilities: ["not_a_capability"] }),
    );
    expect(result).toMatchObject({ ok: false, errorCode: "unknown_capability" });
  });

  it("requires a workspace binding for workspace-bound capabilities", () => {
    const { service } = makeService();
    const result = service.createSession(
      createInput({
        allowedCapabilities: ["candidate_workspace_read_write_delete"],
      }),
    );
    expect(result).toMatchObject({ ok: false, errorCode: "workspace_binding_required" });
  });

  it("accepts a workspace binding with a valid manifest hash", () => {
    const { service } = makeService();
    const result = service.createSession(
      createInput({
        allowedCapabilities: ["candidate_workspace_read_write_delete"],
        workspace: {
          workspaceId: "workspace-1",
          workspaceManifestHash: "a".repeat(64),
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a malformed workspace manifest hash", () => {
    const { service } = makeService();
    const result = service.createSession(
      createInput({
        allowedCapabilities: ["candidate_workspace_read_write_delete"],
        workspace: { workspaceId: "workspace-1", workspaceManifestHash: "not-a-hash" },
      }),
    );
    expect(result).toMatchObject({ ok: false, errorCode: "workspace_binding_required" });
  });

  it("rejects out-of-bounds budgets and lifetimes", () => {
    const { service } = makeService();
    expect(
      service.createSession(createInput({ maxToolExecutions: 0 })),
    ).toMatchObject({ ok: false, errorCode: "max_tool_executions_invalid" });
    expect(
      service.createSession(createInput({ maxToolExecutions: 999_999 })),
    ).toMatchObject({ ok: false, errorCode: "max_tool_executions_invalid" });
    expect(
      service.createSession(createInput({ expiresAtMs: NOW })),
    ).toMatchObject({ ok: false, errorCode: "expires_at_invalid" });
    expect(
      service.createSession(createInput({ expiresAtMs: NOW + 25 * 3600_000 })),
    ).toMatchObject({ ok: false, errorCode: "expires_at_invalid" });
  });
});

describe("BrokerSessionService lifecycle", () => {
  it("activates a created session", () => {
    const { service } = makeService();
    const session = createdSession(service);
    const activated = service.activateSession(session.sessionUuid, session.revision);
    expect(activated.ok).toBe(true);
    if (activated.ok) {
      expect(activated.value.state).toBe("active");
      expect(activated.value.activatedAt).toBe(new Date(NOW).toISOString());
      expect(activated.value.revision).toBe(2);
    }
  });

  it("rejects activation with a stale revision", () => {
    const { service } = makeService();
    const session = createdSession(service);
    const result = service.activateSession(session.sessionUuid, session.revision + 1);
    expect(result).toMatchObject({ ok: false, errorCode: "revision_mismatch" });
  });

  it("transitions active -> awaiting_owner -> active with owner authorization", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const paused = service.transitionSession(session.sessionUuid, "awaiting_owner", {
      expectedRevision: session.revision,
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.value.state).toBe("awaiting_owner");
    const resumed = service.resumeSession(session.sessionUuid, {
      expectedRevision: paused.value.revision,
      ownerAuthorization: ownerAuthFor(session.sessionUuid, service),
    });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) {
      expect(resumed.value.state).toBe("active");
    }
  });

  it("refuses to resume without owner authorization", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const paused = service.transitionSession(session.sessionUuid, "awaiting_owner", {
      expectedRevision: session.revision,
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    const resumed = service.resumeSession(session.sessionUuid, {
      expectedRevision: paused.value.revision,
    });
    expect(resumed).toMatchObject({
      ok: false,
      errorCode: "transition_requires_owner_authorization",
    });
  });

  it("refuses resume when the authorization is bound to another policy", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const paused = service.transitionSession(session.sessionUuid, "awaiting_owner", {
      expectedRevision: session.revision,
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    const resumed = service.resumeSession(session.sessionUuid, {
      expectedRevision: paused.value.revision,
      ownerAuthorization: {
        authorizationId: "authz-owner-1",
        ownerId: OWNER,
        policyHash: "0".repeat(64),
        authorizedAtMs: NOW,
      },
    });
    expect(resumed).toMatchObject({ ok: false, errorCode: "owner_authorization_mismatch" });
  });

  it("completes and aborts terminal states", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const completed = service.transitionSession(session.sessionUuid, "completed", {
      expectedRevision: session.revision,
    });
    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.value.state).toBe("completed");
      expect(completed.value.completedAt).toBeDefined();
    }
    const afterTerminal = service.transitionSession(session.sessionUuid, "aborted", {
      expectedRevision: completed.ok ? completed.value.revision : 0,
    });
    expect(afterTerminal.ok).toBe(false);

    const session2 = activatedSession(service);
    const aborted = service.transitionSession(session2.sessionUuid, "aborted", {
      expectedRevision: session2.revision,
    });
    expect(aborted.ok).toBe(true);
    if (aborted.ok) {
      expect(aborted.value.state).toBe("aborted");
      expect(aborted.value.abortedAt).toBeDefined();
    }
  });

  it("materializes expiry lazily and blocks all operations after", () => {
    const { service, clock } = makeService();
    const session = activatedSession(service);
    clock.set(NOW + 24 * 3600_000);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued).toMatchObject({ ok: false, errorCode: "session_not_active" });
    expect(service.getSession(session.sessionUuid)?.state).toBe("expired");
    expect(service.listEvents(session.sessionUuid).map((e) => e.eventType)).toContain(
      "session_expired",
    );
  });
});

describe("BrokerSessionService capability issuance and verification", () => {
  it("issues a short-lived capability token without touching the budget", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const artifact = issued.value;
    expect(artifact.payload.sessionUuid).toBe(session.sessionUuid);
    expect(artifact.payload.sessionState).toBe("active");
    expect(artifact.payload.role).toBe("sandbox_operator_light");
    expect(Date.parse(artifact.payload.expiresAt) - Date.parse(artifact.payload.issuedAt)).toBe(
      SESSION_CAPABILITY_DEFAULT_TTL_MS,
    );
    expect(service.getSession(session.sessionUuid)?.toolExecutionsUsed).toBe(0);
    expect(service.listEvents(session.sessionUuid).map((e) => e.eventType)).toContain(
      "capability_issued",
    );
  });

  it("caps the token lifetime at the session expiry", () => {
    const { service } = makeService();
    const session = activatedSession(service, { expiresAtMs: NOW + 30_000 });
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(Date.parse(issued.value.payload.expiresAt) - NOW).toBe(30_000);
  });

  it("rejects ttl out of bounds", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    expect(
      service.issueSessionCapability(session.sessionUuid, "approved_project_read", { ttlMs: 0 }),
    ).toMatchObject({ ok: false, errorCode: "capability_ttl_invalid" });
    expect(
      service.issueSessionCapability(session.sessionUuid, "approved_project_read", {
        ttlMs: SESSION_CAPABILITY_MAX_TTL_MS + 1,
      }),
    ).toMatchObject({ ok: false, errorCode: "capability_ttl_invalid" });
  });

  it("rejects issuance for capabilities outside the session", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "candidate_workspace_create", {});
    expect(issued).toMatchObject({ ok: false, errorCode: "capability_not_allowed" });
  });

  it("refuses issuance without a provisioned signing key", () => {
    const { service } = makeService(NOW, false);
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued).toMatchObject({ ok: false, errorCode: "capability_key_unavailable" });
  });

  it("verifies an issued artifact against its session", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const verified = service.verifySessionCapability(issued.value);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.value.sessionUuid).toBe(session.sessionUuid);
      expect(verified.value.capabilityId).toBe("approved_project_read");
      expect(verified.value.ownerId).toBe(OWNER);
      expect(verified.value.role).toBe("sandbox_operator_light");
    }
  });

  it("rejects verification of a tampered artifact", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const tampered = {
      ...issued.value,
      payload: { ...issued.value.payload, ownerId: "owner-evil" },
    };
    const verified = service.verifySessionCapability(tampered);
    expect(verified.ok).toBe(false);
  });

  it("rejects verification when the session is completed", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const completed = service.transitionSession(session.sessionUuid, "completed", {
      expectedRevision: session.revision,
    });
    expect(completed.ok).toBe(true);
    const verified = service.verifySessionCapability(issued.value);
    expect(verified).toMatchObject({ ok: false, errorCode: "session_not_active" });
  });

  it("rejects verification of an expired token", () => {
    const { service, clock } = makeService();
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    clock.set(NOW + SESSION_CAPABILITY_DEFAULT_TTL_MS + 1);
    const verified = service.verifySessionCapability(issued.value);
    expect(verified).toMatchObject({ ok: false, errorCode: "expired" });
  });

  it("rejects verification of an artifact for an unknown session", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const forged = {
      ...issued.value,
      payload: { ...issued.value.payload, sessionUuid: "00000000000000000000000000000000" },
    };
    const verified = service.verifySessionCapability(forged);
    expect(verified).toMatchObject({ ok: false, errorCode: "invalid_signature" });
  });

  it("records capability_verified events", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const issued = service.issueSessionCapability(session.sessionUuid, "approved_project_read", {});
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    service.verifySessionCapability(issued.value);
    expect(service.listEvents(session.sessionUuid).map((e) => e.eventType)).toContain(
      "capability_verified",
    );
  });
});

describe("BrokerSessionService reservation", () => {
  it("reserves a tool execution and returns a receipt", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const reserved = service.reserveToolExecution(
      session.sessionUuid,
      "approved_project_read",
      "use-0001",
      { policyHash: session.policyHash, expectedRevision: session.revision },
    );
    expect(reserved.ok).toBe(true);
    if (reserved.ok) {
      expect(reserved.value.toolExecutionsUsed).toBe(1);
      expect(reserved.value.remainingBudget).toBe(session.maxToolExecutions - 1);
    }
  });

  it("rejects duplicate capability use ids", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const first = service.reserveToolExecution(
      session.sessionUuid,
      "approved_project_read",
      "use-0001",
      { policyHash: session.policyHash, expectedRevision: session.revision },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = service.reserveToolExecution(
      session.sessionUuid,
      "approved_project_read",
      "use-0001",
      { policyHash: session.policyHash, expectedRevision: service.getSession(session.sessionUuid)!.revision },
    );
    expect(second).toMatchObject({ ok: false, errorCode: "capability_use_replay" });
  });

  it("enforces the budget ceiling under concurrent requests", async () => {
    const { service } = makeService();
    const session = activatedSession(service, { maxToolExecutions: 2 });
    let revision = session.revision;
    const results: Array<{ ok: boolean; errorCode?: string }> = [];
    for (let i = 0; i < 4; i += 1) {
      const result = await service.reserveToolExecution(
        session.sessionUuid,
        "approved_project_read",
        `use-${i}`,
        { policyHash: session.policyHash, expectedRevision: revision },
      );
      results.push(result);
      if (result.ok) {
        revision = service.getSession(session.sessionUuid)!.revision;
      }
    }
    expect(results.filter((r) => r.ok).length).toBe(2);
    expect(results.filter((r) => !r.ok && r.errorCode === "budget_exhausted").length).toBe(2);
    expect(service.getSession(session.sessionUuid)?.toolExecutionsUsed).toBe(2);
  });

  it("rejects a policy hash that does not match the session", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const reserved = service.reserveToolExecution(
      session.sessionUuid,
      "approved_project_read",
      "use-0001",
      { policyHash: "0".repeat(64), expectedRevision: session.revision },
    );
    expect(reserved).toMatchObject({ ok: false, errorCode: "policy_mismatch" });
  });

  it("rejects reservation on a paused session", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const paused = service.transitionSession(session.sessionUuid, "awaiting_owner", {
      expectedRevision: session.revision,
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    const reserved = service.reserveToolExecution(
      session.sessionUuid,
      "approved_project_read",
      "use-0001",
      { policyHash: session.policyHash, expectedRevision: paused.value.revision },
    );
    expect(reserved).toMatchObject({ ok: false, errorCode: "session_not_active" });
  });

  it("finalizes an outcome and forbids reuse afterwards", () => {
    const { service } = makeService();
    const session = activatedSession(service);
    const reserved = service.reserveToolExecution(
      session.sessionUuid,
      "approved_project_read",
      "use-0001",
      { policyHash: session.policyHash, expectedRevision: session.revision },
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const finalized = service.finalizeToolExecution("use-0001", "succeeded");
    expect(finalized.ok).toBe(true);
    if (finalized.ok) {
      expect(finalized.value.outcome).toBe("succeeded");
    }
    expect(service.finalizeToolExecution("use-0001", "failed")).toMatchObject({
      ok: false,
      errorCode: "capability_use_already_finalized",
    });
  });
});

describe("DurableBrokerStore session wiring", () => {
  it("persists sessions and reservations across store reopen", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ashley-broker-store-"));
    const store = new DurableBrokerStore(dir);
    const ledger = store.sessionLedger;
    const service = new BrokerSessionService({
      ledger,
      capabilitySigningMaterial: capabilityKeyMaterial(),
      nowMs: () => NOW,
    });
    const session = activatedSession(service);
    const reserved = service.reserveToolExecution(
      session.sessionUuid,
      "approved_project_read",
      "use-durable-1",
      { policyHash: session.policyHash, expectedRevision: session.revision },
    );
    expect(reserved.ok).toBe(true);
    store.close();

    const reopened = new DurableBrokerStore(dir);
    const loaded = reopened.sessionLedger.getSession(session.sessionUuid);
    expect(loaded?.state).toBe("active");
    expect(loaded?.toolExecutionsUsed).toBe(1);
    expect(loaded?.revision).toBe(3);
    expect(reopened.sessionLedger.getCapabilityUse("use-durable-1")?.outcome).toBe("reserved");
    expect(reopened.sessionLedger.listEvents(session.sessionUuid)).toHaveLength(3);
    reopened.close();
  });
});
