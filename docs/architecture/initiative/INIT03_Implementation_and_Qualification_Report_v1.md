# INIT-03 REMEDIATION REPORT

VERDICT: PASS for repository-local remediation qualification.

This report records the initial local qualification, the independent Sol High
blocking audit, the repair-only response, and the current local evidence. The
four-layer INIT-03 architecture was preserved:

```text
authoritative source -> persistent Open Cognitive Item
    -> transient motivation projection -> Thought -> Agency / Expression
```

The result is not production, Mint, Recall-promotion, deployment, provider,
Discord, or human-behavior evidence.

## BASELINE

starting HEAD: `c044d4420e18e92bb90c94901f0f92f5e111f5d1`

origin/master: `7d686f4d384da97b1d4d00fb26dedf95b82bbdce`

branch: `master`

worktree: only pre-existing `AGENTS.md` was modified and unstaged.

Initial qualification history:

- Luna local qualification: PASS was reported for the original INIT-03 Wave 0-12 implementation.
- Sol High independent audit: BLOCKED; remediation was required for F01-F09.

The remediation started from the verified `c044d44` local baseline. `AGENTS.md`
was not edited, staged, reverted, or included in a commit.

## SOL FINDINGS F01-F09

| Finding | Original reproduction | Regression test | Fix | Current result |
| --- | --- | --- | --- | --- |
| F01 | Same conclusion with different proposed key material duplicated an OCI; different conclusions with the same proposed key collapsed. | `qualification/init03-adversarial.test.ts`; `cognition/open-items.test.ts` exercise the real materializer. | Host derives canonical identity from authoritative owner, source, entity, kind, summary, and source revision. | FIXED |
| F02 | Normal model-derived cognition used `modelEpoch=0`, so a model continuity change did not invalidate it. | `cognition/worker.test.ts`; `qualification/init03-adversarial.test.ts`; `cognition/migration-24.test.ts`. | Cognition binds to the actual resolved model identity and current model epoch. | FIXED |
| F03 | `LIMIT 8` was applied before eligibility checks, so blocked rows starved a valid later row. | `cognition/wake-selection.test.ts`; `qualification/init03-evaluation.test.ts`. | Bounded paged scan with indexed cursor, eligibility filtering, stable ordering, and wrap-around fairness. | FIXED |
| F04 | Ordinary proactive wake enumerated the full owner OCI inventory. | Runtime structural test plus bounded wake and evaluation tests. | Ordinary wake uses bounded candidate and review paths; rich status remains explicit diagnostics only. | FIXED |
| F05 | Review requests were persisted but no normal Reflection consumer processed them. | `cognition/reconsideration.test.ts`; `runtime.test.ts`; `qualification/init03-evaluation.test.ts`. | Bounded `processPendingOpenCognitiveReviews` intake is wired to the existing Reflection owner. | FIXED |
| F06 | Nuclear schema and continuity sidecar could commit different versions after a v23 migration failure. | `continuity/wave06-migration.test.ts`; `cognition/migration-24.test.ts`. | Recognized pending migration protocol with startup recovery, explicit rollback, and fail-closed version mismatch. | FIXED |
| F07 | Source revision was absent from identity and stale OCI rows could dead-end revised source continuity. | `qualification/init03-adversarial.test.ts`; `cognition/open-items.test.ts`. | Authoritative current source revision participates in identity; stale open rows are atomically superseded. | FIXED |
| F08 | Capability-demoted OCI rows were rejected behaviorally but reported as available. | `cognition/continuity-diagnostics.test.ts`. | Read-only capability, contract, provenance, and relationship eligibility predicates feed unavailable reason codes. | FIXED |
| F09 | Qualification assertions did not prove the critical paths strongly enough. | Strengthened adversarial/evaluation tests and full rerun. | Tests now execute host identity, real model epoch, bounded scale, Reflection consumption, migration recovery, and diagnostic demotion paths. | FIXED |

All nine original reproductions were replayed after repair and did not recur.

## SEMANTIC IDENTITY

host-derived: YES.

model-provided key authoritative: NO. `semanticKeyMaterial` is compatibility
input only and is ignored for durable identity.

same meaning retry: one owner-scoped OCI under retry and concurrent creation.

different meaning same source: distinct OCI rows when the normalized semantic
conclusions differ.

source revision: the authoritative current source revision is included in the
canonical identity. A stale open OCI for the same source identity is
atomically superseded with `source_revision_superseded`; it cannot block the
current revision.

The persisted identity is a non-sensitive digest. Raw semantic summary text is
not used as the durable/indexed key material.

## MODEL CONTINUITY

model-derived OCI carries actual identity: YES. The cognition worker derives
the host continuity identity from the resolved model alias, resolved model id,
and model continuity epoch.

epoch change: the old model-derived OCI becomes non-influential until it is
recreated under the current continuity identity.

source capability independence: preserved. Recall/source eligibility remains a
separate requirement. Human/database-owned source records are not made
model-bound merely because they are source-backed.

## BOUNDED WAKE

candidate algorithm: indexed owner-scoped pages of 32 rows, ascending id cursor,
up to 4 pages, eligibility validation before final selection, at most 8
returned items, deterministic `updated_at DESC, id DESC` ordering, and a
persistent cursor that wraps at the end. Deferred rows are excluded before
candidate output.

maximum candidate-search work per wake: 128 scanned rows and 8 returned OCI
items. The configured bounds are clamped to these maxima.

