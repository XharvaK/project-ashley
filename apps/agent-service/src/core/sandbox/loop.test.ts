/**
 * Sandbox orchestration loop tests (Sandbox Wave 4, Commit 10).
 *
 * 121 focused tests across the bounded agent orchestration surface:
 * lifecycle/admission, bootstrap, context, budgets, action validation,
 * recipe flow, workspace, owner approval, completion/abort, retries,
 * audit, and isolation. Everything runs through the in-process fake
 * broker client and the fixture operator adapter — no provider, no
 * network, no routes, no environment reads.
 */

import { describe, expect, it, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import {
  DELEGATED_RUNTIME_KEY_ID,
  toCanonicalBrokerPath,
  toNativeBrokerPath,
} from "@composer-assistant/sandbox-broker";
import {
  SANDBOX_AUTONOMY_LIFECYCLE_DEFAULT,
  checkSandboxAutonomyLifecycle,
  isSandboxAutonomyLifecycle,
  type SandboxAutonomyLifecycle,
} from "./lifecycle.js";
import { SANDBOX_STOP_REASONS, isSandboxStopReason } from "./stop-reasons.js";
import {
  CANDIDATE_WORKSPACE_CREATE_CAPABILITY,
  MAX_MODEL_CALLS_PER_TASK,
  SANDBOX_TASK_STATUSES,
  capabilityForRecipeExecution,
  createSandboxTask,
  isSandboxTaskStatus,
  type SandboxTask,
} from "./task.js";
import {
  FakeSandboxOperatorAdapter,
  type SandboxOperatorAdapter,
} from "./operator-adapter.js";
import {
  validateSandboxOperatorAction,
  summarizeSandboxOperatorAction,
} from "./operator-actions.js";
import {
  MAX_SANDBOX_CONTEXT_CHARS,
  buildBoundedSandboxContext,
} from "./sandbox-context.js";
import {
  buildSandboxOrchestrationAudit,
  type SandboxOrchestrationAudit,
  type SandboxAuditSink,
} from "./orchestration-audit.js";
import {
  FakeSandboxBrokerClient,
  type SandboxBrokerSessionSnapshot,
} from "./broker-client.js";
import { runSandboxLoop, type SandboxLoopResult } from "./loop.js";
import { bootstrapSandboxSession } from "./bootstrap.js";
import type { DelegatedRuntimeKeyMaterial } from "./delegated-key-custody.js";

// ---------------------------------------------------------------------------
// harness

const OWNER_ID = "owner-1";

function makeKey(): DelegatedRuntimeKeyMaterial {
  const pair = generateKeyPairSync("ed25519");
  return {
    keyId: DELEGATED_RUNTIME_KEY_ID,
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

const BASE_CAPABILITIES = [
  "approved_project_read",
  CANDIDATE_WORKSPACE_CREATE_CAPABILITY,
  "fixed_test_recipe",
  "fixed_build_recipe",
  "fixed_lint_verification_recipe",
] as const;

type TaskOverrides = {
  ownerId?: string;
  objective?: string;
  role?: string;
  allowedCapabilities?: readonly string[];
  maxModelCalls?: number;
  maxToolExecutions?: number;
  deadlineAtMs?: number;
  sourceRootId?: string;
  workspaceRequired?: boolean;
  nowMs?: number;
};

function makeTask(overrides: TaskOverrides = {}): SandboxTask {
  const nowMs = overrides.nowMs ?? 1_800_000_000_000;
  const created = createSandboxTask({
    taskId: "task-1",
    ownerId: OWNER_ID,
    objective: "inspect the fixture repository and report",
    role: "sandbox_operator_light",
    allowedCapabilities: BASE_CAPABILITIES,
    maxModelCalls: 10,
    maxToolExecutions: 10,
    deadlineAtMs: nowMs + 120_000,
    sourceRootId: "src-1",
    ...overrides,
    nowMs,
  });
  if (!created.ok) throw new Error(`harness_task_error:${created.error}`);
  return created.task;
}

type Harness = {
  client: FakeSandboxBrokerClient;
  key: DelegatedRuntimeKeyMaterial;
  clock: { now: number };
  audits: SandboxOrchestrationAudit[];
  nonceCounter: { n: number };
  auditSink: SandboxAuditSink;
  nonceFactory: () => string;
};

function makeHarness(): Harness {
  const clock = { now: 1_800_000_000_000 };
  const key = makeKey();
  const client = new FakeSandboxBrokerClient({
    ownerId: OWNER_ID,
    delegatedPublicKeyPem: key.publicKeyPem,
    nowMs: () => clock.now,
  });
  const audits: SandboxOrchestrationAudit[] = [];
  const nonceCounter = { n: 0 };
  return {
    client,
    key,
    clock,
    audits,
    nonceCounter,
    auditSink: (record) => audits.push(record),
    nonceFactory: () => `n-${++nonceCounter.n}`,
  };
}

let currentClient: FakeSandboxBrokerClient | null = null;

afterEach(() => {
  if (currentClient !== null) {
    try {
      currentClient.close();
    } catch {
      // best effort
    }
    currentClient = null;
  }
});

function run(
  harness: Harness,
  task: SandboxTask,
  adapter: SandboxOperatorAdapter,
  input: { lifecycle?: SandboxAutonomyLifecycle; signal?: AbortSignal; clockDelta?: number } = {},
): Promise<SandboxLoopResult> {
  currentClient = harness.client;
  return runSandboxLoop({
    task,
    lifecycle: input.lifecycle ?? "fixture_only",
    adapter,
    client: harness.client,
    delegatedKey: harness.key,
    nowMs: () => harness.clock.now + (input.clockDelta ?? 0),
    signal: input.signal,
    auditSink: harness.auditSink,
    nonceFactory: harness.nonceFactory,
  });
}

function completeAdapter(): FakeSandboxOperatorAdapter {
  return new FakeSandboxOperatorAdapter();
}

function kinds(audits: SandboxOrchestrationAudit[]): string[] {
  return audits.map((record) => record.kind);
}

// ---------------------------------------------------------------------------
// 1. lifecycle / admission

describe("sandbox lifecycle and task admission", () => {
  it("1. createSandboxTask rejects an empty task id", () => {
    const result = createSandboxTask({
      taskId: "",
      ownerId: OWNER_ID,
      objective: "x",
      role: "sandbox_operator_light",
      allowedCapabilities: ["approved_project_read"],
      maxModelCalls: 2,
      maxToolExecutions: 2,
      deadlineAtMs: 2_000_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("task_id_invalid");
  });

  it("2. createSandboxTask rejects an invalid role", () => {
    const result = createSandboxTask({
      taskId: "t",
      ownerId: OWNER_ID,
      objective: "x",
      role: "captain",
      allowedCapabilities: ["approved_project_read"],
      maxModelCalls: 2,
      maxToolExecutions: 2,
      deadlineAtMs: 2_000_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("role_invalid");
  });

  it("3. createSandboxTask rejects empty allowed capabilities", () => {
    const result = createSandboxTask({
      taskId: "t",
      ownerId: OWNER_ID,
      objective: "x",
      role: "sandbox_operator_light",
      allowedCapabilities: [],
      maxModelCalls: 2,
      maxToolExecutions: 2,
      deadlineAtMs: 2_000_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("capabilities_empty");
  });

  it("4. createSandboxTask rejects duplicate capabilities", () => {
    const result = createSandboxTask({
      taskId: "t",
      ownerId: OWNER_ID,
      objective: "x",
      role: "sandbox_operator_light",
      allowedCapabilities: ["approved_project_read", "approved_project_read"],
      maxModelCalls: 2,
      maxToolExecutions: 2,
      deadlineAtMs: 2_000_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("duplicate_capability");
  });

  it("5. createSandboxTask rejects an unknown capability", () => {
    const result = createSandboxTask({
      taskId: "t",
      ownerId: OWNER_ID,
      objective: "x",
      role: "sandbox_operator_light",
      allowedCapabilities: ["future_hypothetical"],
      maxModelCalls: 2,
      maxToolExecutions: 2,
      deadlineAtMs: 2_000_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("capability_unknown");
  });

  it("6. createSandboxTask rejects owner-approvable capabilities", () => {
    const result = createSandboxTask({
      taskId: "t",
      ownerId: OWNER_ID,
      objective: "x",
      role: "sandbox_operator_light",
      allowedCapabilities: ["write_live_repository"],
      maxModelCalls: 2,
      maxToolExecutions: 2,
      deadlineAtMs: 2_000_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("capability_not_delegated_safe");
  });

  it("7. createSandboxTask rejects out-of-bounds model budget", () => {
    const result = createSandboxTask({
      taskId: "t",
      ownerId: OWNER_ID,
      objective: "x",
      role: "sandbox_operator_light",
      allowedCapabilities: ["approved_project_read"],
      maxModelCalls: MAX_MODEL_CALLS_PER_TASK + 1,
      maxToolExecutions: 2,
      deadlineAtMs: 2_000_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("max_model_calls_invalid");
  });

  it("8. createSandboxTask rejects a deadline in the past", () => {
    const result = createSandboxTask({
      taskId: "t",
      ownerId: OWNER_ID,
      objective: "x",
      role: "sandbox_operator_light",
      allowedCapabilities: ["approved_project_read"],
      maxModelCalls: 2,
      maxToolExecutions: 2,
      deadlineAtMs: 1_800_000_000_000,
      nowMs: 1_800_000_000_001,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("deadline_in_past");
  });

  it("9. createSandboxTask admits a valid task with defaults", () => {
    const result = createSandboxTask({
      taskId: "task-9",
      ownerId: OWNER_ID,
      objective: "inspect",
      role: "sandbox_operator_light",
      allowedCapabilities: ["approved_project_read", "fixed_test_recipe"],
      maxModelCalls: 3,
      maxToolExecutions: 4,
      deadlineAtMs: 1_810_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.status).toBe("admitted");
    expect(result.task.workspaceRequired).toBe(false);
    expect(result.task.sourceRootId).toBeNull();
    expect(result.task.originatingConversationId).toBeNull();
    expect(isSandboxTaskStatus(result.task.status)).toBe(true);
    expect(SANDBOX_TASK_STATUSES).toContain(result.task.status);
  });

  it("10. the lifecycle default is disabled and the gate is closed", () => {
    expect(SANDBOX_AUTONOMY_LIFECYCLE_DEFAULT).toBe("disabled");
    expect(isSandboxAutonomyLifecycle("disabled")).toBe(true);
    expect(isSandboxAutonomyLifecycle("nonsense")).toBe(false);
    const adapter = completeAdapter();
    const gate = checkSandboxAutonomyLifecycle("disabled", adapter);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.stopReason).toBe("lifecycle_denied");
      expect(gate.reason).toBe("sandbox_autonomy_disabled");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. bootstrap

describe("bootstrap", () => {
  it("11. disabled lifecycle refuses the loop before any turn", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask(), completeAdapter(), {
      lifecycle: "disabled",
    });
    expect(result.status).toBe("stopped");
    expect(result.stopReason).toBe("lifecycle_denied");
    expect(result.turns).toBe(0);
    expect(result.sessionUuid).toBeNull();
  });

  it("12. fixture_only refuses a non-fixture adapter", async () => {
    const h = makeHarness();
    const production: SandboxOperatorAdapter = {
      kind: "production",
      proposeNextAction: async () => ({ ok: true, action: { type: "complete", summary: "x" } }),
    };
    const result = await run(h, makeTask(), production);
    expect(result.stopReason).toBe("lifecycle_denied");
    expect(result.turns).toBe(0);
  });

  it("13. evaluation lifecycle is not runnable in this commit", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask(), completeAdapter(), {
      lifecycle: "evaluation",
    });
    expect(result.stopReason).toBe("lifecycle_denied");
    expect(result.error).toContain("not_runnable_in_this_commit");
  });

  it("14. enabled lifecycle is not runnable in this commit", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask(), completeAdapter(), {
      lifecycle: "enabled",
    });
    expect(result.stopReason).toBe("lifecycle_denied");
  });

  it("15. owner mismatch fails bootstrap at the broker authorization", async () => {
    const h = makeHarness();
    const task = makeTask({ ownerId: "owner-2" });
    const result = await run(h, task, completeAdapter());
    expect(result.stopReason).toBe("bootstrap_failed");
    expect(result.error).toContain("probe_broker_authorization_refused");
  });

  it("16. workspaceRequired without a source root id fails bootstrap", async () => {
    const h = makeHarness();
    const task = makeTask({ workspaceRequired: true, sourceRootId: undefined });
    const result = await run(h, task, completeAdapter());
    expect(result.stopReason).toBe("bootstrap_failed");
    expect(result.error).toContain("workspace_requires_source_root_id");
  });

  it("17. workspaceRequired binds a workspace to the broker session", async () => {
    const h = makeHarness();
    const task = makeTask({ workspaceRequired: true, sourceRootId: "src-1" });
    const result = await run(h, task, completeAdapter());
    expect(result.stopReason).toBe("operator_completed");
    const session = h.client.getSession(result.sessionUuid!);
    expect(session).not.toBeNull();
    expect(session!.workspaceId).not.toBeNull();
  });

  it("18. successful bootstrap yields an active session with task limits", async () => {
    const h = makeHarness();
    const task = makeTask({ maxToolExecutions: 5 });
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "execute_recipe", recipeId: "git:status", parameters: {} } },
    ]);
    await run(h, task, adapter);
    const turn = adapter.turns[0];
    expect(turn).toBeDefined();
    expect(turn!.session).not.toBeNull();
    expect(turn!.session!.state).toBe("active");
    expect(turn!.session!.role).toBe("sandbox_operator_light");
    expect(turn!.session!.maxToolExecutions).toBe(5);
  });

  it("19. bootstrap emits session_bound and workspace_bound audits conditionally", async () => {
    const h = makeHarness();
    await run(h, makeTask(), completeAdapter());
    expect(kinds(h.audits)).toContain("bootstrap_started");
    expect(kinds(h.audits)).toContain("session_bound");
    expect(kinds(h.audits)).not.toContain("workspace_bound");

    const h2 = makeHarness();
    await run(
      h2,
      makeTask({ workspaceRequired: true, sourceRootId: "src-1" }),
      completeAdapter(),
    );
    expect(kinds(h2.audits)).toContain("workspace_bound");
  });
});

// ---------------------------------------------------------------------------
// 3. context

const SESSION_FIXTURE: SandboxBrokerSessionSnapshot = {
  sessionUuid: "sess-1",
  ownerId: OWNER_ID,
  role: "sandbox_operator_light",
  state: "active",
  policyId: "policy-orchestration-1",
  policyVersion: 1,
  policyHash: "hash-1",
  workspaceId: null,
  allowedCapabilities: [...BASE_CAPABILITIES],
  maxToolExecutions: 10,
  toolExecutionsUsed: 2,
  expiresAt: "2026-08-06T00:02:00.000Z",
  revision: 3,
};

function contextFor(
  overrides: Partial<Parameters<typeof buildBoundedSandboxContext>[0]> = {},
): string {
  return buildBoundedSandboxContext({
    task: makeTask(),
    session: SESSION_FIXTURE,
    workspace: null,
    previousAction: null,
    previousActionInvalidReason: null,
    lastReceipt: null,
    history: [],
    remainingModelCalls: 9,
    remainingToolExecutions: 8,
    deadlineAtMs: 1_800_000_120_000,
    nowMs: 1_800_000_000_000,
    ...overrides,
  });
}

describe("bounded operator context", () => {
  it("20. context includes the objective and role", () => {
    const context = contextFor();
    expect(context).toContain("inspect the fixture repository and report");
    expect(context).toContain("sandbox_operator_light");
  });

  it("21. context carries the remaining budgets", () => {
    const context = contextFor();
    expect(context).toContain("modelCalls 9/10");
    expect(context).toContain("toolExecutions 8/10");
  });

  it("22. context shows the active session state and usage", () => {
    const context = contextFor();
    expect(context).toContain("session: active sess-1");
    expect(context).toContain("sessionUsage: toolExecutions 2/10");
  });

  it("23. context shows the bound workspace id", () => {
    const context = contextFor({ workspace: { workspaceId: "ws-7" } });
    expect(context).toContain("workspace: ws-7");
  });

  it("24. context summarizes the previous action", () => {
    const context = contextFor({
      previousAction: { type: "execute_recipe", recipeId: "git:status", parameters: {} },
    });
    expect(context).toContain("previousAction: execute_recipe(git:status)");
  });

  it("25. context surfaces the previous invalid reason", () => {
    const context = contextFor({ previousActionInvalidReason: "action_invalid:capability_unknown" });
    expect(context).toContain("previousActionInvalid: action_invalid:capability_unknown");
  });

  it("26. context summarizes the last succeeded receipt", () => {
    const context = contextFor({
      lastReceipt: {
        recipeId: "git:status",
        outcome: "succeeded",
        stage: "receipt",
        errorCode: null,
        exitCode: 0,
        truncated: false,
        stdoutBytes: 12,
        stderrBytes: 0,
        wallMs: 3,
      },
    });
    expect(context).toContain("lastReceipt: git:status outcome=succeeded exit=0");
  });

  it("27. history is compacted to the newest three entries", () => {
    const actions = [
      { type: "complete", summary: "a" },
      { type: "abort", reason: "b" },
      { type: "execute_recipe", recipeId: "git:status", parameters: {} },
      { type: "execute_recipe", recipeId: "git:diff", parameters: {} },
    ] as const;
    const context = contextFor({ history: actions });
    const lines = context
      .split("\n")
      .filter((line) =>
        /^  - (?:execute_recipe\([^)]*\)|complete$|abort$|request_workspace$|request_owner_approval\([^)]*\))$/.test(
          line,
        ),
      );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("abort");
    expect(lines[2]).toContain("execute_recipe(git:diff)");
  });

  it("28. a long objective is truncated with an ellipsis", () => {
    const context = contextFor({
      task: makeTask({ objective: "x".repeat(4000) }),
    });
    expect(context).toContain("…");
    expect(context.length).toBeLessThan(MAX_SANDBOX_CONTEXT_CHARS);
  });

  it("29. the context is length-bounded at the constant cap", () => {
    const context = contextFor();
    expect(context.length).toBeLessThanOrEqual(MAX_SANDBOX_CONTEXT_CHARS);
    expect(MAX_SANDBOX_CONTEXT_CHARS).toBe(32_000);
  });

  it("30. context building never throws on extreme-but-typed input", () => {
    expect(() =>
      buildBoundedSandboxContext({
        task: {
          ...makeTask(),
          objective: "".repeat(0) || "edge",
          taskId: "a".repeat(5000),
        },
        session: null,
        workspace: null,
        previousAction: null,
        previousActionInvalidReason: null,
        lastReceipt: null,
        history: [],
        remainingModelCalls: NaN,
        remainingToolExecutions: NaN,
        deadlineAtMs: NaN,
        nowMs: NaN,
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. model-call budget

describe("model-call budget", () => {
  it("31. context budget line uses remaining-from-max", () => {
    const context = contextFor({ remainingModelCalls: 4 });
    expect(context).toContain("modelCalls 4/10");
  });

  it("32. the loop stops when the model budget is exhausted", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
    ]);
    const task = makeTask({
      maxModelCalls: 2,
      workspaceRequired: true,
      sourceRootId: "src-1",
    });
    const result = await run(h, task, adapter);
    expect(result.stopReason).toBe("model_budget_exhausted");
    expect(result.status).toBe("stopped");
    expect(result.modelCallsUsed).toBe(2);
  });

  it("33. the last reservation reports remainingAfter zero", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
    ]);
    await run(
      h,
      makeTask({ maxModelCalls: 2, workspaceRequired: true, sourceRootId: "src-1" }),
      adapter,
    );
    const reservations = h.audits.filter((a) => a.kind === "model_call_reserved");
    expect(reservations).toHaveLength(2);
    const last = reservations[1];
    if (last && last.kind === "model_call_reserved") {
      expect(last.remainingAfter).toBe(0);
    }
  });

  it("34. budget exhaustion audit records used and limit", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
    ]);
    await run(
      h,
      makeTask({ maxModelCalls: 1, workspaceRequired: true, sourceRootId: "src-1" }),
      adapter,
    );
    const record = h.audits.find((a) => a.kind === "budget_exhausted");
    expect(record).toBeDefined();
    if (record && record.kind === "budget_exhausted") {
      expect(record.budget).toBe("model");
      expect(record.used).toBe(1);
      expect(record.limit).toBe(1);
    }
  });

  it("35. no tool executions occur beyond the exhausted model budget", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
    ]);
    const result = await run(
      h,
      makeTask({ maxModelCalls: 1, workspaceRequired: true, sourceRootId: "src-1" }),
      adapter,
    );
    expect(result.toolExecutionsUsed).toBe(0);
  });

  it("36. a one-call task completes on its single reserved call", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask({ maxModelCalls: 1 }), completeAdapter());
    expect(result.status).toBe("completed");
    expect(result.modelCallsUsed).toBe(1);
  });

  it("37. modelCallsUsed never exceeds the task budget", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { failure: { transient: true, reason: "hiccup" } },
      { failure: { transient: true, reason: "hiccup" } },
    ]);
    const result = await run(h, makeTask({ maxModelCalls: 3 }), adapter);
    expect(result.modelCallsUsed).toBeLessThanOrEqual(3);
  });

  it("38. the adapter observes remainingModelCalls reaching zero", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { failure: { transient: true, reason: "hiccup" } },
    ]);
    await run(h, makeTask({ maxModelCalls: 1 }), adapter);
    expect(adapter.turns[0]!.remainingModelCalls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. action validation

describe("operator action validation", () => {
  it("39. accepts a valid execute_recipe action", () => {
    const check = validateSandboxOperatorAction({
      type: "execute_recipe",
      recipeId: "git:status",
      parameters: { branch: "main" },
    });
    expect(check.ok).toBe(true);
  });

  it("40. accepts a valid request_workspace action", () => {
    const check = validateSandboxOperatorAction({
      type: "request_workspace",
      sourceRootId: "src-1",
    });
    expect(check.ok).toBe(true);
  });

  it("41. accepts a valid request_owner_approval action", () => {
    const check = validateSandboxOperatorAction({
      type: "request_owner_approval",
      capability: "write_live_repository",
      reason: "the fix must reach the live checkout",
    });
    expect(check.ok).toBe(true);
  });

  it("42. accepts a valid complete action", () => {
    const check = validateSandboxOperatorAction({ type: "complete", summary: "done" });
    expect(check.ok).toBe(true);
  });

  it("43. accepts a valid abort action", () => {
    const check = validateSandboxOperatorAction({ type: "abort", reason: "blocked" });
    expect(check.ok).toBe(true);
  });

  it("44. rejects non-object output", () => {
    const check = validateSandboxOperatorAction("complete");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("not_an_object");
  });

  it("45. rejects non-plain objects", () => {
    class Action {
      type = "complete";
      summary = "x";
    }
    const check = validateSandboxOperatorAction(new Action());
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("non_plain_object");
  });

  it("46. rejects unknown action types", () => {
    const check = validateSandboxOperatorAction({ type: "rm_rf", target: "/" });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("unknown_action_type");
  });

  it("47. rejects extra fields", () => {
    const check = validateSandboxOperatorAction({
      type: "complete",
      summary: "x",
      argv: ["--unsafe"],
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("extra_fields");
  });

  it("48. rejects too many parameters", () => {
    const check = validateSandboxOperatorAction({
      type: "execute_recipe",
      recipeId: "git:status",
      parameters: {
        a: "1",
        b: "2",
        c: "3",
        d: "4",
        e: "5",
        f: "6",
        g: "7",
        h: "8",
        i: "9",
      },
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("parameters_too_many");
  });

  it("49. rejects credential-shaped summaries", () => {
    const check = validateSandboxOperatorAction({
      type: "complete",
      summary: "key is sk-abcdefghijklmnopqrstuvwx",
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("secret_detected");
  });

  it("50. rejects delegated-safe capabilities in owner approval requests", () => {
    const check = validateSandboxOperatorAction({
      type: "request_owner_approval",
      capability: "approved_project_read",
      reason: "not actually needed",
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("capability_not_owner_approvable");
  });
});

// ---------------------------------------------------------------------------
// 6. recipe flow

function gitStatusAction() {
  return { type: "execute_recipe", recipeId: "git:status", parameters: {} } as const;
}

function completeAction() {
  return { type: "complete", summary: "fixture done" } as const;
}

function gitStatusArgv(h: Harness): string {
  const executable = toCanonicalBrokerPath(h.client.executablePaths.git);
  const resolved =
    executable.ok ? toNativeBrokerPath(executable.value) : h.client.executablePaths.git;
  return [
    resolved,
    "--no-pager",
    "-c",
    "color.ui=false",
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ].join("\u0000");
}

describe("recipe flow", () => {
  it("51. a recipe execution succeeds and records a receipt", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("operator_completed");
    expect(adapter.turns[0]!.lastReceipt).toBeNull();
    expect(adapter.turns[1]!.lastReceipt!.outcome).toBe("succeeded");
    expect(adapter.turns[1]!.lastReceipt!.recipeId).toBe("git:status");
  });

  it("52. a successful run emits broker_receipt_received succeeded", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const record = h.audits.find((a) => a.kind === "broker_receipt_received");
    expect(record).toBeDefined();
    if (record && record.kind === "broker_receipt_received") {
      expect(record.outcome).toBe("succeeded");
      expect(record.recipeId).toBe("git:status");
    }
  });

  it("53. test: recipes map to fixed_test_recipe", () => {
    expect(capabilityForRecipeExecution("test:agent-vitest")).toBe("fixed_test_recipe");
  });

  it("54. verify: recipes map to fixed_lint_verification_recipe", () => {
    expect(capabilityForRecipeExecution("verify:agent-tsc")).toBe(
      "fixed_lint_verification_recipe",
    );
  });

  it("55. git: recipes map to fixed_build_recipe", () => {
    expect(capabilityForRecipeExecution("git:status")).toBe("fixed_build_recipe");
  });

  it("56. unknown recipe namespaces map to null", () => {
    expect(capabilityForRecipeExecution("custom:thing")).toBeNull();
    expect(capabilityForRecipeExecution("deploy:all")).toBeNull();
  });

  it("57. an unknown recipe namespace is refused without a broker call", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "execute_recipe", recipeId: "custom:thing", parameters: {} } },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("action_not_permitted");
    expect(result.toolExecutionsUsed).toBe(0);
  });

  it("58. a capability not allowed for the task is refused", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([{ action: gitStatusAction() }]);
    const task = makeTask({ allowedCapabilities: ["approved_project_read"] });
    const result = await run(h, task, adapter);
    expect(result.stopReason).toBe("action_not_permitted");
    expect(result.error).toContain("capability_not_allowed_for_task");
  });

  it("59. a failing recipe yields a failed receipt and the loop continues", async () => {
    const h = makeHarness();
    h.client.runner.script(gitStatusArgv(h), {
      exitCode: 1,
      stdout: "",
      stderr: "boom",
      truncated: false,
      terminalReason: "process_exit",
    });
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("operator_completed");
    expect(adapter.turns[1]!.lastReceipt!.outcome).toBe("failed");
  });

  it("60. a failed receipt carries the exit code", async () => {
    const h = makeHarness();
    h.client.runner.script(gitStatusArgv(h), {
      exitCode: 7,
      stdout: "",
      stderr: "nope",
      truncated: false,
      terminalReason: "process_exit",
    });
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    expect(adapter.turns[1]!.lastReceipt!.exitCode).toBe(7);
    expect(adapter.turns[1]!.lastReceipt!.outcome).toBe("failed");
  });

  it("61. a reused envelope nonce is refused by the broker", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: gitStatusAction() },
    ]);
    const result = await runSandboxLoop({
      task: makeTask(),
      lifecycle: "fixture_only",
      adapter,
      client: h.client,
      delegatedKey: h.key,
      nowMs: () => h.clock.now,
      auditSink: h.auditSink,
      nonceFactory: () => "same-nonce",
    });
    expect(result.stopReason).toBe("broker_refusal");
    expect(result.turns).toBe(1);
    const refused = h.audits.find(
      (a) => a.kind === "broker_receipt_received" && a.outcome === "refused",
    );
    expect(refused).toBeDefined();
  });

  it("62. a refused receipt surfaces stage and error code", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: gitStatusAction() },
    ]);
    await runSandboxLoop({
      task: makeTask(),
      lifecycle: "fixture_only",
      adapter,
      client: h.client,
      delegatedKey: h.key,
      nowMs: () => h.clock.now,
      auditSink: h.auditSink,
      nonceFactory: () => "same-nonce",
    });
    const refused = h.audits.find(
      (a) => a.kind === "broker_receipt_received" && a.outcome === "refused",
    );
    expect(refused).toBeDefined();
    if (refused && refused.kind === "broker_receipt_received") {
      expect(refused.stage).not.toBeNull();
      expect(refused.errorCode).not.toBeNull();
    }
  });

  it("63. the broker session revision advances after execution", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    const session = h.client.getSession(result.sessionUuid!);
    expect(session!.revision).toBeGreaterThan(1);
    expect(session!.toolExecutionsUsed).toBe(1);
  });

  it("64. exactly one model call per iteration across turns", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.turns).toBe(3);
    expect(result.modelCallsUsed).toBe(3);
  });

  it("65. tool executions increment once per recipe execution", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.toolExecutionsUsed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. workspace

describe("workspace handling", () => {
  it("66. request_workspace is refused when the task does not require one", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
    ]);
    const result = await run(h, makeTask({ workspaceRequired: false }), adapter);
    expect(result.stopReason).toBe("action_not_permitted");
    expect(result.error).toContain("workspace_not_required_by_task");
  });

  it("67. request_workspace reuses the bound workspace without a broker call", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
      { action: completeAction() },
    ]);
    const task = makeTask({ workspaceRequired: true, sourceRootId: "src-1" });
    const result = await run(h, task, adapter);
    expect(result.stopReason).toBe("operator_completed");
    expect(adapter.turns[0]!.workspace).not.toBeNull();
    expect(adapter.turns[1]!.workspace!.workspaceId).toBe(
      adapter.turns[0]!.workspace!.workspaceId,
    );
  });

  it("68. request_workspace with a mismatched source root id is refused", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-other" } },
    ]);
    const task = makeTask({ workspaceRequired: true, sourceRootId: "src-1" });
    const result = await run(h, task, adapter);
    expect(result.stopReason).toBe("action_not_permitted");
    expect(result.error).toContain("source_root_id_mismatch");
  });

  it("69. a workspace-required task is bootstrapped with a broker workspace", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
    ]);
    await run(h, makeTask({ workspaceRequired: true, sourceRootId: "src-1" }), adapter);
    expect(adapter.turns[0]!.workspace!.workspaceId.length).toBeGreaterThan(0);
  });

  it("70. workspace reuse requires a source root binding on the task", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
    ]);
    const task = makeTask({ workspaceRequired: true, sourceRootId: "src-1" });
    task.sourceRootId = null;
    const result = await run(h, task, adapter);
    expect(result.stopReason).toBe("bootstrap_failed");
    expect(result.error).toContain("workspace_requires_source_root_id");
  });

  it("71. the bound workspace id is visible to the operator", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "request_workspace", sourceRootId: "src-1" } },
    ]);
    await run(h, makeTask({ workspaceRequired: true, sourceRootId: "src-1" }), adapter);
    expect(adapter.turns[0]!.workspace!.workspaceId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. owner approval

describe("owner approval", () => {
  it("72. request_owner_approval stops the loop awaiting the owner", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      {
        action: {
          type: "request_owner_approval",
          capability: "write_live_repository",
          reason: "the fix must reach the live checkout",
        },
      },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.status).toBe("awaiting_owner");
    expect(result.stopReason).toBe("awaiting_owner");
  });

  it("73. the broker session transitions to awaiting_owner", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      {
        action: {
          type: "request_owner_approval",
          capability: "write_live_repository",
          reason: "needed",
        },
      },
    ]);
    const result = await run(h, makeTask(), adapter);
    const session = h.client.getSession(result.sessionUuid!);
    expect(session!.state).toBe("awaiting_owner");
  });

  it("74. the awaiting owner detail is surfaced on the result", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      {
        action: {
          type: "request_owner_approval",
          capability: "write_live_repository",
          reason: "needed now",
        },
      },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.awaitingOwner).toEqual({
      capabilityId: "write_live_repository",
      reason: "needed now",
    });
  });

  it("75. owner_approval_requested audit is emitted", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      {
        action: {
          type: "request_owner_approval",
          capability: "write_live_repository",
          reason: "needed",
        },
      },
    ]);
    await run(h, makeTask(), adapter);
    const record = h.audits.find((a) => a.kind === "owner_approval_requested");
    expect(record).toBeDefined();
    if (record && record.kind === "owner_approval_requested") {
      expect(record.capabilityId).toBe("write_live_repository");
    }
  });

  it("76. the loop stops after the single approval turn", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      {
        action: {
          type: "request_owner_approval",
          capability: "write_live_repository",
          reason: "needed",
        },
      },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.turns).toBe(1);
  });

  it("77. an unknown approval capability fails validation into the correction path", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { rawAction: { type: "request_owner_approval", capability: "mystery", reason: "x" } },
      { action: { type: "complete", summary: "recovered" } },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.status).toBe("completed");
    expect(adapter.turns[1]!.previousActionInvalidReason).toContain(
      "capability_unknown",
    );
  });

  it("78. approval reasons are redacted in the audit preview", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      {
        action: {
          type: "request_owner_approval",
          capability: "write_live_repository",
          reason: "token sk-abcdefghijklmnopqrstuvwx is needed",
        },
      },
    ]);
    await run(h, makeTask(), adapter);
    const record = h.audits.find((a) => a.kind === "owner_approval_requested");
    if (record && record.kind === "owner_approval_requested") {
      expect(record.reasonPreview).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    }
  });
});

