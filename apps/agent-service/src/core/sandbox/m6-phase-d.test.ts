import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { M6_MAX_STEPS, type SandboxV2Dispatcher, type SandboxV2Result } from "@composer-assistant/sandbox-v2";
import { V2ProjectReadRegistry } from "@composer-assistant/sandbox-v2";
import { openNuclearDb } from "../db.js";
import {
  capabilityCanInfluence,
  currentBuildIdentity,
  currentContractId,
  graduationPolicyFor,
} from "../rollout/capabilities.js";
import { canOfferBoundedOperation } from "./project-registry.js";
import { executeBoundedOperationV2 } from "./bounded-operation-execution.js";
import { parseBoundedOperationRequest } from "../agency/thought.js";
import { deriveOperationalTruth } from "./operational-truth.js";
import { finalizeHonesty } from "../honesty/finalize.js";
import { requestBoundedOperationCancel } from "./bounded-operation-store.js";
import type { CognitionBoundedOperationRequest } from "../types.js";

const HASH = "ab".repeat(32);

function entry(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project-ashley",
    canonicalRoot: "/home/xarvak/project-ashley",
    displayName: "Ashley",
    enabled: true,
    readAllowed: true,
    candidateWorkspaceAllowed: true,
    engineeringAllowed: false,
    verificationAllowed: true,
    allowedRecipeIds: ["typescript_fixture_compile_v1"],
    authorshipAllowed: true,
    operationAllowed: true,
    ...overrides,
  };
}

