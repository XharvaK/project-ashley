import type { DatabaseSync } from "node:sqlite";
import { admitCycle, appendCycleLogIds, getCurrentCycle } from "./inbox.js";
import type { CycleRecord, CycleTriggerKind } from "../types.js";
import { suppressUndeliveredOutbox } from "../speech/outbox.js";
import { cancelActiveThought } from "./active.js";

export type ComposeOrPreemptInput = {
  conversationId: string;
  evidenceRowIds?: string[];
  triggerKind?: CycleTriggerKind;
  triggerRef?: string;
  occupantId?: string | null;
  authorityEpoch?: number;
  nowMs?: number;
};

export type ComposeOrPreemptResult = {
  action: "compose" | "preempt";
  cycle: CycleRecord;
  cycleId: string;
  generation: number;
  preemptedGeneration: number | null;
};

function hasPublishedOutbox(db: DatabaseSync, conversationId: string, generation: number): boolean {
  const row = db.prepare(
    `SELECT 1 FROM speech_outbox
     WHERE conversation_id = ? AND generation = ?
     LIMIT 1`,
  ).get(conversationId, generation);
  return Boolean(row);
}

function hasEffectfulInFlight(db: DatabaseSync, cycleId: string, generation: number): boolean {
  return Boolean(db.prepare(
    `SELECT 1 FROM in_flight_effects
     WHERE cycle_id = ? AND generation = ?
       AND state IN ('in_flight', 'unknown')
     LIMIT 1`,
  ).get(cycleId, generation));
}

export function composeOrPreempt(
  db: DatabaseSync,
  input: ComposeOrPreemptInput,
): ComposeOrPreemptResult {
  const nowMs = input.nowMs ?? Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = getCurrentCycle(db, input.conversationId, { includeIdle: false });
    if (!current) {
      const cycle = admitCycle(db, {
        conversationId: input.conversationId,
        triggerKind: input.triggerKind ?? "owner_message",
        triggerRef: input.triggerRef,
        occupantId: input.occupantId,
        authorityEpoch: input.authorityEpoch,
        nowMs,
      });
      db.exec("COMMIT");
      return { action: "compose", cycle, cycleId: cycle.cycleId, generation: cycle.generation, preemptedGeneration: null };
    }

    const effectful = hasEffectfulInFlight(db, current.cycleId, current.generation);
    const published = hasPublishedOutbox(db, input.conversationId, current.generation);
    if (!effectful && !published) {
      const cycle = appendCycleLogIds(db, current.cycleId, input.evidenceRowIds ?? [], nowMs);
      db.exec("COMMIT");
      cancelActiveThought({
        conversationId: input.conversationId,
        cycleId: cycle.cycleId,
        generation: cycle.generation,
        action: "compose",
      });
      return { action: "compose", cycle, cycleId: cycle.cycleId, generation: cycle.generation, preemptedGeneration: null };
    }

    suppressUndeliveredOutbox(db, {
      conversationId: input.conversationId,
      generation: current.generation,
      reason: "preempted_by_new_generation",
    });
    db.prepare("UPDATE cycle_records SET state = 'silent', updated_at_ms = ? WHERE cycle_id = ?").run(nowMs, current.cycleId);
    const cycle = admitCycle(db, {
      conversationId: input.conversationId,
      generation: current.generation + 1,
      triggerKind: input.triggerKind ?? "owner_message",
      triggerRef: input.triggerRef,
      occupantId: input.occupantId ?? current.occupantId,
      authorityEpoch: input.authorityEpoch ?? current.authorityEpoch,
      nowMs,
      preemptedGeneration: current.generation,
    });
    if ((input.evidenceRowIds ?? []).length > 0) appendCycleLogIds(db, cycle.cycleId, input.evidenceRowIds ?? [], nowMs);
    const finalCycle = (input.evidenceRowIds ?? []).length > 0 ? getCurrentCycle(db, input.conversationId, { includeIdle: false }) ?? cycle : cycle;
    db.exec("COMMIT");
    cancelActiveThought({
      conversationId: input.conversationId,
      cycleId: current.cycleId,
      generation: current.generation,
      action: "preempt",
    });
    return { action: "preempt", cycle: finalCycle, cycleId: finalCycle.cycleId, generation: finalCycle.generation, preemptedGeneration: current.generation };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve original */ }
    throw error;
  }
}
