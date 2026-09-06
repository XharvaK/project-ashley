# Task 1 — S1 Sparse VNext Core Report

## Candidate

- Worktree: `C:\Users\Xharv\Projects\composer-assistant-stabilization-overnight-20260906`
- Branch: `codex/stabilization-sparse-vnext-overnight-20260906`
- Base: `7bae7eaafedc2e7e859218d340920ea3958b1515`
- Implementation commit: `c055642b5f9e3c72bb45c55304b6a390cd7235e4`
- Design authority: `docs/architecture/cognitive/ASHLEY_SPARSE_THOUGHT_CONTRACT_VNEXT_DESIGN.md`
- No external provider calls were made.

## Implemented behavior

- Settlement fresh authoring requires only `kind` and `speech`.
- Optional interpretation, commitment, delta, nomination, and evidence domains preserve omission as absence. Present arrays require at least one item. Present composite objects require a meaningful child. Malformed and unknown fields fail closed.
- Draft speech requires non-empty `surfaceDraft`. Silent speech accepts exactly `{ "mode": "none" }`. Draft speech may omit commitments and literal/presentation constraints. New authoring no longer emits or accepts `acceptableRealizations`.
- Fresh abstention accepts only `insufficient_evidence`, `unresolved_ambiguity`, and `no_responsible_proposal`. `no_semantic_change_warranted` is rejected.
- Existing references use opaque allowlisted non-empty strings. Same-settlement local references are restricted to real Working Context and Concern creation paths, with alias collision, duplicate, dangling, and local target-type checks. Dead trigger, subscription, and nomination creation aliases were removed. The seven corrected reference surfaces use the unified shapes.
- Canonical semantic schema and per-cycle wire schema are separated. Wire-only experimental bounds and the operational namespace are applied to a deep clone. Source-owned Thought contract/schema IDs are `ashley.thought.semantic.v2` and `ashley.thought.semantic.v2.schema`.
- Materialization and publication preserve absent domains and intentional silence with internal deltas. No Host-authored semantic defaults are added. Retrieval/source evidence carry-through remains outside this task.
- Validator, authority, publication, expression, structural feedback, causal acceptance, and fidelity composition handle sparse shapes. Operational receipt truth and high-risk vision/reading/currentness/success detectors remain active.

## Files changed

Core source:

- `apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/parse.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/run.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/structural-feedback.ts`
- `apps/agent-service/src/core/cognitive-v021/settlement/validate.ts`
- `apps/agent-service/src/core/cognitive-v021/settlement/publish.ts`
- `apps/agent-service/src/core/cognitive-v021/authority/check.ts`
- `apps/agent-service/src/core/cognitive-v021/speech/expression-adapter.ts`
- `apps/agent-service/src/core/cognitive-v021/speech/fidelity.ts`
- `apps/agent-service/src/core/cognitive-v021/types.ts`
- `apps/agent-service/src/core/model-fabric/dispatch-contract.ts`

Focused/supporting tests and fixtures:

- `apps/agent-service/src/core/cognitive-v021/thought/sparse-vnext.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/semantic-output-contract.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/run.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/operational-namespace.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/mustsay-contract.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/nomination-memorykind.test.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/retry-admission.test.ts`
- `apps/agent-service/src/core/cognitive-v021/settlement/validate.test.ts`
- `apps/agent-service/src/core/cognitive-v021/authority/check.test.ts`
- `apps/agent-service/src/core/cognitive-v021/speech/fidelity.test.ts`
- `apps/agent-service/src/core/cognitive-v021/acceptance/causal-harness.test.ts`
- `apps/agent-service/src/core/cognitive-v021/acceptance/causal-harness.ts`
- `apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts`
- `apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts`
- `apps/agent-service/src/core/cognitive-v021/test-support.ts`
- `apps/agent-service/src/core/model-fabric/mf-m2.test.ts`

## Verification

Focused sparse/core command:

```text
npm test --prefix apps/agent-service -- --run \
  src/core/cognitive-v021/thought/semantic-output-contract.test.ts \
  src/core/cognitive-v021/thought/sparse-vnext.test.ts \
  src/core/cognitive-v021/settlement/validate.test.ts \
  src/core/cognitive-v021/speech/fidelity.test.ts \
  src/core/cognitive-v021/speech/expression-adapter.test.ts \
  src/core/cognitive-v021/thought/run.test.ts \
  src/core/cognitive-v021/thought/structural-feedback.test.ts \
  src/core/cognitive-v021/authority/check.test.ts \
  src/core/cognitive-v021/settlement/publish.test.ts \
  src/core/cognitive-v021/thought/operational-namespace.test.ts \
  src/core/cognitive-v021/thought/nomination-memorykind.test.ts \
  src/core/cognitive-v021/thought/retry-admission.test.ts \
  src/core/cognitive-v021/thought/mustsay-contract.test.ts \
  src/core/cognitive-v021/acceptance/causal-harness.test.ts --reporter=dot
```

Result: 14 files passed, 129 tests passed.

Additional Model Fabric/adapters command:

```text
npm test --prefix apps/agent-service -- --run src/core/model-fabric src/core/model-routing/adapters --reporter=dot
```

Result: 20 files passed, 181 tests passed.

Parser regression after final alias guard: 1 file passed, 18 tests passed.

Build/typecheck:

```text
npm run build --prefix apps/agent-service
```

Result: passed (`tsc`).

The wider cognitive suite completed with 133/137 files passing and 605/624
tests passing. The 19 failures are outside the S1 implementation: four
scale/context-budget assertions exceed the current budget assumptions, and
the qualification/authority-revision cases stop before their cases because the
current route is NIM Nemotron while their fixture expects the older Mistral
candidate. One stale-release assertion also observes the current
`qualification_candidate_sha_invalid` boundary instead of its older expected
release-identity code. No S1 core test failed in that run.

## Known pre-existing failure

The locked baseline recorded the committed `apps/sandbox-broker` build defect:
missing/invalid workspace exports and entrypoint symbols including
`RESERVED_BROKER_METADATA_NAME`, `copySanitizedTree`,
`buildWorkspaceExclusionSet`, and the local sandbox-tree entrypoint. Dependent
agent-service collection failures from that setup are pre-existing. No Sandbox
file was changed. Sandbox remains outside S1.

## Scope exclusions

This commit does not implement provider failure capture, NVIDIA diagnostics,
independent P1 repairs (including retrieval/source evidence carry-through),
future-trigger snapshot binding, pending speech-outbox recovery, release
`r5`→`r6` mechanics, deployment, production acceptance, or Sandbox changes.
`SETTLEMENT_SCHEMA_VERSION` and `IMPLEMENTATION_SPEC_VERSION` remain at their
current source values; release transition is a later task.
