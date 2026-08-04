import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import type {
  SilenceReasonCode,
  WithdrawalScope,
} from "./types.js";
import { relationshipCanInfluence } from "./influence.js";

const SCOPE_PRECEDENCE: WithdrawalScope[] = [
  "boundary_repair",
  "relationship_pause",
  "initiative",
  "topic",
  "turn",
];

export function repairCoolingHours(): number {
  return env.repairCoolingHours;
}

export function activeWithdrawal(
  db: DatabaseSync,
  ownerId: string,
  nowIso = new Date().toISOString(),
): Record<string, unknown> | null {
  const rows = db
    .prepare(
      `SELECT * FROM withdrawal_records
       WHERE owner_id = ? AND status = 'active'
       ORDER BY updated_at DESC`,
    )
    .all(ownerId) as Array<Record<string, unknown>>;
  const active = rows.filter((row) => {
    const expires = row.expires_at ? String(row.expires_at) : null;
    return !expires || expires > nowIso;
  });
  if (active.length === 0) return null;
  active.sort(
    (a, b) =>
      SCOPE_PRECEDENCE.indexOf(String(a.scope) as WithdrawalScope) -
      SCOPE_PRECEDENCE.indexOf(String(b.scope) as WithdrawalScope),
  );
  return active[0] ?? null;
}

export function evaluateWithdrawalSilence(
  db: DatabaseSync,
  ownerId: string,
  cognitionMode: "observe" | "apply",
  topicHint?: string,
): SilenceReasonCode | null {
  if (!relationshipCanInfluence(db, cognitionMode)) {
    return null;
  }
  const row = activeWithdrawal(db, ownerId);
  if (!row) return null;
  const scope = String(row.scope) as WithdrawalScope;
  if (scope === "turn" && Number(row.turn_consumed ?? 0) === 0) {
    return "withdrawal_turn";
  }
  if (scope === "topic" && topicHint && row.topic_hint) {
    const hint = String(row.topic_hint).toLowerCase();
    if (topicHint.toLowerCase().includes(hint)) {
      return "withdrawal_topic";
    }
  }
  if (scope === "relationship_pause") return "withdrawal_pause";
  if (scope === "boundary_repair") return "withdrawal_boundary_repair";
  return null;
}

export function consumeTurnWithdrawal(
  db: DatabaseSync,
  entityUuid: string,
): void {
  db.prepare(
    `UPDATE withdrawal_records
     SET turn_consumed = 1, updated_at = ?
     WHERE entity_uuid = ? AND scope = 'turn' AND turn_consumed = 0`,
  ).run(new Date().toISOString(), entityUuid);
}

export function consumeActiveTurnWithdrawal(
  db: DatabaseSync,
  ownerId: string,
): void {
  const row = activeWithdrawal(db, ownerId);
  if (!row || String(row.scope) !== "turn") return;
  const entityUuid = String(row.entity_uuid ?? "");
  if (!entityUuid) return;
  consumeTurnWithdrawal(db, entityUuid);
}

export function canAttemptRepair(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): boolean {
  const row = activeWithdrawal(db, ownerId, now.toISOString());
  if (!row) return false;
  const repairStatus = String(row.repair_status ?? "none");
  if (repairStatus === "backoff" || repairStatus === "attempted") return false;
  if (repairStatus === "cooling") {
    const until = row.cooling_until ? String(row.cooling_until) : null;
    return until !== null && until <= now.toISOString();
  }
  if (repairStatus === "eligible") return true;
  return false;
}

export function markRepairAttempted(
  db: DatabaseSync,
  withdrawalEntityUuid: string,
  decisionId: number,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE withdrawal_records
     SET repair_status = 'attempted', repair_decision_id = ?, updated_at = ?
     WHERE entity_uuid = ?`,
  ).run(decisionId, now, withdrawalEntityUuid);
}

export function markRepairBackoff(
  db: DatabaseSync,
  withdrawalEntityUuid: string,
): void {
  db.prepare(
    `UPDATE withdrawal_records
     SET repair_status = 'backoff', updated_at = ?
     WHERE entity_uuid = ?`,
  ).run(new Date().toISOString(), withdrawalEntityUuid);
}

export function markRepairCommitted(
  db: DatabaseSync,
  withdrawalEntityUuid: string,
  deliveryReceiptId: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE withdrawal_records
     SET repair_attempt_count = repair_attempt_count + 1,
         repair_delivery_receipt_id = ?,
         repair_status = 'backoff',
         updated_at = ?
     WHERE entity_uuid = ?`,
  ).run(deliveryReceiptId, now, withdrawalEntityUuid);
}
