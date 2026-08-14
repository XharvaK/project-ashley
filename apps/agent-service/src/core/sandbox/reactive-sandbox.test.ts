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
  isSandboxOperationalFollowUp,
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
 * filesystem, returning production-faithful shapes `{ content, truncated, bytes }`
 * matching apps/sandbox-broker/src/engineering/handlers.ts, and enforcing envelope
 * single-use anti-replay tracking.
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
              written: true,
              bytes: Buffer.byteLength(content, "utf8"),
            },
            artifactRef: `file:${relPath}`,
          };
        }
        case "read_workspace_file": {
          const relPath = String(f.relativePath ?? "");
          const target = path.join(tmpDir, relPath);

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
          // Production broker contract: { content: string, truncated: boolean, bytes: number }
          return {
            ok: true,
            data: {
              content,
              truncated: false,
              bytes: Buffer.byteLength(content, "utf8"),
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
            data: { deleted: true },
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

describe("Reactive Sandbox Execution — Production Compatibility Suite", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    ensureEngineeringTables(db);
  });

  it("1: executes sandbox_workspace_file_roundtrip with real production broker data.content response contract", async () => {
    const fixture = createRealFsRoundtripPort();
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-roundtrip-prod",
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

  it("2: coordinator runs sandbox_workspace_file_roundtrip and records verified effect evidence in task.effectEvidence directly", async () => {
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
    } finally {
      fixture.cleanup();
    }
  });

  it("3: same authenticated owner source message processed twice causes at most ONE execution attempt (mechanical replay guarantee)", async () => {
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
      const messageEntityUuid = "msg-entity-uuid-roundtrip-real-test";

      // First evaluation & dispatch
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

      const task1 = coordinator.admit({
        objective: "Verify sandbox workspace file roundtrip",
        projectId: null,
        admissionCause: "user_request",
        profile: adm1.profile ?? "sandbox_workspace_file_roundtrip",
        groundingRefs: [messageEntityUuid],
      });
      const run1 = await coordinator.run(task1.taskId, mockEnvelopeProvider() as never);
      expect(run1.status).toBe("completed");

      // Verify exact effect counts from turn 1
      expect(fixture.actionCount.request_workspace).toBe(1);
      expect(fixture.actionCount.write_workspace_file).toBe(1);
      expect(fixture.actionCount.read_workspace_file).toBe(2);
      expect(fixture.actionCount.delete_workspace_file).toBe(1);

      // Replay of same message / entity UUID
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

      // Proves no second broker roundtrip or filesystem actions
      expect(fixture.actionCount.request_workspace).toBe(1);
      expect(fixture.actionCount.write_workspace_file).toBe(1);
      expect(fixture.actionCount.read_workspace_file).toBe(2);
      expect(fixture.actionCount.delete_workspace_file).toBe(1);

      const persisted = loadCoordinatorTasks(db);
      expect(persisted).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("4: genuine bounded follow-up ('Could you?', 'Did it work?') correlates, while unrelated turn does NOT correlate", () => {
    // Persist a completed reactive task
    const completedTask = {
      taskId: "task-followup-1",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-turn-1"],
      profile: "sandbox_workspace_file_roundtrip" as const,
      status: "completed" as const,
      workspaceId: "ws-1",
      modelCallsUsed: 0,
      toolCallsUsed: 5,
      startedAtMs: Date.now() - 60_000,
      deadlineMs: Date.now() + 60_000,
      completedAtMs: Date.now() - 30_000,
      error: null,
      refusal: null,
      candidatePatchRef: null,
      candidateCommitRef: null,
      artifactRefs: [],
      effectEvidence: {
        verified: true,
        workspaceId: "ws-1",
        relativePath: "tmp.txt",
        bytesWritten: 20,
        contentHash: "hash-123",
        readMatches: true,
        deleted: true,
        verifiedAbsent: true,
        completedAtMs: Date.now() - 30_000,
      },
    };
    persistCoordinatorTasks(db, [completedTask]);

    // Follow-up queries correlate
    expect(isSandboxOperationalFollowUp("Could you?")).toBe(true);
    expect(isSandboxOperationalFollowUp("Did it work?")).toBe(true);
    expect(isSandboxOperationalFollowUp("is it done?")).toBe(true);

    const matchFollowUp = findCorrelatedEngineeringTask(db, "doc", { userMessage: "Could you?" });
    expect(matchFollowUp).not.toBeNull();
    expect(matchFollowUp?.taskId).toBe("task-followup-1");

    // Unrelated user turn MUST NOT correlate
    expect(isSandboxOperationalFollowUp("What are you thinking about?")).toBe(false);
    expect(isSandboxOperationalFollowUp("Hello Ashley")).toBe(false);
    expect(isSandboxOperationalFollowUp("Tell me a story")).toBe(false);

    const matchUnrelated = findCorrelatedEngineeringTask(db, "doc", { userMessage: "What are you thinking about?" });
    expect(matchUnrelated).toBeNull();
  });

  it("5: unrelated proactive run does NOT correlate to reactive turns", () => {
    // Persist a proactive engineering run
    const proactiveTask = {
      taskId: "task-proactive-1",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "proactive" as const, // PROACTIVE
      groundingRefs: ["curiosity-take-1"],
      profile: "proactive_bug_investigation" as const,
      status: "completed" as const,
      workspaceId: "ws-1",
      modelCallsUsed: 2,
      toolCallsUsed: 3,
      startedAtMs: Date.now() - 10_000,
      deadlineMs: Date.now() + 10_000,
      completedAtMs: Date.now() - 5_000,
      error: null,
      refusal: null,
      candidatePatchRef: null,
      candidateCommitRef: null,
      artifactRefs: [],
      effectEvidence: null,
    };
    persistCoordinatorTasks(db, [proactiveTask]);

    // findCorrelatedEngineeringTask ignores proactive task
    const match = findCorrelatedEngineeringTask(db, "doc", { userMessage: "Could you?" });
    expect(match).toBeNull();
  });

  it("6: completed + verified evidence produces verified context prose; completed + missing evidence produces unverified prose", () => {
    // Task 1: Verified
    const verifiedTask = {
      taskId: "task-ctx-verified",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-ctx-1"],
      profile: "sandbox_workspace_file_roundtrip" as const,
      status: "completed" as const,
      workspaceId: "ws-1",
      modelCallsUsed: 0,
      toolCallsUsed: 5,
      startedAtMs: Date.now() - 60_000,
      deadlineMs: Date.now() + 60_000,
      completedAtMs: Date.now() - 30_000,
      error: null,
      refusal: null,
      candidatePatchRef: null,
      candidateCommitRef: null,
      artifactRefs: [],
      effectEvidence: {
        verified: true,
        workspaceId: "ws-1",
        relativePath: "tmp.txt",
        bytesWritten: 15,
        contentHash: "hash-123",
        readMatches: true,
        deleted: true,
        verifiedAbsent: true,
        completedAtMs: Date.now() - 30_000,
      },
    };
    persistCoordinatorTasks(db, [verifiedTask]);

    const verifiedBlock = operationalWorkBlock(db, "doc", { userMessage: "Could you?" });
    expect(verifiedBlock).toContain("Effect evidence: roundtrip verified");

    // Task 2: Unverified (completed without evidence, newer timestamp)
    const unverifiedTask = {
      ...verifiedTask,
      taskId: "task-ctx-unverified",
      groundingRefs: ["uuid-ctx-2"],
      completedAtMs: Date.now() - 10_000,
      effectEvidence: null, // NO EVIDENCE
    };
    persistCoordinatorTasks(db, [unverifiedTask]);

    const unverifiedBlock = operationalWorkBlock(db, "doc", { userMessage: "Could you?" });
    expect(unverifiedBlock).not.toContain("Effect evidence: roundtrip verified");
    expect(unverifiedBlock).toContain("Effect evidence: unverified (task record is completed; verified effect evidence is unavailable)");
  });

  it("7: partial unique index preserves historical duplicate proactive rows while forbidding duplicate user_request", () => {
    // Seed DB with historical duplicate proactive admissions (different statuses)
    const seedDb = new DatabaseSync(":memory:");
    ensureEngineeringTables(seedDb);

    // Multiple proactive rows with the same source_ref succeed
    seedDb.prepare(`
      INSERT INTO engineering_admissions (id, owner_id, objective, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
      VALUES ('adm-pro-1', 'doc', 'obj', 'build_regression', '[]', 'proactive', 'proactive:run:1', 'dispatched', 1000)
    `).run();

    seedDb.prepare(`
      INSERT INTO engineering_admissions (id, owner_id, objective, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
      VALUES ('adm-pro-2', 'doc', 'obj', 'build_regression', '[]', 'proactive', 'proactive:run:1', 'completed', 2000)
    `).run();

    // Re-running ensureEngineeringTables succeeds with duplicate proactive rows
    expect(() => ensureEngineeringTables(seedDb)).not.toThrow();

    // First user_request admission succeeds
    seedDb.prepare(`
      INSERT INTO engineering_admissions (id, owner_id, objective, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
      VALUES ('adm-user-1', 'doc', 'obj', 'sandbox_workspace_file_roundtrip', '[]', 'user_request', 'reactive:doc:msg-1', 'pending', 3000)
    `).run();

    // Duplicate user_request admission fails with UNIQUE constraint violation
    expect(() => {
      seedDb.prepare(`
        INSERT INTO engineering_admissions (id, owner_id, objective, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
        VALUES ('adm-user-2', 'doc', 'obj', 'sandbox_workspace_file_roundtrip', '[]', 'user_request', 'reactive:doc:msg-1', 'pending', 4000)
      `).run();
    }).toThrow(/UNIQUE constraint failed/i);
  });

  it("8: fresh envelope provider generates distinct envelopes preventing replay rejection", async () => {
    const fixture = createRealFsRoundtripPort();
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-fresh-envelopes",
        workspaceId: null,
        envelopes: mockEnvelopeProvider() as never,
        port: fixture.port,
        nowMs: () => 1000,
      });

      expect(outcome.ok).toBe(true);
      expect(fixture.actionCount.read_workspace_file).toBe(2);
      expect(fixture.seenEnvelopes.size).toBe(5); // all 5 actions received unique envelopes
    } finally {
      fixture.cleanup();
    }
  });

  it("9: replay rejection / policy failure during absence check fails closed and never grants verifiedAbsent", async () => {
    const replayFixture = createRealFsRoundtripPort({
      failAbsenceReadWith: { errorCode: "replay_rejected", reason: "envelope reuse detected" },
    });
    try {
      const outcome = await executeSandboxWorkspaceFileRoundtrip({
        taskId: "task-replay-fail",
        workspaceId: null,
        envelopes: mockEnvelopeProvider() as never,
        port: replayFixture.port,
        nowMs: () => 1000,
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errorCode).toBe("replay_rejected");
        expect(outcome.reason).toContain("absence_verification_failed");
      }
    } finally {
      replayFixture.cleanup();
    }
  });

  it("10: claim licensing — ADMITTED permits queuing claims; RUNNING permits 'starting now'; SUCCEEDED requires verified evidence", () => {
    const admittedLicense: OperationalClaimLicense = {
      state: "admitted",
      taskId: "adm-1",
      profile: "sandbox_workspace_file_roundtrip",
    };

    // ADMITTED forbids 'starting now' and completion
    const resAdmitted = finalizeHonesty({
      text: "i'll create a temp file inside my sandbox workspace. starting now.",
      readingLicensed: false,
      operationalLicense: admittedLicense,
    });
    expect(resAdmitted.text).toBe("i've accepted that sandbox check and it's queued to run.");

    // RUNNING permits 'starting now'
    const runningLicense: OperationalClaimLicense = {
      state: "running",
      taskId: "task-1",
      profile: "sandbox_workspace_file_roundtrip",
    };
    const resRunning = finalizeHonesty({
      text: "i'm running that check in the sandbox now.",
      readingLicensed: false,
      operationalLicense: runningLicense,
    });
    expect(resRunning.text).toBe("i'm running that check in the sandbox now.");

    // SUCCEEDED with verified effect evidence permits completion
    const verifiedLicense: OperationalClaimLicense = {
      state: "succeeded",
      taskId: "task-1",
      profile: "sandbox_workspace_file_roundtrip",
      effectEvidence: {
        verified: true,
        workspaceId: "ws-1",
        relativePath: "test.txt",
        bytesWritten: 10,
        contentHash: "hash-123",
        readMatches: true,
        deleted: true,
        verifiedAbsent: true,
        completedAtMs: Date.now(),
      },
    };
    const resVerified = finalizeHonesty({
      text: "the temporary file was deleted and the contents matched.",
      readingLicensed: false,
      operationalLicense: verifiedLicense,
    });
    expect(resVerified.text).toBe("the temporary file was deleted and the contents matched.");
  });

  it("11: regexes accurately classify execution claims in claims.ts", () => {
    expect(claimsOwnExecutionRunning("starting now")).toBe(true);
    expect(claimsOwnExecutionRunning("i'll create a test file inside my sandbox workspace now")).toBe(true);
    expect(claimsOwnExecutionRunning("i'm on it now")).toBe(true);

    expect(claimsOwnExecutionAdmitted("i've accepted that check")).toBe(true);
    expect(claimsOwnExecutionAdmitted("request queued")).toBe(true);

    expect(claimsOwnExecutionCompletion("the temporary file was deleted")).toBe(true);
    expect(claimsOwnExecutionCompletion("the file check passed and matched")).toBe(true);
  });
});
