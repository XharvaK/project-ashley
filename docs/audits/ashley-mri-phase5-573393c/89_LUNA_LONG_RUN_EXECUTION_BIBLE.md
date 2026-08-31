# 89 — Luna Long-Run Execution Bible

## Mission

Implement W0–W7 mechanically and produce the W8 read-only measurement packet. Do not invent architecture. Do not implement W9. Work only in the owner-authorized implementation checkout and preserve all existing work.

```text
READ CURRENT WAVE CONTRACT
-> INSPECT CURRENT SOURCE
-> IMPLEMENT SMALLEST COMPLIANT DELTA
-> RUN REQUIRED GATES
-> RECORD EVIDENCE
-> CHECKPOINT
-> CONTINUE ONLY IF CONTRACT ALLOWS
```

If contract and source conflict:

```text
STOP
IMPLEMENTATION_BLOCKED=<exact contradiction>
```

Do not reinterpret Phase 4, select a new model, weaken a parser/test, repair production state, or widen authority to continue.

## Required reading before source work

Read in repository `AGENTS.md` order:

1. `VISION.md`
2. `docs/Ashley_Core_Principles.md`
3. `docs/Ashley_Constitution.md`
4. `docs/Ashley_Stewardship_Compact.md`
5. `docs/Ashley_Ethics.md`
6. `docs/Ashley_Hierarchy.md`
7. `docs/architecture/Ashley_Architecture_Roadmap.md`
8. `docs/architecture/Ashley_Architecture_Freeze.md`
9. `docs/architecture/Ashley_Cross_Phase_Architecture.md`
10. Phase 4 artifacts `55`–`75`
11. `77_PHASE5_GOVERNING_IMPLEMENTATION_CONTRACT.md`
12. `78_PHASE5_MASTER_EXECUTION_PROTOCOL.md`
13. `88_CROSS_WAVE_IMPLEMENTATION_CONTRACT_MATRIX.md`
14. this document

Before each wave, re-read only its named plan and Phase 4 sources listed in that plan. Re-inspect current source. Documentation does not override changed source facts; source conflict triggers STOP, not architecture improvisation.

## Global precheck

Record in the wave evidence packet:

```powershell
git rev-parse --show-toplevel
git rev-parse HEAD
git status --short
git diff --stat
git diff --name-only
```

Then:

- read all applicable `AGENTS.md` files;
- identify owner changes and do not reset/discard/overwrite them;
- verify current migration/schema versions from source;
- verify package scripts from current `package.json` files;
- verify exact paths/symbols in the wave plan;
- inventory direct writers/callers relevant to the wave;
- record assumptions as falsifiable checks;
- stop if the candidate checkout or authority boundary differs materially.

No wave authorizes commit, push, merge, activation, deployment, provider calls, Discord messages, Mint actions, production DB writes, or service restart. Those need fresh explicit authority. Ordinary local source edits and offline tests are allowed only in an implementation run that the owner commissions.

## Execution order

```text
W0 -> W1 -> W2 -> W3 -> W4 -> W5 -> W6 -> W7 -> W8 -> STOP
```

Do not parallelize source waves that share schema/runtime files. The order is conservative and protects evidence attribution.

## W0 — Thought-Control Boundary

Read:

- `79_W0_THOUGHT_CONTROL_BOUNDARY_MECHANICAL_PLAN.md`
- Phase 4 `57`–`62`, `71`, `72`

Inspect first: `cognitive-v021/thought/*`, `types.ts`, `settlement/*`, `authority/*`, `attention/*`, Model Fabric receipts, `mistral-client.ts`, current nuclear schema/migration tests.

Implement test-first. Land strict semantic union, Kernel Envelope, captured-by-value attempt provenance, alias/durable-ID binding, operation intent conversion, shared 30-second deadline, fresh invocation per provider call, and the publication second fence hooks. Preserve the four semantic branches and distinguish semantic `abstain` from runtime failure. Add the strict coercion-negative catalog and semantic-wrong fixtures using only Thought-owned fields. Treat kernel-owned fields only as forbidden-field cases.

Required checkpoint: focused unit/integration/concurrency/crash/adversarial tests and agent-service build from section U of 79. Stop before provider requalification.

## W1 — Release Truth and Qualification Substrate

Read:

- `80_W1_RELEASE_TRUTH_QUALIFICATION_MECHANICAL_PLAN.md`
- Phase 4 `66`, `71`, `72`, `73`

Inspect first: Model Fabric catalog/hash/types/dispatch/receipts/activation/health, adapters, `mistral-client.ts`, `env.ts`, control-root artifact rules.

Implement pure component/aggregate fingerprinting, immutable qualification evidence, logical/actual-wire proof, exact runtime release comparison, mismatch taxonomy, and separated derived health predicates. Prove a logical enforcement request cannot qualify as stronger actual wire enforcement. Preserve `unavailable` when the provider does not expose authoritative grammar-engine metadata. Do not make health call a provider. Do not make Git SHA or `ASHLEY_RELEASE_ID` sole authority.

