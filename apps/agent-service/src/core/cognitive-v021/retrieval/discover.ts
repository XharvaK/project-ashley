import type { DatabaseSync } from "node:sqlite";
import { defaultUnclassifiedConversational, type DataClassification } from "../../privacy/classification.js";
import { listConversationEvidence } from "../evidence/conversation-log.js";
import type { RetrievalHit, RetrievalRequest, RetrievalResult } from "../types.js";

export type RetrieveCandidatesInput = {
  conversationId: string;
  request: RetrievalRequest;
};

function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }

export function tokenizeForDiscovery(text: string): string[] {
  return unique(
    text.toLowerCase()
      .split(/[^a-z0-9à-ÿ]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 1),
  );
}

function classification(value: unknown): DataClassification {
  return value === "ordinary" || value === "sensitive" || value === "never_public" || value === "secret"
    ? value
    : defaultUnclassifiedConversational();
}

function logHits(db: DatabaseSync, input: RetrieveCandidatesInput): RetrievalHit[] {
  if (!input.request.includeLogSearch) return [];
  const terms = unique(input.request.triggerTerms.concat(input.request.workingContextTopics));
  if (terms.length === 0) return [];
  return listConversationEvidence(db, input.conversationId, { limit: 1000, includeOlderVersions: false })
    .flatMap((row) => {
      const text = row.text ?? "";
      const lower = text.toLowerCase();
      const matched = terms.filter((term) => lower.includes(term.toLowerCase()));
      if (matched.length === 0) return [];
      return [{
        kind: "lexical",
        sourceStore: "conversation_log",
        ref: row.rowId,
        snippet: text.slice(0, 500),
        score: matched.length / Math.max(1, terms.length),
        assertionKey: null,
        memoryKind: null,
        dimensions: null,
        dataClassification: row.dataClassification,
        live: null,
        supportRefs: [row.lineageId],
      } satisfies RetrievalHit];
    });
}

function memoryHits(db: DatabaseSync, input: RetrieveCandidatesInput): RetrievalHit[] {
  const keys = unique(input.request.assertionKeys);
  if (keys.length === 0) return [];
  const placeholders = keys.map(() => "?").join(",");
  return db.prepare(
    `SELECT assertion_key, statement, memory_kind, dimensions_json,
            data_classification, live
       FROM sidecar_memory_assertions
      WHERE assertion_key IN (${placeholders})`,
  ).all(...keys).flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const value = row as Record<string, unknown>;
    const live = Number(value.live ?? 0) === 1;
    return [{
      kind: "key",
      sourceStore: live ? "live_memory" : "quarantined_memory",
      ref: String(value.assertion_key ?? ""),
      snippet: String(value.statement ?? "").slice(0, 500),
      score: 1,
      assertionKey: String(value.assertion_key ?? ""),
      memoryKind: typeof value.memory_kind === "string" ? value.memory_kind as RetrievalHit["memoryKind"] : null,
      dimensions: null,
      dataClassification: classification(value.data_classification),
      live,
      supportRefs: [],
    } satisfies RetrievalHit];
  });
}

/** Retrieval keys are hints. Lexical trigger terms remain an independent fallback. */
export function retrieveCandidates(
  db: DatabaseSync,
  input: RetrieveCandidatesInput,
): RetrievalResult {
  const request: RetrievalRequest = { ...input.request, includeLogSearch: true };
  const hits = [...logHits(db, { ...input, request }), ...memoryHits(db, { ...input, request })];
  return { request, hits, miss: hits.length === 0 };
}
