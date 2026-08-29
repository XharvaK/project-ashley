import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { InFlightRecord } from "../types.js";

export type PutInFlightInput = {
  effectId?: string;
  cycleId: string;
  generation: number;
  correlationId: string;
  idempotencyKey: string;
  dispatchedAtMs?: number;
  originJobId?: string | null;
  payload?: unknown;
};

type DbRow = Record<string, unknown>;
function stringValue(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function numberValue(value: unknown, fallback = 0): number { const n = typeof value === "number" ? value : Number(value); return Number.isFinite(n) ? n : fallback; }
function mapInFlight(row: unknown): InFlightRecord | null {
  if (typeof row !== "object" || row === null) return null;
  const value = row as DbRow;
  return {
    effectId: stringValue(value.effect_id),
    cycleId: stringValue(value.cycle_id),
    generation: numberValue(value.generation),
    correlationId: stringValue(value.correlation_id),
    idempotencyKey: stringValue(value.idempotency_key),
    status: stringValue(value.state) as InFlightRecord["status"],
    dispatchedAtMs: numberValue(value.dispatched_at_ms),
    originJobId: value.origin_job_id == null ? null : stringValue(value.origin_job_id),
  };
}

export function getInFlight(db: DatabaseSync, effectOrIdempotencyKey: string): InFlightRecord | null {
  return mapInFlight(
    db.prepare("SELECT * FROM in_flight_effects WHERE effect_id = ? OR idempotency_key = ? LIMIT 1").get(effectOrIdempotencyKey, effectOrIdempotencyKey),
  );
}

export function putInFlight(db: DatabaseSync, input: PutInFlightInput): InFlightRecord {
  const existing = getInFlight(db, input.idempotencyKey);
  if (existing) return existing;
  const effectId = input.effectId ?? randomUUID();
  db.prepare(
    `INSERT INTO in_flight_effects
       (effect_id, cycle_id, generation, correlation_id, idempotency_key,
        state, payload_json, dispatched_at_ms, origin_job_id)
     VALUES (?, ?, ?, ?, ?, 'in_flight', ?, ?, ?)`,
  ).run(
    effectId,
    input.cycleId,
    input.generation,
    input.correlationId,
    input.idempotencyKey,
    JSON.stringify(input.payload ?? {}),
    input.dispatchedAtMs ?? Date.now(),
    input.originJobId ?? null,
  );
  const row = getInFlight(db, effectId);
  if (!row) throw new Error("in_flight_insert_lost");
  return row;
}

export function markInFlightUnknown(db: DatabaseSync, effectId: string, _atMs = Date.now()): InFlightRecord {
  db.prepare("UPDATE in_flight_effects SET state = 'unknown' WHERE effect_id = ? AND state = 'in_flight'").run(effectId);
  const row = getInFlight(db, effectId);
  if (!row) throw new Error("in_flight_missing");
  return row;
}

export function markInFlightReceipted(db: DatabaseSync, effectId: string): InFlightRecord {
  db.prepare("UPDATE in_flight_effects SET state = 'receipted' WHERE effect_id = ?").run(effectId);
  const row = getInFlight(db, effectId);
  if (!row) throw new Error("in_flight_missing");
  return row;
}

export function listInFlight(db: DatabaseSync, cycleId?: string): InFlightRecord[] {
  const rows = cycleId
    ? db.prepare("SELECT * FROM in_flight_effects WHERE cycle_id = ? ORDER BY dispatched_at_ms ASC").all(cycleId)
    : db.prepare("SELECT * FROM in_flight_effects ORDER BY dispatched_at_ms ASC").all();
  return rows.map(mapInFlight).filter((row): row is InFlightRecord => row !== null);
}
