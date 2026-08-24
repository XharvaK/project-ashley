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
import { PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY } from "../delivery/turn-deadline-plan.js";
import * as boundedOpExecution from "./bounded-operation-execution.js";
import type { OperationalClaimLicense } from "./engineering-types.js";
import { parseBoundedOperationRequest } from "../agency/thought.js";

/** Exact M6 owner smoke utterance. */
export const M6_LIVE_SMOKE_UTTERANCE =
  "Using the bounded operation capability, perform this finite Project Ashley candidate-only sequence: create a fresh candidate file called `ashley-m6-smoke.txt` containing `M6 bounded operation smoke test`, mechanically verify that candidate using the available verification capability, then seal the resulting candidate work as an advisory change-set. Do not touch the live repository. Do not apply, merge, commit, push, export, deploy, restart, install anything, or use network access. Stop after the advisory change-set is sealed, and tell me what actually happened at each step.";

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

describe("M6 production-equivalent live composition", () => {
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
    tmpDir = mkdtempSync(join(tmpdir(), "v2-m6-live-comp-"));
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
          operationAllowed: true,
          allowedRecipeIds: ["typescript_fixture_compile_v1"],
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

  it("parses a bounded operation request with omitted workspaceId and defaulted budget", () => {
    const raw = {
      operation: "objective.operate",
      projectId: "project-ashley",
      objective: "create smoke file, verify candidate, and seal advisory change-set",
      steps: [
        {
          kind: "candidate_workspace_experiment",
          request: {
            operation: "workspace.write_file",
            projectId: "project-ashley",
            path: "ashley-m6-smoke.txt",
            content: "M6 bounded operation smoke test",
          },
        },
        {
          kind: "candidate_verification",
          request: {
            operation: "workspace.verify",
            projectId: "project-ashley",
          },
        },
        {
          kind: "candidate_authorship",
          request: {
            operation: "changeset.author",
            projectId: "project-ashley",
            objective: "seal advisory change-set",
            rationale: "smoke test sequence",
            riskClass: "low",
          },
        },
      ],
    };

    const parsed = parseBoundedOperationRequest(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.projectId).toBe("project-ashley");
      expect(parsed.request.workspaceId).toBeUndefined();
      expect(parsed.request.steps).toHaveLength(3);
      expect(parsed.request.budget.maxSteps).toBe(3);
      expect(parsed.request.budget.deadlineAtMs).toBeGreaterThan(Date.now());
    }
  });

  it("handles live M6 bounded operation execution dispatch through AshleyCore runtime", async () => {
    let executedBoundedOp = false;
    vi.spyOn(boundedOpExecution, "executeBoundedOperationV2").mockImplementation(
      async (input) => {
        executedBoundedOp = true;
        expect(input.request.operation).toBe("objective.operate");
        expect(input.request.projectId).toBe("project-ashley");
        expect(input.request.steps).toHaveLength(3);

        const license: OperationalClaimLicense = {
          state: "succeeded",
          taskId: "v2-operate-mock",
          profile: "bounded_operation",
          boundedOperationClaimEffect: {
            verified: true,
            projectId: "project-ashley",
            workspaceId: "ws-m6-mock-123",
            taskId: "v2-operate-mock",
            stepsExecuted: 3,
            maxSteps: 3,
            stopReason: "succeeded",
            borderState: "none",
            applied: false,
            exported: false,
            protocolState: "admitted",
            completedAtMs: Date.now(),
          },
        };
        return { license };
      },
    );

    const db = openNuclearDb(new DatabaseSync(join(tmpDir, "nuclear.db")));
    activateCapabilities(db);

    vi.spyOn(mistral, "completeChat").mockImplementation(
      async (messages: any[], options?: any) => {
        const sys = messages.find((m) => m.role === "system")?.content ?? "";
        if (sys.includes("Ashley's Thought layer, not her Expression layer")) {
          return chatResult(
            JSON.stringify({
              kind: "speak",
              delayClass: null,
              shouldSpeak: true,
              effort: "high",
              completion: "complete",
              uncertainty: "low",
              urgency: "low",
              objective: "execute bounded sequence: write, verify, and seal",
              reason: "owner requested finite bounded sequence",
              motivationIds: [1],
              evidenceDisposition: "sufficient",
              operationalRequest: {
                kind: "bounded_operation",
                request: {
                  operation: "objective.operate",
                  projectId: "project-ashley",
                  objective: "create smoke file, verify candidate, and seal advisory change-set",
                  steps: [
                    {
                      kind: "candidate_workspace_experiment",
                      request: {
                        operation: "workspace.write_file",
                        projectId: "project-ashley",
                        path: "ashley-m6-smoke.txt",
                        content: "M6 bounded operation smoke test",
                      },
                    },
                    {
                      kind: "candidate_verification",
                      request: {
                        operation: "workspace.verify",
                        projectId: "project-ashley",
                      },
                    },
                    {
                      kind: "candidate_authorship",
                      request: {
                        operation: "changeset.author",
                        projectId: "project-ashley",
                        objective: "seal advisory candidate change-set",
                        rationale: "finite bounded smoke sequence",
                        riskClass: "low",
                      },
                    },
                  ],
                },
              },
            }),
            "thought",
          );
        }
        if (sys.includes("Ashley's Thought layer continuing deliberation")) {
          return chatResult(
            JSON.stringify({
              kind: "speak",
              delayClass: null,
              shouldSpeak: true,
              effort: "low",
              completion: "complete",
              uncertainty: "low",
              urgency: "low",
              objective: "report completed bounded sequence",
              reason: "all 3 operations succeeded",
              motivationIds: [1],
              evidenceDisposition: "sufficient",
            }),
            "thought",
          );
        }
        return chatResult(
          "completed 3 admitted sandbox operations toward the named objective. no border effect was performed.",
          "expression",
        );
      },
    );

    const core = new AshleyCore(db);
    const res = await core.handleReactiveChat({
      message: M6_LIVE_SMOKE_UTTERANCE,
      ownerId: "doc",
      channel: "discord",
      turnDeadlinePolicy: PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY,
    });

    expect(executedBoundedOp).toBe(true);
    expect(res.text).toContain("completed 3 admitted sandbox operations");
    expect(res.decisionId).toBeDefined();

    const decision = db.prepare("SELECT * FROM decision_log WHERE id = ?").get(res.decisionId) as any;
    expect(decision).toBeDefined();
    expect(decision.decision_kind).toBe("speak");
  });
});
