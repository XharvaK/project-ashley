/**
 * Sandbox V2 typed-capability vocabulary (Sandbox V2 M2 + M3).
 *
 * The single typed seam for V2 operations. A request names one closed
 * operation; the dispatcher routes it to the capability handler registered
 * for that operation. Unsupported or unknown operations fail closed.
 *
 * Result contract:
 *   - succeeded: execution evidence observed (operation-specific result)
 *   - failed:    execution or validation failed (stable error code)
 *   - unavailable: the V2 substrate is not present on this host
 *
 * Bounded/truncated output is carried inside the operation-specific result
 * (explicit `truncated` flags), never silently dropped.
 *
 * Model/cognition boundary: results are observation evidence for
 * Ashley's cognition. They are not effect witnesses, they authorize no
 * additional capability, and no source content can mutate Identity, memory,
 * goals, or policy through this seam.
 */

import type { SandboxM1Checks } from "@composer-assistant/sandbox-m1";

export type SandboxV2OperationName =
  | "file.roundtrip"
  | "project.read_file"
  | "project.list_directory"
  | "project.search_text"
  | "workspace.read_file"
  | "workspace.list_directory"
  | "workspace.search_text"
  | "workspace.write_file"
  | "workspace.replace_file"
  | "workspace.edit_text"
  | "workspace.delete_file"
  | "workspace.create_directory";

export const SANDBOX_V2_OPERATION_NAMES: readonly string[] = [
  "file.roundtrip",
  "project.read_file",
  "project.list_directory",
  "project.search_text",
  "workspace.read_file",
  "workspace.list_directory",
  "workspace.search_text",
  "workspace.write_file",
  "workspace.replace_file",
  "workspace.edit_text",
  "workspace.delete_file",
  "workspace.create_directory",
];

/**
 * Engineering-vocabulary actions that are explicitly known but NOT supported
 * by this slice. They fail closed with `unsupported_operation` (never a
 * silent unknown, never a partial implementation).
 */
export const V2_DEFERRED_OPERATIONS: readonly string[] = [
  "inspect_project_git_status",
  "inspect_project_git_diff",
  "inspect_project_git_log",
];

export type SandboxV2FileRoundtripRequest = {
  version: 2;
  operation: "file.roundtrip";
  content?: string;
};

export type SandboxV2ProjectReadFileRequest = {
  version: 2;
  operation: "project.read_file";
  projectId: string;
  path: string;
};

export type SandboxV2ProjectListDirectoryRequest = {
  version: 2;
  operation: "project.list_directory";
  projectId: string;
  path: string;
};

export type SandboxV2ProjectSearchTextRequest = {
  version: 2;
  operation: "project.search_text";
  projectId: string;
  /** Canonical relative directory to search under; "." or "" means the project root. */
  path?: string;
  pattern: string;
  /** Tightens the kernel search-match ceiling; never loosens it. */
  maxMatches?: number;
};

/** Workspace read operations (M3). */
export type SandboxV2WorkspaceReadFileRequest = {
  version: 2;
  operation: "workspace.read_file";
  projectId: string;
  workspaceId?: string;
  path: string;
};

export type SandboxV2WorkspaceListDirectoryRequest = {
  version: 2;
  operation: "workspace.list_directory";
  projectId: string;
  workspaceId?: string;
  path: string;
};

export type SandboxV2WorkspaceSearchTextRequest = {
  version: 2;
  operation: "workspace.search_text";
  projectId: string;
  workspaceId?: string;
  /** Canonical relative directory to search under; "." or "" means the workspace root. */
  path?: string;
  pattern: string;
  /** Tightens the kernel search-match ceiling; never loosens it. */
  maxMatches?: number;
};

/** Workspace write operations (M3). */
export type SandboxV2WorkspaceWriteFileRequest = {
  version: 2;
  operation: "workspace.write_file";
  projectId: string;
  workspaceId?: string;
  path: string;
  /** UTF-8 content to write. */
  content: string;
  /** If true, the target path must not exist. */
  mustNotExist: true;
};

