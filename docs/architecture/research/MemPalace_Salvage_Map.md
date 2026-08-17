# MemPalace Architecture Salvage Map

**Status:** `SUPPORTING` — adjudicated research record. The salvage decisions in
Sections 6–9 are frozen as of the canonicalization date. None of them authorize
implementation, deployment, or roadmap change.

**Canonicalized:** 2026-08-17

**Scope:** A durable, source-specific record of what Project Ashley learned from
the MemPalace codebase and which mechanisms were accepted, adapted, deferred,
spiked, rejected, or superseded. This document answers "what did we learn, and
what did we decide" without requiring access to the original research chat.

**Companion document:** The Ashley-native architecture derived from this salvage
lives in [`docs/architecture/Ashley_Memory_Evidence_Architecture.md`](../Ashley_Memory_Evidence_Architecture.md).
This map is not that document.

**Research provenance chain:** external research report (evidence) -> owner
refinement (decision layer) -> this salvage map -> Ashley-native architecture
document. The refinement takes precedence wherever it corrects, downgrades,
rejects, reclassifies, or narrows a conclusion of the report.

**Normative authority (separate from research provenance):**

```text
governance
  > Canonical Architecture Roadmap
    > Ashley Memory Evidence Architecture, for its domain
      > supporting MemPalace salvage record
```

This source-specific salvage record does not normatively outrank the
Ashley-native architecture document.

---

## 1. Purpose and Scope

Project Ashley investigated MemPalace, an open-source Python local memory and
retrieval (RAG) system, to harvest evidence for Ashley's own persistent memory
architecture. The governing decision is:

> **Keep the architectural harvest. Do not freeze Google's implementation
> choices.**

The durable Project Ashley position is **Ashley-native memory architecture
inspired by evidence from MemPalace**, not "port these five MemPalace features."
`nuclear.db` remains Ashley's canonical source of truth. Retrieval and graph
structures remain derived mechanisms.

This document records:

- what MemPalace actually provides, mechanically;
- which findings of the external research report were corrected;
- the accepted / adapted / spiked / deferred / referenced / rejected /
  superseded decision set;
- where each salvaged idea belongs on the frozen Ashley roadmap.

It intentionally does not invent decisions that neither input made. Unresolved
items remain unresolved and are listed in Sections 10 and 11.

---

## 2. Research Pin

| Item | Record |
|---|---|
| Repository | `MemPalace/mempalace` (GitHub) |
| Researched branch | `develop` |
| Researched version | baseline release v3.7.1 (as stated in the supplied research report) |
| Researched commit | Not reliably supplied. No commit is recorded. |
| Date of research | Not dated in the supplied report. This record is canonicalized 2026-08-17. |
| Evidence basis | INPUT A: the report "MemPalace x Project Ashley - Architecture Salvage, Integration, and Roadmap Impact Study" (claims direct inspection of MemPalace source on `develop`). INPUT B: the subsequent owner refinement, which is the current Ashley decision layer. During subsequent architectural adjudication, key disputed claims were independently spot-verified against current MemPalace `develop` source and GitHub issues. This was not a second exhaustive repository-wide audit. |

Evidence limitations:

- The report is research evidence, not an accepted Ashley architecture
  document. It contains overclaims, incorrect classifications, uncertain
  resource estimates, roadmap-placement mistakes, and cases where open
  proposals were described as implemented features.
- Several behaviors the report describes confidently are open proposals, not
  implemented source (Section 5).
- Precise resource figures in the report are marked `INFERRED` by the report
  itself and are not treated as facts (Section 5.8).
- MemPalace is a live project; source may have changed since the research was
  performed.
- Issue numbers originating in the report are preserved as research citations.
  Selected disputed issues were independently re-opened during adjudication;
  the issue set was not exhaustively re-audited.

---

## 3. Governing Ashley Constraints

Salvage is constrained by these Ashley laws. They outrank any MemPalace-derived
conclusion:

- `ASHLEY OWNS MEANING. SUBSTRATES PROVIDE MECHANISMS.` External systems may
  provide storage, retrieval, vectors, graph indexes, models, and mechanical
  services. They may not become the authority over Ashley's identity,
  cognition, memory semantics, forgetting semantics, or interpretation.
