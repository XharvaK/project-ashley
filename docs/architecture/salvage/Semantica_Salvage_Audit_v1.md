# Ashley SEM-01 Semantica Salvage Reconnaissance

Audit date: 2026-08-09

This is a source-level reconnaissance artifact. It is not an implementation,
adoption decision, deployment qualification, or runtime evaluation.

## Executive verdict

WHOLE PACKAGE: DO NOT ADOPT.

SALVAGE: LIMITED. Semantica contains useful deterministic algorithms and
interoperability patterns, but its package boundary crosses Ashley's semantic
authority boundaries. The only presently justified salvage gate is a bounded,
read-only W3C PROV-O interoperability spike over Ashley-owned evidence and
provenance. No Semantica state, graph, memory, policy, decision, resolver,
runtime, MCP server, or store may become Ashley authority.

The reconnaissance found no current Ashley code that can be retired because
Semantica is not integrated. Current Ashley LOC retired for every candidate is
0 proven.

## Evidence pin

### Ashley baseline

- Repository: C:\Users\Xharv\Projects\composer-assistant
- Branch: master
- HEAD: f502be26ad30cff5b51e9659801ea17a2996c940
- origin/master: f502be26ad30cff5b51e9659801ea17a2996c940
- HEAD subject: docs: clarify Thought responsibility
- Start status: clean

The baseline gate passed before this artifact was created. No Ashley source,
test, dependency, runtime, Mint host, sandbox, database, provider, or
production state was changed.

### Semantica baseline

- Official source: https://github.com/semantica-agi/semantica
- Remote: https://github.com/semantica-agi/semantica.git
- inspected ref: main
- inspected commit: 7dce9f1b69d83d0a077d3a785532af0d69b00018
- tag at inspected commit: none
- package metadata version: 0.6.0
- in-repository release-notes version: 0.5.0
- release pin status: SHA-pinned; no package installation or registry resolution
- license: MIT, copyright (c) 2026 Hawksight AI
- Python requirement: >=3.8

The source was shallow-cloned into a task-created temporary directory outside
the Ashley repository. No Semantica source was copied into Ashley. The
temporary clone is not an integration artifact.

Primary source anchors:

- pyproject.toml:6-15, 46-99, 100-249, 250-274
- LICENSE:1-22
- semantica/__init__.py:1-20
- ARCHITECTURE.md:14-96
- README.md:53-99, 152-166, 172-234
- RELEASE_NOTES.md:1-6, 154-186

### Method and limits

Inspected source, tests, package metadata, license, and architecture material
only. No Python environment was created, no dependencies were installed, no
Semantica test or server was executed, no live model/provider was called, and
no external service was contacted from Semantica. Test claims below describe
the checked-in test layout and named cases, not a fresh test run.

## Ashley authority invariants

| Ashley surface | Authority that remains local |
| --- | --- |
| Identity | Stable constitutional identity and boundaries in Ashley identity storage and prompts. External ontology/classification may annotate, never define, Identity. |
| Mind State | Dynamic state, active concerns, commitments, and grounded affect remain Ashley-owned. |
| Thought | Effort allocation, evidence selection, prioritization, uncertainty, completion, and intended cognitive outcomes remain Ashley Thought-owned. |
| Agency | Speak, silence, delay, ask, challenge, refuse, interruption, reserve, and commit remain Ashley Agency-owned. |
| Recall | Ashley's source-linked memory, episodes, facts, evidence links, redaction, forgetting, and eligibility remain the only behavioral Recall authority. |
| CapabilityAuthority | Capability release, live/shadow classification, promotion, rollback, and behavioral influence remain Ashley rollout-owned. |
| nuclear.db | Ashley's behavioral SQLite database remains the semantic behavioral store. |
| continuity.db | Ashley's authoritative lineage, sessions, forget previews, tombstones, and lineage checks remain the continuity authority. |
| Delivery | Discord delivery reservation, receipts, finalization, and receipt-backed archival remain Ashley-owned. |

Evidence in the current Ashley source includes:

- apps/agent-service/src/core/context-composer.ts:123-166 assembles peer
  outputs and does not reinterpret them.
- apps/agent-service/src/core/agency/thought.ts:114-225 validates Thought
  proposals and keeps the deterministic Agency floor.
- apps/agent-service/src/core/agency/resolve-evidence.ts:44-248 resolves
  selected references, drops missing/redacted records, and rejects shadow
  episodes and takes from behavioral materialization.
- apps/agent-service/src/core/provenance/migration-21.ts:1-40 fixes live or
  shadow provenance at write time and forbids observe-era time-shifting.
- apps/agent-service/src/core/continuity/entity-uuid.ts:4-43 supplies stable
  namespaced UUIDs and random entity UUIDs.
- apps/agent-service/src/core/continuity/db.ts:234-316 requires sidecar
  lineage and fails closed on mismatch.
