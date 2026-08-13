import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import {
  claimNextPendingAdmission,
  engineeringStatusSnapshot,
  ensureEngineeringTables,
  getEngineeringActivationEpochMs,
  persistCoordinatorTasks,
  setEngineeringActivationEpochMs,
} from "./engineering-runs.js";
import {
  claimWeeklyReviewDelivery,
} from "./weekly-review-delivery.js";
import type { CandidateCommitRecord } from "./self-improvement.js";
import type { SandboxTaskProfile } from "./engineering-types.js";

function openTestDb(): DatabaseSync {
  const db = openNuclearDb(new DatabaseSync(":memory:"));
  ensureEngineeringTables(db);
  return db;
}

function seedAdmission(
  db: DatabaseSync,
  id: string,
  createdAtMs: number,
  status: "pending" | "dispatched" = "pending",
): void {
  db.prepare(
    `INSERT INTO engineering_admissions
       (id, owner_id, objective, project_id, profile, grounding_refs_json,
        source_kind, source_ref, status, created_at_ms)
     VALUES (?, 'doc', ?, NULL, ?, '[]', 'open_cognitive_item', ?, ?, ?)`,
  ).run(id, `objective-${id}`, "project_investigation" as SandboxTaskProfile, id, status, createdAtMs);
}

function sampleCandidate(): CandidateCommitRecord {
  return {
    sha: "a".repeat(40),
    parentSha: "b".repeat(40),
    title: "status join-proof",
    problem: "verify the status surface",
    whyImportant: "operator needs one glance",
    filesChanged: ["apps/agent-service/src/index.ts"],
    diffStat: "1 file changed",
    testsRun: ["vitest"],
    testResults: "passed",
    knownLimitations: "none",
    remainingUncertainty: "low",
    securityImpact: "none",
    touchesSandboxSecurity: false,
    touchesDependencyManifest: false,
    touchesMigration: false,
    touchesBehavior: true,
    ownerReviewFocus: "none",
  };
}

describe("engineering status snapshot (join-proof surface)", () => {
  it("reports no epoch and zero eligibility before activation", () => {
    const db = openTestDb();
    seedAdmission(db, "adm-1", 1_000, "pending");
    const snapshot = engineeringStatusSnapshot(db, "doc");
    expect(getEngineeringActivationEpochMs(db)).toBeNull();
    expect(snapshot.activationEpochMs).toBeNull();
    expect(snapshot.pendingAdmissions).toBe(1);
    expect(snapshot.eligiblePendingAdmissions).toBe(0);
    expect(snapshot.activeCoordinatorRuns).toBe(0);
    expect(snapshot.weeklyReviewDeliveriesPending).toBe(0);
  });

  it("counts eligible pending admissions only at or after the epoch", () => {
    const db = openTestDb();
    const epoch = 5_000;
    seedAdmission(db, "adm-pre", epoch - 100, "pending");
    seedAdmission(db, "adm-at", epoch, "pending");
    seedAdmission(db, "adm-post", epoch + 100, "pending");
    seedAdmission(db, "adm-done", epoch + 200, "dispatched");
    setEngineeringActivationEpochMs(db, epoch);

    const snapshot = engineeringStatusSnapshot(db, "doc");
    expect(snapshot.activationEpochMs).toBe(epoch);
    expect(snapshot.pendingAdmissions).toBe(3);
    expect(snapshot.eligiblePendingAdmissions).toBe(2);

    const claimed = claimNextPendingAdmission(db, epoch);
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe("adm-at");
  });

  it("never claims pre-epoch historical admissions (epoch gate coherence)", () => {
    const db = openTestDb();
    const epoch = 5_000;
    seedAdmission(db, "adm-pre", epoch - 100, "pending");
    setEngineeringActivationEpochMs(db, epoch);
    expect(claimNextPendingAdmission(db, epoch)).toBeNull();
    expect(engineeringStatusSnapshot(db, "doc").eligiblePendingAdmissions).toBe(0);
  });

  it("counts active coordinator runs", () => {
    const db = openTestDb();
    persistCoordinatorTasks(db, [
      { taskId: "t-1", status: "running" } as never,
      { taskId: "t-2", status: "admitted" } as never,
      { taskId: "t-3", status: "completed" } as never,
    ]);
    expect(engineeringStatusSnapshot(db, "doc").activeCoordinatorRuns).toBe(2);
  });

  it("counts pending weekly review deliveries", () => {
    const db = openTestDb();
    claimWeeklyReviewDelivery(db, {
      ownerId: "doc",
      reportRef: "weekly-review-status",
      candidate: sampleCandidate(),
    });
    const snapshot = engineeringStatusSnapshot(db, "doc");
    expect(snapshot.weeklyReviewDeliveriesPending).toBe(1);
  });
});
