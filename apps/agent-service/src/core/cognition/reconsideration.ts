import type { DatabaseSync } from "node:sqlite";
import type {
  Decision,
  DecisionDelayClass,
  EvidenceRef,
} from "../types.js";
import {
  getOpenCognitiveItem,
  listOpenCognitiveItems,
  openCognitiveItemSourceEligibleForInfluence,
  type OpenCognitiveItemRecord,
} from "./open-items.js";

/** Fixed host-owned durations. Model output cannot supply a timestamp. */
export const OPEN_COGNITIVE_ITEM_DELAY_DURATIONS_MS = {
  brief: 15 * 60_000,
  standard: 24 * 60 * 60_000,
  long: 7 * 24 * 60 * 60_000,
  reflection_review: 24 * 60 * 60_000,
} as const satisfies Record<DecisionDelayClass, number>;

/** Typed policy constant, not an environment variable or semantic score. */
export const OPEN_COGNITIVE_ITEM_CONSIDERATION_REVIEW_THRESHOLD = 3;
const MAX_REVIEW_REQUESTS = 8;
const MAX_RESOLUTION_EVIDENCE_REFS = 4;

export type OpenCognitiveItemDecisionResult = {
  updated: number;
  skipped: number;
  reviewRequested: number;
};

export type OpenCognitiveItemTransitionAction =
  | "keep_open"
  | "resolve"
  | "withdraw"
  | "supersede";

export type OpenCognitiveItemTransitionInput = {
  ownerId: string;
  entityUuid: string;
  action: OpenCognitiveItemTransitionAction;
  reason: string;
  evidenceRefs?: EvidenceRef[];
  replacementEntityUuid?: string;
  now?: Date;
  /** The caller already owns a BEGIN IMMEDIATE transaction. */
  inTransaction?: boolean;
};

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDelayClass(value: unknown): value is DecisionDelayClass {
  return (
    value === "brief" ||
    value === "standard" ||
    value === "long" ||
    value === "reflection_review"
  );
}

function boundedCode(value: string, errorCode: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_:-]{0,127}$/.test(normalized)) {
    throw new Error(errorCode);
  }
  return normalized;
}

