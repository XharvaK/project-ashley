/**
 * Sandbox V2 License Audit Discriminator.
 *
 * Emits a structured, bounded diagnostic record to the process/journal stream
 * at the Expression/honesty boundary when a V2 workspace file roundtrip license
 * is processed.
 *
 * Contains safe operational metadata only; strictly avoids logging user messages,
 * prompts, environment values, secrets, or sentinel values.
 */

import {
  isVerifiedRoundtripEffectEvidence,
  type OperationalClaimLicense,
} from "./engineering-types.js";

export type SandboxV2LicenseAuditRecord = {
  discriminator: "ASHLEY_SANDBOX_V2_LICENSE";
  sourceMessageEntityUuid: string | null;
  state: string;
  taskId: string | null;
  profile: string;
  verified: boolean;
  error: string | null;
  refusalReason: string | null;
  effect: {
    readMatches: boolean;
    deleted: boolean;
    verifiedAbsent: boolean;
    bytesWritten: number;
  } | null;
};

export function formatSandboxV2LicenseAudit(
  license?: OperationalClaimLicense | null,
): SandboxV2LicenseAuditRecord | null {
  if (!license || license.profile !== "sandbox_workspace_file_roundtrip") {
    return null;
  }
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

export function emitSandboxV2LicenseAudit(
  license?: OperationalClaimLicense | null,
  sink: (msg: string) => void = console.info,
): void {
  const record = formatSandboxV2LicenseAudit(license);
  if (!record) return;
  sink(`[ASHLEY_SANDBOX_V2_LICENSE] ${JSON.stringify(record)}`);
}
