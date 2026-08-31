# 87 — W8 R6 Measurement and Preservation Plan

## Authority and scope

```text
WAVE_ID=W8
NAME=R6 Measurement and Preservation
PHASE4_ARCHITECTURE_SOURCE=69_R6_METABOLISM_MEASUREMENT_AND_PRESERVATION_CONTRACT.md; 72_GLOBAL_CROSS_WAVE_CONTRACTS.md; 73_FINAL_REMEDIATION_DEPENDENCY_DAG.md
PLAN_STATUS=MECHANICALLY_READY_READ_ONLY
SOURCE_MUTATION_AUTHORIZED=no
DATABASE_MUTATION_AUTHORIZED=no
RETENTION_ARCHIVE_DELETION_IMPLEMENTATION_AUTHORIZED=no
W9_STATUS=BLOCKED_NOT_AUTHORIZED
```

W8 measures existing state. It does not implement retention, archive, compaction, deletion, rebuild, repair, vacuum, checkpoint forcing, or production mutation.

## Measurement identity

Each capture receives `snapshotId=sha256(canonical manifest)` over:

- exact source/release identity and W1 Release Truth result when production is observed;
- host/environment class: passive local, isolated physical Mint read-only, or production read-only;
- OS/kernel, Node, SQLite, FTS5, filesystem, process start identity;
- nuclear, continuity, cognitive-sidecar, derived-index, legacy-index, Model Fabric control-root, evidence, and observability store paths represented by normalized identifiers, never secrets;
- file size, mtime, schema/user version, `PRAGMA data_version`, application schema identity, active derived generation/source fingerprint;
- capture start/end time and clock source;
- query bundle version, canonical SQL text, and SHA-256 per query;
- inclusions/exclusions, permission failures, concurrent-write notes, and content-redaction policy.

Cross-store results MUST retain each store's own snapshot boundary. They MUST NOT claim one ACID snapshot.

## Zero-mutation protocol

1. Record file hashes/size/mtime and database `data_version` before capture.
2. Prefer an existing backup/snapshot. Otherwise open the original using SQLite read-only URI and immediately execute `PRAGMA query_only=ON`.
3. Refuse capture if read-only mode cannot be proven. Do not create missing files.
4. Never issue `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `CREATE`, `DROP`, `ALTER`, `VACUUM`, `REINDEX`, `ANALYZE`, `PRAGMA wal_checkpoint`, writable pragmas, rebuild, reconcile, startup, forget, or effect APIs.
5. Run a SQL authorizer/refusal guard in the measurement process. Permit `SELECT`, read-only `PRAGMA`, and `EXPLAIN QUERY PLAN` only.
6. Record hashes/size/mtime/data versions after capture. Concurrent `data_version` change makes cross-query trend claims bounded/uncertain; any file metadata/content change attributable to the capture makes the run `INVALID`.
7. The evidence output directory MUST be outside all database/control roots and append-only per snapshot ID.

No production action is authorized by this plan. A physical or production capture requires separate read-only authorization.

## Known-store classification baseline

| Store/surface | Source authority | Initial class | Rebuild source |
|---|---|---|---|
| `nuclear.db` tables | `apps/agent-service/src/core/db.ts` | Mixed authoritative current/historical/observability | Generally not rebuildable as a whole |
| `continuity.db` | continuity source/schema | Authoritative current and historical | Backups/lineage protocol only |
| cognitive sidecar tables | `cognitive-v021/sidecar/schema.ts` | Mixed authoritative current/historical/operational | Table-specific |
| derived FTS DB | `retrieval/derived-store.ts` | Derived | Canonical sidecar conversation/memory sources |
| Model Fabric immutable artifacts | `model-fabric/activation.ts` and W1 | Authoritative lifecycle evidence | Not inferred/rebuilt from current route |
| logs/diagnostics/observer exports | diagnostics/exporter sources | Observability | Source events where retained |
| legacy `index.db` | current readers/writers | Historical/legacy until measured | Unknown |

The output MUST refine this per table. It MUST use `UNKNOWN` rather than infer authority or obsolescence.

## Read-only inventory algorithm

For every attached database, enumerate:

```sql
SELECT type, name, tbl_name, sql
FROM sqlite_schema
WHERE type IN ('table','index','view','trigger')
ORDER BY type, name;

