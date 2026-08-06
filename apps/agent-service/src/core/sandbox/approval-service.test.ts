/**
 * Agent-side sandbox owner approval service tests (Sandbox Wave 4,
 * Commit 11).
 *
 * Exercises `SandboxApprovalService` against a real migrated nuclear.db
 * (in-memory, schema v19, migrated through `openNuclearDb`) and the injected
 * `FakeSandboxBrokerClient`. No real keys, providers, network or deployment
 * are used: the default owner-approval signer is overridden with an in-process
 * stub that still computes the real `payloadHash` binding over
 * `approvalAuthorityPayloadOf`, so the exact-payload-hash assertion is
 * meaningful rather than tautological.
 */
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeOwnerApprovalPayloadHash,
  OWNER_APPROVAL_SIGNER_CLASS,
  type SandboxOwnerApprovalEnvelope,
} from "@composer-assistant/sandbox-broker";
import { openNuclearDb } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import {
  createSandboxApprovalProposal,
  approvalAuthorityPayloadOf,
  SANDBOX_APPROVAL_PROPOSAL_TTL_MS,
  SANDBOX_APPROVAL_ENVELOPE_TTL_MS,
  type CreateSandboxApprovalProposalInput,
  type SandboxApprovalProposal,
} from "./approval-proposal.js";
import {
  createSandboxApprovalProposalRow,
  getSandboxApprovalProposalRow,
  listSandboxApprovalEvents,
  listSandboxApprovalProposalRows,
  updateSandboxApprovalProposalDecision,
} from "./approval-store.js";
import {
  SandboxApprovalService,
  type SandboxApprovalServiceOptions,
} from "./approval-service.js";
import {
  FakeSandboxBrokerClient,
  type SandboxBrokerClient,
  type SandboxBrokerSessionSnapshot,
} from "./broker-client.js";

const OWNER_ID = "owner-1";
const NOW = 1_800_000_000_000;

const clients: FakeSandboxBrokerClient[] = [];

afterEach(() => {
  for (const client of clients) {
    try {
      client.close();
    } catch {
      // best effort temp cleanup
    }
  }
  clients.length = 0;
});

function openDb(): DatabaseSync {
  const continuity = openContinuityDb(new DatabaseSync(":memory:"));
  return openNuclearDb(new DatabaseSync(":memory:"), { continuity });
}

function delegatedKey() {
  const pair = generateKeyPairSync("ed25519");
  return pair.publicKey.export({ type: "spki", format: "pem" }).toString();
}

function baseInput(
  overrides: Partial<CreateSandboxApprovalProposalInput> = {},
): CreateSandboxApprovalProposalInput {
  return {
    ownerId: OWNER_ID,
    capabilityId: "approved_project_read",
    authoritativeRiskClass: "high",
    affectedCanonicalPaths: [
      { path: "/srv/ashley/live-checkout/README.md", intent: "read" },
    ],
    policyRuleId: "rule-1",
    policyId: "policy-orchestration-1",
    policyVersion: 1,
    policyHash:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    sessionUuid: "sess-1",
    ...overrides,
  };
}

function makeSigner() {
  return (
    proposal: SandboxApprovalProposal,
    nowMs: number,
  ): SandboxOwnerApprovalEnvelope => {
    const payload = approvalAuthorityPayloadOf(proposal);
    return {
      protocolVersion: 1,
      keyId: "owner-ed25519-v1",
      signerClass: OWNER_APPROVAL_SIGNER_CLASS,
      proposalId: payload.proposalId,
      ownerId: payload.ownerId,
      sessionUuid: payload.sessionUuid,
      capabilityId: payload.capabilityId,
      authoritativeRiskClass: payload.authoritativeRiskClass,
      canonicalTargetPaths: payload.canonicalTargetPaths,
      policyRuleId: payload.policyRuleId,
      policyId: payload.policyId,
      policyVersion: payload.policyVersion,
      policyHash: payload.policyHash,
      recipeId: payload.recipeId,
      executableId: payload.executableId,
      persistence: payload.persistence,
      requiresNetwork: payload.requiresNetwork,
      externalSideEffect: payload.externalSideEffect,
      networkMode: "none",
      issuedAt: nowMs,
      expiresAt: nowMs + SANDBOX_APPROVAL_ENVELOPE_TTL_MS,
      nonce: "n-fixed-0",
      payloadHash: computeOwnerApprovalPayloadHash(payload),
    };
  };
}

