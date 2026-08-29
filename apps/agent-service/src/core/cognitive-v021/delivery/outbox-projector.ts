import type { DatabaseSync } from "node:sqlite";
import { planContentBubbles } from "../../delivery/bubble-plan.js";
import {
  getDeliveryReservation,
  listDeliveryBubbles,
} from "../../delivery/store.js";
import {
  appendAshleyEvidence,
  appendSystemEvent,
} from "../evidence/conversation-log.js";
import {
  getSpeechOutbox,
  updateOutboxStatus,
} from "../speech/outbox.js";
import {
  getSystemNotice,
  updateSystemNoticeStatus,
} from "../speech/infrastructure-notice.js";
import type {
  DeliveryIntent,
  OutboxDeliveryProjector as OutboxDeliveryProjectorContract,
  OutboxSendStatus,
  SpeechOutboxRow,
  SystemNoticeOutbox,
} from "../types.js";

export type ProjectionGate = (intent: DeliveryIntent) => { ok: true } | { ok: false; reason: string };

export type OutboxDeliveryProjectorOptions = {
  nowMs?: () => number;
  gate?: ProjectionGate;
  isCurrentGeneration?: (row: SpeechOutboxRow | SystemNoticeOutbox) => boolean;
  leaseMs?: number;
};

type Row = Record<string, unknown>;

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isTerminal(status: OutboxSendStatus): boolean {
  return status === "delivered" || status === "partially_delivered" || status === "send_failure" || status === "suppressed" || status === "suppressed_shadow";
}

function intentTrigger(intent: DeliveryIntent): "reactive" | "proactive" {
  return intent.deliveryLane === "proactive" ? "proactive" : "reactive";
}

function projectionReservation(db: DatabaseSync, key: string): Row | undefined {
  return db.prepare("SELECT * FROM delivery_reservations WHERE cognitive_v021_projection_key = ? LIMIT 1").get(key) as Row | undefined;
}

function markTerminalFromDestination(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  row: SpeechOutboxRow | SystemNoticeOutbox,
  destination: Row,
): void {
  const state = text(destination.state);
  const reservationId = number(destination.id);
  if (state === "committed") {
    if ("outboxId" in row) {
      const ids = nuclear.prepare("SELECT discord_message_id FROM delivery_bubbles WHERE reservation_id = ? AND discord_message_id IS NOT NULL ORDER BY ordinal").all(reservationId)
        .map((item) => text((item as Row).discord_message_id));
      updateOutboxStatus(sidecar, row.outboxId, "delivered", { discordMessageIds: ids, nuclearReservationId: reservationId });
    } else {
      const id = destination.discord_message_id == null ? null : text(destination.discord_message_id);
      updateSystemNoticeStatus(sidecar, row.noticeId, "delivered", { discordMessageId: id, nuclearReservationId: reservationId });
    }
  } else if (["aborted", "cancelled", "expired"].includes(state)) {
    const status: OutboxSendStatus = state === "cancelled" ? "suppressed" : "send_failure";
    if ("outboxId" in row) updateOutboxStatus(sidecar, row.outboxId, status, { nuclearReservationId: reservationId, finalizationReason: text(destination.finalization_reason) || null });
    else updateSystemNoticeStatus(sidecar, row.noticeId, status, { nuclearReservationId: reservationId });
  } else if (state === "partially_delivered") {
    if ("outboxId" in row) updateOutboxStatus(sidecar, row.outboxId, "partially_delivered", { nuclearReservationId: reservationId, finalizationReason: text(destination.finalization_reason) || null });
    else updateSystemNoticeStatus(sidecar, row.noticeId, "partially_delivered", { nuclearReservationId: reservationId });
  } else if (state === "sending") {
    if ("outboxId" in row) updateOutboxStatus(sidecar, row.outboxId, "sending", { nuclearReservationId: reservationId });
    else updateSystemNoticeStatus(sidecar, row.noticeId, "sending", { nuclearReservationId: reservationId });
  } else if ("outboxId" in row) {
    updateOutboxStatus(sidecar, row.outboxId, "projected", { nuclearReservationId: reservationId, finalizationReason: null });
  } else {
    updateSystemNoticeStatus(sidecar, row.noticeId, "projected", { nuclearReservationId: reservationId });
  }
}

