# Project Ashley Phase 5 Final Implementation Report

## Terminal state

```text
RUN=PROJECT_ASHLEY_PHASE5
SEQUENCE=W0->W1->W2->W3->W4->W5->W6->W7->W8->STOP
STATE=COMPLETE_UNDER_SECTION_22
CANDIDATE_HEAD=573393c3fdb2392a45137d4625635658eb4b5d88
CHECKOUT_STATE=detached HEAD
WORKTREE=authorized detached checkout
PRODUCTION_ACCEPTANCE=NOT_ESTABLISHED
PRODUCTION_MUTATION=NONE
W9=NOT_STARTED_AND_BLOCKED_NOT_AUTHORIZED
```

The full authorized task reached `COMPLETE` under the packet semantics. This
does not mean that every qualification result is `PASS`. The packet-defined
negative W3 Stage A result and the bounded W2 `OUTCOME_UNKNOWN` result remain
preserved evidence. Later source execution continued because the owner’s
corrected steering authorized the W0-to-W8 run and allowed packet-compatible
negative evidence to remain part of a complete run.

## Wave closure

| Wave | Final state | Governing evidence |
|---|---|---|
| W0 | `COMPLETE_FOR_OFFLINE_VERIFICATION` | `W0_IMPLEMENTATION_EVIDENCE.md` |
| W1 | `COMPLETE_FOR_OFFLINE_VERIFICATION` | `W1_IMPLEMENTATION_EVIDENCE.md` |
| W2 | `OUTCOME_UNKNOWN` preserved; no replay | `W2_IMPLEMENTATION_EVIDENCE.md`, `work/phase5-w2-live-20260831/w2-route-qualification.json` |
| W3 | `COMPLETE_WITH_NEGATIVE_STAGE_A_AND_PASS_STAGE_H` | `W3_IMPLEMENTATION_EVIDENCE.md` |
| W4 | complete after predecessor-gated revalidation | `W4_IMPLEMENTATION_EVIDENCE.md` |
| W5 | complete after W4 revalidation | `W5_IMPLEMENTATION_EVIDENCE.md` |
| W6 | complete after W5 revalidation | `W6_IMPLEMENTATION_EVIDENCE.md` |
| W7 | complete after W0-W6 predecessor revalidation | `W7_IMPLEMENTATION_EVIDENCE.md` |
| W8 | complete passive local measurement | `W8_IMPLEMENTATION_EVIDENCE.md` |

The early W4/W5/W6/W7 work was preserved while W0-W3 were completed. After
W0-W3, artifacts 83 and 84 were re-read and W4/W5 were checked against the
established predecessor contracts and evidence. Artifact 85 was then applied
to W6. Artifact 86 was re-read and the private-budget implementation was
checked against the completed W0-W6 state before W7 was declared complete.
Existing code was not accepted merely because it had been written early.

## Implemented controls

- W0 establishes the strict Thought semantic branches, Kernel Envelope,
  reference and operation binding, attempt identity, and settlement fences.
- W1 establishes capability identity, qualification and Release Truth
  artifacts, wire-evidence separation, attempt receipts, and fail-closed
  health predicates.
- W2 implements exact current-route qualification for
  `nim/openai/gpt-oss-20b`, including bounded fixture and live paths. Its one
  authorized isolated live attempt timed out without attributable provider
  evidence. The exact persisted result is `OUTCOME_UNKNOWN`; it was not
  replayed.
- W3 implements the F011 closure harness. Stage A remains negative because the
  frozen synthetic labels contain no relevant labels. Stage H independently
  passed once on the authorized Mint host using an isolated root and the exact
  candidate SHA.
- W4 adds semantic currentness barriers, owner-version vectors, invalidation
  journaling, second-fence Settlement checks, and derived retraction/rebuild
  boundaries.
- W5 adds durable wake identity, cycle singularity, lease and consequence
  recovery, wake-bound ingress, and sidecar v3 migration/quarantine behavior.
