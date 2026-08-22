import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openNuclearDb } from "../db.js";
import { env } from "../../env.js";
import { AshleyCore } from "../runtime.js";
import * as mistral from "../../mistral-client.js";
import {
  currentBuildIdentity,
  currentContractId,
  currentReleaseId,
  capabilityNames,
} from "../rollout/capabilities.js";
import { createQuestion } from "../state/questions.js";
import { parseCandidateVerificationRequest } from "../agency/thought.js";
import { createTurnDeadlinePlan, type TurnDeadlinePolicy } from "../delivery/turn-deadline-plan.js";
import * as v2Execution from "./v2-execution.js";
import type { OperationalClaimLicense } from "./engineering-types.js";
import type { CognitionVerificationRequest } from "../types.js";

const RECIPE = "typescript_fixture_compile_v1";
const HASH = "ab".repeat(32);

const M4_AVAILABLE_POLICY: TurnDeadlinePolicy = {
  version: "phase-budget-m4-cognition-test-v1",
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

const validRequest: CognitionVerificationRequest = {
  operation: "workspace.verify",
  projectId: "project-ashley",
  workspaceId: "ws-m4-1",
  recipeId: RECIPE,
};

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

function licensedSuccess(): OperationalClaimLicense {
  return {
    state: "succeeded",
    taskId: "v2-verify-1",
    profile: "candidate_verification",
    verificationClaimEffect: {
      verified: true,
      projectId: "project-ashley",
      workspaceId: "ws-m4-1",
      snapshotId: "vsnap_live_1",
      candidateTreeHash: HASH,
      recipeId: RECIPE,
      recipeVersion: "1",
      recipeDefinitionHash: HASH,
      protocolState: "admitted",
      verificationOutcome: "verified_success",
      completedAtMs: 1,
    },
  };
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
      cognitiveResult: "recipe typescript_fixture_compile_v1 produced verified_success against snapshot vsnap_live_1",
      motivationIds: [1],
      shouldSpeak: true,
      ...extra,
    }),
    model: "mistral-large",
    modelAlias: "thought",
    resolvedModelId: "mistral-large",
  };
}

describe("parseCandidateVerificationRequest", () => {
  it("accepts a minimal valid verification request", () => {
    expect(parseCandidateVerificationRequest(validRequest)).toEqual({
      ok: true,
      request: validRequest,
    });
  });

  it.each([
    "command",
    "argv",
    "executable",
    "environment",
    "network",
  ] as const)("rejects %s field", (field) => {
    const result = parseCandidateVerificationRequest({
      ...validRequest,
      [field]: "forbidden",
    });
    expect(result).toEqual({
      ok: false,
      errorCode: "unsupported_operation",
      field,
    });
  });

  it.each(["projectId", "workspaceId", "recipeId"] as const)(
    "rejects missing %s",
    (field) => {
      const { [field]: _omit, ...rest } = validRequest;
      void _omit;
      const result = parseCandidateVerificationRequest(rest);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("missing_required_field");
      expect(result.field).toBe(field);
    },
  );
});

