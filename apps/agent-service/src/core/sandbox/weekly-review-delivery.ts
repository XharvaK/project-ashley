/**
 * Weekly self-improvement review delivery (real ledgered path).
 *
 * The weekly review used to stop at a filesystem artifact. This module routes
 * it through the same ledgered delivery machinery the nuclear proactive tick
 * uses (decision_log -> initiative_reservations -> delivery_reservations ->
 * delivery_bubbles), so the discord-bot's scheduler can drain it with the same
 * sendBubbles + receipt + finalize flow as any proactive reach-out.
 *
 * The claim is idempotent per reportRef (material_key unique), so a restarted
 * agent never double-claims a review. The bot only drains reviews whose
 * material_key carries the `weekly-review:` prefix, so it can never race the
 * normal proactive tick.
 */

import type { DatabaseSync } from "node:sqlite";
import { claimProactiveDeliveryInTransaction } from "../delivery/store.js";
import { listDeliveryBubbles } from "../delivery/store.js";
import { getDeliveryReservation } from "../delivery/store.js";
import type { CandidateCommitRecord } from "./self-improvement.js";

export const WEEKLY_REVIEW_MATERIAL_PREFIX = "weekly-review:";

/** One Discord bubble must stay far below the platform ceiling. */
const MAX_BUBBLE_CHARS = 1800;

export function reviewSummaryText(review: {
  reportRef: string;
  candidate: CandidateCommitRecord;
}): string {
  const candidate = review.candidate;
  const lines = [
    `Weekly self-improvement review — ${candidate.title}`,
    "",
    `Why it matters: ${candidate.whyImportant}`,
    `Problem: ${candidate.problem}`,
    `Files changed: ${candidate.filesChanged.join(", ")}`,
    `Diff stat: ${candidate.diffStat}`,
    `Tests run: ${candidate.testsRun.join(", ")}`,
    `Test results: ${candidate.testResults}`,
    `Security impact: ${candidate.securityImpact}`,
    `Known limitations: ${candidate.knownLimitations}`,
    `Remaining uncertainty: ${candidate.remainingUncertainty}`,
    `Owner review focus: ${candidate.ownerReviewFocus}`,
    `Report ref: ${review.reportRef}`,
  ];
  return lines.join("\n");
}

