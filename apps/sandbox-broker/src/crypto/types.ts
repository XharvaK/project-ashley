import { createHash, randomBytes } from "node:crypto";

export const APPROVAL_PREFIX = "ASHLEY-SANDBOX-APPROVAL-v1\n";
export const TOMBSTONE_PREFIX = "ASHLEY-SANDBOX-TOMBSTONE-v1\n";

export type ApprovalScope =
  | "artifact_upload"
  | "artifact_delete"
  | "task.submit"
  | "source_prepare"
  | "source_edit"
  | "source_verify"
  | "source_diff";

export interface TaskLimits {
  wallMs: number;
  maxProcesses: number;
  maxOutputBytes: number;
}

export interface ApprovalEnvelope {
  protocolVersion: number;
  keyId: string;
  taskId: string;
  ownerId: string;
  scope: ApprovalScope;
  argv?: string[];
  cwd?: string;
  inputArtifactRefs?: string[];
  inputHashes?: string[];
  riskClass?: string;
  limits?: TaskLimits;
  networkMode: string;
  expiresAt: number;
  nonce: string;
  signature?: string;
  proposalId?: string;
  baseCommit?: string;
  baseTreeHash?: string;
  sourceCleanliness?: string;
  archiveManifestRef?: string;
  archiveAggregateHash?: string;
  excludeRules?: string[];
  destinationNamespace?: string;
  artifactRef?: string;
  recipeId?: string;
}

export interface TombstoneEnvelope {
  protocolVersion: number;
  continuityKeyId: string;
  tombstoneId: string;
  ownerId: string;
  targets: Array<{ entityUuid: string; artifactRef: string }>;
  issuedAt: number;
  expiresAt?: number;
  signature?: string;
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function randomRef(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomNonce(): string {
  return randomBytes(16).toString("base64url");
}
