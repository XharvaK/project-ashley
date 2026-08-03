import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { listIdentity, recordIdentityEntry } from "../identity/store.js";
import {
  applyEligibleRevisions,
  listRevisions,
  proposeRevision,
  reconcileUnsupportedRevisions,
  revertRevision,
} from "./revisions.js";

describe("bounded identity growth", () => {
  it("requires independent evidence and never applies in observe mode", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    recordIdentityEntry(db, {
      ownerId: "doc",
      layer: "dynamic",
      kind: "interest.modular_synthesis",
      text: "interested in sound design",
      source: "organic",
    });
    const base = {
      ownerId: "doc",
      targetLayer: "dynamic_identity" as const,
      targetKey: "interest.modular_synthesis",
      proposedValue: "curious about modular synthesis",
      rationale: "Repeated voluntary engagement.",
      evidenceType: "episode",
    };
    proposeRevision(db, { ...base, evidenceId: 1 });
    expect(applyEligibleRevisions(db, "doc", "apply")).toHaveLength(0);
    proposeRevision(db, { ...base, evidenceId: 2 });
    expect(applyEligibleRevisions(db, "doc", "observe")).toHaveLength(0);
    const [revisionId] = applyEligibleRevisions(db, "doc", "apply");
    expect(revisionId).toBeTypeOf("number");
    expect(
      listIdentity(db, "doc", { layer: "dynamic" })
        .some((entry) => entry.text === base.proposedValue),
    ).toBe(true);
    expect(revertRevision(db, "doc", revisionId!)).toBe(true);
    expect(
      listIdentity(db, "doc", { layer: "dynamic" })
        .some((entry) => entry.text === base.proposedValue),
    ).toBe(false);
    expect(
      listIdentity(db, "doc", { layer: "dynamic" })
        .some((entry) => entry.text === "interested in sound design"),
    ).toBe(true);
    db.close();
  });

  it("does not turn three same-day observations into stable identity", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const base = {
      ownerId: "doc",
      targetLayer: "stable_identity" as const,
      targetKey: "taste.modular_synthesis",
      proposedValue: "drawn to modular synthesis",
      rationale: "A possible durable taste.",
      evidenceType: "episode",
    };
    const id = proposeRevision(db, { ...base, evidenceId: 1 });
    proposeRevision(db, { ...base, evidenceId: 2 });
    proposeRevision(db, { ...base, evidenceId: 3 });
    db.prepare(
      "UPDATE learning_revisions SET apply_after = ? WHERE id = ?",
    ).run(new Date(0).toISOString(), id);
    expect(applyEligibleRevisions(db, "doc", "apply")).toHaveLength(0);
    db.close();
  });

  it("keeps a later supported revision visible when an earlier leaf loses evidence", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const baselineId = recordIdentityEntry(db, {
      ownerId: "doc",
      layer: "dynamic",
      kind: "interest.modular_synthesis",
      text: "interested in sound design",
      source: "manual",
    });
    const common = {
      ownerId: "doc",
      targetLayer: "dynamic_identity" as const,
      targetKey: "interest.modular_synthesis",
      rationale: "Repeated voluntary engagement.",
      evidenceType: "episode",
    };
    const firstId = proposeRevision(db, {
      ...common,
      proposedValue: "curious about modular synthesis",
      evidenceId: 1,
    });
    proposeRevision(db, {
      ...common,
      proposedValue: "curious about modular synthesis",
      evidenceId: 2,
    });
    expect(applyEligibleRevisions(db, "doc", "apply")).toContain(firstId);

    const secondId = proposeRevision(db, {
      ...common,
      proposedValue: "studying modular synthesis deeply",
      evidenceId: 3,
    });
    proposeRevision(db, {
      ...common,
      proposedValue: "studying modular synthesis deeply",
      evidenceId: 4,
    });
    expect(applyEligibleRevisions(db, "doc", "apply")).toContain(secondId);

    db.prepare(
      "DELETE FROM evidence_links WHERE target_type = 'revision' AND target_id = ?",
    ).run(String(firstId));
    expect(reconcileUnsupportedRevisions(db, "doc", [firstId])).toBe(1);

    const visible = listIdentity(db, "doc", { layer: "dynamic" })
      .filter((entry) => entry.kind === common.targetKey);
    expect(visible.at(-1)?.text).toBe("studying modular synthesis deeply");
    expect(visible.at(-1)?.revisedFrom).toBe(baselineId);
    const statuses = new Map(
      listRevisions(db, "doc").map((revision) => [revision.id, revision.status]),
    );
    expect(statuses.get(firstId)).toBe("reverted");
    expect(statuses.get(secondId)).toBe("applied");
    db.close();
  });

  it("uses indexed evidence and episode lookups", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const plan = db.prepare(
      `EXPLAIN QUERY PLAN
       SELECT COUNT(*)
       FROM evidence_links l
       LEFT JOIN episodes e
         ON l.source_type = 'episode' AND e.id = CAST(l.source_id AS INTEGER)
       WHERE l.owner_id = ? AND l.target_type = 'revision' AND l.target_id = ?`,
    ).all("doc", "1") as Array<{ detail: string }>;
    expect(plan.some((row) => /SEARCH l USING.*INDEX/i.test(row.detail))).toBe(true);
    expect(plan.some((row) => /SEARCH e USING INTEGER PRIMARY KEY/i.test(row.detail))).toBe(true);
    expect(plan.some((row) => /^SCAN (?:l|e)\b/i.test(row.detail))).toBe(false);
    db.close();
  });
});