- `ONE ASHLEY. BOUNDED SPECIALISTS / WORKERS.` Workers are bounded mechanisms
  acting for Ashley, not peer identities.
- `CHILD AUTHORITY MUST BE A SUBSET OF PARENT AUTHORITY.`
- `CONNECTED ACCOUNT != DELEGATED CAPABILITY. AUTHENTICATED SESSION !=
  PERMISSION TO ACT. SKILL AVAILABLE != PERMISSION TO INVOKE. TOOL PRESENT !=
  AUTHORITY TO USE IT.`
- `MEMORY CONTENT != AUTHORITY.`
- `nuclear.db` (SQLite) is the canonical, Ashley-owned behavioral store.
  Derived retrieval machinery (lexical indexes, vector indexes, graph
  projections, ranking caches, temporal projections) is not automatically
  canonical memory.
- The roadmap is frozen: no new roadmap phase is required, no reorder is
  required, and no MemPalace-derived memory implementation enters the current
  Sandbox M-series.

---

## 4. What MemPalace Actually Provides

Mechanical description only; marketing language is excluded.

**Storage model.** MemPalace stores "drawers": verbatim text chunks with
attached metadata. In current source, the "palace / wing / room" hierarchy is
flat string metadata (`wing`, `room`) applied as `where={"wing": ...}` filters;
it is not an active cognitive model. A benchmark claim of a "+34% boost" from
the hierarchy was retracted by the project.

**Backing engines.** Local persistence is ChromaDB (HNSW vector index plus
`chroma.sqlite3`, which itself contains metadata and FTS5 tables). A sidecar
SQLite knowledge graph stores temporal subject-predicate-object triples with
`valid_from`, `valid_to`, confidence, and source references. A storage
abstraction exists with ChromaDB, Milvus, and PostgreSQL drivers.

**Retrieval.** Hybrid retrieval combines a vector branch (cosine similarity,
clamped) and a lexical branch (BM25 over FTS5). Raw lexical scores are
min-max-normalized across the fetched candidate set, then merged with a
weighted linear combination; current `develop` uses approximately
`vector x 0.6 + normalized BM25 x 0.4` in `_hybrid_rank`. Recent releases
propose Reciprocal Rank Fusion (RRF) as an alternative fusion strategy; the
proposal is open, not the current implementation. After ranking, a neighbor
expansion step (`_expand_with_neighbors`) attempts to reconstruct surrounding
context from adjacent source lines; it has a known bug where unrelated chunks
can be stitched when source metadata is insufficient.

**Temporal knowledge graph.** SQLite tables for entities, triples, and
triple-to-source evidence links. Temporal bounds use `valid_from`/`valid_to`;
conflicting new facts invalidate older records by updating `valid_to` rather
than deleting. Point-in-time queries evaluate validity at a chosen time. Per
the refinement, current source maintains a `threading.Lock` around mutation
operations (`add_entity`, `add_triple`, `invalidate`); the report's allegation
of lock-free `check_same_thread=False` connections is corrected in Section 5.7.

**Ingestion and consolidation.** Shell hooks and a background daemon queue
mining passes at session boundaries. A consolidation workflow
(`mempalace consolidate`) that presents extracted candidate facts for human
confirm / edit / reject is an open feature proposal, not mature production
functionality.

**Public benchmark discipline.** The project's own `HISTORY.md` documents
retractions: a 12.4-point recall regression from AAAK compression mode
(84.2% R@5 vs 96.6% R@5 raw), retraction of the "+34%" hierarchy boost,
recognition that a "100% recall" reranking claim overfit specific test cases,
and removal of category-error comparisons between raw retrieval recall and
end-to-end QA accuracy.

---

## 5. Corrections to the Deep Research Report

This section exists so future readers do not rediscover old mistakes. The
refinement (INPUT B) is the current decision layer; where it corrects the
report, the correction is authoritative.

### 5.1 RRF is a proposal, not a proven MemPalace feature

- The report treats MemPalace "RRF hybrid retrieval" as salvageable mature
  implementation. That is wrong.
- Current MemPalace `develop` implements weighted linear fusion
  (`vector x 0.6 + normalized BM25 x 0.4` in `_hybrid_rank`).
