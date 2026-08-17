import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "./db.js";
import { recordIdentityEntry } from "./identity/store.js";
import { patchState } from "./state/store.js";
import { upsertMindStateItem } from "./state/mind-items.js";
import {
  mindStateHeadline,
  operationalWorkBlock,
  stableIdentityBlock,
} from "./context-composer.js";
import { persistCoordinatorTasks } from "./sandbox/engineering-runs.js";

const OWNER = "doc";

function makeDb(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

describe("stableIdentityBlock", () => {
  it("renders only value and principle entries, excluding trait, taste, and boundary kinds", () => {
    const db = makeDb();
    const block = stableIdentityBlock(db, OWNER);
    expect(block).toContain("## Ashley's stable identity");
    expect(block).toContain("value: accuracy over performance; say what is true");
    expect(block).not.toContain("trait:");
    expect(block).not.toContain("taste:");
    expect(block).not.toContain("boundary:");
    db.close();
  });

  it("excludes dynamic-layer and non-value kinds even within stable layer", () => {
    const db = makeDb();
    recordIdentityEntry(db, OWNER, "dynamic", "value", "Dynamic opinion");
    recordIdentityEntry(db, OWNER, "stable", "belief", "Stable belief entry");
    const block = stableIdentityBlock(db, OWNER);
    expect(block).not.toContain("Dynamic opinion");
    expect(block).not.toContain("Stable belief entry");
    db.close();
  });
});

describe("mindStateHeadline", () => {
  it("falls back to availability only when focus and mood are unset", () => {
    const db = makeDb();
    const headline = mindStateHeadline(db, OWNER);
    expect(headline).toContain("Availability: available");
    expect(headline).not.toContain("Focus:");
    expect(headline).not.toContain("Mood:");
    db.close();
  });

  it("joins focus, mood, and availability without state detail", () => {
    const db = makeDb();
    patchState(db, OWNER, {
      focus: "planning deployment",
      mood: "focused",
    });
    upsertMindStateItem(db, {
      ownerId: OWNER,
      kind: "concern",
      text: "long-range plan",
      sourceType: "episode",
      sourceId: "1",
    });
    const headline = mindStateHeadline(db, OWNER);
    expect(headline).toBe(
      "Focus: planning deployment | Mood: focused | Availability: available",
    );
    expect(headline).not.toContain("concern");
    expect(headline).not.toContain("Unfinished");
    db.close();
  });

  it("always carries availability even when focus and mood are cleared", () => {
    const db = makeDb();
    patchState(db, OWNER, { focus: null, mood: null });
    expect(mindStateHeadline(db, OWNER)).toBe("Availability: available");
    db.close();
  });
});

describe("operationalWorkBlock", () => {
  it("projects V2 succeeded with verified effect evidence without a coordinator task", () => {
    const db = makeDb();
    const block = operationalWorkBlock(db, OWNER, {
      operationalLicense: {
        state: "succeeded",
        taskId: "v2-m1-999",
        profile: "sandbox_workspace_file_roundtrip",
        effectEvidence: {
          verified: true,
          workspaceId: "ws-1",
          relativePath: "test.txt",
          bytesWritten: 12,
          contentHash: "hash-abc",
          readMatches: true,
          deleted: true,
          verifiedAbsent: true,
          completedAtMs: Date.now(),
        },
      },
    });
    expect(block).toContain("## Operational work state (cognitive attention only)");
    expect(block).toContain("Status: succeeded");
    expect(block).toContain("Profile: sandbox_workspace_file_roundtrip");
    expect(block).toContain("Task ID: v2-m1-999");
    expect(block).toContain("Effect evidence: roundtrip verified (temporary file created, exact bytes verified on read, file deleted, verified absent).");
    expect(block).toContain("Current operational truth: verified_success (authoritative current-turn result; overrides generic capability self-model).");
    db.close();
  });

  it("projects V2 failed with exact error code without a coordinator task", () => {
    const db = makeDb();
    const block = operationalWorkBlock(db, OWNER, {
      operationalLicense: {
        state: "failed",
        taskId: "v2-m1-888",
        profile: "sandbox_workspace_file_roundtrip",
        error: "internal_error",
      },
    });
    expect(block).toContain("Status: failed");
    expect(block).toContain("Profile: sandbox_workspace_file_roundtrip");
    expect(block).toContain("Task ID: v2-m1-888");
    expect(block).toContain("Error: internal_error");
    db.close();
  });

  it("fails closed with non-licensing wording when succeeded evidence is unverified / malformed", () => {
    const db = makeDb();
    const block = operationalWorkBlock(db, OWNER, {
      operationalLicense: {
        state: "succeeded",
        taskId: "v2-m1-777",
        profile: "sandbox_workspace_file_roundtrip",
        effectEvidence: {
          verified: true,
          workspaceId: "ws-1",
          relativePath: "test.txt",
          bytesWritten: 12,
          contentHash: "hash-abc",
          readMatches: false, // malformed / unverified!
          deleted: true,
          verifiedAbsent: true,
          completedAtMs: Date.now(),
        },
      },
    });
    expect(block).toContain("Status: succeeded");
    expect(block).toContain("Effect evidence: unverified (state is succeeded; verified effect evidence is unavailable; no completion licensed).");
    expect(block).not.toContain("roundtrip verified (temporary file created");
    db.close();
  });

  it("preserves legacy V1 coordinator task rendering when task exists in engineering_runs", () => {
    const db = makeDb();
    const now = Date.now();
    persistCoordinatorTasks(db, [
      {
        taskId: "eng-task-100",
        owner: OWNER,
        projectId: null,
        sourceBaseCommit: null,
        admissionCause: "user_request",
        groundingRefs: [],
        profile: "sandbox_workspace_file_roundtrip",
        status: "completed",
        workspaceId: "ws-100",
        modelCallsUsed: 1,
        toolCallsUsed: 2,
        startedAtMs: now - 1000,
        deadlineMs: now + 5000,
        completedAtMs: now,
        error: null,
        refusal: null,
        candidatePatchRef: null,
        candidateCommitRef: null,
        artifactRefs: [],
        effectEvidence: {
          verified: true,
          workspaceId: "ws-100",
          relativePath: "test.txt",
          bytesWritten: 10,
          contentHash: "hash-100",
          readMatches: true,
          deleted: true,
          verifiedAbsent: true,
          completedAtMs: now,
        },
      },
    ]);

    const block = operationalWorkBlock(db, OWNER, {
      operationalLicense: {
        state: "succeeded",
        taskId: "eng-task-100",
        profile: "sandbox_workspace_file_roundtrip",
      },
    });
    expect(block).toContain("Status: completed");
    expect(block).toContain("Task ID: eng-task-100");
    expect(block).toContain("Effect evidence: roundtrip verified");
    db.close();
  });

  it("returns empty when non-roundtrip profile has no coordinator task", () => {
    const db = makeDb();
    const block = operationalWorkBlock(db, OWNER, {
      operationalLicense: {
        state: "succeeded",
        taskId: "other-task-1",
        profile: "build_regression",
      },
    });
    expect(block).toBe("");
    db.close();
  });
});
