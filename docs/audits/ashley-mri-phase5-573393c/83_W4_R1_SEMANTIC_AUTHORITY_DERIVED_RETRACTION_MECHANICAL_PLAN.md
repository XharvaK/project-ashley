# 83 — W4 R1 Semantic Authority and Derived Retraction Mechanical Plan

## A. WAVE IDENTITY

```text
WAVE_ID=W4
NAME=R1 Semantic Authority and Derived Retraction
PHASE4_ARCHITECTURE_SOURCE=64_R1_SEMANTIC_AUTHORITY_DESIGN.md; 70_DERIVED_RETRACTION_AND_RECONCILIATION_DESIGN.md; 72_GLOBAL_CROSS_WAVE_CONTRACTS.md; 73_FINAL_REMEDIATION_DEPENDENCY_DAG.md
ROOTS/FINDINGS=R1; F001; F002; F004; F008; redaction defect
PREDECESSORS=SOURCE:W0; EVIDENCE:W1 before production acceptance
PLAN_STATUS=MECHANICALLY_READY
```

## B. PURPOSE

Install one durable transition barrier, make Settlement the exclusive canonical semantic publisher, enforce complete/version-fenced Authority, remove idle dormancy as a semantic writer, and make superseded derived lexical material immediately ineligible after authoritative invalidation.

## C. FROZEN CONTRACT

- Thought proposes meaning. Authority evaluates. Settlement is the only semantic publisher.
- The barrier coordinates currentness. It is not semantic authority and does not pretend multiple SQLite files share ACID.
- New Thought dispatch and publication require barrier `stable` plus an exact captured version vector.
- Publication performs a second currentness fence inside its write transaction.
- Every mutable Authority pack field has a current enforcement reader or is removed.
- Redaction/forget commits make superseded lexical material immediately semantically ineligible. Physical stale rows may remain until reconciliation.
- Degraded retrieval is explicit and exact-current-key only. It never traverses stale FTS rows.

## D. PRECONDITIONS

1. W0 Kernel Envelope and publication identity are source-complete.
2. Exact canonical owners and transaction order are re-inspected: nuclear DB, continuity sidecar, cognitive sidecar, and rebuildable derived DB.
3. A write-authoritative DB is selected for the coordination record. The current source supports nuclear DB as the coordinator because lifecycle/attention and forget entrypoints already depend on it; if current implementation evidence contradicts this, stop.
4. Existing mixed work is preserved. Migration tests use isolated DBs only.

## E. SOURCE OWNERSHIP MAP

| FILE | CURRENT ROLE | PLANNED CHANGE | WHY REQUIRED |
|---|---|---|---|
| `apps/agent-service/src/core/db.ts` | Nuclear schema/migrations | After W0 migration 43, add migration 44 for barrier, canonical outbox/journal, owner versions, and constraints | Durable cross-owner currentness |
| `apps/agent-service/src/core/cognition/schema-contract.ts` | Schema inventory/verification | Add migration-44 tables/indexes/constraints | Mechanical schema proof |
| `apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts` | Cognitive sidecar schema | Version schema to v2; add local projection version/barrier reconciliation fields only | By-value projection currentness |
| `apps/agent-service/src/core/cognitive-v021/sidecar/db.ts` | Sidecar meta and transactions | Add projection-vector read/update and recovery checks | Enforce transition recovery |
| `apps/agent-service/src/core/cognitive-v021/authority/barrier.ts` | NEW | Acquire/transition/reconcile/stabilize/read shared barrier | One currentness protocol |
| `apps/agent-service/src/core/cognitive-v021/authority/version-vector.ts` | NEW | Canonical owner vector construction and equality | Captured-by-value fencing |
| `apps/agent-service/src/core/cognitive-v021/authority/packs.ts` | Loads packs; currently loads lifetime effect receipts | Load bounded active/current receipt projection; bind pack versions | Complete current packs |
| `apps/agent-service/src/core/cognitive-v021/authority/check.ts` | Authority evaluation | Require complete packs and captured vector; reject transition/stale | Active enforcement |
| `apps/agent-service/src/core/cognitive-v021/settlement/validate.ts` | Draft validation | Require W0 bound identity/vector, current evidence eligibility, and operation prerequisites | Pre-transaction defense |
| `apps/agent-service/src/core/cognitive-v021/settlement/publish.ts` | Semantic write transaction | Acquire same barrier and execute second fence before any write | No stale commit |
| `apps/agent-service/src/core/cognitive-v021/initiative/idle.ts` | Idle trigger plus direct dormancy updates | Delete `markDormantIfUnchanged()` semantic writes; represent dormancy only as Thought intent through W0/Authority/Settlement | Writer exclusivity |
| `apps/agent-service/src/core/memory/forget.ts` | Authoritative forget/redaction mutation | Enter barrier and atomically add derived-invalidation outbox entry with canonical commit | Immediate semantic invalidation |
| `apps/agent-service/src/core/cognitive-v021/retrieval/derived-store.ts` | FTS status/hash/rebuild/sync | Add scope/generation eligibility check, journal consumer, non-current build and atomic activation | Semantic invisibility |
| `apps/agent-service/src/core/cognitive-v021/retrieval/fts.ts` | Lexical query | Refuse invalid/unavailable/generation-mismatched rows | Read-time enforcement |
| `apps/agent-service/src/core/cognitive-v021/retrieval/discover.ts` | Exact and FTS discovery | Route invalid scopes only to authoritative exact-key lookup | Frozen degraded mode |
| `apps/agent-service/src/core/cognitive-v021/retrieval/query.ts` | Query construction/exact keys | Preserve exact keys separately from lexical terms | Prevent accidental FTS fallback |
| `apps/agent-service/src/core/cognitive-v021/sidecar/recovery.ts` and startup caller | Cognitive recovery | Reconcile non-stable barrier and pending derived journal before dispatch | Crash closure |
| `apps/agent-service/src/core/cognitive-v021/thought/diagnostics.ts` | Thought diagnostics | Add barrier/vector/refusal/journal evidence | Owner visibility |