- W6 adds durable retry authority, typed failure classes, age-bounded
  Retry-After handling, fixed retry delays and caps, fair scheduling,
  dispatch-truth reconciliation, and repair lineage.
- W7 adds the sidecar v5 private-budget clock and reservation ledgers,
  twelve-per-rolling-hour admission, monotonic policy time, discrepancy
  blocking, exact W0 invocation binding, conservative recovery, and
  proof-bound release.
- W8 measures existing state only. It adds no product/source/schema or
  semantic-state mutation.

## Verification

The exact W7 focused command passed:

```text
8 files, 36 tests passed
```

`npm run build:agent` passed with exit code 0 after the final implementation
and test-contract repairs.

The complete agent-service corpus passed in a fresh temporary test directory
with cross-file parallelism disabled. This bounded mode is required by the
existing fixture harness because arbitrary temporary nuclear files map to one
shared temporary continuity sidecar; parallel file workers otherwise race that
test-only migration state.

```text
command=npm run test --prefix apps/agent-service -- --no-file-parallelism --reporter=dot
Test Files 369 passed (369)
Tests 2255 passed | 2 skipped (2257)
Duration 916.09s
```

The initial parallel diagnostic run exposed that harness race and did not
mutate product or production state. It was not used as the acceptance result.
The serial corpus above is the final complete-corpus result.

The final focused correction also passed:

```text
src/core/qualification/wave4-attention-route-precedence.test.ts
1 file, 2 tests passed
```

The test fixture now returns the current W1 accepted-dispatch identity required
by the production settlement shape. The route-precedence assertions remain
unchanged.

## W2 and W3 negative evidence

W2 credential preflight established only the boolean fact
`credentialPresent=true`. The one bounded isolated NIM attempt ended with:

```text
[nim] no-status The operation was aborted due to timeout
verdict=OUTCOME_UNKNOWN
LIVE_ATTEMPTS=1
LIVE_REPLAY=PROHIBITED
```

W3 Stage A recorded `no_relevant_labels`,
`query_relevance_set_empty`, and threshold failures. The result was not
repaired by changing the frozen labels. W3 Stage H independently passed all
nine host/runtime checks. Neither result establishes production acceptance or
capability promotion.

## W8 owner-decision measurement packet

The final passive Windows-local snapshot is:

```text
snapshotId=sha256:0a06260626cea41cdb7d3af0d72f510a44d583404086ff1267838dee2093f797
output=work/phase5-w8-readonly-20260831/0a06260626cea41cdb7d3af0d72f510a44d583404086ff1267838dee2093f797.json
measurementState=complete
hostClass=passive_local
productionObserved=false
auxiliaryDbCount=35
outputSha256=DE90EA0C1F70AC5E96190844585DB5DFB86BB5AAB7F4CB3DB1A81AD0DFE286A6
```

Earlier invalid W8 measurement outputs remain preserved for audit history; they
were not deleted or overwritten. The snapshot above is the final valid capture.

Existing stores were opened through read-only SQLite URIs with
`PRAGMA query_only=ON` and an authorizer/refusal guard. Existing-store
`query_only` proof passed. The authorizer denied zero mutation actions. All
before/after file hashes, sizes, mtimes, and database data versions remained
unchanged. The missing cognitive sidecar was not created; its seventeen
sidecar query definitions are recorded as
`NOT_APPLICABLE_TABLE_MISSING`.

The measurement output contains schema and aggregate evidence only. It
excludes raw messages, statements, payloads, claims, credentials, and
provider secrets. It does not claim one cross-store ACID snapshot. Read
frequency and other properties not represented by authoritative source
ledgers remain `UNKNOWN`.

## Preservation and prohibited actions

All implementation, test, and evidence changes remain uncommitted in the
detached authorized worktree. The normal checkout was not modified. Existing
untracked user files were preserved. No commit, push, merge, deployment,
production activation, promotion, production database write, Discord action,
retention/archive/deletion operation, or W9 action was performed.

The required final evidence and report are now durable. The authorized next
action is shutdown after this completed run; no further wave is authorized.