- RRF is described as an optional future fusion strategy in MemPalace issue
  #1553, which is still open.
- **Correction applied:** hybrid lexical + semantic retrieval is accepted as an
  architecture. RRF becomes a `SPIKE`: a generic fusion technique to benchmark
  on Ashley's own memory corpus, not something MemPalace has already solved for
  us.
- Consequence: Ashley's durable documents must not canonize an untested
  algorithm based on a research error.

### 5.2 Interactive consolidation is a proposal, not a mature implementation

- The report speaks confidently of an interactive consolidation workflow; the
  cited source is issue #1416, an open feature proposal.
- The proposed design (candidates derived from raw evidence, provenance
  retained, explicit accept/edit/reject, source material left intact) is
  interesting.
- **Correction applied:** the pattern `evidence -> candidate assertion ->
  adjudication -> accepted | rejected | uncertain | superseded` is accepted.
  The report's implied semantics (human approval as the universal mechanism by
  which memory is permitted to form) are rejected. Ashley owns normal memory
  cognition. Human review is appropriate only where authority or risk requires
  it: sensitive identity changes, consequential claims about the owner,
  governance changes, or uncertain high-impact assertions.

### 5.3 ChromaDB conclusions are too absolute

- The report's "reject ChromaDB/HNSW because it is heavy and unstable" is
  narrowed.
- Real warnings exist: an open report at ~200k drawers where HNSW lagged
  SQLite by 127 entries and `mempalace repair` crashed with SIGSEGV (issue
  #2113), and a separate repair bug producing invalid Chroma metadata
  (`dimensionality=None`) after rebuilding a ~183k-drawer palace.
- These demonstrate MemPalace/Chroma integration and recovery-path failures at
  very large scale. One reported corruption shape was explicitly caused by
  `mempalace.repair.rebuild_index`, not ordinary retrieval.
- **Correction applied:**

| Question | Decision |
|---|---|
| ChromaDB as Ashley's canonical memory | `REJECT` |
| ChromaDB as part of Ashley's current 4 GB Mint runtime | `DO NOT ADOPT NOW` |
| MemPalace + Chroma sidecar now | `DEFER` / probably unnecessary |
| Chroma as a disposable future retrieval projection | Architecturally permitted |
| "Chroma is fundamentally unstable" | `NOT PROVEN` |
| `sqlite-vec` as the chosen replacement | `NOT YET DECIDED - SPIKE` |

### 5.4 Sidecar topology is not automatically dual source of truth

- The report's "dual-source-of-truth problem" for `nuclear.db + sidecar` is a
  conceptual error.
- If `nuclear.db` is canonical and the sidecar is a defined derived,
  disposable projection, then there are two stores but one source of truth.
- A stale projection produces projection lag, index inconsistency, degraded
  recall, and rebuild work - not split-brain memory authority.
- **Correction applied:** the sidecar architecture is not permanently
  prohibited. Current decision: no MemPalace sidecar complexity on the 4 GB
  Mint host. Future decision: derived sidecars remain architecturally legal if
  a concrete performance or operational reason exists. The governing rule
  concerns authority, not process topology.

### 5.5 Source evidence is not world truth

- The report's four-tier model calls Tier 1 raw conversation evidence
  "ground truth." That wording is rejected.
- `CANONICAL SOURCE EVIDENCE IS AUTHORITATIVE ABOUT THE RECORDED EVENT, NOT
  AUTOMATICALLY ABOUT THE WORLD DESCRIBED BY THAT EVENT.`
- A transcript containing "I hate coffee" proves the statement was made at time
  T. It does not prove the speaker universally hates coffee forever.
- A preserved Ashley hallucination ("The repository version is 1.0.0") is
  canonical evidence that Ashley said that; it is not evidence the repository
  was 1.0.0.
- **Correction applied:** the report's precedence
  `raw evidence > derived assertion > index > model` is replaced by a
  role-based model: source evidence supports or contradicts derived assertions;
  assertions are retrieved through projections; projections present to current
  cognition. There is no universal greater-than relation because evidence and
  assertion answer different questions. For provenance, source evidence
  dominates. For current world-state truth, recent direct verified observations
  may dominate old conversational evidence. Operational Truth remains its own
  current-turn authority.

### 5.6 Neighbor expansion caveat

- The report presents `_expand_with_neighbors` as production-ready. MemPalace
  issue #1580 documents that it can stitch chunks from unrelated drawers when
  adjacency is inferred from insufficient metadata.
- **Correction applied:** Ashley implements contextual adjacency using its own
  stronger primitives (`message_entity_uuid`, conversation/thread identity,
  turn ordering, episode membership), not the exact file-line algorithm.

### 5.7 KG concurrency allegation is not propagated

- The report says knowledge graph connections use `check_same_thread=False`
  "without thread locking mechanisms." Per the refinement, current source does
  maintain a `threading.Lock`, and mutation operations (`add_entity`,
  `add_triple`, `invalidate`) execute under it.
- **Correction applied:** the concurrency allegation is not propagated into
  Ashley documentation. (The separate issue #1372, about KG cache keys using
  `abspath` instead of `realpath`, is a different, narrower claim and is not
  relied on here.)

### 5.8 Discarded resource estimates

- The report supplies precise figures: ~650 MB idle RAM, ~1.45 GB peak,
  45-120 ms IPC latency, ~35 MB Ashley-native equivalents. The report itself
  classifies the sidecar resource conclusion as `INFERRED`, and the numbers are
  not adequately established by the cited evidence.
- **Correction applied:** these numbers do not enter Ashley architecture as
  facts. Resource requirements remain `NEEDS MEASUREMENT` until directly
  measured on Ashley's actual Linux Mint host. The relative direction (a
  Python sidecar is heavier than an in-process SQLite approach) is retained as
  a consideration; the magnitudes are not.

