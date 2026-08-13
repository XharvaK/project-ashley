/**
 * Engineering workstation handler tests — qualified recipe lane
 * (DeepSeek correction audit, HY3-1/HY3-2).
 *
 * The engineering `execute_recipe` lane must run through the same
 * spawn-coupled qualification chain as the fixed-recipe service. These tests
 * drive the real handler with a real signed envelope and assert that:
 *
 *   - the effect binding is checked before authorization (HY3-2);
 *   - the qualified spawn request carries workspace-anchored cwd/binds and
 *     the strictest-of effective limits (HY3-1);
 *   - the isolation gate refuses `requiredIsolation` recipes before any
 *     spawn when the activation level is 0 (SANDBOX-ISOLATION-01);
 *   - with an evidence-bearing execution isolation provider the same recipe
 *     runs and the receipt audit carries the merged isolation evidence;
 *   - `workspaceTreeRoot` is canonical-containment-safe on every host
 *     (Windows dev hosts included, B1).
 */

import { createPublicKey } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  validateProjectRootRegistry,
  type EngineeringAction,
} from "@composer-assistant/sandbox-policy";
import {
  EXECUTION_ISOLATION_PROPERTIES,
  isolationLevelRequirement,
  type ExecutionIsolationEnforcement,
  type ExecutionIsolationProvider,
  type IsolationEvidence,
} from "../execution/execution-isolation.js";
import {
  fixedRecipeRegistry,
  type FixedRecipe,
} from "../policy/recipe-registry.js";
import { randomNonce, sha256Hex } from "../crypto/types.js";
import { engineeringActionEffectHash } from "./engineering-effect.js";
import {
  handleEngineeringAction,
  workspaceTreeRoot,
  type EngineeringHandlerContext,
} from "./handlers.js";
import {
  createActiveSession,
  makeExecutionHarness,
  signExecutionEnvelope,
  type ExecutionHarness,
} from "../test/fixtures/execution.js";
import type { FakeRunRequest } from "../process/fake-runner.js";

const OWNER_KEY_ID = "owner-ed25519-v1";

class FakeExecutionIsolationProvider implements ExecutionIsolationProvider {
  prepareCalls = 0;
  evidenceCalls = 0;

  constructor(private readonly evidenceRecord: IsolationEvidence) {}

  prepare(request: FakeRunRequest): ExecutionIsolationEnforcement {
    this.prepareCalls += 1;
    return { ok: true, request, isolation: this.evidenceRecord };
  }

  status(): "operational" {
    return "operational";
  }

  evidence(): IsolationEvidence {
    this.evidenceCalls += 1;
    return this.evidenceRecord;
  }

  supportedLevel(): 1 {
    return 1;
  }
}

function levelOneEvidence(): IsolationEvidence {
  const evidence = Object.fromEntries(
    EXECUTION_ISOLATION_PROPERTIES.map((property) => [
      property,
      { status: "absent" as const, notes: ["fixture"] },
    ]),
  ) as unknown as IsolationEvidence;
  return {
    ...evidence,
    network: { status: "provided", notes: ["fixture"] },
    process_tree: { status: "partial", notes: ["fixture"] },
    control_plane_invisible: { status: "provided", notes: ["fixture"] },
    broker_socket_invisible: { status: "provided", notes: ["fixture"] },
  };
}

describe("workspaceTreeRoot (cross-platform containment)", () => {
  const harness = makeExecutionHarness();

  it("returns a native path inside the workspace root for a valid id", () => {
    const root = workspaceTreeRoot(harness.roots.rootConfig, "ws-1");
    expect(root).not.toBeNull();
    expect(root).toBe(path.resolve(harness.roots.base, "ws-1"));
  });

  it("rejects absolute, escaped and malformed workspace ids", () => {
    const cfg = harness.roots.rootConfig;
    expect(workspaceTreeRoot(cfg, "/etc")).toBeNull();
    expect(workspaceTreeRoot(cfg, "..")).toBeNull();
    expect(workspaceTreeRoot(cfg, "../escape")).toBeNull();
    expect(workspaceTreeRoot(cfg, "a\\b")).toBeNull();
    expect(workspaceTreeRoot(cfg, "a:b")).toBeNull();
    expect(workspaceTreeRoot(cfg, "x".repeat(65))).toBeNull();
    expect(workspaceTreeRoot(cfg, "ws-valid_1.x")).not.toBeNull();
  });
});

