import {
  verifyApprovalEnvelope,
  type ApprovalVerifierConfig,
} from "./crypto/approval.js";
import {
  verifyTombstoneEnvelope,
  type TombstoneVerifierConfig,
} from "./crypto/tombstone.js";
import type { ApprovalEnvelope, TombstoneEnvelope } from "./crypto/types.js";
import { sha256Hex } from "./crypto/types.js";
import { MAX_CHUNK_BYTES, MAX_CONCURRENT_TASKS } from "./constants/limits.js";
import { assertOwnerPeer } from "./policy/peer.js";
import {
  assertArgvPolicy,
  assertAllowlistedInterpreter,
  assertEnvAllowlist,
  assertExecutionLimits,
} from "./policy/execution.js";
import { normalizeWorkspacePath } from "./policy/path.js";
import {
  DEFAULT_TEST_RECIPES,
  resolveRecipe,
  type BrokerRecipe,
} from "./policy/recipes.js";
import { BrokerStore } from "./store/broker-store.js";
import {
  SOURCE_PREPARE_ARCHIVE_EXTRACTION_DEFERRED,
  sourcePrepareFieldsMatch,
  validateSourcePrepareEnvelope,
} from "./handlers/source-prepare.js";
import {
  envelopeToRunRequest,
  type ProcessRunner,
} from "./process/fake-runner.js";
import { sweepDisposableWorkspaces, type SweepWorkspacesResult } from "./workspace/workspace-sweep.js";
import { MAX_SWEEP_CANDIDATES, MAX_SWEEP_REMOVALS } from "./constants/limits.js";
import {
  assessSessionCreation,
  assessWorkspaceCreation,
  countDisposableWorkspaces,
  defaultDiskProbe,
  validateSandboxGlobalLimits,
  DEFAULT_SANDBOX_GLOBAL_LIMITS,
  type DiskProbe,
  type DiskSnapshot,
  type GlobalLimitAssessment,
  type SandboxGlobalLimits,
} from "./constants/global-limits.js";
import {
  reconcileBrokerState,
  type ReconcileBrokerStateResult,
} from "./sessions/session-reconcile.js";
import { BROKER_SESSION_SCHEMA_VERSION } from "./sessions/session-migration.js";
import type { BrokerRootConfig } from "./policy/root-config.js";
import type { BrokerResponse, RequestContext } from "./protocol/frame.js";

export interface BrokerConfig {
  workspaceRoot: string;
  ownerId: string;
  approval: ApprovalVerifierConfig;
  tombstone: TombstoneVerifierConfig;
  interpreterAllowlist: Set<string>;
  envAllowlist: Set<string>;
  processRunner: ProcessRunner;
  store?: BrokerStore;
  recipes?: Map<string, BrokerRecipe>;
  /** Canonical root configuration for disposable workspace operations. */
  rootConfig?: BrokerRootConfig;
  /** Master resource ceilings for sessions and workspaces. */
  globalLimits?: SandboxGlobalLimits;
  /** Injectable disk probe used by workspace creation gates. */
  diskProbe?: DiskProbe;
}

/**
 * Bounded, owner-safe readiness snapshot. Exposes aggregate counts and the
 * active master ceilings only; never internal state, secrets, or payloads.
 * `ready` is fail-closed: it requires a healthy persistence backend.
 */
export type BrokerStatusSnapshot = {
  ready: boolean;
  persistence: "ok" | "degraded";
  schemaVersion: number;
  ownerId: string;
  sessions: { active: number; total: number };
  audits: number;
  workspaceBytesUsed: number;
  globalLimits: {
    maxActiveSessions: number;
    maxSessionsPerHour: number;
    maxWorkspacesOnDisk: number;
    maxWorkspaceCreationsPerHour: number;
    minFreeDiskBytes: number;
  };
};

export class SandboxBroker {
  readonly store: BrokerStore;
  readonly config: BrokerConfig;
  readonly recipes: Map<string, BrokerRecipe>;
  readonly globalLimits: SandboxGlobalLimits;
  private readonly diskProbe: DiskProbe;

