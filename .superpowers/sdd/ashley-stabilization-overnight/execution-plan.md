# Project Ashley Stabilization Overnight Execution Plan

## Global Constraints

- Work only in `C:/Users/Xharv/Projects/composer-assistant-stabilization-overnight-20260906`.
- Current committed source and `docs/architecture/cognitive/ASHLEY_SPARSE_THOUGHT_CONTRACT_VNEXT_DESIGN.md` are current authority. Older freeze/acceptance documents are historical evidence only.
- Preserve `THOUGHT_IS_SOLE_SEMANTIC_AUTHOR`, `ONE_ASHLEY`, `OPERATIONAL_TRUTH`, `INTENTIONAL_SILENCE`, `NO_HOST_TURN_CLASSIFIER`, `CANONICAL_VS_WIRE_DISTINCTION`, and `HOST_MINTED_DURABLE_IDS`.
- Do not add architecture, a second semantic agent, provider routing/fallback design, event sourcing, CQRS, a generic event bus, voice, browser autonomy, broad runtime refactors, or unrelated cleanup.
- Use test-first or regression-first implementation. No provider calls or production mutation occur before their designated task and gate.
- Local commits, normal push of the dedicated branch, live NVIDIA calls, production deployment, bounded sidecar transition, service restart, and bounded rollback are authorized only when the packet's exact gates are satisfied. Never force-push or mutate main/master.

## Task 1 — S1 Sparse VNext Core Implementation

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

## Task 2 — S2 Core D0 Local Qualification

Execute all 20 frozen Core D0 witnesses through canonical schema, wire specialization, fixture, parser, validator, authority, materialization, and persistence. Repair only the first demonstrated local cause. No provider calls. Produce `wave-results/core-d0.md` and `checkpoints/wave-2.patch`.

## Task 3 — S3 Minimal Provider Failure Capture

After D0 passes, source-prosecute the current NIM/adapter/kernel-envelope boundary and add the smallest bounded failure-oriented capture. Record provider/model/correlation, truthful schema/wire identities, effective controls, timing, provider completion metadata, payload lengths/hashes, parser/validator/failure/retry status, and no full hidden reasoning by default. Add targeted healthy/failure/absence tests. Do not call NVIDIA in this task.

## Task 4 — S4 Controlled NVIDIA Current-vs-Sparse Diagnostic

Only after Task 3 is locally verified, run the frozen 15-scenario diagnostic with exact accepted provider/model/temperature/reasoning/max-token/deadline/retry controls. Record bounded per-call evidence and only the allowed conclusions. No parameter fishing or causality claims from small samples.

## Task 5 — S5 Blocking P1 Stabilization Repairs

Implement and qualify the independent approved repairs: SW-1 evidence reliance carry-through; SW-3 future-trigger Thought-seen-state binding; SW-2 pending speech-outbox crash/restart recovery; SW-4 narrow broad prose/fidelity guards. Keep each repair bounded, test-first, and separately evidenced. Do not add a framework.

## Task 6 — S6 Release/Version Mechanics

Implement/test local release fencing and exact identity mechanics: `SETTLEMENT_SCHEMA_VERSION = 2`, `IMPLEMENTATION_SPEC_VERSION = "0.2.1.r6"`, `ashley.thought.semantic.v2`, and `ashley.thought.semantic.v2.schema` at their actual owners. Prepare bounded r5→r6 and r6→r5 sidecar transitions with exact-match, `BEGIN IMMEDIATE`, single-column conditional update, `changes() == 1`, read-back, fail-closed behavior. No production mutation until Task 8.

## Task 7 — S7 Exact Immutable Candidate Qualification

Commit only the exact stabilization work, verify the candidate SHA/tree/parent and branch, run the impact-based integrated witness set including forward transition and rollback rehearsal, and push the dedicated branch only after local qualification. Never call an uncommitted tree an exact candidate.

## Task 8 — S8/S9 Production Deployment and Acceptance

Only after the exact candidate gates pass, deploy the exact candidate to `/home/xarvak/project-ashley`, perform the bounded sidecar transition and required service operations, verify deployed SHA/tree, readiness, continuity, provider/model/contract/schema identities, operational namespace, and delivery state, then perform bounded production acceptance. Roll back only under the frozen mechanical contract if warranted.

## Task 9 — S10/S11/S12 Stability and Closure Boundary

Do not claim the multi-day stability window is complete. Record `FREEZE ENGINEERING / USE ASHLEY` as the post-acceptance rule and leave companion evaluation/next-programme adjudication for the owner after that window.

## Task 10 — Final Report and Shutdown

Persist the required final report and flushed ledger with exact evidence, status, blocker/acceptance classification, and next owner action. Schedule the local Windows development-computer shutdown only after the final report has been produced and all writes, Git, provider, production, and evidence operations have completed.
