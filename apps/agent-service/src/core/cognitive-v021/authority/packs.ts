import type { DatabaseSync } from "node:sqlite";
import { readCognitiveSidecarMeta, updateCognitiveAuthorityEpoch } from "../sidecar/db.js";
import type { AuthorityPacks, CapabilityReality, EffectReceipt } from "../types.js";

type Row = Record<string, unknown>;
const noCapability: CapabilityReality = {
  vision: false, attachmentText: false, conversationalRead: false, webSearch: false,
  canOfferProjectInspection: false, canOfferWorkspace: false, canOfferVerification: false,
  canOfferAuthorship: false, canOfferBoundedOperation: false, canOfferPatchExport: false,
  approvedProjectIds: [],
};

function json(value: unknown): unknown {
  try { return JSON.parse(typeof value === "string" ? value : "null"); } catch { return {}; }
}

export function loadEffectReceipts(db: DatabaseSync): Record<string, EffectReceipt> {
  const result: Record<string, EffectReceipt> = {};
  for (const row of db.prepare("SELECT * FROM effect_receipts ORDER BY at_ms ASC").all()) {
    if (typeof row !== "object" || row === null) continue;
    const value = row as Row;
    const claims = json(value.claims_json);
    result[String(value.effect_id ?? "")] = {
      receiptId: String(value.receipt_id ?? ""),
      effectId: String(value.effect_id ?? ""),
      idempotencyKey: String(value.idempotency_key ?? ""),
      outcome: String(value.outcome ?? "unknown") as EffectReceipt["outcome"],
      claims: typeof claims === "object" && claims !== null && !Array.isArray(claims) ? claims as Record<string, unknown> : {},
      atMs: Number(value.at_ms ?? 0),
      dataClassification: String(value.data_classification ?? "never_public") as EffectReceipt["dataClassification"],
      secretOmitted: Number(value.secret_omitted ?? 0) === 1,
    };
  }
  return result;
}

export function loadAuthorityPacks(
  db: DatabaseSync,
  options: Partial<Pick<AuthorityPacks, "capability" | "operational" | "relational">> & {
    observedObservationIds?: string[];
  } = {},
): AuthorityPacks {
  const meta = readCognitiveSidecarMeta(db);
  return {
    epistemic: { allowInferredWorldClaims: false },
    currentness: {
      requireObservationForLatest: true,
      observedObservationIds: options.observedObservationIds ?? [],
    },
    receipt: { receiptsByEffectId: loadEffectReceipts(db) },
    capability: options.capability ?? noCapability,
    operational: options.operational ?? { sandboxAvailable: false },
    relational: options.relational ?? { withdrawalActive: false, neverMention: [] },
    stateEpoch: { authorityEpoch: meta.authority_epoch },
  };
}

export function bumpAuthorityEpoch(db: DatabaseSync): number {
  const next = readCognitiveSidecarMeta(db).authority_epoch + 1;
  updateCognitiveAuthorityEpoch(db, next);
  return next;
}
