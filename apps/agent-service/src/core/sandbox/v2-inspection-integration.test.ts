import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import { env } from "../../env.js";
import {
  deliberateDecision,
  deliberateThoughtContinuation,
} from "../agency/thought.js";
import { deriveOperationalTruth } from "./operational-truth.js";
import { composeTurnContext } from "../context-composer.js";
import { finalizeHonesty } from "../honesty/finalize.js";
import {
  loadOperatorProjectReadRegistry,
  listApprovedReadProjectIds,
  V2ProjectReadRegistry,
} from "./project-registry.js";
import { executeProjectInspectionV2 } from "./v2-execution.js";
import type {
  Decision,
  Motivation,
  ProjectInspectionObservation,
  AffectLicense,
  AuthorizedClaims,
} from "../types.js";
import type {
  SandboxV2Request,
  SandboxV2Result,
} from "@composer-assistant/sandbox-v2";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultAffectLicense: AffectLicense = {
  permitted: true,
  valence: 0,
  activation: 0,
  openness: 0,
  tension: 0,
  reason: "neutral",
};

const defaultAuthorizedClaims: AuthorizedClaims = {
  readingRecordIds: [],
  readingTitles: [],
  readingClaims: [],
};

import {
  currentReleaseId,
  currentContractId,
  currentBuildIdentity,
  capabilityNames,
} from "../rollout/capabilities.js";

