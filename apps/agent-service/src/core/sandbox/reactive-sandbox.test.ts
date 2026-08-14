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
import {
  isVerifiedRoundtripEffectEvidence,
  type EngineeringExecutionPort,
  type EngineeringToolResult,
  type ThinkingModel,
  type RoundtripEffectEvidence,
  type OperationalClaimLicense,
} from "./engineering-types.js";
import type { DelegatedApprovalEnvelope } from "@composer-assistant/sandbox-broker";
import { openNuclearDb } from "../db.js";

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

describe("Reactive Sandbox Execution — Authority-Binding Compatibility Suite", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openNuclearDb(new DatabaseSync(":memory:"));
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
      expect(isVerifiedRoundtripEffectEvidence(result.effectEvidence)).toBe(true);

      const persisted = loadCoordinatorTasks(db);
      expect(persisted[0]?.status).toBe("completed");
      expect(isVerifiedRoundtripEffectEvidence(persisted[0]?.effectEvidence)).toBe(true);
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

      // Proves zero second execution attempt
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

  it("4: exact replay correlates exact task", () => {
    const task = {
      taskId: "task-exact-1",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-exact-msg"],
      profile: "sandbox_workspace_file_roundtrip" as const,
      status: "completed" as const,
      workspaceId: "ws-1",
      modelCallsUsed: 0,
      toolCallsUsed: 5,
      startedAtMs: Date.now() - 10_000,
      deadlineMs: Date.now() + 10_000,
      completedAtMs: Date.now() - 5_000,
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
        completedAtMs: Date.now() - 5_000,
      },
    };
    persistCoordinatorTasks(db, [task]);

    const correlated = findCorrelatedEngineeringTask(db, "doc", {
      messageEntityUuid: "uuid-exact-msg",
    });
    expect(correlated).not.toBeNull();
    expect(correlated?.taskId).toBe("task-exact-1");
  });

  it("5: immediate same-thread follow-up correlates", () => {
    // Seed Thread 1 and originating user message
    db.prepare(`
      INSERT INTO mem_threads (id, owner_id, channel, created_at, updated_at)
      VALUES ('thread-1', 'doc', 'discord', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')
    `).run();

    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (1, 'thread-1', 'doc', 'user', 'discord', 'Create a temp file in your sandbox', 'uuid-originating-turn', '2026-08-14T00:00:00.000Z')
    `).run();

    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (2, 'thread-1', 'doc', 'assistant', 'discord', 'done', 'uuid-ast-1', '2026-08-14T00:00:05.000Z')
    `).run();

    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (3, 'thread-1', 'doc', 'user', 'discord', 'Could you?', 'uuid-followup-turn', '2026-08-14T00:00:10.000Z')
    `).run();

    const task = {
      taskId: "task-grounded-1",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-originating-turn"],
      profile: "sandbox_workspace_file_roundtrip" as const,
      status: "completed" as const,
      workspaceId: "ws-1",
      modelCallsUsed: 0,
      toolCallsUsed: 5,
      startedAtMs: Date.now() - 10_000,
      deadlineMs: Date.now() + 10_000,
      completedAtMs: Date.now() - 5_000,
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
        completedAtMs: Date.now() - 5_000,
      },
    };
    persistCoordinatorTasks(db, [task]);

    const correlated = findCorrelatedEngineeringTask(db, "doc", {
      threadId: "thread-1",
      userMessageId: 3,
      userMessage: "Could you?",
    });
    expect(correlated).not.toBeNull();
    expect(correlated?.taskId).toBe("task-grounded-1");
  });

  it("6: follow-up phrase in a different thread does NOT correlate", () => {
    // Thread 2 does NOT have the originating sandbox turn
    db.prepare(`
      INSERT INTO mem_threads (id, owner_id, channel, created_at, updated_at)
      VALUES ('thread-2', 'doc', 'discord', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')
    `).run();

    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (10, 'thread-2', 'doc', 'user', 'discord', 'What is the weather today?', 'uuid-weather', '2026-08-14T00:00:00.000Z')
    `).run();

    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (11, 'thread-2', 'doc', 'user', 'discord', 'Could you?', 'uuid-followup-diff-thread', '2026-08-14T00:00:10.000Z')
    `).run();

    const task = {
      taskId: "task-grounded-thread1",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-originating-turn"],
      profile: "sandbox_workspace_file_roundtrip" as const,
      status: "completed" as const,
      workspaceId: "ws-1",
      modelCallsUsed: 0,
      toolCallsUsed: 5,
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
    persistCoordinatorTasks(db, [task]);

    const correlated = findCorrelatedEngineeringTask(db, "doc", {
      threadId: "thread-2",
      userMessageId: 11,
      userMessage: "Could you?",
    });
    expect(correlated).toBeNull();
  });

  it("7: same-thread follow-up after an intervening unrelated USER message does NOT correlate", () => {
    db.prepare(`
      INSERT INTO mem_threads (id, owner_id, channel, created_at, updated_at)
      VALUES ('thread-intervene', 'doc', 'discord', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')
    `).run();

    // Turn 1: Originating sandbox request
    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (20, 'thread-intervene', 'doc', 'user', 'discord', 'Create temp file in sandbox', 'uuid-originating-20', '2026-08-14T00:00:00.000Z')
    `).run();

    // Turn 2: Assistant responds
    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (21, 'thread-intervene', 'doc', 'assistant', 'discord', 'done', 'uuid-ast-21', '2026-08-14T00:00:05.000Z')
    `).run();

    // Turn 3: Intervening unrelated user message!
    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (22, 'thread-intervene', 'doc', 'user', 'discord', 'By the way tell me about roses', 'uuid-intervening-22', '2026-08-14T00:00:10.000Z')
    `).run();

    // Turn 4: User says "Could you?"
    db.prepare(`
      INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
      VALUES (23, 'thread-intervene', 'doc', 'user', 'discord', 'Could you?', 'uuid-followup-23', '2026-08-14T00:00:15.000Z')
    `).run();

    const task = {
      taskId: "task-grounded-20",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-originating-20"],
      profile: "sandbox_workspace_file_roundtrip" as const,
      status: "completed" as const,
      workspaceId: "ws-1",
      modelCallsUsed: 0,
      toolCallsUsed: 5,
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
    persistCoordinatorTasks(db, [task]);

    // Preceding user message for Turn 4 (id 23) is Turn 3 (id 22, roses), which does not ground the task
    const correlated = findCorrelatedEngineeringTask(db, "doc", {
      threadId: "thread-intervene",
      userMessageId: 23,
      userMessage: "Could you?",
    });
    expect(correlated).toBeNull();
  });

  it("8: unrelated ordinary turn and proactive task never correlate", () => {
    // Proactive task
    const proactiveTask = {
      taskId: "task-proactive-ignore",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "proactive" as const,
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

    expect(isSandboxOperationalFollowUp("What are you thinking about?")).toBe(false);
    const unrelatedMatch = findCorrelatedEngineeringTask(db, "doc", {
      userMessage: "What are you thinking about?",
    });
    expect(unrelatedMatch).toBeNull();
  });

  it("9: ContextComposer projects task referenced by operationalLicense only (cannot select by prose alone)", () => {
    const verifiedTask = {
      taskId: "task-license-proj",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-proj-1"],
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

    // When Decision has operationalLicense with taskId, ContextComposer projects it
    const licensedBlock = operationalWorkBlock(db, "doc", {
      operationalLicense: {
        state: "succeeded",
        taskId: "task-license-proj",
        profile: "sandbox_workspace_file_roundtrip",
        effectEvidence: verifiedTask.effectEvidence,
      },
    });
    expect(licensedBlock).toContain("Task ID: task-license-proj");
    expect(licensedBlock).toContain("Effect evidence: roundtrip verified");

    // When Decision has NO operationalLicense taskId, ContextComposer emits nothing even if user says "Could you?"
    const unlicensedBlock = operationalWorkBlock(db, "doc", {
      operationalLicense: null,
    });
    expect(unlicensedBlock).toBe("");
  });

  it("10: central effect evidence validator rejects malformed evidence (verified=true, readMatches=false/empty)", () => {
    const validEvidence: RoundtripEffectEvidence = {
      verified: true,
      workspaceId: "ws-1",
      relativePath: "file.txt",
      bytesWritten: 12,
      contentHash: "sha256-abc",
      readMatches: true,
      deleted: true,
      verifiedAbsent: true,
      completedAtMs: Date.now(),
    };
    expect(isVerifiedRoundtripEffectEvidence(validEvidence)).toBe(true);

    // Mismatched read
    expect(isVerifiedRoundtripEffectEvidence({ ...validEvidence, readMatches: false })).toBe(false);

    // Not deleted / not absent
    expect(isVerifiedRoundtripEffectEvidence({ ...validEvidence, deleted: false })).toBe(false);
    expect(isVerifiedRoundtripEffectEvidence({ ...validEvidence, verifiedAbsent: false })).toBe(false);

    // Empty workspace / relativePath / contentHash
    expect(isVerifiedRoundtripEffectEvidence({ ...validEvidence, workspaceId: "" })).toBe(false);
    expect(isVerifiedRoundtripEffectEvidence({ ...validEvidence, relativePath: "  " })).toBe(false);
    expect(isVerifiedRoundtripEffectEvidence({ ...validEvidence, contentHash: "" })).toBe(false);

    // Non-finite completed timestamp
    expect(isVerifiedRoundtripEffectEvidence({ ...validEvidence, completedAtMs: NaN })).toBe(false);
  });

  it("11: malformed effect evidence cannot produce verified context prose", () => {
    const taskWithMalformedEvidence = {
      taskId: "task-malformed",
      owner: "doc",
      projectId: null,
      sourceBaseCommit: null,
      admissionCause: "user_request" as const,
      groundingRefs: ["uuid-mal-1"],
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
        readMatches: false, // MALFORMED: read didn't match!
        deleted: true,
        verifiedAbsent: true,
        completedAtMs: Date.now() - 30_000,
      },
    };
    persistCoordinatorTasks(db, [taskWithMalformedEvidence]);

    const block = operationalWorkBlock(db, "doc", {
      operationalLicense: {
        state: "succeeded",
        taskId: "task-malformed",
      },
    });
    expect(block).not.toContain("Effect evidence: roundtrip verified");
    expect(block).toContain("Effect evidence: unverified (task record is completed; verified effect evidence is unavailable)");
  });

  it("12: partial unique index preserves historical duplicate proactive rows and ensureEngineeringTables is idempotent", () => {
    const seedDb = openNuclearDb(new DatabaseSync(":memory:"));
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

    // Repeated ensureEngineeringTables calls succeed without error or dropping anything
    expect(() => ensureEngineeringTables(seedDb)).not.toThrow();
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
});
