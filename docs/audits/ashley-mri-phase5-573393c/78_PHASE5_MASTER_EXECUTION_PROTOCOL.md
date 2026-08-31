# 78 — Phase 5 Master Execution Protocol

## Purpose

This protocol controls later Luna execution. It does not authorize implementation now. It does not authorize commit, push, deployment, activation, promotion, provider calls, Discord effects, Mint actions, or production mutation.

## Status ladder

```text
NOT_STARTED
IMPLEMENTING
SOURCE_COMPLETE_UNVERIFIED
OFFLINE_VERIFIED
CANDIDATE_REVIEW_REQUIRED
CANDIDATE_ACCEPTED
DEPLOYMENT_AUTHORIZATION_REQUIRED
DEPLOYED_UNPROVEN
PRODUCTION_ACCEPTED
BLOCKED
```

Legal progression:

```text
NOT_STARTED
-> IMPLEMENTING
-> SOURCE_COMPLETE_UNVERIFIED
-> OFFLINE_VERIFIED
-> CANDIDATE_REVIEW_REQUIRED
-> CANDIDATE_ACCEPTED
-> DEPLOYMENT_AUTHORIZATION_REQUIRED
-> DEPLOYED_UNPROVEN
-> PRODUCTION_ACCEPTED
```

Any state may transition to `BLOCKED` with evidence. `BLOCKED` is not failure concealment. It prevents unlicensed continuation.

`CANDIDATE_ACCEPTED`, deployment, and `PRODUCTION_ACCEPTED` require the governing owner/acceptance authority. A worker cannot self-promote by changing a status field.

## Per-wave execution pipeline

```text
PRECHECK
-> IMPLEMENT
-> UNIT TEST
-> INTEGRATION TEST
-> FAILURE INJECTION
-> BUILD / OFFLINE QUALIFICATION
-> EVIDENCE PACKET
-> CHECKPOINT
-> CONTINUE OR STOP
```

### PRECHECK

Luna must:

1. read `77`, `78`, `89`, and the current wave plan;
2. read the cited Phase 4 architecture artifact;
3. inspect exact `git rev-parse HEAD`, `git status --short`, diff, and recent relevant history;
4. verify predecessor source/evidence gates separately;
5. verify expected source symbols still exist;
6. resolve all source paths live;
7. stop on architecture/source contradiction;
8. inspect existing wave evidence and use current workspace state as the resume authority; do not create a special progress ledger.

### IMPLEMENT

- Write the first focused behavioral test.
- Prove it fails for the intended reason.
- Implement the smallest coherent source change.
- Preserve unrelated work.
- Do not include later waves or opportunistic cleanup.
- Do not add compatibility that weakens the frozen contract.

### UNIT TEST

Run only the focused deterministic tests named by the current wave. A vacuous/static assertion is not behavioral proof.

### INTEGRATION TEST

Run the named cross-module tests. Use fixtures/mocks for provider or external effects unless the wave and owner explicitly authorize a real attempt.

### FAILURE INJECTION

Exercise each materially distinct crash/failure boundary named by the wave. Verify durable state, retry/reconciliation disposition, and no duplicate authority/effect.

### BUILD / OFFLINE QUALIFICATION

Run the affected build/typecheck and focused offline commands named by the wave. Run the full corpus only at candidate freeze under Wave Acceptance.

### EVIDENCE PACKET

Record:

```text
WAVE_ID=
BASE_SHA=
CANDIDATE_SHA_OR_WORKTREE_FINGERPRINT=
FILES_CHANGED=
TESTS_ADDED_OR_CHANGED=
FOCUSED_RED_EVIDENCE=
FOCUSED_GREEN_EVIDENCE=
INTEGRATION_EVIDENCE=
FAILURE_INJECTION_EVIDENCE=
BUILD_TYPECHECK_EVIDENCE=
UNRUN_GATES=
SOURCE_STATUS=
QUALIFICATION_STATUS=
PHYSICAL_STATUS=
PRODUCTION_STATUS=
KNOWN_LIMITATIONS=
```

### CHECKPOINT

Preserve the normal Git diff, test output, and wave evidence packet at each independently reviewable boundary. Do not create or update a duplicate progress ledger. Do not claim a step complete without fresh evidence.

### CONTINUE OR STOP

Continue only if every required gate passed and the next step is authorized. Stop when a gate fails unless the wave plan explicitly defines a bounded repair loop for that failure class.

## Repair loops

Permitted repair loop:

```text
focused test fails
-> diagnose exact source cause
-> update the smallest in-wave source/test delta
-> rerun the failed focused gate
-> rerun any invalidated earlier gates
```

Not permitted:

- changing Phase 4 architecture;
- weakening a behavioral assertion to pass;
- retrying an outcome-unknown external attempt;
- choosing another provider/model without the W2 owner gate;
- resetting or discarding unrelated work;
- skipping failed predecessor evidence;
- expanding into a later wave.

## Gate ownership

| Gate | Worker may produce | Worker may declare |
|---|---|---|
| Source settled | Source/tests and evidence | `SOURCE_COMPLETE_UNVERIFIED` or `OFFLINE_VERIFIED` |
| Candidate review | Review packet | `CANDIDATE_REVIEW_REQUIRED` |
| Candidate acceptance | Evidence only | Owner/acceptance authority declares |
| Deployment | Deployment packet | Requires fresh authorization |
| Production witness | Exact observations | `DEPLOYED_UNPROVEN` or witness result |
| Production acceptance | Evidence submission | Owner/acceptance authority declares |

## Predecessor handling

Source/architecture and evidence/acceptance predecessors are checked separately.

- A missing source predecessor blocks dependent source integration.
- A missing evidence predecessor may allow source work but blocks acceptance.
- Release Truth is required for production attribution. It is not a false source blocker for independent R4/R5 mechanics.
- W9 remains blocked regardless of source opportunity.

## Migration execution protocol

For any migration-bearing wave:

1. characterize old and new schema support;
2. write migration regressions before migration code;
3. prove clean creation, supported-old upgrade, partial/crash recovery, and newer-content rejection;
4. run only on disposable test databases;
5. prohibit production database access;
6. record migration identity and fixture state;
7. stop if data preservation cannot be proven.

## External-effect protocol

Real provider, Discord, Mint, deployment, or production actions are `NOT_RUN` unless separately authorized. An ambiguous authorized attempt becomes `OUTCOME_UNKNOWN`. It is not retried without explicit safe-attempt authority and reconciliation.

## Resume protocol

On resume:

1. inspect current Git state, diff, HEAD, and worktree identity;
2. read the current wave contract and its Phase 4 source;
3. inspect existing test output and wave evidence;
4. identify the first incomplete checklist item from actual source and evidence;
5. confirm completed gates still match the current source/diff identity;
6. continue from that item;
7. do not rerun completed waves unless later changes invalidated their evidence or the acceptance protocol requires a regression gate.

Do not create a Phase 5 progress ledger or a separate resume-state document.

## Completion rule

A wave is mechanically complete only when:

- all named checklist steps are complete;
- every required focused gate has fresh passing evidence;
- failures/unknowns are explicit;
- migration and legacy-inertness evidence exists where applicable;
- the evidence packet is complete;
- the state document identifies the next authorized action.
