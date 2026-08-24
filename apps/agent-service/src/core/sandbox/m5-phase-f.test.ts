import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  SandboxV2Dispatcher,
  WorkspaceManager,
  computeProvisionalCandidateTreeHash,
  isSandboxV2Request,
  refuseApplyCandidateChangeSet,
  type SandboxV2Request,
} from "@composer-assistant/sandbox-v2";
import { openNuclearDb } from "../db.js";
import { env } from "../../env.js";
import { AshleyCore } from "../runtime.js";
import * as mistral from "../../mistral-client.js";
import {
  capabilityNames,
  capabilityCanInfluence,
  currentBuildIdentity,
  currentContractId,
  currentReleaseId,
} from "../rollout/capabilities.js";
import { currentModelEpoch } from "../attention/continuity.js";
import { createQuestion } from "../state/questions.js";
import { parseCandidateAuthorshipRequest } from "../agency/thought.js";
import { enqueueCognitiveJob } from "../cognition/jobs.js";
import { processNextCognitiveJob } from "../cognition/worker.js";
import type { TurnDeadlinePolicy } from "../delivery/turn-deadline-plan.js";
import {
  loadOperatorProjectReadRegistry,
  canOfferCandidateAuthorship,
  listApprovedReadProjectIds,
} from "./project-registry.js";
import { isSandboxV2Available } from "./v2-execution.js";
import { formatSandboxV2LicenseAudit } from "./v2-license-audit.js";
import { getChangeSet, listChangeSetEventTypes } from "./changeset-store.js";
import * as v2Execution from "./v2-execution.js";
import type { CognitionAuthorshipRequest } from "../types.js";

const PROJECT = "m5-fixture";
const FORBIDDEN_EXPRESSION = [
  "the code is correct",
  "the change works",
  "I applied the patch",
  "Ashley improved herself",
  "the change should be merged",
] as const;

const M5_F_POLICY: TurnDeadlinePolicy = {
  version: "phase-budget-m5-witness-test-v1",
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
    available: false,
    unavailableReason: "candidate_verification_closed",
  },
  candidateAuthorship: {
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

function gitHead(cwd: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
}

function activateCapabilities(db: DatabaseSync, except: readonly string[] = []): void {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  const epoch = currentModelEpoch(db, env.mistralModel);
  for (const cap of capabilityNames) {
    if (except.includes(cap)) continue;
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, ?)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity(), epoch);
  }
}