export type SandboxV2WorkspaceReplaceFileRequest = {
  version: 2;
  operation: "workspace.replace_file";
  projectId: string;
  workspaceId?: string;
  path: string;
  /** UTF-8 content to write. */
  content: string;
  /** Expected SHA-256 of the current file content (precondition). */
  expectedSha256: string;
};

export type SandboxV2WorkspaceEditTextRequest = {
  version: 2;
  operation: "workspace.edit_text";
  projectId: string;
  workspaceId?: string;
  path: string;
  /** Exact text to replace (must match exactly once). */
  oldText: string;
  /** Replacement text. */
  newText: string;
  /** Expected SHA-256 of the current file content (precondition). */
  expectedSha256: string;
};

export type SandboxV2WorkspaceDeleteFileRequest = {
  version: 2;
  operation: "workspace.delete_file";
  projectId: string;
  workspaceId?: string;
  path: string;
  /** Expected SHA-256 of the current file content (precondition, optional). */
  expectedSha256?: string;
};

export type SandboxV2WorkspaceCreateDirectoryRequest = {
  version: 2;
  operation: "workspace.create_directory";
  projectId: string;
  workspaceId?: string;
  path: string;
};

export type SandboxV2WorkspaceRequest =
  | SandboxV2WorkspaceReadFileRequest
  | SandboxV2WorkspaceListDirectoryRequest
  | SandboxV2WorkspaceSearchTextRequest
  | SandboxV2WorkspaceWriteFileRequest
  | SandboxV2WorkspaceReplaceFileRequest
  | SandboxV2WorkspaceEditTextRequest
  | SandboxV2WorkspaceDeleteFileRequest
  | SandboxV2WorkspaceCreateDirectoryRequest;

export type SandboxV2Request =
  | SandboxV2FileRoundtripRequest
  | SandboxV2ProjectReadFileRequest
  | SandboxV2ProjectListDirectoryRequest
  | SandboxV2ProjectSearchTextRequest
  | SandboxV2WorkspaceRequest;

export type SandboxV2InspectionEntry = {
  name: string;
  kind: "file" | "dir" | "other";
  size: number;
};

export type SandboxV2SearchMatch = {
  path: string;
  line: number;
  text: string;
};

/** Operation-specific typed result payloads. */
export type SandboxV2OperationResult =
  | {
      kind: "file.roundtrip";
      profile: "sandbox_workspace_file_roundtrip";
      checks: SandboxM1Checks;
      bytesWritten: number;
      contentHash: string;
      readMatches: true;
      deleted: true;
      verifiedAbsent: true;
      completedAtMs: number;
    }
  | {
      kind: "project.read_file";
      path: string;
      bytes: number;
      contentBase64: string;
      sha256: string;
      /** Partial reads are never allowed: oversized files fail closed. */
      truncated: false;
    }
  | {
      kind: "project.list_directory";
      path: string;
      entries: SandboxV2InspectionEntry[];
      truncated: boolean;
    }
  | {
      kind: "project.search_text";
      path: string;
      matches: SandboxV2SearchMatch[];
      truncated: boolean;
      filesScanned: number;
    }
  | {
      kind: "workspace.read_file";
      path: string;
      bytes: number;
      contentBase64: string;
      sha256: string;
      truncated: false;
    }
  | {
      kind: "workspace.list_directory";
      path: string;
      entries: SandboxV2InspectionEntry[];
      truncated: boolean;
    }
  | {
      kind: "workspace.search_text";
      path: string;
      matches: SandboxV2SearchMatch[];
      truncated: boolean;
      filesScanned: number;
    }
  | {
      kind: "workspace.write_file";
      path: string;
      bytesWritten: number;
      contentHash: string;
      readMatches: true;
      deleted: false;
      verifiedAbsent: false;
      completedAtMs: number;
    }
  | {
      kind: "workspace.replace_file";
      path: string;
      bytesWritten: number;
      contentHash: string;
      readMatches: true;
      deleted: false;
      verifiedAbsent: false;
      completedAtMs: number;
    }
  | {
      kind: "workspace.edit_text";
      path: string;
      bytesWritten: number;
      contentHash: string;
      readMatches: true;
      deleted: false;
      verifiedAbsent: false;
      completedAtMs: number;
    }
  | {
      kind: "workspace.delete_file";
      path: string;
      deleted: true;
      verifiedAbsent: true;
      completedAtMs: number;
    }
  | {
      kind: "workspace.create_directory";
      path: string;
      completedAtMs: number;
    };

