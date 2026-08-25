import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import { env } from "../../env.js";
import { AshleyCore } from "../runtime.js";
import * as mistral from "../../mistral-client.js";
import * as v2LicenseAudit from "./v2-license-audit.js";
import { SandboxV2Dispatcher } from "@composer-assistant/sandbox-v2";
import {
  currentReleaseId,
  currentContractId,
  currentBuildIdentity,
  capabilityNames,
} from "../rollout/capabilities.js";
import { runThoughtModel, deliberateDecision, deliberateThoughtContinuation, THOUGHT_MAX_OUTPUT_TOKENS } from "../agency/thought.js";
import type { Decision, Motivation } from "../types.js";
import * as v2Execution from "./v2-execution.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

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

describe("Sandbox V2 M2 AshleyCore Runtime Integration", () => {
  const originalMode = env.cognitionMode;
  const originalGroqKey = env.groqApiKey;
  const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
  const originalRegistryPath = env.sandboxProjectRegistryPath;

  let tmpDir: string;
  let registryPath: string;

  beforeEach(() => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test-key";
    env.sandboxEngineeringLifecycleEnabled = true;
    process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";

    tmpDir = mkdtempSync(join(tmpdir(), "v2-runtime-test-"));
    registryPath = join(tmpDir, "registry.json");
    writeFileSync(
      registryPath,
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
    env.sandboxProjectRegistryPath = registryPath;
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("reserves Pass 2 after M2 completes beyond the former shared Thought deadline", async () => {
    vi.useFakeTimers();
    const admittedAtMs = Date.parse("2026-08-20T08:13:37.365Z");
    vi.setSystemTime(admittedAtMs);

    const dbPath = join(tmpDir, `ashley-core-phase-budget-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const calls: string[] = [];
    let expressionPrompt = "";
    const m1 = vi.spyOn(v2Execution, "executeReactiveSandboxTaskV2");
    const m3 = vi.spyOn(v2Execution, "executeWorkspaceExperimentV2");

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((message) => message.role === "system")?.content ?? "";
      const userContent = messages.find((message) => message.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        calls.push("pass1");
        // Miss the 5s soft responsiveness target without crossing Pass 1's 6s hard cutoff.
        vi.setSystemTime(admittedAtMs + 5_500);
        const parsedUser = JSON.parse(userContent);
        const motivationId = parsedUser.candidates[0]?.id ?? 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect package.json",
            reason: "need repository evidence",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.4,
            evidenceDisposition: "acquire_project_evidence",
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

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        calls.push("pass2");
        const parsedUser = JSON.parse(userContent);
        expect(parsedUser.observation.contentUtf8).toContain('"version":"0.2.0"');
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "report the verified version",
            reason: "verified project observation",
            motivationIds: [1],
            shouldSpeak: true,
            uncertainty: 0.05,
            urgency: 0.4,
            inspectionCognitiveResult: "package.json reports version 0.2.0",
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      calls.push("expression");
      expressionPrompt = `${systemContent}\n${userContent}`;
      return {
        text: "package.json reports version 0.2.0.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const dispatch = vi
      .spyOn(SandboxV2Dispatcher.prototype, "dispatch")
      .mockImplementation(async (request: any) => {
        expect(request.operation).toBe("project.read_file");
        calls.push("m2");
        // The former shared Thought deadline was admittedAt + 6 seconds.
        // Completion at +7 seconds reproduces the production ordering without sleeps.
        vi.setSystemTime(admittedAtMs + 7_000);
        return {
          outcome: "succeeded",
          operation: "project.read_file",
          dispatchAttempted: true,
          dispatchAttemptedAtMs: admittedAtMs + 7_000,
          executedAtMs: admittedAtMs + 7_000,
          result: {
            kind: "project.read_file",
            path: "package.json",
            contentBase64: Buffer.from(
              '{"name":"project-ashley","version":"0.2.0"}',
            ).toString("base64"),
            bytes: 45,
            sha256: "a".repeat(64),
            truncated: false,
          },
        };
      });

    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
      ownerId: "doc",
      channel: "discord",
      inboundDiscordMessageIds: ["phase-budget-root-regression"],
      finalFragmentReceivedAtMs: admittedAtMs,
    });

    expect(calls).toEqual(["pass1", "m2", "pass2", "expression"]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(m1).not.toHaveBeenCalled();
    expect(m3).not.toHaveBeenCalled();
    expect(result.text).toContain("0.2.0");
    expect(expressionPrompt).toContain("package.json reports version 0.2.0");

    const logged = db
      .prepare(
        `SELECT objective, reason, thought_source, thought_error
         FROM decision_log WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get("doc") as Record<string, unknown>;
    expect(logged.objective).toBe("report the verified version");
    expect(logged.thought_source).toBe("model");
    expect(logged.thought_error).toBeNull();

    const lifecycle = (
      db
        .prepare(
          "SELECT phase_lifecycle_json FROM delivery_reservations WHERE id = ?",
        )
        .get(result.reservationId!) as { phase_lifecycle_json: string }
    ).phase_lifecycle_json;
    expect(JSON.parse(lifecycle)).toMatchObject({
      selectedBranch: "project_inspection",
      deadlineOffsetsMs: {
        projectInspectionChildTermination: expect.any(Number),
        projectInspectionPreparation: expect.any(Number),
      },
      phases: {
        project_inspection_preparation: {
          state: "completed",
          startedOffsetMs: expect.any(Number),
          finishedOffsetMs: 7_000,
        },
        project_inspection: {
          state: "settled",
          dispatchedOffsetMs: 7_000,
          statusCode: "project_inspection_settled",
        },
        continuation: {
          state: "succeeded",
          statusCode: "continuation_succeeded",
        },
        initial_thought: {
          state: "settled",
          finishedOffsetMs: 5_500,
        },
      },
    });

    db.close();
  });

  it("Full reactive turn: Thought Pass 1 -> M2 Execution -> Thought Pass 2 -> Real Expression & Audit Verification", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];

    // Capture emitted audits directly via formatSandboxV2LicenseAudit spy or emit hook
    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    // Mock completeChat for Pass 1 (Thought), Pass 2 (Thought Continuation), and Pass 3 (Expression)
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect constants.ts",
            reason: "need repository evidence",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.5,
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/constants.ts",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        callLog.push("thought_pass2");
        const parsedUser = JSON.parse(userContent);
        // Verify Thought Pass 2 received the structured observation
        expect(parsedUser.observation.contentUtf8).toBe("export const CODE_NAME = 'WAVE_M2';");
        expect(parsedUser.observation.bytes).toBe(34);
        expect(parsedUser.executionError).toBeNull();

        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "confirm CODE_NAME is WAVE_M2",
            reason: "verified observation from project-ashley",
            inspectionCognitiveResult: "CODE_NAME is defined as WAVE_M2 in src/constants.ts",
            shouldSpeak: true,
            uncertainty: 0.05,
            urgency: 0.4,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      // Expression turn
      callLog.push("expression");
      return {
        text: "i checked `src/constants.ts` and the code name is indeed `WAVE_M2`.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    // Mock SandboxV2Dispatcher.prototype.dispatch to return valid file read
    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockResolvedValue({
      outcome: "succeeded",
      operation: "project.read_file",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: 1000,
      executedAtMs: 1000,
      result: {
        kind: "project.read_file",
        path: "src/constants.ts",
        contentBase64: Buffer.from("export const CODE_NAME = 'WAVE_M2';").toString("base64"),
        bytes: 34,
        sha256: "hash34",
        truncated: false,
      },
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: can you check what CODE_NAME is in src/constants.ts?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "thought_pass2", "expression"]);
    expect(result.text).toContain("WAVE_M2");
    expect(result.decisionKind).toBe("speak");
    expect(result.silenced).toBeFalsy();

    // Verify emitted audit record contains safe metadata only
    expect(emittedAudits.length).toBe(1);
    const audit = emittedAudits[0];
    expect(audit.discriminator).toBe("ASHLEY_SANDBOX_V2_LICENSE");
    expect(audit.state).toBe("succeeded");
    expect(audit.profile).toBe("project_investigation");
    expect(audit.verified).toBe(true);
    expect(audit.inspection).toEqual({
      operation: "project.read_file",
      projectId: "project-ashley",
      targetPath: "src/constants.ts",
      targetPattern: undefined,
      truncated: false,
      bytes: 34,
      filesScanned: undefined,
      matchCount: undefined,
      entryCount: undefined,
    });
    // Ensure raw source content is NOT in the audit record
    expect((audit as any).contentUtf8).toBeUndefined();
    expect((audit as any).contentBase64).toBeUndefined();

    // Verify database logged the decision
    const loggedDecision = db
      .prepare(
        `SELECT decision_kind, objective, reason, thought_source
         FROM decision_log WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get("doc") as any;

    expect(loggedDecision.decision_kind).toBe("speak");
    expect(loggedDecision.objective).toBe("confirm CODE_NAME is WAVE_M2");
    expect(loggedDecision.thought_source).toBe("model");
  });

  it("Thought Pass 2 with empty motivationIds inherits the grounded pass-1 selection instead of discarding the evidence interpretation", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    let expressionPrompt = "";

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect constants.ts",
            reason: "need repository evidence",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.3,
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/constants.ts",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        callLog.push("thought_pass2");
        const parsedUser = JSON.parse(userContent);
        expect(parsedUser.observation.contentUtf8).toBe("export const CODE_NAME = 'WAVE_M2';");
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "confirm CODE_NAME is WAVE_M2",
            reason: "verified observation from project-ashley",
            inspectionCognitiveResult: "CODE_NAME is defined as WAVE_M2 in src/constants.ts",
            shouldSpeak: true,
            uncertainty: 0.05,
            urgency: 0.4,
            motivationIds: [],
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      callLog.push("expression");
      expressionPrompt = systemContent + "\n" + userContent;
      return {
        text: "i checked `src/constants.ts` and the code name is indeed `WAVE_M2`.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockResolvedValue({
      outcome: "succeeded",
      operation: "project.read_file",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: 1000,
      executedAtMs: 1000,
      result: {
        kind: "project.read_file",
        path: "src/constants.ts",
        contentBase64: Buffer.from("export const CODE_NAME = 'WAVE_M2';").toString("base64"),
        bytes: 34,
        sha256: "hash34",
        truncated: false,
      },
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: can you check what CODE_NAME is in src/constants.ts?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "thought_pass2", "expression"]);
    expect(result.text).toContain("WAVE_M2");
    expect(result.decisionKind).toBe("speak");
    // The evidence interpretation must survive the empty re-selection and
    // reach Expression; otherwise Expression has metadata only and can guess.
    expect(expressionPrompt).toContain("CODE_NAME is defined as WAVE_M2 in src/constants.ts");
    // With an interpretation present, Expression must not be told it was not interpreted
    expect(expressionPrompt).not.toContain("not_interpreted");
  });

  it("Thought Pass 2 structurally regenerates once (missing interpretation) and still delivers the interpretation", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    let expressionPrompt = "";
    let pass2Attempts = 0;

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect constants.ts",
            reason: "need repository evidence",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.3,
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/constants.ts",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        pass2Attempts += 1;
        if (pass2Attempts === 1) {
          // Structural miss: verified M2 success without an interpretation.
          return {
            text: JSON.stringify({
              kind: "speak",
              effort: "medium",
              completion: "complete",
              objective: "confirm CODE_NAME is WAVE_M2",
              reason: "verified observation from project-ashley",
              shouldSpeak: true,
              uncertainty: 0.05,
              urgency: 0.4,
              motivationIds: [1],
            }),
            model: "mistral-large",
            modelAlias: "thought",
            resolvedModelId: "mistral-large",
          };
        }
        callLog.push("thought_pass2");
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "confirm CODE_NAME is WAVE_M2",
            reason: "verified observation from project-ashley",
            inspectionCognitiveResult: "CODE_NAME is defined as WAVE_M2 in src/constants.ts",
            shouldSpeak: true,
            uncertainty: 0.05,
            urgency: 0.4,
            motivationIds: [1],
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      callLog.push("expression");
      expressionPrompt = systemContent + "\n" + userContent;
      return {
        text: "i checked `src/constants.ts` and the code name is indeed `WAVE_M2`.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockResolvedValue({
      outcome: "succeeded",
      operation: "project.read_file",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: 1000,
      executedAtMs: 1000,
      result: {
        kind: "project.read_file",
        path: "src/constants.ts",
        contentBase64: Buffer.from("export const CODE_NAME = 'WAVE_M2';").toString("base64"),
        bytes: 34,
        sha256: "hash34",
        truncated: false,
      },
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: can you check what CODE_NAME is in src/constants.ts?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(pass2Attempts).toBe(2);
    expect(callLog).toEqual(["thought_pass1", "thought_pass2", "expression"]);
    expect(result.text).toContain("WAVE_M2");
    expect(result.decisionKind).toBe("speak");
    expect(expressionPrompt).toContain("CODE_NAME is defined as WAVE_M2 in src/constants.ts");
  });

  it("Thought Pass 2 persistent failure leaves verified evidence uninterpreted: Expression is told not_interpreted, never invited to guess", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    let expressionPrompt = "";
    let pass2Attempts = 0;

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect constants.ts",
            reason: "need repository evidence",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.3,
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/constants.ts",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        pass2Attempts += 1;
        throw new Error("persistent lane failure");
      }

      callLog.push("expression");
      expressionPrompt = systemContent + "\n" + userContent;
      return {
        text: "the read succeeded but i could not interpret the file contents.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockResolvedValue({
      outcome: "succeeded",
      operation: "project.read_file",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: 1000,
      executedAtMs: 1000,
      result: {
        kind: "project.read_file",
        path: "src/constants.ts",
        contentBase64: Buffer.from("export const CODE_NAME = 'WAVE_M2';").toString("base64"),
        bytes: 34,
        sha256: "hash34",
        truncated: false,
      },
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: can you check what CODE_NAME is in src/constants.ts?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(pass2Attempts).toBe(1);
    expect(callLog).toEqual(["thought_pass1", "expression"]);
    expect(expressionPrompt).toContain("interpretationStatus = not_interpreted");
    expect(expressionPrompt).toContain("Do not invent the inspected content");
    expect(result.decisionKind).toBe("speak");
    expect(result.text).not.toContain("WAVE_M2");
  });

  it("Negative path: Sandbox unavailable -> Thought Pass 2 receives error -> Truthful response without inferring absence", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect constants.ts",
            reason: "need repository evidence",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.5,
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/constants.ts",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        callLog.push("thought_pass2");
        const parsedUser = JSON.parse(userContent);
        expect(parsedUser.executionError).toBe("sandbox_unavailable");
        expect(parsedUser.observation).toBeNull();

        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "inform user sandbox is unavailable",
            reason: "received sandbox_unavailable error",
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.3,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      return {
        text: "i can't inspect the repository right now because the sandbox is unavailable.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockResolvedValue({
      outcome: "unavailable",
      operation: "project.read_file",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: 1000,
      executedAtMs: 1000,
      error: "sandbox_unavailable",
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: can you check constants.ts?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "thought_pass2"]);
    expect(result.text).toContain("sandbox is unavailable");
    expect(result.decisionKind).toBe("speak");
  });

  it("Truncated zero-match search through AshleyCore with audit verification", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];

    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "search for legacy markers",
            reason: "check if legacy markers exist",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.5,
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.search_text",
              projectId: "project-ashley",
              pattern: "LEGACY_MARKER_99",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        callLog.push("thought_pass2");
        const parsedUser = JSON.parse(userContent);
        expect(parsedUser.observation.operation).toBe("project.search_text");
        expect(parsedUser.observation.matches).toEqual([]);
        expect(parsedUser.observation.truncated).toBe(false);

        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "report zero matches found in scanned files",
            reason: "search returned zero matches",
            inspectionCognitiveResult: "No matches found for LEGACY_MARKER_99 across scanned files",
            shouldSpeak: true,
            uncertainty: 0.05,
            urgency: 0.2,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      return {
        text: "i searched the codebase and found no occurrences of `LEGACY_MARKER_99` in the scanned files.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockResolvedValue({
      outcome: "succeeded",
      operation: "project.search_text",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: 1000,
      executedAtMs: 1000,
      result: {
        kind: "project.search_text",
        path: ".",
        matches: [],
        filesScanned: 25,
        truncated: false,
      },
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: is LEGACY_MARKER_99 present anywhere in the repo?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "thought_pass2"]);
    expect(result.text).toContain("found no occurrences");

    expect(emittedAudits.length).toBe(1);
    const audit = emittedAudits[0];
    expect(audit.state).toBe("succeeded");
    expect(audit.verified).toBe(true);
    expect(audit.inspection).toEqual({
      operation: "project.search_text",
      projectId: "project-ashley",
      targetPath: ".",
      targetPattern: "LEGACY_MARKER_99",
      truncated: false,
      bytes: undefined,
      filesScanned: 25,
      matchCount: 0,
      entryCount: undefined,
    });
  });

  it("Deterministic arbitration: skips M1 reactive admission when Thought emitted M2 request", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "read file",
            reason: "inspection",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.5,
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/index.ts",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "finish inspection",
            reason: "done",
            inspectionCognitiveResult: "src/index.ts inspected",
            shouldSpeak: true,
            uncertainty: 0.05,
            urgency: 0.2,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      return {
        text: "done inspection.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockResolvedValue({
      outcome: "succeeded",
      operation: "project.read_file",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: 1000,
      executedAtMs: 1000,
      result: {
        kind: "project.read_file",
        path: "src/index.ts",
        contentBase64: Buffer.from("// index").toString("base64"),
        bytes: 8,
        sha256: "hash8",
        truncated: false,
      },
    });

    const core = new AshleyCore(db);

    // Message contains keywords that might trigger M1 reactive admission ("sandbox test file roundtrip")
    // but Thought explicitly requests M2 inspection. M2 takes strict precedence.
    const result = await core.handleReactiveChat({
      message: "debug: sandbox test file roundtrip check",
      ownerId: "doc",
      channel: "discord",
    });

    const logged = db
      .prepare(
        `SELECT decision_kind, objective FROM decision_log WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get("doc") as any;

    expect(logged.decision_kind).toBe("speak");
    expect(logged.objective).toBe("finish inspection");
  });

  it("Invalid / out-of-tree path preserves precise typed error (path_invalid) into Thought continuation and audit", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];
    let expressionSystemPrompt = "";

    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect out of tree path",
            reason: "need /etc/shadow",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.5,
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "/etc/shadow",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        callLog.push("thought_pass2");
        const parsedUser = JSON.parse(userContent);
        // Verify Thought received the exact typed error "path_invalid", NOT generic "sandbox_failed"
        expect(parsedUser.executionError).toBe("path_invalid");
        expect(parsedUser.observation).toBeNull();

        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "inform user path is invalid",
            reason: "received path_invalid error",
            inspectionCognitiveResult: "path /etc/shadow is invalid (outside canonical project root)",
            shouldSpeak: true,
            uncertainty: 0.05,
            urgency: 0.2,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      expressionSystemPrompt = systemContent;
      return {
        text: "i can't inspect `/etc/shadow` because it is outside the approved repository.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: inspect /etc/shadow in project-ashley",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "thought_pass2"]);
    expect(result.text).toContain("outside the approved repository");

    // A typed failure must surface as failed evidence state, never as a
    // fabricated repository fact.
    expect(expressionSystemPrompt).toContain("Project inspection evidence:");
    expect(expressionSystemPrompt).toContain("inspectionStatus = failed");
    expect(expressionSystemPrompt).toContain("verifiedRepositoryEvidence = false");
    expect(expressionSystemPrompt).toContain("error = path_invalid");

    expect(emittedAudits.length).toBe(1);
    const audit = emittedAudits[0];
    expect(audit.state).toBe("failed");
    expect(audit.error).toBe("path_invalid");
    expect(audit.verified).toBe(false);
    expect(audit.inspection).toBeNull();
  });

  it("Gate-denied capability turn: verifies M2=0, M1=0, and self-model reflects inspection non-influencing", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    const relId = currentReleaseId();
    const now = new Date().toISOString();
    for (const cap of capabilityNames) {
      if (cap === "project_inspection") continue;
      db.prepare(
        `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
         VALUES (?, ?, 'active', ?, ?, ?, 0)`,
      ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
    }

    const callLog: string[] = [];
    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];

    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    let expressionSystemPrompt = "";

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        // Verify system prompt tells Thought no approved projects are licensed for inspection
        expect(systemContent).toContain("No approved projects are currently configured or licensed for inspection");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "respond directly without inspection",
            reason: "inspection not licensed",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.2,
            evidenceDisposition: "capability_unavailable",
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      // Expression turn
      callLog.push("expression");
      expressionSystemPrompt = systemContent;
      return {
        text: "i can't inspect the repository right now because that capability is currently in observe mode.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: inspect package.json in project-ashley",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "expression"]);
    expect(result.text).toContain("observe mode");

    // Verify self-model passed to Expression explicitly states inspection is not active in rollout
    expect(expressionSystemPrompt).toContain("Sandbox V2: inspection capability not active in rollout");
    // Structured authority: capability genuinely unavailable, inspection not performed.
    expect(expressionSystemPrompt).toContain("capabilityAvailable = false");
    expect(expressionSystemPrompt).toContain("inspectionStatus = not_performed");
    expect(expressionSystemPrompt).toContain(
      "Semantics: Ashley cannot inspect this turn because the inspection capability is not active",
    );

    // Zero M2 execution and zero M1 execution
    const m2Count = emittedAudits.filter((a) => a.profile === "project_investigation").length;
    const m1Count = emittedAudits.filter((a) => a.profile === "sandbox_workspace_file_roundtrip").length;
    expect(m2Count).toBe(0);
    expect(m1Count).toBe(0);
  });

  it("Exact production witness (easy turn): capability-offer admission runs Thought, executes M2 with no pre-existing license, continuation grounds the answer", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];
    let expressionSystemPrompt = "";
    const thoughtCompletionOptions: Array<{ maxTokens?: number }> = [];

    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[], options: any) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        thoughtCompletionOptions.push(options);
        // The inspection offer must be visible to Thought.
        expect(systemContent).toContain("Approved project IDs: project-ashley");
        const parsedUser = JSON.parse(userContent);
        // No pre-existing OperationalClaimLicense: the model may still propose
        // inspection and execution must proceed — license-after-execution only.
        expect(parsedUser.base?.operationalLicense ?? null).toBeNull();
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "read package.json for the version",
            reason: "the question asks for a repository fact that needs evidence",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.1,
            urgency: 0.4,
            evidenceDisposition: "acquire_project_evidence",
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

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        callLog.push("thought_pass2");
        const parsedUser = JSON.parse(userContent);
        expect(parsedUser.observation.contentUtf8).toContain("0.2.0");
        expect(parsedUser.executionError).toBeNull();
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "answer with the version from package.json",
            reason: "observation from project-ashley package.json",
            inspectionCognitiveResult: "package.json declares version 0.2.0",
            shouldSpeak: true,
            uncertainty: 0.05,
            urgency: 0.4,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      callLog.push("expression");
      expressionSystemPrompt = systemContent;
      return {
        text: "i opened `package.json` in project-ashley: the version is `0.2.0`.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockResolvedValue({
      outcome: "succeeded",
      operation: "project.read_file",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: 1000,
      executedAtMs: 1000,
      result: {
        kind: "project.read_file",
        path: "package.json",
        contentBase64: Buffer.from(
          JSON.stringify({ name: "project-ashley", version: "0.2.0" }),
        ).toString("base64"),
        bytes: 44,
        sha256: "hash44",
        truncated: false,
      },
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message:
        "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "thought_pass2", "expression"]);
    expect(result.text).toContain("0.2.0");
    expect(result.decisionKind).toBe("speak");

    // Thought completion budget must hold real-model response headroom (the
    // production 450-token ceiling truncated JSON mid-object).
    expect(thoughtCompletionOptions[0]?.maxTokens).toBe(THOUGHT_MAX_OUTPUT_TOKENS);

    // Verified execution must surface structured evidence state to Expression.
    expect(expressionSystemPrompt).toContain("Project inspection evidence:");
    expect(expressionSystemPrompt).toContain("inspectionStatus = verified_success");
    expect(expressionSystemPrompt).toContain("verifiedRepositoryEvidence = true");
    expect(expressionSystemPrompt).toContain("capabilityAvailable = true");

    expect(emittedAudits.length).toBe(1);
    const audit = emittedAudits[0]!;
    expect(audit.state).toBe("succeeded");
    expect(audit.verified).toBe(true);
    expect(audit.profile).toBe("project_investigation");
    expect(audit.inspection?.targetPath).toBe("package.json");

    const logged = db
      .prepare(
        `SELECT decision_kind, thought_source FROM decision_log WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get("doc") as any;
    expect(logged.decision_kind).toBe("speak");
    expect(logged.thought_source).toBe("model");
  });

  it("Exact production witness without inspection offer (release observe): deterministic easy turn — Thought never runs, M2=0, M1=0", async () => {
    vi.useFakeTimers();
    const admittedAtMs = Date.parse("2026-08-20T09:00:00.000Z");
    vi.setSystemTime(admittedAtMs);
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    const relId = currentReleaseId();
    const now = new Date().toISOString();
    for (const cap of capabilityNames) {
      if (cap === "project_inspection") continue;
      db.prepare(
        `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
         VALUES (?, ?, 'active', ?, ?, ?, 0)`,
      ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
    }

    const callLog: string[] = [];
    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];

    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        throw new Error("Thought must not run on an easy turn without an inspection offer");
      }
      callLog.push("expression");
      return {
        text: "i can't verify that without checking the repository.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message:
        "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["expression"]);
    expect(Date.now()).toBe(admittedAtMs);
    expect(result.decisionKind).toBe("speak");

    const m2Count = emittedAudits.filter((a) => a.profile === "project_investigation").length;
    const m1Count = emittedAudits.filter((a) => a.profile === "sandbox_workspace_file_roundtrip").length;
    expect(m2Count).toBe(0);
    expect(m1Count).toBe(0);

    const logged = db
      .prepare(
        `SELECT thought_source FROM decision_log WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get("doc") as any;
    expect(logged.thought_source).toBe("deterministic");
  });

  it("Exact witness with inspection offered but Thought declines: no M2, no license, no denial — plain response", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];

    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "low",
            completion: "complete",
            objective: "answer without repository evidence",
            reason: "answer from memory without inspecting",
            motivationIds: [motivationId],
            shouldSpeak: true,
            uncertainty: 0.3,
            urgency: 0.2,
            evidenceDisposition: "sufficient",
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      callLog.push("expression");
      return {
        text: "i don't have the version memorized right now.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message:
        "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "expression"]);
    expect(result.text).toContain("version memorized");

    const m2Count = emittedAudits.filter((a) => a.profile === "project_investigation").length;
    expect(m2Count).toBe(0);
    const lifecycleRow = db
      .prepare(
        "SELECT phase_lifecycle_json FROM delivery_reservations WHERE id = ?",
      )
      .get(result.reservationId!) as { phase_lifecycle_json: string };
    expect(JSON.parse(lifecycleRow.phase_lifecycle_json)).toMatchObject({
      phases: {
        continuation: {
          state: "skipped",
          statusCode: "continuation_not_needed",
        },
      },
    });
  });

  it("Exact production witness with real-model truncated Thought output: fallback runs, no M2, Expression sees the not_performed evidence floor", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];
    let expressionSystemPrompt = "";

    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        // The exact raw response captured from production (truncated mid-object
        // by the old 450-token ceiling): no closing brace, invalid JSON.
        return {
          text: `{ "kind": "ask", "delayClass": null, "shouldSpeak": false, "effort": "medium", "completion": "hold", `,
          model: "gpt-oss-120b",
          modelAlias: "thought",
          resolvedModelId: "openai/gpt-oss-120b",
        };
      }

      callLog.push("expression");
      expressionSystemPrompt = systemContent;
      return {
        text: "i can check project-ashley.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message:
        "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
      ownerId: "doc",
      channel: "discord",
    });

    // Bounded regeneration: attempt 1 fails (truncated JSON), attempt 2 also
    // fails (same mock), then deterministic fallback.
    expect(callLog).toEqual(["thought_pass1", "thought_pass1", "expression"]);

    // Zero M2 execution and zero audit: the truncated output was rejected
    // before any inspection request could be parsed.
    expect(emittedAudits.length).toBe(0);

    const logged = db
      .prepare(
        `SELECT decision_kind, thought_source, thought_error FROM decision_log WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get("doc") as any;
    expect(logged.thought_source).toBe("fallback");
    expect(logged.thought_error).toBe("invalid_json");

    // Expression must see the structural no-evidence floor: no repository
    // evidence exists this turn, so repository facts are not evidence-backed.
    expect(expressionSystemPrompt).toContain("Project inspection evidence:");
    expect(expressionSystemPrompt).toContain("inspectionStatus = not_performed");
    expect(expressionSystemPrompt).toContain("verifiedRepositoryEvidence = false");
    expect(expressionSystemPrompt).not.toContain("inspectionStatus = verified_success");
    // The inspection evidence section must not claim capability is unavailable
    // (the candidate workspace section may independently show capabilityAvailable = false).
    const inspectionSection = expressionSystemPrompt.split("Candidate workspace evidence:")[0].split("Project inspection evidence:")[1] ?? "";
    expect(inspectionSection).not.toContain("capabilityAvailable = false");
    expect(result.text).toContain("i can check project-ashley.");
  });

  it("Thought hold with shouldSpeak=false is a valid terminal cognition: no expression, no delivery", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(userContent);
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "ask",
            delayClass: null,
            shouldSpeak: false,
            effort: "medium",
            completion: "hold",
            uncertainty: 0.2,
            urgency: 0.1,
            objective: "ask",
            reason: "hold",
            motivationIds: [motivationId],
            evidenceDisposition: "defer",
          }),
          model: "gpt-oss-120b",
          modelAlias: "thought",
          resolvedModelId: "openai/gpt-oss-120b",
        };
      }

      callLog.push("expression");
      return {
        text: "must not be spoken",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message: "debug: hold this thought",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1"]);
    expect(result.text).toBe("");
    expect(result.decisionKind).toBe("ask");
    expect(result.model).toBe("none");

    const logged = db
      .prepare(
        `SELECT decision_kind, thought_source FROM decision_log WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get("doc") as any;
    expect(logged.decision_kind).toBe("ask");
    expect(logged.thought_source).toBe("model");
  });

  it("Contract: the exact production pattern (need evidence while inspection available) is rejected unless a typed request accompanies acquire_project_evidence", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);
    try {
      const baseDecision: Decision = {
        trigger: "reactive",
        kind: "speak",
        motivationIds: [1],
        score: 40,
        reason: "respond",
        evidenceRefs: [],
        uncertainty: 0.2,
        urgency: 0.5,
        thoughtSource: "deterministic",
        thoughtError: null,
        affectLicense: {
          permitted: false,
          valence: 0,
          activation: 0.5,
          openness: 0.5,
          tension: 0,
          reason: "test",
        },
        cognitiveAllocation: { shouldSpeak: true, effort: "medium", completion: "complete" },
        authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
      };
      const motivation: Motivation = {
        id: 1,
        kind: "user_message",
        score: 100,
        summary: "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
        refType: "message",
        refId: 1,
      };

      // The pre-repair production output claimed to need repository data but
      // carried no inspection request. Under the disposition contract the
      // evidence-needing choice is structurally unreachable without the
      // typed request: fail closed.
      const noRequest = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "delay",
            delayClass: "standard",
            shouldSpeak: false,
            effort: "medium",
            completion: "hold",
            uncertainty: 0,
            urgency: 0,
            objective: "retrieve package version",
            reason: "need repository data",
            motivationIds: [1],
            evidenceDisposition: "acquire_project_evidence",
          }),
        }),
      );
      expect(noRequest).toMatchObject({ ok: false, error: "missing_required_field" });

      // Unapproved project id in the request is also rejected structurally.
      const unapproved = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "medium",
            completion: "complete",
            uncertainty: 0.1,
            urgency: 0.4,
            objective: "read package.json for the version",
            reason: "the question asks for a repository fact that needs evidence",
            motivationIds: [1],
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "other-project",
              path: "package.json",
            },
          }),
        }),
      );
      expect(unapproved).toMatchObject({ ok: false, error: "invalid_project" });

      // The correct contract usage passes: acquire + typed approved request.
      let thoughtSystemPrompt = "";
      const accepted = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async (messages) => {
          thoughtSystemPrompt = String(messages[0]?.content ?? "");
          return {
            text: JSON.stringify({
              kind: "speak",
              delayClass: null,
              shouldSpeak: true,
              effort: "medium",
              completion: "complete",
              uncertainty: 0.1,
              urgency: 0.4,
              objective: "read package.json for the version",
              reason: "the question asks for a repository fact that needs evidence",
              motivationIds: [1],
              evidenceDisposition: "acquire_project_evidence",
              inspectionRequest: {
                operation: "project.read_file",
                projectId: "project-ashley",
                path: "package.json",
              },
            }),
          };
        },
      );
      expect(accepted.ok).toBe(true);
      if (accepted.ok) {
        expect(accepted.proposal.evidenceDisposition).toBe("acquire_project_evidence");
        expect(accepted.proposal.inspectionRequest).toEqual({
          operation: "project.read_file",
          projectId: "project-ashley",
          path: "package.json",
        });
      }
      // The contract must be visible to Thought and separate defer from acquisition.
      expect(thoughtSystemPrompt).toContain("acquire_project_evidence");
      expect(thoughtSystemPrompt).toContain("defer does not acquire evidence");
      expect(thoughtSystemPrompt).toContain("Approved project IDs: project-ashley");
      expect(thoughtSystemPrompt).toContain(
        "acquire_project_evidence is an action, not a postponement",
      );
    } finally {
      db.close();
    }
  });

  it("Contract: acquire paired with delay+hold is resolved to a speak-class decision (acquisition contradicts postponement)", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);
    try {
      const baseDecision: Decision = {
        trigger: "reactive",
        kind: "speak",
        motivationIds: [1],
        score: 40,
        reason: "respond",
        evidenceRefs: [],
        uncertainty: 0.2,
        urgency: 0.5,
        thoughtSource: "deterministic",
        thoughtError: null,
        affectLicense: {
          permitted: false,
          valence: 0,
          activation: 0.5,
          openness: 0.5,
          tension: 0,
          reason: "test",
        },
        cognitiveAllocation: { shouldSpeak: true, effort: "medium", completion: "complete" },
        authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
      };
      const motivation: Motivation = {
        id: 1,
        kind: "user_message",
        score: 100,
        summary: "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
        refType: "message",
        refId: 1,
      };

      // Production observed the model pairing acquire_project_evidence with
      // kind=delay + completion=hold. Acquisition and postponement are
      // contradictory; the runtime resolves the contradiction in favor of
      // completing the turn after the evidence arrives.
      const pass1 = await deliberateDecision(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "delay",
            delayClass: "brief",
            shouldSpeak: false,
            effort: "medium",
            completion: "hold",
            uncertainty: 0,
            urgency: 0,
            objective: "retrieve version from package.json",
            reason: "need repository data to answer user request",
            motivationIds: [1],
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "package.json",
            },
          }),
        }),
      );
      expect(pass1.kind).toBe("speak");
      expect(pass1.thoughtSource).toBe("model");
      expect(pass1.evidenceDisposition).toBe("acquire_project_evidence");
      expect(pass1.inspectionRequest).toEqual({
        operation: "project.read_file",
        projectId: "project-ashley",
        path: "package.json",
      });
      expect(pass1.cognitiveAllocation).toEqual({
        shouldSpeak: true,
        effort: "medium",
        completion: "complete",
      });
      expect(pass1.delayClass).toBeUndefined();

      // The continuation pass must run for acquire decisions even when the
      // intermediate decision was a delay, so the evidence gets interpreted.
      const observation = {
        projectId: "project-ashley",
        operation: "project.read_file" as const,
        path: "package.json",
        verified: true,
        truncated: false as const,
        executedAtMs: Date.now(),
        contentUtf8: '{"name":"project-ashley","version":"0.2.0"}',
        bytes: 45,
        sha256: "abc",
      };
      let continuationRan = false;
      const pass2 = await deliberateThoughtContinuation(
        db,
        pass1,
        observation,
        null,
        [motivation],
        "reactive",
        async () => {
          continuationRan = true;
          return {
            text: JSON.stringify({
              kind: "speak",
              delayClass: null,
              shouldSpeak: true,
              effort: "medium",
              completion: "complete",
              uncertainty: 0.1,
              urgency: 0.4,
              objective: "report the version from the evidence",
              reason: "the repository inspection returned the version",
              motivationIds: [1],
              inspectionCognitiveResult: "package.json reports version 0.2.0",
            }),
          };
        },
      );
      expect(continuationRan).toBe(true);
      expect(pass2.kind).toBe("speak");
      expect(pass2.inspectionObservation).toEqual(observation);
      expect(pass2.inspectionRequest).toEqual({
        operation: "project.read_file",
        projectId: "project-ashley",
        path: "package.json",
      });

      // If the continuation model again pairs acquisition with postponement,
      // the contradiction is resolved the same way.
      const pass2Stubborn = await deliberateThoughtContinuation(
        db,
        pass1,
        observation,
        null,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "delay",
            delayClass: "brief",
            shouldSpeak: false,
            effort: "low",
            completion: "hold",
            uncertainty: 0,
            urgency: 0,
            objective: "postpone",
            reason: "postpone",
            motivationIds: [1],
            inspectionCognitiveResult: "package.json reports version 0.2.0",
          }),
        }),
      );
      expect(pass2Stubborn.kind).toBe("speak");
      expect(pass2Stubborn.inspectionObservation).toEqual(observation);
      expect(pass2Stubborn.cognitiveAllocation).toEqual({
        shouldSpeak: true,
        effort: "low",
        completion: "complete",
      });
    } finally {
      db.close();
    }
  });

  it("Contract: capability_unavailable is invalid while inspection is offered, and defer remains valid without forcing a tool", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);
    try {
      const baseDecision: Decision = {
        trigger: "reactive",
        kind: "speak",
        motivationIds: [1],
        score: 40,
        reason: "respond",
        evidenceRefs: [],
        uncertainty: 0.2,
        urgency: 0.1,
        thoughtSource: "deterministic",
        thoughtError: null,
        affectLicense: {
          permitted: false,
          valence: 0,
          activation: 0.5,
          openness: 0.5,
          tension: 0,
          reason: "test",
        },
        cognitiveAllocation: { shouldSpeak: true, effort: "medium", completion: "complete" },
        authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
      };
      const motivation: Motivation = {
        id: 1,
        kind: "user_message",
        score: 40,
        summary: "some ordinary message",
        refType: "message",
        refId: 1,
      };

      // Claiming unavailability while the capability is offered contradicts
      // the authoritative capability state: rejected structurally.
      const unavailableWhileOffered = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "low",
            completion: "complete",
            uncertainty: 0.1,
            urgency: 0.2,
            objective: "decline inspection",
            reason: "no inspection available",
            motivationIds: [1],
            evidenceDisposition: "capability_unavailable",
          }),
        }),
      );
      expect(unavailableWhileOffered).toMatchObject({ ok: false, error: "invalid_evidence_disposition_pairing" });

      // Intentional, unrelated deferral stays valid and acquires nothing:
      // not every missing-information turn is forced to execute a tool.
      const deferred = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "delay",
            delayClass: "standard",
            shouldSpeak: false,
            effort: "low",
            completion: "hold",
            uncertainty: 0.2,
            urgency: 0.1,
            objective: "revisit tomorrow",
            reason: "not worth acting on right now",
            motivationIds: [1],
            evidenceDisposition: "defer",
          }),
        }),
      );
      expect(deferred.ok).toBe(true);
      if (deferred.ok) {
        expect(deferred.proposal.evidenceDisposition).toBe("defer");
        expect(deferred.proposal.inspectionRequest ?? null).toBeNull();
      }

      // defer alongside a request is contradictory: rejected.
      const deferredWithRequest = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "low",
            completion: "complete",
            uncertainty: 0.1,
            urgency: 0.2,
            objective: "read file",
            reason: "inspection",
            motivationIds: [1],
            evidenceDisposition: "defer",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/index.ts",
            },
          }),
        }),
      );
      expect(deferredWithRequest).toMatchObject({ ok: false, error: "invalid_evidence_disposition_pairing" });

      // sufficient alongside a request is contradictory: rejected.
      const sufficientWithRequest = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "low",
            completion: "complete",
            uncertainty: 0.1,
            urgency: 0.2,
            objective: "read file",
            reason: "inspection",
            motivationIds: [1],
            evidenceDisposition: "sufficient",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/index.ts",
            },
          }),
        }),
      );
      expect(sufficientWithRequest).toMatchObject({ ok: false, error: "invalid_evidence_disposition_pairing" });
    } finally {
      db.close();
    }
  });

  it("Contract: capability genuinely unavailable makes capability_unavailable valid and acquire unreachable", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);
    env.sandboxEngineeringLifecycleEnabled = false;
    try {
      const baseDecision: Decision = {
        trigger: "reactive",
        kind: "speak",
        motivationIds: [1],
        score: 40,
        reason: "respond",
        evidenceRefs: [],
        uncertainty: 0.2,
        urgency: 0.1,
        thoughtSource: "deterministic",
        thoughtError: null,
        affectLicense: {
          permitted: false,
          valence: 0,
          activation: 0.5,
          openness: 0.5,
          tension: 0,
          reason: "test",
        },
        cognitiveAllocation: { shouldSpeak: true, effort: "medium", completion: "complete" },
        authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
      };
      const motivation: Motivation = {
        id: 1,
        kind: "user_message",
        score: 40,
        summary: "some ordinary message",
        refType: "message",
        refId: 1,
      };

      const unavailable = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "low",
            completion: "complete",
            uncertainty: 0.1,
            urgency: 0.2,
            objective: "respond without inspection",
            reason: "inspection not licensed",
            motivationIds: [1],
            evidenceDisposition: "capability_unavailable",
          }),
        }),
      );
      expect(unavailable.ok).toBe(true);
      if (unavailable.ok) {
        expect(unavailable.proposal.evidenceDisposition).toBe("capability_unavailable");
      }

      const acquire = await runThoughtModel(
        db,
        baseDecision,
        [motivation],
        "reactive",
        async () => ({
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "low",
            completion: "complete",
            uncertainty: 0.1,
            urgency: 0.2,
            objective: "read file",
            reason: "inspection",
            motivationIds: [1],
            evidenceDisposition: "acquire_project_evidence",
            inspectionRequest: {
              operation: "project.read_file",
              projectId: "project-ashley",
              path: "src/index.ts",
            },
          }),
        }),
      );
      expect(acquire).toMatchObject({ ok: false, error: "capability_unavailable" });
    } finally {
      db.close();
    }
  });

  it("available + not_performed surfaces as CAN-inspect-but-did-not, never as a capability absence", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);

    const callLog: string[] = [];
    let expressionSystemPrompt = "";

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        const parsedUser = JSON.parse(
          messages.find((m) => m.role === "user")?.content ?? "{}",
        );
        const candidates = Array.isArray(parsedUser.candidates) ? parsedUser.candidates : [];
        const motivationId = candidates.length > 0 ? candidates[0].id : 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "low",
            completion: "complete",
            uncertainty: 0.3,
            urgency: 0.2,
            objective: "answer without repository evidence",
            reason: "answer from memory without inspecting",
            motivationIds: [motivationId],
            evidenceDisposition: "sufficient",
          }),
          model: "gpt-oss-120b",
          modelAlias: "thought",
          resolvedModelId: "openai/gpt-oss-120b",
        };
      }

      callLog.push("expression");
      expressionSystemPrompt = systemContent;
      return {
        text: "i can inspect it but haven't this turn.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);

    const result = await core.handleReactiveChat({
      message:
        "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "expression"]);
    expect(result.text).toContain("inspect");

    // Structured authority and evidence are independent: available + not_performed.
    expect(expressionSystemPrompt).toContain("capabilityAvailable = true");
    expect(expressionSystemPrompt).toContain("inspectionStatus = not_performed");
    expect(expressionSystemPrompt).toContain("verifiedRepositoryEvidence = false");
    expect(expressionSystemPrompt).toContain(
      "Semantics: capabilityAvailable = true with inspectionStatus = not_performed means Ashley CAN inspect approved projects but did not inspect this turn; this is not an inability and must never be expressed as one.",
    );
    expect(expressionSystemPrompt).not.toContain(
      "Semantics: Ashley cannot inspect this turn",
    );
    // The inspection evidence section must not claim capability is unavailable
    // (the candidate workspace section may independently show capabilityAvailable = false).
    const inspectionSection = expressionSystemPrompt.split("Candidate workspace evidence:")[0].split("Project inspection evidence:")[1] ?? "";
    expect(inspectionSection).not.toContain("capabilityAvailable = false");
  });

  it("natural-language inspect without internal operation names still runs M2 when Thought requests inspection", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);
    const calls: string[] = [];
    const m3 = vi.spyOn(v2Execution, "executeWorkspaceExperimentV2");

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((message) => message.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        calls.push("thought");
        const parsedUser = JSON.parse(
          messages.find((message) => message.role === "user")?.content ?? "{}",
        );
        expect(JSON.stringify(parsedUser)).not.toContain("project.read_file");
        return {
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "high",
            completion: "complete",
            uncertainty: 0.1,
            urgency: 0.4,
            objective: "locate the wiring from repository evidence",
            reason: "user asked for inspection of an approved project",
            motivationIds: [parsedUser.candidates?.[0]?.id ?? 1],
            evidenceDisposition: "acquire_project_evidence",
            operationalRequest: {
              kind: "project_inspection",
              request: {
                operation: "project.search_text",
                projectId: "project-ashley",
                path: "apps/agent-service/src",
                pattern: "candidate_authorship",
              },
            },
          }),
          model: "gpt-oss-120b",
          modelAlias: "thought",
          resolvedModelId: "openai/gpt-oss-120b",
        };
      }
      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        calls.push("continuation");
        return {
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "medium",
            completion: "complete",
            uncertainty: 0.05,
            urgency: 0.3,
            objective: "report verified wiring",
            reason: "inspection evidence is in hand",
            motivationIds: [1],
            inspectionCognitiveResult: "candidate_authorship is referenced in the thought operational union",
          }),
          model: "gpt-oss-120b",
          modelAlias: "thought",
          resolvedModelId: "openai/gpt-oss-120b",
        };
      }
      calls.push("expression");
      return {
        text: "candidate_authorship is wired through the thought operational-request union.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockImplementation(async (request: any) => {
      expect(request.operation).toBe("project.search_text");
      expect(request.projectId).toBe("project-ashley");
      calls.push("m2");
      return {
        outcome: "succeeded",
        operation: "project.search_text",
        dispatchAttempted: true,
        dispatchAttemptedAtMs: Date.now(),
        executedAtMs: Date.now(),
        result: {
          kind: "project.search_text",
          path: "apps/agent-service/src",
          pattern: "candidate_authorship",
          matches: [
            { path: "apps/agent-service/src/core/types.ts", line: 88, text: "CognitionOperationalRequest" },
          ],
          truncated: false,
          filesScanned: 1,
        },
      };
    });

    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message:
        "Inspect Project Ashley and tell me where candidate_authorship is wired into the runtime. Don’t change anything.",
      ownerId: "doc",
      channel: "discord",
    });

    expect(calls).toEqual(["thought", "m2", "continuation", "expression"]);
    expect(m3).not.toHaveBeenCalled();
    expect(result.text).toContain("candidate_authorship");
    db.close();
  });

  it("unauthorized project inspection fail-closes without executing M2", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);
    const calls: string[] = [];
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((message) => message.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        calls.push("thought");
        return {
          text: JSON.stringify({
            kind: "speak",
            delayClass: null,
            shouldSpeak: true,
            effort: "low",
            completion: "complete",
            uncertainty: 0.1,
            urgency: 0.2,
            objective: "inspect",
            reason: "user asked",
            motivationIds: [1],
            evidenceDisposition: "acquire_project_evidence",
            operationalRequest: {
              kind: "project_inspection",
              request: {
                operation: "project.read_file",
                projectId: "not-approved",
                path: "README.md",
              },
            },
          }),
          model: "gpt-oss-120b",
          modelAlias: "thought",
          resolvedModelId: "openai/gpt-oss-120b",
        };
      }
      calls.push("expression");
      return {
        text: "I cannot inspect that project.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const dispatch = vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch");
    const core = new AshleyCore(db);
    await core.handleReactiveChat({
      message: "Inspect not-approved and tell me what README says. Don’t change anything.",
      ownerId: "doc",
      channel: "discord",
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(calls).toContain("thought");
    db.close();
  });

  it("Thought attention_deadline makes this-turn inspection unreachable without claiming a look", async () => {
    const dbPath = join(tmpDir, `ashley-core-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateProjectInspection(db);
    let expressionSystemPrompt = "";
    const dispatch = vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch");
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((message) => message.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        throw Object.assign(new Error("attention_deadline"), {
          code: "attention_deadline",
        });
      }
      expressionSystemPrompt = systemContent;
      return {
        text: "I could not inspect anything this turn because Thought did not finish in time.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });
    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message:
        "Inspect Project Ashley and tell me where candidate_authorship is wired into the runtime. Don’t change anything.",
      ownerId: "doc",
      channel: "discord",
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(expressionSystemPrompt).toContain("thoughtError = attention_deadline");
    expect(expressionSystemPrompt).toContain("inspection could not be requested or executed");
    expect(expressionSystemPrompt).not.toContain(
      "this is not an inability and must never be expressed as one",
    );
    expect(result.text.toLowerCase()).not.toMatch(/i inspected/);
    db.close();
  });
});