## F. MUST-NOT-TOUCH MAP

Do not change constitutional authority order, Thought semantic ownership, retention/deletion policy, provider routes, W0 resource policy, or canonical forget meaning. Do not synchronously require physical derived deletion. Do not perform production forget/redaction as proof. Do not add a compatibility direct writer.

## G. EXISTING SYMBOL INVENTORY

- Authority: `loadEffectReceipts()`, `loadAuthorityPacks()`, `bumpAuthorityEpoch()`, `checkAuthority()` and `AuthorityPacks`, `AuthorityEpoch`.
- Settlement: `validateThoughtSettlementDraft()`, `assertValidThoughtSettlementDraft()`, `publishSemanticTransaction()`, `currentGeneration()`, `applyFutureTriggerDelta()`, `applySubscriptionDelta()`, `existingSettlementForCycleGeneration()`, `getPublishedSettlementIdentity()`.
- Idle writer: `privateCallHistory`, `activePrivateCalls`, `idleNoopState`, `markDormantIfUnchanged()`, `tickConversation()`, `tickIdleOpportunity()`.
- Derived: `DerivedStore`, `computeMemorySourceHash()`, `computeConversationSourceHash()`, `reconcile()`, `reconcileAtStartup()`, `rebuild()`, `syncAfterCommit()`, `notifySidecarPostCommit()`, `searchMemoryFts()`, `searchConversationFts()`, `retrieveCandidates()`.
- Sidecar tables: `cognitive_sidecar_meta`, `cycle_records`, `concerns`, `mind_occupancy`, `future_triggers`, `observation_subscriptions`, `effect_receipts`, `settlements`, `causal_ledger`.
- Existing tests: `authority/check.test.ts`, `settlement/validate.test.ts`, `settlement/publish.test.ts`, `initiative/idle.test.ts`, retrieval `__tests__/derived-store.test.ts`, `discover.test.ts`, FTS tests, forget/redaction tests, and sidecar recovery tests. New focused files include `authority/packs.test.ts`, `authority/barrier.test.ts`, and migration/currentness suites named below.

## H. NEW/CHANGED TYPES

```ts
type AuthorityBarrierState = "stable" | "transitioning" | "reconciling";
type CanonicalOwner = "nuclear" | "continuity" | "cognitive_sidecar";
type AuthorityVersionVector = Readonly<Record<CanonicalOwner, number>>;

type AuthorityBarrierSnapshot = Readonly<{
  barrierId: "global";
  state: AuthorityBarrierState;
  epoch: number;
  revision: number;
  vector: AuthorityVersionVector;
  activeTransitionId: string | null;
  reasonCode: string | null;
}>;

type ProposalCurrentnessVector = Readonly<{
  authorityEpoch: number;
  barrierRevision: number;
  ownerVersions: AuthorityVersionVector;
  cycleId: string;
  generation: number;
  semanticPass: number;
  evidenceEligibilityFingerprint: `sha256:${string}`;
}>;

type DerivedScopeState = "current" | "invalidated" | "unavailable" | "rebuilding" | "reconciling";
type DerivedInvalidationJournal = Readonly<{
  changeId: string; ownerId: string; conversationId: string | null;
  sourceRefs: readonly string[]; invalidationKind: "forget" | "redaction" | "source_change";
  canonicalOwner: CanonicalOwner; canonicalVersion: number;
  targetGeneration: number; state: "pending" | "leased" | "applied" | "quarantined";
}>;
```