describe("M4 Phase E cognition and turn admission", () => {
  const originalMode = env.cognitionMode;
  const originalGroqKey = env.groqApiKey;
  const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
  const originalRegistryPath = env.sandboxProjectRegistryPath;

  let tmpDir: string;

  beforeEach(() => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test-key";
    env.sandboxEngineeringLifecycleEnabled = true;
    process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";
    tmpDir = mkdtempSync(join(tmpdir(), "v2-m4-phase-e-"));
    const registryPath = join(tmpDir, "registry.json");
    writeFileSync(
      registryPath,
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: "/home/xarvak/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: false,
          engineeringAllowed: false,
          verificationAllowed: true,
          allowedRecipeIds: [RECIPE],
        },
      ]),
    );
    env.sandboxProjectRegistryPath = registryPath;
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
      JSON.stringify([{ ...{
        projectId: "project-ashley",
        canonicalRoot: "/home/xarvak/project-ashley",
        displayName: "Ashley",
        enabled: true,
        readAllowed: true,
        candidateWorkspaceAllowed: false,
        engineeringAllowed: false,
        verificationAllowed: false,
        allowedRecipeIds: [],
      }, ...entry }]),
    );
  }

  async function runReactive(opts: {
    exceptCaps?: string[];
    pass1?: Record<string, unknown>;
    pass2Extra?: Record<string, unknown>;
    pass2FirstExtra?: Record<string, unknown>;
    deadlinePolicy?: TurnDeadlinePolicy;
    captureContinuation?: { user?: string };
  }) {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db, opts.exceptCaps);
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2").mockResolvedValue({
      license: licensedSuccess(),
    });
    let continuationAttempts = 0;
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return thoughtPass1(opts.pass1 ?? validRequest);
      }
      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        continuationAttempts += 1;
        const user = messages.find((m) => m.role === "user")?.content ?? "";
        if (opts.captureContinuation) opts.captureContinuation.user = String(user);
        if (continuationAttempts === 1 && opts.pass2FirstExtra) {
          return thoughtPass2(opts.pass2FirstExtra);
        }
        return thoughtPass2(opts.pass2Extra);
      }
      return {
        text: "The verification recipe completed with outcome verified_success for snapshot vsnap_live_1.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: "Please verify the candidate snapshot.",
      ownerId: "doc",
      channel: "discord",
      ...(opts.deadlinePolicy ? { turnDeadlinePolicy: opts.deadlinePolicy } : {}),
    });
    return { db, execute, result, continuationAttempts };
  }

  it("capability disabled refuses without executing", async () => {
    const { execute } = await runReactive({
      exceptCaps: ["candidate_verification"],
      deadlinePolicy: M4_AVAILABLE_POLICY,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("registry disabled refuses without executing", async () => {
    writeRegistry({ verificationAllowed: false, allowedRecipeIds: [RECIPE] });
    const { execute } = await runReactive({ deadlinePolicy: M4_AVAILABLE_POLICY });
    expect(execute).not.toHaveBeenCalled();
  });

  it("recipe not on allowlist is refused by execute", async () => {
    writeRegistry({
      verificationAllowed: true,
      allowedRecipeIds: ["other_recipe"],
    });
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    const { db } = await (async () => {
      const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
      activateCapabilities(db);
      vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
        const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
        if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
          return thoughtPass1(validRequest);
        }
        if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
          return thoughtPass2();
        }
        return {
          text: "ok",
          model: "mistral-large",
          modelAlias: "expression",
          resolvedModelId: "mistral-large",
        };
      });
      const core = new AshleyCore(db);
      await core.handleReactiveChat({
        message: "Please verify the candidate snapshot.",
        ownerId: "doc",
        channel: "discord",
        turnDeadlinePolicy: M4_AVAILABLE_POLICY,
      });
      return { db };
    })();
    expect(execute).toHaveBeenCalledTimes(1);
    const license = await execute.mock.results[0]?.value;
    expect(license?.license.error).toBe("recipe_not_allowed");
    db.close();
  });

  it("engineeringAllowed=true does not grant M4", async () => {
    writeRegistry({
      engineeringAllowed: true,
      verificationAllowed: false,
      allowedRecipeIds: [RECIPE],
    });
    const { execute } = await runReactive({ deadlinePolicy: M4_AVAILABLE_POLICY });
    expect(execute).not.toHaveBeenCalled();
  });

  it("sandbox unavailable closes the offer so M4 does not execute", async () => {
    delete process.env.SANDBOX_V2_FORCE_AVAILABLE;
    const { execute } = await runReactive({ deadlinePolicy: M4_AVAILABLE_POLICY });
    expect(execute).not.toHaveBeenCalled();
  });

  it("default deadline branch remains unavailable and refuses M4", async () => {
    const { execute } = await runReactive({});
    expect(execute).not.toHaveBeenCalled();
    expect(createTurnDeadlinePlan(1_000_000).branches.candidate_verification.available).toBe(
      false,
    );
  });

  it("routes a valid M4 request and leaves M1/M2/M3 unexecuted", async () => {
    const m1 = vi.spyOn(v2Execution, "executeReactiveSandboxTaskV2");
    const m2 = vi.spyOn(v2Execution, "executeProjectInspectionV2");
    const m3 = vi.spyOn(v2Execution, "executeWorkspaceExperimentV2");
    const { execute, result } = await runReactive({ deadlinePolicy: M4_AVAILABLE_POLICY });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0].request).toEqual(validRequest);
    expect(m1).not.toHaveBeenCalled();
    expect(m2).not.toHaveBeenCalled();
    expect(m3).not.toHaveBeenCalled();
    expect(result.text).toContain("verified_success");
  });

  it("fails closed on multiple sandbox operations", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    const m2 = vi.spyOn(v2Execution, "executeProjectInspectionV2");
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "do two sandbox things",
            reason: "invalid",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "acquire_project_evidence",
            operationalRequest: {
              kind: "candidate_verification",
              request: validRequest,
            },
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "package.json",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }
      return {
        text: "plain reply",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    await core.handleReactiveChat({
      message: "Inspect and verify.",
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: M4_AVAILABLE_POLICY,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(m2).not.toHaveBeenCalled();
    db.close();
  });

  it("fails closed on unknown operationalRequest kind", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "unknown op",
            reason: "invalid",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
            operationalRequest: { kind: "laser_beams", request: {} },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }
      return {
        text: "plain reply",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    await core.handleReactiveChat({
      message: "Do a laser thing.",
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: M4_AVAILABLE_POLICY,
    });
    expect(execute).not.toHaveBeenCalled();
    db.close();
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
        return thoughtPass1(validRequest);
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
    db.close();
  });

  it("does not retry execute after a mechanical verified_failure", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    const license: OperationalClaimLicense = {
      ...licensedSuccess(),
      verificationClaimEffect: {
        ...licensedSuccess().verificationClaimEffect!,
        verificationOutcome: "verified_failure",
      },
    };
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2").mockResolvedValue({
      license,
    });
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return thoughtPass1(validRequest);
      }
      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        return thoughtPass2({
          cognitiveResult:
            "recipe typescript_fixture_compile_v1 produced verified_failure against snapshot vsnap_live_1",
        });
      }
      return {
        text: "The verification recipe completed with outcome verified_failure for snapshot vsnap_live_1.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    await core.handleReactiveChat({
      message: "Please verify the candidate snapshot.",
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: M4_AVAILABLE_POLICY,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    db.close();
  });

  it("Pass 2 receives snapshot, recipe, and outcome and cannot emit another request", async () => {
    const capture: { user?: string } = {};
    const { execute, continuationAttempts } = await runReactive({
      deadlinePolicy: M4_AVAILABLE_POLICY,
      captureContinuation: capture,
      pass2FirstExtra: {
        operationalRequest: {
          kind: "candidate_verification",
          request: validRequest,
        },
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(continuationAttempts).toBe(2);
    expect(capture.user).toContain("vsnap_live_1");
    expect(capture.user).toContain(RECIPE);
    expect(capture.user).toContain("verified_success");
  });
});
