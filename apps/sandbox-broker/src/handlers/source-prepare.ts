import type { ApprovalEnvelope } from "../crypto/types.js";

export interface SourcePrepareFields {
  proposalId: string;
  baseCommit: string;
  baseTreeHash: string;
  sourceCleanliness: string;
  archiveManifestRef: string;
  archiveAggregateHash: string;
  excludeRules: string[];
  destinationNamespace: string;
}

const SOURCE_PREPARE_KEYS: Array<keyof SourcePrepareFields> = [
  "proposalId",
  "baseCommit",
  "baseTreeHash",
  "sourceCleanliness",
  "archiveManifestRef",
  "archiveAggregateHash",
  "excludeRules",
  "destinationNamespace",
];

export function extractSourcePrepareFields(
  envelope: ApprovalEnvelope,
): SourcePrepareFields {
  return {
    proposalId: envelope.proposalId ?? "",
    baseCommit: envelope.baseCommit ?? "",
    baseTreeHash: envelope.baseTreeHash ?? "",
    sourceCleanliness: envelope.sourceCleanliness ?? "",
    archiveManifestRef: envelope.archiveManifestRef ?? "",
    archiveAggregateHash: envelope.archiveAggregateHash ?? "",
    excludeRules: envelope.excludeRules ?? [],
    destinationNamespace: envelope.destinationNamespace ?? "",
  };
}

export function validateSourcePrepareEnvelope(
  envelope: ApprovalEnvelope,
): { ok: true; fields: SourcePrepareFields } | { ok: false; reason: string } {
  if (envelope.scope !== "source_prepare") {
    return { ok: false, reason: "invalid_scope" };
  }
  const fields = extractSourcePrepareFields(envelope);
  for (const key of SOURCE_PREPARE_KEYS) {
    const value = fields[key];
    if (key === "excludeRules") {
      if (!Array.isArray(value)) {
        return { ok: false, reason: `missing_${key}` };
      }
      continue;
    }
    if (typeof value !== "string" || value.length === 0) {
      return { ok: false, reason: `missing_${key}` };
    }
  }
  return { ok: true, fields };
}

export function sourcePrepareFieldsMatch(
  signed: SourcePrepareFields,
  provided: Partial<SourcePrepareFields>,
): { ok: true } | { ok: false; reason: string } {
  for (const key of SOURCE_PREPARE_KEYS) {
    const left = signed[key];
    const right = provided[key];
    if (key === "excludeRules") {
      const a = left as string[];
      const b = (right ?? []) as string[];
      if (a.length !== b.length || a.some((item, index) => item !== b[index])) {
        return { ok: false, reason: "source_prepare_drift" };
      }
      continue;
    }
    if (left !== right) {
      return { ok: false, reason: "source_prepare_drift" };
    }
  }
  return { ok: true };
}

/** Archive extraction is explicitly deferred in Wave 07b fake broker. */
export const SOURCE_PREPARE_ARCHIVE_EXTRACTION_DEFERRED = true;