## I. DATABASE / SCHEMA PLAN

### Nuclear migration 44, ordered after W0 migration 43

Create:

```sql
CREATE TABLE authority_transition_barrier (
  barrier_id TEXT PRIMARY KEY CHECK (barrier_id = 'global'),
  state TEXT NOT NULL CHECK (state IN ('stable','transitioning','reconciling')),
  epoch INTEGER NOT NULL CHECK (epoch >= 0),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  vector_json TEXT NOT NULL,
  active_transition_id TEXT,
  reason_code TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE canonical_owner_versions (
  owner_name TEXT PRIMARY KEY CHECK (owner_name IN ('nuclear','continuity','cognitive_sidecar')),
  version INTEGER NOT NULL CHECK (version >= 0),
  last_change_id TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE derived_invalidation_journal (
  change_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  conversation_id TEXT,
  source_refs_json TEXT NOT NULL,
  invalidation_kind TEXT NOT NULL CHECK (invalidation_kind IN ('forget','redaction','source_change')),
  canonical_owner TEXT NOT NULL,
  canonical_version INTEGER NOT NULL,
  target_generation INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','leased','applied','quarantined')),
  lease_owner TEXT, lease_expires_at_ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code TEXT,
  created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_derived_journal_pending ON derived_invalidation_journal(state, created_at_ms, change_id);
CREATE INDEX idx_derived_journal_scope ON derived_invalidation_journal(owner_id, conversation_id, state);
```

Insert the singleton as `reconciling`, not `stable`, during migration. Startup establishes initial versions by reading canonical owners, classifies existing derived generations, then marks stable. This prevents an unproven legacy row from being grandfathered.

### Cognitive sidecar schema v2

Extend `cognitive_sidecar_meta` with `projection_barrier_revision`, `projection_vector_json`, and `projection_state` constrained to `current|reconciling`. Migration from v1 sets `reconciling`. The sidecar rejects newer schema content. Rollback to old source is prohibited after migration unless an explicit backward-compatible restore procedure exists; backup/restore uses pre-migration copies.

Fixture/schema-contract/state-inventory/migration tests MUST include every table, column, index, CHECK, pending-state bootstrap, and newer-content rejection.

## J. FUNCTION-LEVEL CHANGE PLAN

### `beginAuthorityTransition()` / `stabilizeAuthorityTransition()` — new

```text
CURRENT=Only a scalar cognitive authority epoch exists.
TARGET=Under `BEGIN IMMEDIATE`, CAS stable->transitioning, mint transition ID, advance epoch/revision; after owner commits/reconciliation, install complete vector and mark stable.
INPUT=Nuclear coordinator, reason, expected stable snapshot, canonical mutation callback/outbox identity.
OUTPUT=Transition token and final stable snapshot.
SIDE_EFFECT=Coordinator and canonical-owner writes.
TRANSACTION=Coordinator steps are atomic; cross-DB owner commit is explicitly recoverable, not falsely ACID.
ERRORS=authority_transition_active; expected_vector_mismatch; canonical_commit_failed; reconciliation_required.
CALLERS=forget/redaction, rollback/revocation, other canonical Authority mutations.
TESTS=authority/barrier.test.ts; migration-44.test.ts.
```

### `loadAuthorityPacks()`

```text
CURRENT=Loads caller options and all effect receipts ordered over lifetime.
TARGET=Refuse non-stable barrier; load complete current packs and bounded active/current effect receipt projection; attach exact vector.
INPUT=Sidecar/nuclear stores, current operation refs, stable snapshot.
OUTPUT=Versioned complete AuthorityPacks.
SIDE_EFFECT=None.
TRANSACTION=Consistent read transactions per store with vector check before/after.
ERRORS=authority_transition; authority_pack_incomplete; authority_vector_changed.
CALLERS=W0 cycle and Authority evaluation.
TESTS=authority/packs.test.ts; large-history boundedness test.
```

### `checkAuthority()`

