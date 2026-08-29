import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_LAST_N_TURNS,
  DEFAULT_OCCUPANCY_COMPACT_K,
  type CapabilityReality,
  type ConversationEvidenceRecord,
  type CycleRecord,
  type IdentitySlice,
  type InFlightRecord,
  type MindOccupancy,
  type Observation,
  type ThoughtInput,
  type WorkingContextItem,
  type LearnedSelfSlice,
  type AuthorityCode,
  type RuntimeCondition,
  type RememberDirective,
  type CycleTriggerKind,
} from "../types.js";
import { listConversationEvidence } from "../evidence/conversation-log.js";
import { listInFlight } from "../effect/in-flight.js";
import { listWorkingContext } from "../evidence/working-context.js";
import { retrieveCandidates } from "../retrieval/discover.js";
import { buildLearnedSelfSlice } from "../identity/learned-self.js";

export type BuildThoughtInputOptions = {
  sidecar: DatabaseSync;
  cycle: CycleRecord;
  triggerText?: string;
  triggerEvidence?: ConversationEvidenceRecord | null;
  rawConversation?: ConversationEvidenceRecord[];
  workingContext?: WorkingContextItem[];
  occupancy?: MindOccupancy[];
  constitution: IdentitySlice;
  learnedSelfSlice?: LearnedSelfSlice;
  capabilityReality: CapabilityReality;
  observations?: Observation[];
  inFlight?: InFlightRecord[];
  authorityObjections?: AuthorityCode[];
  runtimeCondition?: Partial<RuntimeCondition>;
  rememberDirective?: RememberDirective | null;
  lastNTurns?: number;
  occupancyK?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function tokenize(text: string): string[] {
  return [...new Set(
    text.toLowerCase()
      .split(/[^a-z0-9à-ÿ]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  )];
}

function loadWorkingContext(db: DatabaseSync, conversationId: string): WorkingContextItem[] {
  const rows = db.prepare(
    `SELECT id, conversation_id, type, payload_json, superseded, updated_generation
       FROM working_context_items
      WHERE conversation_id = ? AND superseded = 0
      ORDER BY COALESCE(updated_generation, 0) DESC, id ASC`,
  ).all(conversationId);
  return rows.flatMap((row) => {
    if (!isRecord(row)) return [];
    const payload = jsonValue(row.payload_json);
    if (!isRecord(payload)) return [];
    return [{
      id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
      conversationId,
      type: payload.type as WorkingContextItem["type"],
      text: typeof payload.text === "string" ? payload.text : "",
      concernId: typeof payload.concernId === "string" ? payload.concernId : null,
      sourceTurnIds: Array.isArray(payload.sourceTurnIds) ? payload.sourceTurnIds.filter((id): id is string => typeof id === "string") : [],
      status: payload.status === "abandoned" || payload.status === "superseded" ? payload.status : "active",
      supersedesId: typeof payload.supersedesId === "string" ? payload.supersedesId : null,
      updatedGeneration: Number(row.updated_generation ?? payload.updatedGeneration ?? 0),
    } satisfies WorkingContextItem];
  });
}

function loadOccupancy(db: DatabaseSync, conversationId: string, limit: number): MindOccupancy[] {
  const rows = db.prepare(
    `SELECT conversation_id, concern_id, status, priority, updated_cycle, updated_generation
       FROM mind_occupancy
      WHERE conversation_id = ?
      ORDER BY priority DESC, updated_generation DESC, concern_id ASC
      LIMIT ?`,
  ).all(conversationId, limit);
  return rows.flatMap((row) => {
    if (!isRecord(row)) return [];
    return [{
      conversationId: String(row.conversation_id ?? conversationId),
      concernId: String(row.concern_id ?? ""),
      status: String(row.status ?? "active") as MindOccupancy["status"],
      priority: Number(row.priority ?? 0),
      updatedCycle: String(row.updated_cycle ?? ""),
      updatedGeneration: Number(row.updated_generation ?? 0),
    } satisfies MindOccupancy];
  });
}

function latestEvidence(
  db: DatabaseSync,
  conversationId: string,
  lastNTurns: number,
  triggerEvidence: ConversationEvidenceRecord | null | undefined,
  supplied?: ConversationEvidenceRecord[],
): ConversationEvidenceRecord[] {
  const all = supplied ?? listConversationEvidence(db, conversationId, {
    limit: 1000,
    includeOlderVersions: false,
  });
  const ordered = [...all].sort((left, right) =>
    left.createdAtMs - right.createdAtMs || left.rowId.localeCompare(right.rowId),
  );
  const selected = ordered.slice(-lastNTurns);
  if (triggerEvidence && !selected.some((row) => row.rowId === triggerEvidence.rowId)) {
    selected.push(triggerEvidence);
    selected.sort((left, right) =>
      left.createdAtMs - right.createdAtMs || left.rowId.localeCompare(right.rowId),
    );
  }
  return selected;
}

function emptyRuntimeCondition(partial?: Partial<RuntimeCondition>): RuntimeCondition {
  return {
    fallback: partial?.fallback ?? false,
    compression: partial?.compression ?? false,
    lookupFailed: partial?.lookupFailed ?? false,
    thoughtUnavailable: partial?.thoughtUnavailable ?? false,
  };
}

/** Assemble the fixed Thought input set. Workspace notes are intentionally absent. */
export function buildThoughtInput(options: BuildThoughtInputOptions): ThoughtInput {
  const lastNTurns = Math.max(1, Math.min(100, options.lastNTurns ?? DEFAULT_LAST_N_TURNS));
  const occupancyK = Math.max(1, Math.min(100, options.occupancyK ?? DEFAULT_OCCUPANCY_COMPACT_K));
  const rawConversation = latestEvidence(
    options.sidecar,
    options.cycle.conversationId,
    lastNTurns,
    options.triggerEvidence,
    options.rawConversation,
  );
  const workingContext = options.workingContext ?? listWorkingContext(options.sidecar, options.cycle.conversationId);
  const occupancy = (options.occupancy ?? loadOccupancy(options.sidecar, options.cycle.conversationId, occupancyK))
    .slice()
    .sort((left, right) => right.priority - left.priority || right.updatedGeneration - left.updatedGeneration)
    .slice(0, occupancyK);
  const triggerText = options.triggerText ?? options.cycle.triggerRef;
  const triggerTerms = tokenize(triggerText);
  const workingContextTopics = workingContext
    .filter((item) => item.status === "active")
    .flatMap((item) => tokenize(item.text));
  const assertionKeys = workingContext
    .map((item) => item.concernId)
    .filter((key): key is string => Boolean(key));

  const retrieval = retrieveCandidates(options.sidecar, {
    conversationId: options.cycle.conversationId,
    request: {
      triggerTerms,
      workingContextTopics: [...new Set(workingContextTopics)],
      assertionKeys: [...new Set(assertionKeys)],
      includeLogSearch: true,
    },
  });

  return {
    cycleId: options.cycle.cycleId,
    generation: options.cycle.generation,
    occupantId: options.cycle.occupantId,
    authorityEpoch: options.cycle.authorityEpoch,
    trigger: {
      kind: options.cycle.triggerKind as CycleTriggerKind,
      ref: options.cycle.triggerRef,
    },
    rawConversation,
    workingContext,
    occupancy,
    constitution: options.constitution,
    learnedSelfSlice: options.learnedSelfSlice ?? buildLearnedSelfSlice(options.sidecar),
    capabilityReality: options.capabilityReality,
    observations: options.observations ?? [],
    retrieval,
    inFlight: options.inFlight ?? listInFlight(options.sidecar, options.cycle.cycleId),
    authorityObjections: options.authorityObjections ?? [],
    runtimeCondition: emptyRuntimeCondition(options.runtimeCondition),
    rememberDirective: options.rememberDirective ?? null,
  };
}