  constructor(config: BrokerConfig) {
    this.config = config;
    this.store = config.store ?? new BrokerStore();
    this.recipes = config.recipes ?? new Map(DEFAULT_TEST_RECIPES.map((r) => [r.recipeId, r]));
    const validated = validateSandboxGlobalLimits(config.globalLimits);
    if (!validated.ok) {
      throw new Error(`global_limits_invalid:${validated.reasons.join(",")}`);
    }
    this.globalLimits = validated.value;
    this.diskProbe = config.diskProbe ?? (() => defaultDiskProbe(config.workspaceRoot));
  }

  restart(): void {
    this.store.markTasksFailedOnRestart();
    const recovery = this.store.sessionLedger.recoverFromRestart(Date.now());
    this.audit("broker_recovery", {
      sessionsMaterialized: recovery.sessionsMaterialized.length,
      interruptedUses: recovery.interruptedUses,
      sessionsInterrupted: recovery.sessionsInterrupted.length,
    });
  }

  private error(errorCode: string, message: string): BrokerError {
    return { ok: false, errorCode, message };
  }

  private audit(code: string, metadata: Record<string, string | number | boolean>): void {
    this.store.auditEvents.push({ atMs: Date.now(), code, metadata });
  }

  private verifyApproval(
    envelope: ApprovalEnvelope,
    ctx: RequestContext,
  ): { ok: true } | BrokerError {
    const peer = assertOwnerPeer(ctx.peerOwnerId, this.config.ownerId);
    if (!peer.ok) {
      return this.error(peer.reason, "peer authorization failed");
    }
    if (envelope.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    const verified = verifyApprovalEnvelope(envelope, this.config.approval, ctx.nowMs);
    if (!verified.ok) {
      return this.error(verified.reason, "approval verification failed");
    }
    if (!this.store.recordNonce(envelope.nonce)) {
      return this.error("replay", "nonce replay");
    }
    return { ok: true };
  }

  artifactRead(
    payload: { ownerId: string; artifactRef: string },
    ctx: RequestContext,
  ): BrokerResponse<{ artifactRef: string; entityUuid: string; dataBase64: string }> {
    if (payload.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    const artifact = this.store.artifacts.get(payload.artifactRef);
    if (!artifact || artifact.ownerId !== payload.ownerId) {
      return this.error("not_found", "artifact not found");
    }
    return {
      ok: true,
      data: {
        artifactRef: artifact.artifactRef,
        entityUuid: artifact.entityUuid,
        dataBase64: artifact.bytes.toString("base64"),
      },
    };
  }

  artifactList(
    payload: { ownerId: string },
    ctx: RequestContext,
  ): BrokerResponse<{ artifacts: Array<{ artifactRef: string; entityUuid: string }> }> {
    if (payload.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    const artifacts = [...this.store.artifacts.values()]
      .filter((item) => item.ownerId === payload.ownerId)
      .map((item) => ({
        artifactRef: item.artifactRef,
        entityUuid: item.entityUuid,
      }));
    return { ok: true, data: { artifacts } };
  }

  artifactWriteBegin(
    payload: {
      ownerId: string;
      declaredSize: number;
      approval?: ApprovalEnvelope;
      taskId?: string;
    },
    ctx: RequestContext,
  ): BrokerResponse<{ uploadId: string; sessionCapability: string }> {
    if (payload.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    let taskId: string | undefined;
    if (payload.approval) {
      if (payload.approval.scope !== "artifact_upload") {
        return this.error("invalid_scope", "artifact_upload scope required");
      }
      const verified = this.verifyApproval(payload.approval, ctx);
      if (!verified.ok) {
        return verified;
      }
      taskId = payload.approval.taskId;
    } else if (payload.taskId) {
      const peer = assertOwnerPeer(ctx.peerOwnerId, this.config.ownerId);
      if (!peer.ok) {
        return this.error(peer.reason, "peer authorization failed");
      }
      if (!this.store.authorizeTaskUpload(payload.taskId)) {
        return this.error("unknown_task", "task not authorized for upload");
      }
      taskId = payload.taskId;
    } else {
      return this.error("authorization_required", "approval or taskId required");
    }
    const session = this.store.createUploadSession(
      payload.ownerId,
      payload.declaredSize,
      taskId,
      ctx.nowMs,
    );
    return {
      ok: true,
      data: {
        uploadId: session.uploadId,
        sessionCapability: session.sessionCapability,
      },
    };
  }

  artifactWriteChunk(
    payload: {
      uploadId: string;
      sessionCapability: string;
      chunkBase64: string;
    },
  ): BrokerResponse<{ receivedBytes: number }> {
    const session = this.store.uploads.get(payload.uploadId);
    if (!session || session.sessionCapability !== payload.sessionCapability) {
      return this.error("invalid_session", "invalid upload session");
    }
    if (session.expiresAt <= Date.now()) {
      return this.error("session_expired", "upload session expired");
    }
    const chunk = Buffer.from(payload.chunkBase64, "base64");
    if (chunk.length > MAX_CHUNK_BYTES) {
      return this.error("chunk_too_large", "chunk too large");
    }
    session.chunks.push(chunk);
    return { ok: true, data: { receivedBytes: chunk.length } };
  }

  artifactWriteCommit(
    payload: {
      uploadId: string;
      sessionCapability: string;
      contentHash: string;
    },
  ): BrokerResponse<{ artifactRef: string; entityUuid: string }> {
    const session = this.store.uploads.get(payload.uploadId);
    if (!session || session.sessionCapability !== payload.sessionCapability) {
      return this.error("invalid_session", "invalid upload session");
    }
    const bytes = Buffer.concat(session.chunks);
    const hash = sha256Hex(bytes);
    if (hash !== payload.contentHash) {
      return this.error("hash_mismatch", "content hash mismatch");
    }
    if (session.taskId) {
      try {
        this.store.assertTaskArtifactQuota(session.taskId, bytes.length);
      } catch {
        return this.error("task_artifact_quota_exceeded", "task artifact quota exceeded");
      }
    }
    const artifact = this.store.commitArtifact(session.ownerId, bytes, session.taskId);
    this.store.uploads.delete(payload.uploadId);
    return {
      ok: true,
      data: { artifactRef: artifact.artifactRef, entityUuid: artifact.entityUuid },
    };
  }

  artifactWriteAbort(
    payload: { uploadId: string; sessionCapability: string },
  ): BrokerResponse<{ aborted: true }> {
    const session = this.store.uploads.get(payload.uploadId);
    if (!session || session.sessionCapability !== payload.sessionCapability) {
      return this.error("invalid_session", "invalid upload session");
    }
    this.store.uploads.delete(payload.uploadId);
    return { ok: true, data: { aborted: true } };
  }

  artifactDelete(
    payload: { ownerId: string; artifactRef: string; approval: ApprovalEnvelope },
    ctx: RequestContext,
  ): BrokerResponse<{ deleted: true }> {
    if (payload.approval.scope !== "artifact_delete") {
      return this.error("invalid_scope", "artifact_delete scope required");
    }
    if (payload.approval.artifactRef !== payload.artifactRef) {
      return this.error("scope_drift", "artifact ref drift");
    }
    const verified = this.verifyApproval(payload.approval, ctx);
    if (!verified.ok) {
      return verified;
    }
    const artifact = this.store.artifacts.get(payload.artifactRef);
    if (!artifact || artifact.ownerId !== payload.ownerId) {
      return this.error("not_found", "artifact not found");
    }
    this.store.workspaceBytesUsed -= artifact.bytes.length;
    this.store.artifacts.delete(payload.artifactRef);
    return { ok: true, data: { deleted: true } };
  }

  taskSubmit(
    payload: { approval: ApprovalEnvelope },
    ctx: RequestContext,
  ): BrokerResponse<{ taskId: string; state: string }> {
    const envelope = payload.approval;
    let executionEnvelope = envelope;
    let approvalVerified = false;
    if (envelope.scope === "source_prepare") {
      const validated = validateSourcePrepareEnvelope(envelope);
      if (!validated.ok) {
        return this.error(validated.reason, "invalid source_prepare envelope");
      }
      const verified = this.verifyApproval(envelope, ctx);
      if (!verified.ok) {
        return verified;
      }
      approvalVerified = true;
      if (SOURCE_PREPARE_ARCHIVE_EXTRACTION_DEFERRED) {
        this.audit("source_prepare_validated", {
          proposalId: validated.fields.proposalId,
          extractionDeferred: true,
        });
        return {
          ok: true,
          data: { taskId: envelope.taskId, state: "validated_only" },
        };
      }
    }
    if (
      envelope.scope === "source_verify" ||
      envelope.scope === "source_edit" ||
      envelope.scope === "source_diff"
    ) {
      const verified = this.verifyApproval(envelope, ctx);
      if (!verified.ok) {
        return verified;
      }
      approvalVerified = true;
      if (envelope.scope === "source_verify") {
        const recipe = resolveRecipe(this.recipes, envelope.recipeId ?? "");
        if (!recipe || !recipe.supported) {
          this.store.tasks.set(envelope.taskId, {
            taskId: envelope.taskId,
            ownerId: envelope.ownerId,
            state: "failed",
            exitCode: 1,
            stdout: "",
            stderr: "",
            truncated: false,
            envelope,
            uploadAuthorized: false,
            terminalReason: "policy_rejected",
          });
          return {
            ok: true,
            data: { taskId: envelope.taskId, state: "unsupported" },
          };
        }
        if (
          recipe.limits &&
          (!envelope.limits ||
            envelope.limits.wallMs !== recipe.limits.wallMs ||
            envelope.limits.maxProcesses !== recipe.limits.maxProcesses ||
            envelope.limits.maxOutputBytes !== recipe.limits.maxOutputBytes)
        ) {
          return this.error("recipe_limits_mismatch", "recipe limits do not match approval");
        }
        executionEnvelope = {
          ...envelope,
          argv: [recipe.executable, ...recipe.argv],
          cwd: recipe.cwdPolicy,
          ...(recipe.limits ? { limits: { ...recipe.limits } } : {}),
        };
      }
      if (envelope.scope === "source_diff") {
        const patch = Buffer.from("--- /dev/null\n+++ b/file.txt\n@@\n+ok\n", "utf8");
        const artifact = this.store.commitArtifact(envelope.ownerId, patch);
        this.store.tasks.set(envelope.taskId, {
          taskId: envelope.taskId,
          ownerId: envelope.ownerId,
          state: "succeeded",
          exitCode: 0,
          stdout: artifact.artifactRef,
          stderr: "",
          truncated: false,
          envelope,
          uploadAuthorized: false,
          terminalReason: "success",
        });
        return { ok: true, data: { taskId: envelope.taskId, state: "succeeded" } };
      }
    }
    if (
      envelope.scope !== "task.submit" &&
      envelope.scope !== "source_edit" &&
      envelope.scope !== "source_verify"
    ) {
      return this.error("invalid_scope", "task.submit scope required");
    }
    if (!approvalVerified) {
      const verified = this.verifyApproval(envelope, ctx);
      if (!verified.ok) {
        return verified;
      }
    }
    const running = [...this.store.tasks.values()].filter(
      (task) => task.state === "running",
    );
    if (running.length >= MAX_CONCURRENT_TASKS) {
      return this.error("concurrency_limit", "concurrency limit");
    }
    const cwdResult = normalizeWorkspacePath(
      this.config.workspaceRoot,
      executionEnvelope.cwd!,
    );
    if (!cwdResult.ok) {
      return this.error(cwdResult.reason, "invalid cwd");
    }
    // Execute only at the canonical realpath checked above; never pass the
    // caller's relative path to child_process.spawn.
    executionEnvelope = { ...executionEnvelope, cwd: cwdResult.value };
    const argvCheck = assertArgvPolicy(executionEnvelope.argv ?? []);
    if (!argvCheck.ok) {
      return this.error(argvCheck.reason, "argv policy violation");
    }
    const interpreterCheck = assertAllowlistedInterpreter(
      executionEnvelope.argv![0]!,
      this.config.interpreterAllowlist,
    );
    if (!interpreterCheck.ok) {
      return this.error(interpreterCheck.reason, "interpreter policy violation");
    }
    const envCheck = assertEnvAllowlist({}, this.config.envAllowlist);
    if (!envCheck.ok) {
      return this.error(envCheck.reason, "env policy violation");
    }
    if (!executionEnvelope.limits) {
      return this.error("missing_limits", "execution limits required");
    }
    const limitsCheck = assertExecutionLimits(executionEnvelope.limits);
    if (!limitsCheck.ok) {
      return this.error(limitsCheck.reason, "execution limits violation");
    }
    const runReq = envelopeToRunRequest(
      executionEnvelope,
      executionEnvelope.taskId,
      this.config.envAllowlist,
    );
    if ("error" in runReq) {
      return this.error(runReq.error, "invalid run request");
    }
    const task = {
      taskId: envelope.taskId,
      ownerId: envelope.ownerId,
      state: "running" as const,
      stdout: "",
      stderr: "",
      truncated: false,
      envelope: executionEnvelope,
      uploadAuthorized: true,
    };
    this.store.tasks.set(task.taskId, task);
    try {
      // A durable store must record the running state before execution starts;
      // otherwise a crash could lose the receipt and replay an approval.
      this.store.flush();
    } catch {
      this.store.tasks.delete(task.taskId);
      return this.error("persistence_failed", "broker state could not be persisted");
    }
    void this.config.processRunner
      .run(runReq)
      .then((result) => {
        const stored = this.store.tasks.get(task.taskId);
        if (!stored || stored.state !== "running") {
          return;
        }
        stored.exitCode = result.exitCode;
        stored.stdout = result.stdout;
        stored.stderr = result.stderr;
        stored.truncated = result.truncated;
        stored.terminalReason = result.terminalReason;
        stored.state =
          result.terminalReason === "success"
            ? "succeeded"
            : result.terminalReason === "cancelled"
              ? "cancelled"
              : result.terminalReason === "timeout"
                ? "timeout"
                : "failed";
        try {
          this.store.flush();
        } catch {
          // The in-memory terminal result remains truthful; the next daemon
          // health check will surface a persistence failure.
        }
      })
      .catch((error: unknown) => {
        const stored = this.store.tasks.get(task.taskId);
        if (!stored || stored.state !== "running") return;
        stored.exitCode = 1;
        stored.stderr = error instanceof Error ? error.message : "process runner failed";
        stored.terminalReason = "spawn_error";
        stored.state = "failed";
        try {
          this.store.flush();
        } catch {
          // Preserve the truthful in-memory failure if persistence is down.
        }
      });
    return { ok: true, data: { taskId: task.taskId, state: task.state } };
  }

  taskCancel(
    payload: { taskId: string },
    ctx: RequestContext,
  ): BrokerResponse<{ cancelled: true }> {
    const peer = assertOwnerPeer(ctx.peerOwnerId, this.config.ownerId);
    if (!peer.ok) {
      return this.error(peer.reason, "peer authorization failed");
    }
    const task = this.store.tasks.get(payload.taskId);
    if (!task) {
      return this.error("not_found", "task not found");
    }
    if (task.state === "running") {
      this.config.processRunner.cancel?.(payload.taskId);
      task.state = "cancelled";
      task.terminalReason = "cancelled";
      try {
        this.store.flush();
      } catch {
        return this.error("persistence_failed", "broker state could not be persisted");
      }
    }
    return { ok: true, data: { cancelled: true } };
  }

  taskReceipt(
    payload: { taskId: string },
  ): BrokerResponse<{
    taskId: string;
    state: string;
    exitCode?: number;
    truncated: boolean;
    terminalReason?: string;
  }> {
    const task = this.store.tasks.get(payload.taskId);
    if (!task) {
      return this.error("not_found", "task not found");
    }
    return {
      ok: true,
      data: {
        taskId: task.taskId,
        state: task.state,
        exitCode: task.exitCode,
        truncated: task.truncated,
        terminalReason: task.terminalReason,
      },
    };
  }

  taskResultFetch(
    payload: { taskId: string },
  ): BrokerResponse<{ stdout: string; stderr: string; truncated: boolean }> {
    const task = this.store.tasks.get(payload.taskId);
    if (!task) {
      return this.error("not_found", "task not found");
    }
    return {
      ok: true,
      data: {
        stdout: task.stdout,
        stderr: task.stderr,
        truncated: task.truncated,
      },
    };
  }

  forgetApply(
    payload: { tombstone: TombstoneEnvelope },
    ctx: RequestContext,
  ): BrokerResponse<{ applied: string[]; alreadyApplied?: boolean }> {
    const tombstone = payload.tombstone;
    if (tombstone.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    const verified = verifyTombstoneEnvelope(
      tombstone,
      this.config.tombstone,
      ctx.nowMs,
    );
    if (!verified.ok) {
      return this.error(verified.reason, "tombstone verification failed");
    }
    if (this.store.appliedTombstones.has(tombstone.tombstoneId)) {
      return { ok: true, data: { applied: [], alreadyApplied: true } };
    }
    if (!this.store.recordAppliedTombstone(tombstone.tombstoneId)) {
      return { ok: true, data: { applied: [], alreadyApplied: true } };
    }
    const applied: string[] = [];
    for (const target of tombstone.targets) {
      const artifact = this.store.artifacts.get(target.artifactRef);
      if (
        artifact &&
        artifact.entityUuid === target.entityUuid &&
        artifact.ownerId === tombstone.ownerId
      ) {
        this.store.workspaceBytesUsed -= artifact.bytes.length;
        this.store.artifacts.delete(target.artifactRef);
        applied.push(target.artifactRef);
      }
    }
    return { ok: true, data: { applied } };
  }

  workspaceSweep(
    payload: {
      ownerId: string;
      candidates?: string[];
      maxWorkspaces?: number;
      nowMs?: number;
      createdBeforeMs?: number;
    },
    ctx: RequestContext,
  ): BrokerResponse<SweepWorkspacesResult> {
    if (payload.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    const peer = assertOwnerPeer(ctx.peerOwnerId, this.config.ownerId);
    if (!peer.ok) {
      return this.error(peer.reason, "peer authorization failed");
    }
    if (!this.config.rootConfig) {
      return this.error("root_config_missing", "broker root config not configured");
    }
    const candidates = payload.candidates ?? [];
    if (!Array.isArray(candidates) || candidates.length > MAX_SWEEP_CANDIDATES) {
      return this.error("invalid_candidates", "candidate list out of bounds");
    }
    const maxWorkspaces = payload.maxWorkspaces ?? MAX_SWEEP_REMOVALS;
    if (
      !Number.isInteger(maxWorkspaces) ||
      maxWorkspaces < 1 ||
      maxWorkspaces > MAX_SWEEP_REMOVALS
    ) {
      return this.error("invalid_max_workspaces", "maxWorkspaces out of bounds");
    }
    const nowMs = payload.nowMs ?? ctx.nowMs;
    if (!Number.isFinite(nowMs)) {
      return this.error("invalid_clock", "invalid nowMs");
    }
    const createdBeforeMs = payload.createdBeforeMs;
    if (createdBeforeMs !== undefined && !Number.isFinite(createdBeforeMs)) {
      return this.error("invalid_clock", "invalid createdBeforeMs");
    }
    // Fail-closed eligibility: a workspace is only ever swept when the broker
    // ledger proves its binding session is terminal (expired/completed/aborted).
    // Workspaces referenced by live sessions are never sweep targets, even if
    // a caller offers them as candidates.
    const terminalWorkspaceIds = new Set<string>();
    for (const session of this.store.sessionLedger.listSessions()) {
      if (
        session.workspaceId &&
        (session.state === "expired" ||
          session.state === "completed" ||
          session.state === "aborted")
      ) {
        terminalWorkspaceIds.add(session.workspaceId);
      }
    }
    const offered = candidates.length > 0 ? candidates : [...terminalWorkspaceIds];
    const effective = offered
      .filter((id) => terminalWorkspaceIds.has(id))
      .slice(0, MAX_SWEEP_CANDIDATES);
    const sweep = sweepDisposableWorkspaces({
      candidates: effective,
      rootConfig: this.config.rootConfig,
      maxWorkspaces,
      nowMs,
      createdBeforeMs,
    });
    this.audit("workspace_sweep", {
      candidates: effective.length,
      removed: sweep.removed.length,
      skipped: sweep.skipped.length,
      reachedCap: sweep.removed.length >= maxWorkspaces,
    });
    return { ok: true, data: sweep };
  }

  /**
   * Master-ceiling gate for session creation. Pure assessment against the
   * broker ledger; the caller (session service / daemon) refuses to create
   * when this returns not-allowed. Denials are audited.
   */
  sessionCreateGate(nowMs: number): GlobalLimitAssessment {
    const assessment = assessSessionCreation({
      ledger: this.store.sessionLedger,
      limits: this.globalLimits,
      nowMs,
    });
    if (!assessment.allowed) {
      this.audit("global_limit_denied", {
        dimension: assessment.errorCode,
        at: "session_create",
      });
    }
    return assessment;
  }

  /**
   * Master-ceiling gate for workspace creation: on-disk occupancy, the
   * caller-tracked rolling hourly creation count, and the disk floor. A
   * failed disk probe is a denial, never a pass. Denials are audited.
   */
  workspaceCreateGate(input: {
    nowMs: number;
    workspaceCreationsLastHour: number;
  }): GlobalLimitAssessment {
    let snapshot: DiskSnapshot;
    try {
      snapshot = this.diskProbe(this.config.workspaceRoot);
    } catch {
      this.audit("global_limit_denied", {
        dimension: "global_limit_disk_probe_unavailable",
        at: "workspace_create",
      });
      return {
        allowed: false,
        errorCode: "global_limit_disk_probe_unavailable",
        reason: "disk_probe_failed",
      };
    }
    const workspaceCount = this.config.rootConfig
      ? countDisposableWorkspaces(this.config.rootConfig)
      : 0;
    const assessment = assessWorkspaceCreation({
      workspaceCount,
      workspaceCreationsLastHour: input.workspaceCreationsLastHour,
      diskSnapshot: snapshot,
      limits: this.globalLimits,
    });
    if (!assessment.allowed) {
      this.audit("global_limit_denied", {
        dimension: assessment.errorCode,
        at: "workspace_create",
      });
    }
    return assessment;
  }

  /**
   * Agent-driven state reconciliation. The agent declares its active policy
   * identity; the broker surfaces superseded sessions and missing-workspace
   * bindings, recording idempotent per-session events. Never force-decides.
   */
  reconcileState(
    payload: {
      ownerId: string;
      activePolicy: { policyId: string; policyVersion: number; policyHash: string };
      nowMs?: number;
    },
    ctx: RequestContext,
  ): BrokerResponse<ReconcileBrokerStateResult> {
    if (payload.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    const peer = assertOwnerPeer(ctx.peerOwnerId, this.config.ownerId);
    if (!peer.ok) {
      return this.error(peer.reason, "peer authorization failed");
    }
    const policy = payload.activePolicy;
    if (
      typeof policy?.policyId !== "string" ||
      policy.policyId.length === 0 ||
      policy.policyId.length > 256 ||
      !Number.isInteger(policy.policyVersion) ||
      policy.policyVersion < 1 ||
      !/^[0-9a-f]{64}$/.test(String(policy.policyHash ?? ""))
    ) {
      return this.error("active_policy_invalid", "active policy identity invalid");
    }
    const nowMs = payload.nowMs ?? ctx.nowMs;
    if (!Number.isFinite(nowMs)) {
      return this.error("invalid_clock", "invalid nowMs");
    }
    const report = reconcileBrokerState({
      ledger: this.store.sessionLedger,
      activePolicy: {
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        policyHash: policy.policyHash,
      },
      nowMs,
      workspaceRootConfig: this.config.rootConfig,
    });
    this.audit("broker_reconcile", {
      activeSessions: report.activeSessions,
      policySuperseded: report.policySuperseded.length,
      missingWorkspace: report.missingWorkspace.length,
    });
    return { ok: true, data: report };
  }

  /**
   * Owner-verified readiness snapshot. Fail-closed: `ready` is false whenever
   * the persistence backend reports unhealthy, even if in-memory state looks
   * intact. Read-only; emits no audit row and never flushes.
   */
  status(ctx: RequestContext): BrokerResponse<BrokerStatusSnapshot> {
    const peer = assertOwnerPeer(ctx.peerOwnerId, this.config.ownerId);
    if (!peer.ok) {
      return this.error(peer.reason, "peer authorization failed");
    }
    const persistenceOk = this.store.persistenceHealthy();
    const sessions = persistenceOk ? this.store.sessionLedger.listSessions() : [];
    const audits = persistenceOk ? this.store.auditEvents.length : 0;
    const workspaceBytesUsed = persistenceOk ? this.store.workspaceBytesUsed : 0;
    return {
      ok: true,
      data: {
        ready: persistenceOk,
        persistence: persistenceOk ? "ok" : "degraded",
        schemaVersion: BROKER_SESSION_SCHEMA_VERSION,
        ownerId: this.config.ownerId,
        sessions: {
          active: sessions.filter((s) => s.state === "active").length,
          total: sessions.length,
        },
        audits,
        workspaceBytesUsed,
        globalLimits: {
          maxActiveSessions: this.globalLimits.maxActiveSessions,
          maxSessionsPerHour: this.globalLimits.maxSessionsPerHour,
          maxWorkspacesOnDisk: this.globalLimits.maxWorkspacesOnDisk,
          maxWorkspaceCreationsPerHour: this.globalLimits.maxWorkspaceCreationsPerHour,
          minFreeDiskBytes: this.globalLimits.minFreeDiskBytes,
        },
      },
    };
  }

  dispatch(
    messageType: string,
    payload: unknown,
    ctx: RequestContext,
  ): BrokerResponse<unknown> {
    switch (messageType) {
      case "artifact.read":
        return this.artifactRead(payload as { ownerId: string; artifactRef: string }, ctx);
      case "artifact.list":
        return this.artifactList(payload as { ownerId: string }, ctx);
      case "artifact.write.begin":
        return this.artifactWriteBegin(
          payload as {
            ownerId: string;
            declaredSize: number;
            approval?: ApprovalEnvelope;
            taskId?: string;
          },
          ctx,
        );
      case "artifact.write.chunk":
        return this.artifactWriteChunk(
          payload as {
            uploadId: string;
            sessionCapability: string;
            chunkBase64: string;
          },
        );
      case "artifact.write.commit":
        return this.artifactWriteCommit(
          payload as {
            uploadId: string;
            sessionCapability: string;
            contentHash: string;
          },
        );
      case "artifact.write.abort":
        return this.artifactWriteAbort(
          payload as { uploadId: string; sessionCapability: string },
        );
      case "artifact.delete":
        return this.artifactDelete(
          payload as {
            ownerId: string;
            artifactRef: string;
            approval: ApprovalEnvelope;
          },
          ctx,
        );
      case "task.submit":
        return this.taskSubmit(payload as { approval: ApprovalEnvelope }, ctx);
      case "task.cancel":
        return this.taskCancel(payload as { taskId: string }, ctx);
      case "task.receipt":
        return this.taskReceipt(payload as { taskId: string });
      case "task.result.fetch":
        return this.taskResultFetch(payload as { taskId: string });
      case "forget.apply":
        return this.forgetApply(payload as { tombstone: TombstoneEnvelope }, ctx);
      case "workspace.sweep":
        return this.workspaceSweep(
          payload as {
            ownerId: string;
            candidates?: string[];
            maxWorkspaces?: number;
            nowMs?: number;
            createdBeforeMs?: number;
          },
          ctx,
        );
      case "broker.reconcile":
        return this.reconcileState(
          payload as {
            ownerId: string;
            activePolicy: { policyId: string; policyVersion: number; policyHash: string };
            nowMs?: number;
          },
          ctx,
        );
      case "broker.status":
        return this.status(ctx);
      default:
        return this.error("unknown_message", "unknown message type");
    }
  }
}

type BrokerError = { ok: false; errorCode: string; message: string };

export { sourcePrepareFieldsMatch, validateSourcePrepareEnvelope };