export type SandboxV2ExecutionTruth =
  | "no_effect_proven"
  | "effect_verified"
  | "effect_indeterminate";

export type SandboxV2Result =
  | {
      outcome: "succeeded";
      operation: SandboxV2OperationName;
      result: SandboxV2OperationResult;
      workspaceId?: string;
      sourceSnapshotId?: string;
      /** Present for M3 workspace execution. */
      executionTruth?: SandboxV2ExecutionTruth;
      cancellationRequested?: boolean;
      cancellationAcknowledged?: boolean;
      executedAtMs: number;
    }
  | {
      outcome: "failed";
      operation: string;
      error: string;
      /** Present for M3 workspace execution. */
      executionTruth?: SandboxV2ExecutionTruth;
      /** Safe fact only: valid evidence arrived after the current-turn settlement cutoff. */
      lateEvidenceVerified?: boolean;
      cancellationRequested?: boolean;
      cancellationAcknowledged?: boolean;
      executedAtMs: number;
    }
  | {
      outcome: "unavailable";
      operation: string;
      error: string;
      /** Present for M3 workspace execution. */
      executionTruth?: SandboxV2ExecutionTruth;
      cancellationRequested?: boolean;
      cancellationAcknowledged?: boolean;
      executedAtMs: number;
    };

/** Operation-level capability metadata (the V2 capability registry rows). */
export type SandboxV2CapabilitySpec = {
  operation: SandboxV2OperationName;
  family: "sandbox_workspace_file_roundtrip" | "project_inspection" | "project_experimentation";
  /** Project inspection is strictly read-only: no mutation, no execution. */
  readOnly: boolean;
  /** Requires an operator-owned project registry resolution. */
  requiresProject: boolean;
};

export const V2_CAPABILITY_REGISTRY: readonly SandboxV2CapabilitySpec[] = [
  {
    operation: "file.roundtrip",
    family: "sandbox_workspace_file_roundtrip",
    readOnly: false,
    requiresProject: false,
  },
  {
    operation: "project.read_file",
    family: "project_inspection",
    readOnly: true,
    requiresProject: true,
  },
  {
    operation: "project.list_directory",
    family: "project_inspection",
    readOnly: true,
    requiresProject: true,
  },
  {
    operation: "project.search_text",
    family: "project_inspection",
    readOnly: true,
    requiresProject: true,
  },
  {
    operation: "workspace.read_file",
    family: "project_experimentation",
    readOnly: true,
    requiresProject: true,
  },
  {
    operation: "workspace.list_directory",
    family: "project_experimentation",
    readOnly: true,
    requiresProject: true,
  },
  {
    operation: "workspace.search_text",
    family: "project_experimentation",
    readOnly: true,
    requiresProject: true,
  },
  {
    operation: "workspace.write_file",
    family: "project_experimentation",
    readOnly: false,
    requiresProject: true,
  },
  {
    operation: "workspace.replace_file",
    family: "project_experimentation",
    readOnly: false,
    requiresProject: true,
  },
  {
    operation: "workspace.edit_text",
    family: "project_experimentation",
    readOnly: false,
    requiresProject: true,
  },
  {
    operation: "workspace.delete_file",
    family: "project_experimentation",
    readOnly: false,
    requiresProject: true,
  },
  {
    operation: "workspace.create_directory",
    family: "project_experimentation",
    readOnly: false,
    requiresProject: true,
  },
];

