/**
 * Sandbox V2 License Audit Discriminator.
 *
 * Emits a structured, bounded diagnostic record to the process/journal stream
 * at the Expression/honesty boundary when a V2 workspace file roundtrip or
 * project investigation license is processed.
 *
 * Contains safe operational metadata only; strictly avoids logging user messages,
 * prompts, environment values, secrets, file content, search match lines, or source payloads.
 */

import {
  isVerifiedRoundtripEffectEvidence,
  type OperationalClaimLicense,
} from "./engineering-types.js";
import type { ProjectInspectionObservation } from "../types.js";

export type SandboxV2LicenseAuditRecord = {
  discriminator: "ASHLEY_SANDBOX_V2_LICENSE";
  sourceMessageEntityUuid: string | null;
  state: string;
  taskId: string | null;
  profile: string;
  verified: boolean;
  error: string | null;
  refusalReason: string | null;
  effect?: {
    readMatches: boolean;
    deleted: boolean;
    verifiedAbsent: boolean;
    bytesWritten: number;
  } | null;
  inspection?: {
    operation?: string;
    projectId?: string;
    targetPath?: string;
    targetPattern?: string;
    truncated?: boolean;
    bytes?: number;
    filesScanned?: number;
    matchCount?: number;
    entryCount?: number;
  } | null;
};

export function formatSandboxV2LicenseAudit(
  license?: OperationalClaimLicense | null,
  observation?: ProjectInspectionObservation | null,
): SandboxV2LicenseAuditRecord | null {
  if (!license) {
    return null;
  }
  if (
    license.profile !== "sandbox_workspace_file_roundtrip" &&
    license.profile !== "project_investigation"
  ) {
    return null;
  }

  if (license.profile === "sandbox_workspace_file_roundtrip") {
    const verified = isVerifiedRoundtripEffectEvidence(license.effectEvidence);
    return {
      discriminator: "ASHLEY_SANDBOX_V2_LICENSE",
      sourceMessageEntityUuid: license.sourceMessageEntityUuid ?? null,
      state: license.state,
      taskId: license.taskId ?? null,
      profile: license.profile,
      verified,
      error: license.error ?? null,
      refusalReason: license.refusalReason ?? null,
      effect: license.effectEvidence
        ? {
            readMatches: license.effectEvidence.readMatches === true,
            deleted: license.effectEvidence.deleted === true,
            verifiedAbsent: license.effectEvidence.verifiedAbsent === true,
            bytesWritten:
              typeof license.effectEvidence.bytesWritten === "number"
                ? license.effectEvidence.bytesWritten
                : 0,
          }
        : null,
    };
  }

  // profile === "project_investigation"
  const verified = license.state === "succeeded" && observation?.verified === true;
  let inspectionMeta: SandboxV2LicenseAuditRecord["inspection"] = null;
  if (observation) {
    inspectionMeta = {
      operation: observation.operation,
      projectId: observation.projectId,
      targetPath: observation.path,
      targetPattern:
        observation.operation === "project.search_text"
          ? observation.pattern
          : undefined,
      truncated: observation.truncated,
      bytes:
        observation.operation === "project.read_file"
          ? observation.bytes
          : undefined,
      filesScanned:
        observation.operation === "project.search_text"
          ? observation.filesScanned
          : undefined,
      matchCount:
        observation.operation === "project.search_text"
          ? observation.matches.length
          : undefined,
      entryCount:
        observation.operation === "project.list_directory"
          ? observation.entries.length
          : undefined,
    };
  }

  return {
    discriminator: "ASHLEY_SANDBOX_V2_LICENSE",
    sourceMessageEntityUuid: license.sourceMessageEntityUuid ?? null,
    state: license.state,
    taskId: license.taskId ?? null,
    profile: license.profile,
    verified,
    error: license.error ?? null,
    refusalReason: license.refusalReason ?? null,
    effect: null,
    inspection: inspectionMeta,
  };
}

export function emitSandboxV2LicenseAudit(
  license?: OperationalClaimLicense | null,
  observationOrSink?: ProjectInspectionObservation | null | ((msg: string) => void),
  maybeSink?: (msg: string) => void,
): void {
  let observation: ProjectInspectionObservation | null = null;
  let sink: (msg: string) => void = console.info;

  if (typeof observationOrSink === "function") {
    sink = observationOrSink;
  } else if (observationOrSink !== undefined) {
    observation = observationOrSink;
    if (maybeSink) sink = maybeSink;
  }
  const record = formatSandboxV2LicenseAudit(license, observation);
  if (!record) return;
  sink(`[ASHLEY_SANDBOX_V2_LICENSE] ${JSON.stringify(record)}`);
}
