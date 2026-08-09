# P-01B Workflow Parity Report

**Overall status:** PASS; Gate B passed after the authorized LangGraph continuation

**Fixture contract:** unchanged from
`P01A_Current_Cognition_Characterization.md`

**Runtime:** Node `v24.14.1`, npm `11.12.1`, Windows x64

The comparison used a fixed callback, synthetic Ashley-owned state, temporary
SQLite files, and no provider, Discord, sandbox, production database, or
production import. Candidate technical stores were treated as disposable and
never as cognitive authority.

## Measurement method

- Package versions, integrity values, engines, and licenses came from each
  isolated `package-lock.json` and the installed package metadata.
- Dependency count is the number of `node_modules/*` entries in the isolated
  lockfile. Installed footprint is the recursive byte sum of regular files in
  that candidate's `node_modules` immediately after install.
- Startup and RSS are five fresh-process observations. CURRENT imports the
  built agent modules, opens an in-memory nuclear database, starts the observe
  loop, and immediately stops it. MASTRA imports the JavaScript adapter,
  initializes its synthetic Ashley database and real LibSQL storage, and stops
  at the ready boundary. LANGGRAPH imports its JavaScript adapter and initializes
  the shared synthetic Ashley database, real StateGraph, and real SQLite
  checkpointer. Reported startup is the median process uptime; RSS is the largest
  ready-boundary observation. These are small local samples, not production
  benchmarks or continuous peak profilers.
- LOC is physical line count. Adapter LOC excludes the synthetic Ashley
  authority. Proof LOC includes tests, authority fixture, restart driver, test
  runner, and metrics probe.
- Candidate store size is the file size after one successful run and clean
  close. It illustrates dual-store cost; it is not a retention forecast.

## CURRENT baseline

The P-01A suite passed all ten characterization scenarios. Current Ashley uses
one SQLite authority and has no workflow-framework or checkpointer dependency.
It atomically commits all semantic effects, the completed run, and job
completion. Startup blindly returns every `running` job to `pending`, so model
work may repeat, but committed semantic work did not replay.

| Metric | CURRENT result |
|---|---|
| Semantic parity | PASS, 10/10 P-01A scenarios |
| Restart correctness | PASS with coarse startup recovery; no lease/claim token |
| Replay safety | PASS for semantic effects; callback work can repeat |
| Retry visibility | Persisted attempts, `available_at`, error, and terminal state |
| Idempotency burden | Ashley `source_key`, semantic uniqueness, and single transaction |
| Dual-store complexity | None |
| Dependency count/size | 0 dedicated workflow packages; 0 incremental bytes |
| Installed disk footprint | 0 incremental bytes for workflow infrastructure |
| Startup time | median 689 ms; five observations 686-691 ms |
| Peak RSS | 111,939,584 bytes maximum ready-boundary observation |
| Adapter source LOC | 0; this is the native implementation |
| Proof/test LOC | 544 for the P-01A characterization harness |
| Potential Ashley LOC retired | Not applicable to CURRENT |
| Migration surface | None |
| Upgrade/persistence format risk | Existing Ashley schema/migration ownership only |
| Host operational requirements | Existing Node process and authoritative SQLite |

The current orchestration surface is 159 physical lines in `jobs.ts` plus an
upper bound of 297 lines in the characterized `worker.ts` callback/integration/
loop region. This 456-line ceiling includes Ashley semantic materialization
that a workflow package may not own, so it is not a retirement estimate.

## MASTRA

### Exact packages

| Package | Version | Integrity | Node | License |
|---|---:|---|---|---|
| `@mastra/core` | `1.57.0` | `sha512-2ud56Ow5wwyAFegxXkkOHcQfCG0W9Sz1ex2qVf3y/704zwwYZl/RBZXZV/7277RIxWFk8Bnw8pmGtGQ4tZVWEg==` | `>=22.13.0` | Apache-2.0 |
| `@mastra/libsql` | `1.19.0` | `sha512-BbxEMhHHhXJSL5Argwre3ybJRgwxGQu6N2fj4nTFEmDQ4wj+CjaeEAuen2wD6wLA58PB4BtMMCcHDm1GoeME7Q==` | `>=22.13.0` | Apache-2.0 |
| `zod` | `4.4.3` | `sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==` | package does not declare an engine | MIT |

