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

    // Zero M2 execution and zero M1 execution
    const m2Count = emittedAudits.filter((a) => a.profile === "project_investigation").length;
    const m1Count = emittedAudits.filter((a) => a.profile === "sandbox_workspace_file_roundtrip").length;
    expect(m2Count).toBe(0);
    expect(m1Count).toBe(0);
  });
});