### 5.9 Roadmap placement

- The report places RRF and temporal-KG implementation into
  `OPERATIONAL-CONTINUITY-01`. That phase must remain about durable operational
  state, recovery, leases, ambiguous outcomes, and continuity mechanisms -
  not a memory-feature bucket.
- **Correction applied:** the frozen mapping in Section 9 applies. Main
  retrieval implementation belongs to `CONTEXT-BUDGET-01`; higher-order memory
  work belongs to Experience / Cognitive Graduation. No new phase, no reorder.

### 5.10 Default human approval rejected

- The report's consolidation framing implies human-in-the-loop review as the
  default promotion path for facts. **Rejected.** Human approval is conditional
  (high-impact, sensitive, identity-related, governance-related, or
  explicitly authority-bound changes). Ashley ultimately owns normal memory
  cognition.

---

## 6. Salvage Decision Matrix

Status vocabulary for the "Ashley decision" column:

| Term | Meaning |
|---|---|
| `ACCEPT` | Accepted as an Ashley architectural mechanism or law. |
| `ADAPT` | Accepted with changed Ashley-native semantics. |
| `SPIKE` | Bounded experiment required before selection; not accepted yet. |
| `DEFER` | Intentional later placement; not rejected. |
| `REFERENCE` | Useful design input; not adopted as a mechanism. |
| `REJECT` | Explicitly not accepted for the stated role. |
| `SUPERSEDED` | Replaced by a later, better Ashley position. |

Implementation status vocabulary:

| Term | Meaning |
|---|---|
| `DESIGN ONLY` | Accepted direction; no implementation exists or is authorized. |
| `SPIKE REQUIRED` | Experiment must run before implementation is selected. |
| `FUTURE` | Later roadmap; no implementation authorized. |
| `EXISTING` | Present in current source (this does not prove deployment or qualification). |
| `REJECTED` | Explicitly not implemented. |

"Evidence status" describes the research evidence for the MemPalace-side
claim: `PROVEN` (implemented source behavior per the report), `PROPOSAL` (open
issue/design), `REFUTED` (retracted or contradicted), `INFERRED` (estimate,
unmeasured), `REPORTED` (single report, unverified by Ashley).

