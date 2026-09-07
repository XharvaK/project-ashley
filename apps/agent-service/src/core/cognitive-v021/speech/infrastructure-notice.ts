import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  THOUGHT_UNAVAILABLE_NOTICE,
  type DeliveryIntent,
  type Generation,
  type OutboxOrigin,
  type SystemNoticeOutbox,
} from "../types.js";

export { THOUGHT_UNAVAILABLE_NOTICE };

export const USER_FACING_THOUGHT_FAILURE_CODES = [
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_AUTHENTICATION_FAILED",
  "PROVIDER_REQUEST_INVALID",
  "PROVIDER_TRANSPORT_FAILURE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_INTERNAL",
  "THOUGHT_DEADLINE_EXCEEDED",
  "STRUCTURED_OUTPUT_INVALID",
  "STRUCTURAL_RETRY_EXHAUSTED",
  "LOCAL_DISPATCH_FAILURE",
  "CANCELLED",
  "UNKNOWN",
] as const;

export type UserFacingThoughtFailureCode = typeof USER_FACING_THOUGHT_FAILURE_CODES[number];

export function classifyThoughtFailureCode(input: {
  reason: string;
  failureCode?: string | null;
}): UserFacingThoughtFailureCode {
  const failureCode = input.failureCode?.trim().toLowerCase();
  switch (failureCode) {
    case "rate_limited":
    case "quota_exhausted":
    case "provider_quota":
      return "RATE_LIMITED";
    case "provider_unavailable":
    case "mistral_unavailable":
    case "provider_model_unavailable":
      return "PROVIDER_UNAVAILABLE";
    case "credential_invalid":
    case "authentication_failed":
    case "unauthorized":
      return "PROVIDER_AUTHENTICATION_FAILED";
    case "bad_request":
    case "invalid_request":
      return "PROVIDER_REQUEST_INVALID";
    case "network_error":
    case "provider_transport_failure":
      return "PROVIDER_TRANSPORT_FAILURE";
    case "timeout":
    case "provider_timeout":
      return "PROVIDER_TIMEOUT";
    case "provider_internal":
      return "PROVIDER_INTERNAL";
    case "structured_output_untrusted":
    case "structured_output_native_unsupported":
    case "malformed_output":
    case "malformed_json":
    case "schema_violation":
      return "STRUCTURED_OUTPUT_INVALID";
    case "aborterror":
    case "cancelled":
      return "CANCELLED";
    case "route_disabled":
    case "operator_disabled":
    case "capability_mismatch":
    case "configuration_error":
    case "agent_not_ready":
    case "local_quota_exceeded":
    case "request_exceeds_tpm_budget":
    case "dispatch_data_plane_missing":
      return "LOCAL_DISPATCH_FAILURE";
    default:
      break;
  }

  switch (input.reason) {
    case "thought_deadline":
      return "THOUGHT_DEADLINE_EXCEEDED";
    case "malformed":
      return "STRUCTURAL_RETRY_EXHAUSTED";
    case "cancelled":
      return "CANCELLED";
    case "context_allocation_required_overflow":
      return "LOCAL_DISPATCH_FAILURE";
    default:
      return "UNKNOWN";
  }
}

export function formatThoughtFailureNotice(input: {
  reason: string;
  failureCode?: string | null;
}): string {
  return `${THOUGHT_UNAVAILABLE_NOTICE} Error code: ${classifyThoughtFailureCode(input)}`;
}

export type EmitInfrastructureNoticeInput = {
  ownerId: string;
  channel: string;
  threadId: string;
  conversationId: string;
  cycleId?: string | null;
  generation?: Generation | null;
  reason: string;
  failureCode?: string | null;
  origin?: OutboxOrigin;
  trigger?: DeliveryIntent["trigger"];
  deliveryLane?: DeliveryIntent["deliveryLane"];
};