function projectedRow(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  reservationId: number,
): SpeechOutboxRow | SystemNoticeOutbox | null {
  const destination = nuclear.prepare(
    "SELECT cognitive_v021_projection_key FROM delivery_reservations WHERE id = ?",
  ).get(reservationId) as Row | undefined;
  const key = text(destination?.cognitive_v021_projection_key);
  if (key.startsWith("speech:")) {
    const id = Number(key.slice("speech:".length));
    return Number.isFinite(id) ? getSpeechOutbox(sidecar, id) : null;
  }
  if (key.startsWith("system:")) {
    const id = Number(key.slice("system:".length));
    return Number.isFinite(id) ? getSystemNotice(sidecar, id) : null;
  }
  return null;
}

function markDeliveredEvidence(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  reservationId: number,
  row: SpeechOutboxRow | SystemNoticeOutbox,
): void {
  const destination = getDeliveryReservation(nuclear, reservationId);
  if (
    !destination ||
    (destination.state !== "committed" && destination.state !== "partially_delivered")
  ) return;
  const delivered = listDeliveryBubbles(nuclear, reservationId)
    .filter((bubble) => bubble.discordMessageId);
  if (delivered.length === 0) return;
  const role = "outboxId" in row ? "ashley" : "system";
  const existing = sidecar.prepare(
    `SELECT row_id FROM conversation_evidence_log
      WHERE reservation_id = ? AND role = ? LIMIT 1`,
  ).get(reservationId, role);
  if (existing) return;
  const input = {
    conversationId: row.conversationId,
    text: delivered.map((bubble) => bubble.text).join("\n\n"),
    discordMessageIds: delivered.map((bubble) => bubble.discordMessageId!),
    reservationId,
    producingCycleId: row.cycleId,
    delivered: true,
    dataClassification: "never_public" as const,
  };
  if ("outboxId" in row) appendAshleyEvidence(sidecar, input);
  else appendSystemEvent(sidecar, input);
}

/** Mark a claimed nuclear projection as sending in its source sidecar. */
export function markProjectedDeliverySending(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  reservationId: number,
): boolean {
  const row = projectedRow(sidecar, nuclear, reservationId);
  if (!row) return false;
  if ("outboxId" in row) {
    updateOutboxStatus(sidecar, row.outboxId, "sending", {
      nuclearReservationId: reservationId,
    });
  } else {
    updateSystemNoticeStatus(sidecar, row.noticeId, "sending", {
      nuclearReservationId: reservationId,
    });
  }
  return true;
}

/** Reconcile nuclear receipt/finalization truth back to the v0.2.1 outbox. */
export function reconcileProjectedDelivery(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  reservationId: number,
): boolean {
  const row = projectedRow(sidecar, nuclear, reservationId);
  if (!row) return false;
  const destination = nuclear.prepare(
    "SELECT * FROM delivery_reservations WHERE id = ?",
  ).get(reservationId) as Row | undefined;
  if (!destination) return false;
  markTerminalFromDestination(sidecar, nuclear, row, destination);
  markDeliveredEvidence(sidecar, nuclear, reservationId, row);
  return true;
}

function shouldProject(
  row: SpeechOutboxRow | SystemNoticeOutbox,
  options: OutboxDeliveryProjectorOptions,
): { ok: true } | { ok: false; status?: "pending" | "suppressed"; reason: string } {
  if (isTerminal(row.sendStatus)) return { ok: false, reason: "terminal" };
  if (row.origin === "shadow" || row.sendStatus === "suppressed_shadow") return { ok: false, status: "suppressed", reason: "shadow" };
  if (options.isCurrentGeneration && !options.isCurrentGeneration(row)) return { ok: false, status: "suppressed", reason: "superseded_generation" };
  if (options.gate) {
    const gate = options.gate(row.deliveryIntent);
    if (!gate.ok) {
      if (gate.reason === "daily_cap") return { ok: false, status: "pending", reason: gate.reason };
      return { ok: false, status: "suppressed", reason: gate.reason };
    }
  }
  return { ok: true };
}

export class OutboxDeliveryProjector implements OutboxDeliveryProjectorContract {
  constructor(
    private readonly sidecar: DatabaseSync,
    private readonly nuclear: DatabaseSync,
    private readonly options: OutboxDeliveryProjectorOptions = {},
  ) {}

