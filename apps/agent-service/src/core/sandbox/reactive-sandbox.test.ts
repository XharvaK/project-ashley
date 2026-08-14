import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { executeSandboxWorkspaceFileRoundtrip } from "./roundtrip-profile.js";
import {
  detectReactiveSandboxRoundtripRequest,
  evaluateReactiveSandboxAdmission,
} from "./reactive-admission.js";
import {
  ensureEngineeringTables,
  findCorrelatedEngineeringTask,
  loadCoordinatorTasks,
  persistCoordinatorTasks,
} from "./engineering-runs.js";
import { SandboxEngineeringCoordinator } from "./coordinator.js";
import { finalizeHonesty } from "../honesty/finalize.js";
import {
  claimsOwnExecutionRunning,
  claimsOwnExecutionAdmitted,
  claimsOwnExecutionCompletion,
} from "../honesty/claims.js";
import { operationalWorkBlock } from "../context-composer.js";
import type {
  EngineeringExecutionPort,
  EngineeringToolResult,
  ThinkingModel,
  RoundtripEffectEvidence,
} from "./engineering-types.js";

function dummyModel(): ThinkingModel {
  return {
    route: "thinking",
    async proposeNextAction() {
      throw new Error("Zero model calls expected in deterministic roundtrip profile");
    },
  };
}