export function v2CapabilitySpec(
  operation: string,
): SandboxV2CapabilitySpec | undefined {
  return V2_CAPABILITY_REGISTRY.find((spec) => spec.operation === operation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isSandboxV2Request(value: unknown): value is SandboxV2Request {
  if (!isRecord(value)) return false;
  if (value.version !== 2) return false;
  if (typeof value.operation !== "string") return false;
  if (!SANDBOX_V2_OPERATION_NAMES.includes(value.operation)) return false;
  return true;
}

/** Fail-closed guards for the embedded runner's operation results. */
export function isProjectReadFileResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "project.read_file" }> {
  if (!isRecord(value)) return false;
  return (
    value.kind === "project.read_file" &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    isFiniteNumber(value.bytes) &&
    value.bytes >= 0 &&
    typeof value.contentBase64 === "string" &&
    value.contentBase64.length > 0 &&
    typeof value.sha256 === "string" &&
    value.sha256.length === 64 &&
    value.truncated === false
  );
}

export function isProjectListDirectoryResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "project.list_directory" }> {
  if (!isRecord(value)) return false;
  if (value.kind !== "project.list_directory") return false;
  if (typeof value.path !== "string") return false;
  if (typeof value.truncated !== "boolean") return false;
  if (!Array.isArray(value.entries)) return false;
  return value.entries.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.name === "string" &&
      (entry.kind === "file" || entry.kind === "dir" || entry.kind === "other") &&
      isFiniteNumber(entry.size) &&
      entry.size >= 0,
  );
}

export function isProjectSearchTextResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "project.search_text" }> {
  if (!isRecord(value)) return false;
  if (value.kind !== "project.search_text") return false;
  if (typeof value.path !== "string") return false;
  if (typeof value.truncated !== "boolean") return false;
  if (!isFiniteNumber(value.filesScanned) || value.filesScanned < 0) return false;
  if (!Array.isArray(value.matches)) return false;
  return value.matches.every(
    (match) =>
      isRecord(match) &&
      typeof match.path === "string" &&
      isFiniteNumber(match.line) &&
      match.line >= 1 &&
      typeof match.text === "string",
  );
}

export function isSandboxV2OperationResult(
  value: unknown,
  operation: SandboxV2OperationName,
): value is SandboxV2OperationResult {
  if (!isRecord(value)) return false;
  switch (operation) {
    case "file.roundtrip":
      return (
        value.kind === "file.roundtrip" &&
        value.profile === "sandbox_workspace_file_roundtrip" &&
        isRecord(value.checks) &&
        value.readMatches === true &&
        value.deleted === true &&
        value.verifiedAbsent === true &&
        isFiniteNumber(value.bytesWritten) &&
        typeof value.contentHash === "string" &&
        isFiniteNumber(value.completedAtMs)
      );
    case "project.read_file":
      return isProjectReadFileResult(value);
    case "project.list_directory":
      return isProjectListDirectoryResult(value);
    case "project.search_text":
      return isProjectSearchTextResult(value);
    case "workspace.read_file":
      return isWorkspaceReadFileResult(value);
    case "workspace.list_directory":
      return isWorkspaceListDirectoryResult(value);
    case "workspace.search_text":
      return isWorkspaceSearchTextResult(value);
    case "workspace.write_file":
      return isWorkspaceWriteFileResult(value);
    case "workspace.replace_file":
      return isWorkspaceReplaceFileResult(value);
    case "workspace.edit_text":
      return isWorkspaceEditTextResult(value);
    case "workspace.delete_file":
      return isWorkspaceDeleteFileResult(value);
    case "workspace.create_directory":
      return isWorkspaceCreateDirectoryResult(value);
  }
}

