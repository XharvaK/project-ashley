import { sha256, stableJson } from "../../model-fabric/hash.js";
import type { DatabaseSync } from "node:sqlite";
import type { WorkingContextDelta, WorkingContextItem } from "../types.js";

export type WorkingContextCurrentnessEntry = Readonly<{
  conversationId: string;
  updatedGeneration: number;
  superseded: boolean;
  payloadHash: string;
}>;

export type WorkingContextCurrentness = Readonly<
  Record<string, WorkingContextCurrentnessEntry>
>;

/**
 * Host-side source witness captured while the Thought input is assembled.
 * This object is deliberately attached as a non-enumerable property and is
 * never included in the model-visible projection or request hash.
 */
export type ThoughtSourceCurrentness = Readonly<{
  workingContext: WorkingContextCurrentness;
  learnedSelfRevisionHead: string;
  relationshipOwnerId: string | null;
  relationshipRevisionHead: string;
}>;

type DbRow = Record<string, unknown>;

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function row(value: unknown): DbRow | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as DbRow
    : null;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function workingContextPayload(item: Pick<WorkingContextItem, "id" | "conversationId" | "type" | "text" | "concernId" | "sourceTurnIds" | "status" | "supersedesId">): Record<string, unknown> {
  return {
    id: item.id,
    conversationId: item.conversationId,
    type: item.type,
    text: item.text,
    concernId: item.concernId,
    sourceTurnIds: [...item.sourceTurnIds],
    status: item.status,
    supersedesId: item.supersedesId,
  };
}

export function workingContextPayloadHash(
  item: Pick<WorkingContextItem, "id" | "conversationId" | "type" | "text" | "concernId" | "sourceTurnIds" | "status" | "supersedesId">,
): string {
  return sha256(workingContextPayload(item));
}

function workingContextEntryFromItem(item: WorkingContextItem): WorkingContextCurrentnessEntry {
  return Object.freeze({
    conversationId: item.conversationId,
    updatedGeneration: item.updatedGeneration,
    superseded: item.status !== "active",
    payloadHash: workingContextPayloadHash(item),
  });
}

export function captureWorkingContextCurrentness(
  items: readonly WorkingContextItem[],
): WorkingContextCurrentness {
  const entries: Record<string, WorkingContextCurrentnessEntry> = {};
  for (const item of items) {
    if (!item.id) continue;
    entries[item.id] = workingContextEntryFromItem(item);
  }
  return Object.freeze(entries);
}

function learnedSelfRevisionHead(db: DatabaseSync): string {
  try {
    const rows = db.prepare(
      `SELECT assertion_key, content_hash, live, memory_kind,
              data_classification, admitted_generation
         FROM sidecar_memory_assertions
        WHERE memory_kind = 'learned_self_evidence'
        ORDER BY assertion_key ASC`,
    ).all();
    return sha256(rows);
  } catch {
    return "unavailable";
  }
}

function relationshipRevisionHead(
  db: DatabaseSync | undefined,
  ownerId: string | null,
): string {
  if (!db || !ownerId) return "unavailable";
  try {
    const current = db.prepare(
      `SELECT id, entity_uuid, projection_policy_id, projection_policy_version,
              source_bindings_json, source_watermark_json, data_classification,
              provenance, party_subject_scope, effective_from,
              supersedes_projection_id, content_binding, computed_at
         FROM relationship_projections
        WHERE owner_id = ? AND kind = 'current_shared_culture'
          AND effective_to IS NULL`,
    ).get(ownerId);
    return sha256(current == null ? { state: "empty" } : { state: "current", current });
  } catch {
    return "unavailable";
  }
}

export function captureThoughtSourceCurrentness(
  sidecar: DatabaseSync,
  authorityDb: DatabaseSync | undefined,
  ownerId: string | null,
  workingContext: readonly WorkingContextItem[],
): ThoughtSourceCurrentness {
  return Object.freeze({
    workingContext: captureWorkingContextCurrentness(workingContext),
    learnedSelfRevisionHead: learnedSelfRevisionHead(sidecar),
    relationshipOwnerId: ownerId,
    relationshipRevisionHead: relationshipRevisionHead(authorityDb, ownerId),
  });
}

function currentWorkingContextEntry(
  db: DatabaseSync,
  id: string,
): WorkingContextCurrentnessEntry | null {
  const source = row(db.prepare(
    `SELECT id, conversation_id, payload_json, superseded, updated_generation
       FROM working_context_items WHERE id = ? LIMIT 1`,
  ).get(id));
  if (!source) return null;
  const payload = row(parseJson(source.payload_json));
  if (!payload) return null;
  const sourceTurnIds = Array.isArray(payload.sourceTurnIds)
    ? payload.sourceTurnIds.filter((item): item is string => typeof item === "string")
    : [];
  const status = payload.status === "superseded" || payload.status === "abandoned"
    ? payload.status
    : payload.status === "active" ? "active" : null;
  if (!status) return null;
  return {
    conversationId: text(source.conversation_id),
    updatedGeneration: number(source.updated_generation),
    superseded: number(source.superseded) === 1,
    payloadHash: workingContextPayloadHash({
      id: text(source.id, id),
      conversationId: text(payload.conversationId, text(source.conversation_id)),
      type: payload.type as WorkingContextItem["type"],
      text: text(payload.text),
      concernId: typeof payload.concernId === "string" ? payload.concernId : null,
      sourceTurnIds,
      status,
      supersedesId: typeof payload.supersedesId === "string" ? payload.supersedesId : null,
    }),
  };
}

function sameEntry(
  expected: WorkingContextCurrentnessEntry,
  actual: WorkingContextCurrentnessEntry,
): boolean {
  return stableJson(expected) === stableJson(actual);
}

function currentnessError(code: string): Error {
  return new Error(code);
}

/**
 * Compare the captured source witness with canonical state while the caller's
 * publication transaction is holding its database locks. A missing binding
 * for an existing delta target is fail-closed; a new upsert remains allowed.
 */
export function assertThoughtSourceCurrentness(
  sidecar: DatabaseSync,
  authorityDb: DatabaseSync | undefined,
  expected: ThoughtSourceCurrentness,
  deltas: readonly WorkingContextDelta[] = [],
): void {
  for (const [id, expectedEntry] of Object.entries(expected.workingContext)) {
    const actual = currentWorkingContextEntry(sidecar, id);
    if (!actual || !sameEntry(expectedEntry, actual)) {
      throw currentnessError("working_context_currentness_stale");
    }
  }

  for (const delta of deltas) {
    const targetId = delta.op === "upsert" ? delta.item.id : delta.id;
    const actual = currentWorkingContextEntry(sidecar, targetId);
    if (actual && expected.workingContext[targetId] === undefined) {
      throw currentnessError("working_context_currentness_unbound");
    }
  }

  if (learnedSelfRevisionHead(sidecar) !== expected.learnedSelfRevisionHead) {
    throw currentnessError("learned_self_revision_head_stale");
  }
  if (relationshipRevisionHead(authorityDb, expected.relationshipOwnerId) !== expected.relationshipRevisionHead) {
    throw currentnessError("relationship_currentness_stale");
  }
}

export function isThoughtSourceCurrentnessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message === "working_context_currentness_stale" ||
    message === "working_context_currentness_unbound" ||
    message === "learned_self_revision_head_stale" ||
    message === "relationship_currentness_stale";
}
