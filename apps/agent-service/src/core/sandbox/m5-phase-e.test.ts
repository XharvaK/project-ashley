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
import { parseCandidateAuthorshipRequest } from "../agency/thought.js";
import { createTurnDeadlinePlan, type TurnDeadlinePolicy } from "../delivery/turn-deadline-plan.js";
import * as v2Execution from "./v2-execution.js";
import type { OperationalClaimLicense } from "./engineering-types.js";
import type { CognitionAuthorshipRequest } from "../types.js";

const HASH = "ab".repeat(32);

const M5_AVAILABLE_POLICY: TurnDeadlinePolicy = {
  version: "phase-budget-m5-cognition-test-v1",
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

const validRequest: CognitionAuthorshipRequest = {
  operation: "changeset.author",
  projectId: "project-ashley",
  workspaceId: "ws-m5-01",
  objective: "seal the candidate delta",
  rationale: "the workspace already contains the intended files",
  riskClass: "low",
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
    taskId: "v2-author-1",
    profile: "candidate_authorship",
    authorshipClaimEffect: {
      verified: true,
      projectId: "project-ashley",
      workspaceId: "ws-m5-01",
      changesetId: "cs_" + "33".repeat(16),
      changesetVersion: 1,
      snapshotId: "vsnap_live_1",
      candidateTreeHash: HASH,
      baseTreeHash: "cd".repeat(32),
      pathCount: 2,
      patchSha256: HASH,
      status: "proposed",
      reviewStatus: "submitted",
      candidateUnchanged: true,
      liveUnwritten: true,
      protocolState: "admitted",
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

describe("parseCandidateAuthorshipRequest", () => {
  it("accepts a minimal valid authorship request", () => {
    expect(parseCandidateAuthorshipRequest(validRequest)).toEqual({
      ok: true,
      request: validRequest,
    });
  });

  it.each(["patch", "diff", "content", "argv", "command", "apply", "commit", "merge", "deploy"])(
    "rejects forbidden field %s",
    (field) => {
      const result = parseCandidateAuthorshipRequest({
        ...validRequest,
        [field]: "nope",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("unsupported_operation");
      expect(result.field).toBe(field);
    },
  );

  it.each(["projectId", "objective", "rationale", "riskClass"] as const)(
    "rejects missing %s",
    (field) => {
      const { [field]: _omit, ...rest } = validRequest;
      void _omit;
      const result = parseCandidateAuthorshipRequest(rest);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("missing_required_field");
      expect(result.field).toBe(field);
    },
  );

  it("accepts missing workspaceId (omitted for runtime resolution)", () => {
    const { workspaceId: _omit, ...rest } = validRequest;
    void _omit;
    const result = parseCandidateAuthorshipRequest(rest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.workspaceId).toBeUndefined();
  });

  it("rejects a workspaceId shorter than the kernel bound", () => {
    const result = parseCandidateAuthorshipRequest({
      ...validRequest,
      workspaceId: "short",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("payload_invalid");
    expect(result.field).toBe("workspaceId");
  });
});

describe("M5 Phase E cognition and turn admission", () => {
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
    tmpDir = mkdtempSync(join(tmpdir(), "v2-m5-phase-e-"));
    writeFileSync(
      join(tmpDir, "registry.json"),
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: "/home/xarvak/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: false,
          engineeringAllowed: false,
          authorshipAllowed: true,
        },
      ]),
    );
    env.sandboxProjectRegistryPath = join(tmpDir, "registry.json");
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

  async function runReactive(opts: {
    exceptCaps?: string[];
    pass1?: Record<string, unknown>;
    pass2Extra?: Record<string, unknown>;
    deadlinePolicy?: TurnDeadlinePolicy;
  }) {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db, opts.exceptCaps);
    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "Can you propose a bounded candidate change-set?",
      priority: 80,
    });
    const execute = vi.spyOn(v2Execution, "executeCandidateAuthorshipV2").mockResolvedValue({
      license: licensedSuccess(),
    });
    const verify = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return thoughtPass1(opts.pass1 ?? validRequest);
      }
      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        return thoughtPass2(opts.pass2Extra);
      }
      return {
        text: "named candidate change-set was sealed as advisory candidate work. it has not been applied.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: "Please propose a bounded candidate change-set.",
      ownerId: "doc",
      channel: "discord",
      ...(opts.deadlinePolicy ? { turnDeadlinePolicy: opts.deadlinePolicy } : {}),
    });
    return { db, execute, verify, result };
  }

  it("capability disabled refuses without executing", async () => {
    const { execute } = await runReactive({
      exceptCaps: ["candidate_authorship"],
      deadlinePolicy: M5_AVAILABLE_POLICY,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("production deadline branch defaults available after promotion", () => {
    expect(createTurnDeadlinePlan(1_000_000).branches.candidate_authorship.available).toBe(true);
  });

  it("executes authorship on an available test deadline branch and does not run M4", async () => {
    const { execute, verify, result } = await runReactive({ deadlinePolicy: M5_AVAILABLE_POLICY });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
    expect(result.duplicate).not.toBe(true);
    expect(result.text.toLowerCase()).toContain("has not been applied");
  });

  it("continuation cannot emit another sandbox operation", async () => {
    const { execute } = await runReactive({
      deadlinePolicy: M5_AVAILABLE_POLICY,
      pass2Extra: {
        operationalRequest: {
          kind: "candidate_verification",
          request: { operation: "workspace.verify", projectId: "project-ashley", workspaceId: "ws-m5-01", recipeId: "r" },
        },
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