// ---------------------------------------------------------------------------
// 9. completion / abort

describe("completion and abort", () => {
  it("79. complete yields a completed result", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask(), completeAdapter());
    expect(result.status).toBe("completed");
    expect(result.stopReason).toBe("operator_completed");
  });

  it("80. the broker session transitions to completed", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask(), completeAdapter());
    const session = h.client.getSession(result.sessionUuid!);
    expect(session!.state).toBe("completed");
  });

  it("81. task_completed audit carries model and tool counts", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const record = h.audits.find((a) => a.kind === "task_completed");
    expect(record).toBeDefined();
    if (record && record.kind === "task_completed") {
      expect(record.modelCallsUsed).toBe(2);
      expect(record.toolExecutionsUsed).toBe(1);
    }
  });

  it("82. abort yields an aborted result", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "abort", reason: "cannot continue" } },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.status).toBe("aborted");
    expect(result.stopReason).toBe("operator_aborted");
  });

  it("83. the broker session transitions to aborted", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "abort", reason: "cannot continue" } },
    ]);
    const result = await run(h, makeTask(), adapter);
    const session = h.client.getSession(result.sessionUuid!);
    expect(session!.state).toBe("aborted");
  });

  it("84. task_aborted audit carries the reason", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: { type: "abort", reason: "blocked on owner input" } },
    ]);
    await run(h, makeTask(), adapter);
    const record = h.audits.find((a) => a.kind === "task_aborted");
    expect(record).toBeDefined();
    if (record && record.kind === "task_aborted") {
      expect(record.reason).toContain("blocked");
    }
  });

  it("85. completion after a recipe run reports the used tool executions", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.toolExecutionsUsed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 10. retries and stopping

describe("retries and stopping", () => {
  it("86. one transient adapter failure is retried and the loop completes", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { failure: { transient: true, reason: "timeout" } },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.status).toBe("completed");
    expect(result.modelCallsUsed).toBe(2);
  });

  it("87. two transient failures stop with adapter_failure_after_retry", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { failure: { transient: true, reason: "timeout" } },
      { failure: { transient: true, reason: "timeout" } },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("adapter_failure_after_retry");
    expect(result.status).toBe("stopped");
  });

  it("88. a non-transient failure stops immediately", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { failure: { transient: false, reason: "policy violation in adapter" } },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("internal_error");
    expect(result.turns).toBe(1);
    expect(result.error).toContain("policy violation");
  });

  it("89. one invalid action is corrected and the loop completes", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { rawAction: { type: "execute_recipe" } },
      { action: { type: "complete", summary: "fixed" } },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.status).toBe("completed");
    expect(adapter.turns[1]!.previousActionInvalidReason).toContain(
      "action_invalid:",
    );
  });

  it("90. two invalid actions stop with action_invalid_after_retry", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { rawAction: { type: "execute_recipe" } },
      { rawAction: { type: "execute_recipe" } },
      { rawAction: { type: "execute_recipe" } },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("action_invalid_after_retry");
    expect(result.status).toBe("stopped");
  });

  it("91. an aborted signal before the first turn stops with cancelled", async () => {
    const h = makeHarness();
    const controller = new AbortController();
    controller.abort();
    const result = await run(h, makeTask(), completeAdapter(), {
      signal: controller.signal,
    });
    expect(result.stopReason).toBe("cancelled");
    expect(result.turns).toBe(0);
  });

  it("92. an abort mid-loop stops with cancelled after the reserved call", async () => {
    const h = makeHarness();
    const controller = new AbortController();
    const result = await runSandboxLoop({
      task: makeTask({
        maxModelCalls: 10,
        workspaceRequired: true,
        sourceRootId: "src-1",
      }),
      lifecycle: "fixture_only",
      adapter: new (class implements SandboxOperatorAdapter {
        readonly kind = "fixture" as const;
        async proposeNextAction(): Promise<{
          ok: true;
          action: { type: "request_workspace"; sourceRootId: string };
        }> {
          controller.abort();
          return {
            ok: true,
            action: { type: "request_workspace", sourceRootId: "src-1" },
          };
        }
      })(),
      client: h.client,
      delegatedKey: h.key,
      nowMs: () => h.clock.now,
      signal: controller.signal,
      auditSink: h.auditSink,
      nonceFactory: h.nonceFactory,
    });
    expect(result.stopReason).toBe("cancelled");
    expect(result.turns).toBe(1);
    expect(result.modelCallsUsed).toBe(1);
  });

  it("93. a deadline already passed stops before any turn with expired", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask({ maxModelCalls: 10 }), completeAdapter(), {
      clockDelta: 200_000,
    });
    expect(result.status).toBe("expired");
    expect(result.stopReason).toBe("task_expired");
    expect(result.turns).toBe(0);
    expect(result.sessionUuid).toBeNull();
  });

  it("94. a deadline passing mid-loop stops with task_expired", async () => {
    const h = makeHarness();
    const result = await runSandboxLoop({
      task: makeTask({
        maxModelCalls: 10,
        workspaceRequired: true,
        sourceRootId: "src-1",
      }),
      lifecycle: "fixture_only",
      adapter: new (class implements SandboxOperatorAdapter {
        readonly kind = "fixture" as const;
        async proposeNextAction(): Promise<{
          ok: true;
          action: { type: "request_workspace"; sourceRootId: string };
        }> {
          h.clock.now += 200_000;
          return {
            ok: true,
            action: { type: "request_workspace", sourceRootId: "src-1" },
          };
        }
      })(),
      client: h.client,
      delegatedKey: h.key,
      nowMs: () => h.clock.now,
      auditSink: h.auditSink,
      nonceFactory: h.nonceFactory,
    });
    expect(result.status).toBe("expired");
    expect(result.stopReason).toBe("task_expired");
    expect(result.turns).toBe(1);
  });

  it("95. tool budget exhaustion stops the loop", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: gitStatusAction() },
      { action: gitStatusAction() },
    ]);
    const task = makeTask({ maxToolExecutions: 1, maxModelCalls: 10 });
    const result = await run(h, task, adapter);
    expect(result.stopReason).toBe("tool_budget_exhausted");
    expect(result.status).toBe("stopped");
    expect(result.toolExecutionsUsed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 11. audit

describe("orchestration audit", () => {
  it("96. a complete run emits the full expected kind sequence", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const sequence = kinds(h.audits);
    expect(sequence).toContain("bootstrap_started");
    expect(sequence).toContain("session_bound");
    expect(sequence).toContain("model_call_reserved");
    expect(sequence).toContain("model_action_received");
    expect(sequence).toContain("broker_action_requested");
    expect(sequence).toContain("broker_receipt_received");
    expect(sequence).toContain("task_completed");
    expect(sequence).toContain("loop_stopped");
    expect(sequence[0]).toBe("bootstrap_started");
    expect(sequence[sequence.length - 1]).toBe("loop_stopped");
  });

  it("97. model_action_received records the action type", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const record = h.audits.find((a) => a.kind === "model_action_received");
    if (record && record.kind === "model_action_received") {
      expect(record.actionType).toBe("execute_recipe");
    }
  });

  it("98. invalid actions emit model_action_invalid", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { rawAction: { type: "nonsense" } },
    ]);
    await run(h, makeTask(), adapter);
    expect(kinds(h.audits)).toContain("model_action_invalid");
  });

  it("99. broker_action_requested precedes the receipt", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const requested = h.audits.findIndex((a) => a.kind === "broker_action_requested");
    const receipt = h.audits.findIndex((a) => a.kind === "broker_receipt_received");
    expect(requested).toBeGreaterThanOrEqual(0);
    expect(receipt).toBeGreaterThan(requested);
  });

  it("100. unknown audit kinds fail closed to null", () => {
    const record = buildSandboxOrchestrationAudit({
      taskId: "t",
      ownerId: "o",
      nowMs: 1,
      kind: "not_a_kind",
    } as unknown as Parameters<typeof buildSandboxOrchestrationAudit>[0]);
    expect(record).toBeNull();
  });

  it("101. lifecycle_denied audit carries the lifecycle value", async () => {
    const h = makeHarness();
    await run(h, makeTask(), completeAdapter(), { lifecycle: "evaluation" });
    const record = h.audits.find((a) => a.kind === "lifecycle_denied");
    expect(record).toBeDefined();
    if (record && record.kind === "lifecycle_denied") {
      expect(record.lifecycle).toBe("evaluation");
      expect(record.reason).toContain("not_runnable_in_this_commit");
    }
  });

  it("102. task_expired audit carries the deadline", async () => {
    const h = makeHarness();
    await run(h, makeTask(), completeAdapter(), { clockDelta: 200_000 });
    const record = h.audits.find((a) => a.kind === "task_expired");
    expect(record).toBeDefined();
    if (record && record.kind === "task_expired") {
      expect(record.deadlineAtMs).toBe(h.clock.now + 120_000);
    }
  });

  it("103. every audit record carries the base identity fields", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    expect(h.audits.length).toBeGreaterThan(0);
    for (const record of h.audits) {
      expect(record.taskId).toBe("task-1");
      expect(record.ownerId).toBe(OWNER_ID);
      expect(record.createdAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("104. refused receipts are audited with stage and error code", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: gitStatusAction() },
    ]);
    await runSandboxLoop({
      task: makeTask(),
      lifecycle: "fixture_only",
      adapter,
      client: h.client,
      delegatedKey: h.key,
      nowMs: () => h.clock.now,
      auditSink: h.auditSink,
      nonceFactory: () => "same-nonce",
    });
    const refused = h.audits.find(
      (a) => a.kind === "broker_receipt_received" && a.outcome === "refused",
    );
    expect(refused).toBeDefined();
    if (refused && refused.kind === "broker_receipt_received") {
      expect(refused.stage).not.toBeNull();
      expect(refused.errorCode).not.toBeNull();
    }
  });

  it("105. free-form audit text is secret-redacted", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      {
        action: {
          type: "abort",
          reason: "leak sk-abcdefghijklmnopqrstuvwx out",
        },
      },
    ]);
    await run(h, makeTask(), adapter);
    const record = h.audits.find((a) => a.kind === "task_aborted");
    if (record && record.kind === "task_aborted") {
      expect(record.reason).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    }
  });
});