```text
CURRENT=Evaluates supplied packs.
TARGET=Require every mutable pack version and ProposalCurrentnessVector; produce typed objections without self-authoring revision history.
INPUT=W0 semantic proposal, complete packs, captured vector.
OUTPUT=Accepted/revision/refused result.
SIDE_EFFECT=None.
TRANSACTION=None.
ERRORS=stale_authority_vector; pack_missing; transition_active.
CALLERS=runCognitiveCycle().
TESTS=authority/check.test.ts.
```

### `publishSemanticTransaction()`

```text
CURRENT=Checks maximum generation, duplicate settlement, then writes semantic deltas/outbox/ledger.
TARGET=Acquire barrier read/write serialization; inside transaction require stable exact vector, exact cycle/generation/pass, evidence eligibility, deadline/cancellation, operation prerequisites; write once.
INPUT=KernelBoundThoughtOutput/accepted settlement, expected ProposalCurrentnessVector.
OUTPUT=Published or typed stale/conflict result.
SIDE_EFFECT=Canonical cognitive semantic writes only on complete PASS.
TRANSACTION=One sidecar write transaction plus coordinator fence; no semantic write before final checks.
ERRORS=barrier_transition; authority_vector_stale; evidence_invalidated; cycle_stale; deadline_expired; operation_unresolved.
CALLERS=W0 cycle only.
TESTS=settlement/publish.test.ts; authority-publication-race.test.ts.
```

### `markDormantIfUnchanged()` / `tickConversation()`

```text
CURRENT=Idle scheduler directly updates mind_occupancy and concerns after three no-ops.
TARGET=Delete direct updates and idleNoopState semantic decision; scheduler may emit nonsemantic eligibility/backoff evidence only. Dormancy is a Thought semantic delta evaluated by Authority and Settlement.
INPUT=Idle wake and W0 result.
OUTPUT=Normal W0 settlement or no action.
SIDE_EFFECT=No direct semantic write in idle.ts.
TRANSACTION=None in scheduler.
ERRORS=Normal runtime outcomes.
CALLERS=tickIdleOpportunity().
TESTS=initiative/idle.test.ts rewritten to assert zero direct writes and accepted settlement path.
```

### authoritative forget/redaction commit

```text
CURRENT=Canonical mutation and best-effort/post-commit derived notification can diverge.
TARGET=Within canonical mutation or proven outbox transaction, advance owner version and insert journal entry before commit; barrier remains non-stable until projections reconcile.
INPUT=Owner/conversation, canonical change ID, source refs, tombstone/version.
OUTPUT=Committed canonical change plus pending journal identity.
SIDE_EFFECT=Canonical deletion/tombstone and invalidation metadata.
TRANSACTION=Canonical mutation + outbox/journal atomically; if different DB, canonical-owned outbox is atomic and copied idempotently.
ERRORS=journal_atomicity_unavailable refuses canonical commit; derived sync failure does not undo committed mutation.
CALLERS=Existing forget/redaction entrypoints.
TESTS=forget/redaction transaction and crash-gap tests.
```

### `searchMemoryFts()` / `searchConversationFts()` / `retrieveCandidates()`

```text
CURRENT=Queries derived FTS after store reconciliation logic.
TARGET=Before FTS, require scope current, active generation/source fingerprint, canonical source eligibility, owner/conversation match, and no superseding journal/tombstone. Otherwise exact-current-key only or unavailable.
INPUT=RetrievalQuery, scope eligibility snapshot, canonical DB.
OUTPUT=Current hits, exact degraded hits, or explicit unavailable result.
SIDE_EFFECT=Diagnostics only.
TRANSACTION=Read snapshot with eligibility check before and after FTS materialization.
ERRORS=derived_scope_invalid; generation_mismatch; canonical_source_missing; redaction_superseded.
CALLERS=Thought projection retrieval.
TESTS=derived-store/discover/FTS redaction tests.
```

### `reconcileDerivedJournal()` — new

```text
CURRENT=Reconcile from fingerprints but no durable canonical journal lifecycle.
TARGET=Claim by change ID, build non-current generation, re-read canonical versions, atomically activate only if current, mark entry applied; obsolete build discarded.
INPUT=Pending journal and canonical snapshots.
OUTPUT=Applied/retry/quarantine outcome.
SIDE_EFFECT=Derived rows/generation plus journal lifecycle.
TRANSACTION=Derived build transaction; atomic generation activation; journal CAS.
ERRORS=rebuild_failed; obsolete_generation; poison_source; canonical_changed.
CALLERS=Startup/background R4-governed worker.
TESTS=derived-retraction.test.ts.
```

