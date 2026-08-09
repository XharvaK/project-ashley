# P-01A Current Cognition Characterization

**Status:** PASS; Gate A passed

**Starting HEAD:** `0c83649c94d9cdffda5c1b2b2d034a1b42a9e767`

**Source ancestor:** `0efb0250989e2b67a9b0b3d7e8fce81568ae0975`

**Fixture:** synthetic owner, entity UUIDs, thread, user/assistant exchange, fixed
analysis callback, temporary SQLite, no provider, no network, and no production
data.

## Baseline verification

At goal start:

- `HEAD` and `origin/master` both resolved to
  `0c83649c94d9cdffda5c1b2b2d034a1b42a9e767`.
- `HEAD` subject was exactly
  `docs(architecture): accept foundation salvage decisions`.
- The worktree was clean.
- `0efb0250989e2b67a9b0b3d7e8fce81568ae0975` was an ancestor of `HEAD`.
- The ancestor-to-HEAD diff contained architecture documentation only.

## Current source path map

The characterized `consolidate_thread` path is:

1. Delivery/runtime calls `enqueueCognitiveJob` with an Ashley-owned
   `source_key` and exact thread/through-message payload.
2. `enqueueCognitiveJob` uses `INSERT OR IGNORE`; `cognitive_jobs.source_key`
   is globally unique. A duplicate returns the existing Ashley job ID.
3. `claimNextJob` opens `BEGIN IMMEDIATE`, selects the oldest eligible pending
   job, changes it to `running`, increments `attempts`, and commits before any
   callback work.
4. `processNextCognitiveJob` loads unconsolidated messages for the target
   owner/thread and chooses `live` or `shadow` target provenance from the Recall
   influence gate.
5. Transcript construction preserves exact Ashley message IDs and roles.
6. The callback/model analysis occurs outside any materialization transaction.
7. After the callback resolves, the worker opens `BEGIN IMMEDIATE`.
8. The worker rechecks Recall influence and live-message eligibility. It then
   creates the episode and message links, records shadow evidence when
   applicable, proposes revisions, and in apply mode may materialize exact
   user-grounded facts, Mind State, affect, and eligible learning.
9. In the same transaction it inserts the completed `cognitive_runs` row,
   marks the Ashley job completed, and commits. Any error inside this region
   rolls the entire region back.
10. After a processing error, a separate `BEGIN IMMEDIATE` inserts a failed run
    and calls `failJob`, which either schedules exponential backoff or marks the
    job terminal after attempt five.
11. `startCognitionLoop` calls `recoverCognitiveJobs` once at startup. Recovery
    resets every `running` job to immediately eligible `pending`; there is no
    claim token or expiring lease.

Primary source locations:

| Concern | Current owner/source |
|---|---|
| enqueue, claim, attempt, recovery, retry, terminal state | `apps/agent-service/src/core/cognition/jobs.ts:17-127` |
| callback boundary and atomic semantic integration | `apps/agent-service/src/core/cognition/worker.ts:283-555` |
| startup recovery and dispatch loop | `apps/agent-service/src/core/cognition/worker.ts:560-579` |
| episode dedupe, message links, live watermark | `apps/agent-service/src/core/memory/episodes.ts:82-313` |
| capability/contract influence decision | `apps/agent-service/src/core/rollout/capabilities.ts:640-650` |
| model-continuity epoch transition | `apps/agent-service/src/core/attention/continuity.ts:32-138` |
| shadow revision influence filter | `apps/agent-service/src/core/learning/revisions.ts:267-330` |
| exact fact source message materialization | `apps/agent-service/src/core/memory/facts.ts:134-261` |
| Mind State and affect materializers | `apps/agent-service/src/core/state/mind-items.ts:37-126`, `apps/agent-service/src/core/state/affect.ts:34-83` |
| Reflection | `apps/agent-service/src/core/reflection/initiative.ts`; not invoked by `consolidate_thread` |
| current schema/migrations | `apps/agent-service/src/core/db.ts` plus `apps/agent-service/src/core/provenance/` |

## Internal execution map

