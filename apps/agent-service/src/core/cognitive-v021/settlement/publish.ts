import type { DatabaseSync } from "node:sqlite";
import { requireCurrentAuthorityBinding } from "../authority/barrier.js";
import { insertOutboxPending } from "../speech/outbox.js";
import type {
  CycleTriggerKind,
  DeliveryIntent,
  DurableNomination,
  FutureTriggerDelta,
  OutboxOrigin,
  PublishedCognitiveSettlement,
  SubscriptionDelta,
} from "../types.js";
import { applyWorkingContextDelta } from "../evidence/working-context.js";
import { applyConcernDelta } from "../concerns/lineage.js";
import { applyOccupancyDelta } from "../concerns/occupancy.js";
import { enqueueDurableNomination } from "../memory/nomination.js";
import { assertSubscriptionCapacity } from "../observation/subscriptions.js";
import { sanitizeFutureTriggerPayload } from "../initiative/future-triggers.js";
import { beginConsequenceInTransaction, getWakeForCycle, getWake } from "../wake/ledger.js";

export type PublicationOptions = {
  origin?: OutboxOrigin;
  deliveryIntent?: DeliveryIntent;
  nowMs?: number;
  triggerKind?: CycleTriggerKind;
  fidelity?: "passed" | "rejected" | "skipped";
  thoughtUnavailable?: boolean;
  authorityDb?: DatabaseSync;
  expectedCurrentness?: import("../types.js").AuthorityCurrentnessBinding;
  currentness?: import("../types.js").AuthorityPacks["currentness"];
  wakeId?: string;
  wakeLeaseToken?: string | null;
  semanticPass?: number;
};

export type PublicationResult = {
  published: boolean;
  replayed: boolean;
  reason?: "stale_generation" | "authority_transition" | "authority_vector_stale" | "wake_missing" | "wake_terminal" | "wake_reconciliation_required" | "consequence_exists";
  settlementId: string | null;
  outboxId: number | null;
};

export type PublishedSettlementIdentity = {
  settlementId: string;
  outboxId: number | null;
};