## K. STATE MACHINE

```text
Barrier: stable -> transitioning -> reconciling -> stable
Publication: proposed -> accepted -> committed | rejected | refused_stale
Derived scope: current -> invalidated -> rebuilding -> reconciling -> current
                                      \-> unavailable
Journal: pending -> leased -> applied | pending | quarantined
```

Dispatch/publication is illegal unless barrier is stable. Lexical return is illegal unless scope is current and generation/vector checks match.

## L. TRANSACTION BOUNDARIES

The coordinator transaction serializes barrier state and versions. Each canonical owner transaction owns its mutation and canonical outbox. Settlement's sidecar transaction contains the second fence and all semantic deltas/settlement/outbox/causal ledger/cycle state. Derived sync is isolated and cannot invalidate canonical success. Generation activation is atomic after a final canonical-version comparison.

## M. CONCURRENCY CONTRACT

One active barrier transition via singleton/CAS. Publication and dispatch fail closed during transition. Canonical writers serialize through transition tokens. Queries check eligibility at read time. New canonical change invalidates in-flight older rebuild. Journal consumers lease/CAS one change. Semantic writer tests enumerate SQL writes to `concerns`, `mind_occupancy`, `working_context`, `future_triggers`, subscriptions, nominations, and settlements and allow only Settlement/migrations/test fixtures.

## N. RESTART / CRASH CONTRACT

- Crash before canonical commit: recover/abort transition to prior vector only when no owner version advanced.
- Crash after owner commit before projection: barrier stays reconciling; reload owners and rebuild projection.
- Crash after invalidation before physical retraction: lexical scope remains ineligible.
- Crash during derived build: partial non-current generation never activates.
- Crash after generation activation before cleanup: old rows remain physically present but ineligible.
- Crash during Settlement: SQLite atomicity yields all or none; retry sees settlement uniqueness and exact vector.
- Startup MUST reconcile non-stable barrier and pending journal before cognitive dispatch.

## O. FAILURE TAXONOMY

Authority: `transition_active`, `pack_incomplete`, `vector_stale`, `projection_reconcile_failed`, `inert_pack_field`. Publication: `cycle_stale`, `generation_stale`, `semantic_pass_stale`, `deadline_expired`, `cancelled`, `evidence_invalidated`, `operation_unresolved`. Derived: `scope_invalid`, `scope_unavailable`, `generation_mismatch`, `canonical_missing`, `rebuild_failed`, `journal_poison`. Ownership is deterministic kernel/runtime, never Thought self-report.

## P. IDEMPOTENCY / RECONCILIATION

Transition ID and canonical change ID make recovery idempotent. A Settlement uniqueness key binds cycle/generation/pass. Journal apply, retraction, rebuild, and generation activation are idempotent on change/generation. Reconciliation reloads canonical truth; it never reconstructs meaning from derived rows. Rollback/revocation is a new transition with lineage, not epoch decrement.

## Q. OBSERVABILITY

Authoritative: barrier row/vector, canonical owner versions/outbox, accepted Settlement identity, tombstones, journal, active generation metadata. Non-authoritative: logs/status projections/physical stale-row count. Owner diagnostics expose barrier state/age/reason, blocked dispatch/publication counts, projection versions, journal backlog/oldest age/attempts, active derived generation/source fingerprint, exact-only queries, stale refusals, and bounded active receipt hydration.

## R. LEGACY INERTNESS

`markDormantIfUnchanged()` and its direct `UPDATE` statements are removed. All other direct semantic writers found by SQL inventory are converted, disabled, or explicitly proven nonsemantic. Scalar `authorityEpoch` alone cannot authorize publication. Existing derived rows begin invalid/unavailable until classified/rebuilt. `notifySidecarPostCommit()` remains a performance hint only; journal/eligibility is authority. Invalid FTS never silently falls back to stale rows.

## S. TEST PLAN

- Unit: vector equality/canonicalization, barrier CAS/state machine, pack completeness, journal validation, exact-degraded eligibility.
- Migration: nuclear 44 and sidecar v2 fresh/upgrade/pending/newer rejection/rollback recovery.
- Integration: Authority -> Settlement; forget/redaction -> invalidation -> reconciliation; idle dormancy through Thought only.
- Concurrency: publisher vs transition, two canonical writers, query vs invalidation, two rebuilders, canonical mutation during rebuild.
- Concurrency/currentness: one reader spans `stable -> transitioning`; one retrieval begins before authoritative invalidation and completes afterward; one old rebuild completes after a newer generation; every returned hit is rechecked against the final canonical eligibility/vector before return.
- Restart/crash: every boundary in N.
- Adversarial: stale proposal after rollback; omitted pack field; forged scalar epoch; stale physical FTS/cache row with correct text; exact key referring to tombstoned source; old rebuild activation; multiple-support removal with liveness/classification recomputation; receipt-history explosion.
- Regression: current settlement, authority, idle, retrieval, derived-store, forget/redaction, recovery, build suites.

