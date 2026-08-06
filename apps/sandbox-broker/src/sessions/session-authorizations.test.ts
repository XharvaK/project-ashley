/**
 * Broker owner authorization records (Sandbox Wave 4, Commit 11).
 *
 * Owner authorizations are recorded atomically with the `awaiting_owner ->
 * active` transition, idempotent by authorization id, durable in the SQLite
 * session ledger, and queryable by session for execution-time verification.
 */

import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { BrokerSessionLedger } from "./session-ledger.js";
import { BrokerSessionService } from "./session-service.js";
import { capabilityKeyMaterial } from "../test/fixtures/session.js";
import { activeSessionPolicy } from "../test/fixtures/session.js";
import { createActiveSession } from "../test/fixtures/execution.js";
import { makeExecutionHarness } from "../test/fixtures/execution.js";
import type { OwnerAuthorizedTransition } from "./session-types.js";

const NOW = 1_800_000_000_000;

function ownerAuth(
  authorizationId: string,
  policyHash: string,
): OwnerAuthorizedTransition {
  return {
    authorizationId,
    ownerId: "owner-1",
    policyHash,
    authorizedAtMs: NOW,
  };
}

describe("session ledger owner authorizations", () => {
  it("records an owner authorization atomically with the resume transition", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;

    const paused = harness.sessionService.transitionSession(sessionUuid, "awaiting_owner", {
      expectedRevision: active.session.session.revision,
      nowMs: NOW,
    });
    if (!paused.ok) return;
    const resumed = harness.sessionService.resumeSession(sessionUuid, {
      expectedRevision: paused.value.revision,
      ownerAuthorization: ownerAuth("authz-owner-1", harness.activePolicy.policyHash),
      nowMs: NOW,
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.state).toBe("active");
    expect(resumed.value.revision).toBe(paused.value.revision + 1);

    const recorded = harness.sessionService.getOwnerAuthorization("authz-owner-1");
    expect(recorded).not.toBeNull();
    expect(recorded?.sessionUuid).toBe(sessionUuid);
    expect(recorded?.ownerId).toBe("owner-1");
    expect(recorded?.authorizedAtMs).toBe(NOW);
  });

  it("refuses to resume without an owner authorization", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;
    const paused = harness.sessionService.transitionSession(sessionUuid, "awaiting_owner", {
      expectedRevision: active.session.session.revision,
      nowMs: NOW,
    });
    if (!paused.ok) return;
    const resumed = harness.sessionService.resumeSession(sessionUuid, {
      expectedRevision: paused.value.revision,
      nowMs: NOW,
    });
    expect(resumed).toMatchObject({ ok: false, errorCode: "transition_requires_owner_authorization" });
  });

  it("is idempotent per authorization id across repeated resume attempts", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;

    const first = harness.sessionService.transitionSession(sessionUuid, "awaiting_owner", {
      expectedRevision: active.session.session.revision,
      nowMs: NOW,
    });
    if (!first.ok) return;
    const resumed = harness.sessionService.resumeSession(sessionUuid, {
      expectedRevision: first.value.revision,
      ownerAuthorization: ownerAuth("authz-dup-1", harness.activePolicy.policyHash),
      nowMs: NOW,
    });
    expect(resumed.ok).toBe(true);

    const second = harness.sessionService.transitionSession(sessionUuid, "awaiting_owner", {
      expectedRevision: resumed.ok ? resumed.value.revision : 0,
      nowMs: NOW,
    });
    if (!second.ok) return;
    const resumedAgain = harness.sessionService.resumeSession(sessionUuid, {
      expectedRevision: second.value.revision,
      ownerAuthorization: ownerAuth("authz-dup-1", harness.activePolicy.policyHash),
      nowMs: NOW,
    });
    expect(resumedAgain.ok).toBe(true);

    const authorizations = harness.sessionService.listOwnerAuthorizations(sessionUuid);
    const withDupId = authorizations.filter((row) => row.authorizationId === "authz-dup-1");
    expect(withDupId.length).toBe(1);
  });

  it("persists authorizations in the SQLite ledger backend", () => {
    const db = new DatabaseSync(":memory:");
    const ledger = new BrokerSessionLedger({ database: db });
    const service = new BrokerSessionService({
      ledger,
      capabilitySigningMaterial: capabilityKeyMaterial(),
      nowMs: () => NOW,
    });
    const policy = activeSessionPolicy(
      {
        policyId: "policy-ledger-1",
        policyVersion: 1,
        issuedAt: "2026-08-06T00:00:00.000Z",
        allowedDelegatedSignerKeyIds: ["delegated-runtime-ed25519-v1"],
        allowedCapabilities: ["approved_project_read"],
        sessionRoles: ["sandbox_operator_light"],
        readOnlyRoots: ["/repo"],
        writableDisposableRoots: ["/tmp"],
        protectedRoots: [],
        allowedRecipeIds: ["git:status"],
        allowedExecutableIds: [],
        resourceCeilings: {
          wallMsMax: 120_000,
          maxProcesses: 4,
          maxOutputBytes: 1_048_576,
          workspaceBytesMax: 1_000_000_000,
        },
        networkMode: "none",
        maxActiveSessions: 1,
        payloadVersion: 1,
      },
      "owner-ed25519-v1",
    );
    const created = service.createSession({
      ownerId: "owner-1",
      proposalId: "prop-1",
      role: "sandbox_operator_light",
      activePolicy: policy,
      allowedCapabilities: ["approved_project_read"],
      maxToolExecutions: 10,
      expiresAtMs: NOW + 3_600_000,
      nowMs: NOW,
    });
    if (!created.ok) return;
    const sessionUuid = created.value.sessionUuid;
    const activated = service.activateSession(sessionUuid, 1, NOW);
    if (!activated.ok) return;
    const paused = service.transitionSession(sessionUuid, "awaiting_owner", {
      expectedRevision: activated.value.revision,
      nowMs: NOW,
    });
    if (!paused.ok) return;
    const resumed = service.resumeSession(sessionUuid, {
      expectedRevision: paused.value.revision,
      ownerAuthorization: ownerAuth("authz-sqlite-1", policy.policyHash),
      nowMs: NOW,
    });
    expect(resumed.ok).toBe(true);

    const reloaded = new BrokerSessionLedger({ database: db });
    const fromReloaded = reloaded.getOwnerAuthorization("authz-sqlite-1");
    expect(fromReloaded?.sessionUuid).toBe(sessionUuid);
    expect(fromReloaded?.policyHash).toBe(policy.policyHash);
  });

  it("lists authorizations per session", () => {
    const harness = makeExecutionHarness({ nowMs: NOW });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const sessionUuid = active.session.session.sessionUuid;

    let revision = active.session.session.revision;
    for (let index = 0; index < 2; index += 1) {
      const paused = harness.sessionService.transitionSession(sessionUuid, "awaiting_owner", {
        expectedRevision: revision,
        nowMs: NOW,
      });
      if (!paused.ok) throw new Error(`pause failed: ${paused.errorCode}`);
      const resumed = harness.sessionService.resumeSession(sessionUuid, {
        expectedRevision: paused.value.revision,
        ownerAuthorization: ownerAuth(`authz-list-${index}`, harness.activePolicy.policyHash),
        nowMs: NOW,
      });
      if (!resumed.ok) throw new Error(`resume failed: ${resumed.errorCode}`);
      revision = resumed.value.revision;
    }

    const authorizations = harness.sessionService.listOwnerAuthorizations(sessionUuid);
    expect(authorizations.map((row) => row.authorizationId).sort()).toEqual([
      "authz-list-0",
      "authz-list-1",
    ]);
  });
});
