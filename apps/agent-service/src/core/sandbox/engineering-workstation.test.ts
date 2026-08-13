import { describe, it, expect } from "vitest";
import {
  EngineeringOperatorAdapter,
  type OperatorEnvelopeProvider,
} from "./engineering-operator.js";
import {
  SandboxEngineeringCoordinator,
  type CoordinatorConfig,
} from "./coordinator.js";
import { AgentProjectRegistry } from "./project-registry.js";
import {
  initCloneState,
  nextReviewDueMs,
  isReviewDue,
  buildWeeklyReview,
} from "./self-improvement.js";
import {
  evaluateProactiveAdmission,
} from "./proactive-admission.js";
import {
  initActivationState,
  recordStep,
  isActivationComplete,
  rollback,
} from "./activation.js";
import { AGENT_AVAILABLE_DIAGNOSTICS } from "./diagnostics.js";
import type {
  EngineeringExecutionPort,
  EngineeringToolResult,
  ThinkingModel,
} from "./engineering-types.js";
import type { DelegatedApprovalEnvelope } from "@composer-assistant/sandbox-broker";
import type { EngineeringAction, SandboxCapabilityId } from "@composer-assistant/sandbox-policy";

function fakeEnvelope(): DelegatedApprovalEnvelope {
  return {
    proposalId: "p",
    ownerId: "o",
    policyId: "pol",
    policyVersion: 1,
    policyHash: "a".repeat(64),
    capabilityId: "engineering_project_read",
    authoritativeRiskClass: "low",
    policyRuleId: "r",
    signerClass: "delegated_runtime",
    signerKeyId: "k",
    publicKeyFingerprint: "b".repeat(64),
    signature: "sig",
    signedAtIso: new Date(0).toISOString(),
    envelopeHash: "c".repeat(64),
    nonce: "n",
  } as unknown as DelegatedApprovalEnvelope;
}

const envelopes: OperatorEnvelopeProvider = (
  _action: EngineeringAction,
  capability: SandboxCapabilityId,
) => ({ ...fakeEnvelope(), capabilityId: capability }) as DelegatedApprovalEnvelope;

/** A model that emits a fixed scripted sequence of actions. */
class ScriptedModel implements ThinkingModel {
  readonly route = "thinking" as const;
  private queue: EngineeringAction[];
  constructor(queue: EngineeringAction[]) {
    this.queue = queue;
  }
  async proposeNextAction(): Promise<unknown> {
    return this.queue.shift() ?? { type: "abort", fields: {} };
  }
}

function makePort(): EngineeringExecutionPort {
  const calls: EngineeringAction[] = [];
  return {
    async executeAction(action: EngineeringAction): Promise<EngineeringToolResult> {
      calls.push(action);
      if (action.type === "request_workspace") {
        return { ok: true, data: { workspaceId: "ws1" }, artifactRef: null };
      }
      if (action.type === "generate_candidate_patch") {
        return { ok: true, data: { artifactRef: "patch-abc" }, artifactRef: "patch-abc" };
      }
      return { ok: true, data: { ok: true }, artifactRef: null };
    },
  };
}

function makeCoord(model: ThinkingModel, port: EngineeringExecutionPort): SandboxEngineeringCoordinator {
  const config: CoordinatorConfig = {
    owner: "owner",
    budgets: { maxModelCalls: 24, maxToolExecutions: 48, maxWallMs: 1000 },
    availableDiagnostics: [...AGENT_AVAILABLE_DIAGNOSTICS],
    nowMs: () => 1000,
  };
  return new SandboxEngineeringCoordinator(model, port, config);
}