- apps/agent-service/src/core/continuity/forget-preview.ts:17-388 stores
  exact owner- and lineage-bound forget targets and converts them to
  tombstones.
- apps/agent-service/src/core/delivery/finalize.ts:113-288 persists only
  receipt-backed delivered text and finalizes delivery state.

## Semantica architecture summary

Semantica is a broad Python knowledge-engineering package, not a narrow
provenance library. Its checked-in architecture is:

Sources -> ingest -> parse -> normalize -> split -> semantic extraction ->
conflict detection -> deduplication -> knowledge graph -> ontology/reasoning/
provenance/context and decisions -> vector/graph/triplet stores -> export,
visualization, REST, MCP, CLI, and explorer.

The package exposes:

- graph-native ContextGraph and decision intelligence;
- W3C PROV-O-oriented provenance with in-memory and SQLite storage;
- conflict detection plus automatic conflict resolution strategies;
- similarity-based duplicate detection and entity merging;
- bi-temporal facts, Allen interval reasoning, snapshots, and revision history;
- ontology, OWL, SKOS, and optional SHACL functions;
- forward chaining, Rete, Datalog, SPARQL, and explanation engines;
- agent memory/context helpers with vector and graph integration;
- multi-source ingestion, extraction, normalization, and external connectors;
- pluggable graph/vector/triplet stores;
- REST, MCP, CLI, worker, and explorer runtime surfaces.

Semantica's own architecture can be useful as a comparator. It cannot be
treated as a second Ashley semantic stack.

## Broad triage matrix

### Capability and overlap matrix