```text
enqueue
  -> global source_key uniqueness
  -> atomic claim
  -> attempts += 1 and status=running
  -> read exact unconsolidated Ashley messages
  -> callback/model work outside transaction
  -> parse/normalize callback result
  -> BEGIN IMMEDIATE
  -> recheck authority/live watermark
  -> episode + episode_messages
  -> shadow events/revisions or live materializers
  -> cognitive_runs completed row
  -> cognitive_jobs completed
  -> COMMIT

error before/during integration
  -> rollback integration if open
  -> BEGIN IMMEDIATE
  -> cognitive_runs failed row
  -> pending + exponential available_at, or terminal failed at attempt five
  -> COMMIT

startup
  -> every running job becomes pending immediately
  -> callback/model work may repeat
```

## Ten scenario results

The executable evidence is
`apps/agent-service/src/core/cognition/p01a-characterization.test.ts`.

### 1. Duplicate enqueue — PASS

Two enqueue calls with the same `source_key` return the same Ashley job ID and
leave exactly one `cognitive_jobs` row. The uniqueness scope is the whole table,
not owner or kind.

**Classification:** GUARANTEE for exact `source_key` reuse. The requirement for
callers to namespace keys across owners/kinds is UNSPECIFIED at this seam.

### 2. Claim, process death, restart recovery — PASS

Claim changes the job from pending/attempt 0 to running/attempt 1. After the
file-backed database is closed and reopened, startup recovery changes the job
to pending/attempt 1 with immediate `available_at`. Schema inspection finds no
lease or claim-expiry column.

**Classification:** GUARANTEE that startup resets all running jobs; CURRENT
LIMITATION that the reset is blind and has no expiring lease or ownership token.

### 3. Failure before callback result — PASS

A deterministic callback exception creates no episode, message link, fact,
Mind State row, affect event, revision, or evidence link. A failed run is
recorded, attempt remains 1, and the job becomes pending with backoff.

**Classification:** GUARANTEE.

### 4. Callback result, then failure before authoritative transaction — PASS

The file-backed fixture constructs a valid fixed result, then simulates process
loss before the worker can open its materialization transaction. Reopening the
database shows a running attempt-1 job, no run row, and no semantic effect.
Startup recovery returns the job to pending.

**Classification:** GUARANTEE of no partial semantic outcome; CURRENT
LIMITATION that failure logging cannot occur when the database/process is gone,
so recovery is coarse and callback work may repeat.

### 5. Failure inside materialization before commit — PASS

A test-only SQLite trigger aborts the Mind State insert after earlier episode,
revision, and fact writes have been attempted. The transaction rolls back the
episode, FTS row, episode-message links, fact, Mind State, affect, revision, and
evidence links. A failed run and retryable job are then committed separately.

**Classification:** GUARANTEE of atomic Ashley materialization. No partial
semantic commit was observed.

### 6. Ashley commit, caller does not observe return, restart — PASS

The worker completes against a file-backed database; the simulated caller does
not use the return value and closes. After reopen, recovery resets zero jobs,
there is no claimable work, the callback count remains one, and the completed
job, completed run, episode, fact, Mind State item, affect event, revision, and
evidence links each remain exactly once.

**Classification:** GUARANTEE for the current single SQLite commit boundary.

### 7. Failure through terminal ceiling — PASS

Five consecutive callback failures produce attempts 1 through 5. Relative
backoffs are exactly 30, 60, 120, 240, and 480 seconds. Attempts 1-4 return to
pending; attempt 5 becomes terminal failed. A sixth dispatch performs no work.

**Classification:** GUARANTEE. Retry visibility is persisted in Ashley tables.

### 8. Capability contract and model epoch mismatch — PASS

With synthetic active state, Recall can influence before a contract mismatch.
Corrupting the active contract hash makes influence false; worker execution
creates no live episode, fact, or Mind State. Separately, a resolved model change
increments the continuity epoch and demotes the active model-sensitive Learning
capability to observe, after which Learning cannot influence.

**Classification:** GUARANTEE of fail-closed authority for the exercised
contract and model-continuity paths.

### 9. Shadow artifact time-shift prevention — PASS

Observe-mode processing creates a shadow episode and shadow proposed revision,
with no fact, Mind State, or affect materialization. Activating synthetic
capabilities later does not change either provenance label, and the ordinary
`applyEligibleRevisions` path refuses the shadow revision.

**Classification:** GUARANTEE. No authority time-shift was observed.

### 10. Exact owner/entity/thread/source-message provenance — PASS

