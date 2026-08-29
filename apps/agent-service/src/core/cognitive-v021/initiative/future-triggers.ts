import { appendInboxEvent } from "../cycle/inbox.js";
import { getConcern } from "../concerns/lineage.js";
import { listOccupancy } from "../concerns/occupancy.js";
import type { DatabaseSync } from "node:sqlite";
import type { FutureTrigger, InboxEvent } from "../types.js";

type Row = Record<string, unknown>;

export type ScheduleFutureTriggerInput = Omit<FutureTrigger, "status"> & {
  status?: FutureTrigger["status"];
};

export type FutureTriggerFireOptions = {
  conversationId?: string;
  nowMs?: number;
  onFire?: (input: { trigger: FutureTrigger; event: InboxEvent }) => Promise<{ thoughtModelAttempts?: number } | void> | { thoughtModelAttempts?: number } | void;
};

export type FutureTriggerFireResult = {
  fired: FutureTrigger[];
  suppressedStale: FutureTrigger[];
  events: InboxEvent[];
  thoughtModelAttempts: number;
};

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return isRow(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapTrigger(value: unknown): FutureTrigger | null {
  if (!isRow(value)) return null;
  const status = value.status;
  if (status !== "scheduled" && status !== "fired" && status !== "cancelled" && status !== "suppressed_stale") return null;
  if (typeof value.trigger_id !== "string" || typeof value.conversation_id !== "string" || typeof value.concern_id !== "string") return null;
  return {
    triggerId: value.trigger_id,
    conversationId: value.conversation_id,
    concernId: value.concern_id,
    snapshotHash: text(value.snapshot_hash),
    dueAtMs: number(value.due_at_ms),
    status,
    payload: parsePayload(value.payload_json),
  };
}

function referencePayload(value: unknown): Record<string, unknown> {
  if (!isRow(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLocaleLowerCase();
    if (normalizedKey.includes("statement") || normalizedKey.includes("essay") || normalizedKey.includes("prose") || normalizedKey === "text" || normalizedKey === "content") continue;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) result[key] = item;
    else if (Array.isArray(item)) result[key] = item.filter((entry) => typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null);
    else if (isRow(item)) result[key] = referencePayload(item);
  }
  return result;
}

export const sanitizeFutureTriggerPayload = referencePayload;

function validateTrigger(input: ScheduleFutureTriggerInput): void {
  if (!input.triggerId.trim()) throw new Error("future_trigger_id_required");
  if (!input.conversationId.trim()) throw new Error("future_trigger_conversation_required");
  if (!input.concernId.trim()) throw new Error("future_trigger_concern_required");
  if (!input.snapshotHash.trim()) throw new Error("future_trigger_snapshot_required");
  if (!Number.isFinite(input.dueAtMs)) throw new Error("future_trigger_due_at_invalid");
}

export function scheduleFutureTrigger(db: DatabaseSync, input: ScheduleFutureTriggerInput): FutureTrigger {
  validateTrigger(input);
  db.prepare(
    `INSERT INTO future_triggers
       (trigger_id, conversation_id, concern_id, due_at_ms, snapshot_hash, status, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(trigger_id) DO UPDATE SET conversation_id=excluded.conversation_id,
       concern_id=excluded.concern_id, due_at_ms=excluded.due_at_ms,
       snapshot_hash=excluded.snapshot_hash, status=excluded.status,
       payload_json=excluded.payload_json`,
  ).run(
    input.triggerId,
    input.conversationId,
    input.concernId,
    input.dueAtMs,
    input.snapshotHash,
    input.status === "cancelled" ? "cancelled" : "scheduled",
    JSON.stringify(referencePayload(input.payload ?? {})),
  );
  const result = getFutureTrigger(db, input.triggerId);
  if (!result) throw new Error("future_trigger_schedule_lost");
  return result;
}

export function getFutureTrigger(db: DatabaseSync, triggerId: string): FutureTrigger | null {
  return mapTrigger(db.prepare("SELECT * FROM future_triggers WHERE trigger_id = ?").get(triggerId));
}

export function listFutureTriggers(db: DatabaseSync, conversationId?: string, options: { includeTerminal?: boolean; limit?: number } = {}): FutureTrigger[] {
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  if (conversationId) {
    clauses.push("conversation_id = ?");
    args.push(conversationId);
  }
  if (!options.includeTerminal) clauses.push("status IN ('scheduled', 'fired', 'suppressed_stale')");
  args.push(Math.max(1, Math.min(10_000, options.limit ?? 1000)));
  return db.prepare(
    `SELECT * FROM future_triggers ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY due_at_ms ASC, trigger_id ASC LIMIT ?`,
  ).all(...args)
    .map(mapTrigger)
    .filter((trigger): trigger is FutureTrigger => trigger !== null);
}

export function cancelFutureTrigger(db: DatabaseSync, triggerId: string): boolean {
  const result = db.prepare("UPDATE future_triggers SET status = 'cancelled' WHERE trigger_id = ? AND status = 'scheduled'").run(triggerId);
  return number(result.changes) === 1;
}

function staleReason(db: DatabaseSync, trigger: FutureTrigger): string | null {
  const concern = getConcern(db, trigger.concernId);
  const occupancy = listOccupancy(db, trigger.conversationId).find((item) => item.concernId === trigger.concernId);
  if (!concern || !occupancy) return "missing_current_occupancy";
  if (concern.snapshotHash !== trigger.snapshotHash) return "snapshot_mismatch";
  if (concern.status === "resolved" || occupancy.status === "resolved") return "resolved_occupancy";
  if (concern.status === "dormant_but_revisitable" || occupancy.status === "dormant_but_revisitable") return "dormant_occupancy";
  if (concern.status === "quarantined" || occupancy.status === "quarantined") return "quarantined_occupancy";
  if (occupancy.status !== "active" && occupancy.status !== "investigating" && occupancy.status !== "waiting_for_evidence") return "non_grounded_occupancy";
  return null;
}

function recordStale(db: DatabaseSync, trigger: FutureTrigger, reason: string, nowMs: number): void {
  const occupancy = listOccupancy(db, trigger.conversationId).find((item) => item.concernId === trigger.concernId);
  db.prepare("UPDATE future_triggers SET status = 'suppressed_stale' WHERE trigger_id = ? AND status = 'scheduled'").run(trigger.triggerId);
  db.prepare(
    `INSERT INTO causal_ledger (cycle_id, generation, payload_json, thought_unavailable)
     VALUES (?, ?, ?, 0)`,
  ).run(
    `future-trigger:${trigger.triggerId}`,
    occupancy?.updatedGeneration ?? 0,
    JSON.stringify({ triggerKind: "future_trigger_due", triggerId: trigger.triggerId, concernId: trigger.concernId, result: "suppressed_stale", reason, atMs: nowMs }),
  );
}

export async function fireDueTriggers(
  db: DatabaseSync,
  options: FutureTriggerFireOptions = {},
): Promise<FutureTriggerFireResult> {
  const nowMs = options.nowMs ?? Date.now();
  const clauses = ["status = 'scheduled'", "due_at_ms <= ?"];
  const args: Array<string | number> = [nowMs];
  if (options.conversationId) {
    clauses.push("conversation_id = ?");
    args.push(options.conversationId);
  }
  const candidates = db.prepare(`SELECT * FROM future_triggers WHERE ${clauses.join(" AND ")} ORDER BY due_at_ms ASC, trigger_id ASC`).all(...args)
    .map(mapTrigger)
    .filter((trigger): trigger is FutureTrigger => trigger !== null);
  const fired: FutureTrigger[] = [];
  const suppressedStale: FutureTrigger[] = [];
  const events: InboxEvent[] = [];

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const candidate of candidates) {
      const current = getFutureTrigger(db, candidate.triggerId);
      if (!current || current.status !== "scheduled") continue;
      const reason = staleReason(db, current);
      if (reason) {
        recordStale(db, current, reason, nowMs);
        suppressedStale.push({ ...current, status: "suppressed_stale" });
        continue;
      }
      db.prepare("UPDATE future_triggers SET status = 'fired' WHERE trigger_id = ? AND status = 'scheduled'").run(current.triggerId);
      const event = appendInboxEvent(db, {
        id: `future-trigger:${current.triggerId}`,
        conversationId: current.conversationId,
        kind: "future_trigger_due",
        payload: { triggerId: current.triggerId, concernId: current.concernId, snapshotHash: current.snapshotHash },
        createdAtMs: nowMs,
      });
      fired.push({ ...current, status: "fired" });
      events.push(event);
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve original */ }
    throw error;
  }

  let thoughtModelAttempts = 0;
  if (options.onFire) {
    for (let index = 0; index < fired.length; index += 1) {
      const result = await options.onFire({ trigger: fired[index]!, event: events[index]! });
      thoughtModelAttempts += number(result && "thoughtModelAttempts" in result ? result.thoughtModelAttempts : 0);
    }
  }
  return { fired, suppressedStale, events, thoughtModelAttempts };
}
