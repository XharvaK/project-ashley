/**
 * Canary execution isolation tests (SANDBOX-ISOLATION-01).
 *
 * Proves the full isolation gate on the `verify:broker-smoke` recipe: a
 * trusted no-op declared with requiredIsolation = level-1 requirement. The
 * gate must refuse BEFORE reservation under the default operational
 * posture (isolation_not_activated), refuse when the provider has no
 * evidence (isolation_evidence_unavailable), refuse when the merged
 * evidence cannot satisfy the requirement
 * (isolation_requirement_unmet:<property>), and only execute when a
 * provider sustains the requirement — acceptance proven with a mock
 * full-evidence provider. Resolved executables, cwd and limits are pinned
     * so the canary is exactly `/usr/bin/true --smoke` under `live_checkout`.
 */

import { describe, expect, it } from "vitest";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  BubblewrapExecutionIsolation,
  DEFAULT_BUBBLEWRAP_PATH,
  augmentBrokerOwnedEvidence,
  formatIsolationEvidenceSummary,
  unavailableIsolationEvidence,
  type ExecutionIsolationEnforcement,
  type ExecutionIsolationLevel,
  type ExecutionIsolationProvider,
  type IsolationEvidence,
  type IsolationPropertyEvidence,
} from "../index.js";
import type { NetworkIsolationStatus } from "./network-isolation.js";
import type {
  FakeRunRequest,
  FakeRunResult,
  ProcessRunner,
} from "../process/fake-runner.js";
import {
  createActiveSession,
  makeExecutionHarness,
  makeExecutionRequest,
  type ExecutionHarness,
} from "../test/fixtures/execution.js";
import { FIXED_RECIPE_REGISTRY } from "../policy/recipe-registry.js";
import { FixedRecipeExecutionService } from "./fixed-recipe-execution-service.js";

class RecordingRunner implements ProcessRunner {
  calls: FakeRunRequest[] = [];
  async run(request: FakeRunRequest): Promise<FakeRunResult> {
    this.calls.push(request);
    return {
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      truncated: false,
      terminalReason: "success",
    };
  }
  cancel?(taskId: string): boolean {
    return false;
  }
}

const PROVIDED_EVIDENCE: IsolationPropertyEvidence = {
  status: "provided",
  notes: ["mock"],
};

function fullMechanismEvidence(): IsolationEvidence {
  return {
    ...unavailableIsolationEvidence("mock base"),
    network: PROVIDED_EVIDENCE,
    process_tree: PROVIDED_EVIDENCE,
    filesystem_view: PROVIDED_EVIDENCE,
    control_plane_invisible: PROVIDED_EVIDENCE,
    broker_socket_invisible: PROVIDED_EVIDENCE,
  };
}

class MockExecutionIsolationProvider implements ExecutionIsolationProvider {
  private readonly evidenceValue: IsolationEvidence;
  constructor(evidence: IsolationEvidence) {
    this.evidenceValue = evidence;
  }
  async prepare(request: FakeRunRequest): Promise<ExecutionIsolationEnforcement> {
    return { ok: true, request, isolation: this.evidenceValue };
  }
  status(): NetworkIsolationStatus {
    return "operational";
  }
  evidence(): IsolationEvidence {
    return this.evidenceValue;
  }
  supportedLevel(): ExecutionIsolationLevel {
    return 3;
  }
}

function buildCanaryService(
  harness: ExecutionHarness,
  options: {
    activation?: number;
    executionIsolation?: ExecutionIsolationProvider;
    runner?: ProcessRunner;
    executableMappings?: Record<string, string>;
  },
): FixedRecipeExecutionService {
  return new FixedRecipeExecutionService({
    sessionService: harness.sessionService,
    trustedDelegatedKey: harness.trustedDelegatedKey,
    activePolicy: harness.activePolicy,
    trustedOwnerId: "owner-1",
    trustedOwnerPolicyKeyIds: new Set(["owner-ed25519-v1"]),
    reserveNonce: (nonce) => {
      if (harness.usedNonces.has(nonce)) return false;
      harness.usedNonces.add(nonce);
      return true;
    },
    rootConfig: harness.roots.rootConfig,
    processRunner: options.runner ?? harness.runner,
    networkIsolation: harness.network,
    executableMappings: options.executableMappings ?? harness.executableMappings,
    environmentSource: () => ({ PATH: process.env.PATH ?? "/usr/bin:/bin" }),
    auditSink: (record) => harness.audits.push(record),
    nowMs: harness.nowMs,
    executionIsolation: options.executionIsolation,
    isolationActivationLevel: options.activation ?? 0,
  });
}