License values are the package metadata captured in the isolated lockfile.
The current Node runtime satisfies the declared engines.

### Real adapter

`spikes/p01b/mastra/src/adapter.mjs` uses the real `createWorkflow`,
`createStep`, `Mastra`, `LibSQLStore`, `createRun`, `start`, `suspend`, and
`resume` APIs. Mastra stores only workflow/snapshot state. The synthetic Ashley
database owns the job ID, source key, outcome, contract, epoch, provenance, and
semantic effects.

### Failure matrix

| Required behavior | Result | Evidence |
|---|---|---|
| Duplicate submission | PASS | one Ashley job/outcome; second call reconciles before workflow execution |
| Process restart before callback | PASS | first child suspends; second child resumes persisted run; callback executes once |
| Failure before callback result | PASS | five bounded attempts; no outcome/effect |
| Failure after callback result/before Ashley transaction | PASS | five callback results; materializer never begins |
| Ashley transaction rollback | PASS | five candidate retries; each Ashley transaction fully rolls back |
| Ashley commit then candidate/process failure | PASS | one Ashley commit; five candidate materializer invocations reconcile the same outcome |
| Bounded retry | PASS | `retries: 4` yields five total attempts and terminal workflow failure |
| Candidate resume/replay | PASS | real persisted suspend/resume plus deterministic run ID and Ashley precheck |
| Stale capability/epoch | PASS | contract and epoch mismatches produce no outcome/effect |
| Observe/shadow non-influence | PASS | only shadow episode/revision effects; no influencing fact/state/affect |
| Exact provenance mapping | PASS | owner, entity UUID, thread, messages, contract, epoch, and provenance preserved |
| Candidate store loss/unavailability | PASS | resume fails; Ashley remains without outcome/effect; no fallback authority |
| Candidate commits before Ashley rollback | PASS | candidate run exists/fails while Ashley transaction leaves no outcome |
| Ashley commits before candidate completion | PASS | Ashley outcome remains authoritative; next call does not rerun semantic materialization |

Command and result:

```text
npm test
10 tests, 10 passed, 0 failed, 4.65 s test-runner duration
```

### Metrics

| Metric | MASTRA result |
|---|---|
| Semantic parity | PASS for the normalized P-01A contract |
| Restart correctness | PASS using persisted snapshot and real child-process restart |
| Replay safety | PASS because Ashley outcome reconciliation precedes rerun |
| Retry visibility | Candidate failure plus Ashley attempts/trace; five-attempt ceiling |
| Idempotency burden | Still belongs to Ashley; deterministic candidate run ID is technical only |
| Dual-store complexity | One extra LibSQL workflow store; disposable but operationally real |
| Dependency count/size | 252 transitive package entries |
| Installed disk footprint | 118,557,618 bytes across 11,355 files |
| Startup time | median 721 ms; five observations 717-728 ms |
| Peak RSS | 225,619,968 bytes maximum ready-boundary observation |
| Adapter source LOC | 187 |
| Proof/test LOC | 532 |
| Potential Ashley LOC retired | 0 proven; at most part of the 456-line orchestration ceiling, never semantic materializers |
| Migration surface | New adapter, technical-store lifecycle, recovery/reconciliation, packaging, and host operations |
| Upgrade/persistence format risk | Medium/high: framework snapshot and LibSQL formats/APIs become maintained compatibility surfaces |
| Host operational requirements | Node >=22.13; writable local file; no Redis/Postgres/Docker/Kubernetes/control plane |

One successful clean-close sample produced a 479,232-byte Mastra store. The
synthetic Ashley database was 49,152 bytes. This extra store is not authority
and can be deleted without changing Ashley assertions.

### Candidate verdict

**PASS.** The real pinned packages met the isolated semantic and failure
contract without changing Ashley semantics. This is a candidate result only;
it is not a P-01C selection and authorizes no production integration.

## LANGGRAPH

### Exact packages