The live fixture preserves the synthetic owner and thread on the episode,
preserves exact start/end message IDs and both `episode_messages` links,
preserves fixed message `entity_uuid` values, assigns the episode its own
immutable entity UUID, and grounds the fact in the exact user message and quote.
Evidence links use typed `episode` and `message` sources; the Mind State source
is the episode. No `cognitive_run` source type is used as semantic provenance.

**Classification:** GUARANTEE for the exercised materializers.

## Current guarantees

- One job row per exact globally unique `source_key`.
- Atomic claim and persisted attempt accounting before callback work.
- No semantic writes before the callback result.
- Episode/revision/fact/Mind State/affect/run/job completion share one SQLite
  transaction for `consolidate_thread`.
- Full rollback when an exercised materializer fails before commit.
- Completed jobs are not recovered or replayed.
- Bounded five-attempt retry with visible persisted backoff and terminal state.
- Contract mismatch prevents live influence.
- Resolved model changes demote exercised model-sensitive capability authority.
- Shadow provenance is written at creation and is not widened by later
  capability state.
- Ashley owner/thread/message/entity provenance remains distinct from technical
  run identity.

## Current limitations

- Every running job is reset on startup, regardless of age or whether another
  worker could still own it.
- There is no expiring claim lease, claim token, worker identity, or heartbeat.
- Callback/model work is outside the commit transaction and can repeat after a
  crash or startup recovery.
- A process/database loss after callback result but before transaction start
  leaves a running job with no failed run until recovery.
- Claim and semantic completion are two different transactions. SQLite atomicity
  protects semantic integration, not the external callback.
- Backoff and recovery use wall-clock time directly; deterministic time is
  supplied by the test runner rather than a production clock interface.
- `source_key` uniqueness is global. Correct owner/kind namespacing is a caller
  responsibility.
- Recovery is SQLite-local and coarse; there is no per-step persisted callback
  or parse checkpoint.

## Defect candidates

No foundational authority, provenance, non-interference, or atomicity defect was
validated by the ten scenarios.

The following remain defect candidates or design questions, not validated
defects in this proof:

- A caller that emits the same `source_key` for different owners or kinds would
  collide globally. Existing producers appear to namespace keys, but this
  harness does not prove all producers do so.
- Blind recovery could duplicate expensive or non-idempotent callback work. The
  exercised callback is fixed and semantic integration remained exactly once.
- With multiple worker processes, absence of a lease may make operational
  ownership difficult to observe even though the SQLite claim itself is atomic.

## Normalized observable contract

P-01B must consume the same synthetic fixture and emit a candidate-neutral
result containing the following. Candidate-native field names and checkpoint
IDs may be retained only as additional technical detail.

### Job

```ts
type NormalizedJob = {
  ashleyJobId: number;
  ownerId: string;
  kind: "consolidate_thread";
  sourceKey: string;
  status: "pending" | "running" | "completed" | "failed";
  attempt: number;
  availableAt: string;
  lastError: string | null;
};
```

### Run

```ts
type NormalizedRun = {
  ashleyRunId: number;
  ashleyJobId: number;
  purpose: "exchange_cognition";
  status: "completed" | "failed";
  model: string | null;
  provenance: "shadow" | "live" | null;
  episodeId: number | null;
  error: string | null;
};
```

### Semantic effects

```ts
type NormalizedSemanticEffects = {
  episodes: Array<{
    id: number;
    entityUuid: string;
    ownerId: string;
    threadId: string;
    sourceMessageIds: number[];
    provenance: "shadow" | "live";
  }>;
  facts: Array<{ id: number; sourceMessageId: number; origin: string }>;
  mindState: Array<{ id: number; sourceType: string; sourceId: string }>;
  affectEvents: Array<{ id: number; sourceType: string; sourceId: string }>;
  revisions: Array<{ id: number; provenance: "shadow" | "live"; status: string }>;
  evidenceLinks: Array<{
    targetType: string;
    targetId: string;
    sourceType: string;
    sourceId: string;
  }>;
};
```

### Authority

```ts
type NormalizedAuthority = {
  contractId: string;
  contractMatches: boolean;
  modelAlias: string;
  modelEpoch: number;
  artifactProvenance: "shadow" | "live" | null;
  influenceEligible: boolean;
};
```

### Trace

The observable trace vocabulary is:

