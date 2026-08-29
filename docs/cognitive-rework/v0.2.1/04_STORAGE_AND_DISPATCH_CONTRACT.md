# 04 — Sidecar v1 storage and dispatch contract

**Packet R5.** Sidecar schema version is **1** through candidate freeze. Phase 00 applies this entire DDL. Later phases **use** tables; they do not add unversioned tables.

Canonical types: [02_IMPLEMENTATION_SPECIFICATION.md](02_IMPLEMENTATION_SPECIFICATION.md). If this file and §W.1 disagree, that is a HARD BLOCKER — they must be identical SQL.

**Nuclear additive column** is **not** sidecar DDL. It is a nuclear `user_version` migration: `NUCLEAR_SUPPORTED_VERSION` observed on the **owner-selected baseline** plus one. Inspected SHA `c7c81c4` is 41, so that checkout would become 42. Do not hardcode 42 in timeless docs. Phase 00 records `OBSERVED_NUCLEAR_SUPPORTED_VERSION` after Gate A.

Column name: `cognitive_v021_projection_key` (global unique projector identity). Not `cognitive_v021_outbox_id`. Speech and system-notice autoincrement ids live in different tables and would collide if both projected as bare `"1"`.

---

## Publication / storage invariants (DDL-enforced)

These are not runtime-only checks.

| Invariant | Enforcement |
|---|---|
| Singleton meta | `cognitive_sidecar_meta.id INTEGER PRIMARY KEY CHECK (id = 1)`. Readers/writers always `WHERE id = 1`. |
| One published settlement per cycle+generation | `UNIQUE (cycle_id, generation)` on `settlements`. |
| Idempotent replay of a committed publication | `publishSemanticTransaction` inside `BEGIN IMMEDIATE`: if that unique key exists, return the existing publication; do not reapply WC/concern/occupancy/trigger/subscription/nomination/outbox writes. |
| One speech outbox per speaking settlement | `speech_outbox.settlement_id NOT NULL UNIQUE`. Mode `none` has no speech outbox row. |
| One global delivery projection key | `speech_outbox.projection_key` and `system_notice_outbox.projection_key` are unique; values are `speech:<outboxId>` and `system:<noticeId>` and never collide. Nuclear UNIQUE on `cognitive_v021_projection_key`. |
| One system notice per failure correlation | `system_notice_outbox.notice_key UNIQUE` (`thought_failure:<conversationId>:<cycleId>:<generation>:<reason>`). |
| In-flight correlation | `in_flight_effects.correlation_id TEXT NOT NULL`. No `replay_safe` column (every in-flight row is an Effect). |
| Observation classification | `observations.data_classification` + `secret_omitted`. |
| Memory classification | `durable_nominations`, `sidecar_memory_assertions`, `sidecar_memory_supports` each store `data_classification`. Admission/import must not downgrade. |
| Imported quarantine generation | `sidecar_memory_assertions.admitted_generation` nullable. `live=0` legacy import → `NULL`. Native `live=1` → non-null. |

---

## Complete v1 DDL

File: `apps/agent-service/src/core/cognitive-v021/sidecar/schema-v1.sql`

