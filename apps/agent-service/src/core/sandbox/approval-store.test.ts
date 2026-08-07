/**
 * Agent-side sandbox approval reconcile tests (Sandbox Wave 4, Commit 12).
 *
 * `reconcileSandboxApprovals` runs when nuclear.db is opened after an outage
 * or restart: pending/approved proposals whose window lapsed while the agent
 * was down become `expired` (event recorded). It never approves, rejects,
 * withdraws, stales, or resumes anything, and never touches bindings.
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import {
  createSandboxApprovalProposal,
  SANDBOX_APPROVAL_PROPOSAL_TTL_MS,
  type CreateSandboxApprovalProposalInput,
} from "./approval-proposal.js";
import {
  createSandboxApprovalProposalRow,
  getSandboxApprovalProposalRow,
  listSandboxApprovalEvents,
  listSandboxApprovalProposalRows,
  reconcileSandboxApprovals,
  updateSandboxApprovalProposalDecision,
} from "./approval-store.js";

const OWNER_ID = "owner-1";
const NOW = Date.now();

function baseInput(
  overrides: Partial<CreateSandboxApprovalProposalInput> = {},
): CreateSandboxApprovalProposalInput {  return {
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

function seedProposal(
  db: DatabaseSync,
  input: Partial<CreateSandboxApprovalProposalInput> & { nowMs: number },
  overrides: { status?: "pending" | "approved" } = {},
) {
  const created = createSandboxApprovalProposal(baseInput(input));
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("unreachable");
  const stored = createSandboxApprovalProposalRow(db, created.value);
  if (overrides.status === "approved") {
    updateSandboxApprovalProposalDecision(db, stored.proposalId, {
      status: "approved",
      decidedAtMs: input.nowMs,
    });
  }
  return stored;
}

describe("reconcileSandboxApprovals", () => {
  it("expires a lapsed pending proposal and records an expired event", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"), {
      continuity: openContinuityDb(new DatabaseSync(":memory:")),
    });
    const proposal = seedProposal(db, {
      nowMs: NOW - SANDBOX_APPROVAL_PROPOSAL_TTL_MS - 1_000,
    });
    const report = reconcileSandboxApprovals(db, { nowMs: NOW });
    expect(report).toEqual({ expired: 1 });
    const read = getSandboxApprovalProposalRow(db, proposal.proposalId);
    expect(read?.status).toBe("expired");
    expect(read?.decisionReason).toBe("approval_window_elapsed");
    expect(
      listSandboxApprovalEvents(db, proposal.entityUuid).map((event) => event.eventType),
    ).toContain("expired");
    expect(
      listSandboxApprovalEvents(db, proposal.entityUuid).find(
        (event) => event.eventType === "expired",
      )?.payload,
    ).toMatchObject({ reconcileOnOpen: true });
  });

  it("expires a lapsed approved proposal", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"), {
      continuity: openContinuityDb(new DatabaseSync(":memory:")),
    });
    const proposal = seedProposal(
      db,
      { nowMs: NOW - SANDBOX_APPROVAL_PROPOSAL_TTL_MS - 1_000 },
      { status: "approved" },
    );
    const report = reconcileSandboxApprovals(db, { nowMs: NOW });
    expect(report).toEqual({ expired: 1 });
    expect(getSandboxApprovalProposalRow(db, proposal.proposalId)?.status).toBe(
      "expired",
    );
  });

  it("leaves non-lapsed and terminal proposals untouched", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"), {
      continuity: openContinuityDb(new DatabaseSync(":memory:")),
    });
    const live = seedProposal(db, { nowMs: NOW });
    const lapsed = seedProposal(db, {
      nowMs: NOW - SANDBOX_APPROVAL_PROPOSAL_TTL_MS - 1_000,
    });
    updateSandboxApprovalProposalDecision(db, lapsed.proposalId, {
      status: "rejected",
      decidedAtMs: NOW,
    });
    const report = reconcileSandboxApprovals(db, { nowMs: NOW });
    expect(report).toEqual({ expired: 0 });
    expect(getSandboxApprovalProposalRow(db, live.proposalId)?.status).toBe(
      "pending",
    );
    expect(getSandboxApprovalProposalRow(db, lapsed.proposalId)?.status).toBe(
      "rejected",
    );
  });

  it("never auto-decides beyond expiry", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"), {
      continuity: openContinuityDb(new DatabaseSync(":memory:")),
    });
    const proposal = seedProposal(db, {
      nowMs: NOW - SANDBOX_APPROVAL_PROPOSAL_TTL_MS - 1_000,
    });
    reconcileSandboxApprovals(db, { nowMs: NOW });
    const read = getSandboxApprovalProposalRow(db, proposal.proposalId);
    expect(read?.status).toBe("expired");
    expect(read?.envelopeJson).toBeNull();
    expect(read?.sessionUuid).toBe("sess-1");
  });

  it("reconciles on open after a lapsed proposal was seeded before open", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ashley-approval-reconcile-"));
    const dbPath = path.join(dir, "nuclear.db");
    const continuity = openContinuityDb(new DatabaseSync(":memory:"));
    try {
      const first = openNuclearDb(new DatabaseSync(dbPath), { continuity });
      const proposal = seedProposal(first, {
        nowMs: NOW - SANDBOX_APPROVAL_PROPOSAL_TTL_MS - 1_000,
      });
      first.close();

      const reopened = openNuclearDb(new DatabaseSync(dbPath), { continuity });
      const read = getSandboxApprovalProposalRow(reopened, proposal.proposalId);
      expect(read?.status).toBe("expired");
      expect(read?.decisionReason).toBe("approval_window_elapsed");
      reopened.close();
    } finally {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
          rmSync(dir, { recursive: true, force: true });
          return;
        } catch {
          // keep waiting for the Windows file handle to release
        }
      }
      console.error("cleanup failed; files:", readdirSync(dir));
    }
  });

  it("does not expire proposals opened within their window", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"), {
      continuity: openContinuityDb(new DatabaseSync(":memory:")),
    });
    const proposal = seedProposal(db, { nowMs: NOW });
    expect(listSandboxApprovalProposalRows(db, OWNER_ID, {}).length).toBe(1);
    expect(getSandboxApprovalProposalRow(db, proposal.proposalId)?.status).toBe(
      "pending",
    );
  });
});