export function buildWeeklyReviewBubbles(text: string): Array<{
  ordinal: number;
  text: string;
}> {
  if (text.length === 0) return [{ ordinal: 0, text }];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_BUBBLE_CHARS) {
    const window = remaining.slice(0, MAX_BUBBLE_CHARS);
    let cut = window.lastIndexOf("\n");
    if (cut <= 0) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = MAX_BUBBLE_CHARS;
    chunks.push(window.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks.map((text, ordinal) => ({ ordinal, text }));
}

export type WeeklyReviewClaim = {
  deliveryReservationId: number;
  initiativeReservationId: number;
  decisionId: number;
};

/**
 * Claim a ledgered weekly review delivery. Returns null when the review was
 * already claimed (idempotent by material_key) or when any write-back guard
 * refuses the claim.
 */
export function claimWeeklyReviewDelivery(
  db: DatabaseSync,
  input: {
    ownerId: string;
    reportRef: string;
    candidate: CandidateCommitRecord;
    threadId?: string;
    nowMs?: number;
  },
): WeeklyReviewClaim | null {
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const materialKey = `${WEEKLY_REVIEW_MATERIAL_PREFIX}${input.reportRef}`;
  const existing = db
    .prepare(
      `SELECT id FROM initiative_reservations
       WHERE owner_id = ? AND material_key = ?`,
    )
    .get(input.ownerId, materialKey);
  if (existing !== undefined) return null;

  const text = reviewSummaryText(input);
  const bubbles = buildWeeklyReviewBubbles(text);

  db.exec("BEGIN IMMEDIATE");
  try {
    const decisionResult = db
      .prepare(
        `INSERT INTO decision_log
           (owner_id, channel, trigger, decision_kind, motivation_ids_json,
            reason, created_at)
         VALUES (?, 'discord', 'proactive', 'share', '[]', ?, ?)`,
      )
      .run(input.ownerId, "weekly self-improvement review due", nowIso);
    const decisionId = Number(decisionResult.lastInsertRowid);

    const reservationResult = db
      .prepare(
        `INSERT INTO initiative_reservations
           (owner_id, decision_id, text, thread_id, angle, reason, material_key,
            created_at)
         VALUES (?, ?, ?, ?, 'share', 'weekly self-improvement review', ?, ?)`,
      )
      .run(
        input.ownerId,
        decisionId,
        text,
        input.threadId ?? "dm",
        materialKey,
        nowIso,
      );
    const initiativeReservationId = Number(reservationResult.lastInsertRowid);

    const delivery = claimProactiveDeliveryInTransaction(db, {
      ownerId: input.ownerId,
      channel: "discord",
      threadId: input.threadId ?? "dm",
      initiativeReservationId,
      decisionId,
      draftText: text,
      bubbles,
      nowMs,
    });
    db.exec("COMMIT");
    return {
      deliveryReservationId: delivery.id,
      initiativeReservationId,
      decisionId,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type PendingWeeklyReviewDelivery = {
  reservationId: number;
  draftText: string;
  bubbles: Array<{ ordinal: number; text: string; discordMessageId: string | null }>;
  statusUrl: string;
};

/**
 * Reserved weekly-review delivery reservations awaiting the discord-bot drain.
 * Scoped to material_key prefix so the drain can never touch a normal
 * proactive reservation the tick is sending itself.
 */
export function listPendingWeeklyReviewDeliveries(
  db: DatabaseSync,
  ownerId: string,
): PendingWeeklyReviewDelivery[] {
  const rows = db
    .prepare(
      `SELECT d.id
         FROM delivery_reservations d
         JOIN initiative_reservations i ON i.id = d.initiative_reservation_id
        WHERE d.owner_id = ?
          AND d.trigger = 'proactive'
          AND d.state = 'reserved'
          AND i.material_key LIKE ?||'%'
        ORDER BY d.id ASC`,
    )
    .all(ownerId, WEEKLY_REVIEW_MATERIAL_PREFIX);
  const result: PendingWeeklyReviewDelivery[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const reservationId = Number((row as { id?: unknown }).id);
    if (!Number.isFinite(reservationId)) continue;
    const reservation = getDeliveryReservation(db, reservationId);
    if (!reservation || reservation.state !== "reserved") continue;
    result.push({
      reservationId,
      draftText: reservation.draftText ?? "",
      bubbles: listDeliveryBubbles(db, reservationId),
      statusUrl: `/delivery/${reservationId}`,
    });
  }
  return result;
}

/**
 * Atomically checks out pending weekly review deliveries in a transaction.
 * Transitions reserved -> sending, setting delivery_lease_expires_at.
 * first_sent_at remains NULL (Claimed != Sent).
 */
export function claimPendingWeeklyReviewDeliveries(
  db: DatabaseSync,
  input: {
    ownerId: string;
    leaseMs?: number;
    nowMs?: number;
  },
): PendingWeeklyReviewDelivery[] {
  const nowMs = input.nowMs ?? Date.now();
  const leaseMs = input.leaseMs ?? 120_000;
  const leaseExpiresAt = new Date(nowMs + leaseMs).toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    const rows = db
      .prepare(
        `SELECT d.id
           FROM delivery_reservations d
           JOIN initiative_reservations i ON i.id = d.initiative_reservation_id
          WHERE d.owner_id = ?
            AND d.trigger = 'proactive'
            AND d.state = 'reserved'
            AND i.material_key LIKE ?||'%'
          ORDER BY d.id ASC`,
      )
      .all(input.ownerId, WEEKLY_REVIEW_MATERIAL_PREFIX);

    const claimed: PendingWeeklyReviewDelivery[] = [];
    const updateStmt = db.prepare(
      `UPDATE delivery_reservations
          SET state = 'sending',
              delivery_lease_expires_at = ?
        WHERE id = ?
          AND state = 'reserved'`,
    );

    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const reservationId = Number((row as { id?: unknown }).id);
      if (!Number.isFinite(reservationId)) continue;
      const updateResult = updateStmt.run(leaseExpiresAt, reservationId);
      if (updateResult.changes === 1) {
        const reservation = getDeliveryReservation(db, reservationId);
        if (reservation && reservation.state === "sending") {
          claimed.push({
            reservationId,
            draftText: reservation.draftText ?? "",
            bubbles: listDeliveryBubbles(db, reservationId),
            statusUrl: `/delivery/${reservationId}`,
          });
        }
      }
    }

    db.exec("COMMIT");
    return claimed;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  }
}

