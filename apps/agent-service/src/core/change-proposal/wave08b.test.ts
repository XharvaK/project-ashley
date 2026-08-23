import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { openContinuityDb } from "../continuity/db.js";

function openTestDb(): DatabaseSync {
  const continuity = openContinuityDb(new DatabaseSync(":memory:"));
  return openNuclearDb(new DatabaseSync(":memory:"), { continuity });
}import {
  createChangeProposal,
  listChangeProposalEvents,
  listChangeProposals,
} from "./store.js";
import {
  markStaleBase,
  proposeChange,
  quarantineProposal,
  recordAshleyPosition,
  recordDocDecision,
  transitionProposal,
} from "./lifecycle.js";
import { routingPolicy, docDecisionAuthorizesBroker } from "./routing.js";
import { scanProposalText } from "./secret-guard.js";
import { deriveVerified } from "./verification.js";
import { sanitizeEventPayload } from "./events.js";
import { rejectUnsafePatch } from "./source/patch-guard.js";
import { compareBase } from "./source/stale-base.js";
import { validateArchiveSize } from "./source/archive.js";
import { buildArchiveManifest } from "./source/workflow.js";
import { recordExternalOutcome } from "./lifecycle.js";
import { TARGETABLE_TABLES } from "../continuity/nuclear-targetable.js";

function schemaVersion(db: DatabaseSync): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
}