type Harness = {
  db: DatabaseSync;
  clock: { now: number };
  audits: unknown[];
  client: FakeSandboxBrokerClient;
  service: SandboxApprovalService;
};

function makeService(
  opts: {
    db?: DatabaseSync;
    clock?: { now: number };
    signer?: (proposal: SandboxApprovalProposal, nowMs: number) => SandboxOwnerApprovalEnvelope;
    policyHashProvider?: (() => string | null) | undefined;
    ownerId?: string;
    brokerClient?: SandboxBrokerClient | null;
  } = {},
): Harness {
  const db = opts.db ?? openDb();
  const clock = opts.clock ?? { now: NOW };
  const audits: unknown[] = [];
  const client = new FakeSandboxBrokerClient({
    ownerId: OWNER_ID,
    delegatedPublicKeyPem: delegatedKey(),
    nowMs: () => clock.now,
  });
  clients.push(client);
  const service = new SandboxApprovalService({
    db,
    ownerId: opts.ownerId ?? OWNER_ID,
    brokerClient: opts.brokerClient === undefined ? client : opts.brokerClient,
    signer: opts.signer ?? makeSigner(),
    policyHashProvider: opts.policyHashProvider,
    auditSink: (record) => audits.push(record),
    nowMs: () => clock.now,
  });
  return { db, clock, audits, client, service };
}