PRAGMA page_count;
PRAGMA page_size;
PRAGMA freelist_count;
PRAGMA schema_version;
PRAGMA user_version;
PRAGMA data_version;
PRAGMA integrity_check;
```

`integrity_check` is optional when its work would impair runtime; omission is explicit. For each ordinary table name returned by `sqlite_schema`, quote the identifier mechanically and run:

```sql
SELECT COUNT(*) AS row_count FROM "<table>";
SELECT SUM(pgsize) AS allocated_bytes
FROM dbstat WHERE name = '<table-or-index>';
```

If `dbstat` is unavailable, report bytes `UNKNOWN`; do not approximate row payload contents. Use `PRAGMA table_info`, `foreign_key_list`, and `index_list` to identify timestamp, status, currentness, owner/conversation, and reference columns. No dynamic identifier may come from user input.

## Population and growth queries

For each table with a time column, run exact `MIN`, `MAX`, and fixed UTC bucket counts. Examples:

```sql
SELECT COUNT(*) total, MIN(created_at_ms) oldest_ms, MAX(created_at_ms) newest_ms
FROM inbox_events;
SELECT (created_at_ms / 86400000) utc_day, COUNT(*) inserts
FROM inbox_events GROUP BY utc_day ORDER BY utc_day;
SELECT state, COUNT(*) FROM in_flight_effects GROUP BY state ORDER BY state;
SELECT outcome, COUNT(*), MIN(at_ms), MAX(at_ms)
FROM effect_receipts GROUP BY outcome ORDER BY outcome;
```

Where a table lacks creation/update time, report growth `UNMEASURABLE_FROM_CURRENT_SCHEMA`; do not substitute file mtime. Trend estimates require two attributable snapshots and use `(newCount-oldCount)/(elapsed days)`, retaining both counts and boundaries.

## Reference frequency and currentness

Measure declared references and JSON reference fields without copying content. SQL references include:

```sql
SELECT assertion_key, COUNT(*) support_count
FROM sidecar_memory_supports GROUP BY assertion_key;
SELECT COUNT(*) orphan_supports
FROM sidecar_memory_supports s
LEFT JOIN sidecar_memory_assertions a ON a.assertion_key=s.assertion_key
WHERE a.assertion_key IS NULL;
SELECT superseded, COUNT(*) FROM working_context_items GROUP BY superseded;
SELECT status, COUNT(*) FROM concerns GROUP BY status;
SELECT status, COUNT(*) FROM future_triggers GROUP BY status;
SELECT cancelled, COUNT(*) FROM observation_subscriptions GROUP BY cancelled;
SELECT e.state, COUNT(*) FROM in_flight_effects e GROUP BY e.state;
SELECT COUNT(*) orphan_receipts FROM effect_receipts r
LEFT JOIN in_flight_effects e ON e.effect_id=r.effect_id
WHERE e.effect_id IS NULL;
```

JSON reference frequency uses `json_each` only to count normalized reference tokens after confirming JSON1. Artifacts contain table/column/ref-type/count and keyed hashes, not raw statements, payloads, claims, or message text. `last-read` and read frequency are `UNKNOWN` unless an existing authoritative read ledger records them; access-time metadata is not fabricated.

## Exact hot-path query suite

For every query, record `EXPLAIN QUERY PLAN`, repetitions, warmup, wall time, rows visited if available, returned row count, database data version before/after, and parameters represented by class/hash.

### Duplicate ingress lookup

Source: `evidence/conversation-log.ts`, `ingress/http.ts`.

```sql
SELECT conversation_id, lineage_id, ordinal
FROM conversation_evidence_discord_ids
WHERE discord_message_id = ?;
SELECT cycle_id FROM cycle_records
WHERE conversation_id = ? AND trigger_ref = ?
ORDER BY generation ASC LIMIT 1;
```

### Latest cycle and maximum generation

```sql
SELECT * FROM cycle_records
WHERE conversation_id = ?
ORDER BY generation DESC LIMIT 1;
SELECT MAX(generation) AS generation
FROM cycle_records WHERE conversation_id = ?;
```

### Due triggers

Mirror the exact clauses used by `fireDueTriggers()` after re-inspection, with fixed `nowMs`, optional conversation, and source limit:

```sql
SELECT * FROM future_triggers
WHERE status = 'scheduled' AND due_at_ms <= ?
ORDER BY due_at_ms ASC, trigger_id ASC LIMIT ?;
```

### Global inbox claim

Measure the selection `SELECT` only. Do not execute the claim update. Use the current W6 eligible-head predicate if W6 is implemented; otherwise measure the exact current pending/failed/expired predicate and label it `PRE_W6_SOURCE`.

### Observation subscription

Mirror `observation/subscriptions.ts`:

```sql
SELECT * FROM observation_subscriptions
WHERE conversation_id = ? AND cancelled = 0
ORDER BY subscription_id ASC;
SELECT COUNT(*) FROM observation_subscriptions
WHERE conversation_id = ? AND cancelled = 0;
```

### Working Context

Mirror `evidence/working-context.ts` and `thought/input.ts` after capturing exact source text:

```sql
SELECT * FROM working_context_items
WHERE conversation_id = ? AND superseded = 0;
```

Record count, selected bytes via `length(payload_json)`, plan, and latency. Do not emit payload.

### Authority receipt hydration

Measure both current source and W4 candidate query:

```sql
SELECT COUNT(*), SUM(length(claims_json)) FROM effect_receipts;
SELECT * FROM effect_receipts ORDER BY at_ms ASC;
```

The second query is measured in an isolated snapshot and results are discarded without serialization. Its elapsed work quantifies the current unbounded hydration in `authority/packs.ts::loadEffectReceipts()`. If W4 exists, also measure its bounded active/current receipt query.

### Effect/in-flight hydration

```sql
SELECT * FROM in_flight_effects WHERE effect_id=? OR idempotency_key=? LIMIT 1;
SELECT * FROM in_flight_effects WHERE cycle_id=? ORDER BY dispatched_at_ms ASC;
SELECT * FROM effect_receipts WHERE effect_id=?;
SELECT * FROM effect_receipts WHERE idempotency_key=?;
```

### Derived FTS growth and rebuildability

Read `derived_index_meta`, FTS table/count/allocated bytes, active generation/source fingerprints, canonical source counts/hashes using the same pure read algorithms as `computeMemorySourceHash()` and `computeConversationSourceHash()`. Do not call `reconcile*`, `rebuild()`, `syncAfterCommit()`, or startup. Rebuildability status is:

```text
VERIFIED_BY_EXISTING_EXACT_CANDIDATE_EVIDENCE
SOURCE_PRESENT_NOT_REBUILD_VERIFIED
SOURCE_MISSING
UNKNOWN
```

Only an existing attributable qualification can establish the first state.

### Redaction/reconciliation state

If W4 is implemented, query barrier state, derived journal state/age/attempts, active generation, invalid scopes, and physical stale counts read-only. Before W4, measure current tombstone/forget lineage and derived/source fingerprint mismatch, then label semantic eligibility `NOT_EXPLICITLY_REPRESENTED_PRE_W4`; do not repair.

## Observability growth

Enumerate diagnostic/log/receipt/attempt/counter tables from source and schema. Report population/bytes/time span/capability/provenance where explicit. For JSON payload columns, report `SUM(length(column))`, `MAX(length(column))`, and classification counts only. Do not emit content. Separate observability that is acceptance evidence from disposable debug output; when uncertain, classify `AUTHORITATIVE_HISTORICAL_CANDIDATE` and preserve.

## Measurement state machine and failures

```text
planned -> snapshot_opened -> collecting -> complete | incomplete | invalid -> evidence_frozen
```

- Missing store/table/permission: `UNKNOWN` or `NOT_APPLICABLE` with evidence.
- Query timeout: `INCOMPLETE`, with completed rows retained.
- Concurrent version change: retain boundaries; no atomic cross-query claim.
- Canonical/derived mismatch: finding only; no repair.
- Mutation guard or before/after proof failure: `INVALID`; stop.
- Interruption creates an incomplete immutable run. A resumed live capture gets a new snapshot ID unless the same immutable snapshot file is proven.

## Data-classification output

For every table/artifact:

```text
STORE
TABLE_OR_ARTIFACT
CLASS=AUTHORITATIVE_CURRENT|AUTHORITATIVE_HISTORICAL|DERIVED|OBSERVABILITY|UNKNOWN
OWNER
LIVE_READERS
LIVE_WRITERS
ROW_COUNT
ALLOCATED_BYTES
GROWTH_INTERVAL
CURRENTNESS_FIELDS
REFERENCE_IN_DEGREE
ORPHAN_CANDIDATES
READ_FREQUENCY_EVIDENCE
REBUILD_SOURCE
REBUILD_VERIFICATION
REDACTION_ELIGIBILITY
BACKUP_WATERMARK_COVERAGE
PRESERVATION_RULE
UNCERTAINTY
```

## Preservation requirements

- Preserve all authoritative current and historical state, identity/continuity lineage, receipts, revisions, forget/redaction history, qualification and release evidence.
- Preserve derived rows as-is during W8; invalidity does not authorize physical deletion.
- Preserve enough observability for attribution; duration remains undecided.
- Preserve legacy tables/indexes until live reader/writer and authority status are proven.
- Protect owner/conversation scope and omit secrets/private content from reports.
- Do not translate pressure into policy. State `NO_ACTION_EVIDENCE_INSUFFICIENT` where appropriate.

## Owner-decision packet for later W9

The packet contains:

1. snapshot manifests and zero-mutation proof;
2. store/table classification matrix;
3. population/bytes/growth and uncertainty;
4. reference/orphan/currentness/read-frequency evidence;
5. hot-path plan/latency/work distributions;
6. derived growth/rebuild evidence and redaction/reconciliation state;
7. observability growth;
8. pressure points and evidence gaps;
9. preservation constraints from governance;
10. options requiring owner decisions, without a recommended retention/archive/deletion implementation unless separately commissioned.

Until the owner accepts a W8 evidence packet and commissions architecture work:

```text
W9_PLAN_STATUS=BLOCKED_NOT_AUTHORIZED
W9_RETENTION_LAW=UNDECIDED
W9_ARCHIVE_LAW=UNDECIDED
W9_DELETION_LAW=UNDECIDED
```

## Acceptance

W8 is accepted only when all known stores are classified or explicitly unknown, every query is reproducible/read-only, snapshot identities are attributable, limitations are explicit, before/after zero-mutation proof passes, sensitive content is absent, and the packet can support an owner decision. A W8 packet never authorizes W9.