| Area | Exact source paths and tests | Purpose | Major dependencies | Persistence and independent use | Closest Ashley interface | Semantic-overlap risk | Final disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Provenance / W3C PROV-O | semantica/provenance/schemas.py, manager.py, storage.py, integrity.py, bridge_axiom.py; tests/provenance/test_manager.py, test_storage.py, test_integration.py | Typed source, agent, activity, derivation, invalidation, lineage, checksum, and PROV export | Python stdlib, sqlite3; rdflib for export | In-memory or its own SQLite provenance table; independently importable | Ashley provenance migrations, evidence links, resolve-evidence, continuity tombstones | High if used as authority; low only as a downstream exporter | SALVAGE SPIKE RECOMMENDED as STANDARD_INTEROP |
| B. Conflict detection / resolution | semantica/conflicts/conflict_detector.py, conflict_resolver.py, source_tracker.py, conflicts_provenance.py; tests/conflicts/test_conflicts.py | Find differing values and optionally choose a value by voting, credibility, recency, or confidence | Python stdlib and Semantica source tracker | Mostly in-memory detector/tracker and resolution history; independently importable | Ashley evidence selection, identity boundaries, Thought, Agency | Very high for truth resolution; detector is advisory only | REFERENCE ONLY |
| C. Dedup / entity resolution | semantica/deduplication/similarity_calculator.py, duplicate_detector.py, cluster_builder.py, entity_merger.py, merge_strategy.py, deduplication_provenance.py; tests/deduplication/test_deduplication.py | Similarity candidates, union-find duplicate groups, merged entities, relationship union | Python stdlib plus optional embedding paths; package ML dependencies | In-memory candidates, groups, and merge history; no Ashley persistence contract | Ashley immutable entity_uuid, source identity, forget, redaction, relationship lineage | Critical: destructive merge and source/forget boundary loss | REJECT FOR ASHLEY |
| D. Temporal / bi-temporal / history | semantica/kg/temporal_model.py, temporal_reasoning.py, temporal_query.py, temporal_query_rewriter.py, kg/schemas/temporal_snapshot_v1.json, change_management/version_storage.py; tests/kg/test_temporal_reasoning.py, tests/change_management/test_temporal_versioning.py, tests/test_395_temporal_semantics_comprehensive.py, tests/test_401_temporal_provenance_export.py | Valid and transaction time, interval algebra, point/range queries, snapshots, revisions, checksums | Mostly stdlib; SQLite for version storage; optional LLM and rdflib paths | In-memory graph plus optional JSON/SQLite snapshots; independently usable as algorithms | Ashley continuity, own-time, Mind State timestamps, source-linked evidence | High if it becomes a third historical authority; useful only as a rebuildable projection | REFERENCE ONLY |
| E. Context / causal graph | semantica/context/context_graph.py, causal_analyzer.py, context_provenance.py, decision_context.py, decision_query.py; tests/context/* | Nodes, edges, causal traversal, context graph state, decisions | Python stdlib, optional graph/vector integrations | ContextGraph is in-memory and JSON-file backed; other graph stores are separate | ContextComposer, Thought-selected evidence, Agency motivations | Critical if used as Recall, Mind State, or causal authority | REFERENCE ONLY |
| F. Ontology / SHACL | semantica/ontology/engine.py, ontology_validator.py, owl_generator.py, ontology_provenance.py, explorer/routes/ontology.py; tests/ontology/*, tests/explorer/* | Ontology generation/validation, OWL/SKOS, SHACL generation and validation, alignments | rdflib; optional pyshacl; explorer FastAPI stack | Graph/session and route-level stores; ontology drafts/proposals are separate | Identity review and bounded classification only | Critical if ontology defines Ashley Identity, boundaries, or truth | REFERENCE ONLY |
| G. Deterministic reasoning | semantica/reasoning/reasoner.py, datalog_reasoner.py, rete_engine.py, sparql_reasoner.py, explanation_generator.py; tests/reasoning/* | Forward/backward chaining, Datalog/Rete/SPARQL inference, explanation | Mostly Python stdlib; networkx/rdflib/Semantica graph paths vary | Working-memory objects and graph backends; independently importable algorithms | Thought reasoning and evidence prioritization | High if inferred facts become Ashley facts or decisions | REFERENCE ONLY |
| H. Decision recording / intelligence | semantica/context/decision_models.py, decision_recorder.py, decision_query.py, decision_methods.py, decision_context.py; tests/context/* | Permanent graph decision nodes, precedents, policy application, causal links, embeddings | GraphStore, optional EmbeddingGenerator, provenance manager | Graph-backed or ContextGraph decision records | Ashley decision log, Thought, Agency, delivery ledger | Critical: duplicates Thought/Agency/decision authority | REJECT FOR ASHLEY |
| I. Policy / compliance | semantica/context/policy_engine.py, decision_models.py; tests/context/* | Add/version policies, evaluate compliance, record exceptions and overrides | GraphStore, optional Cypher backend | Graph-backed policy nodes and edges; independently importable | Ashley Constitution, identity boundaries, CapabilityAuthority, Agency | Critical: external policy engine could authorize or override Ashley | REJECT FOR ASHLEY |
| J. Agent context / memory | semantica/context/agent_context.py, agent_memory.py, context_retriever.py, entity_linker.py; tests/context/* | RAG memory, vector retrieval, graph context, retention and deletion | numpy, yaml, vector store, graph store, embedding models | Files, in-memory indexes, vector/graph backends; independently importable | Ashley Recall, Mind State, ContextComposer | Critical: direct replacement of Recall or Mind State | REJECT FOR ASHLEY |
| K. Ingestion / extraction / normalization | semantica/ingest/methods.py, file_ingestor.py, web_ingestor.py, db_ingestor.py, stream_ingestor.py; semantica/parse/, normalize/, semantic_extract/; tests/ingest/, parse/, normalize/, semantic_extract/ | Files, web, APIs, streams, databases, repositories, email, NER, relation/triplet extraction, normalization | requests/httpx, BeautifulSoup/lxml, document/database/cloud connectors, ML/NLP stack | Source-specific transient records and pipeline objects; independently importable | Ashley curiosity public retrieval and perception/attachment ingestion | Medium to high: untrusted reads must not become truth or authority | REFERENCE ONLY |
| L. Graph/vector/storage | semantica/graph_store/graph_store.py and backend files; semantica/vector_store/vector_store.py and backend files; semantica/triplet_store/; semantica/kg/knowledge_graph.py; tests/graph_store/, vector_store/, triplet_store/ | Graph CRUD, vector search, hybrid search, polyglot stores, triplet stores | FAISS, numpy, optional Neo4j/Redis/Neptune/Postgres/Qdrant/Weaviate/Pinecone/Milvus/Oxigraph | New stores and external services; independently importable but not Ashley authority | nuclear.db, continuity.db, Recall projections | Critical: third semantic store, dual-write, forgetting and lineage divergence | DO NOT ADOPT |
| M. MCP / REST / runtime | semantica/mcp_server/__init__.py, server.py, worker.py, cli.py, explorer/routes/; tests/explorer/ and runtime tests | Expose graph, decisions, extraction, reasoning, export, and analytics over network/stdio/runtime commands | FastAPI, uvicorn, pydantic, explorer/websocket stack, optional service dependencies | Own server process and graph session; independently runnable | Ashley agent-service routes and platform delivery | Critical: transport would bypass Thought, Agency, CapabilityAuthority, and receipts | DO NOT ADOPT |

### Economics, portability, and host cost

| Area | Current duplication in Ashley | Current Ashley LOC retired | Future bespoke work avoided | TypeScript portability | Linux Mint production cost | Economic disposition |
| --- | --- | --- | --- | --- | --- | --- |
| Provenance | Ashley already has write-time shadow/live labels, exact source-linked evidence, UUIDs, lineage, redaction, and receipts; only PROV export shape is missing | 0 proven | Moderate only for a future PROV-O mapping/export contract | Export mapping is feasible; Semantica manager/storage is not a direct TS dependency | Low for a read-only exporter; high for the full Python manager/store | One bounded STANDARD_INTEROP spike |
| Conflict | No generic resolver is adopted; Ashley's domain-specific evidence and boundaries already decide admissibility | 0 proven | Low to moderate basic disagreement reporting; no safe truth resolution avoided | Detector concepts port; automatic weighting must not | Low for an advisory projection; high if resolver/store is added | Reference only |
| Dedup | No generic entity merger is adopted; Ashley's UUID, relationship lineage, and forget graph are stronger requirements | 0 proven | None proven; a safe candidate projection would still need Ashley-specific work | Similarity code can port; merge semantics must not | Medium for computation; critical for data integrity if merged | Reject |
| Temporal | Ashley owns continuity/own-time timestamps and relationship state; no Semantica temporal graph is present | 0 proven | Possibly interval utilities for a future query need; not enough evidence for adoption | Pure interval algorithms can port after an explicit product need | Low as pure code; high if SQLite graph snapshots become a third store | Reference only |
| Ontology/SHACL | Ashley has Identity review and classification boundaries | 0 proven | Maybe format validation, not Identity governance | RDF/SHACL libraries and semantics require a separately qualified adapter | High dependency and review cost | Reference only |
| Reasoning | Ashley Thought and deterministic Agency floor already own behavioral reasoning | 0 proven | None without replacing authority | Pure algorithms port, but semantic contract does not | Low algorithm cost, high authority risk | Reference only |
| Decision/policy/memory | Direct overlap with Thought, Agency, Recall, Mind State, CapabilityAuthority | 0 proven | None safely; adoption would create competing authority | Porting does not remove semantic conflict | High | Reject |
| Ingest/extract | Ashley has bounded curiosity/perception pipelines with explicit provenance and capability gates | 0 proven | Narrow parser/normalizer ideas only | Many Python/ML dependencies make direct port poor | High | Reference only |
| Storage/runtime | Ashley has nuclear.db, continuity.db, agent-service, and Discord delivery | 0 proven | None; would add a third store/service | No direct portability | Very high: Python runtime, optional services, ports, operations, supply chain | Do not adopt |

## Deep dive 1: Provenance and W3C PROV-O

### Implementation and tests

Primary implementation:

- semantica/provenance/schemas.py:35-227 defines ProvenanceEntry with source,
  quote/location, timestamps, confidence, parent/used/derived/revision fields,
  invalidation fields, and serialization.
- semantica/provenance/manager.py:59-187 constructs the manager, selects
  in-memory or SQLite storage, assigns sequence/checksum/previous-checksum,
  and persists entries.
- semantica/provenance/manager.py:263-415 tracks entities, archives prior
  versions, and creates parent/derived/revision links in an SQLite transaction.
- semantica/provenance/storage.py:391-741 defines SQLiteStorage, WAL and busy
  timeout configuration, BEGIN IMMEDIATE transactions, migrations, the
  provenance table, and indexes.
- semantica/provenance/manager.py:1011-1085 invalidates by preserving the old
  entry under a versioned key and appending a chained invalidated entry.
- semantica/provenance/manager.py:1203-1412 exports PROV RDF and checks
  references.
- semantica/provenance/manager.py:1415-1490 verifies checksum, sequence, and
  previous-checksum chain continuity.

The implementation is a real, independently usable source package. Its
storage is not merely a log: track_entity and invalidate write and revise its
own authority-shaped records. That write path is outside Ashley's acceptable
salvage seam.

Checked-in test evidence is substantial:

- tests/provenance/test_manager.py:148-1659 covers tracking, parent and
  derived-from precedence, transactions, savepoint rollback, invalidation,
  deleted-row chain detection, qualified PROV export, revision history, and
  temporal passthrough.
- tests/provenance/test_storage.py:18-476 covers in-memory/SQLite persistence,
  schema migration, lineage, descendants, and chain head.
- tests/provenance/test_integration.py:17-287 covers cross-module use, bulk
  tracking, checksums, failure behavior, and both storage modes.

### Data model, behavior, and resource profile

- Data model: typed entities, agents, activities, source references,
  derivations, revisions, invalidations, bundles, and audit-chain metadata.
- Public interface: ProvenanceManager, ProvenanceStorage, InMemoryStorage,
  SQLiteStorage, and export/check/lineage helpers.
- Errors: invalid entity types and missing invalidation targets raise; direct
  tracking paths log storage failures and return a safe prior entry or None;
  chain/reference checks return structured diagnostics.
- Persistence: one Semantica-owned SQLite provenance table or process memory.
- Determinism: checksum and chain calculations are deterministic for fixed
  fields; timestamps, UUIDs, and insertion sequence are runtime-generated.
- Mutation: tracking and invalidation mutate storage; export_prov, check, and
  verify_chain are read-only over that store.
- Network/threading: core provenance has no network path; SQLite uses locks,
  WAL, busy timeout, and transaction contexts.
- Resource behavior: bulk and concurrency tests exist; lineage depth and
  storage volume remain caller/resource concerns.
- Export dependency: rdflib is used by the RDF export path; the package also
  declares it in core dependencies.

### Ashley fit

The Ashley-compatible seam is not ProvenanceManager. It is a downstream
adapter that reads Ashley-owned rows and emits a standard representation. The
adapter must:

1. read only from Ashley-authorized evidence/provenance projections;
2. preserve Ashley entity_uuid, owner, source message, classification,
   lineage, and receipt references;
3. represent redaction/forgetting as Ashley-authorized omission or explicit
   invalidation metadata, never resurrecting text;
4. never feed PROV output back into Recall, Thought, Mind State, Identity, or
   Agency;
5. never create a second writable provenance authority.

Current Ashley LOC retired: 0 proven. Future bespoke work potentially avoided:
moderate for a standards mapping and export contract only. The manager,
SQLite schema, automatic invalidation, and source-credibility machinery are
not retireable Ashley code.

Classification: SALVAGE SPIKE RECOMMENDED — STANDARD_INTEROP.

## Deep dive 2: Conflict detection and resolution

### Implementation and tests

Primary implementation:

- semantica/conflicts/conflict_detector.py:20-134 defines conflict types and
  Conflict records; 136-557 groups values by entity and records sources;
  558-597 calculates confidence, severity, and recommended action.
- semantica/conflicts/source_tracker.py:98-159 keeps entity/property/
  relationship source maps and source credibility in memory; 159-379 tracks
  sources and reports disagreements.
- semantica/conflicts/conflict_resolver.py:20-119 defines voting,
  credibility-weighted, most-recent, first-seen, highest-confidence, manual,
  and expert strategies.
- semantica/conflicts/conflict_resolver.py:181-272 resolves a conflict and
  appends an in-memory ResolutionResult; 355-518 implement automatic
  value-selection strategies.
- semantica/conflicts/conflicts_provenance.py is a wrapper around source
  tracking and provenance.

tests/conflicts/test_conflicts.py:63-243 covers source tracking, batch
failure, detector output, resolver strategies, analyzer behavior, and an
investigation guide. It does not prove a domain-safe truth authority, Ashley
forget propagation, immutable UUID preservation, or durable provenance
lineage.

### Boundary finding

Conflict detection is not truth resolution. Semantica's detector produces
candidate conflicts, which is potentially useful as an advisory projection.
Its resolver nevertheless returns resolved values using generic voting,
source credibility, recency, and confidence. Those weights are not evidence
that a value is true and cannot write Ashley facts, Identity, Mind State,
Recall, or decisions.

The source tracker itself stores the latest property value in an in-memory
mapping and treats source credibility as a configurable number. That is not
Ashley provenance, user authority, constitutional priority, or forgetting
semantics.

### Ashley fit and economics

A safe future shape would be a read-only conflict-candidate report derived
from Ashley source-linked records, with each candidate carrying exact Ashley
references and no chosen winner. It would need owner scoping, redaction
filtering, entity_uuid preservation, lineage checks, and an explicit
advisory/untrusted status. Semantica's resolver must be excluded.

Current Ashley LOC retired: 0 proven. Future bespoke work avoided: low to
moderate and speculative because Ashley has no generic conflict product
requirement established by this audit. Pairwise/source-map concepts are
portable to TypeScript; generic resolver semantics are not acceptable.

Classification: REFERENCE ONLY.

## Deep dive 3: Deduplication and entity resolution

### Implementation and tests

Primary implementation:

- semantica/deduplication/similarity_calculator.py:1-831 calculates string,
  property, relationship, and optional embedding similarity.
- semantica/deduplication/duplicate_detector.py:75-710 compares entity pairs,
  creates confidence-ranked candidates, applies result limits, and
  detect_duplicate_groups at 322+ uses union-find grouping.
- semantica/deduplication/entity_merger.py:66-293 detects groups, merges them,
  and stores only process-local merge history.
- semantica/deduplication/merge_strategy.py:53-570 selects a base entity,
  applies keep-first/last/most-complete/highest-confidence/merge-all rules,
  resolves property conflicts, unions relationships, and emits merged_from
  metadata.
- semantica/deduplication/deduplication_provenance.py:21-76 attempts to import
  .deduplicator.Deduplicator, but no deduplicator.py exists in the inspected
  directory. This wrapper is therefore not evidence of a reliable adoption
  seam.

tests/deduplication/test_deduplication.py:45-603 covers similarity,
  candidates, groups, incremental detection, merge strategies, provenance
  metadata, result limits, sorting, and input validation. The tests
  intentionally assert that keep-first and keep-last choose different source
  IDs; this demonstrates a generic merge operation, not Ashley-safe identity
  preservation.

### Boundary finding

Semantica's merged entity retains a selected source ID and records merged_from
metadata. It does not prove:

- Ashley immutable entity_uuid preservation across every source row;
- continuity lineage and sidecar tombstone propagation;
- owner-scoped forget previews and receipt-backed redaction;
- evidence-link and relationship-lineage preservation;
- non-resurrection after source redaction;
- safe handling of conflicting facts without selecting a truth.

The candidate detector alone could generate an advisory duplicate projection,
but the package's named EntityMerger and MergeStrategyManager are destructive
semantic operations. They cannot touch Ashley authority.

### Ashley fit and economics

No current Ashley module should be retired. A future advisory candidate
projection would require bespoke Ashley-specific rules around source identity,
entity_uuid, relationship lineage, and forget. It would not be a drop-in
Semantica salvage. Similarity algorithms are portable in principle; the
merger's semantic contract is not.

Current Ashley LOC retired: 0 proven. Future bespoke work avoided: none proven.

Classification: REJECT FOR ASHLEY.

## Deep dive 4: Temporal, bi-temporal, and context graph behavior

### Implementation and tests

Primary implementation:

- semantica/kg/temporal_model.py:17-136 provides BiTemporalFact wrappers for
  valid_from, valid_until, recorded_at, and superseded_at while retaining
  relationship dictionaries.
- semantica/kg/temporal_reasoning.py:43-260 is pure Python interval
  reasoning, including all thirteen Allen relations, active_at, gap/coverage,
  timeline, retroactive coverage, and granularity normalization.
- semantica/kg/temporal_query.py:41-837 filters point/range queries and
  reconstructs self-consistent graph snapshots using valid or transaction
  axes.
- semantica/kg/temporal_query_rewriter.py:185-478 has a deterministic regex
  path and an optional injected LLM path. Only the deterministic core is
  considered here; the optional LLM path is not an Ashley authority seam.
- semantica/kg/temporal_query.py:1142-1590 provides TemporalVersionManager,
  in-memory/SQLite snapshot storage, revision application, snapshot
  validation, and checksum verification.
- semantica/change_management/version_storage.py:55-585 provides version
  storage and a mutation_log. SQLiteVersionStorage.delete removes snapshots;
  this is not an Ashley continuity tombstone.
- semantica/context/context_graph.py:302-413 defines temporal nodes/edges;
  980-1060 saves and loads JSON; 1434-1447 clears all graph state; and
  1861-1906 returns a serializable state_at snapshot.

Checked-in tests are broad:

- tests/kg/test_temporal_reasoning.py:19-156 covers Allen relations, open
  bounds, gaps, coverage, timelines, retroactive coverage, normalization,
  open ranges, and granularity.
- tests/kg/test_temporal_query_rewriter.py:24-418 covers regex phrases,
  rewritten queries, LLM fallback, and the no-reconstruct contract.
- tests/change_management/test_temporal_versioning.py:46-508 covers
  snapshots, invalid input, checksums, revisions preserving history,
  collision-resistant revision IDs, diffs, and SQLite persistence.
- tests/test_395_temporal_semantics_comprehensive.py:52-1127 covers UTC
  normalization, bitemporal fields, query filtering, consistency issues,
  pattern metrics, state_at, decision windows, and temporal trace queries.
- tests/test_401_temporal_provenance_export.py:40-389 covers recorded time,
  revision history, OWL-Time export, transaction axis, RDF parsing, snapshot
  validation, and migration.

### Boundary finding

The deterministic interval algebra is technically attractive and has no
intrinsic network or model dependency. The surrounding graph and version
layers are still a separate in-memory/JSON/SQLite historical system. They do
not carry Ashley owner scope, authoritative continuity lineage, stable
Ashley IDs, forget tombstones, receipt-backed redaction, or CapabilityAuthority.

Semantica's apply_revision preserves the original fact and emits a
superseded/replacement pair, which is safer than in-place overwrite. That is
still a derived graph revision model, not permission to write Ashley
nuclear.db or continuity.db. ContextGraph.state_at is a projection query;
ContextGraph.clear and JSON persistence show that its graph state is owned by
the Semantica object/file, not by Ashley continuity.

### Ashley fit and economics

The safe future seam is a rebuildable, read-only temporal projection keyed by
Ashley entity_uuid and validated against continuity lineage. It must be
recomputable from Ashley sources, omit redacted material, and never be used to
authorize a current Thought or Agency decision. This is not recommended
without a concrete point-in-time product requirement.

Current Ashley LOC retired: 0 proven. Future bespoke work avoided: possible
interval utility work only; no current semantic layer can be retired.

Classification: REFERENCE ONLY.

## Whole-package economics

### Package closure

pyproject.toml declares a large default dependency closure including numpy,
pandas, scipy, scikit-learn, umap-learn, spaCy, transformers, torch,
sentence-transformers, rdflib, networkx, plotting/viz libraries, HTTP and
document parsers, FAISS, fastembed, ONNX Runtime, pydantic, and supporting
utilities. Optional groups add LLM providers, pyshacl, database/cloud
connectors, graph backends, vector backends, queues, monitoring, explorer,
GPU, Agno, and split/chunking packages.

The package also exposes semantica-server, semantica-worker,
semantica-explorer, and semantica-mcp entry points. Its REST server binds
0.0.0.0:8000 by default; its MCP server lazily owns a ContextGraph and can
load SEMANTICA_KG_PATH. These are runtime surfaces, not salvageable Ashley
semantics.

### Runtime and operations

Whole-package adoption would introduce a Python runtime beside Ashley's
TypeScript/Node agent-service, a second graph/context model, multiple
optional external stores and services, another dependency supply chain,
another upgrade/test matrix, and a new process/API/MCP operational surface.
It would also create dual-write, data retention, and forgetting questions that
the package does not answer in Ashley's terms.

The production host is Linux Mint only, but platform compatibility alone does
not qualify a Python package for production. No Mint installation, package
installation, restart, deployment, or live evaluation was performed.

### Whole-package verdict

DO NOT ADOPT. Do not make Semantica a framework substrate, second semantic
store, Recall implementation, Thought/Agency implementation, policy engine,
decision authority, or runtime sidecar.

## Source-port economics

| Source slice | Port shape | What may be carried | What must not be carried | Gate |
| --- | --- | --- | --- | --- |
| Provenance export mapping | STANDARD_INTEROP | Stable PROV-O vocabulary, source/activity/entity mapping, invalidation/export format | Semantica ProvenanceManager writes, storage, source credibility, or authority | One read-only exporter spike |
| Conflict candidate calculation | PORT_CONCEPT | Candidate disagreement data shape and deterministic comparison ideas | Automatic voting, credibility, recency, confidence truth selection | Only if Ashley product requirement appears |
| Similarity candidate calculation | PORT_CONCEPT | Bounded advisory similarity scores | EntityMerger, base-ID selection, merge_all, source deletion, UUID replacement | Not recommended by this audit |
| Temporal interval algebra | PORT_CONCEPT | Pure interval relations, open bounds, UTC normalization | ContextGraph ownership, third snapshots DB, revision authority, LLM rewrite | Only after point-in-time requirement |
| Agent memory/context | NONE | General architectural comparison only | AgentMemory, RAG retrieval, vector memory, retention authority | Reject |
| Ontology/policy/decision/runtime | NONE | Protocol awareness only | Identity, policy, decision, MCP, REST, or execution semantics | Reject |

No Semantica code was copied. If future work copies MIT-covered code, retain
the MIT permission and copyright notice from LICENSE and re-audit the copied
surface. This audit creates no license obligation beyond the repository
artifact because it does not copy source implementation.

## Current Ashley code retirement

Static search found no Semantica integration in apps, and Ashley already owns
the relevant semantic surfaces:

- provenance authority: migration-21.ts and migration-22.ts;
- continuity/UUID/forget authority: entity-uuid.ts, db.ts, forget-preview.ts;
- Recall and redaction: memory/threads.ts, memory/episodes.ts, memory/forget.ts;
- Thought evidence: agency/resolve-evidence.ts, agency/thought.ts;
- Agency decisions: agency/decide.ts and agency/log.ts;
- context assembly: context-composer.ts;
- delivery receipts: delivery/store.ts and delivery/finalize.ts.

Therefore:

- provenance candidate: 0 current Ashley LOC retired;
- conflict candidate: 0 current Ashley LOC retired;
- dedup candidate: 0 current Ashley LOC retired;
- temporal/context candidate: 0 current Ashley LOC retired;
- all other areas: 0 current Ashley LOC retired.

No speculative LOC retirement estimate is used.

## Future bespoke work avoided

The only material future work this audit can identify with enough evidence to
justify a bounded gate is a standards mapping from Ashley-owned provenance
records to a read-only PROV-O export. It may avoid inventing a vocabulary and
export contract from scratch, but it does not avoid Ashley-specific source,
owner, lineage, redaction, and capability checks.

Semantica conflict resolution, entity merging, agent memory, policy,
decision-intelligence, graph storage, and runtime surfaces would not avoid
future bespoke Ashley work. They would replace or compete with it. Temporal
interval algorithms may reduce utility-level code later, but the product
need is not established by SEM-01.

## License boundary

The inspected source declares MIT and LICENSE carries:

Copyright (c) 2026 Hawksight AI

No Semantica code was copied into Ashley. A future copied implementation must
retain the MIT permission and copyright notice, preserve attribution in the
appropriate distribution surface, and pass a separate source-port review.
An external PROV-O format mapping does not require adopting Semantica code.

## Host/runtime implications

The package requires Python >=3.8 and declares a broad default dependency
closure. Its optional surface includes graph databases, vector databases,
cloud connectors, queue systems, monitoring, explorer services, LLM clients,
and model runtimes. The REST server, explorer, worker, and MCP entry points
would create additional processes and operational ownership.

Ashley production remains Linux Mint only and Discord-only. SEM-01 did not:

- install Python or Semantica;
- change Node or package dependencies;
- open a server, MCP process, port, database, or external store;
- change Mistral routing or provider configuration;
- enable Recall, apply, sandbox, or production;
- run Mint commands or deploy anything.

## Rejected integration shapes

Reject all of the following:

1. Importing Semantica as a runtime dependency of agent-service.
2. Running Semantica as a second behavioral memory or graph authority.
3. Replacing nuclear.db or continuity.db with ContextGraph, AgentMemory, or
   Semantica version storage.
4. Letting ProvenanceManager own Ashley provenance, forgetting, or lineage.
5. Letting ConflictResolver select Ashley truth by vote, credibility, recency,
   or confidence.
6. Letting EntityMerger merge Ashley entities or relationship records.
7. Letting AgentContext or vector memory feed Recall without Ashley evidence
   and CapabilityAuthority gates.
8. Letting DecisionRecorder or PolicyEngine create or authorize Ashley
   decisions.
9. Letting MCP, REST, CLI, worker, or explorer routes bypass Thought, Agency,
   capability release, delivery reservation, or receipt finalization.
10. Dual-writing Ashley facts into Semantica stores.
11. Treating a graph snapshot, RDF export, trace, or framework checkpoint as
    continuity, provenance authority, delivery receipt, or consent.
12. Reintroducing the optional LLM temporal query rewrite path as behavioral
    authority.

## Recommended bounded spikes

### Spike 1: Ashley-owned provenance to read-only W3C PROV-O export

Status: recommended for human approval only. Do not execute as part of SEM-01.

- Question: Can Ashley's existing source-linked, owner-scoped, lineage-checked
  evidence be exported as standards-compliant PROV-O without creating a
  writable external provenance store?
- Hypothesis: A narrow exporter/projection can provide interoperability while
  preserving Ashley authority and avoiding Semantica package adoption.
- Seam: a read-only adapter over Ashley's authorized provenance/evidence rows;
  output is a file or returned representation only.
- Candidate source evidence: Semantica schemas.py and the export portion of
  manager.py; Ashley resolve-evidence.ts, migration-21.ts, entity-uuid.ts,
  continuity db.ts, and forget-preview.ts.
- Minimal fixture: one owner, one user message, one source-linked fact, one
  live and one shadow evidence row, one redacted row, one forgotten target,
  one continuity lineage, and one receipt reference.
- Positive proof: output parses as PROV-O and preserves entity_uuid/source/
  owner/lineage role, activity attribution, revision relationship, and
  invalidation/redaction status without importing Semantica state.
- Negative proof: shadow, redacted, forgotten, lineage-mismatched, and
  owner-mismatched rows cannot reappear as behavioral evidence; export cannot
  write nuclear.db or continuity.db.
- Authority invariant: output is downstream/read-only and cannot influence
  Identity, Mind State, Thought, Agency, Recall, CapabilityAuthority, or
  Delivery.
- Dependency constraint: no Semantica installation and no second database;
  prefer a format adapter or narrowly ported exporter.
- Accept only if: Ashley source identity, immutable UUIDs, lineage, forgetting,
  provenance labels, and receipt semantics remain exact and the adapter is
  rebuildable.
- Reject if: export requires adopting ProvenanceManager/SQLiteStorage,
  writes back, introduces unresolved truth semantics, or cannot represent
  forgetting safely.

### Spike 2

None recommended. Temporal interval and conflict-candidate concepts remain
reference material until a concrete Ashley product requirement and owner
seam are approved.

## What not to do

Do not install, vendor, import, wrap, deploy, or evaluate Semantica in Ashley
on the strength of this reconnaissance. Do not change architecture documents,
salvage maps, dossiers, Recall, sandbox, model routing, dependencies,
databases, or Mint. Do not turn a passing comparator or a standards export
into a release claim.

## Final decision table

| Candidate | Evidence-backed value | Authority risk | Current Ashley LOC retired | Decision |
| --- | --- | --- | --- | --- |
| Provenance manager/export | Strong PROV-O model, lineage, invalidation, and export tests; manager itself owns a competing store | High for manager; low for read-only export | 0 | One bounded STANDARD_INTEROP spike only |
| Conflict detector/resolver | Detector can produce disagreement candidates; resolver uses generic automatic value selection | High | 0 | REFERENCE ONLY; no resolver adoption |
| Dedup/entity merger | Good candidate ranking and test coverage; merge semantics select a base and combine values | Critical | 0 | REJECT FOR ASHLEY |
| Temporal/context graph | Deterministic interval algebra and rich point-in-time tests; graph/version stores are derived and separate | High if authoritative | 0 | REFERENCE ONLY |
| Whole Semantica package | Broad capabilities but Python/dependency/store/runtime closure and semantic overlap | Critical | 0 | DO NOT ADOPT |

## Human next gate

ONE BOUNDED SPIKE: the read-only Ashley-owned provenance to W3C PROV-O
interoperability spike described above.

Do not execute it as part of SEM-01. SEM-01 ends with this audit artifact.
