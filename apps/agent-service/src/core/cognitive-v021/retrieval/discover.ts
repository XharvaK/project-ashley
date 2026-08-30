import type { DatabaseSync } from "node:sqlite";
import type {
  AssertionKey,
  DataClassification,
  EpistemicDimensions,
  MemoryKind,
  RetrievalHit,
  RetrievalInfrastructureState,
  RetrievalRequest,
  RetrievalResult,
} from "../types.js";
import { getMemoryAssertion, REDACTED_MEMORY_STATEMENT } from "../memory/assertions.js";
import { listMemorySupports } from "../memory/supports.js";
import { DerivedStore, openDerivedStore } from "./derived-store.js";
import { buildFtsQueryString, tokenizeForQuery } from "./query.js";
import { searchConversationFts, searchMemoryFts } from "./fts.js";
import { rankCandidates } from "./rank.js";
import { deduplicateCandidates } from "./dedup.js";

export type RetrieveCandidatesInput = {
  conversationId: string;
  request: RetrievalRequest;
  rawConversationRowIds?: Set<string>;
};

export function tokenizeForDiscovery(text: string): string[] {
  return tokenizeForQuery(text);
}

function fetchExactKeyHits(
  sidecarDb: DatabaseSync,
  assertionKeys: string[],
): RetrievalHit[] {
  const uniqueKeys = [...new Set(assertionKeys.filter(Boolean))];
  const hits: RetrievalHit[] = [];

  for (const key of uniqueKeys) {
    const assertion = getMemoryAssertion(sidecarDb, key);
    if (!assertion) continue;
    if (assertion.dataClassification === "secret") continue;
    if (assertion.statement === REDACTED_MEMORY_STATEMENT) continue;

    const supportRefs = listMemorySupports(sidecarDb, assertion.assertionKey).map(
      (support) => support.sourceRef ?? support.supportId,
    );

    hits.push({
      kind: "key",
      sourceStore: assertion.live ? "live_memory" : "quarantined_memory",
      ref: assertion.assertionKey,
      snippet: assertion.statement.slice(0, 500),
      score: -100, // Top deterministic tier
      assertionKey: assertion.assertionKey,
      memoryKind: assertion.memoryKind,
      dimensions: assertion.dimensions,
      dataClassification: assertion.dataClassification,
      live: assertion.live,
      supportRefs,
    });
  }

  return hits;
}

/**
 * Deterministic tiered indexed retrieval.
 * Composes exact-key fetch, FTS5 BM25 memory and conversation search,
 * strict tier ranking, and safe narrow deduplication.
 */
export function retrieveCandidates(
  sidecarDb: DatabaseSync,
  input: RetrieveCandidatesInput,
  derivedStore?: DerivedStore,
): RetrievalResult {
  const request: RetrievalRequest = { ...input.request, includeLogSearch: true };
  const store = derivedStore ?? openDerivedStore(":memory:");
  let infrastructureState: RetrievalInfrastructureState = "ready";

  // Tier 1: Exact-key hits from sidecar memory assertions
  const exactKeyHits = fetchExactKeyHits(sidecarDb, request.assertionKeys ?? []);

  // FTS query formation
  const rawTriggerQuery = buildFtsQueryString(request.triggerTerms ?? []);
  const concernQuery = buildFtsQueryString(request.workingContextTopics ?? []);

  // Tier 2: Raw owner trigger BM25 over memory_fts
  const rawTriggerResult = searchMemoryFts(store, sidecarDb, rawTriggerQuery);
  if (rawTriggerResult.state === "unavailable") {
    infrastructureState = "unavailable";
  }
  const rawTriggerHits: RetrievalHit[] = rawTriggerResult.rows.map((row) => ({
    kind: "lexical",
    sourceStore: row.sourceStore,
    ref: row.assertionKey,
    snippet: row.statement.slice(0, 500),
    score: row.rank,
    assertionKey: row.assertionKey,
    memoryKind: row.memoryKind,
    dimensions: row.dimensions,
    dataClassification: row.dataClassification,
    live: row.live,
    supportRefs: listMemorySupports(sidecarDb, row.assertionKey).map(
      (s) => s.sourceRef ?? s.supportId,
    ),
  }));

  // Tier 3: Derived Working-Context BM25 over memory_fts
  const concernResult = searchMemoryFts(store, sidecarDb, concernQuery);
  if (concernResult.state === "unavailable") {
    infrastructureState = "unavailable";
  }
  const concernHits: RetrievalHit[] = concernResult.rows.map((row) => ({
    kind: "lexical",
    sourceStore: row.sourceStore,
    ref: row.assertionKey,
    snippet: row.statement.slice(0, 500),
    score: row.rank,
    assertionKey: row.assertionKey,
    memoryKind: row.memoryKind,
    dimensions: row.dimensions,
    dataClassification: row.dataClassification,
    live: row.live,
    supportRefs: listMemorySupports(sidecarDb, row.assertionKey).map(
      (s) => s.sourceRef ?? s.supportId,
    ),
  }));

  // Tier 4: Historical conversation-log BM25 over conversation_fts
  let logHits: RetrievalHit[] = [];
  if (request.includeLogSearch) {
    const combinedLogQuery = rawTriggerQuery || concernQuery;
    const logResult = searchConversationFts(store, sidecarDb, input.conversationId, combinedLogQuery, {
      excludeRowIds: input.rawConversationRowIds,
    });
    if (logResult.state === "unavailable") {
      infrastructureState = "unavailable";
    }
    logHits = logResult.rows.map((row) => ({
      kind: "log",
      sourceStore: "conversation_log",
      ref: row.rowId,
      snippet: row.text.slice(0, 500),
      score: row.rank,
      assertionKey: null,
      memoryKind: null,
      dimensions: null,
      dataClassification: row.dataClassification,
      live: null,
      supportRefs: [row.lineageId ?? row.rowId],
    }));
  }

  // Tiered deterministic ranking with defense-in-depth fuse
  const ranked = rankCandidates({
    exactKeyHits,
    rawTriggerFtsHits: rawTriggerHits,
    concernFtsHits: concernHits,
    logHits,
  });

  // Narrow safe deduplication
  const deduped = deduplicateCandidates(ranked, {
    rawConversationRowIds: input.rawConversationRowIds,
  });

  const hits = deduped.survivors;
  const isMiss = infrastructureState === "ready" && hits.length === 0;

  return {
    request,
    hits,
    state: infrastructureState,
    miss: isMiss,
  };
}