## T. FAILURE-INJECTION MATRIX

| Boundary/injection | Required result |
|---|---|
| Transition after proposal, before publish | Publication refused stale |
| Canonical commit, projection failure | Barrier reconciling; dispatch blocked |
| Journal insert failure | Canonical mutation fails before commit or canonical outbox proves atomicity |
| Derived sync failure | Canonical change stands; lexical scope unavailable |
| Physical stale FTS row retained | Never returned |
| Stable reader overlaps transition/invalidation | Final canonical/vector recheck refuses stale result |
| Retrieval starts before redaction and finishes after commit | Superseded material is absent from returned evidence immediately after commit |
| One of multiple supports is removed | Eligibility/dimensions/support refs recompute from current supports only |
| Old derived rebuild races new invalidation | Old generation cannot activate or become query-eligible |
| Old rebuild finishes last | Cannot activate |
| Idle three no-ops | No direct semantic update |
| Lifetime receipt history large | Pack hydration remains bounded |

No new `snapshotHash + authorityEpoch + generation + TTL` cache identity is frozen. The reference-source `ProjectionCache` is in-memory, cycle-local, and reused only for the same semantic pass during structural correction. It is not derived retrieval authority. W4 correctness comes from the durable invalidation journal, scope/generation/source-fingerprint checks, canonical read-time eligibility before and after FTS materialization, atomic generation activation, and the publication second fence. Any cache remains subordinate to those checks and MAY be discarded; a cache-specific mechanism is added only if Luna proves a concrete current-source bypass after implementing these required gates.

## U. QUALIFICATION COMMANDS

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/authority/barrier.test.ts src/core/cognitive-v021/authority/check.test.ts src/core/cognitive-v021/authority/packs.test.ts src/core/cognitive-v021/settlement/validate.test.ts src/core/cognitive-v021/settlement/publish.test.ts src/core/cognitive-v021/initiative/idle.test.ts src/core/cognitive-v021/retrieval/__tests__/derived-store.test.ts src/core/cognitive-v021/retrieval/derived-retraction.test.ts src/core/cognition/migration-44.test.ts
npm run build:agent
```

## V. ACCEPTANCE EVIDENCE

Exact candidate packet includes migrations/schema inventory, direct-writer inventory before/after, focused commands/output, crash/concurrency matrix results, barrier/vector traces, stale-publication refusals, redaction eligibility proof with physical stale rows retained, exact-only proof, journal recovery, active receipt boundedness, build output, and reviewer decision.

## W. PRODUCTION WITNESS

Non-destructively observe exact W1-matched release: barrier stable/vector complete, no non-Settlement semantic writer, current pack versions, bounded receipt projection, derived generation/journal health, and naturally occurring attributable invalidation/reconciliation if available. Do not execute a new production forget/redaction probe. Absence of a natural witness leaves production acceptance open.

## X. STOP CONDITIONS

Stop if canonical mutation cannot atomically carry an outbox/journal; a second semantic writer cannot be disabled without architecture change; current packs cannot be made complete/bounded; cross-DB recovery needs meaning reconstructed from derived state; migration number conflicts with current source; exact-only mode can touch FTS; or Phase 4 ownership changes are required. Return `IMPLEMENTATION_BLOCKED=<exact contradiction>`.

## Y. IMPLEMENTATION CHECKLIST

1. Inventory every semantic SQL writer and canonical owner/version.
2. Add migration 44 and sidecar v2 in fail-closed reconciliation state.
3. Implement barrier/vector primitives and crash recovery.
4. Version and bound complete Authority packs.
5. Bind W0 proposal and Settlement second fence.
6. Remove idle dormancy direct writes and prove writer exclusivity.
7. Add canonical invalidation outbox/journal to forget/redaction transactions.
8. Enforce scope/generation/tombstone eligibility before retrieval.
9. Add idempotent non-current rebuild and atomic activation.
10. Run migration, unit, integration, concurrency, crash, adversarial, and build gates.
11. Assemble candidate evidence; stop before deployment/production mutation.