| MemPalace mechanism | Evidence status | Ashley decision | Rationale | Ashley destination | Roadmap phase | Implementation status |
|---|---|---|---|---|---|---|
| Verbatim text storage invariant | `PROVEN` | `ADAPT` | Lossless evidence is right, but "immutable forever" is replaced by "lossless until governed deletion/redaction". | Canonical Source Evidence | Current (existing) + hardening | `EXISTING` (source messages stored losslessly; redaction governed) |
| Canonical vs derived state separation | `PROVEN` (as concept) | `ACCEPT` - Tier S | Foundational authority boundary; index is not memory. | State ontology | OPERATIONAL-CONTINUITY-01 (law) | `DESIGN ONLY` |
| Source provenance on derived memories (`source_drawer_id` analogue) | `PROVEN` | `ACCEPT` - Tier S | Trustworthy growth requires traceable assertions. | EvidenceRef provenance model | All derived work | `DESIGN ONLY` (partial precedent exists: exact-quote automatic facts) |
| Rebuildable / disposable retrieval projections | `PROVEN` (as concept) | `ACCEPT` - Tier S | Prevents index = memory. | Derived state and recovery | OPERATIONAL-CONTINUITY-01 (law) | `DESIGN ONLY` |
| Memory content as untrusted data | `PROVEN` (as MemPalace failure mode) | `ACCEPT` - Tier S | MEMORY CONTENT != AUTHORITY. | Security boundary | Every phase | `EXISTING` (law) |
| Derivation identity ("what produced me?") | `CONCEPT` (elevated by refinement; not a MemPalace feature) | `ACCEPT` - Tier S | Distinguishes current / stale / old-extractor / needs-rebuild without mistaking infrastructure freshness for cognitive truth. | Provenance model | All derived work | `DESIGN ONLY` |
| Source evidence != world truth | `CONCEPT` (refinement) | `ACCEPT` (ADD) - Tier S | Transcripts prove utterances, not world-state facts. | State ontology | Current | `DESIGN ONLY` (law) |
| Hybrid lexical + semantic retrieval | `PROVEN` (current 60/40 weighted hybrid) | `ACCEPT` architecture / `SPIKE` implementation | Strong retrieval principle; the exact fusion is unproven. | Retrieval architecture | CONTEXT-BUDGET-01 | `SPIKE REQUIRED` |
| Reciprocal Rank Fusion (RRF) | `PROPOSAL` (issue #1553, open) | `SPIKE` | Good candidate, not current MemPalace feature; benchmark on Ashley corpus. | Retrieval architecture | CONTEXT-BUDGET-01 | `SPIKE REQUIRED` |
| FTS5 lexical indexing | `PROVEN` | `SPIKE` then likely adopt | Fits the existing SQLite stack; Ashley already uses FTS5 for episode summaries. | Retrieval architecture | CONTEXT-BUDGET-01 | `SPIKE REQUIRED` (partial `EXISTING`) |
| `sqlite-vec` (or lightweight vector mechanisms) | `CANDIDATE` | `SPIKE` | No evidence yet on Ashley's Mint hardware. | Retrieval architecture | CONTEXT-BUDGET-01 | `SPIKE REQUIRED` |
| Temporal knowledge graph (entities / triples / `valid_from` / `valid_to` / confidence / evidence links) | `PROVEN` (source per report; mature primitives) | `ADAPT` - Tier A | Strong concept; Ashley ontology needs more than triples. | Temporal Memory Assertions | Experience / Cognitive Graduation | `DESIGN ONLY` |
| Point-in-time / as-of queries | `PROVEN` | `ADAPT` - Tier A | Historical state reconstruction. | Temporal semantics | Experience / Cognitive Graduation | `DESIGN ONLY` |
| Atomic supersession / invalidation (validity update, half-open intervals) | `PROVEN` | `ADAPT` - Tier A | Replace-delete semantics preserve history. | Temporal semantics | Experience / Cognitive Graduation | `DESIGN ONLY` |
| Temporal KG as graph projection | `CONCEPT` | `DEFER` implementation | Useful projection, not core cognition. | Optional projection over assertions | Experience / Cognitive Graduation | `FUTURE` |
| Neighbor line expansion (`_expand_with_neighbors`) | `PROVEN` with known bug (issue #1580) | `ADAPT` | Use semantic/source adjacency (message UUID, thread, turn order, episode), not file-line adjacency. | Contextual adjacency | CONTEXT-BUDGET-01 | `DESIGN ONLY` |
| Interactive consolidation workflow (`mempalace consolidate`) | `PROPOSAL` (issue #1416, open) | `ADAPT` (pattern) + `REFERENCE` (CLI shape) + `REJECT` (universal human approval) | Ashley-owned adjudication; human review conditional. | Consolidation and learning | Experience / Cognitive Graduation | `DESIGN ONLY` |
| Background capture hooks + daemon queue | `PROVEN` | `ACCEPT` as design law | Memory maintenance stays out of foreground cognition. | Background memory processing | OPERATIONAL-CONTINUITY-01 (writer ownership) | `DESIGN ONLY` |
| Single-writer / queued maintenance | `PROVEN` (daemon pattern) | `ACCEPT` as design law | Useful as concurrency grows. | Writer ownership | OPERATIONAL-CONTINUITY-01 | `DESIGN ONLY` |
| Delete-by-source cascade cleanup | `REPORTED` (report: cleanup logic) | `ADAPT` | Important for future forgetting: governed dependency propagation. | Forgetting and redaction | OPERATIONAL-CONTINUITY-01 (law) + Graduation | `DESIGN ONLY` (partial `EXISTING`: `/forget` reconciles dependents) |
| Recency-weighted wake-up / startup recall | `REPORTED` (report: L1 wake-up ordering) | `ADAPT` | Excellent long-term fit as graduated recall. | Graduated recall | CONTEXT-BUDGET-01 | `DESIGN ONLY` |
| Worker diaries (`agent_name` tags) | `PROVEN` | `ADAPT` -> WorkerRunJournal | ONE ASHLEY remains; journals are evidence, not identities. | Worker memory | MODEL-FABRIC-01 (only if naturally needed) | `DESIGN ONLY` |
| Palace Wings/Rooms ontology | `PROVEN` (flat metadata filters; "+34%" retracted) | `REJECT` as cognition | Metadata scopes at most. | None (tag metadata only, if ever) | - | `REJECTED` |
| AAAK abbreviation / compression | `REFUTED` (12.4-point recall regression) | `REJECT` | Lossy compression harms retrieval; no token win on small snippets. | None | - | `REJECTED` |
| Direct MCP memory tools to cognition | `PROVEN` insecure patterns (issue #401) | `REJECT` | Wrong authority surface; input validation and capability licensing are Ashley-owned. | None | - | `REJECTED` |
| MemPalace as canonical memory | - | `REJECT` | Violates Ashley-owned state. | None | - | `REJECTED` |
| MemPalace sidecar now | `INFERRED` resource claims | `DEFER` | Unnecessary operational complexity on 4 GB Mint host; not prohibited forever. | Future derived sidecar (permitted, unselected) | Future, if measured need | `FUTURE` |
| ChromaDB as canonical store | - | `REJECT` | Retrieval substrate != memory authority. | None | - | `REJECTED` |
| ChromaDB as disposable future derived index | `NOT PROVEN` unreliable | `NOT REJECTED` (permitted, unselected) | Could someday be disposable derived infrastructure. | Non-decision | Future | `FUTURE` |
| "Remember everything forever" | - | `REJECT` (`SUPERSEDED` by governed forgetting) | Conflicts with Ashley memory governance and privacy semantics. | None | - | `REJECTED` |
| Multi-format transcript normalizer | `REPORTED` (report: normalize.py) | `REFERENCE` | Import tooling only; low priority. | Future import tooling | Future | `FUTURE` |
| Topic-weighted cross-domain tunnels | `PROPOSAL` (issue #1180) | `DEFER` / `REFERENCE` | No current need; sophisticated cross-domain graphing deferred. | None | Experience / Cognitive Graduation | `FUTURE` |
| Benchmark and retraction discipline | `PROVEN` (HISTORY.md retractions) | `ACCEPT` as evaluation law | No category errors; claims require measurement; retractions are published. | Evaluation / Qualification Plane | Every phase | `DESIGN ONLY` |
| Unvalidated extractor write authority | `PROVEN` (as MemPalace failure mode) | `REJECT` pattern | Background extraction may propose; it may not silently author belief. | Consolidation boundary | Every phase | `DESIGN ONLY` (law) |

---

## 7. Tiered Salvage Map

Tiering reflects Ashley value, not novelty.

### Tier S - Foundational architecture (freeze first)

- Canonical source evidence vs derived retrieval separation.
- Source provenance for derived memories.
- Rebuildable, disposable retrieval projections.
- Memory content as untrusted data (`MEMORY CONTENT != AUTHORITY`).
- Source evidence is not world truth.
- Derivation identity: every derived object can answer "what produced me?".
- Index staleness must be observable.

### Tier A - High-value mechanism (adapt, design later)

- Temporal Memory Assertions (validity intervals, observation/assertion time,
  supersession, invalidation, as-of queries).
- Hybrid lexical + semantic retrieval as an architecture (fusion unselected).
- Ashley-owned memory adjudication / consolidation.
- Contextual adjacency expansion using Ashley-native identifiers.
- Background projection / index maintenance as a design law.
- Single-writer / queued maintenance as a design law.

### Tier B - Useful features

- Graduated recall (recency- and importance-weighted wake-up).
- Delete-by-source governed dependency propagation (forgetting).
- FTS5 as the lexical substrate (spike then likely adopt).
- WorkerRunJournal / worker-result provenance (MODEL-FABRIC-01 only if
  naturally needed).
- Index freshness / staleness watermarking and projector checkpoints.

### Tier C - Low priority / reference only

- Multi-format transcript normalizer (reference for import tooling).
- Cross-domain topic tunnels (deferred, reference).
- Benchmark discipline lessons (applied via the Evaluation / Qualification
  Plane).
- MemPalace MCP and security findings (reference for Ashley input-validation
  requirements).

### Rejected

- MemPalace as canonical memory.
- Palace Wings/Rooms ontology as cognitive ontology (metadata scopes at most).
- AAAK as a memory language.
- Direct unrestricted MemPalace MCP access from cognition.
- ChromaDB as canonical identity/memory authority.
- "Never forget" as a memory law.
- Universal human approval for normal memory formation.
- Exact `_expand_with_neighbors` file-line implementation.
- MemPalace sidecar deployment now.

---

## 8. What Ashley Explicitly Does Not Inherit

- MemPalace's identity ontology (wings/rooms/drawers as cognitive objects).
- AAAK abbreviation and compression semantics.
- Unrestricted MCP tool authority or unfiltered argument dispatch.
- ChromaDB as canonical memory or as any currently selected index.
- The "remember everything forever" / verbatim-always philosophy; Ashley has
  governed deletion and redaction.
- The default human-admin memory model (human review for every assertion).
- The exact file-line neighbor expansion algorithm.
- Multi-agent identity semantics (`agent_name` tags as identity).
- Unrotated plaintext audit logs and metadata-paging overview patterns.
- Unvalidated extractor write authority to persistent knowledge.

---

## 9. Roadmap Placement

The roadmap is frozen. No reorder. No new phase. This mapping is fixed:

| Ashley phase | MemPalace-derived work |
|---|---|
| Sandbox M3-M7 | **Nothing.** |
| MODEL-FABRIC-01 | Worker result provenance / WorkerRunJournal concepts only if naturally required. |
| OPERATIONAL-CONTINUITY-01 | Only relevant infrastructure laws: canonical-vs-derived durable state; projector checkpoints; derived-state recovery; degraded-index behavior; index freshness/staleness; writer/maintenance ownership; rebuild semantics. Do NOT turn this phase into the memory retrieval phase. |
| PROCEDURAL-SKILL-GRADUATION | Reuse provenance / evidence laws where experience becomes reusable procedure. |
| COMPUTER-USE-01 | No significant MemPalace work. |
| LEARNED-AUTONOMY-01 | Provenance-bearing learned preference / trust assertions become relevant prerequisites. |
| CONTEXT-BUDGET-01 | **Primary retrieval implementation:** FTS5; vector mechanism spike; hybrid retrieval; RRF / fusion benchmark; contextual adjacency expansion; graduated recall; retrieval budgeting. |
| Experience / Cognitive Graduation + Hardening | **Primary higher-order memory work:** Temporal Memory Assertions; working theories; model of the human; contradiction handling; supersession; memory consolidation / adjudication; confidence; memory revision; forgetting; experience-driven identity development where constitutionally permitted. |

---

## 10. Technical Spikes

Unresolved experiments. Outcomes are not chosen in advance. None of these are
authorized implementation; they are questions to be answered in their phase.

1. **SQLite FTS5 retrieval design** on Ashley's actual memory corpus: tokenizer
   choice (trigram vs tokenized variants), content vs contentless tables, query
   patterns, ranking behavior.
2. **Vector retrieval implementation**: engine selection, embedding model,
   dimensionality, normalization, and index strategy.
3. **`sqlite-vec` or other lightweight vector mechanisms**: resource profile
   (RAM, CPU, index build time, query latency) on the actual Linux Mint host.
4. **RRF vs weighted fusion vs other fusion strategies** on Ashley's memory
   corpus: ranking stability across query lengths, ranking quality, and
   relative cost.
5. **Embedding model + resource profile** measured on Mint hardware. (The
   report's `bge-small` style suggestion is a candidate reference, not a
   selection.)
6. **Temporal assertion schema and query performance**: as-of queries at
   expected corpus sizes.
7. **Retrieval index rebuild and staleness detection**: watermark mechanics,
   projector versioning, observability of stale projections.

The report proposed five labeled spikes (RRF benchmark, sqlite-vec profile,
temporal graph queries, neighbor windowing, consolidation CLI). That list is
preserved here as reference context; the seven questions above are the
Ashley-side statement of what must actually be measured. In particular, the
"consolidation CLI" shape depends on the adjudication decision (Section 5.2)
and is not a human-review-everything prototype.

---

## 11. Open Questions

Unresolved architecture questions, kept separate from accepted decisions:

- Which vector engine / mechanism wins the vector spike?
- Which embedding model and dimensionality are appropriate on 4 GB Mint?
- Which fusion algorithm is selected (RRF, weighted, or another)?
- Which FTS5 configuration fits Ashley's corpus and query mix?
- What is the candidate-generation volume and quality for consolidation, and
  what adjudication thresholds are workable?
- What is the exact shape of the graduated recall policy?
- What is the final Temporal Memory Assertion SQL schema (schema is a spike,
  not a frozen decision)?
- What measured need would justify a derived sidecar, and what topology would
  it take?
- How is index staleness detected and surfaced mechanically?
- When (if ever) does automated consolidation become autonomous, and under
  what governance?
- Does Ashley ever need cross-domain topic graphing?
- How do Memory Assertions interact with the existing facts/episodes schema and
  migration machinery? (Interaction design is `NEEDS REVIEW`; this document
  does not invent a schema.)

---

## 12. Final Salvage Summary

### Top things to keep

1. Canonical evidence vs derived retrieval separation (index is never memory).
2. Source provenance on every derived memory.
3. Rebuildable, disposable retrieval projections.
4. Memory content is untrusted data; `MEMORY CONTENT != AUTHORITY`.
5. Derivation identity: every derived object answers "what produced me?".
6. Source evidence is authoritative about the recorded event, not about the
   world it describes.

### Top things to adapt

1. Temporal KG -> Temporal Memory Assertions (validity, supersession, as-of).
2. Hybrid lexical + semantic retrieval as architecture (fusion unselected).
3. Consolidation -> Ashley-owned adjudication with conditional human review.
4. Neighbor expansion -> contextual adjacency via message UUID / thread / turn
   / episode.
5. Background projection / single-writer maintenance as design laws.
6. Delete-by-source -> governed forgetting dependency propagation.
7. Wake-up recall -> graduated recall.
8. Worker diaries -> WorkerRunJournal.

### Top things to test (spikes)

1. FTS5 on Ashley's actual corpus.
2. Vector engine + embedding model resource profile on Mint.
3. `sqlite-vec` or alternative lightweight vector mechanism.
4. RRF vs weighted fusion on Ashley's corpus.
5. Temporal assertion query performance.
6. Index rebuild and staleness detection mechanics.

### Top things to reject

1. MemPalace as canonical memory.
2. Wings/Rooms ontology as cognition (metadata scopes at most).
3. AAAK as a memory language.
4. Unrestricted MCP memory access.
5. ChromaDB as canonical memory (unselected as any current index).
6. "Never forget" as a memory law.
7. Universal human approval for memory formation.
8. The exact file-line neighbor expansion implementation.
9. MemPalace sidecar deployment now.
