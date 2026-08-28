# 04 — Sidecar v1 storage and dispatch contract

**Packet R3.** Sidecar schema version is **1** through candidate freeze. Phase 00 applies this entire DDL. Later phases **use** tables; they do not add unversioned tables.

Canonical types: [02_IMPLEMENTATION_SPECIFICATION.md](02_IMPLEMENTATION_SPECIFICATION.md). If this file and §W.1 disagree, that is a HARD BLOCKER — they must be identical SQL.

**Nuclear additive column** is **not** sidecar DDL. It is a nuclear `user_version` migration: `NUCLEAR_SUPPORTED_VERSION` observed on the **owner-selected baseline** plus one. Inspected SHA `c7c81c4` is 41, so that checkout would become 42. Do not hardcode 42 in timeless docs. Phase 00 records `OBSERVED_NUCLEAR_SUPPORTED_VERSION` after Gate A.

---

## Complete v1 DDL

File: `apps/agent-service/src/core/cognitive-v021/sidecar/schema-v1.sql`

```sql
CREATE TABLE IF NOT EXISTS cognitive_sidecar_meta (
  schema_version INTEGER NOT NULL,
  architecture_epoch TEXT NOT NULL,
  implementation_spec_version TEXT NOT NULL,
  thought_contract_version INTEGER NOT NULL,
  authority_epoch INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS conversation_evidence_log (
  row_id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT,
  created_at_ms INTEGER NOT NULL,
  discord_message_ids_json TEXT NOT NULL,
  reservation_id INTEGER,
  producing_cycle_id TEXT,
  architecture_epoch TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_status TEXT NOT NULL,
  data_classification TEXT NOT NULL,
  secret_omitted INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  UNIQUE (lineage_id, version)
);
CREATE INDEX IF NOT EXISTS idx_evidence_conversation_created
  ON conversation_evidence_log (conversation_id, created_at_ms);
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_discord_id
  ON conversation_evidence_log (conversation_id, json_extract(discord_message_ids_json, '$[0]'))
  WHERE json_array_length(discord_message_ids_json) >= 1;

CREATE TABLE IF NOT EXISTS inbox_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  claim_token TEXT,
  worker_id TEXT,
  lease_expires_at_ms INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claimed_at_ms INTEGER,
  consumed_at_ms INTEGER,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_inbox_pending
  ON inbox_events (conversation_id, created_at_ms)
  WHERE status IN ('pending', 'claimed', 'failed_retryable');

CREATE TABLE IF NOT EXISTS cycle_records (
  cycle_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  state TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  trigger_ref TEXT,
  occupant_id TEXT,
  authority_epoch INTEGER NOT NULL,
  architecture_epoch TEXT NOT NULL,
  admitted_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  compose_log_ids_json TEXT NOT NULL DEFAULT '[]',
  preempted_generation INTEGER
);

CREATE TABLE IF NOT EXISTS thought_steps (
  request_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  pass INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS working_context_items (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  superseded INTEGER NOT NULL DEFAULT 0,
  updated_cycle TEXT,
  updated_generation INTEGER
);

CREATE TABLE IF NOT EXISTS concerns (
  concern_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  assertion_key TEXT,
  status TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  updated_cycle TEXT
);

CREATE TABLE IF NOT EXISTS mind_occupancy (
  conversation_id TEXT NOT NULL,
  concern_id TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  updated_cycle TEXT NOT NULL,
  updated_generation INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, concern_id)
);

CREATE TABLE IF NOT EXISTS future_triggers (
  trigger_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  concern_id TEXT NOT NULL,
  due_at_ms INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS observation_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS observations (
  observation_id TEXT PRIMARY KEY,
  cycle_id TEXT,
  generation INTEGER,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS speech_outbox (
  outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  conversation_id TEXT NOT NULL,
  licensed_text TEXT NOT NULL,
  send_status TEXT NOT NULL,
  nuclear_reservation_id INTEGER,
  discord_message_ids_json TEXT NOT NULL DEFAULT '[]',
  suppressed INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL,
  delivery_intent_json TEXT NOT NULL,
  nuclear_finalization_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_speech_outbox_nuclear_res
  ON speech_outbox (nuclear_reservation_id)
  WHERE nuclear_reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS system_notice_outbox (
  notice_id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT,
  conversation_id TEXT NOT NULL,
  notice_text TEXT NOT NULL,
  send_status TEXT NOT NULL,
  nuclear_reservation_id INTEGER,
  discord_message_id TEXT,
  origin TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS in_flight_effects (
  effect_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  replay_safe INTEGER NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  dispatched_at_ms INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_in_flight_idempotency
  ON in_flight_effects (idempotency_key);

CREATE TABLE IF NOT EXISTS durable_nominations (
  nomination_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  assertion_key TEXT NOT NULL,
  statement TEXT NOT NULL,
  memory_kind TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  supersedes_assertion_key TEXT,
  concern_id TEXT,
  admitted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sidecar_memory_assertions (
  assertion_key TEXT PRIMARY KEY,
  statement TEXT NOT NULL,
  memory_kind TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  lineage_parent_key TEXT,
  admitted_generation INTEGER NOT NULL,
  live INTEGER NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sidecar_memory_supports (
  support_id TEXT PRIMARY KEY,
  assertion_key TEXT NOT NULL,
  source TEXT NOT NULL,
  settlement_id TEXT,
  evidence_lineage_id TEXT,
  observation_id TEXT,
  receipt_id TEXT,
  dimensions_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_supports_key
  ON sidecar_memory_supports (assertion_key);

CREATE TABLE IF NOT EXISTS admission_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomination_id TEXT NOT NULL,
  assertion_key TEXT NOT NULL,
  result TEXT NOT NULL,
  generation INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settlements (
  settlement_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS causal_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thought_attempt_counters (
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  thought_model_attempts INTEGER NOT NULL DEFAULT 0,
  accepted_thought_passes INTEGER NOT NULL DEFAULT 0,
  structural_retries INTEGER NOT NULL DEFAULT 0,
  compose_cancelled_attempts INTEGER NOT NULL DEFAULT 0,
  authority_revisions INTEGER NOT NULL DEFAULT 0,
  observation_rounds INTEGER NOT NULL DEFAULT 0,
  effect_rounds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cycle_id, generation)
);
```