```sql
CREATE TABLE IF NOT EXISTS cognitive_sidecar_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
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

CREATE TABLE IF NOT EXISTS conversation_evidence_discord_ids (
  discord_message_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  lineage_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_discord_lineage
  ON conversation_evidence_discord_ids (lineage_id);

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
  derived INTEGER NOT NULL DEFAULT 0,
  replay_safe INTEGER NOT NULL DEFAULT 1,
  modality TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  provenance TEXT NOT NULL,
  raw_outranks_derived_of TEXT,
  data_classification TEXT NOT NULL,
  secret_omitted INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS speech_outbox (
  outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id TEXT NOT NULL UNIQUE,
  projection_key TEXT NOT NULL UNIQUE,
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
  notice_key TEXT NOT NULL UNIQUE,
  projection_key TEXT NOT NULL UNIQUE,
  cycle_id TEXT,
  conversation_id TEXT NOT NULL,
  notice_text TEXT NOT NULL,
  send_status TEXT NOT NULL,
  nuclear_reservation_id INTEGER,
  discord_message_id TEXT,
  origin TEXT NOT NULL,
  delivery_intent_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS in_flight_effects (
  effect_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  dispatched_at_ms INTEGER,
  origin_job_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_in_flight_idempotency
  ON in_flight_effects (idempotency_key);

CREATE TABLE IF NOT EXISTS effect_receipts (
  receipt_id TEXT PRIMARY KEY,
  effect_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  outcome TEXT NOT NULL,
  claims_json TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  data_classification TEXT NOT NULL,
  secret_omitted INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_effect_receipts_effect
  ON effect_receipts (effect_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_effect_receipts_idempotency
  ON effect_receipts (idempotency_key);

CREATE TABLE IF NOT EXISTS durable_nominations (
  nomination_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  assertion_key TEXT NOT NULL,
  statement TEXT NOT NULL,
  memory_kind TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  data_classification TEXT NOT NULL,
  supersedes_assertion_key TEXT,
  concern_id TEXT,
  admitted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sidecar_memory_assertions (
  assertion_key TEXT PRIMARY KEY,
  statement TEXT NOT NULL,
  memory_kind TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  data_classification TEXT NOT NULL,
  lineage_parent_key TEXT,
  admitted_generation INTEGER,
  live INTEGER NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sidecar_memory_supports (
  support_id TEXT PRIMARY KEY,
  assertion_key TEXT NOT NULL,
  source TEXT NOT NULL,
  provenance TEXT NOT NULL,
  source_architecture_epoch TEXT NOT NULL,
  source_ref TEXT,
  settlement_id TEXT,
  evidence_lineage_id TEXT,
  observation_id TEXT,
  receipt_id TEXT,
  dimensions_json TEXT NOT NULL,
  data_classification TEXT NOT NULL,
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
  payload_json TEXT NOT NULL,
  UNIQUE (cycle_id, generation)
);

CREATE TABLE IF NOT EXISTS causal_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  thought_unavailable INTEGER NOT NULL DEFAULT 0
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

Meta insert on first open: `id=1`, `schema_version=1`, `architecture_epoch='v0.2.1'`, `implementation_spec_version='0.2.1.r5'`, `thought_contract_version=1`, `authority_epoch=1`. Subsequent writes `UPDATE ... WHERE id = 1`. Never insert a second meta row.

`authority_epoch` advances in the same sidecar transaction that mutates a mutable Authority pack (withdrawal, capability snapshot used for dispatch). Reader: `loadAuthorityPacks` reads meta `id=1`. No separate table.

There is **no** Identity table and **no** LearnedSelf write table in v1. Constitutional identity is read from the existing nuclear identity source. Option B: LearnedSelf slice is empty or already-admitted (`live=true`) only; quarantined rows are not Thought-influential; automatic accumulation is post-cutover.

### V1 table inventory (all created in Phase 00)

`cognitive_sidecar_meta`, `conversation_evidence_log`, `conversation_evidence_discord_ids`, `inbox_events`, `cycle_records`, `thought_steps`, `working_context_items`, `concerns`, `mind_occupancy`, `future_triggers`, `observation_subscriptions`, `observations`, `speech_outbox`, `system_notice_outbox`, `in_flight_effects`, `effect_receipts`, `durable_nominations`, `sidecar_memory_assertions`, `sidecar_memory_supports`, `admission_log`, `settlements`, `causal_ledger`, `thought_attempt_counters`.

Later phases use these tables. They must not add unversioned tables. Sidecar schema version stays 1 through candidate freeze.

---

## Type ↔ store matrix

| Type | Field | Null | Table.column | Writer | Reader | Created | First used | Restart | Supersession | Test |
|---|---|---|---|---|---|---|---|---|---|---|
| Sidecar meta | id=1 singleton | no | cognitive_sidecar_meta.id CHECK 1 | open/migrate | loadAuthorityPacks | 00 | 00 | yes | n/a | 0.meta |
| CycleRecord | cycleId | no | cycle_records.cycle_id | fence | kernel | 00 DDL / 01 writer | 01 | yes | new cycle row | 1.x fence |
| ConversationEvidenceRecord | lineageId+version | no | conversation_evidence_log.lineage_id, version | appendOwnerUtterance / delivery-truth / shadow legacy mirror | ThoughtInput | 00/01 | 01 | yes | version+1 same lineage | 1.x edit |
| ConversationEvidenceDiscordId | discordMessageId | no | conversation_evidence_discord_ids PK | same writers | ingress idempotency | 00/01 | 01 | yes | mapping stays on edit | 1.8+ |
| ConversationEvidenceRecord | dataClassification | no | data_classification (`ordinary`\|`sensitive`\|`never_public`\|`secret`) | ingress privacy | Thought (sees placeholder) | 01 | 01 | yes | n/a | 4-class round-trip |
| InboxEvent | status | no | inbox_events.status | ingress / consumer | consumer | 01 | 01, 08 loop | yes | n/a | restart claim |
| ThoughtSettlementDraft | (JSON, not stored as published) | n/a | thought_steps.payload_json | parse | kernel | 02 | 02 | yes | stale ignored | parse tests |
| PublishedCognitiveSettlement | cycleId+generation | no | settlements UNIQUE(cycle_id, generation) | publish txn | ledger/harness | 02 | 01/02 | yes | new generation | 1.publish-replay |
| PublishedCognitiveSettlement | finalLicensedText | yes if mode none | settlements.payload_json | publish txn | ledger/harness | 02 | 02 | yes | new generation | C.2 |
| WorkingContextItem | id | no | working_context_items.id | publish | Thought | 03 | 03 | yes | superseded flag | 3.x |
| ConcernRecord | snapshotHash | no | concerns.snapshot_hash | publish | trigger revalidate | 03 | 07 | yes | upsert | 7.3 |
| MindOccupancy | conversationId+concernId | no | mind_occupancy PK | publish | idle fence | 03 | 07 | yes | set op | 7.1 |
| FutureTrigger | snapshotHash | no | future_triggers.snapshot_hash | publish | fire | 07 | 07 | yes | cancel | 7.3 |
| ObservationSubscription | spec | no | observation_subscriptions.spec_json | publish | matcher | 07 | 07 | yes | cancelled | 7.4 |
| Observation | observationId | no | observations.observation_id | perception/exec | Thought | 02/04 | 04 | yes | n/a | 4.x |
| Observation | dataClassification, secretOmitted | no | observations.data_classification, secret_omitted | perception/exec | Thought / Memory inherit | 04 | 04/06 | yes | never downgrade | 4.class |
| EffectProposal | generation | no | in_flight payload + thought_steps | Thought step | dispatch | 04 | 04 | yes | STALE_GENERATION | 4.race |
| InFlightRecord | correlationId | no | in_flight_effects.correlation_id | dispatch | recovery/reinject | 04 | 04 | yes | n/a | 4.corr restart |
| InFlightRecord | status | no | in_flight_effects.state | dispatch | recovery | 04 | 04 | yes | n/a | 4.x |
| InFlightRecord | idempotencyKey | no | in_flight_effects.idempotency_key UNIQUE | dispatch | recovery | 04 | 04 | yes | unique no-op | 4.x |
| InFlightRecord | originJobId | yes | in_flight_effects.origin_job_id | dispatch | recovery | 04 | 04 | yes | n/a | 4.x |
| EffectReceipt | receiptId | no | effect_receipts.receipt_id | executor | AuthorityPacks.receipt | 04 | 04 | yes | unique effect_id | 4.receipt restart |
| DurableNomination | dataClassification | no | durable_nominations.data_classification | publish | admission | 06 | 06 | yes | maxClassification | 6.class |
| MemoryAssertion | memoryKind | no | sidecar_memory_assertions.memory_kind | admission | views | 06 | 06 | yes | lineage parent | 6.x |
| MemoryAssertion | dataClassification | no | sidecar_memory_assertions.data_classification | admission | views/retrieval | 06 | 06 | yes | never downgrade | 6.class |
| MemoryAssertion | admittedGeneration | yes if live=false import | sidecar_memory_assertions.admitted_generation | admission / import | views | 06 | 06 | yes | real gen on later admit | 6.import-gen |
| MemorySupport | provenance | no | sidecar_memory_supports.provenance | admission / import | views | 06 | 06 | yes | accumulate | 6.x |
| MemorySupport | dataClassification | no | sidecar_memory_supports.data_classification | admission / import | inherit | 06 | 06 | yes | never downgrade | 6.class |
| LearnedSelf | — | — | **none in v1** | none | empty or live=true only | — | tests inject admitted | n/a | post-cutover | 6.7 Option B |
| SpeechOutboxRow | settlementId | no | speech_outbox.settlement_id UNIQUE | publish | projector | 05 | 01/05 | yes | suppress | 1.publish-replay |
| SpeechOutboxRow | projectionKey | no | speech_outbox.projection_key UNIQUE | publish (`speech:<id>`) | nuclear projector | 05 | 05 | yes | n/a | 5.proj-key |
| SpeechOutboxRow | nuclearReservationId | yes until project | speech_outbox.nuclear_reservation_id | projector | reconcile | 05 | 05 | yes | suppress | 5.x |
| DeliveryIntent | JSON | no | speech_outbox.delivery_intent_json / system_notice_outbox.delivery_intent_json | publish / notice | projector/gate | 05 | 05 | yes | n/a | 5.proactive |
| CausalLedgerEntry | thoughtUnavailable | no | causal_ledger.thought_unavailable | notice path | observe | 02/05 | 05 | yes | n/a | 5.notice |
| SystemNoticeOutbox | noticeKey | no | system_notice_outbox.notice_key UNIQUE | emit | projector | 05 | 05 | yes | replay no dup | 5.notice-idem |
| SystemNoticeOutbox | projectionKey | no | system_notice_outbox.projection_key UNIQUE | emit (`system:<id>`) | nuclear projector | 05 | 05 | yes | n/a | 5.proj-key |
| SystemNoticeOutbox | deliveryIntent | no | system_notice_outbox.delivery_intent_json | emit | projector | 05 | 05 | yes | idempotent | 5.notice |
| RetrievalHit | sourceStore | no | computed from conversation_evidence_log / sidecar_memory_* | retrieveCandidates | Thought | 03/06 | 03/06 | n/a | n/a | 3.retr 6.q |
| RememberDirective | rememberRequested, evidenceLineageId, evidenceRowId, dataClassification | n/a | inbox_events.payload_json (references only; **no owner prose**) | /remember ingress | ThoughtInput | 06/08 | 06 | yes | n/a | 6.remember |
| V021ForgetTarget | entityType+action | no | continuity forget_preview_targets (+ sidecar apply) | preview | apply | 06 | 06/08 | yes | n/a | 6.forget restart |

No type field may lack a column or exact payload schema. No prose state name may be absent from its union. No critical uniqueness constraint may exist only in runtime code.

---

## V021_FORGET_TARGET_MATRIX (sidecar)

Disposition vocabulary: `REDACT` | `DELETE` | `DETACH` | `CANCEL` | `KEEP_METADATA_ONLY` | `NO_CONTENT` | `NO_ACTION`.

Maps into continuity `forget_preview_targets.action` as `redact` | `delete` | `detach` plus v021 extensions recorded on the target row (`cancel`, `keep_metadata_only`). `NO_CONTENT` / `NO_ACTION` are not preview targets.

**Two independent dimensions.** `CANCEL` / `DETACH` / suppress control future behavior. `REDACT` removes local semantic content. They are not substitutes. For every content-bearing row, apply both as specified. A cancelled subscription that still stores `topicKeys` is a privacy miss. Redacting `licensed_text` without suppressing an undelivered outbox can still deliver `[redacted]` or the original draft.

| Table | Disposition | forget_preview_targets entityType |
|---|---|---|
| conversation_evidence_log | REDACT matching topic (`text` null, `source_status=redacted`) | `v021_conversation_evidence` |
| conversation_evidence_discord_ids | KEEP_METADATA_ONLY (identity for idempotency; not utterance text) | (no content target) |
| thought_steps | REDACT forgotten plaintext in `payload_json` | `v021_thought_step` |
| working_context_items | DETACH/abandon items derived from forgotten source; REDACT payload | `v021_working_context` |
| concerns | DETACH/resolve; REDACT `statement`. Retain only minimal structural metadata (`concern_id`, `status`, `snapshot_hash`) required for lineage/tombstone. | `v021_concern` |
| mind_occupancy | DETACH/withdraw related occupancy (ids/status only; no statement copy) | `v021_occupancy` |
| future_triggers | CANCEL; REDACT `payload_json` if it contains forgotten semantic material. Retain trigger_id / status / snapshot_hash as metadata. | `v021_future_trigger` |
| observation_subscriptions | CANCEL; REDACT semantic `spec_json` (including `scope` and `topicKeys`). Retain subscription_id / cancelled / conversation_id only. A forgotten topic must not remain in a cancelled subscription. | `v021_subscription` |
| observations | REDACT payload containing forgotten local material | `v021_observation` |
| effect_receipts | REDACT claims containing forgotten local material | `v021_effect_receipt` |
| durable_nominations | Retract (do not admit); REDACT `statement` | `v021_nomination` |
| sidecar_memory_assertions | Retract (`live=0`); REDACT `statement` | `v021_memory_assertion` |
| sidecar_memory_supports | REDACT | `v021_memory_support` |
| settlements | REDACT forgotten plaintext in `payload_json` | `v021_settlement` |
| speech_outbox | If `sendStatus` is `pending` / `projecting` / `projected` / `sending` and forgotten content matches: suppress/cancel future delivery. If `nuclearReservationId` is set and not yet delivered, cancel/finalize that reservation through the existing delivery mechanism. Then REDACT local `licensed_text` per local-forget law. Delivered Discord text is not retroactively erased; the local copy may be redacted. Must never later deliver `[redacted]` or the original forgotten draft. | `v021_speech_outbox` |
| system_notice_outbox | If undelivered and `notice_text` quoted forgotten content: suppress/cancel delivery (same sendable-status rule as speech_outbox), then REDACT `notice_text`. If already delivered: REDACT local text only. Else KEEP_METADATA_ONLY. | `v021_system_notice` |
| causal_ledger | KEEP_METADATA_ONLY (structural ids; no forgotten content) | `v021_causal_ledger` |
| inbox_events | REDACT `payload_json` if it contains forgotten text. RememberDirective payloads are references only and must not reintroduce owner prose. | `v021_inbox_event` |
| cycle_records | KEEP_METADATA_ONLY | (no content target) |
| in_flight_effects | If still in-flight: do not execute remaining work for forgotten payload; then REDACT `payload_json`. | `v021_in_flight` |
| admission_log | KEEP_METADATA_ONLY | (no content target) |
| thought_attempt_counters | NO_CONTENT / NO_ACTION | — |
| cognitive_sidecar_meta | NO_ACTION | — |
| nuclear `mem_messages` compatibility copy | REDACT/DELETE per existing forget | existing `mem_messages` |

Continuity preview/tombstone remains authoritative evidence of the forget operation. Backup/provider non-erasure honesty remains. Discovery is mechanical/source-grounded (existing topic targeting extended deterministically). Not an LLM classifier.

Restart test: topic forgotten while a concern is active, a subscription is active, and proactive speech is pending → apply + restart → concern `statement` absent, subscription topic keys absent, matching outbox cannot deliver, forgotten content cannot re-enter Thought.

---

## Nuclear projection-key migration (not sidecar)

Follow `apps/agent-service/src/core/db.ts` `ensureNuclearVNNSchema` + `user_version` pattern.

Phase 05 implements `ensureNuclearVNextCognitiveProjectionSchema` registered as **observed baseline version + 1**.

```sql
ALTER TABLE delivery_reservations ADD COLUMN cognitive_v021_projection_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_reservations_v021_projection_key
  ON delivery_reservations(cognitive_v021_projection_key)
  WHERE cognitive_v021_projection_key IS NOT NULL;
```

Do not add `cognitive_v021_outbox_id`. That name is retired because speech and system-notice numeric ids are independent namespaces.

Current-schema tests after that phase assert `schemaVersion(db) === NUCLEAR_SUPPORTED_VERSION` (the new integer). Historical waypoint tests (`pending.to === 35`, etc.) remain historical. Do not leave current-pins at 41 after the additive migration exists.