// ---------------------------------------------------------------------------
// 12. isolation

describe("isolation and fail-closed guarantees", () => {
  it("106. a denied lifecycle creates no broker session", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask(), completeAdapter(), {
      lifecycle: "disabled",
    });
    expect(result.sessionUuid).toBeNull();
    expect(h.client.getSession("anything")).toBeNull();
  });

  it("107. a denied lifecycle records no broker audits", async () => {
    const h = makeHarness();
    await run(h, makeTask(), completeAdapter(), { lifecycle: "disabled" });
    expect(h.client.audits.length).toBe(0);
  });

  it("108. a denied lifecycle leaves the result session uuid null", async () => {
    const h = makeHarness();
    const result = await run(h, makeTask(), completeAdapter(), {
      lifecycle: "evaluation",
    });
    expect(result.sessionUuid).toBeNull();
  });

  it("109. the operator context never contains raw canonical paths", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const context = adapter.turns[0]!.context;
    expect(context).not.toContain(h.client.liveFileCanonical);
    expect(context).not.toContain(h.client.baseDir);
  });

  it("110. the operator context never contains key material", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const context = adapter.turns[0]!.context;
    expect(context).not.toContain("PRIVATE KEY");
    expect(context).not.toContain(h.key.privateKeyPem.slice(0, 40));
  });

  it("111. the operator context never contains signatures or tokens", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const context = adapter.turns[0]!.context;
    expect(context).not.toMatch(/signature[:=]/i);
    expect(context).not.toMatch(/nonce[:=]/i);
    expect(context).not.toMatch(/capabilityToken[:=]/i);
    expect(context).not.toContain("sig=base64");
    expect(context).not.toContain("Bearer ");
  });

  it("112. context passed to the adapter is length-bounded", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    for (const turn of adapter.turns) {
      expect(turn.context.length).toBeLessThanOrEqual(MAX_SANDBOX_CONTEXT_CHARS);
    }
  });

  it("113. the adapter turn input exposes only bounded fields", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    const turn = adapter.turns[0]!;
    const keys = Object.keys(turn).sort();
    expect(keys).toEqual(
      [
        "context",
        "deadlineAtMs",
        "lastReceipt",
        "nowMs",
        "previousAction",
        "previousActionInvalidReason",
        "remainingModelCalls",
        "remainingToolExecutions",
        "session",
        "task",
        "workspace",
      ].sort(),
    );
  });

  it("114. network isolation is enforced for every execution", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("operator_completed");
    expect(h.client.network.enforceCalls).toBeGreaterThanOrEqual(1);
  });

  it("115. unavailable network isolation refuses execution", async () => {
    const h = makeHarness();
    h.client.network.mode = "unavailable";
    const adapter = new FakeSandboxOperatorAdapter([{ action: gitStatusAction() }]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("broker_refusal");
    expect(result.turns).toBe(1);
    expect(result.error).toContain("network");
    expect(h.client.network.enforceCalls).toBeGreaterThanOrEqual(1);
    const refused = h.audits.find(
      (a) => a.kind === "broker_receipt_received" && a.outcome === "refused",
    );
    expect(refused).toBeDefined();
    if (refused && refused.kind === "broker_receipt_received") {
      expect(refused.stage).toBe("network");
    }
  });

  it("116. no workspace is created for non-workspace tasks", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    await run(h, makeTask(), adapter);
    expect(kinds(h.audits)).not.toContain("workspace_bound");
    expect(adapter.turns[0]!.workspace).toBeNull();
  });

  it("117. the fake policy enforces network mode none", () => {
    const h = makeHarness();
    expect(h.client.policy.policy.networkMode).toBe("none");
  });

  it("118. distinct nonces are honored across executions", async () => {
    const h = makeHarness();
    const adapter = new FakeSandboxOperatorAdapter([
      { action: gitStatusAction() },
      { action: gitStatusAction() },
      { action: completeAction() },
    ]);
    const result = await run(h, makeTask(), adapter);
    expect(result.stopReason).toBe("operator_completed");
  });

  it("119. patch recipes map to fixed build recipes only", () => {
    expect(capabilityForRecipeExecution("patch:generate")).toBe("fixed_build_recipe");
    expect(capabilityForRecipeExecution("patch:apply")).toBe("fixed_build_recipe");
  });

  it("120. a refused production adapter is never consulted", async () => {
    const h = makeHarness();
    let calls = 0;
    const production: SandboxOperatorAdapter = {
      kind: "production",
      proposeNextAction: async () => {
        calls += 1;
        return { ok: true, action: { type: "complete", summary: "x" } };
      },
    };
    await run(h, makeTask(), production);
    expect(calls).toBe(0);
  });

  it("121. close() removes the ephemeral broker base directory", async () => {
    const h = makeHarness();
    await run(h, makeTask(), completeAdapter());
    const base = h.client.baseDir;
    expect(existsSync(base)).toBe(true);
    h.client.close();
    expect(existsSync(base)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// supporting surface sanity (constants that the spec pins)

describe("supporting surface", () => {
  it("stop reasons are a closed vocabulary", () => {
    expect(SANDBOX_STOP_REASONS).toContain("awaiting_owner");
    expect(SANDBOX_STOP_REASONS).toContain("broker_refusal");
    expect(isSandboxStopReason("operator_completed")).toBe(true);
    expect(isSandboxStopReason("random")).toBe(false);
  });

  it("summarizeSandboxOperatorAction produces bounded one-liners", () => {
    expect(
      summarizeSandboxOperatorAction({
        type: "execute_recipe",
        recipeId: "git:status",
        parameters: {},
      }),
    ).toBe("execute_recipe(git:status)");
    expect(
      summarizeSandboxOperatorAction({
        type: "request_owner_approval",
        capability: "write_live_repository",
        reason: "x",
      }),
    ).toBe("request_owner_approval(write_live_repository)");
  });
});
