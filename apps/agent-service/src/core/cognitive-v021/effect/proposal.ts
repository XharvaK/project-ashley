import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { checkAuthority } from "../authority/check.js";
import {
  getEffectReceipt,
  getEffectReceiptByIdempotencyKey,
  getInFlight,
  markInFlightUnknown,
  putInFlight,
  recordEffectReceipt,
} from "./in-flight.js";
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

type DispatchSnapshot = {
  authorityEpoch: number;
  generation?: number;
  packs?: AuthorityPacks;
};

export async function dispatchEffect(
  db: DatabaseSync,
  proposal: EffectProposal,
  current: {
    authorityEpoch: number;
    generation?: number;
    reload?: () => {
      authorityEpoch: number;
      generation?: number;
      packs?: AuthorityPacks;
    };
  },
  execute: (proposal: EffectProposal) => Promise<unknown>,
  packs?: AuthorityPacks | (() => AuthorityPacks),
): Promise<DispatchEffectResult> {
  const initial: DispatchSnapshot = current.reload?.() ?? {
    authorityEpoch: current.authorityEpoch,
    generation: current.generation,
  };
  const authorityPacks = typeof packs === "function" ? packs() : packs ?? initial.packs ?? {
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
    stateEpoch: { authorityEpoch: initial.authorityEpoch },
  } satisfies AuthorityPacks;
  const verdict = checkAuthority("dispatch", { proposal, packs: authorityPacks, authorityEpoch: initial.authorityEpoch });
  if (!verdict.ok) return { dispatched: false, codes: verdict.codes };
  if (initial.generation !== undefined && proposal.generation !== initial.generation) {
    return { dispatched: false, codes: ["STALE_GENERATION"] };
  }
  const existing = getEffectReceipt(db, proposal.effectId)
    ?? getEffectReceiptByIdempotencyKey(db, proposal.idempotencyKey);
  if (existing) return { dispatched: true, receipt: existing, replayed: true };
  const existingInFlight = getInFlight(db, proposal.idempotencyKey);
  if (existingInFlight) return { dispatched: false, codes: ["IN_FLIGHT_UNKNOWN"] };
  const inFlight = putInFlight(db, {
    effectId: proposal.effectId,
    cycleId: proposal.cycleId,
    generation: proposal.generation,
    correlationId: proposal.effectId,
    idempotencyKey: proposal.idempotencyKey,
    payload: proposal.request,
  });
  const beforeExecute: DispatchSnapshot = current.reload?.() ?? {
    authorityEpoch: current.authorityEpoch,
    generation: current.generation,
  };
  const dispatchPacks = typeof packs === "function" ? packs() : packs ?? beforeExecute.packs ?? authorityPacks;
  const dispatchVerdict = checkAuthority("dispatch", {
    proposal,
    packs: dispatchPacks,
    authorityEpoch: beforeExecute.authorityEpoch,
  });
  if (!dispatchVerdict.ok) {
    markInFlightUnknown(db, inFlight.effectId);
    return { dispatched: false, codes: dispatchVerdict.codes };
  }
  if (beforeExecute.generation !== undefined && proposal.generation !== beforeExecute.generation) {
    markInFlightUnknown(db, inFlight.effectId);
    return { dispatched: false, codes: ["STALE_GENERATION"] };
  }
  let output: unknown;
  try { output = await execute(proposal); }
  catch (error) { output = { error: error instanceof Error ? error.message : String(error) }; }
  const isReceipt = (value: unknown): value is EffectReceipt =>
    typeof value === "object" && value !== null
    && typeof (value as { outcome?: unknown }).outcome === "string"
    && typeof (value as { receiptId?: unknown }).receiptId === "string";
  const failed = typeof output === "object" && output !== null && "error" in output;
  const receipt: EffectReceipt = isReceipt(output)
    ? {
        ...output,
        effectId: proposal.effectId,
        idempotencyKey: proposal.idempotencyKey,
        claims: output.claims ?? {},
        atMs: output.atMs ?? Date.now(),
        dataClassification: output.dataClassification ?? "never_public",
        secretOmitted: output.secretOmitted === true,
      }
    : {
        receiptId: randomUUID(),
        effectId: proposal.effectId,
        idempotencyKey: proposal.idempotencyKey,
        outcome: failed ? "failed" : "succeeded",
        claims: typeof output === "object" && output !== null ? output as Record<string, unknown> : { result: output },
        atMs: Date.now(),
        dataClassification: "never_public",
        secretOmitted: false,
      };
  const durableReceipt = recordEffectReceipt(db, receipt);
  return { dispatched: true, receipt: durableReceipt, replayed: false };
}