function createRealFsRoundtripPort(): {
  port: EngineeringExecutionPort;
  tmpDir: string;
  cleanup: () => void;
} {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "sandbox-roundtrip-test-"),
  );

  const port: EngineeringExecutionPort = {
    async executeAction(action): Promise<EngineeringToolResult> {
      const f = action.fields ?? {};
      switch (action.type) {
        case "request_workspace":
          return {
            ok: true,
            data: { workspaceId: "ws-test-1", workspace_path: tmpDir },
            artifactRef: "ws:ws-test-1",
          };
        case "write_workspace_file": {
          const relPath = String(f.relativePath ?? "");
          const target = path.join(tmpDir, relPath);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const content = f.contentBase64
            ? Buffer.from(String(f.contentBase64), "base64").toString("utf8")
            : String(f.contentUtf8 ?? "");
          fs.writeFileSync(target, content, "utf-8");
          return {
            ok: true,
            data: {
              path: relPath,
              bytes_written: Buffer.byteLength(content, "utf8"),
            },
            artifactRef: `file:${relPath}`,
          };
        }
        case "read_workspace_file": {
          const relPath = String(f.relativePath ?? "");
          const target = path.join(tmpDir, relPath);
          if (!fs.existsSync(target)) {
            return {
              ok: false,
              errorCode: "not_found",
              summary: "File not found",
              artifactRef: null,
            };
          }
          const content = fs.readFileSync(target, "utf-8");
          return {
            ok: true,
            data: {
              path: relPath,
              contentBase64: Buffer.from(content, "utf8").toString("base64"),
            },
            artifactRef: `file:${relPath}`,
          };
        }
        case "delete_workspace_file": {
          const relPath = String(f.relativePath ?? "");
          const target = path.join(tmpDir, relPath);
          if (fs.existsSync(target)) {
            fs.unlinkSync(target);
          }
          return {
            ok: true,
            data: { path: relPath, deleted: true },
            artifactRef: null,
          };
        }
        default:
          return {
            ok: false,
            errorCode: "unsupported_tool",
            summary: `Unsupported tool ${action.type}`,
            artifactRef: null,
          };
      }
    },
  };

  return {
    port,
    tmpDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

describe("Reactive Sandbox Execution — First Slice", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    ensureEngineeringTables(db);
  });

  it("A: executes sandbox_workspace_file_roundtrip deterministically against real temp filesystem fixture with zero model calls", async () => {
    const fixture = createRealFsRoundtripPort();
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-roundtrip-1",
        workspaceId: null,
        envelopes: (() => ({})) as never,
        port: fixture.port,
        nowMs: () => 1000,
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      expect(outcome.evidence.verified).toBe(true);
      expect(outcome.evidence.workspaceId).toBe("ws-test-1");
      expect(outcome.evidence.bytesWritten).toBeGreaterThan(0);
      expect(outcome.evidence.readMatches).toBe(true);
      expect(outcome.evidence.deleted).toBe(true);
      expect(outcome.evidence.verifiedAbsent).toBe(true);
      expect(outcome.artifactRefs).toHaveLength(3);
    } finally {
      fixture.cleanup();
    }
  });

  it("B: coordinator runs sandbox_workspace_file_roundtrip and records verified effect evidence in summary", async () => {
    const fixture = createRealFsRoundtripPort();
    try {
      const coordinator = new SandboxEngineeringCoordinator(
        dummyModel(),
        fixture.port,
        {
          owner: "doc",
          budgets: { maxWallMs: 5000, maxModelCalls: 0, maxToolCalls: 10 },
          availableDiagnostics: [],
          nowMs: () => 2000,
          persist: (tasks) => persistCoordinatorTasks(db, tasks),
        },
      );

      const task = coordinator.admit({
        objective: "Test roundtrip",
        projectId: null,
        admissionCause: "user_request",
        profile: "sandbox_workspace_file_roundtrip",
        groundingRefs: ["msg-uuid-1"],
      });

      expect(task.status).toBe("admitted");
      const result = await coordinator.run(task.taskId, (() => ({})) as never);

      expect(result.status).toBe("completed");
      expect(result.summary).toBeDefined();

      const evidence = JSON.parse(result.summary!) as RoundtripEffectEvidence;
      expect(evidence.verified).toBe(true);
      expect(evidence.verifiedAbsent).toBe(true);

      const persisted = loadCoordinatorTasks(db);
      expect(persisted[0]?.status).toBe("completed");
    } finally {
      fixture.cleanup();
    }
  });

  it("C: owner admission detection and authorization", () => {
    const docPrompt =
      "Create a temporary file inside your own sandbox workspace, write a unique sentence into it, read it back, verify the contents, then delete it";
    expect(detectReactiveSandboxRoundtripRequest(docPrompt)).toBe(true);

    const docAdmission = evaluateReactiveSandboxAdmission({
      db,
      ownerId: "doc",
      message: docPrompt,
      messageEntityUuid: "uuid-doc-turn-1",
      configuredOwnerId: "doc",
      autonomous: true,
    });
    expect(docAdmission.admitted).toBe(true);

    const strangerAdmission = evaluateReactiveSandboxAdmission({
      db,
      ownerId: "stranger-123",
      message: docPrompt,
      messageEntityUuid: "uuid-stranger-1",
      configuredOwnerId: "doc",
      autonomous: true,
    });
    expect(strangerAdmission.admitted).toBe(false);
    if (!strangerAdmission.admitted) {
      expect(strangerAdmission.reason).toBe("unauthorized_owner");
    }
  });

  it("D: owner request is idempotent and non-replayable across identical messageEntityUuid", () => {
    const prompt = "run a sandbox workspace file roundtrip";
    const res1 = evaluateReactiveSandboxAdmission({
      db,
      ownerId: "doc",
      message: prompt,
      messageEntityUuid: "uuid-repeat-1",
      configuredOwnerId: "doc",
      autonomous: true,
    });
    expect(res1.admitted).toBe(true);
    if (res1.admitted) expect(res1.replayed).toBe(false);

    const res2 = evaluateReactiveSandboxAdmission({
      db,
      ownerId: "doc",
      message: prompt,
      messageEntityUuid: "uuid-repeat-1",
      configuredOwnerId: "doc",
      autonomous: true,
    });
    expect(res2.admitted).toBe(true);
    if (res2.admitted) {
      expect(res2.replayed).toBe(true);
      expect(res2.admissionId).toBe(res1.admitted ? res1.admissionId : "");
    }
  });

  it("E: claim licensing — ADMITTED permits queuing claims but strictly forbids 'starting now' and completion claims", () => {
    const runningText = "i'll create a temp file inside my sandbox workspace. starting now.";
    const admittedText = "i've accepted that sandbox check and queued it.";
    const completionText = "the temporary file was deleted and verified.";

    // With ADMITTED license
    const admittedLicense = {
      state: "admitted" as const,
      taskId: "adm-1",
      profile: "sandbox_workspace_file_roundtrip" as const,
    };

    // 'starting now' is stripped under ADMITTED
    const resRunning = finalizeHonesty({
      text: runningText,
      readingLicensed: false,
      operationalLicense: admittedLicense,
    });
    expect(resRunning.text).not.toContain("starting now");
    expect(resRunning.text).toBe("i've accepted that sandbox check and it's queued to run.");

    // 'queued it' passes under ADMITTED
    const resAdmitted = finalizeHonesty({
      text: admittedText,
      readingLicensed: false,
      operationalLicense: admittedLicense,
    });
    expect(resAdmitted.text).toBe(admittedText);

    // completion is stripped under ADMITTED
    const resCompletion = finalizeHonesty({
      text: completionText,
      readingLicensed: false,
      operationalLicense: admittedLicense,
    });
    expect(resCompletion.text).toBe("i've accepted that sandbox check and it's queued to run.");
  });

  it("F: claim licensing — RUNNING permits 'starting now' but forbids completion claims", () => {
    const runningText = "i'm running that check in the sandbox now.";
    const completionText = "i verified the contents and deleted the file.";

    const runningLicense = {
      state: "running" as const,
      taskId: "task-1",
      profile: "sandbox_workspace_file_roundtrip" as const,
    };

    const resRunning = finalizeHonesty({
      text: runningText,
      readingLicensed: false,
      operationalLicense: runningLicense,
    });
    expect(resRunning.text).toBe(runningText);

    const resCompletion = finalizeHonesty({
      text: completionText,
      readingLicensed: false,
      operationalLicense: runningLicense,
    });
    expect(resCompletion.text).toBe("i'm currently running that check in the sandbox.");
  });

  it("G: claim licensing — SUCCEEDED requires verified effect evidence (Receipt != Effect Witness)", () => {
    const completionText = "the temporary file was deleted and the contents matched.";

    // Succeeded WITH verified effect evidence
    const verifiedLicense = {
      state: "succeeded" as const,
      taskId: "task-1",
      profile: "sandbox_workspace_file_roundtrip" as const,
      effectEvidence: {
        verified: true,
        workspaceId: "ws-1",
        relativeFilePath: "test.txt",
        writeReceipt: { bytesWritten: 10 },
        readReceipt: { contentMatches: true },
        deleteReceipt: { deleted: true },
        subsequentReadAbsent: true,
        executedAtMs: Date.now(),
      },
    };
    const resVerified = finalizeHonesty({
      text: completionText,
      readingLicensed: false,
      operationalLicense: verifiedLicense,
    });
    expect(resVerified.text).toBe(completionText);

    // Succeeded WITHOUT verified effect evidence (unverified receipt)
    const unverifiedLicense = {
      state: "succeeded" as const,
      taskId: "task-1",
      profile: "sandbox_workspace_file_roundtrip" as const,
      effectEvidence: undefined,
    };
    const resUnverified = finalizeHonesty({
      text: completionText,
      readingLicensed: false,
      operationalLicense: unverifiedLicense,
    });
    // Strips unverified completion claim and produces safe fallback
    expect(resUnverified.text).toBe(
      "i haven't been doing anything worth mentioning on my side. what's up?",
    );
  });

  it("H: fallback honesty replaces generic activity fallback with truthful operational refusal when refused", () => {
    const unlicensedPrompt = "i'll create a temp file inside my sandbox workspace. starting now.";
    const refusedLicense = {
      state: "none" as const,
      refusalReason: "autonomy_disabled",
    };

    const res = finalizeHonesty({
      text: unlicensedPrompt,
      readingLicensed: false,
      operationalLicense: refusedLicense,
    });
    expect(res.text).toBe(
      "i haven't started that check because the sandbox admission was refused: autonomy_disabled.",
    );
    expect(res.text).not.toContain("anything worth mentioning on my side");
  });

  it("I: context composer projects correlated operational work state in next turn ('Could you?')", async () => {
    // Persist a completed reactive task
    const fixture = createRealFsRoundtripPort();
    try {
      const coordinator = new SandboxEngineeringCoordinator(
        dummyModel(),
        fixture.port,
        {
          owner: "doc",
          budgets: { maxWallMs: 5000, maxModelCalls: 0, maxToolCalls: 10 },
          availableDiagnostics: [],
          nowMs: () => 3000,
          persist: (tasks) => persistCoordinatorTasks(db, tasks),
        },
      );

      const task = coordinator.admit({
        objective: "Test roundtrip",
        projectId: null,
        admissionCause: "user_request",
        profile: "sandbox_workspace_file_roundtrip",
        groundingRefs: ["turn-1-uuid"],
      });
      await coordinator.run(task.taskId, (() => ({})) as never);

      // Now query correlated task in turn 2
      const correlated = findCorrelatedEngineeringTask(db, "doc");
      expect(correlated).not.toBeNull();
      expect(correlated?.taskId).toBe(task.taskId);

      // ContextComposer generates operational block
      const opBlock = operationalWorkBlock(db, "doc");
      expect(opBlock).toContain("## Operational work state");
      expect(opBlock).toContain("sandbox_workspace_file_roundtrip");
      expect(opBlock).toContain("Effect evidence: roundtrip verified");
    } finally {
      fixture.cleanup();
    }
  });

  it("J: regexes accurately classify execution claims in claims.ts", () => {
    expect(claimsOwnExecutionRunning("starting now")).toBe(true);
    expect(claimsOwnExecutionRunning("i'll create a test file inside my sandbox workspace now")).toBe(true);
    expect(claimsOwnExecutionRunning("i'm on it now")).toBe(true);

    expect(claimsOwnExecutionAdmitted("i've accepted that check")).toBe(true);
    expect(claimsOwnExecutionAdmitted("request queued")).toBe(true);

    expect(claimsOwnExecutionCompletion("the temporary file was deleted")).toBe(true);
    expect(claimsOwnExecutionCompletion("the file check passed and matched")).toBe(true);
  });
});