Required checkpoint: focused Model Fabric/adapter/activation tests and build. Produce offline exact-candidate evidence.

## W2 — Current Route Requalification

Read:

- `81_W2_CURRENT_ROUTE_REQUALIFICATION_PLAN.md`
- Phase 4 `62`, `66`, `71`, `73`, `74`

This is qualification, not redesign. First candidate is exactly `nim/openai/gpt-oss-20b`. Build the offline harness and prove its zero-network default. Run fixture cases through the real W0/W1 path. Record raw JSON syntax, independent exact-schema conformance, strict-parser result, and semantic validity separately. Require the `PROVIDER_ACCEPTED_PARSER_REJECTED` negative harness witness without adding Promptfoo, BAML, tolerant repair, or a runtime dependency.

Stop for explicit live-provider authority before `--live`. If authorized, perform only the bounded exact NIM/no-fallback run. PASS is conjunctive. Any failure yields `NOT_QUALIFIED`. Do not normalize output or select a replacement.

Required result:

```text
W2_VERDICT=PASS|NOT_QUALIFIED|NOT_RUN|OUTCOME_UNKNOWN
OWNER_APPROVED_EXPANSION_SELECTION_REQUIRED=yes|no
```

Continue only when the contract permits. A failed current occupant blocks automatic progression to replacement selection.

## W3 — F011 Qualification Closure

Read:

- `82_W3_F011_QUALIFICATION_CLOSURE_PLAN.md`
- Phase 4 `63`, `69`, `70`, `72`, `73`, `74`

Inspect fixtures, snapshot generator, current qualification test, projection allocator, derived store, FTS verification, and resource harnesses. Freeze dataset/labels/thresholds before evaluation. Do not redesign the allocator. Decide Fuse need from evidence and require exact license acceptance if selected.

Build Stage H harness locally. Stop for physical Mint authority. A physical run must use the exact candidate and isolated stores. Preserve Stage A, Fuse, Stage H, release-link, and later production gates independently.

## W4 — R1 Semantic Authority and Derived Retraction

Read:

- `83_W4_R1_SEMANTIC_AUTHORITY_DERIVED_RETRACTION_MECHANICAL_PLAN.md`
- Phase 4 `64`, `70`, `72`, `73`, `74`

Inventory every semantic SQL writer before edits. Verify W0 migration number, then implement nuclear barrier/journal and cumulative sidecar migration in the current sequence. Build the barrier/vector, complete bounded packs, Settlement second fence, idle-writer removal, atomic canonical invalidation outbox, read-time derived eligibility, non-current rebuild, and atomic activation.

Failure rule: canonical mutation may stand when derived sync fails, but lexical scope remains unavailable/exact-only. Never return a physical stale row as current. Cover reader/transition, pre-invalidation retrieval, multiple-support removal, stale FTS/cache rows, and rebuild races. Do not invent the reviewer-proposed cache identity unless current-source proof shows the required barrier/journal/read-time gates can still be bypassed.

Required checkpoint: migration, writer-exclusivity, race, crash-gap, redaction/physical-stale-row, exact-only, receipt-boundedness, and build gates.

## W5 — R2 Wake Singularity

Read:

- `84_W5_R2_WAKE_SINGULARITY_MECHANICAL_PLAN.md`
- Phase 4 `65`, `72`, `73`, `74`

Inventory all producers. Add cumulative sidecar wake migration, occurrence identity, one wake/cycle transaction, wake-bound inbox/dispatch, consequence uniqueness, durable preemption/cancellation, and safe recovery. Convert or quarantine legacy pending work exactly once.

Required checkpoint: two-producer/two-worker, forced replay, duplicate wake/completion, lost durable ack after external success, lease expiry with in-flight or late success, cancellation/quarantine late completion, preemption, structural correction, terminal immutability, and ambiguous-effect no-replay tests plus build.

## W6 — R4 Failure and Retry Authority

Read:

- `85_W6_R4_FAILURE_RETRY_AUTHORITY_MECHANICAL_PLAN.md`
- Phase 4 `67`, `72`, `73`, `74`

Inventory SDK/adapters and dispatch-truth boundaries. Add cumulative sidecar retry migration, pure numeric policy, fair selector, atomic attempt ledger, typed handler settlement, quarantine, reconciliation, and immutable repair lineage. Preserve W5 IDs. For every retry-governed provider/external adapter, prove hidden retries are disabled and one Ashley attempt produces at most one physical dispatch, using explicit configuration plus call counts where applicable.

Required checkpoint: five-total/15-minute schedule, delays `1/5/30/120`, rate-limit cap, starvation, poison work, two workers, restart, ambiguous outcome, repair authority, hidden-retry tests, and build.