function thoughtPass1(request: Record<string, unknown>) {
  return {
    text: JSON.stringify({
      kind: "speak",
      effort: "high",
      completion: "complete",
      objective: "propose a candidate change-set",
      reason: "user asked for a bounded proposal",
      motivationIds: [1],
      shouldSpeak: true,
      evidenceDisposition: "sufficient",
      operationalRequest: {
        kind: "candidate_authorship",
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
      objective: "report the sealed candidate change-set",
      reason: "the change-set was sealed as advisory work",
      cognitiveResult: "named candidate change-set sealed; not applied",
      motivationIds: [1],
      shouldSpeak: true,
      ...extra,
    }),
    model: "mistral-large",
    modelAlias: "thought",
    resolvedModelId: "mistral-large",
  };
}

describe("M5 Phase F end-to-end authorship witness", () => {
  const originalMode = env.cognitionMode;
  const originalGroqKey = env.groqApiKey;
  const originalNimKey = env.nimApiKey;
  const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
  const originalRegistryPath = env.sandboxProjectRegistryPath;

  let tmpDir: string;
  let liveRepoDir: string;
  let managedWorkspacesDir: string;
  let workspaceId: string;
  let workspaceTreeRoot: string;
  let liveHead: string;
  let authorDispatches: SandboxV2Request[];
  let expressionSystem = "";

  beforeEach(async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test-key";
    env.nimApiKey = "test-key";
    env.sandboxEngineeringLifecycleEnabled = true;
    process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";
    tmpDir = mkdtempSync(join(tmpdir(), "v2-m5-phase-f-"));
    liveRepoDir = join(tmpDir, "fixture-author-project");
    managedWorkspacesDir = join(tmpDir, "managed-workspaces");
    mkdirSync(join(liveRepoDir, "src"), { recursive: true });
    mkdirSync(managedWorkspacesDir, { recursive: true });
    writeFileSync(join(liveRepoDir, "src", "a.ts"), "export const a = 1;\n", "utf8");
    writeFileSync(join(liveRepoDir, "src", "b.ts"), "export const b = 1;\n", "utf8");
    execFileSync("git", ["init"], { cwd: liveRepoDir, stdio: "ignore" });
    execFileSync("git", ["add", "."], { cwd: liveRepoDir, stdio: "ignore" });
    execFileSync(
      "git",
      [
        "-c",
        "user.email=m5@test.invalid",
        "-c",
        "user.name=m5",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "init",
      ],
      { cwd: liveRepoDir, stdio: "ignore" },
    );
    liveHead = gitHead(liveRepoDir);

    const registryPath = join(tmpDir, "registry.json");
    writeFileSync(
      registryPath,
      JSON.stringify([
        {
          projectId: PROJECT,
          canonicalRoot: "/srv/projects/m5-fixture",
          displayName: "M5 fixture",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: false,
          engineeringAllowed: false,
          verificationAllowed: false,
          authorshipAllowed: true,
          allowedRecipeIds: [],
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
    writeFileSync(join(workspaceTreeRoot, "src", "a.ts"), "export const a = 2;\n", "utf8");
    writeFileSync(join(workspaceTreeRoot, "src", "b.ts"), "export const b = 2;\n", "utf8");
    authorDispatches = [];
    expressionSystem = "";

    const fixtureDispatcher = new SandboxV2Dispatcher({
      env: {
        registry: loadOperatorProjectReadRegistry(),
        workspaceManager: manager,
        sandboxAvailable: () => true,
      },
    });
    const originalDispatch = SandboxV2Dispatcher.prototype.dispatch;
    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockImplementation(async (req: unknown) => {
      if (isSandboxV2Request(req)) authorDispatches.push(req);
      return originalDispatch.call(fixtureDispatcher, req);
    });
  });

  afterEach(() => {
    env.cognitionMode = originalMode;
    env.groqApiKey = originalGroqKey;
    env.nimApiKey = originalNimKey;
    env.sandboxEngineeringLifecycleEnabled = originalLifecycle;
    env.sandboxProjectRegistryPath = originalRegistryPath;
    delete process.env.SANDBOX_V2_FORCE_AVAILABLE;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    vi.restoreAllMocks();
  });

  function validRequest(): CognitionAuthorshipRequest {
    return {
      operation: "changeset.author",
      projectId: PROJECT,
      workspaceId,
      objective: "seal the candidate delta",
      rationale: "the workspace already contains the intended files",
      riskClass: "low",
      targetArea: "src",
      expectedEffect: "two source files differ from the sanitized live base",
      evidenceRefs: ["op_verif_01"],
      intendedPaths: ["src/a.ts", "src/b.ts"],
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
    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "Please propose a bounded candidate change-set.",
      priority: 80,
    });
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
        text: opts.expressionText ?? `${FORBIDDEN_EXPRESSION.join(". ")}.`,
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    const factsBefore = (
      db.prepare("SELECT COUNT(*) AS c FROM mem_facts").get() as { c: number }
    ).c;
    const result = await core.handleReactiveChat({
      message: "Please propose a bounded candidate change-set.",
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: opts.deadlinePolicy ?? M5_F_POLICY,
    });
    return { db, result, continuationAttempts, factsBefore };
  }

  it("accepts a bounded authorship request", () => {
    const request = validRequest();
    expect(parseCandidateAuthorshipRequest(request)).toEqual({ ok: true, request });
  });

  it("seals a multi-file candidate change-set without mutating live, candidate, or git", async () => {
    const liveA = readFileSync(join(liveRepoDir, "src", "a.ts"), "utf8");
    const liveB = readFileSync(join(liveRepoDir, "src", "b.ts"), "utf8");
    const beforeHash = computeProvisionalCandidateTreeHash(workspaceTreeRoot);
    const { result, continuationAttempts, db, factsBefore } = await runReactive({});
    const afterHash = computeProvisionalCandidateTreeHash(workspaceTreeRoot);
    expect(afterHash).toBe(beforeHash);
    expect(readFileSync(join(liveRepoDir, "src", "a.ts"), "utf8")).toBe(liveA);
    expect(readFileSync(join(liveRepoDir, "src", "b.ts"), "utf8")).toBe(liveB);
    expect(gitHead(liveRepoDir)).toBe(liveHead);
    expect(existsSync(join(workspaceTreeRoot, ".git"))).toBe(false);
    expect(continuationAttempts).toBeGreaterThanOrEqual(1);

    const authorReqs = authorDispatches.filter((req) => req.operation === "changeset.author");
    expect(authorReqs).toHaveLength(1);
    expect(authorReqs[0]).toEqual({
      version: 2,
      operation: "changeset.author",
      projectId: PROJECT,
      workspaceId,
      intendedPaths: ["src/a.ts", "src/b.ts"],
    });
    expect(JSON.stringify(authorReqs[0])).not.toMatch(
      /"patch"|"diff"|"content"|"argv"|"command"|"apply"|"commit"|"merge"|"deploy"/,
    );

    expect(expressionSystem).toContain("authorshipStatus = proposed");
    expect(result.text).toMatch(
      /named candidate change-set cs_[0-9a-f]+ was sealed against this named base as advisory candidate work\. it has not been applied\./,
    );
    for (const phrase of FORBIDDEN_EXPRESSION) {
      expect(result.text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }

    const changesetId = result.text.match(/change-set (cs_[0-9a-f]+)/)?.[1];
    expect(changesetId).toBeTruthy();
    const stored = getChangeSet(db, changesetId!);
    expect(stored?.status).toBe("proposed");
    expect(stored?.review_status).toBe("submitted");
    expect(JSON.parse(stored?.evidence_refs_json ?? "[]")).toEqual(["op_verif_01"]);
    expect(stored?.patch_sha256).toHaveLength(64);
    expect(existsSync(stored?.artifact_ref ?? "")).toBe(true);
    expect(readFileSync(stored!.artifact_ref!, "utf8")).toContain("src/a.ts");
    expect(listChangeSetEventTypes(db, changesetId!)).toEqual(["created", "sealed", "proposed"]);
    expect((db.prepare("SELECT COUNT(*) AS c FROM mem_facts").get() as { c: number }).c).toBe(
      factsBefore,
    );
    expect(
      (
        db
          .prepare(`SELECT state FROM capability_releases WHERE capability = 'candidate_authorship'`)
          .get() as { state: string }
      ).state,
    ).toBe("active");
    expect(refuseApplyCandidateChangeSet().error).toBe("m5_apply_forbidden");
    const dispatcher = new SandboxV2Dispatcher({
      env: { registry: loadOperatorProjectReadRegistry() },
    });
    for (const operation of ["changeset.apply", "changeset.merge", "git.commit", "git.push"] as const) {
      const applyAttempt = await dispatcher.dispatch({
        version: 2,
        operation,
        projectId: PROJECT,
      });
      expect(applyAttempt.outcome).toBe("failed");
      if (applyAttempt.outcome === "failed") {
        expect(applyAttempt.error).toBe("m5_apply_forbidden");
      }
    }
    db.close();
  });

  it("Expression cannot convert a sealed proposal into apply or self-change", async () => {
    const { result } = await runReactive({
      expressionText: `${FORBIDDEN_EXPRESSION.join(". ")}.`,
    });
    expect(result.text).toContain("has not been applied");
    for (const phrase of FORBIDDEN_EXPRESSION) {
      expect(result.text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("Pass 2 cannot chain verification after authorship", async () => {
    const { continuationAttempts } = await runReactive({
      pass2FirstExtra: {
        operationalRequest: {
          kind: "candidate_verification",
          request: {
            operation: "workspace.verify",
            projectId: PROJECT,
            workspaceId,
            recipeId: "typescript_fixture_compile_v1",
          },
        },
      },
    });
    expect(authorDispatches.filter((req) => req.operation === "changeset.author")).toHaveLength(1);
    expect(authorDispatches.filter((req) => req.operation === "workspace.verify")).toHaveLength(0);
    expect(continuationAttempts).toBe(2);
  });

  it("proactive ticks cannot execute M5", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "should we author in the background?",
      priority: 80,
    });
    const execute = vi.spyOn(v2Execution, "executeCandidateAuthorshipV2");
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
    expect(authorDispatches.filter((req) => req.operation === "changeset.author")).toHaveLength(0);
    db.close();
  });

  it("curiosity / cognition worker cannot invoke M5", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    enqueueCognitiveJob(db, {
      ownerId: "doc",
      kind: "consolidate_curiosity",
      sourceKey: "m5-phase-f-curiosity",
      payload: { readId: 1 },
    });
    const execute = vi.spyOn(v2Execution, "executeCandidateAuthorshipV2");
    try {
      await processNextCognitiveJob(db, "apply");
    } catch {
      // Invalid curiosity payload must still fail closed without M5.
    }
    expect(execute).not.toHaveBeenCalled();
    expect(authorDispatches.filter((req) => req.operation === "changeset.author")).toHaveLength(0);
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
    expect(parsed.profile).toBe("candidate_authorship");
    expect(parsed.authorshipEffect?.status).toBe("proposed");
    expect(formatSandboxV2LicenseAudit).toBeTypeOf("function");
  });
});