```text
enqueue
claim
callback_start
callback_result | callback_error
materialization_begin
semantic_write
materialization_rollback | materialization_commit
job_complete | retry_scheduled | terminal_failed
recovery
```

P-01A derives transaction events from current SQLite state transitions and
failure boundaries; it does not add a production trace schema.

## Table snapshot contract

Every scenario records or can reconstruct these candidate-neutral snapshots:

| Area | Required observable fields |
|---|---|
| `cognitive_jobs` | Ashley job ID, owner, kind, source key, status, attempts, `available_at`, last error |
| `cognitive_runs` | Ashley run ID, job ID, owner, kind/purpose mapping, model, status, error, episode ID |
| `episodes` | Ashley episode ID/entity UUID, owner, thread, message range, provenance |
| `episode_messages` | exact episode-to-message membership |
| facts | ID, owner, exact source message, origin and evidence links |
| Mind State / affect | ID, owner, source type and source ID |
| revisions | ID, owner, status and write-time provenance |
| capability contract | active contract ID/version/hash match |
| model continuity | alias, resolved model ID and epoch |

Timestamps are compared exactly only where time behavior is the subject of the
scenario. Otherwise they are evidence fields, not parity-sensitive formatting.

## Exact P-01B acceptance contract

A candidate passes semantic parity only when the real package, in its isolated
workspace and with a disposable technical store, satisfies all of the following
observable requirements without changing Ashley semantics:

1. Duplicate submission maps to one Ashley job/source outcome.
2. Restart before callback exposes deterministic persisted technical state and
   returns the Ashley job to a safe executable or terminal condition.
3. Failure before callback result creates no Ashley semantic outcome.
4. Failure after callback result but before Ashley transaction creates no
   Ashley semantic outcome.
5. Failure inside the Ashley transaction rolls back every semantic effect.
6. Ashley commit followed by candidate/process failure preserves the Ashley
   outcome exactly once and never reruns the semantic materializer.
7. Retry is bounded, visible, and terminal exhaustion performs no further work.
8. Candidate resume/replay never widens authority or repeats committed effects.
9. Contract mismatch and model-epoch change fail influence closed.
10. Observe/shadow artifacts never become live because later capability state
    changes.
11. Owner, entity UUID, thread, lineage where used, capability contract, model
    epoch, source messages, and provenance map exactly to Ashley-owned IDs.
12. Candidate technical-store commit followed by Ashley transaction failure
    yields no Ashley outcome; candidate state is quarantined or disposable.
13. Ashley transaction commit followed by candidate completion/checkpoint
    failure leaves Ashley authoritative and does not rerun materialization.
14. Candidate store loss or unavailability fails closed without an in-memory,
    production, or alternate-authority fallback.
15. Deleting the candidate store changes no Ashley assertion.

Package features, dashboards, framework-native thread IDs, checkpoint IDs, and
shorter adapter code do not satisfy these requirements by themselves.

## Source modifications

- Added only
  `apps/agent-service/src/core/cognition/p01a-characterization.test.ts`.
- Added this evidence document.
- No production source, schema, migration, route, sandbox, root dependency, or
  package manifest changed for P-01A.
- No production failure-injection seam was needed. SQLite triggers, a fixed
  callback, fake time, and file-backed temporary databases were sufficient.

## Test results

Focused command:

```text
npm test --prefix apps/agent-service -- src/core/cognition/p01a-characterization.test.ts
```

Result on 2026-08-09: PASS, 1 file and 10 tests, approximately 3.11 seconds.

Gate-level results on 2026-08-09:

| Command | Result | Elapsed |
|---|---|---:|
| `npm run build:agent` | PASS | 5.5 s |
| `npm test --prefix apps/agent-service` | PASS | 178.4 s |
| `npm run phase0:offline` | PASS | 183.7 s |
| `npm test` | PASS | 179.1 s |

The complete suites emitted only expected test diagnostics and Node's
experimental SQLite warning; every command exited 0.

## P-01A adjudication and Gate A

- Focused harness: PASS.
- Ten deterministic scenarios: PASS.
- Production data/provider/network: not used.
- Validated foundational authority defect: none.
- Validated provenance corruption: none.
- Validated non-atomic semantic commit: none.
- Build: PASS.
- Complete agent-service tests: PASS.
- `phase0:offline`: PASS.
- Final root `npm test`: PASS.
- Gate A: PASS.