valid ninth row: found when eight newer rows are blocked. A larger fixture with
100 blocked rows and a valid 101st row also remains within the 128-row bound.

full owner enumeration ordinary wake: NO. Ordinary proactive wake does not
call rich `getOpenCognitiveContinuityStatus`; that status is reserved for
owner diagnostics or a rare bounded no-material diagnostic path.

scale qualification: the runtime structural test rejects reintroduction of
rich full-inventory status into ordinary wake. Wake tests cover blocked-row
floods, cursor fairness, wrap-around, and the maximum scan bound.

## REFLECTION LOOP

review threshold: three genuine considerations request bounded Reflection
review. Candidate scans alone do not increment consideration count.

normal consumer: the existing runtime consumes pending OCI review requests
after pending Reflection events and on the proactive path. Each run processes
at most 8 review requests.

KEEP: leaves the OCI `OPEN` and clears/rearms the review request through a
validated bounded policy.

WITHDRAW: produces `WITHDRAWN` only through deterministic source, capability,
provenance, relationship, owner, and current-source validation.

SUPERSEDE: produces a validated OCI-owned supersession transition.

external truth authority: UNCHANGED. Reflection cannot resolve mutual
commitment truth, relationship truth, Identity, Recall, capability state, or
shadow evidence, and it cannot send a message.

## MIGRATION

normal v22 -> v23: the nuclear v23 DDL and continuity sidecar update run through
an explicit pending-migration protocol. A pending record identifies source,
target, lineage, build identity, and phase. Nuclear commit is followed by a
continuity commit and finalization.

current schema: v24. The v24 migration adds model continuity storage and the
bounded wake cursor. The same failure-safe protocol covers v23 and v24.

injected failure: a test fault after nuclear commit and before continuity
finalization leaves a recognized `pending_nuclear_migration` record. The
sidecar remains at the source version until recovery.

restart recovery: startup compares the actual nuclear version with the pending
record and deterministically rolls back the recognized source state or
finalizes the recognized target state. An unexpected version fails closed.

split unrecognized state possible: NO.

## DIAGNOSTICS

capability-demotion accuracy: a demoted or contract-ineligible OCI is counted
under `capability_blocked`, not `availableBySourceClass`. Deferred, shadow,
source-unavailable, and withdrawn-relationship cases have separate bounded
reason classifications.

owner privacy: status is owner-scoped and does not expose raw semantic text,
source plaintext, prompt fragments, raw reasoning, or key material.

read-only: YES. Diagnostic status uses read-only capability and contract
predicates and does not bootstrap capability rows or mutate release/KV state.

## TEST QUALITY REPAIRS

- Proposed semantic-key values were replaced with tests that vary the key while
  holding semantic meaning constant, then vary meaning while holding the key
  constant.
- Source-revision coverage now mutates the real authoritative source revision
  and proves stale supersession plus current successor materialization.
- Model continuity coverage now follows the normal cognition worker dispatch
  and asserts actual resolved identity and epoch, not a helper-only default.
- Concurrency coverage uses competing database writers and checks one durable
  result rather than serial calls to the same connection.
- Wake coverage proves the valid ninth row, the 100-plus blocked-row case, the
  cursor fairness path, and the 128-row maximum.
- Reflection coverage invokes the normal runtime consumer and verifies review
  mutation rather than only inspecting a persisted request.
- Migration coverage injects failure after the nuclear stage, restarts, and
  verifies recovery and data preservation.
- Diagnostic coverage demotes a capability and verifies truthful
  `capability_blocked` output without state mutation.

## FULL QUALIFICATION

focused: 12 remediation/runtime/continuity files, 68 tests passed.

`npm test`: PASS, exit code 0; 114 test files, 817 passed, 1 skipped (818
tests total).

`phase0:offline`: PASS, exit code 0; the script completed with `OK offline
tier`.

external network attempts: 0.

agent build: `npm run build:agent` PASS.

discord build: `npm run build:discord` PASS.

`git diff --check`: PASS after the documentation changes.

## PRODUCTION

Mint: UNTOUCHED

Recall: UNTOUCHED

sandbox: UNTOUCHED

providers: NO LIVE CALLS

Discord: NO LIVE TRAFFIC

push: NO

deploy: NO

## LOCAL COMMITS

Remediation source and qualification commits, in order:

1. `72c09dc` `fix(cognition): derive OCI semantic identity deterministically`
2. `c39f3a1` `fix(cognition): bind OCI to model continuity`
3. `4ddcebd` `fix(initiative): bound and fairly select OCI wake work`
4. `b887b59` `feat(cognition): complete OCI Reflection review loop`
5. `3984ab4` `fix(db): make schema 23 migration failure-safe`
6. `c460b7d` `fix(initiative): make OCI diagnostics truthful`
7. `63d91aa` `test(qualification): align health schema assertion with v24`

The documentation commit contains this report and the corrected contract.

## WORKTREE

AGENTS.md: UNCHANGED / UNSTAGED relative to its pre-existing state.

other dirty paths: none after the remediation plan artifact is removed.

No remediation commit contains `AGENTS.md`.

## HUMAN NEXT GATE

INDEPENDENT SOL HIGH RE-AUDIT REQUIRED BEFORE INIT-03 ACCEPTANCE.

The local evidence does not authorize production, Mint, Recall mutation,
deployment, sandbox activation, provider use, Discord traffic, or push.

STOP.
