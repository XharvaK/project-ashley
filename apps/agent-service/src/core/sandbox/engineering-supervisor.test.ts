import { describe, expect, it, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

// No real policy/crypto in unit tests: stub the trust-anchor + envelope layer.
vi.mock("./engineering-envelope.js", () => ({
  REQUIRED_ENGINEERING_POLICY_IDENTITY: { policyId: "x", policyVersion: 1 },
  loadEngineeringTrustAnchors: () => ({
    policy: {} as never,
    policyHash: "h",
    delegatedKey: { keyId: "k", privateKeyPem: "p", publicKeyPem: "pub" },
    ownerId: "doc",
  }),
  createEngineeringEnvelopeProvider:
    () =>
    () =>
      ({}) as never,
}));
import {
  runEngineeringSupervisorTick,
  resetEngineeringSupervisor,
  type EngineeringSupervisorDeps,
} from "./engineering-supervisor.js";
import {
  ensureEngineeringTables,
  recordPendingEngineeringAdmission,
  setEngineeringActivationEpochMs,
  claimNextPendingAdmission,
  loadCoordinatorTasks,
  persistCoordinatorTasks,
  ENGINEERING_MAX_CONCURRENCY,
} from "./engineering-runs.js";
import { SandboxEngineeringCoordinator, type CoordinatorConfig } from "./coordinator.js";
import type {
  EngineeringExecutionPort,
  EngineeringToolResult,
  SandboxTaskProfile,
  ThinkingModel,
} from "./engineering-types.js";

const EMPTY_ROOTS = {
  projectRoots: [],
  candidateRepoRoot: "",
  workspaceRoots: [],
};

function scriptedModel(action: unknown): ThinkingModel {
  return {
    route: "thinking",
    async proposeNextAction() {
      return action;
    },
  };
}

function okPort(): EngineeringExecutionPort {
  return {
    async executeAction(): Promise<EngineeringToolResult> {
      return { ok: true, data: { ok: true }, artifactRef: null };
    },
    async agentRestart(): Promise<EngineeringToolResult> {
      return { ok: true, data: { restarted: true }, artifactRef: null };
    },
  };
}

function baseDeps(db: DatabaseSync, over: Partial<EngineeringSupervisorDeps> = {}): EngineeringSupervisorDeps {
  return {
    db,
    ownerId: "doc",
    nowMs: () => 1000,
    modelFactory: () => scriptedModel({ type: "complete", fields: {} }),
    portFactory: () => okPort(),
    resolveRoots: () => EMPTY_ROOTS,
    onCompleted: () => undefined,
    onRefused: () => undefined,
    ...over,
  };
}

describe("engineering supervisor (production wiring)", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(
      "CREATE TABLE IF NOT EXISTS runtime_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    ensureEngineeringTables(db);
    resetEngineeringSupervisor();
    setEngineeringActivationEpochMs(db, 1);
  });

  it("refuses to dispatch when no activation epoch is set (fail-closed)", async () => {
    const fresh = new DatabaseSync(":memory:");
    fresh.exec(
      "CREATE TABLE IF NOT EXISTS runtime_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    ensureEngineeringTables(fresh);
    const res = await runEngineeringSupervisorTick(baseDeps(fresh));
    expect(res.ran).toBe(false);
    expect(res.reason).toBe("no_activation_epoch");
  });

  it("ignores pre-activation historical admissions", () => {
    recordPendingEngineeringAdmission(db, {
      ownerId: "doc",
      objective: "legacy",
      projectId: null,
      profile: "project_investigation" as SandboxTaskProfile,
      groundingRefs: [],
      source: { kind: "open_cognitive_item", ref: "old-1" },
      autonomous: true,
    });
    // Epoch set into the future => the just-recorded admission is pre-cutover.
    const epoch = Date.now() + 1_000_000;
    setEngineeringActivationEpochMs(db, epoch);
    expect(claimNextPendingAdmission(db, epoch)).toBeNull();
  });

  it("dispatches a grounded pending admission to completion", async () => {
    let completedTaskId: string | null = null;
    recordPendingEngineeringAdmission(db, {
      ownerId: "doc",
      objective: "investigate flaky test",
      projectId: null,
      profile: "proactive_bug_investigation" as SandboxTaskProfile,
      groundingRefs: ["mind-state:9"],
      source: { kind: "open_cognitive_item", ref: "9" },
      autonomous: true,
    });
    const res = await runEngineeringSupervisorTick(
      baseDeps(db, {
        onCompleted: (r) => {
          completedTaskId = r.taskId;
        },
      }),
    );
    expect(res.ran).toBe(true);
    expect(res.reason).toBe("completed");
    expect(completedTaskId).not.toBeNull();
  });

  it("recovers a crashed running task as outcome_unknown and never re-dispatches", async () => {
    const config: CoordinatorConfig = {
      owner: "doc",
      budgets: { maxModelCalls: 24, maxToolExecutions: 48, maxWallMs: 1000 },
      availableDiagnostics: [],
      nowMs: () => 1000,
      persist: (tasks) => persistCoordinatorTasks(db, tasks),
    };
    const coord = new SandboxEngineeringCoordinator(scriptedModel({ type: "complete", fields: {} }), okPort(), config);
    const task = coord.admit({
      objective: "x",
      projectId: null,
      admissionCause: "proactive",
      profile: "project_investigation" as SandboxTaskProfile,
      groundingRefs: [],
    });
    // Simulate a crash mid-run: persisted as running.
    const running = coord.list();
    running[0]!.status = "running";
    persistCoordinatorTasks(db, running);
    resetEngineeringSupervisor();

    const res = await runEngineeringSupervisorTick(baseDeps(db));
    // No pending admission => nothing to start; recovery already applied.
    expect(res.ran).toBe(false);
    const recovered = loadCoordinatorTasks(db);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.status).toBe("outcome_unknown");
    expect(recovered[0]!.taskId).toBe(task.taskId);
  });

  it("does not record a duplicate pending admission for the same grounded source", () => {
    const a = recordPendingEngineeringAdmission(db, {
      ownerId: "doc",
      objective: "x",
      projectId: null,
      profile: "project_investigation" as SandboxTaskProfile,
      groundingRefs: [],
      source: { kind: "open_cognitive_item", ref: "dup" },
      autonomous: true,
    });
    const b = recordPendingEngineeringAdmission(db, {
      ownerId: "doc",
      objective: "y",
      projectId: null,
      profile: "project_investigation" as SandboxTaskProfile,
      groundingRefs: [],
      source: { kind: "open_cognitive_item", ref: "dup" },
      autonomous: true,
    });
    expect(a.accepted).toBe(true);
    expect(b.accepted).toBe(true);
    expect(a.id).toBe(b.id);
  });

  it("rejects an ungrounded admission source", () => {
    const res = recordPendingEngineeringAdmission(db, {
      ownerId: "doc",
      objective: "x",
      projectId: null,
      profile: "project_investigation" as SandboxTaskProfile,
      groundingRefs: [],
      source: { kind: "open_cognitive_item", ref: "z" },
      autonomous: false,
    });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("autonomy_disabled");
  });

  it("keeps concurrency ceiling at 1", () => {
    expect(ENGINEERING_MAX_CONCURRENCY).toBe(1);
  });
});
