import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { insertOutboxPending } from "../speech/outbox.js";
import type {
  ConcernDelta,
  DeliveryIntent,
  DurableNomination,
  FutureTriggerDelta,
  MindOccupancy,
  OccupancyDelta,
  OutboxOrigin,
  PublishedCognitiveSettlement,
  SubscriptionDelta,
  WorkingContextDelta,
  WorkingContextItem,
} from "../types.js";

export type PublicationOptions = {
  origin?: OutboxOrigin;
  deliveryIntent?: DeliveryIntent;
  nowMs?: number;
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
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function json(value: unknown): string { return JSON.stringify(value ?? null); }
function parseJson(value: unknown, fallback: unknown): unknown { try { return JSON.parse(stringValue(value)); } catch { return fallback; } }

function currentGeneration(db: DatabaseSync, conversationId: string): number | null {
  const row = db.prepare("SELECT MAX(generation) AS generation FROM cycle_records WHERE conversation_id = ?").get(conversationId) as DbRow | undefined;
  if (!row || row.generation == null) return null;
  return numberValue(row.generation);
}

function applyWorkingContextDelta(db: DatabaseSync, delta: WorkingContextDelta, settlement: PublishedCognitiveSettlement): void {
  const put = (item: Omit<WorkingContextItem, "updatedGeneration">) => {
    db.prepare(
      `INSERT INTO working_context_items
         (id, conversation_id, type, payload_json, superseded, updated_cycle, updated_generation)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET conversation_id=excluded.conversation_id,
         type=excluded.type, payload_json=excluded.payload_json, superseded=excluded.superseded,
         updated_cycle=excluded.updated_cycle, updated_generation=excluded.updated_generation`,
    ).run(item.id, item.conversationId, item.type, json(item), item.status === "superseded" ? 1 : 0, settlement.cycleId, settlement.generation);
  };
  switch (delta.op) {
    case "upsert": put(delta.item); break;
    case "supersede":
      db.prepare("UPDATE working_context_items SET superseded = 1, updated_cycle = ?, updated_generation = ? WHERE id = ?").run(settlement.cycleId, settlement.generation, delta.id);
      put(delta.replacement);
      break;
    case "abandon":
      db.prepare("UPDATE working_context_items SET superseded = 1, updated_cycle = ?, updated_generation = ? WHERE id = ?").run(settlement.cycleId, settlement.generation, delta.id);
      break;
  }
}

function applyConcernDelta(db: DatabaseSync, delta: ConcernDelta, settlement: PublishedCognitiveSettlement): void {
  if (delta.op === "resolve") {
    db.prepare("UPDATE concerns SET status = 'resolved', updated_cycle = ? WHERE concern_id = ?").run(settlement.cycleId, delta.concernId);
    return;
  }
  const record = delta.record;
  db.prepare(
    `INSERT INTO concerns
       (concern_id, conversation_id, statement, source_refs_json, dimensions_json,
        assertion_key, status, snapshot_hash, updated_cycle)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(concern_id) DO UPDATE SET conversation_id=excluded.conversation_id,
       statement=excluded.statement, source_refs_json=excluded.source_refs_json,
       dimensions_json=excluded.dimensions_json, assertion_key=excluded.assertion_key,
       status=excluded.status, snapshot_hash=excluded.snapshot_hash, updated_cycle=excluded.updated_cycle`,
  ).run(record.concernId, record.conversationId, record.statement, json(record.sourceTurnIds), json(record.dimensions), record.assertionKey, record.status, hash(record), settlement.cycleId);
}

function applyOccupancyDelta(db: DatabaseSync, delta: OccupancyDelta, settlement: PublishedCognitiveSettlement): void {
  const occupancy: Omit<MindOccupancy, "updatedCycle"> = delta.occupancy;
  db.prepare(
    `INSERT INTO mind_occupancy
       (conversation_id, concern_id, status, priority, updated_cycle, updated_generation)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id, concern_id) DO UPDATE SET status=excluded.status,
       priority=excluded.priority, updated_cycle=excluded.updated_cycle,
       updated_generation=excluded.updated_generation`,
  ).run(occupancy.conversationId, occupancy.concernId, occupancy.status, occupancy.priority, settlement.cycleId, occupancy.updatedGeneration);
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
      triggerKind: "owner_message",
      occupantId: settlement.occupantId,
      authorityEpoch: settlement.authorityEpoch,
      settlementId: settlement.settlementId,
      observationIds: settlement.operations.observationsConsumed,
      effectIds: settlement.operations.effectsCompleted,
      authorityCodes: settlement.authority.objectionsApplied,
      nominationIds: settlement.durableNominations.map((item) => item.nominationId),
      outboxId,
      fidelity: "skipped",
      thoughtUnavailable: false,
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
