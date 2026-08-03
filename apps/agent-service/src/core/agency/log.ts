import type { DatabaseSync } from "node:sqlite";
import type { Decision, DecisionKind, Trigger } from "../types.js";

export type LoggedDecision = {
  id: number;
  ownerId: string;
  channel: string;
  trigger: Trigger;
  decisionKind: DecisionKind;
  motivationIds: number[];
  reason: string;
  outcomeText: string | null;
  createdAt: string;
};

type LogDecisionInput = {
  ownerId: string;
  channel: string;
  trigger: Trigger;
  decision: Decision;
  outcomeText?: string | null;
};

type DbRow = Record<string, unknown>;

function isRow(value: unknown): value is DbRow {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function decisionKind(value: unknown): DecisionKind | null {
  const kind = stringValue(value);
  if (
    kind === "speak" ||
    kind === "silence" ||
    kind === "delay" ||
    kind === "ask" ||
    kind === "revisit" ||
    kind === "share" ||
    kind === "challenge"
  ) {
    return kind;
  }
  return null;
}

function trigger(value: unknown): Trigger | null {
  const valueText = stringValue(value);
  return valueText === "reactive" || valueText === "proactive"
    ? valueText
    : null;
}

function parseIds(value: unknown): number[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === "number")
      : [];
  } catch {
    return [];
  }
}

function mapDecision(row: unknown): LoggedDecision | null {
  if (!isRow(row)) return null;
  const kind = decisionKind(row.decision_kind);
  const rowTrigger = trigger(row.trigger);
  if (!kind || !rowTrigger) return null;
  return {
    id: numberValue(row.id),
    ownerId: stringValue(row.owner_id),
    channel: stringValue(row.channel),
    trigger: rowTrigger,
    decisionKind: kind,
    motivationIds: parseIds(row.motivation_ids_json),
    reason: stringValue(row.reason),
    outcomeText:
      typeof row.outcome_text === "string" ? row.outcome_text : null,
    createdAt: stringValue(row.created_at),
  };
}

export function logDecision(db: DatabaseSync, input: LogDecisionInput): number;
export function logDecision(
  db: DatabaseSync,
  ownerId: string,
  channel: string,
  trigger: Trigger,
  decision: Decision,
  outcomeText?: string | null,
): number;
export function logDecision(
  db: DatabaseSync,
  inputOrOwner: LogDecisionInput | string,
  channel?: string,
  decisionTrigger?: Trigger,
  decision?: Decision,
  outcomeText: string | null = null,
): number {
  const input: LogDecisionInput =
    typeof inputOrOwner === "string"
      ? {
          ownerId: inputOrOwner,
          channel: channel ?? "discord",
          trigger: decisionTrigger ?? "reactive",
          decision: decision ?? {
            trigger: decisionTrigger ?? "reactive",
            kind: "silence",
            motivationIds: [],
            score: 0,
            reason: "missing decision",
          },
          outcomeText,
        }
      : inputOrOwner;
  const result = db
    .prepare(
      `INSERT INTO decision_log
         (owner_id, channel, trigger, decision_kind, motivation_ids_json,
          reason, outcome_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.ownerId,
      input.channel,
      input.trigger,
      input.decision.kind,
      JSON.stringify(input.decision.motivationIds),
      input.decision.reason,
      input.outcomeText ?? null,
      new Date().toISOString(),
    );
  const ids = input.decision.motivationIds;
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    db.prepare(
      `UPDATE motivations
       SET consumed_at = ?
       WHERE id IN (${placeholders}) AND owner_id = ?`,
    ).run(new Date().toISOString(), ...ids, input.ownerId);
  }
  return Number(result.lastInsertRowid);
}

export function setDecisionOutcome(
  db: DatabaseSync,
  decisionId: number,
  outcomeText: string | null,
): void {
  db.prepare("UPDATE decision_log SET outcome_text = ? WHERE id = ?").run(
    outcomeText,
    decisionId,
  );
}

export function getDecision(
  db: DatabaseSync,
  decisionId: number,
): LoggedDecision | null {
  const row = db
    .prepare(
      `SELECT id, owner_id, channel, trigger, decision_kind,
              motivation_ids_json, reason, outcome_text, created_at
       FROM decision_log
       WHERE id = ?`,
    )
    .get(decisionId);
  return mapDecision(row);
}

export function listRecentDecisions(
  db: DatabaseSync,
  ownerId: string,
  limit = 20,
): LoggedDecision[] {
  const rows = db
    .prepare(
      `SELECT id, owner_id, channel, trigger, decision_kind,
              motivation_ids_json, reason, outcome_text, created_at
       FROM decision_log
       WHERE owner_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(ownerId, Math.max(1, Math.min(100, limit)))
    .map(mapDecision)
    .filter((decisionRow): decisionRow is LoggedDecision => decisionRow !== null);
  return rows;
}
