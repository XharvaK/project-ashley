import type { DatabaseSync } from "node:sqlite";
import type {
  Decision,
  Motivation,
  MotivationKind,
  ReflectionMode,
} from "../types.js";
import {
  getReflectionEvent,
  insertReflectionEvent,
  listEvidenceWindow,
  listInitiativeLearning,
  listPendingSubjects,
  listReflectionEvents,
  markPendingSubjectApplied,
  saveInitiativeLearning,
  type ClassifiedSignal,
  type ReflectionEvent,
} from "./store.js";

const CLASSIFIER_VERSION = 1;
const EVIDENCE_WINDOW = 20;
const PROACTIVE_KINDS = new Set<MotivationKind>([
  "question",
  "fact",
  "callback",
  "opinion",
  "take",
  "unfinished",
  "identity",
  "availability",
]);

type DbRow = Record<string, unknown>;

function isRow(value: unknown): value is DbRow {
  return typeof value === "object" && value !== null;
}

function normalizeEmoji(emoji: string): string {
  return emoji.replace(/\uFE0F/g, "");
}

function classifySignal(emoji: string): ClassifiedSignal {
  const normalized = normalizeEmoji(emoji);
  if (normalized === "\u{1F44D}") return "positive";
  if (normalized === "\u{1F44E}") return "negative";
  return "neutral";
}

function parseMotivationIds(value: unknown): number[] {
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

function asMotivationKind(value: unknown): MotivationKind | null {
  if (typeof value !== "string") return null;
  return PROACTIVE_KINDS.has(value as MotivationKind)
    ? (value as MotivationKind)
    : null;
}

export function calculateInitiativeAdjustment(
  positiveCount: number,
  negativeCount: number,
): number {
  const net = positiveCount - negativeCount;
  if (Math.abs(net) < 2) return 0;
  return Math.max(-8, Math.min(8, Math.sign(net) * 2 * (Math.abs(net) - 1)));
}

export function processPendingReflectionEvents(
  db: DatabaseSync,
  ownerId?: string,
): void {
  for (const subject of listPendingSubjects(db, ownerId)) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const events = listEvidenceWindow(
        db,
        subject.ownerId,
        subject.motivationKind,
        EVIDENCE_WINDOW,
      );
      const positiveCount = events.filter(
        (event) => event.classifiedSignal === "positive",
      ).length;
      const negativeCount = events.filter(
        (event) => event.classifiedSignal === "negative",
      ).length;
      const processedAt = new Date().toISOString();
      saveInitiativeLearning(db, {
        ownerId: subject.ownerId,
        motivationKind: subject.motivationKind,
        positiveCount,
        negativeCount,
        adjustment: calculateInitiativeAdjustment(
          positiveCount,
          negativeCount,
        ),
        windowSize: events.length,
        lastEventId: events[0]?.id ?? null,
        updatedAt: processedAt,
      });
      markPendingSubjectApplied(
        db,
        subject.ownerId,
        subject.motivationKind,
        processedAt,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function recordInitiativeReaction(
  db: DatabaseSync,
  ownerId: string,
  input: { messageId: string; emoji: string },
): { matchedInitiative: boolean; event: ReflectionEvent | null } {
  const reservation = db
    .prepare(
      `SELECT r.id AS reservation_id, r.decision_id,
              d.trigger, d.motivation_ids_json
       FROM initiative_reservations r
       JOIN decision_log d ON d.id = r.decision_id
       WHERE r.owner_id = ? AND r.discord_message_id = ?
         AND r.committed_at IS NOT NULL
       LIMIT 1`,
    )
    .get(ownerId, input.messageId);
  if (!isRow(reservation)) {
    return { matchedInitiative: false, event: null };
  }

  const classifiedSignal = classifySignal(input.emoji);
  const motivationIds = parseMotivationIds(reservation.motivation_ids_json);
  const motivationId = motivationIds.length === 1 ? motivationIds[0]! : null;
  const motivation =
    motivationId === null
      ? null
      : db
          .prepare(
            `SELECT kind
             FROM motivations
             WHERE id = ? AND owner_id = ?`,
          )
          .get(motivationId, ownerId);
  const subjectKind = isRow(motivation)
    ? asMotivationKind(motivation.kind)
    : null;

  let reason = "eligible";
  if (classifiedSignal === "neutral") reason = "unsupported_signal";
  else if (reservation.trigger !== "proactive") reason = "non_proactive_decision";
  else if (motivationIds.length !== 1) reason = "ambiguous_decision_motivations";
  else if (!subjectKind) reason = "missing_or_ineligible_motivation";

  const eligible = reason === "eligible";
  const createdAt = new Date().toISOString();
  const event = insertReflectionEvent(db, {
    ownerId,
    kind: "initiative_reaction",
    sourceKey: `discord_reaction:${ownerId}:${input.messageId}:${normalizeEmoji(input.emoji)}`,
    decisionId:
      typeof reservation.decision_id === "number"
        ? reservation.decision_id
        : Number(reservation.decision_id),
    reservationId:
      typeof reservation.reservation_id === "number"
        ? reservation.reservation_id
        : Number(reservation.reservation_id),
    discordMessageId: input.messageId,
    subjectKind,
    rawSignal: input.emoji,
    classifiedSignal,
    classifierVersion: CLASSIFIER_VERSION,
    status: eligible ? "pending" : "ignored",
    reason,
    detailJson: JSON.stringify({ motivationId }),
    createdAt,
    processedAt: eligible ? null : createdAt,
  });
  if (event.status === "pending") {
    processPendingReflectionEvents(db, ownerId);
  }
  return {
    matchedInitiative: true,
    event: getReflectionEvent(db, event.id),
  };
}

export function applyInitiativeLearning(
  db: DatabaseSync,
  ownerId: string,
  motivations: Motivation[],
  mode: ReflectionMode,
): Motivation[] {
  const learning = new Map(
    listInitiativeLearning(db, ownerId).map((row) => [
      row.motivationKind,
      row,
    ]),
  );
  return motivations.map((motivation) => {
    const learned = learning.get(motivation.kind);
    if (!learned || learned.lastEventId === null) return motivation;
    const adjustment = mode === "apply" ? learned.adjustment : 0;
    return {
      ...motivation,
      baseScore: motivation.score,
      score: Math.max(0, motivation.score + adjustment),
      learningAdjustment: adjustment,
      learningThroughEventId: learned.lastEventId,
    };
  });
}

export function attachLearningSnapshot(
  decision: Decision,
  motivations: Motivation[],
): Decision {
  if (decision.trigger !== "proactive" || decision.motivationIds.length !== 1) {
    return decision;
  }
  const selected = motivations.find(
    (motivation) => motivation.id === decision.motivationIds[0],
  );
  if (
    !selected ||
    selected.learningAdjustment === undefined ||
    selected.learningThroughEventId === undefined
  ) {
    return decision;
  }
  return {
    ...decision,
    learning: {
      subjectKind: selected.kind,
      adjustment: selected.learningAdjustment,
      throughEventId: selected.learningThroughEventId,
    },
  };
}

export function getReflectionOverview(
  db: DatabaseSync,
  ownerId: string,
  mode: ReflectionMode,
  limit = 20,
): {
  mode: ReflectionMode;
  events: ReflectionEvent[];
  learning: ReturnType<typeof listInitiativeLearning>;
} {
  return {
    mode,
    events: listReflectionEvents(db, ownerId, limit),
    learning: listInitiativeLearning(db, ownerId),
  };
}
