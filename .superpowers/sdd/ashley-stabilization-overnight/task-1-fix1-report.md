# Task 1 Fix 1 — Sparse materialization boundary report

## Candidate

- Worktree: `C:\Users\Xharv\Projects\composer-assistant-stabilization-overnight-20260906`
- Branch: `codex/stabilization-sparse-vnext-overnight-20260906`
- Reviewed parent: `c055642b5f9e3c72bb45c55304b6a390cd7235e4`
- Fix commit: `cf3613b1b36adccd97fb37c5355abf0f7ae65f08`
- Design authority: `docs/architecture/cognitive/ASHLEY_SPARSE_THOUGHT_CONTRACT_VNEXT_DESIGN.md`
- No external provider calls were made.

## Reviewed fixes implemented

1. Known materialization failures for `alias_duplicate`,
   `dangling_local_reference`, and `reference_target_type_mismatch` now use a
   typed internal boundary. `runThoughtModel` maps only those known failures
   to `ThoughtStepOutput` with `reason: "malformed"`, the exact diagnostic code,
   and the exact field path. `runCognitiveCycle` therefore uses its existing
   bounded structural retry and terminal malformed notice path. Unknown errors
   retain the existing unavailable behavior.
2. Existing references are checked against target domains represented by the
   current Thought input. Known Working Context, Concern, and Observation IDs
   are tracked. Concern-bearing fields reject known Working Context or
   Observation IDs, Working Context fields reject known non-Working-Context
   IDs, and `evidenceUse.observationRefsUsed` rejects known non-Observation IDs.
   References without a positively known target domain remain opaque
   allowlisted strings. No Host-authored semantic fallback was added.

## Exact changed files

- `apps/agent-service/src/core/cognitive-v021/thought/run.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/run.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/reference-allowlist.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/reference-allowlist.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/structural-feedback.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/structural-feedback.test.ts`
- `apps/agent-service/src/core/cognitive-v021/types.ts`

## Verification

Focused reviewed witnesses:

```text
npm test --prefix apps/agent-service -- --run src/core/cognitive-v021/thought/run.test.ts -t "routes" --reporter=verbose
Result: 3 passed.
```

Allowlist, materialization, and structural-boundary tests:

```text
npm test --prefix apps/agent-service -- --run src/core/cognitive-v021/thought/run.test.ts src/core/cognitive-v021/thought/reference-allowlist.test.ts src/core/cognitive-v021/thought/structural-feedback.test.ts --reporter=dot
Result: 3 files passed, 28 tests passed.
```

The existing Task 1 sparse/core focused set was rerun with the new witnesses:

```text
npm test --prefix apps/agent-service -- --run src/core/cognitive-v021/thought/semantic-output-contract.test.ts src/core/cognitive-v021/thought/sparse-vnext.test.ts src/core/cognitive-v021/settlement/validate.test.ts src/core/cognitive-v021/speech/fidelity.test.ts src/core/cognitive-v021/speech/expression-adapter.test.ts src/core/cognitive-v021/thought/run.test.ts src/core/cognitive-v021/thought/structural-feedback.test.ts src/core/cognitive-v021/authority/check.test.ts src/core/cognitive-v021/settlement/publish.test.ts src/core/cognitive-v021/thought/operational-namespace.test.ts src/core/cognitive-v021/thought/nomination-memorykind.test.ts src/core/cognitive-v021/thought/retry-admission.test.ts src/core/cognitive-v021/thought/mustsay-contract.test.ts src/core/cognitive-v021/acceptance/causal-harness.test.ts --reporter=dot
Result: 14 files passed, 133 tests passed.
```

Service build:

```text
npm run build --prefix apps/agent-service
Result: passed (`tsc`).
```

The wider cognitive suite completed with 132/137 files passing and 608/628
tests passing. The 20 failures remain outside this fix: existing scale/context
budget assumptions, the committed Sandbox Broker build-dependent ingress
setup, and qualification fixtures that stop at the current route/candidate
preflight or stale candidate-SHA boundary. No Sandbox or qualification source
was changed.

## Scope boundary

This fix does not implement provider failure capture, NVIDIA diagnostics,
other P1 repairs, provider routing, release/version transition, deployment,
production mutation, or Sandbox changes. Only the seven listed source/test
files were staged in `cf3613b1b36adccd97fb37c5355abf0f7ae65f08`.
