import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { checkAuthority } from "../authority/check.js";
import { putInFlight, recordEffectReceipt, getEffectReceipt } from "./in-flight.js";
import type { AuthorityPacks, EffectProposal, EffectReceipt } from "../types.js";

export function createEffectProposal(input: {
  effectId?: string;
  cycleId: string;
  generation: number;
  authorityEpoch: number;
  idempotencyKey?: string;
  kind: string;
  request: unknown;
}): EffectProposal {
  return {
    effectId: input.effectId ?? randomUUID(),
    cycleId: input.cycleId,
    generation: input.generation,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    kind: input.kind,
    request: input.request,
    authorityEpoch: input.authorityEpoch,
  };
}

export type DispatchEffectResult =
  | { dispatched: false; codes: string[] }
  | { dispatched: true; receipt: EffectReceipt; replayed: boolean };

export async function dispatchEffect(
  db: DatabaseSync,
  proposal: EffectProposal,
  current: { authorityEpoch: number; generation?: number },
  execute: (proposal: EffectProposal) => Promise<unknown>,
  packs?: AuthorityPacks,
): Promise<DispatchEffectResult> {
  const authorityPacks = packs ?? {
    epistemic: { allowInferredWorldClaims: false },
    currentness: { requireObservationForLatest: true },
    receipt: { receiptsByEffectId: {} },
    capability: {
      vision: false, attachmentText: false, conversationalRead: false, webSearch: false,
      canOfferProjectInspection: false, canOfferWorkspace: false, canOfferVerification: false,
      canOfferAuthorship: false, canOfferBoundedOperation: false, canOfferPatchExport: false,
      approvedProjectIds: [],
    },
    operational: { sandboxAvailable: true },
    relational: { withdrawalActive: false, neverMention: [] },
    stateEpoch: { authorityEpoch: current.authorityEpoch },
  } satisfies AuthorityPacks;
  const verdict = checkAuthority("dispatch", { proposal, packs: authorityPacks, authorityEpoch: current.authorityEpoch });
  if (!verdict.ok) return { dispatched: false, codes: verdict.codes };
  if (current.generation !== undefined && proposal.generation !== current.generation) {
    return { dispatched: false, codes: ["STALE_GENERATION"] };
  }
  const existing = getEffectReceipt(db, proposal.effectId);
  if (existing) return { dispatched: true, receipt: existing, replayed: true };
  putInFlight(db, {
    effectId: proposal.effectId,
    cycleId: proposal.cycleId,
    generation: proposal.generation,
    correlationId: proposal.effectId,
    idempotencyKey: proposal.idempotencyKey,
    payload: proposal.request,
  });
  let output: unknown;
  try { output = await execute(proposal); }
  catch (error) { output = { error: error instanceof Error ? error.message : String(error) }; }
  const failed = typeof output === "object" && output !== null && "error" in output;
  const receipt: EffectReceipt = {
    receiptId: randomUUID(),
    effectId: proposal.effectId,
    idempotencyKey: proposal.idempotencyKey,
    outcome: failed ? "failed" : "succeeded",
    claims: typeof output === "object" && output !== null ? output as Record<string, unknown> : { result: output },
    atMs: Date.now(),
    dataClassification: "never_public",
    secretOmitted: false,
  };
  recordEffectReceipt(db, receipt);
  return { dispatched: true, receipt, replayed: false };
}
