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
import { resolveAuthorshipBinding } from "./authorship-binding.js";
import type { OperationalClaimLicense } from "./engineering-types.js";
import { THOUGHT_MAX_OUTPUT_TOKENS } from "../agency/thought.js";

/** Exact owner Discord smoke utterance for M5. */
export const M5_LIVE_SMOKE_UTTERANCE =
  "Seal the current Project Ashley candidate workspace as an advisory candidate change-set using the candidate authorship capability. Do not apply, merge, commit, push, export, deploy, or restart anything. Tell me what you actually authored and sealed.";

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

function licensedAuthorshipSuccess(): OperationalClaimLicense {
  return {
    state: "succeeded",
    taskId: "v2-author-e2e",
    profile: "candidate_authorship",
    authorshipClaimEffect: {
      verified: true,
      projectId: "project-ashley",
      workspaceId: CURRENT_WORKSPACE,
      changesetId: "cs_e2e_test_0000000000000001",
      changesetVersion: 1,
      snapshotId: "snap_candidate_1",
      candidateTreeHash: HASH,
      baseTreeHash: HASH,
      pathCount: 2,
      patchSha256: HASH,
      status: "proposed",
      reviewStatus: "submitted",
      candidateUnchanged: true,
      liveUnwritten: true,
      protocolState: "admitted",
      completedAtMs: Date.now(),
    },
  };
}

describe("M5 production-equivalent live composition", () => {
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
    tmpDir = mkdtempSync(join(tmpdir(), "v2-m5-live-comp-"));
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
          authorshipAllowed: true,
          allowedRecipeIds: ["typescript_fixture_compile_v1"],
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

  it("Case B: composed Thought contract makes omitted-id M5 representable", async () => {
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
      return chatResult("No authorship this inspection-only pass.", "expression");
    });
    const core = new AshleyCore(db);
    await core.handleReactiveChat({
      message: M5_LIVE_SMOKE_UTTERANCE,
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY,
    });
    db.close();

    expect(captured.system).toBeTruthy();
    expect(captured.user).toContain("Seal the current Project Ashley candidate workspace");
    expect(captured.system).toContain("candidate_authorship");
    expect(captured.system).toContain("project-ashley");
    expect(captured.system).toContain("currently resolvable");
    expect(captured.system).toMatch(/omit workspaceId/);
    expect(captured.system).toContain("operation: \"changeset.author\"");
    expect(captured.options).toEqual({
      maxTokens: THOUGHT_MAX_OUTPUT_TOKENS,
      reasoningEffort: "low",
      responseFormat: "json_object",
    });
  });

  it("Case A: omitted-id candidate_authorship from the smoke utterance reaches M5 execute", async () => {
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);
    const execute = vi.spyOn(v2Execution, "executeCandidateAuthorshipV2").mockResolvedValue({
      license: licensedAuthorshipSuccess(),
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
            objective: "seal candidate workspace as advisory change-set",
            reason: "owner asked for candidate authorship",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
            operationalRequest: {
              kind: "candidate_authorship",
              request: {
                operation: "changeset.author",
                projectId: "project-ashley",
                objective: "seal current candidate workspace",
                rationale: "advisory candidate work for review",
                riskClass: "low",
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
            objective: "report sealed change-set",
            reason: "authorship completed",
            cognitiveResult: "candidate change-set sealed as cs_e2e_test_0000000000000001",
            motivationIds: [1],
            shouldSpeak: true,
          }),
          "thought",
        );
      }
      return chatResult(
        "Candidate change-set cs_e2e_test_0000000000000001 has been sealed for review as advisory candidate work.",
        "expression",
      );
    });

    const registry = loadOperatorProjectReadRegistry();
    const entry = registry.resolveReadRoot("project-ashley");
    expect(entry.ok).toBe(true);
    if (!entry.ok) return;
    const bound = resolveAuthorshipBinding({
      projectId: "project-ashley",
      entry: entry.entry,
    });
    expect(bound).toEqual({
      ok: true,
      workspaceId: CURRENT_WORKSPACE,
    });

    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: M5_LIVE_SMOKE_UTTERANCE,
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]?.request).toEqual({
      operation: "changeset.author",
      projectId: "project-ashley",
      objective: "seal current candidate workspace",
      rationale: "advisory candidate work for review",
      riskClass: "low",
    });
    expect(result.text).not.toBe("I did not seal a change-set this turn.");
    db.close();
  });

  it("Case C: authority isolation refuses when authorshipAllowed is false", async () => {
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
          authorshipAllowed: false,
        },
      ]),
    );
    const db = openNuclearDb(new DatabaseSync(join(tmpDir, `${randomUUID()}.db`)));
    activateCapabilities(db);

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages) => {
      const systemContent = String(messages.find((m) => m.role === "system")?.content ?? "");
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return chatResult(
          JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "attempt authorship",
            reason: "testing authority isolation",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
            operationalRequest: {
              kind: "candidate_authorship",
              request: {
                operation: "changeset.author",
                projectId: "project-ashley",
                objective: "seal candidate",
                rationale: "testing",
                riskClass: "low",
              },
            },
          }),
          "thought",
        );
      }
      return chatResult("I did not seal a change-set this turn.", "expression");
    });

    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: M5_LIVE_SMOKE_UTTERANCE,
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY,
    });

    expect(result.text).toBe("I did not seal a change-set this turn.");
    db.close();
  });
});
