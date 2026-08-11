/**
 * Session workspace cwd binding tests (SANDBOX-ISOLATION-01).
 *
 * A workspace-anchored recipe bound to a session workspace runs at the
 * revalidated disposable tree root — never at the shared workspace root —
 * and read-path facts are rejected outside every read-allowed root.
 * Verified on any host by using broker-canonical roots throughout.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createActiveSession,
  createLiveDisposableWorkspace,
  makeExecutionHarness,
  makeExecutionRequest,
  type ExecutionHarness,
} from "../test/fixtures/execution.js";
import { makeWorkspaceAuthorization } from "../test/fixtures/workspace.js";
import { toCanonicalBrokerPath, toNativeBrokerPath } from "../policy/path.js";
import { createDisposableWorkspace } from "../workspace/workspace-create.js";
import type {
  FakeRunResult,
  FakeRunRequest,
  ProcessRunner,
} from "../process/fake-runner.js";
import { FixedRecipeExecutionService } from "./fixed-recipe-execution-service.js";

class CwdRunner implements ProcessRunner {
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

function canonicalOf(native: string): string {
  const c = toCanonicalBrokerPath(native);
  if (!c.ok) throw new Error(`canonical path failed for ${native}`);
  return c.value;
}

function buildService(harness: ExecutionHarness, runner: ProcessRunner) {
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
    processRunner: runner,
    networkIsolation: harness.network,
    executableMappings: harness.executableMappings,
    environmentSource: () => ({ PATH: process.env.PATH ?? "/usr/bin:/bin" }),
    auditSink: (record) => harness.audits.push(record),
    nowMs: harness.nowMs,
  });
}

describe("session workspace cwd binding", () => {
  it("1. a workspace-bound execution runs at the tree root, not the shared workspace root", async () => {
    const harness = makeExecutionHarness({
      recipeIds: ["git:status", "verify:agent-tsc"],
    });
    const live = await createLiveDisposableWorkspace(harness);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const active = createActiveSession(harness, {
      capabilityId: "candidate_workspace_read_write_delete",
      workspace: {
        workspaceId: live.workspaceId,
        workspaceManifestHash: live.manifestHash,
      },
    });
    expect(active.ok).toBe(true);
    if (!active.ok) return;

    const runner = new CwdRunner();
    const service = buildService(harness, runner);
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, {
        capabilityId: "candidate_workspace_read_write_delete",
        recipeId: "verify:agent-tsc",
        canonicalTargetPaths: [
          { path: `${live.treeRoot}/newfile.txt`, intent: "write" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runner.calls).toHaveLength(1);
    const request = runner.calls[0]!;
    // Runs at the disposable tree root (native realpath), never at the
    // shared broker workspace root:
    expect(request.cwd.replace(/\\/g, "/")).toBe(
      toNativeBrokerPath(live.treeRoot).replace(/\\/g, "/"),
    );
    expect(request.cwd.replace(/\\/g, "/")).not.toBe(
      toNativeBrokerPath(harness.roots.rootConfig.workspaceRoot).replace(
        /\\/g,
        "/",
      ),
    );
  });

  it("2. an unbound workspace-policy execution keeps the plan cwd", async () => {
    const harness = makeExecutionHarness({
      recipeIds: ["git:status", "verify:agent-tsc"],
    });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    const runner = new CwdRunner();
    const service = buildService(harness, runner);
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, { recipeId: "verify:agent-tsc" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.cwd.replace(/\\/g, "/")).toBe(
      toNativeBrokerPath(harness.roots.rootConfig.workspaceRoot).replace(
        /\\/g,
        "/",
      ),
    );
  });

  it("3. an identity-bound workspace records the identity root on the manifest", async () => {
    const harness = makeExecutionHarness({
      recipeIds: ["git:status", "verify:agent-tsc"],
    });
    const identityReal = mkdtempSync(path.join(tmpdir(), "ashley-identity-manifest"));
    writeFileSync(path.join(identityReal, "identity-file.txt"), "identity");
    const identityCanonical = canonicalOf(identityReal);
    const rootConfig = {
      ...harness.roots.rootConfig,
      readOnlyRoots: [
        ...harness.roots.rootConfig.readOnlyRoots,
        identityCanonical,
      ],
      sourceIdentities: new Map<string, string>([["main", identityCanonical]]),
    };
    const created = await createDisposableWorkspace({
      authorization: makeWorkspaceAuthorization(),
      rootConfig,
      sourceRootId: "main",
      limits: { ttlMs: 3_600_000 },
      symlinkPolicy: "skip",
      nowMs: Date.now(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // The manifest source root is the identity root — never the read-only
    // checkout root (readOnlyRoots[0]):
    expect(created.manifest.sourceIdentity).toBe("main");
    expect(created.manifest.sourceRoot).toBe(identityCanonical);
    expect(created.manifest.sourceRoot).not.toBe(harness.roots.sourceRoot);
  });

  it("4. read facts outside every configured root are refused", async () => {
    const harness = makeExecutionHarness({
      recipeIds: ["git:status", "verify:agent-tsc"],
    });
    const active = createActiveSession(harness);
    if (!active.ok) return;
    writeFileSync(path.join(harness.roots.base, "dest", "secret.txt"), "secret");
    const outside = canonicalOf(path.join(harness.roots.base, "dest", "secret.txt"));
    const runner = new CwdRunner();
    const service = buildService(harness, runner);
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, {
        recipeId: "verify:agent-tsc",
        canonicalTargetPaths: [{ path: outside, intent: "read" }],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The path resolves (real file under a writable disposable root) and
      // authorization passes — but a read intent under a writable root is
      // not permitted by the workspace gate:
      expect(result.stage).toBe("workspace");
      expect(result.errorCode).toBe("read_outside_configured_roots");
    }
    expect(runner.calls).toHaveLength(0);
  });

  it("5. a session whose bound workspace no longer revalidates is refused before spawn", async () => {
    const harness = makeExecutionHarness({
      recipeIds: ["git:status", "verify:agent-tsc"],
    });
    const live = await createLiveDisposableWorkspace(harness);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const active = createActiveSession(harness, {
      capabilityId: "candidate_workspace_read_write_delete",
      workspace: { workspaceId: live.workspaceId, workspaceManifestHash: live.manifestHash },
    });
    expect(active.ok).toBe(true);
    if (!active.ok) return;

    // Tamper the on-disk disposable tree the session is bound to. The service
    // revalidates the workspace BEFORE cwd resolution; the missing tree must
    // refuse the execution at the workspace stage with no spawn.
    rmSync(toNativeBrokerPath(live.treeRoot), { recursive: true, force: true });

    const runner = new CwdRunner();
    const service = buildService(harness, runner);
    const result = await service.executeFixedRecipe(
      makeExecutionRequest(harness, active.session, {
        capabilityId: "candidate_workspace_read_write_delete",
        recipeId: "verify:agent-tsc",
        canonicalTargetPaths: [
          { path: `${live.treeRoot}/newfile.txt`, intent: "write" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("workspace");
      expect(result.errorCode).toBe("workspace_revalidation_failed");
    }
    expect(runner.calls).toHaveLength(0);
  });

  it("6. two sessions bound to distinct workspaces do not share a task workspace", async () => {
    const harness = makeExecutionHarness({
      recipeIds: ["git:status", "verify:agent-tsc"],
      harnessPolicy: (p) => ({ ...p, maxActiveSessions: 2 }),
    });
    const wsA = await createLiveDisposableWorkspace(harness);
    const wsB = await createLiveDisposableWorkspace(harness);
    expect(wsA.ok && wsB.ok).toBe(true);
    if (!wsA.ok || !wsB.ok) return;
    expect(wsA.treeRoot).not.toBe(wsB.treeRoot);

    const activeA = createActiveSession(harness, {
      capabilityId: "candidate_workspace_read_write_delete",
      workspace: { workspaceId: wsA.workspaceId, workspaceManifestHash: wsA.manifestHash },
    });
    const activeB = createActiveSession(harness, {
      capabilityId: "candidate_workspace_read_write_delete",
      workspace: { workspaceId: wsB.workspaceId, workspaceManifestHash: wsB.manifestHash },
    });
    expect(activeA.ok && activeB.ok).toBe(true);
    if (!activeA.ok || !activeB.ok) return;

    const runnerA = new CwdRunner();
    const runnerB = new CwdRunner();
    const serviceA = buildService(harness, runnerA);
    const serviceB = buildService(harness, runnerB);

    const resA = await serviceA.executeFixedRecipe(
      makeExecutionRequest(harness, activeA.session, {
        capabilityId: "candidate_workspace_read_write_delete",
        recipeId: "verify:agent-tsc",
        canonicalTargetPaths: [
          { path: `${wsA.treeRoot}/a.txt`, intent: "write" },
        ],
      }),
    );
    const resB = await serviceB.executeFixedRecipe(
      makeExecutionRequest(harness, activeB.session, {
        capabilityId: "candidate_workspace_read_write_delete",
        recipeId: "verify:agent-tsc",
        canonicalTargetPaths: [
          { path: `${wsB.treeRoot}/b.txt`, intent: "write" },
        ],
      }),
    );
    expect(resA.ok && resB.ok).toBe(true);
    if (!resA.ok || !resB.ok) return;
    expect(runnerA.calls).toHaveLength(1);
    expect(runnerB.calls).toHaveLength(1);
    const cwdA = runnerA.calls[0]!.cwd.replace(/\\/g, "/");
    const cwdB = runnerB.calls[0]!.cwd.replace(/\\/g, "/");
    expect(cwdA).not.toBe(cwdB);
    expect(cwdA).toBe(toNativeBrokerPath(wsA.treeRoot).replace(/\\/g, "/"));
    expect(cwdB).toBe(toNativeBrokerPath(wsB.treeRoot).replace(/\\/g, "/"));
  });
});