function numericEvidenceId(value: string | number): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function withTransaction<T>(
  db: DatabaseSync,
  inTransaction: boolean,
  callback: () => T,
): T {
  if (inTransaction) return callback();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function ensureAttentionRow(
  db: DatabaseSync,
  item: OpenCognitiveItemRecord,
  nowIso: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO open_cognitive_item_attention
       (item_id, delay_class, defer_until, last_considered_at,
        consideration_count, last_outcome_code, review_requested_at, updated_at)
     VALUES (?, 'none', NULL, NULL, 0, NULL, NULL, ?)`,
  ).run(item.id, nowIso);
}

function ociEvidenceRefs(decision: Decision): string[] {
  return Array.from(
    new Set(
      decision.evidenceRefs.flatMap((ref) =>
        ref.type === "open_cognitive_item" && typeof ref.id === "string"
          ? [ref.id]
          : [],
      ),
    ),
  );
}

/**
 * Persist the semantic result of one proactive consideration for every OCI
 * selected by the Decision. Delivery is intentionally not involved.
 */
export function recordOpenCognitiveDecision(
  db: DatabaseSync,
  input: {
    ownerId: string;
    decision: Decision;
    now?: Date;
    inTransaction?: boolean;
  },
): OpenCognitiveItemDecisionResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const delayClass = input.decision.delayClass;
  if (input.decision.kind === "delay" && !isDelayClass(delayClass)) {
    throw new Error("oci_delay_class_invalid");
  }
  const effectiveDelayClass =
    input.decision.kind === "delay" ? delayClass! : null;

  return withTransaction(
    db,
    input.inTransaction === true,
    () => {
      let updated = 0;
      let skipped = 0;
      let reviewRequested = 0;
      for (const entityUuid of ociEvidenceRefs(input.decision)) {
        const item = getOpenCognitiveItem(db, input.ownerId, entityUuid);
        if (!item || !openCognitiveItemSourceEligibleForInfluence(db, item)) {
          skipped += 1;
          continue;
        }
        ensureAttentionRow(db, item, nowIso);
        const current = getOpenCognitiveItem(db, input.ownerId, entityUuid);
        if (!current?.attention) {
          skipped += 1;
          continue;
        }
        const considerationCount = current.attention.considerationCount + 1;
        const shouldRequestReview =
            current.attention.reviewRequestedAt == null &&
            (considerationCount >= OPEN_COGNITIVE_ITEM_CONSIDERATION_REVIEW_THRESHOLD ||
            effectiveDelayClass === "reflection_review");
        const reviewRequestedAt = shouldRequestReview
          ? nowIso
          : current.attention.reviewRequestedAt;
        const outcomeCode =
          input.decision.kind === "delay"
            ? `delay:${effectiveDelayClass}`
            : `decision:${input.decision.kind}`;
        const delayDurationMs =
          effectiveDelayClass === null
            ? 0
            : OPEN_COGNITIVE_ITEM_DELAY_DURATIONS_MS[effectiveDelayClass];
        const deferUntil =
          input.decision.kind === "delay"
            ? new Date(
                now.getTime() + delayDurationMs,
              ).toISOString()
            : null;
        const delayClassValue =
          input.decision.kind === "delay" ? effectiveDelayClass : "none";
        const result = db
          .prepare(
            `UPDATE open_cognitive_item_attention
             SET delay_class = ?, defer_until = ?, last_considered_at = ?,
                 consideration_count = ?, last_outcome_code = ?,
                 review_requested_at = ?, updated_at = ?
             WHERE item_id = ?`,
          )
          .run(
            delayClassValue,
            deferUntil,
            nowIso,
            considerationCount,
            outcomeCode,
            reviewRequestedAt,
            nowIso,
            current.id,
          );
        if (Number(result.changes) !== 1) {
          skipped += 1;
          continue;
        }
        updated += 1;
        if (shouldRequestReview) {
          reviewRequested += 1;
          db.prepare(
            `INSERT INTO open_cognitive_item_transitions
               (item_id, owner_id, from_status, to_status, reason, created_at)
             VALUES (?, ?, 'OPEN', 'OPEN', 'reflection_review_requested', ?)`,
          ).run(current.id, input.ownerId, nowIso);
        }
      }
      return { updated, skipped, reviewRequested };
    },
  );
}

export function listOpenCognitiveItemReviewRequests(
  db: DatabaseSync,
  ownerId: string,
  limit = MAX_REVIEW_REQUESTS,
): OpenCognitiveItemRecord[] {
  return listOpenCognitiveItems(db, ownerId, { status: "OPEN" })
    .filter((item) => item.attention?.reviewRequestedAt != null)
    .slice(0, Math.max(1, Math.min(MAX_REVIEW_REQUESTS, limit)));
}

function currentEvidenceRef(
  db: DatabaseSync,
  ownerId: string,
  ref: EvidenceRef,
): boolean {
  const id = numericEvidenceId(ref.id);
  if (id === null) return false;
  switch (ref.type) {
    case "message":
      return (
        db
          .prepare(
            `SELECT 1 FROM mem_messages
             WHERE id = ? AND owner_id = ? AND redacted_at IS NULL`,
          )
          .get(id, ownerId) !== undefined
      );
    case "episode":
      return (
        db
          .prepare(
            `SELECT 1 FROM episodes
             WHERE id = ? AND owner_id = ? AND status = 'active'
               AND provenance = 'live'`,
          )
          .get(id, ownerId) !== undefined
      );
    case "fact":
      return (
        db
          .prepare(
            `SELECT 1 FROM mem_facts
             WHERE id = ? AND owner_id = ? AND superseded_by IS NULL`,
          )
          .get(id, ownerId) !== undefined
      );
    case "question":
      return (
        db
          .prepare(
            `SELECT 1 FROM questions
             WHERE id = ? AND owner_id = ?
               AND status IN ('open', 'pursuing')
               AND redacted_at IS NULL`,
          )
          .get(id, ownerId) !== undefined
      );
    case "opinion":
      return (
        db
          .prepare(
            `SELECT 1 FROM opinions current
             WHERE current.id = ? AND current.owner_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM opinions newer
                 WHERE newer.owner_id = current.owner_id
                   AND newer.topic = current.topic
                   AND newer.id > current.id
               )`,
          )
          .get(id, ownerId) !== undefined
      );
    case "mind_state":
      return (
        db
          .prepare(
            `SELECT 1 FROM mind_state_items
             WHERE id = ? AND owner_id = ? AND status = 'active'`,
          )
          .get(id, ownerId) !== undefined
      );
    default:
      return false;
  }
}

function validateResolutionEvidence(
  db: DatabaseSync,
  ownerId: string,
  item: OpenCognitiveItemRecord,
  refs: EvidenceRef[],
): void {
  if (refs.length === 0 || refs.length > MAX_RESOLUTION_EVIDENCE_REFS) {
    throw new Error("oci_grounded_evidence_required");
  }
  const unique = new Set(refs.map((ref) => `${ref.type}:${String(ref.id)}`));
  if (unique.size !== refs.length || refs.some((ref) => ref.type === "open_cognitive_item")) {
    throw new Error("oci_resolution_evidence_invalid");
  }
  if (!refs.every((ref) => currentEvidenceRef(db, ownerId, ref))) {
    throw new Error("oci_resolution_evidence_unavailable");
  }
  if (item.sourceType === "question" && !refs.some((ref) => ref.type === "message" || ref.type === "episode" || ref.type === "fact")) {
    throw new Error("oci_question_evidence_invalid");
  }
}

function itemForTransition(
  db: DatabaseSync,
  ownerId: string,
  entityUuid: string,
): OpenCognitiveItemRecord {
  const item = getOpenCognitiveItem(db, ownerId, entityUuid);
  if (item) return item;
  const row = db
    .prepare("SELECT owner_id FROM open_cognitive_items WHERE entity_uuid = ?")
    .get(entityUuid);
  if (isRow(row) && String(row.owner_id) !== ownerId) {
    throw new Error("oci_owner_mismatch");
  }
  throw new Error("oci_not_found");
}

/**
 * Apply only OCI-owned lifecycle transitions. No source record or relationship
 * truth is mutated by this function.
 */
export function transitionOpenCognitiveItem(
  db: DatabaseSync,
  input: OpenCognitiveItemTransitionInput,
): OpenCognitiveItemRecord {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const reason = boundedCode(input.reason, "oci_transition_reason_invalid");
  if (input.entityUuid.trim() === "") throw new Error("oci_entity_invalid");

  return withTransaction(
    db,
    input.inTransaction === true,
    () => {
      const item = itemForTransition(db, input.ownerId, input.entityUuid);
      if (item.status !== "OPEN") throw new Error("oci_transition_not_allowed");

      if (input.action === "keep_open") {
        if (item.attention?.reviewRequestedAt == null) {
          throw new Error("oci_review_not_requested");
        }
        ensureAttentionRow(db, item, nowIso);
        db.prepare(
          `UPDATE open_cognitive_item_attention
           SET delay_class = 'long',
               defer_until = ?,
               last_outcome_code = 'reflection_keep_open',
               review_requested_at = NULL,
               updated_at = ?
           WHERE item_id = ?`,
        ).run(
          new Date(
            now.getTime() + OPEN_COGNITIVE_ITEM_DELAY_DURATIONS_MS.long,
          ).toISOString(),
          nowIso,
          item.id,
        );
        db.prepare(
          `INSERT INTO open_cognitive_item_transitions
             (item_id, owner_id, from_status, to_status, reason, created_at)
           VALUES (?, ?, 'OPEN', 'OPEN', ?, ?)`,
        ).run(item.id, input.ownerId, reason, nowIso);
        return itemForTransition(db, input.ownerId, input.entityUuid);
      }

      if (input.action === "resolve" || input.action === "supersede") {
        if (!openCognitiveItemSourceEligibleForInfluence(db, item)) {
          throw new Error("oci_source_unavailable");
        }
      }

      if (input.action === "resolve" && item.kind !== "concern") {
        validateResolutionEvidence(
          db,
          input.ownerId,
          item,
          input.evidenceRefs ?? [],
        );
      } else if (
        input.action === "resolve" &&
        input.evidenceRefs &&
        input.evidenceRefs.length > 0
      ) {
        validateResolutionEvidence(
          db,
          input.ownerId,
          item,
          input.evidenceRefs,
        );
      }

      if (input.action === "supersede") {
        const replacementUuid = input.replacementEntityUuid?.trim();
        if (!replacementUuid || replacementUuid === input.entityUuid) {
          throw new Error("oci_supersede_target_invalid");
        }
        const replacement = getOpenCognitiveItem(
          db,
          input.ownerId,
          replacementUuid,
        );
        if (
          !replacement ||
          replacement.status !== "OPEN" ||
          replacement.kind !== item.kind ||
          !openCognitiveItemSourceEligibleForInfluence(db, replacement)
        ) {
          throw new Error("oci_supersede_target_invalid");
        }
      }

      const toStatus =
        input.action === "resolve"
          ? "RESOLVED"
          : input.action === "withdraw"
            ? "WITHDRAWN"
            : "SUPERSEDED";
      const update = db
        .prepare(
          `UPDATE open_cognitive_items
           SET status = ?, status_reason = ?, updated_at = ?,
               resolved_at = CASE WHEN ? = 'RESOLVED' THEN ? ELSE resolved_at END
           WHERE id = ? AND owner_id = ? AND status = 'OPEN'`,
        )
        .run(toStatus, reason, nowIso, toStatus, nowIso, item.id, input.ownerId);
      if (Number(update.changes) !== 1) {
        throw new Error("oci_transition_not_allowed");
      }
      ensureAttentionRow(db, item, nowIso);
      db.prepare(
        `UPDATE open_cognitive_item_attention
         SET delay_class = 'none', defer_until = NULL,
             last_outcome_code = ?, review_requested_at = NULL, updated_at = ?
         WHERE item_id = ?`,
      ).run(`transition:${input.action}`, nowIso, item.id);
      db.prepare(
        `INSERT INTO open_cognitive_item_transitions
           (item_id, owner_id, from_status, to_status, reason, created_at)
         VALUES (?, ?, 'OPEN', ?, ?, ?)`,
      ).run(item.id, input.ownerId, toStatus, reason, nowIso);

      return itemForTransition(db, input.ownerId, input.entityUuid);
    },
  );
}
