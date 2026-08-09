import type { DatabaseSync } from "node:sqlite";
import { activeWithdrawal } from "./repair.js";
import { relationshipCanInfluence } from "./influence.js";
import type { MotivationKind, Trigger } from "../types.js";

export type RelationshipMotivationProjection = {
  kind: Extract<MotivationKind, "unfinished" | "callback">;
  score: number;
  summary: string;
  refType:
    | "ashley_self_commitment"
    | "mutual_commitment"
    | "relational_tension";
  refId: string;
};

const MAX_SELF_COMMITMENTS = 4;
const MAX_MUTUAL_COMMITMENTS = 4;
const MAX_TENSIONS = 1;

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9\u00c0-\u00ff]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4),
  );
}

function isTextRelevant(message: string, candidate: string): boolean {
  const messageTokens = tokens(message);
  if (messageTokens.size === 0) return false;
  let hits = 0;
  for (const token of tokens(candidate)) {
    if (messageTokens.has(token)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

function sourceText(row: Record<string, unknown>): string {
  const value = typeof row.text === "string" ? row.text.trim() : "";
  return value.slice(0, 600);
}

function sourceRef(
  row: Record<string, unknown>,
  refType: RelationshipMotivationProjection["refType"],
): RelationshipMotivationProjection | null {
  const refId = typeof row.entity_uuid === "string" ? row.entity_uuid : "";
  const summary = sourceText(row);
  if (!refId || !summary || String(row.data_classification) === "secret") {
    return null;
  }
  const score =
    refType === "ashley_self_commitment"
      ? 62
      : refType === "mutual_commitment"
        ? 54
        : 36;
  return {
    kind: "unfinished",
    score,
    summary,
    refType,
    refId,
  };
}

function filterReactive(
  projection: RelationshipMotivationProjection,
  trigger: Trigger,
  message: string,
): boolean {
  return (
    trigger !== "reactive" ||
    !message ||
    isTextRelevant(message, projection.summary)
  );
}

/**
 * Read-only relationship source projections. Source rows remain authoritative.
 * This function never creates or updates relationship records.
 */
export function listRelationshipMotivationProjections(
  db: DatabaseSync,
  ownerId: string,
  trigger: Trigger,
  message = "",
): RelationshipMotivationProjection[] {
  const projections: RelationshipMotivationProjection[] = [];
  if (!relationshipCanInfluence(db, "apply", "relational_initiative")) {
    return projections;
  }
  const withdrawal = activeWithdrawal(db, ownerId);

  const selfRows = withdrawal
    ? []
    : db
    .prepare(
      `SELECT entity_uuid, text, data_classification
       FROM ashley_self_commitments
       WHERE owner_id = ? AND status = 'active'
         AND data_classification <> 'secret'
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
    )
    .all(ownerId, MAX_SELF_COMMITMENTS) as Array<Record<string, unknown>>;
  for (const row of selfRows) {
    const projection = sourceRef(row, "ashley_self_commitment");
    if (projection && filterReactive(projection, trigger, message)) {
      projections.push(projection);
    }
  }

  const mutualRows = withdrawal
    ? []
    : db
    .prepare(
      `SELECT entity_uuid, text, data_classification
       FROM mutual_commitments
       WHERE owner_id = ? AND status = 'active'
         AND data_classification <> 'secret'
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
    )
    .all(ownerId, MAX_MUTUAL_COMMITMENTS) as Array<Record<string, unknown>>;
  for (const row of mutualRows) {
    const projection = sourceRef(row, "mutual_commitment");
    if (projection && filterReactive(projection, trigger, message)) {
      projections.push(projection);
    }
  }

  // Explicit repair eligibility is the only withdrawal state that may let a
  // bounded tension candidate reach Thought. Withdrawal itself is never fuel.
  if (
    !withdrawal ||
    String(withdrawal.repair_status ?? "") === "eligible"
  ) {
    const tensionRows = db
      .prepare(
        `SELECT entity_uuid, text, data_classification
         FROM relational_tensions
         WHERE owner_id = ? AND status = 'open'
           AND repair_status IN ('open', 'repairing')
           AND data_classification <> 'secret'
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
      )
      .all(ownerId, MAX_TENSIONS) as Array<Record<string, unknown>>;
    for (const row of tensionRows) {
      const projection = sourceRef(row, "relational_tension");
      if (projection && filterReactive(projection, trigger, message)) {
        projections.push(projection);
      }
    }
  }

  return projections;
}