function makeCanaryService(options: {
  activation?: number;
  executionIsolation?: ExecutionIsolationProvider;
  runner?: RecordingRunner;
} = {}) {
  const harness = makeExecutionHarness({ recipeIds: ["verify:broker-smoke"] });
  const runner = options.runner ?? new RecordingRunner();
  // The registry plans `/usr/bin/true`; map it to a real fixture binary so
  // executable resolution passes on any host (the runner is scripted).
  const trueBinary = path.join(mkdtempSync(path.join(tmpdir(), "ashley-true-")), "true");
  writeFileSync(trueBinary, "#!/bin/sh\nexit 0\n", "utf8");
  const service = buildCanaryService(harness, {
    activation: options.activation,
    executionIsolation: options.executionIsolation,
    runner,
    executableMappings: { true: trueBinary },
  });
  return { harness, runner, service, trueBinary };
}

describe("canary isolation gate", () => {
  it("1. the canary is registered with the level-1 requirement and bounded limits", () => {
    const recipe = FIXED_RECIPE_REGISTRY.find(
      (entry) => entry.recipeId === "verify:broker-smoke",
    )!;
    expect(recipe.executable).toBe("/usr/bin/true");
    expect(recipe.argv).toEqual(["--smoke"]);
    expect(recipe.cwdPolicy).toBe("live_checkout");
    expect(recipe.requiredIsolation).toEqual({
      network: "provided",
      process_tree: "partial",
      control_plane_invisible: "provided",
      broker_socket_invisible: "provided",
    });
  });

  it("2. refuses before reservation while isolation is not activated", async () => {
    const { harness, runner, service } = makeCanaryService();
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, { recipeId: "verify:broker-smoke" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("isolation");
      expect(result.errorCode).toBe("isolation_not_activated");
      expect(result.audit.isolationEvidenceSummary).toBeNull();
    }
    expect(runner.calls).toHaveLength(0);
  });

  it("3. refuses when the provider has no isolation evidence", async () => {
    const { harness, runner, service } = makeCanaryService({ activation: 1 });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, { recipeId: "verify:broker-smoke" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("isolation");
      expect(result.errorCode).toBe("isolation_evidence_unavailable");
    }
    expect(runner.calls).toHaveLength(0);
  });

  it("4. refuses when merged evidence cannot meet the level-1 requirement", async () => {
    const weak = {
      ...fullMechanismEvidence(),
      process_tree: { status: "unproven", notes: ["candidate A unqualified"] } as IsolationPropertyEvidence,
    };
    const { harness, runner, service } = makeCanaryService({
      activation: 1,
      executionIsolation: new MockExecutionIsolationProvider(weak),
    });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, { recipeId: "verify:broker-smoke" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("isolation");
      expect(result.errorCode).toBe(
        "isolation_requirement_unmet:process_tree:partial_but_unproven",
      );
      expect(result.reason).toBe("process_tree:partial_but_unproven");
    }
    expect(runner.calls).toHaveLength(0);
  });

  it("5. refuses when process-tree is sufficient but control-plane visibility remains absent", async () => {
    const evidence = {
      ...fullMechanismEvidence(),
      control_plane_invisible: {
        status: "absent",
        notes: ["child can see broker control-plane paths"],
      } as IsolationPropertyEvidence,
    };
    const { harness, runner, service } = makeCanaryService({
      activation: 1,
      executionIsolation: new MockExecutionIsolationProvider(evidence),
    });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, { recipeId: "verify:broker-smoke" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("isolation");
      expect(result.errorCode).toBe(
        "isolation_requirement_unmet:control_plane_invisible:provided_but_absent",
      );
      expect(result.reason).toBe("control_plane_invisible:provided_but_absent");
    }
    expect(runner.calls).toHaveLength(0);
  });

  it("6. refuses when broker-socket invisibility remains absent", async () => {
    const evidence = {
      ...fullMechanismEvidence(),
      broker_socket_invisible: {
        status: "absent",
        notes: ["child can reach the broker socket"],
      } as IsolationPropertyEvidence,
    };
    const { harness, runner, service } = makeCanaryService({
      activation: 1,
      executionIsolation: new MockExecutionIsolationProvider(evidence),
    });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, { recipeId: "verify:broker-smoke" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("isolation");
      expect(result.errorCode).toBe(
        "isolation_requirement_unmet:broker_socket_invisible:provided_but_absent",
      );
      expect(result.reason).toBe("broker_socket_invisible:provided_but_absent");
    }
    expect(runner.calls).toHaveLength(0);
  });

  it("7. executes exactly /usr/bin/true --smoke under a full-evidence provider", async () => {
    const runner = new RecordingRunner();
    const { harness, service, trueBinary } = makeCanaryService({
      activation: 1,
      executionIsolation: new MockExecutionIsolationProvider(fullMechanismEvidence()),
      runner,
    });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, { recipeId: "verify:broker-smoke" }),
    );
    expect(result.ok).toBe(true);
    expect(runner.calls).toHaveLength(1);
    const request = runner.calls[0]!;
    // The registry plans /usr/bin/true; the resolved fixture binary runs:
    expect(request.argv).toEqual([trueBinary.replace(/\\/g, "/"), "--smoke"]);
    // live_checkout anchors at the read-only checkout root (native form):
    expect(request.cwd.replace(/\\/g, "/")).toBe(
      path.join(harness.roots.base, "source").replace(/\\/g, "/"),
    );
    expect(request.wallMs).toBe(5_000);
    expect(request.maxProcesses).toBe(1);
    expect(request.maxOutputBytes).toBe(65_536);
    if (result.ok) {
      const merged = augmentBrokerOwnedEvidence(fullMechanismEvidence(), {
        workspaceBound: false,
        sourceIdentityBound: false,
        environmentHardened: true,
        resourceLimitsEnforced: true,
      });
      expect(result.audit.isolationEvidenceSummary).toBe(
        formatIsolationEvidenceSummary(merged),
      );
      expect(result.audit.isolationEvidenceSummary).toContain("network=provided");
      expect(result.audit.isolationEvidenceSummary).toContain("source_binding=absent");
    }
  });

  it("does not fall back to the network provider when selected Bubblewrap is unqualified", async () => {
    const harness = makeExecutionHarness();
    const runner = new RecordingRunner();
    const executionIsolation = new BubblewrapExecutionIsolation({
      processRunner: runner,
      platform: "linux",
      probeBinary: () => ({
        kind: "ok",
        resolvedPath: DEFAULT_BUBBLEWRAP_PATH,
      }),
      qualification: { status: "unqualified" },
    });
    const service = buildCanaryService(harness, {
      executionIsolation,
      runner,
    });
    const active = createActiveSession(harness);
    if (!active.ok) return;

    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("network");
      expect(result.errorCode).toBe("bubblewrap_qualification_missing");
    }
    expect(runner.calls).toHaveLength(0);
    expect(harness.network.prepareCalls).toBe(0);
  });

  it("6. the legacy network provider is untouched by the gate when no recipe requires isolation", async () => {
    const harness = makeExecutionHarness();
    const runner = new RecordingRunner();
    const service = buildCanaryService(harness, {
      activation: 1,
      runner,
    });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session),
    );
    expect(result.ok).toBe(true);
    expect(runner.calls).toHaveLength(1);
  });
});