/** Workspace result guards (M3). */

export function isWorkspaceReadFileResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "workspace.read_file" }> {
  if (!isRecord(value)) return false;
  return (
    value.kind === "workspace.read_file" &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    isFiniteNumber(value.bytes) &&
    value.bytes >= 0 &&
    typeof value.contentBase64 === "string" &&
    value.contentBase64.length > 0 &&
    typeof value.sha256 === "string" &&
    value.sha256.length === 64 &&
    value.truncated === false
  );
}

export function isWorkspaceListDirectoryResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "workspace.list_directory" }> {
  if (!isRecord(value)) return false;
  if (value.kind !== "workspace.list_directory") return false;
  if (typeof value.path !== "string") return false;
  if (typeof value.truncated !== "boolean") return false;
  if (!Array.isArray(value.entries)) return false;
  return value.entries.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.name === "string" &&
      (entry.kind === "file" || entry.kind === "dir" || entry.kind === "other") &&
      isFiniteNumber(entry.size) &&
      entry.size >= 0,
  );
}

export function isWorkspaceSearchTextResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "workspace.search_text" }> {
  if (!isRecord(value)) return false;
  if (value.kind !== "workspace.search_text") return false;
  if (typeof value.path !== "string") return false;
  if (typeof value.truncated !== "boolean") return false;
  if (!isFiniteNumber(value.filesScanned) || value.filesScanned < 0) return false;
  if (!Array.isArray(value.matches)) return false;
  return value.matches.every(
    (match) =>
      isRecord(match) &&
      typeof match.path === "string" &&
      isFiniteNumber(match.line) &&
      match.line >= 1 &&
      typeof match.text === "string",
  );
}

export function isWorkspaceWriteFileResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "workspace.write_file" }> {
  if (!isRecord(value)) return false;
  return (
    value.kind === "workspace.write_file" &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    isFiniteNumber(value.bytesWritten) &&
    value.bytesWritten >= 0 &&
    typeof value.contentHash === "string" &&
    value.contentHash.length === 64 &&
    value.readMatches === true &&
    value.deleted === false &&
    value.verifiedAbsent === false &&
    isFiniteNumber(value.completedAtMs)
  );
}

export function isWorkspaceReplaceFileResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "workspace.replace_file" }> {
  if (!isRecord(value)) return false;
  return (
    value.kind === "workspace.replace_file" &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    isFiniteNumber(value.bytesWritten) &&
    value.bytesWritten >= 0 &&
    typeof value.contentHash === "string" &&
    value.contentHash.length === 64 &&
    value.readMatches === true &&
    value.deleted === false &&
    value.verifiedAbsent === false &&
    isFiniteNumber(value.completedAtMs)
  );
}

export function isWorkspaceEditTextResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "workspace.edit_text" }> {
  if (!isRecord(value)) return false;
  return (
    value.kind === "workspace.edit_text" &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    isFiniteNumber(value.bytesWritten) &&
    value.bytesWritten >= 0 &&
    typeof value.contentHash === "string" &&
    value.contentHash.length === 64 &&
    value.readMatches === true &&
    value.deleted === false &&
    value.verifiedAbsent === false &&
    isFiniteNumber(value.completedAtMs)
  );
}

export function isWorkspaceDeleteFileResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "workspace.delete_file" }> {
  if (!isRecord(value)) return false;
  return (
    value.kind === "workspace.delete_file" &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    value.deleted === true &&
    value.verifiedAbsent === true &&
    isFiniteNumber(value.completedAtMs)
  );
}

export function isWorkspaceCreateDirectoryResult(
  value: unknown,
): value is Extract<SandboxV2OperationResult, { kind: "workspace.create_directory" }> {
  if (!isRecord(value)) return false;
  return (
    value.kind === "workspace.create_directory" &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    isFiniteNumber(value.completedAtMs)
  );
}