  private reserve(row: SpeechOutboxRow | SystemNoticeOutbox, textValue: string): number {
    const key = row.projectionKey;
    const existing = projectionReservation(this.nuclear, key);
    if (existing) {
      markTerminalFromDestination(this.sidecar, this.nuclear, row, existing);
      return number(existing.id);
    }

    const now = this.options.nowMs?.() ?? Date.now();
    const nowIso = new Date(now).toISOString();
    const leaseIso = new Date(now + (this.options.leaseMs ?? 120_000)).toISOString();
    const bubbles = planContentBubbles(textValue);
    this.nuclear.exec("BEGIN IMMEDIATE");
    try {
      const result = this.nuclear.prepare(
        `INSERT INTO delivery_reservations
           (owner_id, channel, thread_id, user_message_id, decision_id, trigger,
            delivery_lane, initiative_reservation_id, state, error_category, finalization_reason,
            draft_text, first_bubble_deadline_at, first_sent_at,
            generation_lease_expires_at, delivery_lease_expires_at,
            created_at, finalized_at, cognitive_v021_projection_key)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL, 'reserved', NULL, NULL,
                 ?, NULL, NULL, NULL, ?, ?, NULL, ?)`,
      ).run(
        row.deliveryIntent.ownerId,
        row.deliveryIntent.channel,
        row.deliveryIntent.threadId,
        intentTrigger(row.deliveryIntent),
        row.deliveryIntent.deliveryLane,
        textValue,
        leaseIso,
        nowIso,
        key,
      );
      const reservationId = number(result.lastInsertRowid);
      const insertBubble = this.nuclear.prepare(
        `INSERT INTO delivery_bubbles
           (reservation_id, ordinal, text, discord_message_id, sent_at)
         VALUES (?, ?, ?, NULL, NULL)`,
      );
      for (const bubble of bubbles) insertBubble.run(reservationId, bubble.ordinal, bubble.text);
      this.nuclear.exec("COMMIT");
      return reservationId;
    } catch (error) {
      try { this.nuclear.exec("ROLLBACK"); } catch { /* preserve insert error */ }
      const reconciled = projectionReservation(this.nuclear, key);
      if (reconciled) {
        markTerminalFromDestination(this.sidecar, this.nuclear, row, reconciled);
        return number(reconciled.id);
      }
      throw error;
    }
  }

  private async projectRow(row: SpeechOutboxRow | SystemNoticeOutbox): Promise<void> {
    const decision = shouldProject(row, this.options);
    if (!decision.ok) {
      if (decision.status === "suppressed") {
        if ("outboxId" in row) updateOutboxStatus(this.sidecar, row.outboxId, "suppressed", { finalizationReason: decision.reason });
        else updateSystemNoticeStatus(this.sidecar, row.noticeId, "suppressed");
      }
      return;
    }
    if ("outboxId" in row) updateOutboxStatus(this.sidecar, row.outboxId, "projecting");
    else updateSystemNoticeStatus(this.sidecar, row.noticeId, "projecting");
    const reservationId = this.reserve(row, "outboxId" in row ? row.licensedText : row.noticeText);
    const destination = projectionReservation(this.nuclear, row.projectionKey);
    if (destination) {
      markTerminalFromDestination(this.sidecar, this.nuclear, row, destination);
    } else if ("outboxId" in row) {
      updateOutboxStatus(this.sidecar, row.outboxId, "projected", { nuclearReservationId: reservationId, finalizationReason: null });
    } else {
      updateSystemNoticeStatus(this.sidecar, row.noticeId, "projected", { nuclearReservationId: reservationId });
    }
  }

  async project(outboxId: number): Promise<void> {
    const row = getSpeechOutbox(this.sidecar, outboxId);
    if (!row) throw new Error("speech_outbox_missing");
    await this.projectRow(row);
  }

  async projectSystem(noticeId: number): Promise<void> {
    const row = getSystemNotice(this.sidecar, noticeId);
    if (!row) throw new Error("system_notice_missing");
    await this.projectRow(row);
  }
}

export function createOutboxProjector(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  options: OutboxDeliveryProjectorOptions = {},
): OutboxDeliveryProjector {
  return new OutboxDeliveryProjector(sidecar, nuclear, options);
}