describe("wave08b change proposals", () => {
  it("migrates fresh database to v16 with proposal tables", () => {
    const db = openTestDb();
    expect(schemaVersion(db)).toBe(30);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN ('change_proposals', 'change_proposal_events')
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual([
      "change_proposal_events",
      "change_proposals",
    ]);
    const proposalCols = db
      .prepare(`PRAGMA table_info(change_proposals)`)
      .all() as Array<{ name: string }>;
    expect(proposalCols.some((col) => col.name === "entity_uuid")).toBe(true);
    expect(proposalCols.some((col) => col.name === "data_classification")).toBe(true);
    db.close();
  });

  it("routes ordinary identity to revisions path without doc decision requirement", () => {
    const policy = routingPolicy("ordinary_identity");
    expect(policy.routeToRevisions).toBe(true);
    expect(policy.requiresDocDecision).toBe(false);
    expect(policy.mayAutoApply).toBe(false);
  });

  it("routes foundational identity to identity review link", () => {
    const policy = routingPolicy("foundational_identity");
    expect(policy.routeToIdentityReview).toBe(true);
    expect(policy.requiresAshleyPosition).toBe(true);
  });

  it("records lifecycle transitions with metadata-only events", () => {
    const db = openTestDb();
    const expires = new Date(Date.now() + 60_000).toISOString();
    const proposal = createChangeProposal(db, {
      ownerId: "owner-1",
      proposer: "ashley",
      targetCategory: "runtime_code",
      objective: "Tighten broker receipt checks",
      rationale: "Reduce false verified claims",
      riskClass: "low",
      expiresAt: expires,
    });
    expect(proposeChange(db, "owner-1", proposal.entityUuid, "ashley").ok).toBe(true);
    expect(
      recordDocDecision(db, "owner-1", proposal.entityUuid, "approve", "doc").ok,
    ).toBe(true);
    const events = listChangeProposalEvents(db, "owner-1", proposal.entityUuid);
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toMatch(/BEGIN PRIVATE KEY/);
    const latest = listChangeProposals(db, "owner-1")[0];
    expect(latest?.state).toBe("approved");
    expect(docDecisionAuthorizesBroker("approve")).toBe(false);
    db.close();
  });

  it("quarantines secret-shaped objective fail-closed", () => {
    const db = openTestDb();
    const expires = new Date(Date.now() + 60_000).toISOString();
    const proposal = createChangeProposal(db, {
      ownerId: "owner-1",
      proposer: "ashley",
      targetCategory: "runtime_code",
      objective: "noop",
      rationale: "noop",
      riskClass: "low",
      expiresAt: expires,
    });
    expect(
      scanProposalText({ objective: "token ghp_abcdefghijklmnopqrstuvwxyz1234567890" }).ok,
    ).toBe(false);
    expect(
      quarantineProposal(db, "owner-1", proposal.entityUuid, "secret_detected", "guard").ok,
    ).toBe(true);
    db.close();
  });

  it("marks stale base on commit or tree drift", () => {
    expect(
      compareBase(
        { baseCommit: "abc", baseTreeHash: "tree" },
        { baseCommit: "abc", baseTreeHash: "other" },
      ),
    ).toBe(false);
    const db = openTestDb();
    const proposal = createChangeProposal(db, {
      ownerId: "owner-1",
      proposer: "ashley",
      targetCategory: "runtime_code",
      objective: "x",
      rationale: "y",
      riskClass: "low",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      baseCommit: "abc",
      baseTreeHash: "tree",
    });
    expect(proposeChange(db, "owner-1", proposal.entityUuid, "ashley").ok).toBe(true);
    expect(
      markStaleBase(db, "owner-1", proposal.entityUuid, "guard", "def", "other").ok,
    ).toBe(true);
    db.close();
  });

  it("rejects unsafe patch paths", () => {
    expect(
      rejectUnsafePatch("--- a/.env\n+++ b/.env\n").ok,
    ).toBe(false);
    expect(
      rejectUnsafePatch("--- a/README.md\n+++ b/README.md\n@@\n+ok\n").ok,
    ).toBe(true);
  });

  it("derives verified only from broker receipt evidence", () => {
    expect(
      deriveVerified({
        brokerState: "succeeded",
        exitCode: 0,
        recipeId: "verify:agent-tsc",
        receiptArtifactHash: "abc",
        storedArtifactHash: "abc",
      }).verified,
    ).toBe(true);
    expect(
      deriveVerified({
        brokerState: "unsupported",
        exitCode: 0,
        recipeId: "verify:repo-tsc",
        receiptArtifactHash: "abc",
        storedArtifactHash: "abc",
      }).verifyStatus,
    ).toBe("unsupported");
  });

  it("rejects forbidden event payload keys", () => {
    expect(() =>
      sanitizeEventPayload({ rawPatch: "secret" } as Record<string, unknown>),
    ).toThrow(/forbidden_event_payload_key/);
  });

  it("treats archive limits as explicit state", () => {
    expect(validateArchiveSize(51 * 1024 * 1024).ok).toBe(false);
  });

  it("requires separate ashley position before doc decision when consultation applies", () => {
    const db = openTestDb();
    const proposal = createChangeProposal(db, {
      ownerId: "owner-1",
      proposer: "ashley",
      targetCategory: "vision",
      objective: "clarify scope",
      rationale: "consult",
      riskClass: "consultation",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      consultationRequired: true,
    });
    expect(proposeChange(db, "owner-1", proposal.entityUuid, "ashley").ok).toBe(true);
    expect(
      recordAshleyPosition(db, "owner-1", proposal.entityUuid, "affirm", "ashley").ok,
    ).toBe(true);
    db.close();
  });

  it("registers proposal tables for exact forget targeting", () => {
    const tables = TARGETABLE_TABLES.map((entry) => entry.table);
    expect(tables).toContain("change_proposals");
    expect(tables).toContain("change_proposal_events");
  });

  it("excludes unsafe archive paths and enforces aggregate size", () => {
    const manifest = buildArchiveManifest([
      { relativePath: "src/index.ts", bytes: Buffer.from("ok") },
      { relativePath: "node_modules/pkg/index.js", bytes: Buffer.from("no") },
    ]);
    expect(manifest.excludedPathCount).toBe(1);
    expect(() =>
      buildArchiveManifest([
        { relativePath: "big.bin", bytes: Buffer.alloc(51 * 1024 * 1024) },
      ]),
    ).toThrow("archive_too_large");
  });

  it("records external outcome only from approved state", () => {
    const db = openTestDb();
    const proposal = createChangeProposal(db, {
      ownerId: "owner-1",
      proposer: "ashley",
      targetCategory: "runtime_code",
      objective: "x",
      rationale: "y",
      riskClass: "low",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(
      recordExternalOutcome(db, "owner-1", proposal.entityUuid, "committed", "doc").ok,
    ).toBe(false);
    expect(proposeChange(db, "owner-1", proposal.entityUuid, "ashley").ok).toBe(true);
    expect(
      recordDocDecision(db, "owner-1", proposal.entityUuid, "approve", "doc").ok,
    ).toBe(true);
    expect(
      recordExternalOutcome(db, "owner-1", proposal.entityUuid, "committed", "doc").ok,
    ).toBe(true);
    db.close();
  });
});