| Package | Version | Integrity | Node | License |
|---|---:|---|---|---|
| `@langchain/core` | `1.2.5` | `sha512-4lXj3fTPQYGdEtOG9gWDnvmp6wpXNMo9MmWzfZxxPUxMcjulZJa93pYAZ90luFLg2YVdVuUl2tuwdD7tY5K9MA==` | `>=20` | MIT |
| `@langchain/langgraph` | `1.4.9` | `sha512-EvD9rS66Cya09y6rbMgD3Ir8miAkJQFo7FyJOPRPO736Kz3y5TeyeBDOS8ctff/jRc788bPijHx2NVFM79Qqig==` | `>=18` | MIT |
| `@langchain/langgraph-checkpoint-sqlite` | `1.0.3` | `sha512-odOy8z45HvbWerx4t9g//fA38QNq0Rr6cw8UeHbx1LDOXbarMsfJ5CrmmJs5FlhK16MTlsyaF2m+JJ2cXkTLPg==` | `>=18` | MIT |
| `zod` | `4.4.3` | `sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==` | package does not declare an engine | MIT |

License values are the package metadata captured in the isolated lockfile. The
current Node runtime satisfies the declared engines.

### Lifecycle history and authorized continuation

The first overnight run installed with lifecycle scripts disabled. The real
`SqliteSaver.fromConnString(":memory:")` plus `setup()` probe then failed because
`better-sqlite3@12.11.1` had no native binding, so the candidate correctly
stopped without an adapter. That dependency declares:

```text
install: prebuild-install || node-gyp rebuild --release
```

On 2026-08-09 the user authorized only that pinned native lifecycle inside the
isolated LangGraph workspace. The continuation ran:

```text
npm ci --ignore-scripts --audit=false --fund=false
npm rebuild better-sqlite3
```

The rebuild succeeded without lockfile changes. A 1,919,488-byte binding was
present at `better-sqlite3/build/Release/better_sqlite3.node`, and the smallest
real `SqliteSaver` setup probe passed. Whether npm obtained a prebuilt binary or
completed a local build was not separately instrumented, so this report does
not infer which path succeeded.

### Real adapter

`spikes/p01b/langgraph/src/adapter.mjs` uses real `StateGraph`, `Annotation`,
node retry policy, graph invocation, checkpoint state, static interrupt, and
`SqliteSaver` APIs. LangGraph owns only technical graph/checkpoint state. The
same synthetic Ashley authority fixture used by Mastra owns job/source IDs,
contract, epoch, provenance, semantic outcome, and completion truth.

### Failure matrix

| Required behavior | Result | Evidence |
|---|---|---|
| Duplicate submission | PASS | one Ashley job/outcome; second call reconciles before graph invocation |
| Process restart before callback | PASS | first child persists an interrupt with `next=[callback]`; second child resumes and commits once |
| Failure before callback result | PASS | five real node attempts; no outcome/effect; terminal Ashley job |
| Failure after callback result/before Ashley transaction | PASS | five callback results; materializer never begins |
| Ashley transaction rollback | PASS | callback checkpoint persists; five materializer attempts each roll back completely |
| Ashley commit then candidate/process failure | PASS | one Ashley commit; repeated candidate completion failures never alter it |
| Bounded retry | PASS | explicit `maxAttempts: 5`; traces show five attempts and terminal exhaustion |
| Candidate resume/replay | PASS | direct replay from an old checkpoint repeats callback work but not the committed semantic materializer |
| Stale capability/epoch | PASS | both mismatches fail closed with no outcome/effect |
| Observe/shadow non-influence | PASS | only shadow episode/revision effects; no live fact/state/affect |
| Exact provenance mapping | PASS | owner, entity UUID, thread, messages, contract, epoch, and provenance remain Ashley IDs |
| Candidate store loss/unavailability | PASS | resume from a deleted store fails; callback and semantic effects remain absent |
| Candidate commits before Ashley rollback | PASS | checkpoint contains the callback result while Ashley has no outcome after five rollbacks |
| Ashley commits before candidate completion | PASS | Ashley job/run stay completed; adapter precheck prevents later materializer execution |
| Deleting candidate state | PASS | completed Ashley job/outcome/effects remain unchanged after checkpoint deletion |

