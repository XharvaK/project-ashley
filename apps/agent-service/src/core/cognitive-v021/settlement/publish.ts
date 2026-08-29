import type { DatabaseSync } from "node:sqlite";
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

export type PublicationOptions = {
  origin?: OutboxOrigin;
  deliveryIntent?: DeliveryIntent;
  nowMs?: number;
  triggerKind?: CycleTriggerKind;
  fidelity?: "passed" | "rejected" | "skipped";
  thoughtUnavailable?: boolean;
};

export type PublicationResult = {
  published: boolean;
  replayed: boolean;
  reason?: "stale_generation";
  settlementId: string | null;
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
  ).run(trigger.triggerId, trigger.conversationId, trigger.concernId, trigger.dueAtMs, trigger.snapshotHash, json(trigger.payload ?? {}));
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
  db.prepare(
    `INSERT OR IGNORE INTO durable_nominations
       (nomination_id, cycle_id, generation, assertion_key, statement, memory_kind,
        dimensions_json, data_classification, supersedes_assertion_key, concern_id, admitted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(nomination.nominationId, nomination.cycleId, nomination.generation, nomination.assertionKey, nomination.statement, nomination.memoryKind, json(nomination.dimensions), nomination.dataClassification, nomination.supersedesAssertionKey, nomination.concernId);
}

function existingSettlement(db: DatabaseSync, settlementId: string): DbRow | undefined {
  return db.prepare("SELECT settlement_id, cycle_id, generation FROM settlements WHERE settlement_id = ?").get(settlementId) as DbRow | undefined;
}

export function publishSemanticTransaction(
  db: DatabaseSync,
  settlement: PublishedCognitiveSettlement,
  options: PublicationOptions = {},
): PublicationResult {
  const nowMs = options.nowMs ?? Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = existingSettlement(db, settlement.settlementId);
    if (existing) {
      const outbox = getSpeechOutboxBySettlementUnsafe(db, settlement.settlementId);
      db.exec("COMMIT");
      return { published: true, replayed: true, settlementId: settlement.settlementId, outboxId: outbox };
    }
    const current = currentGeneration(db, awaitlessConversation(settlement, db));
    if (current !== null && current !== settlement.generation) {
      db.exec("COMMIT");
      return { published: false, replayed: false, reason: "stale_generation", settlementId: null, outboxId: null };
    }

    for (const delta of settlement.workingContextDelta) applyWorkingContextDelta(db, delta, settlement);
    for (const delta of settlement.concernDeltas) applyConcernDelta(db, delta, settlement);
    for (const delta of settlement.occupancyDelta) applyOccupancyDelta(db, delta, settlement);
    for (const delta of settlement.futureTriggers) applyFutureTriggerDelta(db, delta);
    for (const delta of settlement.subscriptions) applySubscriptionDelta(db, delta);
    for (const nomination of settlement.durableNominations) applyNomination(db, nomination);

    db.prepare(
      `INSERT INTO settlements (settlement_id, cycle_id, generation, payload_json)
       VALUES (?, ?, ?, ?)`,
    ).run(settlement.settlementId, settlement.cycleId, settlement.generation, json(settlement));

    let outboxId: number | null = null;
    if (settlement.speech.mode === "draft") {
      const outbox = insertOutboxPending(db, {
        settlementId: settlement.settlementId,
        cycleId: settlement.cycleId,
        generation: settlement.generation,
        conversationId: awaitlessConversation(settlement, db),
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
