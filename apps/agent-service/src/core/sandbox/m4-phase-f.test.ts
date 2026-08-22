import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  RecipeCatalog,
  SandboxV2Dispatcher,
  WorkspaceManager,
  computeProvisionalCandidateTreeHash,
  isSandboxV2Request,
  typescriptFixtureCompileV1,
  type SandboxV2Request,
  type VerificationSpawnInput,
} from "@composer-assistant/sandbox-v2";
import { openNuclearDb } from "../db.js";
import { env } from "../../env.js";
import { AshleyCore } from "../runtime.js";
import * as mistral from "../../mistral-client.js";
import {
  capabilityNames,
  currentBuildIdentity,
  currentContractId,
  currentReleaseId,
} from "../rollout/capabilities.js";
import { createQuestion } from "../state/questions.js";
import { parseCandidateVerificationRequest } from "../agency/thought.js";
import { enqueueCognitiveJob } from "../cognition/jobs.js";
import { processNextCognitiveJob } from "../cognition/worker.js";
import type { TurnDeadlinePolicy } from "../delivery/turn-deadline-plan.js";
import { loadOperatorProjectReadRegistry } from "./project-registry.js";
import { formatSandboxV2LicenseAudit } from "./v2-license-audit.js";
import * as v2Execution from "./v2-execution.js";
import type { CognitionVerificationRequest } from "../types.js";

const RECIPE = "typescript_fixture_compile_v1";
const PROJECT = "m4-fixture";
const FORBIDDEN_EXPRESSION = [
  "the code is correct",
  "the change works",
  "the candidate is good",
  "the project is ready",
  "Ashley improved herself",
  "the change should be merged",
] as const;

const M4_F_POLICY: TurnDeadlinePolicy = {
  version: "phase-budget-m4-witness-test-v1",
  qualification: "test_only",
  softResponsivenessTargetMs: 5_000,
  initialThoughtMs: 6_000,
  externalTransportMs: 120_000,
  firstBubbleReceiptReserveMs: 5_000,
  finalDeliveryReserveMs: 120_000,
  ordinary: { perceptionMs: 20_000, expressionMs: 4_000, generationSettlementMs: 4_000 },
  sandboxM1: {
    childExecutionMs: 30_000,
    acquisitionSettlementMs: 4_000,
    cleanupReserveMs: 1_000,
    perceptionMs: 20_000,
    expressionMs: 4_000,
    generationSettlementMs: 4_000,
  },
  projectInspection: {
    projectInspectionPreparationMs: 30_000,
    childExecutionMs: {
      "project.read_file": 6_000,
      "project.list_directory": 6_000,
      "project.search_text": 6_000,
    },
    acquisitionSettlementMs: 4_000,
    cleanupReserveMs: 1_000,
    continuationMs: 6_000,
    perceptionMs: 20_000,
    expressionMs: 4_000,
    generationSettlementMs: 4_000,
  },
  candidateWorkspaceExperiment: {
    available: false,
    unavailableReason: "candidate_workspace_closed",
  },
  candidateVerification: {
    available: true,
    childExecutionMs: 6_000,
    acquisitionSettlementMs: 4_000,
    cleanupReserveMs: 1_000,
    continuationMs: 6_000,
    perceptionMs: 20_000,
    expressionMs: 4_000,
    generationSettlementMs: 4_000,
  },
};

type VerifyMode = "success" | "compile_fail" | "timeout" | "mutate";

function gitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function activateCapabilities(db: DatabaseSync, except: readonly string[] = []): void {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  for (const cap of capabilityNames) {
    if (except.includes(cap)) continue;
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

function thoughtPass1(request: Record<string, unknown>) {
  return {
    text: JSON.stringify({
      kind: "speak",
      effort: "high",
      completion: "complete",
      objective: "verify the candidate snapshot",
      reason: "user asked for a mechanical check",
      motivationIds: [1],
      shouldSpeak: true,
      evidenceDisposition: "sufficient",
      operationalRequest: {
        kind: "candidate_verification",
        request,
      },
    }),
    model: "mistral-large",
    modelAlias: "thought",
    resolvedModelId: "mistral-large",
  };
}

function thoughtPass2(extra: Record<string, unknown> = {}) {
  return {
    text: JSON.stringify({
      kind: "speak",
      effort: "medium",
      completion: "complete",
      objective: "report the mechanical verification outcome",
      reason: "recipe completed against the named snapshot",
      cognitiveResult:
        "recipe typescript_fixture_compile_v1 produced a mechanical outcome against the named snapshot",
      motivationIds: [1],
      shouldSpeak: true,
      ...extra,
    }),
    model: "mistral-large",
    modelAlias: "thought",
    resolvedModelId: "mistral-large",
  };
}

describe("M4 Phase F end-to-end verification witness", () => {
  const originalMode = env.cognitionMode;
  const originalGroqKey = env.groqApiKey;
  const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
  const originalRegistryPath = env.sandboxProjectRegistryPath;

  let tmpDir: string;
  let liveRepoDir: string;
  let managedWorkspacesDir: string;
  let workspaceId: string;
  let workspaceTreeRoot: string;
  let verifyMode: VerifyMode;
  let verifyDispatches: SandboxV2Request[];
  let expressionSystem = "";

  beforeEach(async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test-key";
    env.sandboxEngineeringLifecycleEnabled = true;
    process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";
    tmpDir = mkdtempSync(join(tmpdir(), "v2-m4-phase-f-"));
    liveRepoDir = join(tmpDir, "fixture-compile-project");
    managedWorkspacesDir = join(tmpDir, "managed-workspaces");
    mkdirSync(join(liveRepoDir, "src"), { recursive: true });
    mkdirSync(managedWorkspacesDir, { recursive: true });
    writeFileSync(join(liveRepoDir, "src", "ok.ts"), "export const n = 1;\n", "utf8");

    const registryPath = join(tmpDir, "registry.json");
    writeFileSync(
      registryPath,
      JSON.stringify([
        {
          projectId: PROJECT,
          canonicalRoot: "/srv/projects/m4-fixture",
          displayName: "M4 fixture",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: true,
          engineeringAllowed: false,
          verificationAllowed: true,
          allowedRecipeIds: [RECIPE],
        },
      ]),
    );
    env.sandboxProjectRegistryPath = registryPath;

    const manager = new WorkspaceManager({ managedRoot: managedWorkspacesDir });
    const acquired = await manager.acquireWorkspace({
      projectId: PROJECT,
      canonicalRoot: liveRepoDir,
    });
    if (!acquired.ok) throw new Error(acquired.error);
    workspaceId = acquired.workspaceId;
    workspaceTreeRoot = acquired.workspaceTreeRoot;
    verifyMode = "success";
    verifyDispatches = [];
    expressionSystem = "";

    const catalog = new RecipeCatalog([
      {
        ...typescriptFixtureCompileV1(),
        executableIdentity: "test:fixture-compiler",
        executablePath: "/opt/fixture/compiler",
        argv: ["--compile", "/candidate", "--out", "/output"],
      },
    ]);
    const fixtureDispatcher = new SandboxV2Dispatcher({
      env: {
        registry: loadOperatorProjectReadRegistry(),
        workspaceManager: manager,
        recipeCatalog: catalog,
        sandboxAvailable: () => true,
        spawnVerification: async (input: VerificationSpawnInput) => {
          if (verifyMode === "mutate") {
            writeFileSync(join(input.candidateRoot, "leaked.ts"), "export const leaked = 1;\n");
            return {
              exitCode: 0,
              stdout: "",
              stderr: "",
              timedOut: false,
              stdoutOverflow: false,
              stderrOverflow: false,
            };
          }
          if (verifyMode === "timeout") {
            return {
              exitCode: null,
              stdout: "",
              stderr: "",
              timedOut: true,
              stdoutOverflow: false,
              stderrOverflow: false,
            };
          }
          if (verifyMode === "compile_fail") {
            writeFileSync(join(input.projectionRoot, "compile-marker"), "artifact");
            return {
              exitCode: 1,
              stdout: "error TS2322\n",
              stderr: "",
              timedOut: false,
              stdoutOverflow: false,
              stderrOverflow: false,
            };
          }
          writeFileSync(join(input.projectionRoot, "ok.js"), "export const n = 1;\n");
          return {
            exitCode: 0,
            stdout: "",
            stderr: "",
            timedOut: false,
            stdoutOverflow: false,
            stderrOverflow: false,
          };
        },
      },
    });
    const originalDispatch = SandboxV2Dispatcher.prototype.dispatch;
    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockImplementation(async (req: unknown) => {
      if (isSandboxV2Request(req)) verifyDispatches.push(req);
      return originalDispatch.call(fixtureDispatcher, req);
    });
  });

  afterEach(() => {
    env.cognitionMode = originalMode;
    env.groqApiKey = originalGroqKey;
    env.sandboxEngineeringLifecycleEnabled = originalLifecycle;
    env.sandboxProjectRegistryPath = originalRegistryPath;
    delete process.env.SANDBOX_V2_FORCE_AVAILABLE;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    vi.restoreAllMocks();
  });

  function writeRegistry(entry: Record<string, unknown>): void {
    writeFileSync(
      env.sandboxProjectRegistryPath,
      JSON.stringify([
        {
          projectId: PROJECT,
          canonicalRoot: "/srv/projects/m4-fixture",
          displayName: "M4 fixture",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: true,
          engineeringAllowed: false,
          verificationAllowed: false,
          allowedRecipeIds: [],
          ...entry,
        },
      ]),
    );
  }

  function validRequest(): CognitionVerificationRequest {
    return {
      operation: "workspace.verify",
      projectId: PROJECT,
      workspaceId,
      recipeId: RECIPE,
    };
  }

  async function runReactive(opts: {
    exceptCaps?: string[];
    pass1?: Record<string, unknown>;
    pass2FirstExtra?: Record<string, unknown>;
    expressionText?: string;
    deadlinePolicy?: TurnDeadlinePolicy;
  }) {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db, opts.exceptCaps);
    let continuationAttempts = 0;
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return thoughtPass1(opts.pass1 ?? validRequest());
      }
      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        continuationAttempts += 1;
        if (continuationAttempts === 1 && opts.pass2FirstExtra) {
          return thoughtPass2(opts.pass2FirstExtra);
        }
        return thoughtPass2();
      }
      expressionSystem = systemContent;
      return {
        text: opts.expressionText ?? "the code is correct. the change should be merged.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: "Please verify the candidate snapshot with the fixture recipe.",
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: opts.deadlinePolicy ?? M4_F_POLICY,
    });
    return { db, result, continuationAttempts };
  }

  it("accepts only the four allowed request fields", () => {
    const request = validRequest();
    expect(parseCandidateVerificationRequest(request)).toEqual({ ok: true, request });
    expect(Object.keys(request).sort()).toEqual(["operation", "projectId", "recipeId", "workspaceId"]);
  });

  it.each(["command", "argv", "executable", "environment", "network", "shell"] as const)(
    "Thought cannot add %s",
    async (field) => {
      const { result } = await runReactive({
        pass1: { ...validRequest(), [field]: "forbidden" },
      });
      expect(verifyDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(0);
      expect(result.text.toLowerCase()).not.toContain("verified_success");
    },
  );

  it("capability disabled refuses without execution", async () => {
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    await runReactive({ exceptCaps: ["candidate_verification"] });
    expect(execute).not.toHaveBeenCalled();
    expect(verifyDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(0);
  });

  it("registry disabled refuses without execution", async () => {
    writeRegistry({ verificationAllowed: false, allowedRecipeIds: [RECIPE] });
    await runReactive({});
    expect(verifyDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(0);
  });

  it("recipe not on allowlist refuses without a licensed claim", async () => {
    writeRegistry({ verificationAllowed: true, allowedRecipeIds: ["other_recipe"] });
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    await runReactive({});
    expect(execute).toHaveBeenCalledTimes(1);
    const license = (await execute.mock.results[0]?.value)?.license;
    expect(license?.error).toBe("recipe_not_allowed");
    expect(license?.verificationClaimEffect).toBeUndefined();
    expect(verifyDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(0);
  });

  it("success witness: Thought request → fixture recipe → license → locked mechanical Expression", async () => {
    const beforeHash = computeProvisionalCandidateTreeHash(workspaceTreeRoot);
    const liveBefore = readFileSync(join(liveRepoDir, "src", "ok.ts"), "utf8");
    const { result, continuationAttempts, db } = await runReactive({});
    const afterHash = computeProvisionalCandidateTreeHash(workspaceTreeRoot);
    expect(afterHash).toBe(beforeHash);
    expect(readFileSync(join(liveRepoDir, "src", "ok.ts"), "utf8")).toBe(liveBefore);
    expect(existsSync(join(workspaceTreeRoot, "ok.js"))).toBe(false);
    expect(continuationAttempts).toBeGreaterThanOrEqual(1);

    const verifyReqs = verifyDispatches.filter((req) => req.operation === "workspace.verify");
    expect(verifyReqs).toHaveLength(1);
    expect(verifyReqs[0]).toEqual({
      version: 2,
      operation: "workspace.verify",
      projectId: PROJECT,
      workspaceId,
      recipeId: RECIPE,
    });
    expect(JSON.stringify(verifyReqs[0])).not.toMatch(
      /"command"|"argv"|"executable"|"environment"|"network"|"shell"/,
    );

    expect(expressionSystem).toContain("verificationStatus = verified_success");
    expect(expressionSystem).toContain(`recipeId = ${RECIPE}`);
    expect(expressionSystem).toContain("snapshotId =");
    expect(result.text).toMatch(
      new RegExp(`recipe ${RECIPE} version 1 produced verified_success against snapshot `),
    );
    for (const phrase of FORBIDDEN_EXPRESSION) {
      expect(result.text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }

    const witness = {
      gitSha: gitSha(),
      workspaceId,
      snapshotId: result.text.match(/snapshot (\S+)\./)?.[1] ?? null,
      recipeId: RECIPE,
      recipeVersion: "1",
      receiptOutcome: "verified_success",
      licenseProfile: "candidate_verification",
      operationalTruth: "verified_success",
      testName: "success witness: Thought request → fixture recipe → license → locked mechanical Expression",
    };
    expect(witness.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(witness.workspaceId).toBe(workspaceId);
    expect(witness.snapshotId).toBeTruthy();
    db.close();
  });

  it("Expression cannot convert verified_success into engineering judgment", async () => {
    const { result } = await runReactive({
      expressionText: `${FORBIDDEN_EXPRESSION.join(". ")}.`,
    });
    expect(result.text).toContain(
      `recipe ${RECIPE} version 1 produced verified_success against snapshot`,
    );
    for (const phrase of FORBIDDEN_EXPRESSION) {
      expect(result.text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("compile failure is admitted verified_failure, not sandbox failure or judgment", async () => {
    verifyMode = "compile_fail";
    const beforeHash = computeProvisionalCandidateTreeHash(workspaceTreeRoot);
    const { result } = await runReactive({
      expressionText: "the code is correct. the candidate is good.",
    });
    expect(computeProvisionalCandidateTreeHash(workspaceTreeRoot)).toBe(beforeHash);
    expect(result.text).toContain("verified_failure");
    expect(result.text).not.toContain("sandbox_failure");
    expect(result.text.toLowerCase()).not.toContain("correct");
    expect(expressionSystem).toContain("verificationStatus = verified_failure");
  });

  it("timeout is outcome_unknown and must not claim verified_failure", async () => {
    verifyMode = "timeout";
    const { result } = await runReactive({
      expressionText: "the compile failed. verified_failure.",
    });
    expect(result.text).toContain("recipe postcondition is unknown");
    expect(result.text.toLowerCase()).not.toContain("verified_failure");
    expect(expressionSystem).toContain("verificationStatus = outcome_unknown");
  });

  it("sandbox failure keeps recipe outcome unknown", async () => {
    verifyMode = "mutate";
    const { result } = await runReactive({
      expressionText: "the compile failed with verified_failure.",
    });
    expect(result.text).toContain("sandbox_failure");
    expect(result.text.toLowerCase()).not.toContain("verified_failure");
    expect(expressionSystem).toContain("protocolState = sandbox_failure");
  });

  it("M3 mutates the candidate and M4 observes without mutating it", async () => {
    const hashBeforeM3 = computeProvisionalCandidateTreeHash(workspaceTreeRoot);
    writeFileSync(join(workspaceTreeRoot, "m3-mutation.ts"), "export const added = 2;\n", "utf8");
    const hashAfterM3 = computeProvisionalCandidateTreeHash(workspaceTreeRoot);
    expect(hashAfterM3).not.toBe(hashBeforeM3);
    const liveBefore = readFileSync(join(liveRepoDir, "src", "ok.ts"), "utf8");
    verifyMode = "success";
    await runReactive({});
    const hashAfterM4 = computeProvisionalCandidateTreeHash(workspaceTreeRoot);
    expect(hashAfterM4).toBe(hashAfterM3);
    expect(readFileSync(join(workspaceTreeRoot, "m3-mutation.ts"), "utf8")).toBe(
      "export const added = 2;\n",
    );
    expect(existsSync(join(liveRepoDir, "m3-mutation.ts"))).toBe(false);
    expect(readFileSync(join(liveRepoDir, "src", "ok.ts"), "utf8")).toBe(liveBefore);
    expect(verifyDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(1);
  });

  it("Pass 2 cannot chain another verification in the same turn", async () => {
    const { continuationAttempts } = await runReactive({
      pass2FirstExtra: {
        operationalRequest: {
          kind: "candidate_verification",
          request: validRequest(),
        },
      },
    });
    expect(verifyDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(1);
    expect(continuationAttempts).toBe(2);
  });

  it("proactive ticks cannot execute M4", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "should we verify in the background?",
      priority: 80,
    });
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return thoughtPass1(validRequest());
      }
      return {
        text: "proactive response",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    await core.tickProactive("doc");
    expect(execute).not.toHaveBeenCalled();
    expect(verifyDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(0);
    db.close();
  });

  it("curiosity / cognition worker cannot invoke M4", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    enqueueCognitiveJob(db, {
      ownerId: "doc",
      kind: "consolidate_curiosity",
      sourceKey: "m4-phase-f-curiosity",
      payload: { readId: 1 },
    });
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    try {
      await processNextCognitiveJob(db, "apply");
    } catch {
      // Invalid curiosity payload must still fail closed without M4.
    }
    expect(execute).not.toHaveBeenCalled();
    expect(verifyDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(0);
    db.close();
  });

  it("license audit is a witness record, not memory", async () => {
    const audits: string[] = [];
    const originalInfo = console.info;
    console.info = ((...args: unknown[]) => {
      audits.push(args.map(String).join(" "));
    }) as typeof console.info;
    try {
      await runReactive({});
    } finally {
      console.info = originalInfo;
    }
    const line = audits.find((entry) => entry.includes("ASHLEY_SANDBOX_V2_LICENSE"));
    expect(line).toBeTruthy();
    const parsed = JSON.parse(String(line).replace(/^\[ASHLEY_SANDBOX_V2_LICENSE\] /, ""));
    expect(parsed.discriminator).toBe("ASHLEY_SANDBOX_V2_LICENSE");
    expect(parsed.profile).toBe("candidate_verification");
    expect(parsed.verificationEffect?.recipeId).toBe(RECIPE);
    expect(parsed.verificationEffect?.verificationOutcome).toBe("verified_success");
    expect(formatSandboxV2LicenseAudit).toBeTypeOf("function");
  });
});