The replay test recorded two actual callback invocations from an old checkpoint,
two materializer-node invocations, one Ashley `materialization_commit`, one
Ashley reconciliation, one run row, and five semantic effects. Thus callback
work can repeat under explicit LangGraph replay, while committed Ashley
materialization remains exactly once.

Command and result:

```text
npm test
12 tests, 12 passed, 0 failed, 4.20 s test-runner duration
```

### Metrics

| Metric | LANGGRAPH result |
|---|---|
| Semantic parity | PASS for all 15 normalized acceptance clauses |
| Restart correctness | PASS using a persisted SQLite checkpoint and real child-process restart |
| Replay safety | PASS; callback may repeat, Ashley semantic commit remains exactly once |
| Retry visibility | Five node attempts in the Ashley trace; fixture intervals fixed at 1 ms without jitter |
| Idempotency burden | Remains Ashley-owned through `source_key`, outcome precheck, and atomic materialization |
| Dual-store complexity | One extra SQLite checkpoint store; disposable but operationally real |
| Dependency count/size | 60 transitive package entries |
| Installed disk footprint | 61,250,518 bytes across 5,495 files after native rebuild |
| Startup time | median 589 ms; five observations 584-593 ms |
| Peak RSS | 153,743,360 bytes maximum ready-boundary observation |
| Adapter source LOC | 155 |
| Proof/test LOC | 358; shared 257-line Ashley authority fixture reused and not double-counted |
| Potential Ashley LOC retired | 0 proven; only part of the 456-line orchestration ceiling could be proposed later |
| Migration surface | Adapter, native install lifecycle, checkpoint file lifecycle, replay/reconciliation, packaging, and host operations |
| Upgrade/persistence format risk | Medium/high: framework checkpoint schema/API plus native Node ABI compatibility |
| Host operational requirements | Node >=20, compatible `better-sqlite3` native binding, writable local file; no external service/control plane |

One successful clean-close sample produced a 20,480-byte LangGraph checkpoint
store. The synthetic Ashley database was 49,152 bytes. Deleting the checkpoint
store changed no Ashley assertion.

### Candidate verdict

**PASS.** The real pinned packages and real SQLite checkpointer met the isolated
semantic/failure contract without changing Ashley semantics. This is a
candidate result only and authorizes no production integration.

## Side-by-side comparison

| Area | CURRENT | MASTRA | LANGGRAPH |
|---|---|---|---|
| Executable parity evidence | PASS | PASS | PASS |
| Semantic authority | Ashley SQLite | Ashley synthetic SQLite | Ashley synthetic SQLite |
| Durable restart exercised | coarse Ashley recovery | real Mastra snapshot resume | real SQLite checkpoint resume |
| Semantic replay safety | PASS | PASS | PASS; explicit replay repeats callback only |
| Extra technical store | none | LibSQL | SQLite checkpoint store |
| Incremental package footprint | none | 118.6 MB / 252 entries | 61.3 MB / 60 entries |
| Ready-boundary RSS sample | 111.9 MB max | 225.6 MB max | 153.7 MB max |
| Adapter/proof LOC | 0 / 544 characterization | 187 / 532 | 155 / 358 plus shared fixture |
| Operational novelty | none | second local store + framework lifecycle | native addon + second local store + checkpoint lifecycle |
| Proven Ashley LOC retired | not applicable | 0 | 0 |
| Candidate verdict | baseline | PASS | PASS |

Both frameworks provide finer persisted restart than CURRENT in this fixture.
LangGraph made replay behavior especially visible and used fewer dependencies,
less adapter/proof code, and less sampled memory than Mastra. Both still retain
Ashley-side idempotency/reconciliation, add a second persistence surface, and
prove zero production Ashley LOC retireable.

## Gate B

**PASS after the authorized continuation.** P-01A remains 10/10 PASS, Mastra's
real-package suite remains PASS, and LangGraph's real-package suite is 12/12
PASS. The P-01A contract and root manifests are unchanged; no production import,
schema, Recall, sandbox, or shared-source change occurred; candidate stores were
disposable; candidate `node_modules` and generated stores were removed; focused
P-01A, agent build, and `phase0:offline` all passed; and no authority,
provenance, or non-interference defect was validated. P-01C may execute.
