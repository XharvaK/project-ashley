import type { DatabaseSync } from "node:sqlite";
import { defaultUnclassifiedConversational, type DataClassification } from "../../privacy/classification.js";
import { listConversationEvidence } from "../evidence/conversation-log.js";
import { listMemoryAssertions } from "../memory/assertions.js";
import { REDACTED_MEMORY_STATEMENT } from "../memory/assertions.js";
import { listMemorySupports } from "../memory/supports.js";
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
  const terms = unique(input.request.triggerTerms.concat(input.request.workingContextTopics));
  if (keys.length === 0 && terms.length === 0) return [];
  const requestedKeys = new Set(keys);
  return listMemoryAssertions(db, { modelContext: true }).flatMap((assertion) => {
    if (assertion.statement === REDACTED_MEMORY_STATEMENT) return [];
    const lower = assertion.statement.toLowerCase();
    const matchedTerms = terms.filter((term) => lower.includes(term.toLowerCase()));
    const keyMatch = requestedKeys.has(assertion.assertionKey);
    if (!keyMatch && matchedTerms.length === 0) return [];
    const live = assertion.live;
    const supportRefs = listMemorySupports(db, assertion.assertionKey)
      .map((support) => support.sourceRef ?? support.supportId);
    return [{
      kind: keyMatch ? "key" : "lexical",
      sourceStore: live ? "live_memory" : "quarantined_memory",
      ref: assertion.assertionKey,
      snippet: assertion.statement.slice(0, 500),
      score: (keyMatch ? 1 : 0) + matchedTerms.length / Math.max(1, terms.length),
      assertionKey: assertion.assertionKey,
      memoryKind: assertion.memoryKind,
      dimensions: assertion.dimensions,
      dataClassification: assertion.dataClassification,
      live,
      supportRefs,
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