describe("engineering execute_recipe qualified lane", () => {
  let harness: ExecutionHarness;
  let recipes: Map<string, FixedRecipe>;
  let workspaceId: string;
  let ctx: EngineeringHandlerContext;
  const audits: never[] = [];

  beforeAll(() => {
    harness = makeExecutionHarness({
      recipeIds: ["git:status", "test:isolated-canary", "verify:repo-tsc"],
      harnessPolicy: (policy) => ({
        ...policy,
        allowedCapabilities: [...policy.allowedCapabilities, "fixed_build_recipe"],
      }),
    });
    recipes = fixedRecipeRegistry();
    recipes.set("test:isolated-canary", {
      ...(recipes.get("git:status") as FixedRecipe),
      recipeId: "test:isolated-canary",
      description: "fixture: git recipe that declares level-1 isolation",
      requiredIsolation: isolationLevelRequirement(1),
    });
    workspaceId = "ws-run-1";
    mkdirSync(path.join(harness.roots.base, workspaceId), { recursive: true });
    const registry = validateProjectRootRegistry([
      {
        projectId: "demo",
        canonicalRoot: harness.roots.sourceRoot,
        displayName: "demo",
        enabled: true,
        readAllowed: true,
        candidateWorkspaceAllowed: true,
        engineeringAllowed: true,
      },
    ]);
    expect(registry.ok).toBe(true);
    if (!registry.ok) throw new Error("fixture registry invalid");
    ctx = {
      ownerId: "owner-1",
      activePolicy: harness.activePolicy,
      trustedDelegatedKey: harness.trustedDelegatedKey,
      ownerKeyId: OWNER_KEY_ID,
      trustedOwnerApprovalKeys: {
        keys: [
          {
            keyId: "owner-approval-test-1",
            publicKey: createPublicKey(harness.ownerPublicKeyPem),
          },
        ],
      },
      rootConfig: harness.roots.rootConfig,
      projectRegistry: registry.registry,
      candidateRepoRoot: mkdtempSync(path.join(tmpdir(), "ashley-eng-candidate-")),
      artifactRoot: mkdtempSync(path.join(tmpdir(), "ashley-eng-artifacts-")),
      workspaceRoot: harness.roots.rootConfig.workspaceRoot,
      recipes,
      processRunner: harness.runner,
      networkIsolation: harness.network,
      executionIsolation: null,
      isolationActivationLevel: 0,
      executableMappings: harness.executableMappings,
      envAllowlist: new Set<string>(),
      environmentSource: () => ({ PATH: process.env.PATH ?? "/usr/bin:/bin" }),
      nonceStore: {
        reserve: (nonce: string) => {
          if (harness.usedNonces.has(nonce)) return false;
          harness.usedNonces.add(nonce);
          return true;
        },
      },
      auditSink: (record) => harness.audits.push(record),
    };
  });

  afterAll(() => {
    harness.close();
  });

  function engineeringEnvelope(
    action: EngineeringAction,
    sessionUuid: string,
  ): { envelope: unknown; nonce: string } {
    const nonce = randomNonce();
    const envelope = signExecutionEnvelope(harness, {
      sessionUuid,
      capabilityId: "fixed_build_recipe",
      recipeId: String(action.fields.recipeId ?? "git:status"),
      effectHash: engineeringActionEffectHash(action),
      canonicalTargetPaths: [],
      nonce,
    });
    return { envelope, nonce };
  }

  function recipeAudits() {
    return harness.audits.filter(
      (record) => record.kind === "broker_fixed_recipe_execution",
    );
  }

  it("runs a qualified recipe spawn with workspace anchoring and bounded limits", async () => {
    const before = harness.audits.length;
    const active = createActiveSession(harness, {
      capabilityId: "fixed_build_recipe",
    });
    if (!active.ok) throw new Error(active.reason);
    const action: EngineeringAction = {
      type: "execute_recipe",
      fields: { recipeId: "git:status", workspaceId },
    };
    const { envelope, nonce } = engineeringEnvelope(action, active.session.session.sessionUuid);
    const runSpy = vi.spyOn(harness.runner, "run");
    try {
      const result = await handleEngineeringAction(
        ctx,
        "sandbox.engineering.action",
        { envelope, action, nowMs: Date.now() },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(runSpy).toHaveBeenCalledTimes(1);
      const request = runSpy.mock.calls[0]![0] as FakeRunRequest;
      expect(request.isolationCwd).toBe("/workspace");
      expect(request.cwd).toBe(path.join(harness.roots.base, workspaceId));
      expect(request.argv[0]).toBe(harness.gitFixture.replace(/\\/g, "/"));
      expect(request.env.GIT_TERMINAL_PROMPT).toBe("0");
      expect(request.isolationBinds).toContainEqual({
        src: path.join(harness.roots.base, workspaceId),
        dest: "/workspace",
        writable: true,
      });
      expect(request.wallMs).toBeGreaterThan(0);
      expect(request.maxOutputBytes).toBeGreaterThan(0);
      expect(result.data).toMatchObject({
        exitCode: 0,
        stdout: "ok",
        truncated: false,
      });
      const audits = recipeAudits().slice(before - recipeAudits().slice(0, before).length);
      expect(audits.at(-1)).toMatchObject({
        kind: "broker_fixed_recipe_execution",
        outcome: "completed",
        stage: "receipt",
        recipeId: "git:status",
        readiness: "execution_ready",
        category: "git",
        networkIsolation: "enforced",
        nonceHash: sha256Hex(nonce),
        isolationEvidenceSummary: null,
      });
    } finally {
      runSpy.mockRestore();
    }
  });

  it("refuses before authorization when the envelope does not bind the action (HY3-2)", async () => {
    const before = harness.audits.length;
    const active = createActiveSession(harness, {
      capabilityId: "fixed_build_recipe",
    });
    if (!active.ok) throw new Error(active.reason);
    const action: EngineeringAction = {
      type: "execute_recipe",
      fields: { recipeId: "git:status", workspaceId },
    };
    // Signed against a different action (recipeId swapped) — the signature
    // itself is valid, but the effect binding must fail before authorization.
    const nonce = randomNonce();
    const envelope = signExecutionEnvelope(harness, {
      sessionUuid: active.session.session.sessionUuid,
      capabilityId: "fixed_build_recipe",
      recipeId: "git:status",
      effectHash: engineeringActionEffectHash({
        type: "execute_recipe",
        fields: { recipeId: "git:diff", workspaceId },
      }),
      canonicalTargetPaths: [],
      nonce,
    });
    const result = await handleEngineeringAction(
      ctx,
      "sandbox.engineering.action",
      { envelope, action, nowMs: Date.now() },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("effect_hash_mismatch");
    expect(harness.audits.slice(before)).toHaveLength(0);
    expect(harness.usedNonces.has(nonce)).toBe(false);
  });

  it("refuses a required-isolation recipe before any spawn when the activation level is 0", async () => {
    const active = createActiveSession(harness, {
      capabilityId: "fixed_build_recipe",
    });
    if (!active.ok) throw new Error(active.reason);
    const action: EngineeringAction = {
      type: "execute_recipe",
      fields: { recipeId: "test:isolated-canary", workspaceId },
    };
    const { envelope } = engineeringEnvelope(action, active.session.session.sessionUuid);
    const runSpy = vi.spyOn(harness.runner, "run");
    try {
      const result = await handleEngineeringAction(
        ctx,
        "sandbox.engineering.action",
        { envelope, action, nowMs: Date.now() },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("isolation_not_activated");
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      runSpy.mockRestore();
    }
  });

  it("runs a required-isolation recipe under a provider whose evidence satisfies the gate", async () => {
    const before = harness.audits.length;
    const isolation = new FakeExecutionIsolationProvider(levelOneEvidence());
    const isolatedCtx: EngineeringHandlerContext = {
      ...ctx,
      executionIsolation: isolation,
      isolationActivationLevel: 1,
    };
    const active = createActiveSession(harness, {
      capabilityId: "fixed_build_recipe",
    });
    if (!active.ok) throw new Error(active.reason);
    const action: EngineeringAction = {
      type: "execute_recipe",
      fields: { recipeId: "test:isolated-canary", workspaceId },
    };
    const { envelope } = engineeringEnvelope(action, active.session.session.sessionUuid);
    const result = await handleEngineeringAction(
      isolatedCtx,
      "sandbox.engineering.action",
      { envelope, action, nowMs: Date.now() },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isolation.prepareCalls).toBe(1);
    expect(isolation.evidenceCalls).toBeGreaterThan(0);
    const audit = recipeAudits().at(-1);
    expect(audit).toMatchObject({
      kind: "broker_fixed_recipe_execution",
      outcome: "completed",
      recipeId: "test:isolated-canary",
      networkIsolation: "enforced",
    });
    expect(audit?.isolationEvidenceSummary).toContain("network=provided");
    expect(audit?.isolationEvidenceSummary).toContain("control_plane_invisible=provided");
    expect(audit?.isolationEvidenceSummary).toContain("workspace_binding=provided");
  });

  it("refuses a registry-unsupported recipe before the qualified lane", async () => {
    const active = createActiveSession(harness, {
      capabilityId: "fixed_build_recipe",
    });
    if (!active.ok) throw new Error(active.reason);
    const action: EngineeringAction = {
      type: "execute_recipe",
      fields: { recipeId: "verify:repo-tsc", workspaceId },
    };
    const { envelope } = engineeringEnvelope(action, active.session.session.sessionUuid);
    const result = await handleEngineeringAction(
      ctx,
      "sandbox.engineering.action",
      { envelope, action, nowMs: Date.now() },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("recipe_unavailable");
  });

  it("refuses a missing workspace cwd in the qualified lane before any spawn", async () => {
    const active = createActiveSession(harness, {
      capabilityId: "fixed_build_recipe",
    });
    if (!active.ok) throw new Error(active.reason);
    const action: EngineeringAction = {
      type: "execute_recipe",
      fields: { recipeId: "git:status", workspaceId: "no-such-workspace" },
    };
    const { envelope } = engineeringEnvelope(action, active.session.session.sessionUuid);
    const runSpy = vi.spyOn(harness.runner, "run");
    try {
      const result = await handleEngineeringAction(
        ctx,
        "sandbox.engineering.action",
        { envelope, action, nowMs: Date.now() },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // The workspace id is containment-valid but the directory does not
      // exist; the qualified tail refuses at the cwd stage (HY3-1).
      expect(result.errorCode).toBe("cwd_missing");
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      runSpy.mockRestore();
    }
  });

  it("rejects meta actions without any tool execution", async () => {
    const result = await handleEngineeringAction(ctx, "sandbox.engineering.action", {
      envelope: { effectHash: "a".repeat(64), signature: "x" },
      action: { type: "complete", fields: {} },
      nowMs: Date.now(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("meta_action_not_executable");
  });
});