type Row = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntent(value: unknown): DeliveryIntent | null {
  try {
    const parsed = JSON.parse(text(value, "null")) as DeliveryIntent;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function mapNotice(row: unknown): SystemNoticeOutbox | null {
  if (typeof row !== "object" || row === null) return null;
  const value = row as Row;
  const intent = parseIntent(value.delivery_intent_json);
  if (!intent) return null;
  return {
    noticeId: number(value.notice_id),
    noticeKey: text(value.notice_key),
    projectionKey: text(value.projection_key),
    cycleId: value.cycle_id == null ? null : text(value.cycle_id),
    conversationId: text(value.conversation_id),
    deliveryIntent: intent,
    noticeText: text(value.notice_text),
    sendStatus: text(value.send_status) as SystemNoticeOutbox["sendStatus"],
    nuclearReservationId: value.nuclear_reservation_id == null ? null : number(value.nuclear_reservation_id),
    discordMessageId: value.discord_message_id == null ? null : text(value.discord_message_id),
    origin: text(value.origin) as OutboxOrigin,
  };
}

export function getSystemNotice(db: DatabaseSync, noticeId: number): SystemNoticeOutbox | null {
  return mapNotice(db.prepare("SELECT * FROM system_notice_outbox WHERE notice_id = ?").get(noticeId));
}

export function getSystemNoticeByKey(db: DatabaseSync, noticeKey: string): SystemNoticeOutbox | null {
  return mapNotice(db.prepare("SELECT * FROM system_notice_outbox WHERE notice_key = ?").get(noticeKey));
}

export function listSystemNotices(db: DatabaseSync, options: { limit?: number } = {}): SystemNoticeOutbox[] {
  const limit = Math.max(1, Math.min(1000, options.limit ?? 100));
  return db.prepare("SELECT * FROM system_notice_outbox ORDER BY notice_id ASC LIMIT ?")
    .all(limit).map(mapNotice).filter((row): row is SystemNoticeOutbox => row !== null);
}

function markLedgerUnavailable(db: DatabaseSync, input: EmitInfrastructureNoticeInput): void {
  if (!input.cycleId || input.generation == null) return;
  const defaults = {
    cycleId: input.cycleId,
    generation: input.generation,
    triggerKind: "owner_message",
    occupantId: input.ownerId,
    authorityEpoch: 1,
    settlementId: null,
    observationIds: [],
    effectIds: [],
    authorityCodes: [],
    nominationIds: [],
    outboxId: null,
    fidelity: "skipped",
    thoughtUnavailable: true,
    architectureEpoch: "v0.2.1",
  };
  const existing = db.prepare(
    "SELECT payload_json FROM causal_ledger WHERE cycle_id = ? AND generation = ? LIMIT 1",
  ).get(input.cycleId, input.generation) as Row | undefined;
  let prior: Row = {};
  if (existing && typeof existing.payload_json === "string") {
    try {
      const parsed = JSON.parse(existing.payload_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) prior = parsed as Row;
    } catch {
      // Preserve the typed unavailable marker even if an older payload is malformed.
    }
  }
  const payload = { ...defaults, ...prior, thoughtUnavailable: true };
  const update = db.prepare(
    "UPDATE causal_ledger SET thought_unavailable = 1, payload_json = ? WHERE cycle_id = ? AND generation = ?",
  ).run(JSON.stringify(payload), input.cycleId, input.generation);
  if (Number(update.changes) === 0) {
    db.prepare(
      `INSERT INTO causal_ledger (cycle_id, generation, payload_json, thought_unavailable)
       VALUES (?, ?, ?, 1)`,
    ).run(input.cycleId, input.generation, JSON.stringify(payload));
  }
}

export function emitInfrastructureNotice(
  db: DatabaseSync,
  input: EmitInfrastructureNoticeInput,
): SystemNoticeOutbox {
  const cycle = input.cycleId ?? "none";
  const generation = input.generation == null ? "none" : String(input.generation);
  const reason = input.reason.trim() || "unavailable";
  const noticeKey = `thought_failure:${input.conversationId}:${cycle}:${generation}:${reason}`;
  const existing = getSystemNoticeByKey(db, noticeKey);
  if (existing) return existing;

  const origin = input.origin ?? "live";
  const trigger = input.trigger ?? "owner_message_reactive";
  const deliveryLane = input.deliveryLane ?? (trigger === "owner_message_reactive" ? "reactive" : "proactive");
  const intent: DeliveryIntent = {
    ownerId: input.ownerId,
    channel: input.channel,
    threadId: input.threadId,
    conversationId: input.conversationId,
    trigger,
    deliveryLane,
    purpose: "system_notice",
  };
  const status = origin === "shadow" ? "suppressed_shadow" : "pending";
  const provisionalKey = `system:pending:${randomUUID()}`;
  const noticeText = formatThoughtFailureNotice({ reason, failureCode: input.failureCode });
  const inserted = db.prepare(
    `INSERT INTO system_notice_outbox
       (notice_key, projection_key, cycle_id, conversation_id, notice_text,
        send_status, nuclear_reservation_id, discord_message_id, origin, delivery_intent_json)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(
    noticeKey,
    provisionalKey,
    input.cycleId ?? null,
    input.conversationId,
    noticeText,
    status,
    origin,
    JSON.stringify(intent),
  );
  const noticeId = number(inserted.lastInsertRowid);
  db.prepare("UPDATE system_notice_outbox SET projection_key = ? WHERE notice_id = ?")
    .run(`system:${noticeId}`, noticeId);
  markLedgerUnavailable(db, input);
  const notice = getSystemNotice(db, noticeId);
  if (!notice) throw new Error("system_notice_insert_lost");
  return notice;
}

export function updateSystemNoticeStatus(
  db: DatabaseSync,
  noticeId: number,
  status: SystemNoticeOutbox["sendStatus"],
  options: { nuclearReservationId?: number | null; discordMessageId?: string | null } = {},
): SystemNoticeOutbox {
  const discordMessageIdClause = options.discordMessageId === undefined
    ? ""
    : ", discord_message_id = ?";
  const parameters: Array<string | number | null> = [
    status,
    options.nuclearReservationId ?? null,
  ];
  if (options.discordMessageId !== undefined) {
    parameters.push(options.discordMessageId);
  }
  parameters.push(noticeId);
  db.prepare(
    `UPDATE system_notice_outbox
     SET send_status = ?,
         nuclear_reservation_id = COALESCE(?, nuclear_reservation_id)${discordMessageIdClause}
     WHERE notice_id = ?`,
  ).run(...parameters);
  const notice = getSystemNotice(db, noticeId);
  if (!notice) throw new Error("system_notice_missing");
  return notice;
}
