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
  OperationalClaimLicense,
} from "./engineering-types.js";
import type { DelegatedApprovalEnvelope } from "@composer-assistant/sandbox-broker";

function dummyModel(): ThinkingModel {
  return {
    route: "thinking",
    async proposeNextAction() {
      throw new Error("Zero model calls expected in deterministic roundtrip profile");
    },
  };
}

/**
 * Creates a broker execution port backed by a real temporary directory on the
 * filesystem, enforcing envelope single-use anti-replay tracking.
 */
function createRealFsRoundtripPort(options?: {
  failAbsenceReadWith?: { errorCode: string; reason: string };
}): {
  port: EngineeringExecutionPort;
  tmpDir: string;
  seenEnvelopes: Set<string>;
  actionCount: Record<string, number>;
  cleanup: () => void;
} {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "sandbox-roundtrip-test-"),
  );
  const seenEnvelopes = new Set<string>();
  const actionCount: Record<string, number> = {
    request_workspace: 0,
    write_workspace_file: 0,
    read_workspace_file: 0,
    delete_workspace_file: 0,
  };

  const port: EngineeringExecutionPort = {
    async executeAction(action, envelope): Promise<EngineeringToolResult> {
      // Production-faithful anti-replay check: envelopes must be unique per attempt
      const envKey = envelope ? JSON.stringify(envelope) : `anon-${Math.random()}`;
      if (seenEnvelopes.has(envKey)) {
        return {
          ok: false,
          errorCode: "replay_rejected",
          reason: "envelope reuse detected",
        };
      }
      seenEnvelopes.add(envKey);

      const f = action.fields ?? {};
      actionCount[action.type] = (actionCount[action.type] ?? 0) + 1;

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

          // If injected failure for absence check is set and this is the second read
          if (options?.failAbsenceReadWith && actionCount.read_workspace_file > 1) {
            return {
              ok: false,
              errorCode: options.failAbsenceReadWith.errorCode,
              reason: options.failAbsenceReadWith.reason,
            };
          }

          if (!fs.existsSync(target)) {
            return {
              ok: false,
              errorCode: "not_found",
              reason: "file not found",
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
            reason: `Unsupported tool ${action.type}`,
          };
      }
    },
  };

  return {
    port,
    tmpDir,
    seenEnvelopes,
    actionCount,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

function mockEnvelopeProvider(): (action: unknown, intent: string, nowMs: number) => DelegatedApprovalEnvelope {
  let counter = 0;
  return (_action, intent, nowMs) =>
    ({
      version: "1.0",
      intent,
      timestamp: nowMs,
      nonce: `nonce-${++counter}-${Math.random()}`,
      signature: `sig-${counter}`,
    }) as unknown as DelegatedApprovalEnvelope;
}

describe("Reactive Sandbox Execution — First Slice", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    ensureEngineeringTables(db);
  });

  it("1: executes sandbox_workspace_file_roundtrip deterministically against real temp filesystem fixture with zero model calls", async () => {
    const fixture = createRealFsRoundtripPort();
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-roundtrip-1",
        workspaceId: null,
        envelopes: mockEnvelopeProvider() as never,
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

  it("2: coordinator runs sandbox_workspace_file_roundtrip and records verified effect evidence in task.effectEvidence and summary", async () => {
    const fixture = createRealFsRoundtripPort();
    try {
      const coordinator = new SandboxEngineeringCoordinator(
        dummyModel(),
        fixture.port,
        {
          owner: "doc",
          budgets: { maxWallMs: 5000, maxModelCalls: 0, maxToolExecutions: 10 },
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
      const result = await coordinator.run(task.taskId, mockEnvelopeProvider() as never);

      expect(result.status).toBe("completed");
      expect(result.effectEvidence).toBeDefined();
      expect(result.effectEvidence?.verified).toBe(true);
      expect(result.effectEvidence?.verifiedAbsent).toBe(true);

      const persisted = loadCoordinatorTasks(db);
      expect(persisted[0]?.status).toBe("completed");
      expect(persisted[0]?.effectEvidence?.verified).toBe(true);
      expect(persisted[0]?.effectEvidence?.deleted).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("3: owner admission detection and unauthorized stranger refusal", () => {
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
    if (docAdmission.admitted) {
      expect(docAdmission.shouldDispatch).toBe(true);
    }

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

  it("4: owner request processed twice causes at most ONE execution attempt (shouldDispatch=false on replay)", () => {
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
    if (res1.admitted) {
      expect(res1.replayed).toBe(false);
      expect(res1.shouldDispatch).toBe(true);
    }

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
      expect(res2.shouldDispatch).toBe(false); // MUST NOT re-dispatch on replay
      expect(res2.admissionId).toBe(res1.admitted ? res1.admissionId : "");
    }
  });

  it("5: initial read and absence verification read use DISTINCT envelopes (anti-replay)", async () => {
    const fixture = createRealFsRoundtripPort();
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-distinct-envelopes",
        workspaceId: null,
        envelopes: mockEnvelopeProvider() as never,
        port: fixture.port,
        nowMs: () => 1000,
      });

      expect(outcome.ok).toBe(true);
      // Both reads executed without encountering replay_rejected
      expect(fixture.actionCount.read_workspace_file).toBe(2);
      expect(fixture.seenEnvelopes.size).toBe(5); // workspace_create, write, read_1, delete, read_2 (absence)
    } finally {
      fixture.cleanup();
    }
  });

  it("6: replay rejection during absence check cannot be interpreted as file absence", async () => {
    const fixture = createRealFsRoundtripPort({
      failAbsenceReadWith: { errorCode: "replay_rejected", reason: "envelope reuse detected" },
    });
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-replay-absence",
        workspaceId: null,
        envelopes: mockEnvelopeProvider() as never,
        port: fixture.port,
        nowMs: () => 1000,
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errorCode).toBe("replay_rejected");
        expect(outcome.reason).toContain("absence_verification_failed");
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("7: policy / broker / transport failure during absence check cannot be interpreted as absence", async () => {
    const fixture = createRealFsRoundtripPort({
      failAbsenceReadWith: { errorCode: "policy_violation", reason: "access denied" },
    });
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-policy-absence",
        workspaceId: null,
        envelopes: mockEnvelopeProvider() as never,
        port: fixture.port,
        nowMs: () => 1000,
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errorCode).toBe("policy_violation");
        expect(outcome.reason).toContain("absence_verification_failed");
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("8: only canonical 'not_found' error witnesses deletion", async () => {
    // Port returning not_found on second read -> succeeds
    const fixture = createRealFsRoundtripPort();
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-not-found-witness",
        workspaceId: null,
        envelopes: mockEnvelopeProvider() as never,
        port: fixture.port,
        nowMs: () => 1000,
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.evidence.verifiedAbsent).toBe(true);
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("9: claim licensing — ADMITTED permits queuing claims but strictly forbids 'starting now' and completion claims", () => {
    const runningText = "i'll create a temp file inside my sandbox workspace. starting now.";
    const admittedText = "i've accepted that sandbox check and queued it.";
    const completionText = "the temporary file was deleted and verified.";

    // With ADMITTED license
    const admittedLicense: OperationalClaimLicense = {
      state: "admitted",
      taskId: "adm-1",
      profile: "sandbox_workspace_file_roundtrip",
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

  it("10: claim licensing — RUNNING permits 'starting now' but forbids completion claims", () => {
    const runningText = "i'm running that check in the sandbox now.";
    const completionText = "i verified the contents and deleted the file.";

    const runningLicense: OperationalClaimLicense = {
      state: "running",
      taskId: "task-1",
      profile: "sandbox_workspace_file_roundtrip",
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

  it("11: claim licensing — SUCCEEDED requires verified effect evidence (Receipt != Effect Witness)", () => {
    const completionText = "the temporary file was deleted and the contents matched.";

    // Succeeded WITH verified effect evidence
    const verifiedEvidence: RoundtripEffectEvidence = {
      verified: true,
      workspaceId: "ws-1",
      relativePath: "test.txt",
      bytesWritten: 10,
      contentHash: "hash-123",
      readMatches: true,
      deleted: true,
      verifiedAbsent: true,
      completedAtMs: Date.now(),
    };
    const verifiedLicense: OperationalClaimLicense = {
      state: "succeeded",
      taskId: "task-1",
      profile: "sandbox_workspace_file_roundtrip",
      effectEvidence: verifiedEvidence,
    };
    const resVerified = finalizeHonesty({
      text: completionText,
      readingLicensed: false,
      operationalLicense: verifiedLicense,
    });
    expect(resVerified.text).toBe(completionText);

    // Succeeded WITHOUT verified effect evidence (unverified / missing)
    const unverifiedLicense: OperationalClaimLicense = {
      state: "succeeded",
      taskId: "task-1",
      profile: "sandbox_workspace_file_roundtrip",
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

  it("12: fallback honesty replaces generic activity fallback with truthful operational refusal when refused", () => {
    const unlicensedPrompt = "i'll create a temp file inside my sandbox workspace. starting now.";
    const refusedLicense: OperationalClaimLicense = {
      state: "none",
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

  it("13: context composer projects correlated operational work state in next turn ('Could you?')", async () => {
    // Persist a completed reactive task
    const fixture = createRealFsRoundtripPort();
    try {
      const coordinator = new SandboxEngineeringCoordinator(
        dummyModel(),
        fixture.port,
        {
          owner: "doc",
          budgets: { maxWallMs: 5000, maxModelCalls: 0, maxToolExecutions: 10 },
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
      await coordinator.run(task.taskId, mockEnvelopeProvider() as never);

      // Now query correlated task in turn 2
      const correlated = findCorrelatedEngineeringTask(db, "doc");
      expect(correlated).not.toBeNull();
      expect(correlated?.taskId).toBe(task.taskId);
      expect(correlated?.effectEvidence?.verified).toBe(true);

      // ContextComposer generates operational block
      const opBlock = operationalWorkBlock(db, "doc");
      expect(opBlock).toContain("## Operational work state");
      expect(opBlock).toContain("sandbox_workspace_file_roundtrip");
      expect(opBlock).toContain("Effect evidence: roundtrip verified");
    } finally {
      fixture.cleanup();
    }
  });

  it("14: regexes accurately classify execution claims in claims.ts", () => {
    expect(claimsOwnExecutionRunning("starting now")).toBe(true);
    expect(claimsOwnExecutionRunning("i'll create a test file inside my sandbox workspace now")).toBe(true);
    expect(claimsOwnExecutionRunning("i'm on it now")).toBe(true);

    expect(claimsOwnExecutionAdmitted("i've accepted that check")).toBe(true);
    expect(claimsOwnExecutionAdmitted("request queued")).toBe(true);

    expect(claimsOwnExecutionCompletion("the temporary file was deleted")).toBe(true);
    expect(claimsOwnExecutionCompletion("the file check passed and matched")).toBe(true);
  });

  it("15: same reactive source message processed twice causes at most ONE execution attempt and zero duplicate effects", async () => {
    const fixture = createRealFsRoundtripPort();
    try {
      const coordinator = new SandboxEngineeringCoordinator(
        dummyModel(),
        fixture.port,
        {
          owner: "doc",
          budgets: { maxWallMs: 5000, maxModelCalls: 0, maxToolExecutions: 10 },
          availableDiagnostics: [],
          nowMs: () => 4000,
          persist: (tasks) => persistCoordinatorTasks(db, tasks),
        },
      );

      const msg = "Create a temporary file inside your own sandbox workspace, write a unique sentence into it, read it back, verify the contents, then delete it";
      const messageEntityUuid = "msg-entity-uuid-roundtrip-123";

      // Turn 1: Evaluate reactive admission
      const adm1 = evaluateReactiveSandboxAdmission({
        db,
        ownerId: "doc",
        message: msg,
        messageEntityUuid,
        configuredOwnerId: "doc",
        autonomous: true,
      });
      expect(adm1.admitted).toBe(true);
      expect(adm1.shouldDispatch).toBe(true);

      // Turn 1: Dispatch execution since shouldDispatch is true
      const task1 = coordinator.admit({
        objective: "Verify sandbox workspace file roundtrip",
        projectId: null,
        admissionCause: "user_request",
        profile: adm1.profile ?? "sandbox_workspace_file_roundtrip",
        groundingRefs: [messageEntityUuid],
      });
      const run1 = await coordinator.run(task1.taskId, mockEnvelopeProvider() as never);
      expect(run1.status).toBe("completed");

      // Verify filesystem action counts from turn 1
      expect(fixture.actionCount.request_workspace).toBe(1);
      expect(fixture.actionCount.write_workspace_file).toBe(1);
      expect(fixture.actionCount.read_workspace_file).toBe(2);
      expect(fixture.actionCount.delete_workspace_file).toBe(1);

      // Turn 2: Reprocess EXACT SAME message / messageEntityUuid (Replay)
      const adm2 = evaluateReactiveSandboxAdmission({
        db,
        ownerId: "doc",
        message: msg,
        messageEntityUuid,
        configuredOwnerId: "doc",
        autonomous: true,
      });
      expect(adm2.admitted).toBe(true);
      if (adm2.admitted) {
        expect(adm2.replayed).toBe(true);
        expect(adm2.shouldDispatch).toBe(false); // MUST NOT DISPATCH
      }

      // Because shouldDispatch is false, coordinator.run is NEVER called
      // Prove that no additional broker actions or filesystem effects occurred
      expect(fixture.actionCount.request_workspace).toBe(1);
      expect(fixture.actionCount.write_workspace_file).toBe(1);
      expect(fixture.actionCount.read_workspace_file).toBe(2);
      expect(fixture.actionCount.delete_workspace_file).toBe(1);

      // Prove that coordinator has exactly ONE task recorded
      const persisted = loadCoordinatorTasks(db);
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.taskId).toBe(task1.taskId);
    } finally {
      fixture.cleanup();
    }
  });

  it("16: completed task without verified effect evidence fails closed and cannot claim completion", () => {
    // Task marked completed but with missing/unverified effectEvidence
    const corruptedTask = {
      taskId: "task-corrupted-1",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-corrupted"],
      profile: "sandbox_workspace_file_roundtrip" as const,
      status: "completed" as const,
      workspaceId: "ws-1",
      modelCallsUsed: 0,
      toolCallsUsed: 5,
      startedAtMs: 1000,
      deadlineMs: 2000,
      completedAtMs: 1500,
      error: null,
      refusal: null,
      candidatePatchRef: null,
      candidateCommitRef: null,
      artifactRefs: [],
      effectEvidence: null, // MISSING EVIDENCE
    };
    persistCoordinatorTasks(db, [corruptedTask]);

    const correlated = findCorrelatedEngineeringTask(db, "doc", { messageEntityUuid: "uuid-corrupted" });
    expect(correlated).not.toBeNull();
    expect(correlated?.status).toBe("completed");
    expect(correlated?.effectEvidence).toBeFalsy();

    // Derived license must NOT be succeeded
    const derivedLicense: OperationalClaimLicense =
      correlated && correlated.status === "completed" && correlated.effectEvidence?.verified
        ? {
            state: "succeeded",
            taskId: correlated.taskId,
            profile: correlated.profile,
            effectEvidence: correlated.effectEvidence,
          }
        : {
            state: "none",
            taskId: correlated?.taskId,
            profile: correlated?.profile,
            error: "missing_effect_evidence",
          };

    expect(derivedLicense.state).toBe("none");

    const res = finalizeHonesty({
      text: "the file check succeeded and verified.",
      readingLicensed: false,
      operationalLicense: derivedLicense,
    });
    // Completion claim is stripped
    expect(res.text).not.toContain("succeeded and verified");
    expect(res.text).toBe("i haven't been doing anything worth mentioning on my side. what's up?");
  });
});