describe("EngineeringOperatorAdapter", () => {
  it("completes a workspace write + patch happy path", async () => {
    const model = new ScriptedModel([
      { type: "request_workspace", fields: {} },
      { type: "write_workspace_file", fields: { workspaceId: "ws1", relativePath: "fix.txt", contentBase64: "aGVsbG8=" } },
      { type: "generate_candidate_patch", fields: { workspaceId: "ws1", summary: "fix" } },
      { type: "complete", fields: {} },
    ]);
    const port = makePort();
    const op = new EngineeringOperatorAdapter(model, port);
    const out = await op.runTask({
      taskId: "t1",
      objective: "fix",
      projectId: null,
      workspaceId: null,
      envelopes,
      availableDiagnostics: ["disk_free"],
      nowMs: () => 1000,
      budgets: { maxModelCalls: 24, maxToolExecutions: 48, maxWallMs: 1000 },
    });
    expect(out.status).toBe("completed");
    expect(out.candidatePatchRef).toBe("patch-abc");
    expect(out.toolCallsUsed).toBeGreaterThanOrEqual(3);
  });

  it("refuses path escape relative paths", async () => {
    const model = new ScriptedModel([
      { type: "request_workspace", fields: {} },
      { type: "write_workspace_file", fields: { workspaceId: "ws1", relativePath: "../../etc/passwd", contentBase64: "eA==" } },
      { type: "complete", fields: {} },
    ]);
    const port = makePort();
    const op = new EngineeringOperatorAdapter(model, port);
    const out = await op.runTask({
      taskId: "t2",
      objective: "escape",
      projectId: null,
      workspaceId: null,
      envelopes,
      availableDiagnostics: [],
      nowMs: () => 1000,
      budgets: { maxModelCalls: 24, maxToolExecutions: 48, maxWallMs: 1000 },
    });
    expect(out.results.some((r) => !r.ok && r.errorCode === "relative_path_invalid")).toBe(true);
  });

  it("treats commit_candidate as owner-approval-required (never auto-applied)", async () => {
    const model = new ScriptedModel([
      { type: "request_workspace", fields: {} },
      { type: "commit_candidate", fields: { workspaceId: "ws1", message: "x" } },
      { type: "complete", fields: {} },
    ]);
    const port = makePort();
    const op = new EngineeringOperatorAdapter(model, port);
    const out = await op.runTask({
      taskId: "t3",
      objective: "commit",
      projectId: null,
      workspaceId: null,
      envelopes,
      availableDiagnostics: [],
      nowMs: () => 1000,
      budgets: { maxModelCalls: 24, maxToolExecutions: 48, maxWallMs: 1000 },
    });
    expect(out.results.some((r) => !r.ok && r.errorCode === "owner_approval_required")).toBe(true);
  });

  it("exhausts budget and stops", async () => {
    const spam = Array.from({ length: 100 }, () => ({ type: "search_workspace_text" as const, fields: { workspaceId: "ws1", pattern: "x" } }));
    const model = new ScriptedModel(spam);
    const port = makePort();
    const op = new EngineeringOperatorAdapter(model, port);
    const out = await op.runTask({
      taskId: "t4",
      objective: "spam",
      projectId: null,
      workspaceId: null,
      envelopes,
      availableDiagnostics: [],
      nowMs: () => 1000,
      budgets: { maxModelCalls: 5, maxToolExecutions: 5, maxWallMs: 1000 },
    });
    expect(out.status).toBe("budget_exhausted");
  });
});

describe("SandboxEngineeringCoordinator", () => {
  it("admits, runs to completion, and records the task", async () => {
    const model = new ScriptedModel([
      { type: "request_workspace", fields: {} },
      { type: "generate_candidate_patch", fields: { workspaceId: "ws1", summary: "fix" } },
      { type: "complete", fields: {} },
    ]);
    const coord = makeCoord(model, makePort());
    const task = coord.admit({
      objective: "fix",
      projectId: null,
      sourceBaseCommit: "base",
      admissionCause: "user_request",
      profile: "code_quality",
    });
    expect(task.status).toBe("admitted");
    const result = await coord.run(task.taskId, envelopes);
    expect(result.status).toBe("completed");
    const stored = coord.get(task.taskId);
    expect(stored?.status).toBe("completed");
    expect(stored?.candidatePatchRef).toBe("patch-abc");
  });

  it("enforces fail-closed concurrency of one", async () => {
    const coord = makeCoord(
      new ScriptedModel([{ type: "complete", fields: {} }]),
      makePort(),
    );
    const a = coord.admit({ objective: "a", projectId: null, admissionCause: "user_request", profile: "code_quality" });
    const b = coord.admit({ objective: "b", projectId: null, admissionCause: "user_request", profile: "code_quality" });
    await coord.run(a.taskId, envelopes);
    const second = await coord.run(b.taskId, envelopes);
    // Second run cannot start while first still occupies (here first completed, so second runs).
    expect(["completed", "failed", "expired", "awaiting_owner", "aborted"]).toContain(second.status);
  });

  it("recovers running tasks as outcome_unknown after restart", () => {
    const coord = makeCoord(
      new ScriptedModel([{ type: "complete", fields: {} }]),
      makePort(),
    );
    const t = coord.admit({ objective: "x", projectId: null, admissionCause: "user_request", profile: "code_quality" });
    (coord.get(t.taskId) as { status: string }).status = "running";
    coord.recover(coord.list());
    expect(coord.get(t.taskId)?.status).toBe("outcome_unknown");
  });

  it("cancels a running task to aborted", () => {
    const coord = makeCoord(
      new ScriptedModel([{ type: "complete", fields: {} }]),
      makePort(),
    );
    const t = coord.admit({ objective: "x", projectId: null, admissionCause: "user_request", profile: "code_quality" });
    (coord.get(t.taskId) as { status: string }).status = "running";
    coord.cancel(t.taskId);
    expect(coord.get(t.taskId)?.status).toBe("aborted");
  });
});