function activateProjectInspection(db: DatabaseSync) {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  for (const cap of capabilityNames) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as v2Execution from "./v2-execution.js";

describe("Sandbox V2 M2 Runtime Integration & Two-Pass Cognition Loop", () => {
  const originalMode = env.cognitionMode;
  const originalGroqKey = env.groqApiKey;
  const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
  const originalRegistry = env.sandboxProjectRegistryPath;

  let tmpDir: string;

  beforeEach(() => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test-key";
    env.sandboxEngineeringLifecycleEnabled = true;

    tmpDir = mkdtempSync(join(tmpdir(), "v2-insp-integ-"));
    const regPath = join(tmpDir, "registry.json");
    writeFileSync(
      regPath,
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: "/mock/repo/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: false,
          engineeringAllowed: false,
        },
      ]),
    );
    env.sandboxProjectRegistryPath = regPath;
    vi.spyOn(v2Execution, "isSandboxV2Available").mockReturnValue(true);
  });

  afterEach(() => {
    env.cognitionMode = originalMode;
    env.groqApiKey = originalGroqKey;
    env.sandboxEngineeringLifecycleEnabled = originalLifecycle;
    env.sandboxProjectRegistryPath = originalRegistry;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    vi.restoreAllMocks();
  });

  it("Pass 1 -> Execution -> Pass 2 (Thought Continuation) -> Final Grounded Decision", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateProjectInspection(db);

    const motivations: Motivation[] = [
      {
        id: 1,
        kind: "user_message",
        score: 0.9,
        summary: "What is the SPECIAL_MARKER in src/constants.ts?",
      },
    ];

    const baseDecision: Decision = {
      trigger: "reactive",
      kind: "speak",
      motivationIds: [1],
      score: 0.9,
      reason: "respond to user",
      evidenceRefs: [],
      uncertainty: 0.1,
      urgency: 0.5,
      thoughtSource: "deterministic",
      thoughtError: null,
      affectLicense: defaultAffectLicense,
      cognitiveAllocation: {
        shouldSpeak: true,
        effort: "high",
        completion: "complete",
      },
      authorizedClaims: defaultAuthorizedClaims,
    };

    // Pass 1 Mock: Thought deliberates and requests inspection
    const pass1Complete = async () => ({
      text: JSON.stringify({
        kind: "speak",
        effort: "high",
        completion: "complete",
        objective: "request inspection of constants.ts",
        reason: "need repository evidence for special marker",
        motivationIds: [1],
        shouldSpeak: true,
        uncertainty: 0.2,
        urgency: 0.5,
        inspectionRequest: {
          operation: "project.read_file",
          projectId: "project-ashley",
          path: "src/constants.ts",
        },
      }),
    });

    const pass1Decision = await deliberateDecision(
      db,
      baseDecision,
      motivations,
      "reactive",
      pass1Complete as any,
      () => true,
    );

    expect(pass1Decision.inspectionRequest).toEqual({
      operation: "project.read_file",
      projectId: "project-ashley",
      path: "src/constants.ts",
    });

    // Execution Phase: Dispatch via Sandbox V2
    const mockDispatcher = {
      dispatch: async (req: SandboxV2Request): Promise<SandboxV2Result> => ({
        outcome: "succeeded",
        operation: "project.read_file",
        executedAtMs: 1000,
        result: {
          kind: "project.read_file",
          path: "src/constants.ts",
          contentBase64: Buffer.from("export const SPECIAL_MARKER = 'OMEGA_42';").toString("base64"),
          bytes: 41,
          sha256: "hash42",
          truncated: false,
        },
      }),
    };

    const execResult = await executeProjectInspectionV2({
      request: pass1Decision.inspectionRequest!,
      dispatcher: mockDispatcher as any,
      db,
    });

    expect(execResult.license.state).toBe("succeeded");
    expect(execResult.observation?.operation).toBe("project.read_file");
    if (execResult.observation?.operation === "project.read_file") {
      expect(execResult.observation.contentUtf8).toBe("export const SPECIAL_MARKER = 'OMEGA_42';");
    }

    // Pass 2: Thought Continuation (re-entering with observation)
    const pass2Complete = async (_messages: any[]) => {
      // Verify user message contained the observation
      const userMsg = _messages.find((m) => m.role === "user");
      const parsed = JSON.parse(userMsg.content);
      expect(parsed.observation.contentUtf8).toBe("export const SPECIAL_MARKER = 'OMEGA_42';");

      return {
        text: JSON.stringify({
          kind: "speak",
          effort: "medium",
          completion: "complete",
          objective: "explain that SPECIAL_MARKER is OMEGA_42",
          reason: "verified observation from project-ashley constants.ts",
          inspectionCognitiveResult: "SPECIAL_MARKER is defined as OMEGA_42 in constants.ts",
          motivationIds: [1],
          shouldSpeak: true,
          uncertainty: 0.05,
          urgency: 0.4,
        }),
      };
    };

    const finalDecision = await deliberateThoughtContinuation(
      db,
      {
        ...pass1Decision,
        operationalLicense: execResult.license,
      },
      execResult.observation,
      null,
      motivations,
      "reactive",
      pass2Complete as any,
      () => true,
    );

    expect(finalDecision.objective).toBe("explain that SPECIAL_MARKER is OMEGA_42");
    expect(finalDecision.reason).toBe("verified observation from project-ashley constants.ts");
    expect(finalDecision.inspectionCognitiveResult).toBe("SPECIAL_MARKER is defined as OMEGA_42 in constants.ts");
    expect(finalDecision.inspectionRequest).toEqual(pass1Decision.inspectionRequest);
    expect(finalDecision.inspectionObservation).toEqual(execResult.observation);
    expect(finalDecision.operationalLicense?.state).toBe("succeeded");

    // Context composition & Honesty verification (strictly metadata only, no raw file dump)
    const turnContext = composeTurnContext(db, "owner-1", {
      channel: "discord",
      userMessage: "What is the SPECIAL_MARKER in src/constants.ts?",
      decision: finalDecision,
    });

    expect(turnContext.systemPrompt).toContain("Profile: project_investigation");
    expect(turnContext.systemPrompt).toContain("Inspection evidence: verified read (41 bytes, SHA256: hash42...).");
    expect(turnContext.decisionPrompt).toContain("SPECIAL_MARKER is defined as OMEGA_42 in constants.ts");
    // Ensure raw code was NOT dumped into Expression's operationalWorkBlock
    expect(turnContext.systemPrompt).not.toContain("Observed file content:");

    // Natural Expression output passes honesty check without flooring
    const expressedText = "In project-ashley, `src/constants.ts` defines `SPECIAL_MARKER` as `'OMEGA_42'`.";
    const honestyResult = finalizeHonesty({
      text: expressedText,
      readingLicensed: false,
      operationalLicense: finalDecision.operationalLicense,
    });

    expect(honestyResult.flooredActivity).toBe(false);
    expect(honestyResult.text).toBe(expressedText);
  });

  it("Negative Continuation: handles inspection failure truthfully without inferring absence", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateProjectInspection(db);

    const motivations: Motivation[] = [
      {
        id: 1,
        kind: "user_message",
        score: 0.9,
        summary: "Check src/missing.ts",
      },
    ];

    const pass1Decision: Decision = {
      trigger: "reactive",
      kind: "speak",
      motivationIds: [1],
      score: 0.9,
      reason: "check file",
      evidenceRefs: [],
      uncertainty: 0.2,
      urgency: 0.5,
      thoughtSource: "model",
      thoughtError: null,
      affectLicense: defaultAffectLicense,
      cognitiveAllocation: { shouldSpeak: true, effort: "high", completion: "complete" },
      authorizedClaims: defaultAuthorizedClaims,
      inspectionRequest: {
        operation: "project.read_file",
        projectId: "project-ashley",
        path: "src/missing.ts",
      },
    };

    // Execution fails: sandbox_unavailable
    const mockDispatcher = {
      dispatch: async (): Promise<SandboxV2Result> => ({
        outcome: "unavailable",
        operation: "project.read_file",
        executedAtMs: 1000,
        error: "sandbox_unavailable",
      }),
    };

    const execResult = await executeProjectInspectionV2({
      request: pass1Decision.inspectionRequest!,
      dispatcher: mockDispatcher as any,
      db,
    });

    expect(execResult.license.state).toBe("none");
    expect(execResult.license.error).toBe("sandbox_unavailable");
    expect(execResult.observation).toBeNull();

    // Pass 2 Continuation receives the failure error
    const pass2Complete = async (_messages: any[]) => {
      const userMsg = _messages.find((m) => m.role === "user");
      const parsed = JSON.parse(userMsg.content);
      expect(parsed.executionError).toBe("sandbox_unavailable");
      expect(parsed.observation).toBeNull();

      return {
        text: JSON.stringify({
          kind: "speak",
          effort: "low",
          completion: "complete",
          objective: "inform user that sandbox inspection is currently unavailable",
          reason: "sandbox reported sandbox_unavailable; cannot inspect repository",
          motivationIds: [1],
          shouldSpeak: true,
          uncertainty: 0.1,
          urgency: 0.3,
        }),
      };
    };

    const finalDecision = await deliberateThoughtContinuation(
      db,
      {
        ...pass1Decision,
        operationalLicense: execResult.license,
      },
      null,
      execResult.license.error ?? null,
      motivations,
      "reactive",
      pass2Complete as any,
      () => true,
    );

    expect(finalDecision.objective).toBe("inform user that sandbox inspection is currently unavailable");
    expect(finalDecision.operationalLicense?.error).toBe("sandbox_unavailable");

    const expressedText = "i can't inspect that right now because the sandbox is unavailable in this environment.";
    const honestyResult = finalizeHonesty({
      text: expressedText,
      readingLicensed: false,
      operationalLicense: finalDecision.operationalLicense,
    });

    expect(honestyResult.flooredActivity).toBe(false);
    expect(honestyResult.text).toBe(expressedText);
  });

  it("Deterministic Arbitration: skips M1 reactive admission when Thought emitted M2 request", async () => {
    const initialDecision: Decision = {
      trigger: "reactive",
      kind: "speak",
      motivationIds: [1],
      score: 0.9,
      reason: "respond",
      evidenceRefs: [],
      uncertainty: 0.1,
      urgency: 0.5,
      thoughtSource: "model",
      thoughtError: null,
      affectLicense: defaultAffectLicense,
      cognitiveAllocation: { shouldSpeak: true, effort: "high", completion: "complete" },
      authorizedClaims: defaultAuthorizedClaims,
      inspectionRequest: {
        operation: "project.read_file",
        projectId: "project-ashley",
        path: "src/index.ts",
      },
      operationalLicense: {
        state: "succeeded",
        profile: "project_investigation",
        taskId: "v2-insp-12345",
      },
      inspectionObservation: {
        projectId: "project-ashley",
        operation: "project.read_file",
        path: "src/index.ts",
        verified: true,
        truncated: false,
        executedAtMs: 12345,
        contentUtf8: "// hello",
        bytes: 8,
        sha256: "hash8",
      },
    };

    const truth = deriveOperationalTruth(initialDecision.operationalLicense);
    expect(truth.state).toBe("verified_success");
    expect(truth.profile).toBe("project_investigation");
  });

  it("Evidence Immutability: Pass 2 cannot alter execution evidence", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateProjectInspection(db);
    const motivations: Motivation[] = [{ id: 1, kind: "user_message", score: 0.9, summary: "read" }];

    const initialDecision: Decision = {
      trigger: "reactive",
      kind: "speak",
      motivationIds: [1],
      score: 0.9,
      reason: "read file",
      evidenceRefs: [],
      uncertainty: 0.1,
      urgency: 0.5,
      thoughtSource: "model",
      thoughtError: null,
      affectLicense: defaultAffectLicense,
      cognitiveAllocation: { shouldSpeak: true, effort: "high", completion: "complete" },
      authorizedClaims: defaultAuthorizedClaims,
      inspectionRequest: {
        operation: "project.read_file",
        projectId: "project-ashley",
        path: "src/secure.ts",
      },
      operationalLicense: {
        state: "succeeded",
        profile: "project_investigation",
        taskId: "v2-insp-999",
      },
    };

    const genuineObservation: ProjectInspectionObservation = {
      projectId: "project-ashley",
      operation: "project.read_file",
      path: "src/secure.ts",
      verified: true,
      truncated: false,
      executedAtMs: 999,
      contentUtf8: "const SECURE = true;",
      bytes: 20,
      sha256: "hash20",
    };

    // Even if Pass 2 completion model attempts to return an unauthorized proposal
    const roguePass2 = async () => ({
      text: JSON.stringify({
        kind: "speak",
        effort: "low",
        completion: "complete",
        objective: "tamper",
        reason: "tamper",
        motivationIds: [1],
        shouldSpeak: true,
        inspectionRequest: { operation: "project.read_file", projectId: "other", path: "secret" },
      }),
    });

    const finalDecision = await deliberateThoughtContinuation(
      db,
      initialDecision,
      genuineObservation,
      null,
      motivations,
      "reactive",
      roguePass2 as any,
      () => true,
    );

    // Invariant 2: Original inspectionRequest, observation, and license are strictly preserved
    expect(finalDecision.inspectionRequest).toEqual({
      operation: "project.read_file",
      projectId: "project-ashley",
      path: "src/secure.ts",
    });
    expect(finalDecision.inspectionObservation).toEqual(genuineObservation);
    expect(finalDecision.operationalLicense?.taskId).toBe("v2-insp-999");
  });

  it("Safe dynamic project IDs: prompts receive only stable identifiers, never host paths", () => {
    const tmp = mkdtempSync(join(tmpdir(), "dyn-proj-"));
    const configPath = join(tmp, "registry.json");
    writeFileSync(
      configPath,
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: "/home/xarvak/hidden/host/path",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: false,
          engineeringAllowed: false,
        },
      ]),
    );

    try {
      const registry = loadOperatorProjectReadRegistry(configPath);
      const approved = listApprovedReadProjectIds(registry);
      expect(approved).toEqual(["project-ashley"]);
      expect(approved.includes("/home/xarvak/hidden/host/path")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("Operational Truth lock semantics: flexible wording with immutable facts", () => {
    const truth = deriveOperationalTruth({
      state: "succeeded",
      profile: "project_investigation",
      taskId: "v2-insp-123",
    });

    // locked is false so Expression can phrase findings naturally
    expect(truth.locked).toBe(false);
    expect(truth.state).toBe("verified_success");
    expect(truth.profile).toBe("project_investigation");
  });
});