## W7 — R5 Durable Private Budget

Read:

- `86_W7_R5_DURABLE_PRIVATE_BUDGET_MECHANICAL_PLAN.md`
- Phase 4 `68`, `72`, `73`, `74`

Inventory all private entrypoints and caller-supplied/in-memory counters. Add cumulative sidecar budget migration, policy high-water clock, atomic reservation, W5 admission/W0 invocation binding, dispatch-start commit, proof-only release, ambiguity reconciliation, recovery, and authoritative diagnostics. Conservatively handle recent legacy usage.

Required checkpoint: 12-per-rolling-hour, 11-used final-slot multiprocess race, restart cannot refill, every crash boundary, timeout/cancel/unknown, exact expiry, policy switch, backward and >5-minute clock discontinuity, and build.

## W8 — R6 read-only measurement

Read:

- `87_W8_R6_MEASUREMENT_AND_PRESERVATION_PLAN.md`
- Phase 4 `69`, `70`, `72`, `73`, `74`

Do not edit product/test/config source for W8. Do not migrate, rebuild, reconcile, vacuum, repair, delete, archive, or compact. Prepare/execute only the exact read-only query bundle against an authorized immutable snapshot or proven read-only source. Capture before/after zero-mutation proof. Treat missing data as unknown. Produce the owner-decision packet.

Stop after W8. Do not write W9 instructions.

## Per-wave test and repair loop

For W0–W7:

1. Write a behavioral falsification test for the first target invariant.
2. Run the narrow test and confirm it fails for the expected reason.
3. Implement the smallest complete in-contract delta.
4. Run the narrow test.
5. Run the wave's unit set.
6. Run integration, concurrency, restart, crash-gap, and adversarial sets named in section U/S.
7. Run the agent-service build/typecheck.
8. Record exact command, exit code, relevant output, candidate SHA/diff identity, and environment.
9. Repair only within the frozen contract. Re-run the affected gate and all earlier gates whose surfaces changed.
10. Stop when a fix requires new ownership, state, failure, migration, provider, or lifecycle semantics.

Do not weaken a test, threshold, parser, identity check, or currentness fence to make a gate pass.

## Evidence packet schema

Each wave packet contains:

```text
WAVE_ID
BASE_SHA
CANDIDATE_SHA_OR_WORKTREE_DIFF_IDENTITY
SOURCE_FILES_CHANGED
OWNER_CHANGES_PRESERVED
MIGRATION_FROM_TO
CONTRACT_IDENTITIES
TEST_COMMANDS_AND_EXIT_CODES
FAILURE_INJECTION_RESULTS
BUILD_RESULT
UNRUN_PHYSICAL_OR_PRODUCTION_GATES
KNOWN_LIMITATIONS
SOURCE_VERDICT
QUALIFICATION_VERDICT
PRODUCTION_VERDICT
BLOCKERS
```

Do not call `SOURCE_COMPLETE` “qualified,” “deployed,” or “production accepted.” Keep local fixture, exact-candidate offline, physical Mint, deployed, and production witness evidence separate.

## Checkpoint and resume without a special ledger

Do not create a Phase 5 progress ledger or `LUNA_EXECUTION_STATE.md`. Use normal workspace truth:

- inspect `git status --short`, `git diff`, current HEAD, existing tests, and existing wave evidence;
- read the current wave contract;
- identify the first incomplete contract checklist item from actual files and gate output;
- verify completed gates only when their source/diff identity still matches;
- continue from that point;
- rerun only gates invalidated by later changes or required by the current contract.

An interrupted, unverified source edit remains unverified. Do not infer completion from file presence. Do not duplicate bookkeeping already present in diffs, test output, or evidence packets.

## Blocker return schema

```text
IMPLEMENTATION_BLOCKED=<exact contradiction>
WAVE_ID=<W0-W8>
CONTRACT_CLAUSE=<artifact and section>
CURRENT_SOURCE_EVIDENCE=<path:symbol or schema/query>
FAILED_GATE=<command/test/check>
SAFE_WORK_COMPLETED=<bounded list>
STATE_PRESERVED=<yes/no and evidence>
SMALLEST_OWNER_DECISION_REQUIRED=<one precise decision>
UNAUTHORIZED_ACTIONS_TAKEN=none
```

## Final stop law

Stop immediately on architecture contradiction, destructive/remote authority need, unknown external outcome, migration collision, inability to preserve user work, failed mandatory gate without an in-contract repair, W2 replacement selection, W3 allocator redesign/Fuse owner decision, production mutation, or any request to implement W9.

Successful W0–W8 local work still ends at:

```text
SOURCE_AND_OFFLINE_EVIDENCE_COMPLETE
DEPLOYMENT_AUTHORIZATION_REQUIRED
PRODUCTION_ACCEPTANCE_OPEN
W9_BLOCKED_NOT_AUTHORIZED
```