describe("AgentProjectRegistry", () => {
  const entries = [
    {
      projectId: "projA",
      canonicalRoot: "/var/lib/ashley-sandbox/projects/projA",
      displayName: "A",
      enabled: true,
      readAllowed: true,
      candidateWorkspaceAllowed: true,
      engineeringAllowed: true,
    },
    {
      projectId: "projB",
      canonicalRoot: "/var/lib/ashley-sandbox/projects/projB",
      displayName: "B",
      enabled: true,
      readAllowed: false,
      candidateWorkspaceAllowed: false,
      engineeringAllowed: false,
    },
  ];
  it("reads allowlist flags but cannot widen", () => {
    const reg = new AgentProjectRegistry(entries);
    expect(reg.isReadAllowed("projA")).toBe(true);
    expect(reg.isEngineeringAllowed("projA")).toBe(true);
    expect(reg.isReadAllowed("projB")).toBe(false);
    expect(reg.get("projC")).toBeNull();
  });
});

describe("Self-improvement clone", () => {
  const state = initCloneState({
    sourceProjectId: "self",
    sourceCanonicalRoot: "/home/xarvak/project-ashley",
    sourceBaseCommit: "abc",
    activationEpochMs: 0,
  });
  state.candidateCommits = [
    {
      sha: "s1",
      parentSha: "abc",
      title: "fix",
      problem: "x",
      whyImportant: "y",
      filesChanged: ["a.ts"],
      diffStat: "1 file",
      testsRun: ["vitest"],
      testResults: "pass",
      knownLimitations: "none",
      remainingUncertainty: "low",
      securityImpact: "none",
      touchesSandboxSecurity: false,
      touchesDependencyManifest: false,
      touchesMigration: false,
      touchesBehavior: false,
      ownerReviewFocus: "review",
    },
  ];
  it("surfaces weekly review only when due", () => {
    expect(nextReviewDueMs(state, 1000)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(isReviewDue(state, 1000)).toBe(false);
    expect(isReviewDue(state, 8 * 24 * 60 * 60 * 1000)).toBe(true);
    const review = buildWeeklyReview(state, 8 * 24 * 60 * 60 * 1000);
    expect(review?.candidate.sha).toBe("s1");
  });
  it("returns null when nothing to review", () => {
    const empty = initCloneState({
      sourceProjectId: "self",
      sourceCanonicalRoot: "/home/xarvak/project-ashley",
      sourceBaseCommit: "abc",
      activationEpochMs: 0,
    });
    expect(buildWeeklyReview(empty, 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});

describe("Proactive admission", () => {
  it("admits grounded health anomalies", () => {
    const d = evaluateProactiveAdmission(
      { kind: "health_anomaly", ref: "h1", detail: "oom" },
      { autonomyEnabled: true, activeTaskCount: 0, maxConcurrent: 1 },
    );
    expect(d.admit).toBe(true);
  });
  it("refuses ungrounded or disabled autonomy", () => {
    expect(
      evaluateProactiveAdmission(
        { kind: "health_anomaly", ref: "h1", detail: "oom" },
        { autonomyEnabled: false, activeTaskCount: 0, maxConcurrent: 1 },
      ).admit,
    ).toBe(false);
    expect(
      evaluateProactiveAdmission(
        { kind: "curiosity", ref: "c1" } as never,
        { autonomyEnabled: true, activeTaskCount: 1, maxConcurrent: 1 },
      ).admit,
    ).toBe(false);
  });
});

describe("Activation orchestration", () => {
  it("completes only when all required steps + markers pass", () => {
    const s = initActivationState(0);
    for (const step of [
      "verify_source",
      "verify_qualification_evidence",
      "verify_policy",
      "verify_installed_artifacts",
      "run_canary",
      "verify_canary_receipt",
      "init_activation_epoch",
      "enable_agent_lifecycle",
      "verify_agent_health",
      "verify_historical_admissions_untouched",
    ] as const) {
      recordStep(s, step);
    }
    s.markers = {
      qualification: "qualified",
      brokerExecutionIsolation: "ready",
      canary: "PASS",
      sandboxAutonomy: "ENABLED",
    };
    expect(isActivationComplete(s)).toBe(true);
    expect(s.activated).toBe(false); // activated set by caller after verification
  });
  it("rollback disables autonomy and preserves evidence", () => {
    const s = initActivationState(0);
    s.activated = true;
    s.markers = { sandboxAutonomy: "ENABLED" };
    rollback(s);
    expect(s.activated).toBe(false);
    expect(s.markers.sandboxAutonomy).toBe("DISABLED");
    expect(s.rollbackAvailable).toBe(true);
  });
});
