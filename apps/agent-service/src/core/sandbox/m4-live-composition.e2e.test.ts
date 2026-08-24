import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { WorkspaceManager } from "@composer-assistant/sandbox-v2";
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
import { PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY } from "../delivery/turn-deadline-plan.js";
import * as v2Execution from "./v2-execution.js";
import { loadOperatorProjectReadRegistry } from "./project-registry.js";
import { resolveVerificationBinding } from "./verification-binding.js";
import type { OperationalClaimLicense } from "./engineering-types.js";
import { groqReasoningEffortForModel } from "../model-routing/adapters/groq-adapter.js";
import { THOUGHT_MAX_OUTPUT_TOKENS } from "../agency/thought.js";

/** Exact post-98ec359 owner Discord smoke utterance. */
export const M4_LIVE_SMOKE_UTTERANCE =
  "Verify the current candidate workspace for Project Ashley using the verification capability available to you. Report the mechanical outcome only. Don’t tell me whether the change is good, and don’t modify anything.";

const RECIPE = "typescript_fixture_compile_v1";
const CURRENT_WORKSPACE = "ZZZvUs-K1s43xWw4psdMOw";
const HASH = "ab".repeat(32);

function activateCapabilities(db: DatabaseSync): void {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  for (const cap of capabilityNames) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

function chatResult(text: string, alias: string) {
  return {
    text,
    model: alias,
    modelAlias: alias,
    resolvedModelId: alias,
  };
}

function licensedSuccess(): OperationalClaimLicense {
  return {
    state: "succeeded",
    taskId: "v2-verify-e2e",
    profile: "candidate_verification",
    verificationClaimEffect: {
      verified: true,
      projectId: "project-ashley",
      workspaceId: CURRENT_WORKSPACE,
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

describe("M4 production-equivalent live composition", () => {
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
    tmpDir = mkdtempSync(join(tmpdir(), "v2-m4-live-comp-"));
    writeFileSync(
      join(tmpDir, "registry.json"),
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: "/home/xarvak/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: true,
          engineeringAllowed: false,
          verificationAllowed: true,
          allowedRecipeIds: [RECIPE],
        },
      ]),
    );
    env.sandboxProjectRegistryPath = join(tmpDir, "registry.json");
    vi.spyOn(WorkspaceManager.prototype, "listProjectWorkspaces").mockReturnValue([
      {
        schemaVersion: 2,
        workspaceId: CURRENT_WORKSPACE,
        projectId: "project-ashley",
        createdAt: "2026-08-23T20:00:00.000Z",
        lastUsedAt: "2026-08-23T20:47:01.875Z",
        sourceSnapshotId: "snap-current",
      },
    ]);
  });

  afterEach(() => {
    env.cognitionMode = originalMode;
    env.groqApiKey = originalGroqKey;
    env.sandboxEngineeringLifecycleEnabled = originalLifecycle;
    env.sandboxProjectRegistryPath = originalRegistryPath;
    delete process.env.SANDBOX_V2_FORCE_AVAILABLE;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    vi.restoreAllMocks();
  });

  it("Case B: composed Thought contract makes omitted-id M4 representable", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    const captured: {
      system?: string;
      user?: string;
      options?: Record<string, unknown>;
    } = {};
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages, options) => {
      const systemContent = String(messages.find((m) => m.role === "system")?.content ?? "");
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        captured.system = systemContent;
        captured.user = String(messages.find((m) => m.role === "user")?.content ?? "");
        captured.options = {
          maxTokens: options?.maxTokens,
          reasoningEffort: options?.reasoningEffort,
          responseFormat: options?.responseFormat,
        };
        return chatResult(
          JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "answer without executing",
            reason: "contract inspection only",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
          }),
          "thought",
        );
      }
      return chatResult("No verification this inspection-only pass.", "expression");
    });
    const core = new AshleyCore(db);
    await core.handleReactiveChat({
      message: M4_LIVE_SMOKE_UTTERANCE,
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY,
    });
    db.close();

    expect(captured.system).toBeTruthy();
    expect(captured.user).toContain("Verify the current candidate workspace for Project Ashley");
    expect(captured.system).toContain("candidate_verification");
    expect(captured.system).toContain("project-ashley");
    expect(captured.system).toContain("currently resolvable");
    expect(captured.system).toMatch(/omit workspaceId/);
    expect(captured.system).toContain("not by itself mechanical verification");
    expect(captured.system).toContain("operation: \"workspace.verify\"");
    expect(captured.options).toEqual({
      maxTokens: THOUGHT_MAX_OUTPUT_TOKENS,
      reasoningEffort: "low",
      responseFormat: "json_object",
    });
    expect(groqReasoningEffortForModel("openai/gpt-oss-120b", "low")).toBe("low");
    expect(groqReasoningEffortForModel("openai/gpt-oss-120b", "none")).toBe("low");
  });

  it("Case A: omitted-id candidate_verification from the smoke utterance reaches M4 execute", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2").mockResolvedValue({
      license: licensedSuccess(),
    });
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages, options) => {
      const systemContent = String(messages.find((m) => m.role === "system")?.content ?? "");
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        expect(options?.reasoningEffort).toBe("low");
        expect(systemContent).toContain("currently resolvable");
        return chatResult(
          JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "run mechanical candidate verification",
            reason: "owner asked for the verification capability outcome only",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
            operationalRequest: {
              kind: "candidate_verification",
              request: {
                operation: "workspace.verify",
                projectId: "project-ashley",
              },
            },
          }),
          "thought",
        );
      }
      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        return chatResult(
          JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "report mechanical outcome",
            reason: "recipe completed",
            cognitiveResult:
              "recipe typescript_fixture_compile_v1 produced verified_success",
            motivationIds: [1],
            shouldSpeak: true,
          }),
          "thought",
        );
      }
      return chatResult(
        "Mechanical verification outcome: verified_success for recipe typescript_fixture_compile_v1.",
        "expression",
      );
    });

    const registry = loadOperatorProjectReadRegistry();
    const entry = registry.resolveReadRoot("project-ashley");
    expect(entry.ok).toBe(true);
    if (!entry.ok) return;
    const bound = resolveVerificationBinding({
      projectId: "project-ashley",
      entry: entry.entry,
    });
    expect(bound).toEqual({
      ok: true,
      workspaceId: CURRENT_WORKSPACE,
      recipeId: RECIPE,
    });

    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: M4_LIVE_SMOKE_UTTERANCE,
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]?.request).toEqual({
      operation: "workspace.verify",
      projectId: "project-ashley",
    });
    expect(result.text.toLowerCase()).toMatch(/verified_success|mechanical verification/);
    expect(result.text).not.toBe("I did not run a verification this turn.");
    db.close();
  });

  it("does not keyword-route a quality question into M4", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    const execute = vi.spyOn(v2Execution, "executeCandidateVerificationV2");
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages) => {
      const systemContent = String(messages.find((m) => m.role === "system")?.content ?? "");
      const userContent = String(messages.find((m) => m.role === "user")?.content ?? "");
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        expect(systemContent).toContain("not by itself mechanical verification");
        expect(userContent).toContain("Is this candidate good?");
        return chatResult(
          JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "answer the quality question",
            reason: "judgment is not mechanical verification",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
          }),
          "thought",
        );
      }
      return chatResult("I don't have a mechanical verification outcome.", "expression");
    });
    const core = new AshleyCore(db);
    await core.handleReactiveChat({
      message: "Is this candidate good?",
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY,
    });
    expect(execute).not.toHaveBeenCalled();
    db.close();
  });
});
