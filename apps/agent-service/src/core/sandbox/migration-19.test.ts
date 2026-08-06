/**
 * Regression coverage for the v19 sandbox approval DDL (Sandbox Wave 4,
 * Commit 11).
 *
 * Guards against drift between the canonical `SandboxRiskClass` vocabulary
 * (`low | medium | high | consultation`, source of truth:
 * `apps/sandbox-policy/src/types.ts`) and the `authoritative_risk_class`
 * CHECK declared by the migration. A previous revision of this migration
 * shipped an obsolete vocabulary (`observe`, `prepare`, ...) that rejected
 * every risk class the runtime and validators actually produce, so
 * `createProposal()` could not persist a proposal into a migrated database.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb, NUCLEAR_SUPPORTED_VERSION } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";
import {
  createSandboxApprovalProposal,
  type SandboxApprovalProposal,
} from "./approval-proposal.js";
import {
  createSandboxApprovalProposalRow,
  getSandboxApprovalProposalRow,
} from "./approval-store.js";
import { MIGRATION_19_SANDBOX_APPROVAL_DDL } from "./migration-19.js";

function openMigratedDb(): DatabaseSync {
  const continuity = openContinuityDb(new DatabaseSync(":memory:"));
  return openNuclearDb(new DatabaseSync(":memory:"), { continuity });
}

function baseInput(overrides: {
  risk?: SandboxApprovalProposal["authoritativeRiskClass"];
  ownerId?: string;
}) {
  return {
    ownerId: overrides.ownerId ?? "owner-1",
    capabilityId: "approved_project_read" as const,
    authoritativeRiskClass: overrides.risk ?? "high",
    affectedCanonicalPaths: [
      { path: "/srv/ashley/live-checkout/README.md", intent: "read" as const },
    ],
    policyRuleId: "rule-1",
    policyId: "policy-1",
    policyVersion: 1,
    policyHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    sessionUuid: "sess-1",
  };
}

describe("migration-19 approval DDL risk vocabulary", () => {
  it("migrates a fresh database to nuclear schema v19", () => {
    const db = openMigratedDb();
    const row = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    expect(row.user_version).toBe(19);
    expect(NUCLEAR_SUPPORTED_VERSION).toBe(19);
    expect(
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE name = 'sandbox_approval_proposals' AND type = 'table'",
        )
        .get(),
    ).not.toBeNull();
  });

  it("persists and round-trips every canonical SandboxRiskClass via the store", () => {
    const db = openMigratedDb();
    for (const risk of ["low", "medium", "high", "consultation"] as const) {
      const created = createSandboxApprovalProposal(baseInput({ risk }));
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(`unreachable ${risk}`);
      const stored = createSandboxApprovalProposalRow(db, created.value);
      expect(stored.status).toBe("pending");
      expect(stored.authoritativeRiskClass).toBe(risk);
      const read = getSandboxApprovalProposalRow(db, stored.proposalId);
      expect(read).not.toBeNull();
      expect(read!.authoritativeRiskClass).toBe(risk);
      expect(read!.proposalId).toBe(stored.proposalId);
      expect(read!.entityUuid).toBe(stored.entityUuid);
    }
  });

  it("createProposal with high succeeds against a real migrated v19 database", () => {
    const db = openMigratedDb();
    const created = createSandboxApprovalProposal(baseInput({ risk: "high" }));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const stored = createSandboxApprovalProposalRow(db, created.value);
    expect(stored.authoritativeRiskClass).toBe("high");
    expect(stored.entityUuid).not.toBe("");
  });

  it("domain validator rejects a stale risk class (public)", () => {
    const created = createSandboxApprovalProposal(
      baseInput({ risk: "public" as never }),
    );
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.errorCode).toBe("approval_invalid_risk_class");
  });

  it("the DDL CHECK rejects a stale risk class (public)", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(MIGRATION_19_SANDBOX_APPROVAL_DDL);
    const insert = db.prepare(
      `INSERT INTO sandbox_approval_proposals (
        entity_uuid, owner_id, proposal_id, capability_id,
        authoritative_risk_class, policy_rule_id, policy_id, policy_version,
        policy_hash, persistence, source, status, created_at, updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    expect(() =>
      insert.run(
        "u1",
        "owner-1",
        "p-public",
        "approved_project_read",
        "public",
        "rule-1",
        "policy-1",
        1,
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "temporary",
        "policy_precheck",
        "pending",
        "2026-08-06T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z",
        "2026-08-06T01:00:00.000Z",
      ),
    ).toThrow(/CHECK constraint/);
  });

  it("migration DDL and runtime validator use the same risk vocabulary", () => {
    const canonical = ["low", "medium", "high", "consultation"] as const;
    const db = openMigratedDb();
    const acceptedByValidator = canonical.filter((risk) => {
      const created = createSandboxApprovalProposal(baseInput({ risk }));
      if (!created.ok) return false;
      try {
        createSandboxApprovalProposalRow(db, created.value);
        return true;
      } catch {
        return false;
      }
    });
    expect(acceptedByValidator).toEqual([...canonical]);
    expect(
      (
        db.prepare(
          "SELECT sql FROM sqlite_master WHERE name = 'sandbox_approval_proposals' AND type = 'table'",
        ).get() as { sql: string }
      ).sql,
    ).toMatch(/low.*medium.*high.*consultation/s);
  });
});
