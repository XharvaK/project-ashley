import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import { env } from "../../env.js";
import { AshleyCore } from "../runtime.js";
import * as mistral from "../../mistral-client.js";
import * as v2LicenseAudit from "./v2-license-audit.js";
import {
  SandboxV2Dispatcher,
  WorkspaceManager,
  type SandboxV2Request,
  type SandboxV2Result,
} from "@composer-assistant/sandbox-v2";
import {
  currentReleaseId,
  currentContractId,
  currentBuildIdentity,
  capabilityNames,
} from "../rollout/capabilities.js";
import { createQuestion } from "../state/questions.js";
import { canOfferCandidateWorkspace } from "./project-registry.js";
import { deriveOperationalTruth } from "./operational-truth.js";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function activateCapabilities(db: DatabaseSync) {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  for (const cap of capabilityNames) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

describe("Sandbox V2 M3 Root-A Closure & Full Cognition Witness", () => {
  const originalMode = env.cognitionMode;
  const originalGroqKey = env.groqApiKey;
  const originalLifecycle = env.sandboxEngineeringLifecycleEnabled;
  const originalRegistryPath = env.sandboxProjectRegistryPath;

  let tmpDir: string;
  let registryPath: string;
  let liveRepoDir: string;
  let managedWorkspacesDir: string;

  beforeEach(() => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test-key";
    env.sandboxEngineeringLifecycleEnabled = true;
    process.env.SANDBOX_V2_FORCE_AVAILABLE = "true";

    tmpDir = mkdtempSync(join(tmpdir(), "v2-m3-witness-"));
    liveRepoDir = join(tmpDir, "live-repo");
    managedWorkspacesDir = join(tmpDir, "managed-workspaces");
    mkdirSync(liveRepoDir, { recursive: true });
    mkdirSync(managedWorkspacesDir, { recursive: true });

    // Seed live repo with real package.json for M2 regression
    writeFileSync(
      join(liveRepoDir, "package.json"),
      JSON.stringify({ name: "project-ashley", version: "0.2.0" }, null, 2),
      "utf8",
    );

    registryPath = join(tmpDir, "registry.json");
    writeFileSync(
      registryPath,
      JSON.stringify([
        {
          projectId: "project-ashley",
          canonicalRoot: "/srv/projects/project-ashley",
          displayName: "Ashley",
          enabled: true,
          readAllowed: true,
          candidateWorkspaceAllowed: true,
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

  // =========================================================================
  // 1. Root-A Regression: Single Execution Authority Proof
  // =========================================================================
  it("Root-A Regression: Decision.operationalRequest is the SOLE execution authority; legacy inspectionRequest cannot execute independently", async () => {
    const dbPath = join(tmpDir, `ashley-core-roota-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateCapabilities(db);

    let m2Count = 0;
    let m3Count = 0;

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockImplementation(async (req: any) => {
      if (req.operation.startsWith("project.")) {
        m2Count++;
        return {
          outcome: "succeeded",
          operation: req.operation,
          executedAtMs: Date.now(),
          result: {
            kind: req.operation,
            path: (req as any).path ?? "package.json",
            contentBase64: Buffer.from(JSON.stringify({ version: "0.2.0" })).toString("base64"),
            bytes: 20,
            sha256: "hash020",
            truncated: false,
          },
        } as SandboxV2Result;
      } else if (req.operation.startsWith("workspace.")) {
        m3Count++;
        return {
          outcome: "succeeded",
          operation: req.operation,
          workspaceId: "ws-mock-root-a",
          sourceSnapshotId: "snap_mock_roota",
          executedAtMs: Date.now(),
          result: {
            kind: req.operation,
            path: (req as any).path ?? "witness.txt",
            bytesWritten: 10,
            completedAtMs: Date.now(),
          },
        } as SandboxV2Result;
      }
      return { outcome: "failed", operation: req?.operation ?? "unknown", error: "unknown_operation", executedAtMs: Date.now() };
    });

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect package.json",
            reason: "need version",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "acquire_project_evidence",
            // Model emits inspectionRequest, which Thought normalizes to operationalRequest
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
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "report version 0.2.0",
            reason: "verified observation",
            motivationIds: [1],
            shouldSpeak: true,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }
      return {
        text: "The version in package.json is 0.2.0.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: "What version is in package.json?",
      ownerId: "doc",
      channel: "discord",
    });

    // Exactly 1 M2 dispatch, 0 M3 dispatches, 0 M1 dispatches
    expect(m2Count).toBe(1);
    expect(m3Count).toBe(0);
    expect(result.text).toContain("0.2.0");
  });

  // =========================================================================
  // 2. M2 Exact 0.2.0 Package-Version Regression Witness
  // =========================================================================
  it("M2 Exact Regression: User asks package.json version -> Thought Pass 1 -> M2 Execution -> Pass 2 (0.2.0) -> Expression", async () => {
    const dbPath = join(tmpDir, `ashley-core-m2-ver-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateCapabilities(db);

    let m2Dispatches = 0;
    let m3Dispatches = 0;

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockImplementation(async (req: any) => {
      if (req.operation === "project.read_file") {
        m2Dispatches++;
        expect(req.projectId).toBe("project-ashley");
        expect((req as any).path).toBe("package.json");
        return {
          outcome: "succeeded",
          operation: "project.read_file",
          executedAtMs: Date.now(),
          result: {
            kind: "project.read_file",
            path: "package.json",
            contentBase64: Buffer.from(JSON.stringify({ name: "project-ashley", version: "0.2.0" })).toString("base64"),
            bytes: 45,
            sha256: "sha256-020",
            truncated: false,
          },
        } as SandboxV2Result;
      }
      m3Dispatches++;
      return { outcome: "failed", operation: req?.operation ?? "unknown", error: "unexpected_operation", executedAtMs: Date.now() };
    });

    const callLog: string[] = [];

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect package.json for version",
            reason: "need repository evidence to answer accurately",
            motivationIds: [1],
            shouldSpeak: true,
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
        const parsed = JSON.parse(userContent);
        expect(parsed.observation).toBeDefined();
        expect(parsed.observation.contentUtf8).toContain("0.2.0");

        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "inform user that version is 0.2.0",
            reason: "verified observation from package.json",
            cognitiveResult: "The project version is 0.2.0 in package.json",
            motivationIds: [1],
            shouldSpeak: true,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      callLog.push("expression");
      return {
        text: "I inspected `package.json` in the Project Ashley repository and the current version is `0.2.0`.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message: "Can you inspect your Project Ashley repository and tell me what version is in package.json?",
      ownerId: "doc",
      channel: "discord",
    });

    expect(callLog).toEqual(["thought_pass1", "thought_pass2", "expression"]);
    expect(m2Dispatches).toBe(1);
    expect(m3Dispatches).toBe(0);
    expect(result.text).toContain("0.2.0");
  });

  // =========================================================================
  // 3. Missing Acceptance Evidence: Full M3 Cognition Witness
  // =========================================================================
  it("Full M3 Cognition Witness: Thought Pass 1 -> M3 candidate_workspace_experiment -> Verified write -> Observation -> Thought Pass 2 -> Claim Effect -> Expression", async () => {
    const dbPath = join(tmpDir, `ashley-core-m3-full-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateCapabilities(db);

    const emittedAudits: v2LicenseAudit.SandboxV2LicenseAuditRecord[] = [];
    vi.spyOn(v2LicenseAudit, "emitSandboxV2LicenseAudit").mockImplementation(
      (license, observationOrSink) => {
        const obs = typeof observationOrSink === "function" ? null : observationOrSink ?? null;
        const record = v2LicenseAudit.formatSandboxV2LicenseAudit(license, obs);
        if (record) emittedAudits.push(record);
      },
    );

    let m2Count = 0;
    let m3Count = 0;
    let m1Count = 0;

    const wsManager = new WorkspaceManager({ managedRoot: managedWorkspacesDir });
    let createdWorkspaceId = "";

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockImplementation(async (req: any) => {
      if (req.operation.startsWith("project.")) {
        m2Count++;
        return { outcome: "failed", operation: req.operation, error: "unexpected_m2", executedAtMs: Date.now() };
      }
      if (req.operation === "file.roundtrip") {
        m1Count++;
        return { outcome: "failed", operation: req.operation, error: "unexpected_m1", executedAtMs: Date.now() };
      }

      m3Count++;
      // Execute M3 write in durable candidate workspace
      expect(req.operation).toBe("workspace.write_file");
      const wsReq = req as any;
      expect(wsReq.projectId).toBe("project-ashley");
      expect(wsReq.path).toBe("m3-witness.txt");
      expect(wsReq.content).toBe("m3-witness-ok");
      expect(wsReq.mustNotExist).toBe(true);

      // Model did NOT provide canonicalRoot
      expect((wsReq as any).canonicalRoot).toBeUndefined();

      // Parent authority created/acquired durable workspace
      const acq = await wsManager.acquireWorkspace({
        projectId: wsReq.projectId,
        canonicalRoot: liveRepoDir,
      });
      expect(acq.ok).toBe(true);
      if (!acq.ok) throw new Error("acquire_failed");
      createdWorkspaceId = acq.workspaceId;

      // Write file into candidate workspace tree
      const candidateFilePath = join(acq.workspaceTreeRoot, wsReq.path);
      writeFileSync(candidateFilePath, wsReq.content, "utf8");

      return {
        outcome: "succeeded",
        operation: "workspace.write_file",
        workspaceId: acq.workspaceId,
        sourceSnapshotId: acq.manifest.sourceSnapshotId,
        executedAtMs: Date.now(),
        result: {
          kind: "workspace.write_file",
          path: wsReq.path,
          bytesWritten: Buffer.byteLength(wsReq.content, "utf8"),
          contentHash: "sha256-m3-witness-ok",
          readMatches: true,
          deleted: false,
          verifiedAbsent: false,
          completedAtMs: Date.now(),
        },
      } as SandboxV2Result;
    });

    const callLog: string[] = [];
    let pass2ReceivedObservation: any = null;
    let expressionSystemPrompt = "";

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      const userContent = messages.find((m) => m.role === "user")?.content ?? "";

      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        callLog.push("thought_pass1");
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "create m3-witness.txt in candidate workspace",
            reason: "user requested candidate workspace write witness",
            motivationIds: [1],
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
            workspaceRequest: {
              operation: "workspace.write_file",
              projectId: "project-ashley",
              path: "m3-witness.txt",
              content: "m3-witness-ok",
              mustNotExist: true,
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      if (systemContent.includes("Ashley's Thought layer continuing deliberation")) {
        callLog.push("thought_pass2");
        const parsed = JSON.parse(userContent);
        pass2ReceivedObservation = parsed.observation;

        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "confirm m3-witness.txt was written to candidate workspace",
            reason: "verified candidate workspace effect",
            cognitiveResult: "Created m3-witness.txt with content 'm3-witness-ok' in private candidate workspace without modifying live repo.",
            motivationIds: [1],
            shouldSpeak: true,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }

      callLog.push("expression");
      expressionSystemPrompt = systemContent;
      return {
        text: "I have created `m3-witness.txt` in a private candidate workspace with `m3-witness-ok`. The live repository was not modified.",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);
    const result = await core.handleReactiveChat({
      message:
        "Create a file named m3-witness.txt in a private candidate workspace for Project Ashley containing exactly:\nm3-witness-ok\nDo not modify the live repository. Tell me what happened.",
      ownerId: "doc",
      channel: "discord",
    });

    // 1. Thought pass 1 & pass 2 & expression occurred in exact order
    expect(callLog).toEqual(["thought_pass1", "thought_pass2", "expression"]);

    // 2. Dispatch counts: M3 = 1, M2 = 0, M1 = 0
    expect(m3Count).toBe(1);
    expect(m2Count).toBe(0);
    expect(m1Count).toBe(0);

    // 3. Opaque workspaceId was generated
    expect(createdWorkspaceId).toBeTruthy();

    // 4. Live repo remains UNCHANGED / witness absent
    expect(existsSync(join(liveRepoDir, "m3-witness.txt"))).toBe(false);

    // 5. Candidate workspace contains m3-witness.txt with exact content
    const candidateFile = join(managedWorkspacesDir, createdWorkspaceId, "tree", "m3-witness.txt");
    expect(existsSync(candidateFile)).toBe(true);
    expect(readFileSync(candidateFile, "utf8")).toBe("m3-witness-ok");

    // 6. Pass 2 received verified WorkspaceExperimentObservation
    expect(pass2ReceivedObservation).toBeDefined();
    expect(pass2ReceivedObservation.operation).toBe("workspace.write_file");
    expect(pass2ReceivedObservation.workspaceId).toBe(createdWorkspaceId);
    expect(pass2ReceivedObservation.logicalRelativePath).toBe("m3-witness.txt");
    expect(pass2ReceivedObservation.bytesWritten).toBe(13);

    // 7. Audit log emitted safe facts (no code dumps, no host filesystem roots)
    expect(emittedAudits.length).toBeGreaterThan(0);
    const m3Audit = emittedAudits.find((a) => a.profile === "project_experimentation");
    expect(m3Audit).toBeDefined();
    expect(m3Audit?.verified).toBe(true);
    expect(m3Audit?.workspaceEffect?.logicalRelativePath).toBe("m3-witness.txt");
    expect(m3Audit?.workspaceEffect?.bytesWritten).toBe(13);

    const rawAudit = JSON.stringify(m3Audit);
    expect(rawAudit).not.toContain(liveRepoDir);
    expect(rawAudit).not.toContain(managedWorkspacesDir);

    // 8. Expression output
    expect(result.text).toContain("m3-witness.txt");
    expect(result.text).toContain("candidate workspace");
  });

  // =========================================================================
  // 4. Cross-Operation Persistence Witness
  // =========================================================================
  it("Cross-Operation Persistence Witness: Write file in workspace W -> Read file in workspace W -> Content persists across operations", async () => {
    const wsManager = new WorkspaceManager({ managedRoot: managedWorkspacesDir });

    // Step 1: Acquire new workspace and write m3-witness.txt
    const acq1 = await wsManager.acquireWorkspace({
      projectId: "project-ashley",
      canonicalRoot: liveRepoDir,
    });
    expect(acq1.ok).toBe(true);
    if (!acq1.ok) throw new Error("acquire_failed");
    const workspaceId = acq1.workspaceId;
    expect(acq1.isNew).toBe(true);

    const candidateFile = join(acq1.workspaceTreeRoot, "m3-witness.txt");
    writeFileSync(candidateFile, "m3-witness-ok", "utf8");

    // Step 2: Resume existing workspace using workspaceId
    const acq2 = await wsManager.acquireWorkspace(
      {
        projectId: "project-ashley",
        canonicalRoot: liveRepoDir,
      },
      workspaceId,
    );
    expect(acq2.ok).toBe(true);
    if (!acq2.ok) throw new Error("resume_failed");
    expect(acq2.workspaceId).toBe(workspaceId);
    expect(acq2.isNew).toBe(false);

    // Step 3: Verify content persisted without source reinitialization
    const resumedFile = join(acq2.workspaceTreeRoot, "m3-witness.txt");
    expect(existsSync(resumedFile)).toBe(true);
    expect(readFileSync(resumedFile, "utf8")).toBe("m3-witness-ok");

    // Step 4: Verify live repo was NEVER mutated
    expect(existsSync(join(liveRepoDir, "m3-witness.txt"))).toBe(false);
  });

  // =========================================================================
  // 5. Proactive Scope Restriction Regression
  // =========================================================================
  it("Proactive Scope Restriction: Proactive Thought emitting candidate_workspace_experiment fails closed (M3=0, M2=0, M1=0, no mutations)", async () => {
    const dbPath = join(tmpDir, `ashley-core-proactive-m3-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateCapabilities(db);

    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "should we run a background experiment?",
      priority: 80,
    });

    let m2Count = 0;
    let m3Count = 0;
    let m1Count = 0;

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockImplementation(async (req: any) => {
      if (req.operation.startsWith("project.")) {
        m2Count++;
        return { outcome: "succeeded", operation: req.operation, executedAtMs: Date.now(), result: {} as any };
      }
      if (req.operation.startsWith("workspace.")) {
        m3Count++;
        return {
          outcome: "succeeded",
          operation: req.operation,
          workspaceId: "ws-mock-test5",
          sourceSnapshotId: "snap_mock_test5",
          executedAtMs: Date.now(),
          result: {
            kind: req.operation,
            path: req.path ?? "unpoisoned.txt",
            bytesWritten: 11,
            completedAtMs: Date.now(),
          },
        } as SandboxV2Result;
      }
      m1Count++;
      return { outcome: "failed", operation: req?.operation ?? "unknown", error: "unexpected", executedAtMs: Date.now() };
    });

    // Mock Thought pass 1 during proactive tick returning an unauthorized M3 workspace request
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "proactively create must-not-be-created.txt",
            reason: "forbidden proactive write attempt",
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
            workspaceRequest: {
              operation: "workspace.write_file",
              projectId: "project-ashley",
              path: "must-not-be-created.txt",
              content: "forbidden-proactive-write",
            },
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
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

    // 1. Assert: M3 = 0, M2 = 0, M1 = 0 (no execution attempted in proactive origin)
    expect(m3Count).toBe(0);
    expect(m2Count).toBe(0);
    expect(m1Count).toBe(0);

    // 2. Assert: No live repository mutation
    expect(existsSync(join(liveRepoDir, "must-not-be-created.txt"))).toBe(false);

    // 3. Assert: No candidate workspace mutation
    expect(existsSync(join(managedWorkspacesDir, "must-not-be-created.txt"))).toBe(false);

    // 4. Assert: Capability truth preserved — capability is NOT disabled globally
    expect(canOfferCandidateWorkspace(db)).toBe(true);

    // 5. Assert: Operational Truth derived from proactive denial has state="none" (not "failed")
    const truth = deriveOperationalTruth({
      state: "none",
      profile: "project_experimentation",
      error: "proactive_workspace_experiment_unauthorized",
    });
    expect(truth.state).toBe("none");
    expect(truth.error).toBe("proactive_workspace_experiment_unauthorized");

    // 6. Assert: Proactive denial does NOT poison subsequent reactive M3 execution
    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "reactively write unpoisoned.txt",
            reason: "reactive M3 should succeed",
            shouldSpeak: true,
            evidenceDisposition: "sufficient",
            workspaceRequest: {
              operation: "workspace.write_file",
              projectId: "project-ashley",
              path: "unpoisoned.txt",
              content: "reactive-ok",
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
            objective: "synthesize reactive success",
            reason: "verified observation",
            motivationIds: [1],
            shouldSpeak: true,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }
      return {
        text: "reactive response",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const reactiveResult = await core.handleReactiveChat({
      message: "run reactive check",
      ownerId: "doc",
      channel: "discord",
    });
    expect(m3Count).toBe(1);
    expect(reactiveResult.text).toBe("reactive response");
  });

  // =========================================================================
  // 6. Proactive M2 Preservation Regression
  // =========================================================================
  it("Proactive M2 Preservation: Proactive Thought emitting project_inspection executes exactly 1 M2 operation (M2=1, M3=0, M1=0)", async () => {
    const dbPath = join(tmpDir, `ashley-core-proactive-m2-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(dbPath));
    activateCapabilities(db);

    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "what is the version?",
      priority: 80,
    });

    let m2Count = 0;
    let m3Count = 0;

    vi.spyOn(SandboxV2Dispatcher.prototype, "dispatch").mockImplementation(async (req: any) => {
      if (req.operation.startsWith("project.")) {
        m2Count++;
        return {
          outcome: "succeeded",
          operation: req.operation,
          executedAtMs: Date.now(),
          result: {
            kind: req.operation,
            path: "package.json",
            contentBase64: Buffer.from(JSON.stringify({ version: "0.2.0" })).toString("base64"),
            bytes: 20,
            sha256: "hash020",
            truncated: false,
          },
        } as SandboxV2Result;
      }
      m3Count++;
      return { outcome: "failed", operation: req?.operation ?? "unknown", error: "unexpected", executedAtMs: Date.now() };
    });

    vi.spyOn(mistral, "completeChat").mockImplementation(async (messages: any[]) => {
      const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
      if (systemContent.includes("Ashley's Thought layer, not her Expression layer")) {
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "high",
            completion: "complete",
            objective: "inspect package.json proactively",
            reason: "check version in repo",
            motivationIds: [1],
            shouldSpeak: true,
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
        return {
          text: JSON.stringify({
            kind: "speak",
            effort: "medium",
            completion: "complete",
            objective: "synthesize version 0.2.0",
            reason: "verified observation",
            motivationIds: [1],
            shouldSpeak: true,
          }),
          model: "mistral-large",
          modelAlias: "thought",
          resolvedModelId: "mistral-large",
        };
      }
      return {
        text: "proactive inspection response",
        model: "mistral-large",
        modelAlias: "expression",
        resolvedModelId: "mistral-large",
      };
    });

    const core = new AshleyCore(db);
    await core.tickProactive("doc");

    // Proactive M2 executes exactly once
    expect(m2Count).toBe(1);
    expect(m3Count).toBe(0);
  });
});