async function makeAwaitingSession(
  harness: Harness,
): Promise<SandboxBrokerSessionSnapshot> {
  const created = await harness.client.createSession({
    ownerId: OWNER_ID,
    proposalId: "sess-prop-1",
    role: "sandbox_operator_light",
    allowedCapabilities: ["approved_project_read"],
    maxToolExecutions: 10,
    expiresAtMs: NOW + 60_000,
    nowMs: NOW,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("unreachable");
  const session = created.value;
  expect(session.state).toBe("created");
  expect(session.revision).toBe(1);

  const activated = await harness.client.activateSession(
    session.sessionUuid,
    1,
    NOW,
  );
  expect(activated.ok).toBe(true);
  if (!activated.ok) throw new Error("unreachable");
  expect(activated.value.state).toBe("active");
  expect(activated.value.revision).toBe(2);

  const transitioned = await harness.client.transitionSession(
    session.sessionUuid,
    "awaiting_owner",
    { expectedRevision: 2, nowMs: NOW },
  );
  expect(transitioned.ok).toBe(true);
  if (!transitioned.ok) throw new Error("unreachable");
  expect(transitioned.value.state).toBe("awaiting_owner");
  return transitioned.value;
}

describe("SandboxApprovalService: proposal creation", () => {
  it("creates a pending proposal with high against a real v19 database", () => {
    const h = makeService();
    const result = h.service.createProposal(
      baseInput({ authoritativeRiskClass: "high" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.status).toBe("pending");
    expect(result.value.authoritativeRiskClass).toBe("high");
    expect(result.value.source).toBe("policy_precheck");
    expect(result.value.proposalId).not.toBe("");
    expect(result.value.envelopeJson).toBeNull();
    expect(h.audits.map((a) => (a as { kind: string }).kind)).toContain(
      "approval_proposal_created",
    );
    const read = h.service.getProposal(result.value.proposalId);
    expect(read?.proposalId).toBe(result.value.proposalId);
    expect(read?.entityUuid).not.toBe("");
  });

  it("1. only owner_approvable operations create proposals (owner-mismatch gate)", () => {
    const h = makeService();
    const result = h.service.createProposal(
      baseInput({ ownerId: "other-owner" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("approval_owner_mismatch");
    }
  });

  it("2. autonomous-safe (requiresNetwork=true) does not create a proposal", () => {
    const h = makeService();
    const result = h.service.createProposal(baseInput({ requiresNetwork: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("approval_network_mode_unsupported");
      expect(result.reason).toMatch(/networkMode is none/i);
    }
  });

  it("enforces the bound on affected canonical paths (max 8)", () => {
    const h = makeService();
    const paths = Array.from({ length: 9 }, (_, i) => ({
      path: `/srv/ashley/live-checkout/p${i}`,
      intent: "read" as const,
    }));
    const result = h.service.createProposal(
      baseInput({ affectedCanonicalPaths: paths }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_too_many_target_paths");
  });

  it("accepts exactly the bound (8 paths)", () => {
    const h = makeService();
    const paths = Array.from({ length: 8 }, (_, i) => ({
      path: `/srv/ashley/live-checkout/p${i}`,
      intent: "read" as const,
    }));
    const result = h.service.createProposal(
      baseInput({ affectedCanonicalPaths: paths }),
    );
    expect(result.ok).toBe(true);
  });

  it("requires at least one canonical target path", () => {
    const h = makeService();
    const result = h.service.createProposal(baseInput({ affectedCanonicalPaths: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_no_target_paths");
  });

  it("requires the active policy rule, id, version and hash", () => {
    const h = makeService();
    for (const omit of [
      "policyRuleId",
      "policyId",
      "policyHash",
      "policyVersion",
    ] as const) {
      const input = baseInput();
      delete (input as Record<string, unknown>)[omit];
      const result = h.service.createProposal(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("approval_policy_unbound");
    }
  });

  it("requires a capability id", () => {
    const h = makeService();
    const result = h.service.createProposal(
      baseInput({ capabilityId: "" as never }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_capability_missing");
  });

  it("rejects a stale risk class (public)", () => {
    const h = makeService();
    const result = h.service.createProposal(
      baseInput({ authoritativeRiskClass: "public" as never }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_invalid_risk_class");
  });

  it("accepts all four canonical risk classes and round-trips them", () => {
    const h = makeService();
    for (const risk of ["low", "medium", "high", "consultation"] as const) {
      const created = h.service.createProposal(
        baseInput({ authoritativeRiskClass: risk }),
      );
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(`unreachable ${risk}`);
      expect(created.value.authoritativeRiskClass).toBe(risk);
      const read = h.service.getProposal(created.value.proposalId);
      expect(read?.authoritativeRiskClass).toBe(risk);
    }
  });

  it("truncates an oversized model summary to the bound", () => {
    const h = makeService();
    const result = h.service.createProposal(
      baseInput({ modelSummary: "x".repeat(2000) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.modelSummary?.length).toBe(1200);
  });

  it("defaults source to policy_precheck and persistence to temporary", () => {
    const h = makeService();
    const result = h.service.createProposal(baseInput({}));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.source).toBe("policy_precheck");
    expect(result.value.persistence).toBe("temporary");
    expect(result.value.requiresNetwork).toBe(false);
    expect(result.value.externalSideEffect).toBe(false);
  });

  it("records a created event on the proposal event log", () => {
    const h = makeService();
    const result = h.service.createProposal(baseInput({}));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const events = listSandboxApprovalEvents(h.db, result.value.entityUuid, {
      limit: 10,
    });
    expect(events.map((e) => e.eventType)).toContain("created");
    expect(events.find((e) => e.eventType === "created")?.payload).toMatchObject({
      capabilityId: "approved_project_read",
      source: "policy_precheck",
    });
  });

  it("generates distinct proposal ids and entity uuids", () => {
    const h = makeService();
    const a = h.service.createProposal(baseInput({}));
    const b = h.service.createProposal(baseInput({}));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("unreachable");
    expect(a.value.proposalId).not.toBe(b.value.proposalId);
    expect(a.value.entityUuid).not.toBe(b.value.entityUuid);
  });

  it("sets expiresAt to now + proposal ttl", () => {
    const h = makeService();
    const result = h.service.createProposal(baseInput({ nowMs: NOW }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(Date.parse(result.value.expiresAtIso)).toBe(
      NOW + SANDBOX_APPROVAL_PROPOSAL_TTL_MS,
    );
  });
});

describe("SandboxApprovalService: approval (signing + binding)", () => {
  it("approves a pending proposal, persists the envelope, and emits audits", () => {
    const h = makeService();
    const created = h.service.createProposal(baseInput({}));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");

    const approved = h.service.approveProposal(created.value.proposalId, {
      reason: "yes, looks safe",
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    expect(approved.value.status).toBe("approved");
    expect(approved.value.decisionReason).toBe("yes, looks safe");
    expect(approved.value.decidedAtMs).toBe(NOW);
    expect(approved.value.envelopeJson).not.toBeNull();

    const envelope = JSON.parse(approved.value.envelopeJson!) as SandboxOwnerApprovalEnvelope;
    const expectedHash = computeOwnerApprovalPayloadHash(
      approvalAuthorityPayloadOf(approved.value),
    );
    expect(envelope.payloadHash).toBe(expectedHash);
    expect(envelope.keyId).toBe("owner-ed25519-v1");
    expect(envelope.networkMode).toBe("none");

    const events = listSandboxApprovalEvents(h.db, approved.value.entityUuid);
    expect(events.map((e) => e.eventType)).toEqual(
      expect.arrayContaining(["created", "approved"]),
    );
    expect(events.find((e) => e.eventType === "approved")?.payload).toMatchObject({
      keyId: "owner-ed25519-v1",
    });

    const kinds = h.audits.map((a) => (a as { kind: string }).kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "approval_proposal_created",
        "approval_proposal_approved",
      ]),
    );
  });

  it("only a pending proposal is approvable (terminal idempotency)", () => {
    const h = makeService();
    const created = h.service.createProposal(baseInput({}));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const first = h.service.approveProposal(created.value.proposalId);
    expect(first.ok).toBe(true);
    const second = h.service.approveProposal(created.value.proposalId);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.errorCode).toBe("approval_not_approvable");
  });

  it("truncates an oversized approve reason to the bound (500)", () => {
    const h = makeService();
    const created = h.service.createProposal(baseInput({}));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId, {
      reason: "r".repeat(1000),
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    expect(approved.value.decisionReason?.length).toBe(500);
  });

  it("surfaces signer failures as owner_approval_key_unavailable", () => {
    const h = makeService({ signer: () => { throw new Error("no-key"); } });
    const created = h.service.createProposal(baseInput({}));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId);
    expect(approved.ok).toBe(false);
    if (!approved.ok) expect(approved.errorCode).toBe("owner_approval_key_unavailable");
  });
});

describe("SandboxApprovalService: terminal decisions", () => {
  function makePending(h: Harness): SandboxApprovalProposal {
    const created = h.service.createProposal(baseInput({}));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    return created.value;
  }

  it("rejects a pending proposal", () => {
    const h = makeService();
    const p = makePending(h);
    const result = h.service.rejectProposal(p.proposalId, "too risky");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.status).toBe("rejected");
    expect(result.value.decisionReason).toBe("too risky");
    expect(result.value.envelopeJson).toBeNull();
    expect(h.audits.map((a) => (a as { kind: string }).kind)).toContain(
      "approval_proposal_rejected",
    );
  });

  it("withdraws a pending proposal", () => {
    const h = makeService();
    const p = makePending(h);
    const result = h.service.withdrawProposal(p.proposalId, "no longer needed");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.status).toBe("withdrawn");
    expect(h.audits.map((a) => (a as { kind: string }).kind)).toContain(
      "approval_proposal_withdrawn",
    );
  });

  it("withdraws an approved proposal", () => {
    const h = makeService();
    const p = makePending(h);
    const approved = h.service.approveProposal(p.proposalId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    const withdrawn = h.service.withdrawProposal(approved.value.proposalId);
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) throw new Error("unreachable");
    expect(withdrawn.value.status).toBe("withdrawn");
  });

  it("marks a pending proposal stale", () => {
    const h = makeService();
    const p = makePending(h);
    const result = h.service.markStaleProposal(p.proposalId, "stale");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.status).toBe("stale");
  });

  it("reject refuses an approved proposal (pending-only)", () => {
    const h = makeService();
    const p = makePending(h);
    h.service.approveProposal(p.proposalId);
    const result = h.service.rejectProposal(p.proposalId, "no");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_not_rejectable");
  });

  it("withdrawal refuses a rejected proposal", () => {
    const h = makeService();
    const p = makePending(h);
    h.service.rejectProposal(p.proposalId, "no");
    const result = h.service.withdrawProposal(p.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_not_withdrawable");
  });

  it("stale refuses a proposal past its expiry window", () => {
    const h = makeService();
    const p = makePending(h);
    h.clock.now = NOW + SANDBOX_APPROVAL_PROPOSAL_TTL_MS + 1;
    const result = h.service.markStaleProposal(p.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_not_staleable");
  });

  it("terminal decisions record the corresponding event", () => {
    const h = makeService();
    const p = makePending(h);
    const approved = h.service.approveProposal(p.proposalId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    const events = listSandboxApprovalEvents(h.db, approved.value.entityUuid);
    expect(events.map((e) => e.eventType)).toEqual(
      expect.arrayContaining(["created", "approved"]),
    );
  });
});

describe("SandboxApprovalService: list / get / expiry-on-read", () => {
  it("scopes getProposal to the configured owner", () => {
    const db = openDb();
    const input = createSandboxApprovalProposal(
      baseInput({ ownerId: "other-owner" }),
    );
    expect(input.ok).toBe(true);
    if (!input.ok) throw new Error("unreachable");
    const cross = createSandboxApprovalProposalRow(db, input.value);
    expect(cross.ownerId).toBe("other-owner");

    const h = makeService({ db });
    expect(h.service.getProposal(cross.proposalId)).toBeNull();
    expect(h.service.listProposals()).toHaveLength(0);
  });

  it("lists by owner and status, newest first", () => {
    const h = makeService();
    const a = h.service.createProposal(baseInput({}));
    const b = h.service.createProposal(baseInput({}));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("unreachable");
    h.service.rejectProposal(a.value.proposalId, "no");

    const pending = h.service.listProposals({ status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0].proposalId).toBe(b.value.proposalId);

    const rejected = h.service.listProposals({ status: "rejected" });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].proposalId).toBe(a.value.proposalId);

    expect(h.service.listProposals()).toHaveLength(2);
    expect(listSandboxApprovalProposalRows(h.db, OWNER_ID, {}).length).toBe(2);
  });

  it("expireDueProposals runs on read (pending -> expired past ttl)", () => {
    const h = makeService();
    const created = h.service.createProposal(baseInput({ nowMs: NOW }));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");

    h.clock.now = NOW + SANDBOX_APPROVAL_PROPOSAL_TTL_MS + 1;
    const read = h.service.getProposal(created.value.proposalId);
    expect(read).not.toBeNull();
    expect(read!.status).toBe("expired");
    expect(read!.decisionReason).toBe("approval_window_elapsed");

    expect(h.service.listProposals()).toHaveLength(1);
    expect(h.service.listProposals()[0].status).toBe("expired");
    expect(h.service.listProposals({ status: "pending" })).toHaveLength(0);
  });

  it("row-level updateDecision is a no-op / idempotent on a missing proposal", () => {
    const db = openDb();
    const updated = updateSandboxApprovalProposalDecision(db, "missing-id", {
      status: "approved",
      reason: "nope",
      decidedAtMs: NOW,
    });
    expect(updated).toBe(false);
    expect(getSandboxApprovalProposalRow(db, "missing-id")).toBeNull();
  });
});

describe("SandboxApprovalService: resumeSession refusal branches", () => {
  it("refuses resume without a broker client", async () => {
    const h = makeService({ brokerClient: null });
    const created = h.service.createProposal(baseInput({}));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    const result = await h.service.resumeSession(approved.value.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("broker_client_unavailable");
  });

  it("refuses resume on a pending (not approved) proposal", async () => {
    const h = makeService();
    const created = h.service.createProposal(baseInput({}));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const result = await h.service.resumeSession(created.value.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_not_resumable");
  });

  it("refuses resume when the policy changed since approval (provider stale)", async () => {
    const h = makeService({ policyHashProvider: () => "stale-policy-hash" });
    const session = await makeAwaitingSession(h);
    const created = h.service.createProposal(
      baseInput({ sessionUuid: session.sessionUuid, policyHash: session.policyHash }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    const result = await h.service.resumeSession(approved.value.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_stale_policy");
  });

  it("refuses resume when the bound session policy hash differs", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const created = h.service.createProposal(
      baseInput({
        sessionUuid: session.sessionUuid,
        policyHash: "other-session-hash",
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    const result = await h.service.resumeSession(approved.value.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_stale_policy");
  });

  it("refuses resume when the bound session is not awaiting_owner", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const first = h.service.createProposal(
      baseInput({ sessionUuid: session.sessionUuid, policyHash: session.policyHash }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    const firstApproved = h.service.approveProposal(first.value.proposalId);
    expect(firstApproved.ok).toBe(true);
    if (!firstApproved.ok) throw new Error("unreachable");
    const resumed = await h.service.resumeSession(firstApproved.value.proposalId);
    expect(resumed.ok).toBe(true);

    const second = h.service.createProposal(
      baseInput({ sessionUuid: session.sessionUuid, policyHash: session.policyHash }),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    const secondApproved = h.service.approveProposal(second.value.proposalId);
    expect(secondApproved.ok).toBe(true);
    if (!secondApproved.ok) throw new Error("unreachable");
    const result = await h.service.resumeSession(secondApproved.value.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("session_not_awaiting_owner");
  });

  it("refuses resume for an unknown bound session", async () => {
    const h = makeService();
    const created = h.service.createProposal(
      baseInput({ sessionUuid: "sess-unknown" }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    const result = await h.service.resumeSession(approved.value.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("unknown_session");
  });

  it("propagates an expired proposal as not resumable", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const created = h.service.createProposal(
      baseInput({ sessionUuid: session.sessionUuid, policyHash: session.policyHash }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");

    h.clock.now = NOW + SANDBOX_APPROVAL_PROPOSAL_TTL_MS + 1;
    const result = await h.service.resumeSession(approved.value.proposalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("approval_not_resumable");
  });
});

describe("SandboxApprovalService: resumeSession success", () => {
  it("resumes an approved proposal, activates the session and records the audit", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const created = h.service.createProposal(
      baseInput({ sessionUuid: session.sessionUuid, policyHash: session.policyHash }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");

    const before = h.client.getSession(session.sessionUuid);
    expect(before?.state).toBe("awaiting_owner");
    expect(before?.revision).toBe(3);

    const result = await h.service.resumeSession(approved.value.proposalId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.session.state).toBe("active");
    expect(result.value.session.revision).toBe(4);

    const after = h.client.getSession(session.sessionUuid);
    expect(after?.state).toBe("active");

    const resumed = h.audits.find(
      (a) =>
        (a as { kind: string }).kind === "approval_session_resumed" &&
        (a as { errorCode: unknown }).errorCode === null,
    );
    expect(resumed).toBeDefined();
    expect((resumed as { revision: number }).revision).toBe(4);

    const events = listSandboxApprovalEvents(h.db, approved.value.entityUuid);
    expect(events.map((e) => e.eventType)).toContain("session_resumed");
    expect(
      events.find((e) => e.eventType === "session_resumed")?.payload,
    ).toMatchObject({ revision: 4 });
  });

  it("exact payload-hash binding: persisted envelope hash matches the authority payload", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const created = h.service.createProposal(
      baseInput({ sessionUuid: session.sessionUuid, policyHash: session.policyHash }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const approved = h.service.approveProposal(created.value.proposalId, {
      reason: "proceed",
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");

    const envelope = JSON.parse(approved.value.envelopeJson!) as SandboxOwnerApprovalEnvelope;
    const recompute = computeOwnerApprovalPayloadHash(
      approvalAuthorityPayloadOf(approved.value),
    );
    expect(envelope.payloadHash).toBe(recompute);

    // Tamper detection: a single authority field change must alter the hash.
    const tamperedPayload = approvalAuthorityPayloadOf({
      ...approved.value,
      capabilityId: "candidate_workspace_create",
    });
    const tamperedHash = computeOwnerApprovalPayloadHash(tamperedPayload);
    expect(tamperedHash).not.toBe(recompute);
    expect(tamperedHash).not.toBe(envelope.payloadHash);
  });
});

describe("broker owner-authorization guard (enforced for resume)", () => {
  it("rejects an expected-revision mismatch", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const result = await h.client.resumeSession(session.sessionUuid, {
      expectedRevision: 999,
      ownerAuthorization: {
        authorizationId: "auth-1",
        ownerId: OWNER_ID,
        policyHash: session.policyHash,
        authorizedAtMs: NOW,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("revision_mismatch");
  });

  it("rejects an owner-id mismatch in the authorization", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const result = await h.client.resumeSession(session.sessionUuid, {
      expectedRevision: session.revision,
      ownerAuthorization: {
        authorizationId: "auth-1",
        ownerId: "not-the-owner",
        policyHash: session.policyHash,
        authorizedAtMs: NOW,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("owner_authorization_mismatch");
  });

  it("rejects a policy-hash mismatch in the authorization", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const result = await h.client.resumeSession(session.sessionUuid, {
      expectedRevision: session.revision,
      ownerAuthorization: {
        authorizationId: "auth-1",
        ownerId: OWNER_ID,
        policyHash: "wrong-hash",
        authorizedAtMs: NOW,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("owner_authorization_mismatch");
  });

  it("requires an authorization id for awaiting_owner -> active", async () => {
    const h = makeService();
    const session = await makeAwaitingSession(h);
    const result = await h.client.resumeSession(session.sessionUuid, {
      expectedRevision: session.revision,
      ownerAuthorization: {
        authorizationId: "",
        ownerId: OWNER_ID,
        policyHash: session.policyHash,
        authorizedAtMs: NOW,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("owner_authorization_mismatch");
  });
});
