import { randomUUID } from "node:crypto";
import type { ApprovalEnvelope } from "../crypto/types.js";
import {
  ARTIFACT_REF_ENTROPY_BYTES,
  MAX_ARTIFACT_BYTES,
  MAX_TASK_ARTIFACT_BYTES,
  MAX_WORKSPACE_BYTES,
  UPLOAD_SESSION_TTL_MS,
} from "../constants/limits.js";
import { randomRef } from "../crypto/types.js";

export interface StoredArtifact {
  ownerId: string;
  artifactRef: string;
  entityUuid: string;
  bytes: Buffer;
  taskId?: string;
}

export interface UploadSession {
  uploadId: string;
  sessionCapability: string;
  ownerId: string;
  taskId?: string;
  chunks: Buffer[];
  declaredSize: number;
  expiresAt: number;
}

export type TaskState =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timeout"
  | "policy_rejected"
  | "concurrency_limit"
  | "broker_restart";

export interface StoredTask {
  taskId: string;
  ownerId: string;
  state: TaskState;
  exitCode?: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  terminalReason?: string;
  envelope: ApprovalEnvelope;
  uploadAuthorized: boolean;
}

export interface AuditEvent {
  atMs: number;
  code: string;
  metadata: Record<string, string | number | boolean>;
}

export class BrokerStore {
  readonly artifacts = new Map<string, StoredArtifact>();
  readonly uploads = new Map<string, UploadSession>();
  readonly tasks = new Map<string, StoredTask>();
  readonly spentNonces = new Set<string>();
  readonly appliedTombstones = new Set<string>();
  readonly auditEvents: AuditEvent[] = [];
  workspaceBytesUsed = 0;

  recordNonce(nonce: string): boolean {
    if (this.spentNonces.has(nonce)) {
      return false;
    }
    this.spentNonces.add(nonce);
    return true;
  }

  hasNonce(nonce: string): boolean {
    return this.spentNonces.has(nonce);
  }

  createUploadSession(
    ownerId: string,
    declaredSize: number,
    taskId?: string,
    nowMs = Date.now(),
  ): UploadSession {
    const session: UploadSession = {
      uploadId: randomUUID(),
      sessionCapability: randomRef(),
      ownerId,
      taskId,
      chunks: [],
      declaredSize,
      expiresAt: nowMs + UPLOAD_SESSION_TTL_MS,
    };
    this.uploads.set(session.uploadId, session);
    return session;
  }

  commitArtifact(
    ownerId: string,
    bytes: Buffer,
    taskId?: string,
  ): StoredArtifact {
    if (bytes.length > MAX_ARTIFACT_BYTES) {
      throw new Error("artifact_too_large");
    }
    if (this.workspaceBytesUsed + bytes.length > MAX_WORKSPACE_BYTES) {
      throw new Error("workspace_quota_exceeded");
    }
    const artifact: StoredArtifact = {
      ownerId,
      artifactRef: randomRef(ARTIFACT_REF_ENTROPY_BYTES),
      entityUuid: randomUUID(),
      bytes,
      taskId,
    };
    this.workspaceBytesUsed += bytes.length;
    this.artifacts.set(artifact.artifactRef, artifact);
    return artifact;
  }

  taskArtifactBytes(taskId: string): number {
    let total = 0;
    for (const artifact of this.artifacts.values()) {
      if (artifact.taskId === taskId) {
        total += artifact.bytes.length;
      }
    }
    return total;
  }

  assertTaskArtifactQuota(taskId: string, nextBytes: number): void {
    if (this.taskArtifactBytes(taskId) + nextBytes > MAX_TASK_ARTIFACT_BYTES) {
      throw new Error("task_artifact_quota_exceeded");
    }
  }

  authorizeTaskUpload(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    return Boolean(task && task.uploadAuthorized);
  }

  markTasksFailedOnRestart(): void {
    for (const task of this.tasks.values()) {
      if (task.state === "running") {
        task.state = "broker_restart";
        task.terminalReason = "broker_restart";
      }
    }
  }
}
