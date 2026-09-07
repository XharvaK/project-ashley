# Wave 7 — exact immutable candidate qualification

## Gate

`S7_LOCAL_EXACT_CANDIDATE_QUALIFICATION=PASS`

This is the exact source candidate qualified locally before push. It is not a
production acceptance claim and it does not claim completion of the stability
window.

## Candidate identity

| Field | Value |
|---|---|
| Candidate SHA | `bbd3657eb0f590f30ddb582b3d73b51fa2f5f20e` |
| Candidate tree | `c1adc90c107941b87784fa5c9aa747bab67c325b` |
| Candidate parent | `5ad74718be5827cfb9471eb7aa05540f548c4f7c` |
| Branch | `codex/stabilization-sparse-vnext-overnight-20260906` |
| Worktree before qualification | clean |
| Authority baseline | current committed source plus the current Sparse VNext design |

The candidate is the committed source tree at the recorded SHA. Later
evidence-only ledger changes do not change this candidate identity.

## Impact-based integrated witnesses

- Vitest: 27 files, 245 tests passed.
- Sidecar transition harness: 5 tests passed.
- The transition harness covered exact r5→r6 forward transition, exact r6→r5
  rollback rehearsal, singleton identity rejection, zero-row conditional
  update rejection, and read-back mismatch rollback.
- `npm run build --prefix apps/agent-service`: passed.
- `git diff --check`: passed for the qualified tree.

The integrated witness set covered Authority, concerns and lineage, settlement
validation/publication, sidecar schema and reopen recovery, speech fidelity and
outbox, Sparse VNext Thought parsing/materialization/publication, operational
namespace, delivery projection/reconciliation, cycle reconciliation, Q2 repair,
diagnostics, Model Fabric M1/M2, and the current NIM adapter.

## Scope and non-claims

- No live provider call was made during Wave 7. The bounded Wave 4 diagnostic
  remains the only recorded NVIDIA call set.
- No production checkout, service, database, sidecar metadata, deployment, or
  promotion was changed during Wave 7.
- No shutdown action was taken or authorized.
- The previously recorded full cognitive sweep remains 641/660 passed with 19
  known failures in four unrelated qualification/scale files. Those failures
  are current-route, fixture, or TPM-baseline conditions and are not silently
  reclassified as Wave 7 failures.

## Outcome

`RELEASE_QUALIFIED=LOCAL_EXACT_CANDIDATE`

Push is the next bounded action. Production deployment and acceptance remain
separate Wave 8 gates.