Meta insert on first open: `schema_version=1`, `architecture_epoch='v0.2.1'`, `implementation_spec_version='0.2.1.r3'`, `thought_contract_version=1`, `authority_epoch=1`.

`authority_epoch` advances in the same sidecar transaction that mutates a mutable Authority pack (withdrawal, capability snapshot used for dispatch). Reader: `loadAuthorityPacks` reads meta. No separate table.

There is **no** LearnedSelf write table in v1. Option B: compact slice is injected/read-only; automatic accumulation is post-cutover.

### V1 table inventory (all created in Phase 00)

`cognitive_sidecar_meta`, `conversation_evidence_log`, `inbox_events`, `cycle_records`, `thought_steps`, `working_context_items`, `concerns`, `mind_occupancy`, `future_triggers`, `observation_subscriptions`, `observations`, `speech_outbox`, `system_notice_outbox`, `in_flight_effects`, `durable_nominations`, `sidecar_memory_assertions`, `sidecar_memory_supports`, `admission_log`, `settlements`, `causal_ledger`, `thought_attempt_counters`.

Later phases use these tables. They must not add unversioned tables. Sidecar schema version stays 1 through candidate freeze.

---

## Type ↔ store matrix

| Type | Field | Null | Table.column | Writer | Reader | Created | First used | Restart | Supersession | Test |
|---|---|---|---|---|---|---|---|---|---|---|
| CycleRecord | cycleId | no | cycle_records.cycle_id | fence | kernel | 00 DDL / 01 writer | 01 | yes | new cycle row | 1.x fence |
| ConversationEvidenceRecord | lineageId+version | no | conversation_evidence_log.lineage_id, version | appendOwnerUtterance / delivery-truth / shadow legacy mirror | ThoughtInput | 00/01 | 01 | yes | version+1 same lineage | 1.x edit |
| ConversationEvidenceRecord | dataClassification | no | data_classification | ingress privacy | Thought (sees placeholder) | 01 | 01 | yes | n/a | privacy tests |
| InboxEvent | status | no | inbox_events.status | ingress / consumer | consumer | 01 | 01, 08 loop | yes | n/a | restart claim |
| ThoughtSettlementDraft | (JSON, not stored as published) | n/a | thought_steps.payload_json | parse | kernel | 02 | 02 | yes | stale ignored | parse tests |
| PublishedCognitiveSettlement | finalLicensedText | yes if mode none | settlements.payload_json | publish txn | ledger/harness | 02 | 02 | yes | new generation | C.2 |
| WorkingContextItem | id | no | working_context_items.id | publish | Thought | 03 | 03 | yes | superseded flag | 3.x |
| ConcernRecord | snapshotHash | no | concerns.snapshot_hash | publish | trigger revalidate | 03 | 07 | yes | upsert | 7.3 |
| MindOccupancy | conversationId+concernId | no | mind_occupancy PK | publish | idle fence | 03 | 07 | yes | set op | 7.1 |
| FutureTrigger | snapshotHash | no | future_triggers.snapshot_hash | publish | fire | 07 | 07 | yes | cancel | 7.3 |
| ObservationSubscription | spec | no | observation_subscriptions.spec_json | publish | matcher | 07 | 07 | yes | cancelled | 7.4 |
| Observation | observationId | no | observations.observation_id | perception/exec | Thought | 02/04 | 04 | yes | n/a | 4.x |
| EffectProposal | generation | no | in_flight payload + thought_steps | Thought step | dispatch | 04 | 04 | yes | STALE_GENERATION | 4.race |
| InFlightRecord | idempotencyKey | no | in_flight_effects.idempotency_key UNIQUE | dispatch | recovery | 04 | 04 | yes | unique no-op | 4.x |
| EffectReceipt | secret-filtered payload | n/a | observations or payload_json | executor | Thought | 04 | 04 | yes | n/a | privacy |
| DurableNomination | supersedesAssertionKey, concernId, memoryKind | yes / yes / no | durable_nominations.* | publish | admission | 06 | 06 | yes | fence | 6.2 |
| MemoryAssertion | memoryKind | no | sidecar_memory_assertions.memory_kind | admission | views | 06 | 06 | yes | lineage parent | 6.x |
| MemorySupport | supportId | no | sidecar_memory_supports.support_id | admission | views | 06 | 06 | yes | accumulate | 6.x |
| LearnedSelf | — | — | **none in v1** | none | injected slice | — | tests inject | n/a | post-cutover | 6.7 Option B |
| SpeechOutboxRow | nuclearReservationId | yes until project | speech_outbox.nuclear_reservation_id | projector | reconcile | 05 | 05 | yes | suppress | 5.x |
| DeliveryIntent | JSON | no | speech_outbox.delivery_intent_json | publish | projector/gate | 05 | 05 | yes | n/a | 5.proactive |
| CausalLedgerEntry | payload | no | causal_ledger.payload_json | publish | observe | 02 | 02 | yes | n/a | harness |
| SystemNoticeOutbox | notice_id | no | system_notice_outbox | emit | projector | 05 | 05 | yes | idempotent | 5.notice |

No type field may lack a column. No prose state name may be absent from its union.

---

## Nuclear outbox column migration (not sidecar)

Follow `apps/agent-service/src/core/db.ts` `ensureNuclearVNNSchema` + `user_version` pattern.

Phase 05 implements `ensureNuclearVNextCognitiveOutboxSchema` registered as **observed baseline version + 1**.

```sql
ALTER TABLE delivery_reservations ADD COLUMN cognitive_v021_outbox_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_reservations_v021_outbox
  ON delivery_reservations(cognitive_v021_outbox_id)
  WHERE cognitive_v021_outbox_id IS NOT NULL;
```

Current-schema tests after that phase assert `schemaVersion(db) === NUCLEAR_SUPPORTED_VERSION` (the new integer). Historical waypoint tests (`pending.to === 35`, etc.) remain historical. Do not leave current-pins at 41 after the additive migration exists.