type DbRow = Record<string, unknown>;
function stringValue(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function numberValue(value: unknown, fallback = 0): number { const n = typeof value === "number" ? value : Number(value); return Number.isFinite(n) ? n : fallback; }
function json(value: unknown): string { return JSON.stringify(value ?? null); }

function currentGeneration(db: DatabaseSync, conversationId: string): number | null {
  const row = db.prepare("SELECT MAX(generation) AS generation FROM cycle_records WHERE conversation_id = ?").get(conversationId) as DbRow | undefined;
  if (!row || row.generation == null) return null;
  return numberValue(row.generation);
}

function authorityFenceReason(options: PublicationOptions): PublicationResult["reason"] | null {
  if (!options.authorityDb && !options.expectedCurrentness) return null;
  if (!options.authorityDb || !options.expectedCurrentness) return "authority_vector_stale";
  try {
    requireCurrentAuthorityBinding(options.authorityDb, options.expectedCurrentness);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "authority_vector_stale";
    return message === "authority_barrier_not_stable"
      ? "authority_transition"
      : "authority_vector_stale";
  }
}

function publicationFence(
  db: DatabaseSync,
  settlement: PublishedCognitiveSettlement,
  conversationId: string,
): boolean {
  const cycle = db.prepare(
    "SELECT generation, authority_epoch, wake_id FROM cycle_records WHERE cycle_id = ? LIMIT 1",
  ).get(settlement.cycleId) as DbRow | undefined;
  return cycle != null
    && numberValue(cycle.generation, -1) === settlement.generation
    && numberValue(cycle.authority_epoch, -1) === settlement.authorityEpoch
    && (!settlement.wakeId || String(cycle.wake_id ?? "") === settlement.wakeId)
    && currentGeneration(db, conversationId) === settlement.generation;
}

function applyFutureTriggerDelta(db: DatabaseSync, delta: FutureTriggerDelta): void {
  if (delta.op === "cancel") {
    db.prepare("UPDATE future_triggers SET status = 'cancelled' WHERE trigger_id = ?").run(delta.triggerId);
    return;
  }
  const trigger = delta.trigger;
  db.prepare(
    `INSERT INTO future_triggers
       (trigger_id, conversation_id, concern_id, due_at_ms, snapshot_hash, status, payload_json)
     VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
     ON CONFLICT(trigger_id) DO UPDATE SET due_at_ms=excluded.due_at_ms,
       snapshot_hash=excluded.snapshot_hash, status='scheduled', payload_json=excluded.payload_json`,
  ).run(trigger.triggerId, trigger.conversationId, trigger.concernId, trigger.dueAtMs, trigger.snapshotHash, json(sanitizeFutureTriggerPayload(trigger.payload ?? {})));
}

function applySubscriptionDelta(db: DatabaseSync, delta: SubscriptionDelta): void {
  if (delta.op === "cancel") {
    db.prepare("UPDATE observation_subscriptions SET cancelled = 1 WHERE subscription_id = ?").run(delta.subscriptionId);
    return;
  }
  db.prepare(
    `INSERT INTO observation_subscriptions
       (subscription_id, conversation_id, spec_json, cancelled)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(subscription_id) DO UPDATE SET conversation_id=excluded.conversation_id,
       spec_json=excluded.spec_json, cancelled=0`,
  ).run(delta.subscription.subscriptionId, delta.subscription.conversationId, json(delta.subscription));
}

function applyNomination(db: DatabaseSync, nomination: DurableNomination): void {
  enqueueDurableNomination(db, nomination);
}

function existingSettlementForCycleGeneration(
  db: DatabaseSync,
  cycleId: string,
  generation: number,
): DbRow | undefined {
  return db.prepare(
    `SELECT settlement_id, cycle_id, generation
       FROM settlements
      WHERE cycle_id = ? AND generation = ?
      LIMIT 1`,
  ).get(cycleId, generation) as DbRow | undefined;
}

export function publishSemanticTransaction(
  db: DatabaseSync,
  settlement: PublishedCognitiveSettlement,
  options: PublicationOptions = {},
): PublicationResult {
  const nowMs = options.nowMs ?? Date.now();
  const wake = getWakeForCycle(db, settlement.cycleId);
  const wakeId = options.wakeId ?? settlement.wakeId ?? wake?.wakeId;
  if (!wakeId) return { published: false, replayed: false, reason: "wake_missing", settlementId: null, outboxId: null };
  if (!wake || wake.wakeId !== wakeId) return { published: false, replayed: false, reason: "wake_missing", settlementId: null, outboxId: null };
  if (wake.state === "terminal") return { published: false, replayed: false, reason: "wake_terminal", settlementId: null, outboxId: null };
  if (wake.state === "reconciling") return { published: false, replayed: false, reason: "wake_reconciliation_required", settlementId: null, outboxId: null };
  const initialAuthorityFailure = authorityFenceReason(options);
  if (initialAuthorityFailure) {
    return { published: false, replayed: false, reason: initialAuthorityFailure, settlementId: null, outboxId: null };
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = existingSettlementForCycleGeneration(
      db,
      settlement.cycleId,
      settlement.generation,
    );
    if (existing) {
      const existingSettlementId = stringValue(existing.settlement_id, settlement.settlementId);
      const outbox = getSpeechOutboxBySettlementUnsafe(db, existingSettlementId);
      db.exec("COMMIT");
      return { published: true, replayed: true, settlementId: existingSettlementId, outboxId: outbox };
    }
    const semanticPass = options.semanticPass ?? 1;
    if (!Number.isInteger(semanticPass) || semanticPass < 1) {
      db.exec("ROLLBACK");
      return { published: false, replayed: false, reason: "consequence_exists", settlementId: null, outboxId: null };
    }
    const currentWake = getWake(db, wakeId);
    if (!currentWake || currentWake.state === "terminal") {
      db.exec("ROLLBACK");
      return { published: false, replayed: false, reason: "wake_terminal", settlementId: null, outboxId: null };
    }
    if (options.wakeLeaseToken && (currentWake.state === "authorized" || currentWake.state === "consequence_pending")) {
      beginConsequenceInTransaction(db, wakeId, options.wakeLeaseToken, semanticPass, nowMs);
    } else if (currentWake.state === "consequence_pending") {
      db.exec("ROLLBACK");
      return { published: false, replayed: false, reason: "consequence_exists", settlementId: null, outboxId: null };
    }
    const conversationId = awaitlessConversation(settlement, db);
    if (!publicationFence(db, settlement, conversationId)) {
      db.exec("COMMIT");
      return { published: false, replayed: false, reason: "stale_generation", settlementId: null, outboxId: null };
    }

    for (const delta of settlement.workingContextDelta) applyWorkingContextDelta(db, delta, settlement);
    for (const delta of settlement.concernDeltas) applyConcernDelta(db, delta, settlement);
    for (const delta of settlement.occupancyDelta) applyOccupancyDelta(db, delta, settlement);
    assertSubscriptionCapacity(db, conversationId, settlement.subscriptions);
    for (const delta of settlement.futureTriggers) applyFutureTriggerDelta(db, delta);
    for (const delta of settlement.subscriptions) applySubscriptionDelta(db, delta);
    for (const nomination of settlement.durableNominations) applyNomination(db, nomination);

    // Second fence: semantic deltas were prepared, but no publication row or
    // speech projection may be written after the cycle/authority changed.
    const secondAuthorityFailure = authorityFenceReason(options);
    if (secondAuthorityFailure) {
      db.exec("ROLLBACK");
      return { published: false, replayed: false, reason: secondAuthorityFailure, settlementId: null, outboxId: null };
    }
    if (!publicationFence(db, settlement, conversationId)) {
      // The semantic deltas above are provisional. A stale second fence must
      // roll back those writes together with the refused publication.
      db.exec("ROLLBACK");
      return { published: false, replayed: false, reason: "stale_generation", settlementId: null, outboxId: null };
    }

    const currentnessWitness = options.currentness ? {
      binding: options.currentness.binding ?? { complete: options.currentness.complete === true },
      complete: options.currentness.complete === true || (options.currentness.binding as any)?.complete === true,
      observedObservationIds: options.currentness.observedObservationIds ?? [],
    } : (settlement as any).currentnessWitness ?? (settlement as any).currentness ?? null;

    db.prepare(
      `INSERT INTO settlements (settlement_id, cycle_id, generation, wake_id, semantic_pass, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(settlement.settlementId, settlement.cycleId, settlement.generation, wakeId, semanticPass, json({ ...settlement, wakeId, currentnessWitness }));

    let outboxId: number | null = null;
    if (settlement.speech.mode === "draft") {
      const outbox = insertOutboxPending(db, {
        settlementId: settlement.settlementId,
        cycleId: settlement.cycleId,
        generation: settlement.generation,
        conversationId,
        licensedText: settlement.speech.finalLicensedText ?? settlement.speech.surfaceDraft ?? "",
        origin: options.origin ?? "live",
        deliveryIntent: options.deliveryIntent,
      });
      outboxId = outbox.outboxId;
    }
    const ledgerPayload = {
      cycleId: settlement.cycleId,
      generation: settlement.generation,
      triggerKind: options.triggerKind ?? "owner_message",
      occupantId: settlement.occupantId,
      authorityEpoch: settlement.authorityEpoch,
      settlementId: settlement.settlementId,
      observationIds: settlement.operations.observationsConsumed,
      effectIds: settlement.operations.effectsCompleted,
      authorityCodes: settlement.authority.objectionsApplied,
      nominationIds: settlement.durableNominations.map((item) => item.nominationId),
      outboxId,
      fidelity: options.fidelity ?? "skipped",
      thoughtUnavailable: options.thoughtUnavailable ?? false,
      architectureEpoch: settlement.architectureEpoch,
    };
    db.prepare(
      `INSERT INTO causal_ledger
         (cycle_id, generation, payload_json, thought_unavailable)
       VALUES (?, ?, ?, 0)`,
    ).run(settlement.cycleId, settlement.generation, json(ledgerPayload));

    db.prepare("UPDATE cycle_records SET state = ?, updated_at_ms = ? WHERE cycle_id = ? AND generation = ?")
      .run(outboxId === null ? "silent" : "sending", nowMs, settlement.cycleId, settlement.generation);
    db.exec("COMMIT");
    return { published: true, replayed: false, settlementId: settlement.settlementId, outboxId };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve original */ }
    throw error;
  }
}

function awaitlessConversation(settlement: PublishedCognitiveSettlement, db: DatabaseSync): string {
  const row = db.prepare("SELECT conversation_id FROM cycle_records WHERE cycle_id = ? LIMIT 1").get(settlement.cycleId) as DbRow | undefined;
  return stringValue(row?.conversation_id, settlement.triggerRef);
}

function getSpeechOutboxBySettlementUnsafe(db: DatabaseSync, settlementId: string): number | null {
  const row = db.prepare("SELECT outbox_id FROM speech_outbox WHERE settlement_id = ?").get(settlementId) as DbRow | undefined;
  return row?.outbox_id == null ? null : numberValue(row.outbox_id);
}

/** Read the durable publication identity without applying any semantic delta. */
export function getPublishedSettlementIdentity(
  db: DatabaseSync,
  cycleId: string,
  generation: number,
): PublishedSettlementIdentity | null {
  const row = existingSettlementForCycleGeneration(db, cycleId, generation);
  if (!row) return null;
  const settlementId = stringValue(row.settlement_id);
  if (!settlementId) return null;
  return {
    settlementId,
    outboxId: getSpeechOutboxBySettlementUnsafe(db, settlementId),
  };
}