function activate(db: DatabaseSync, names: readonly string[]): void {
  const relId = currentContractId();
  const now = new Date().toISOString();
  for (const cap of names) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

const CHILD_CAPS = [
  "recall",
  "mind_state",
  "thought",
  "project_experimentation",
  "candidate_verification",
  "candidate_authorship",
  "bounded_operation",
] as const;

function operateRequest(
  overrides: Partial<CognitionBoundedOperationRequest> = {},
): CognitionBoundedOperationRequest {
  return {
    operation: "objective.operate",
    projectId: "project-ashley",
    workspaceId: "ws-m6-01ab",
    origin: "owner_request",
    objective: "write, verify, and seal a bounded candidate edit",
    successCondition: "admitted steps complete",
    failureCondition: "any step fails",
    steps: [
      {
        kind: "candidate_workspace_experiment",
        request: {
          version: 2,
          operation: "workspace.write_file",
          projectId: "project-ashley",
          workspaceId: "ws-m6-01ab",
          path: "src/a.ts",
          content: "export const n = 1;\n",
          mustNotExist: true,
        },
      },
      {
        kind: "candidate_verification",
        request: {
          operation: "workspace.verify",
          projectId: "project-ashley",
          workspaceId: "ws-m6-01ab",
          recipeId: "typescript_fixture_compile_v1",
        },
      },
      {
        kind: "candidate_authorship",
        request: {
          operation: "changeset.author",
          projectId: "project-ashley",
          workspaceId: "ws-m6-01ab",
          objective: "seal the candidate",
          rationale: "the admitted sequence asked for a sealed advisory change-set",
          riskClass: "low",
        },
      },
    ],
    budget: {
      maxSteps: 3,
      deadlineAtMs: Date.now() + 60_000,
    },
    ...overrides,
  };
}

function mockDispatch(operation: string): SandboxV2Result {
  const executedAtMs = 42;
  if (operation === "workspace.write_file") {
    return {
      outcome: "succeeded",
      operation,
      workspaceId: "ws-m6-01ab",
      sourceSnapshotId: "snap_src",
      result: {
        kind: "workspace.write_file",
        path: "src/a.ts",
        bytesWritten: 20,
        contentHash: HASH,
        readMatches: true,
        deleted: false,
        verifiedAbsent: false,
        completedAtMs: executedAtMs,
      },
      executedAtMs,
    };
  }
  if (operation === "workspace.verify") {
    const receipt = {
      kind: "workspace.verify" as const,
      snapshotId: "vsnap_live_1",
      workspaceId: "ws-m6-01ab",
      projectId: "project-ashley",
      candidateTreeHash: HASH,
      candidateTreeHashAfter: HASH,
      sourceSnapshotId: "snap_src",
      treeHashAlgorithm: "m4-provisional-tree-v0",
      recipeId: "typescript_fixture_compile_v1",
      recipeVersion: "1",
      recipeDefinitionHash: HASH,
      executableIdentity: "/usr/bin/tsc",
      argvIdentity: "--noEmit",
      protocolState: "admitted" as const,
      verificationOutcome: "verified_success" as const,
      exitCode: 0,
      timedOut: false,
      stdoutTruncated: false,
      stderrTruncated: false,
      stdoutSha256: HASH,
      stderrSha256: HASH,
      cleanupCompleted: true,
      projectionDiscarded: true,
      candidateUnchanged: true,
    };
    return {
      outcome: "succeeded",
      operation,
      result: receipt,
      verificationReceipt: receipt,
      executedAtMs,
    };
  }
  const receipt = {
    kind: "changeset.author" as const,
    changesetId: "cs_" + "22".repeat(16),
    changesetVersion: 1 as const,
    projectId: "project-ashley",
    workspaceId: "ws-m6-01ab",
    snapshotId: "vsnap_live_1",
    sourceSnapshotId: "snap_src",
    candidateTreeHash: HASH,
    baseTreeHash: "cd".repeat(32),
    baseCommit: null,
    sourceCleanliness: "unknown" as const,
    treeHashAlgorithm: "m4-provisional-tree-v0",
    changedPaths: [
      {
        path: "src/a.ts",
        changeKind: "modified" as const,
        beforeSha256: HASH,
        afterSha256: "ef".repeat(32),
      },
    ],
    patchSha256: HASH,
    patchBytes: 32,
    artifactRef: "/tmp/sealed.patch",
    candidateUnchanged: true as const,
    liveUnwritten: true as const,
    protocolState: "admitted" as const,
    completedAtMs: executedAtMs,
  };
  return {
    outcome: "succeeded",
    operation: "changeset.author",
    result: receipt,
    executedAtMs,
  };
}

describe("M6 Phase D authority + bounds", () => {
  it("uses operator_cutover for bounded_operation", () => {
    expect(graduationPolicyFor("bounded_operation")).toEqual({
      kind: "operator_cutover",
      minEvalSeeds: 3,
      requiresQualification: true,
    });
  });

  it("observe/disabled capability refuses and does not dispatch children", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const registry = new V2ProjectReadRegistry([entry()]);
    expect(
      canOfferBoundedOperation(db, {
        registry,
        masterMode: "apply",
        substrateAvailable: true,
        lifecycleEnabled: true,
      }),
    ).toBe(false);
    let dispatches = 0;
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async (request: { operation: string }) => {
          dispatches += 1;
          return mockDispatch(request.operation);
        },
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(dispatches).toBe(0);
    expect(result.license.error).toBe("bounded_operation_gate_denied");
    db.close();
  });

  it("authorshipAllowed and M5 capability do not grant M6", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, ["recall", "mind_state", "thought", "candidate_authorship"]);
    expect(capabilityCanInfluence(db, "candidate_authorship", "apply")).toBe(true);
    expect(capabilityCanInfluence(db, "bounded_operation", "apply")).toBe(false);
    const registry = new V2ProjectReadRegistry([
      entry({ authorshipAllowed: true, operationAllowed: false }),
    ]);
    expect(
      canOfferBoundedOperation(db, {
        registry,
        masterMode: "apply",
        substrateAvailable: true,
        lifecycleEnabled: true,
      }),
    ).toBe(false);
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async () => mockDispatch("changeset.author"),
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(result.license.error).toBe("bounded_operation_gate_denied");
    db.close();
  });

  it("operationAllowed=false refuses even when all child grants are true", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([entry({ operationAllowed: false })]);
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async () => mockDispatch("workspace.write_file"),
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(result.license.error).toBe("bounded_operation_not_allowed");
    db.close();
  });

  it("refuses continueUntilSolved at parse", () => {
    const parsed = parseBoundedOperationRequest({
      ...operateRequest(),
      continueUntilSolved: true,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toBe("continueUntilSolved");
  });

  it("refuses a ceiling above the hard bound", () => {
    const parsed = parseBoundedOperationRequest({
      ...operateRequest(),
      budget: { maxSteps: M6_MAX_STEPS + 1, deadlineAtMs: Date.now() + 1000 },
    });
    expect(parsed.ok).toBe(false);
  });

  it("refuses an M7 patch_export step", () => {
    const parsed = parseBoundedOperationRequest({
      ...operateRequest(),
      steps: [
        { kind: "patch_export", request: { operation: "patch_export" } },
      ],
      budget: { maxSteps: 1, deadlineAtMs: Date.now() + 1000 },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toContain("kind");
  });

  it("refuses apply, git, export, and continueUntilSolved fields", () => {
    for (const field of ["apply", "git", "export", "destination", "continueUntilSolved"]) {
      const parsed = parseBoundedOperationRequest({
        ...operateRequest(),
        [field]: true,
      });
      expect(parsed.ok).toBe(false);
    }
  });

  it("refuses a wall budget beyond the hard bound", () => {
    const parsed = parseBoundedOperationRequest({
      ...operateRequest(),
      budget: { maxSteps: 3, deadlineAtMs: Date.now() + 16 * 60 * 1000 },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toBe("budget.deadlineAtMs");
  });

  it("refuses a step count that does not match maxSteps", () => {
    const parsed = parseBoundedOperationRequest({
      ...operateRequest(),
      budget: { maxSteps: 2, deadlineAtMs: Date.now() + 1000 },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toBe("budget.maxSteps");
  });

  it("runs an admitted M3→M4→M5 sequence and locks honesty to performed operations only", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([entry()]);
    const operations: string[] = [];
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async (request: { operation: string }) => {
          operations.push(request.operation);
          return mockDispatch(request.operation);
        },
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(result.license.error).toBeNull();
    expect(result.license.state).toBe("succeeded");
    expect(result.license.boundedOperationClaimEffect?.borderState).toBe("none");
    expect(result.license.boundedOperationClaimEffect?.applied).toBe(false);
    expect(result.license.boundedOperationClaimEffect?.exported).toBe(false);
    expect(result.license.boundedOperationClaimEffect?.stepsExecuted).toBe(3);
    expect(operations).toEqual(["workspace.write_file", "workspace.verify", "changeset.author"]);
    const sealed = db
      .prepare(`SELECT status AS status FROM candidate_changesets`)
      .get() as { status: string } | undefined;
    expect(sealed?.status).toBe("proposed");
    expect(sealed?.status).not.toBe("applied");
    const truth = deriveOperationalTruth(result.license);
    expect(truth.locked).toBe(true);
    expect(truth.semanticOutput).toContain("no border effect was performed");
    const floored = finalizeHonesty({
      text: "I applied the patch to Ashley.",
      readingLicensed: false,
      operationalLicense: result.license,
    });
    expect(floored.text).toContain("no border effect was performed");
    expect(floored.text).not.toMatch(/applied the patch/i);
    db.close();
  });

  it("stops on child failure and does not continue", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([entry()]);
    const operations: string[] = [];
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async (request: { operation: string }) => {
          operations.push(request.operation);
          if (request.operation === "workspace.verify") {
            return {
              outcome: "failed",
              operation: request.operation,
              error: "recipe_not_allowed",
              executedAtMs: 1,
            };
          }
          return mockDispatch(request.operation);
        },
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(operations).toEqual(["workspace.write_file", "workspace.verify"]);
    expect(result.license.state).toBe("failed");
    expect(result.license.boundedOperationClaimEffect?.stepsExecuted).toBe(2);
    expect(result.license.boundedOperationClaimEffect?.stopReason).toBe("step_failed");
    db.close();
  });

  it("stops when the deadline is already exhausted", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([entry()]);
    const result = await executeBoundedOperationV2({
      request: operateRequest({
        budget: { maxSteps: 3, deadlineAtMs: Date.now() - 1 },
      }),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async () => mockDispatch("workspace.write_file"),
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(result.license.error).toBe("deadline_exceeded");
    db.close();
  });

  it("cancel stops before the next step", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([entry()]);
    let taskId = "";
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async (request: { operation: string }) => {
          if (!taskId) {
            const row = db
              .prepare(`SELECT task_id AS taskId FROM bounded_operation_tasks`)
              .get() as { taskId: string };
            taskId = row.taskId;
            requestBoundedOperationCancel(db, taskId);
          }
          return mockDispatch(request.operation);
        },
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(result.license.boundedOperationClaimEffect?.stopReason).toBe("cancelled");
    expect(result.license.boundedOperationClaimEffect?.stepsExecuted).toBe(1);
    db.close();
  });

  it("child verification grant remains independent inside an admitted M6 task", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([
      entry({ verificationAllowed: false, operationAllowed: true }),
    ]);
    const operations: string[] = [];
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async (request: { operation: string }) => {
          operations.push(request.operation);
          return mockDispatch(request.operation);
        },
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(operations).toEqual(["workspace.write_file"]);
    expect(result.license.boundedOperationClaimEffect?.stopReason).toBe("authority_lost");
    db.close();
  });

  it("engineeringAllowed does not grant M6", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([
      entry({ engineeringAllowed: true, operationAllowed: false }),
    ]);
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async () => mockDispatch("workspace.write_file"),
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(result.license.error).toBe("bounded_operation_not_allowed");
    db.close();
  });

  it("child authorship gate remains independent inside an admitted M6 task", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activate(db, CHILD_CAPS);
    const registry = new V2ProjectReadRegistry([
      entry({ authorshipAllowed: false, operationAllowed: true }),
    ]);
    const operations: string[] = [];
    const result = await executeBoundedOperationV2({
      request: operateRequest(),
      ownerId: "doc",
      db,
      masterMode: "apply",
      registry,
      dispatcher: {
        dispatch: async (request: { operation: string }) => {
          operations.push(request.operation);
          return mockDispatch(request.operation);
        },
      } as unknown as SandboxV2Dispatcher,
      envOverrides: { sandboxEngineeringLifecycleEnabled: true },
    });
    expect(operations).toEqual(["workspace.write_file", "workspace.verify"]);
    expect(result.license.boundedOperationClaimEffect?.stopReason).toBe("authority_lost");
    db.close();
  });
});
