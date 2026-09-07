# Task 1 — S1 Sparse VNext Core Implementation

Read the current frozen design first. Implement the Sparse VNext semantic contract against committed source. This task ends at local source/test/build evidence and must not implement the independent P1 repairs, provider failure capture, NVIDIA diagnostic, release meta transition, deployment, or production acceptance.

Required behavior:

1. Settlement requires only `kind` and `speech` at the top level. Optional settlement domains are `interpretation`, `commitments`, `workingContextDeltas`, `concernDeltas`, `occupancyDeltas`, `futureTriggerDeltas`, `subscriptionDeltas`, `durableNominations`, and `evidenceUse`.
2. Absent optional fields remain absent/`undefined` and mean no structured semantic act in that domain. Do not normalize absence to `[]`, clear state, reset state, failure, unknown, or Host-authored defaults.
3. Present event arrays are non-empty. Present composite objects contain at least one meaningful child. Malformed present optional fields fail. Unknown fields fail.
4. `speech.mode` is required. Draft requires non-empty `surfaceDraft`; none permits only `mode: "none"`. Ordinary draft speech is valid without `commitments`. `acceptableRealizations` is removed from new authoring.
5. Fresh abstain reasons are exactly `insufficient_evidence`, `unresolved_ambiguity`, and `no_responsible_proposal`. `no_semantic_change_warranted` is rejected for fresh VNext authoring; historical direct readers remain tolerant.
6. Existing refs are opaque allowlisted non-empty strings. Creation-capable same-settlement refs use the existing/local union only where same-settlement co-reference is real. Apply all seven reference-shape corrections. Remove dead creation aliases for future triggers, subscriptions, and nominations.
7. Canonical semantic schema remains separate from wire specialization. Keep operational namespace specialization and experimental wire bounds in the wire clone, not semantic law. Contract/schema IDs and fingerprints must be updated at their actual current source owners; current source puts contract/schema IDs in `apps/agent-service/src/core/model-fabric/dispatch-contract.ts`.
8. Materialization and publication skip absent domains without inventing semantics. Preserve intentional silence plus internal deltas. Do not implement evidence reliance carry-through in this task; that is Task 5 / SW-1.
9. Update validator, authority checks, expression adapter, structural feedback, and relevant types so the source composes with the sparse contract. Preserve operational receipt truth and high-risk structured honesty checks.

Primary source surfaces:

- `apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/parse.ts`
- `apps/agent-service/src/core/cognitive-v021/thought/run.ts` (optional-domain materialization only)
- `apps/agent-service/src/core/cognitive-v021/thought/structural-feedback.ts`
- `apps/agent-service/src/core/cognitive-v021/settlement/validate.ts`
- `apps/agent-service/src/core/cognitive-v021/settlement/publish.ts`
- `apps/agent-service/src/core/cognitive-v021/authority/check.ts`
- `apps/agent-service/src/core/cognitive-v021/speech/expression-adapter.ts`
- `apps/agent-service/src/core/cognitive-v021/types.ts`
- `apps/agent-service/src/core/model-fabric/dispatch-contract.ts` for current contract/schema ID ownership

Write or update focused tests for the changed behavior, including the valid/invalid examples and absence/presence distinctions. Do not call external providers. Run focused tests for changed code and the appropriate local build/typecheck. The known committed Sandbox Broker package build defect is outside this task; do not edit Sandbox code to hide it.

Global constraints: current committed source and the current 2026-09-06 Sparse VNext design control this task; older freeze/acceptance documents are historical evidence only. Preserve `THOUGHT_IS_SOLE_SEMANTIC_AUTHOR`, `ONE_ASHLEY`, `OPERATIONAL_TRUTH`, `INTENTIONAL_SILENCE`, `NO_HOST_TURN_CLASSIFIER`, `CANONICAL_VS_WIRE_DISTINCTION`, and `HOST_MINTED_DURABLE_IDS`. Use test-first or regression-first implementation. No `git add -A` or `git add .`; commit only explicit task paths.
