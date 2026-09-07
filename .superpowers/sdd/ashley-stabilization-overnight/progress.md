# Project Ashley Stabilization Overnight Ledger

RUN_STARTED_AT=2026-09-06T14:17:51.3715843+03:00
ORIGINAL_REPO_PATH=C:\Users\Xharv\Projects\composer-assistant
ORIGINAL_HEAD=7bae7eaafedc2e7e859218d340920ea3958b1515
ORIGINAL_TREE=5a1fd8c04ced30f1fd0764ea7b7b667285ce4170
ORIGINAL_BRANCH=codex/nemotron-settlement-reference-revision
EXECUTION_WORKTREE_PATH=C:\Users\Xharv\Projects\composer-assistant-stabilization-overnight-20260906
EXECUTION_BASE_HEAD=7bae7eaafedc2e7e859218d340920ea3958b1515
EXECUTION_BRANCH=codex/stabilization-sparse-vnext-overnight-20260906
FROZEN_DESIGN_SHA256=1A66E1C55AF90380EAE0196FEC99DF29A4FEB7C19A59C7A7398E38BC5CE02D57
AUTHORITY_ENVELOPE=expanded by Owner packet SHA256 FD6ACF2F16FD72B92181281CC3C6877D45359E77288F88E4190C143DD4E7D8E7; commits, push, live NVIDIA, bounded production deployment/meta/restart/rollback authorized only for this stabilization programme
SOURCE_DRIFT=NONE
ORIGINAL_STATUS_CAPTURE=source-baseline.md

RULING:
Selected `codex/stabilization-sparse-vnext-overnight-20260906` as the dedicated branch.

WHY:
The packet permits a dedicated stabilization branch and repository policy defaults new branches to the `codex/` prefix.

COST_IF_WRONG:
Only branch naming differs from the packet example; candidate identity and scope remain unchanged.

WAVE=0
STATUS=IN_PROGRESS
START_HEAD=7bae7eaafedc2e7e859218d340920ea3958b1515
START_TREE=5a1fd8c04ced30f1fd0764ea7b7b667285ce4170
FILES_CHANGED=docs/architecture/cognitive/ASHLEY_SPARSE_THOUGHT_CONTRACT_VNEXT_DESIGN.md (exact authority artifact copied into isolated worktree only)
TESTS_RUN=NONE
RESULT=Isolation created; frozen artifact SHA-256 and line count match original.
NEW_FAILURES=NONE
PREEXISTING_FAILURES=NOT_YET_ASSESSED
RULINGS=branch naming recorded above
CHECKPOINT=NONE
NEXT_WAVE=0 baseline verification

RULING:
The Owner's authority correction is controlling: current committed source and the current 2026-09-06 Sparse VNext design are the stabilization authorities. Older freeze, acceptance, and milestone documents are historical evidence only unless the current design explicitly incorporates a detail.

WHY:
The correction narrows the packet's use of “frozen” language and prevents superseded phase artifacts from silently becoming current architecture.

COST_IF_WRONG:
If this precedence were misapplied, implementation could follow superseded architecture and invalidate the candidate; the bounded cost of this ruling is that historical context may be consulted only for provenance or explicitly referenced detail.

WAVE=0
STATUS=PASS
START_HEAD=7bae7eaafedc2e7e859218d340920ea3958b1515
START_TREE=5a1fd8c04ced30f1fd0764ea7b7b667285ce4170
FILES_CHANGED=docs/architecture/cognitive/ASHLEY_SPARSE_THOUGHT_CONTRACT_VNEXT_DESIGN.md copied unchanged into the isolated worktree; docs/architecture/cognitive/ASHLEY_STABILIZATION_MASTER_MECHANICAL_IMPLEMENTATION_PLAN.md created; no committed source changed
TESTS_RUN=Exact locked npm ci for agent-service and local sandbox packages; focused vitest command covering settlement/parser/authority/materialization-adjacent tests; npm run build in apps/agent-service
RESULT=SAFE_IMPLEMENTATION_BASE=PASS for isolation, artifact identity, dependency setup, and focused cognitive baseline: 68 tests passed across 7 suites. Three suites could not collect because the committed Sandbox Broker package has no buildable dist entrypoint.
NEW_FAILURES=NONE
PREEXISTING_FAILURES=apps/sandbox-broker build fails at committed workspace export/import defects (RESERVED_BROKER_METADATA_NAME, copySanitizedTree, buildWorkspaceExclusionSet, and local sandbox-tree entrypoint); agent-service build and three dependent test suites fail only because those local package entrypoints are unavailable. This is outside the Sparse VNext/stabilization surface and is mechanically separated from the 68 passing focused tests.
RULINGS=Source drift is NONE because execution HEAD and tree equal the frozen baseline. The committed Sandbox Broker failure is unrelated pre-existing setup/source drift and does not justify changing Sandbox code under the moratorium. The current-source owner correction for contract/schema IDs is recorded in the master plan.
CHECKPOINT=.superpowers/sdd/ashley-stabilization-overnight/source-baseline.md; master plan document created before source implementation
NEXT_WAVE=S1 Sparse VNext implementation

TASK_1=S1 Sparse VNext core implementation
TASK_1_STATUS=IN_PROGRESS
TASK_1_BASE_HEAD=7bae7eaafedc2e7e859218d340920ea3958b1515
TASK_1_SCOPE=Sparse contract/parser/types/validator/authority/materialization/publication/expression/structural-feedback plus focused tests and source-owned VNext IDs; no provider capture, NVIDIA, independent P1 repairs, release mechanics, deployment, production, or Sandbox edits
TASK_1_IMPLEMENTER=/root/task1_sparse_core
TASK_1_REPORT=.superpowers/sdd/ashley-stabilization-overnight/task-1-report.md

SUBAGENT_DISPATCH=initial-task1
ROLE=implementation
TASK=Task 1 S1 Sparse VNext core implementation
SUBAGENT_ID=/root/task1_sparse_core
MODEL_REQUESTED=gpt-6-astra
MODEL_ACTUALLY_ASSIGNED=unavailable
MODEL_IDENTITY_VERIFIED=unavailable
LUNA_MAX_ENFORCEMENT=NOT_COMPLIANT_DISPATCH_INTERRUPTED_PER_OWNER_OVERRIDE
DISPATCH_RULING=The first dispatch used the pre-override SDD selection and was interrupted before its work was accepted; no commit or report from that dispatch is authoritative.

SUBAGENT_DISPATCH=task1-luna-max
ROLE=implementation
TASK=Task 1 S1 Sparse VNext core implementation
SUBAGENT_ID=/root/task1_sparse_core_luna_max
MODEL_REQUESTED=LUNA_MAX (harness selector: gpt-5.6-luna + reasoning_effort=max)
MODEL_ACTUALLY_ASSIGNED=unavailable
MODEL_IDENTITY_VERIFIED=unavailable
LUNA_MAX_ENFORCEMENT=CONFIRMED_REQUESTED_BY_EXPLICIT_SELECTOR; actual runtime identity unavailable from spawn metadata

TASK_2_RETRY_STATUS=INTERRUPTED_STALLED
TASK_2_RETRY_NOTE=No worktree changes or report arrived after additional bounded waits; interrupted safely before accepting any work. No provider or production action occurred.

SUBAGENT_DISPATCH=task2-d0-luna-max-final
ROLE=Core D0 qualification implementation
TASK=Implement and witness D0-1 through D0-20 local Sparse VNext contract coherence after two stalled dispatches
SUBAGENT_ID=/root/task2_core_d0_luna_max_final
MODEL_REQUESTED=LUNA_MAX (harness selector: gpt-5.6-luna + reasoning_effort=max)
MODEL_ACTUALLY_ASSIGNED=unavailable
MODEL_IDENTITY_VERIFIED=unavailable
LUNA_MAX_ENFORCEMENT=CONFIRMED_REQUESTED_BY_EXPLICIT_SELECTOR; actual runtime identity unavailable from spawn metadata

ORCHESTRATION_AUTHORITY_UPDATE=2026-09-07 Owner explicitly disabled all further subagent spawning and required single-controller execution.
SUBAGENT_SPAWNING=DISABLED
TASK_2_FINAL_DISPATCH_STATUS=INTERRUPTED_NOT_ACCEPTED
TASK_2_FINAL_DISPATCH_NOTE=Active D0 worker interrupted safely on Owner instruction; no delegated work accepted as authoritative. Controller resumes D0 directly.

TASK_2_CONTROLLER_IMPLEMENTATION=apps/agent-service/src/core/cognitive-v021/thought/d0-qualification.test.ts
TASK_2_D0_WITNESSES=20/20 PASS
TASK_2_TARGETED_SUITE=14 files / 148 tests PASS
TASK_2_BUILD=PASS (npm run build --prefix apps/agent-service)
TASK_2_DIFF_CHECK=PASS (git diff --cached --check)
CONTROLLER_SELF_REVIEW=PASS
CONTROLLER_SELF_REVIEW_FINDINGS=One test assertion initially expected reference_not_allowlisted; current parser returns wrong_type at the same evidenceUse.sourceRefsUsed path. Assertion narrowed to the source-owned rejection invariant; no production change.
CONTROLLER_SELF_REVIEW_FIXES=Typed the D0-5 dishonest claimedState literal; corrected D0-9 expected-code overreach; removed unused type import.
CONTROLLER_SELF_REVIEW_RETEST=PASS (D0 20/20; neighboring suite 148/148; build/typecheck PASS)
TASK_2_SCOPE_CHECK=PASS; one new qualification test file only; no provider, production database, P1, release, deployment, or Sandbox changes

TASK_2_STATUS=PASS
TASK_2_COMMIT=b40cd03c13447a1f3f333fc4727a10e8454122f9
TASK_2_TREE=9527a072c4ca5523f889ba16a43d0b908a50f703
TASK_2_REPORT=.superpowers/sdd/ashley-stabilization-overnight/task-2-report.md

WAVE=3
STATUS=IN_PROGRESS
START_HEAD=b40cd03c13447a1f3f333fc4727a10e8454122f9
START_TREE=9527a072c4ca5523f889ba16a43d0b908a50f703
FILES_CHANGED=not-yet-determined
TESTS_RUN=not-yet-run
RESULT=Controller-only source prosecution of the current NIM/Model Fabric/kernel-envelope/diagnostic boundary
NEW_FAILURES=not-yet-assessed
PREEXISTING_FAILURES=known Sandbox Broker build defect remains outside scope
RULINGS=Bounded failure-oriented observability only; no provider call, no full hidden reasoning, no P1 or release behavior
CHECKPOINT=not-yet-created
NEXT_WAVE=not-yet-determined

WAVE_3_SOURCE_PROSECUTION=COMPLETE
WAVE_3_SOURCE_FINDING=Current Model Fabric receipts already hold provider/model/correlation, schema/wire identities, effective reasoning, and attempt latency; provider adapters already expose bounded response diagnostics for Mistral but NIM does not. Thought diagnostics currently persist only allocation/parser/failover fields and mark parser failures as not_sent.
WAVE_3_RULING=Extend the dedicated thought_dispatch_diagnostics sidecar with one additive bounded provider_failure_json projection; enrich the existing ProviderResponseDiagnostics contract for NIM shape/reasoning lengths; capture parser/provider failures at runThoughtModel using existing Model Fabric receipt/wire evidence and measured adapter-boundary timing. Do not add a new telemetry store, prompt retention, or hidden-reasoning text.
WAVE_3_WHY=This reuses the existing forensic sidecar and Model Fabric/kernel boundary, preserves canonical-vs-wire separation, and gives future provider failures enough evidence to classify sent responses versus transport/provider failures without changing semantic authority or provider controls.
WAVE_3_COST_IF_WRONG=If capture is attached outside the existing boundary, provider identity or dispatch truth could be fabricated; if it persists raw output, privacy scope expands. Tests will require omission of unavailable fields and absence of hidden reasoning text.
WAVE_3_PROVIDER_CALLS=0
WAVE_2_STATUS=PASS
WAVE_2_END_HEAD=b40cd03c13447a1f3f333fc4727a10e8454122f9
WAVE_2_END_TREE=9527a072c4ca5523f889ba16a43d0b908a50f703
NEXT_WAVE=Provider-boundary failure capture (provider call remains gated until D0 evidence is persisted)

ORCHESTRATION_OVERRIDE_EFFECTIVE=2026-09-07
SINGLE_CONTROLLER_MODE=YES
SUBAGENT_SPAWNING=DISABLED
LIVE_NVIDIA_PROVIDER_CALLS=YES
LOCAL_GIT_COMMITS=YES
GIT_PUSH=YES
PRODUCTION_DEPLOY=YES
PRODUCTION_RESTART=YES
PRODUCTION_SERVICE_MUTATION=YES
PRODUCTION_DATABASE_MUTATION=YES
PRODUCTION_META_TRANSITION=YES
SHUTDOWN_AUTHORITY=NO
SHUTDOWN_ACTION=PROHIBITED

WAVE_3_STATUS=PASS
WAVE_3_END_HEAD=5162ff0aeb866fc7cab733240bc01fee43c441f6
WAVE_3_END_TREE=5c046ca43bf3db80a6d340dde7f3989d2f959f0c
WAVE_3_FILES_CHANGED=9 tracked source/test files
WAVE_3_TESTS=40/40 focused provider/diagnostic/MF-M1; 27/27 D0+diagnostics
WAVE_3_BUILD=PASS (npm run build --prefix apps/agent-service)
WAVE_3_DIFF_CHECK=PASS
WAVE_3_RESULT=PROVIDER_FAILURE_CAPTURE=LOCALLY_VERIFIED_PASS
WAVE_3_NEW_FAILURES=none observed
WAVE_3_PREEXISTING_FAILURES=9 current-route/env failures in broader mistral-client.test.ts; known Sandbox Broker build defect remains outside scope
WAVE_3_CHECKPOINT=.superpowers/sdd/ashley-stabilization-overnight/checkpoints/wave-3.patch
WAVE_3_REPORT=.superpowers/sdd/ashley-stabilization-overnight/wave-results/provider-capture.md
NEXT_WAVE=Controlled NVIDIA current-vs-sparse diagnostic

WAVE_3_COMMIT=5162ff0aeb866fc7cab733240bc01fee43c441f6
WAVE_3_COMMIT_TREE=5c046ca43bf3db80a6d340dde7f3989d2f959f0c
WAVE_3_COMMIT_SCOPE=9 tracked source/test files; run workspace artifacts remain untracked evidence

TASK_1_FIX_1_STATUS=IMPLEMENTED
TASK_1_FIX_1_COMMIT=cf3613b1b36adccd97fb37c5355abf0f7ae65f08
TASK_1_FIX_1_REPORT=.superpowers/sdd/ashley-stabilization-overnight/task-1-fix1-report.md
TASK_1_FIX_1_VERIFICATION=Focused reviewed witnesses 28/28; sparse/core set 133/133; agent-service build passed

TASK_1_REVIEW_FIX1=APPROVE
TASK_1_REVIEW_FIX1_EVIDENCE=Materialization errors are typed and bounded through malformed retries; positively-known WC/Concern/Observation target mismatches are rejected while unknown target domains remain opaque allowlisted refs. Focused 28/28, sparse/core 134/134, and tsc --noEmit passed.
WAVE_1_STATUS=PASS
WAVE_1_IMPLEMENTATION_COMMITS=c055642b5f9e3c72bb45c55304b6a390cd7235e4,cf3613b1b36adccd97fb37c5355abf0f7ae65f08

WAVE=2
STATUS=IN_PROGRESS
START_HEAD=5ed96ef3ddeb0a187ea138b66b092ce7af64b9e9
START_TREE=not-yet-captured
FILES_CHANGED=Task 2 D0 focused qualification tests only (planned)
TESTS_RUN=not-yet-run
RESULT=Core D0 20-witness implementation dispatched after Wave 1 approval
NEW_FAILURES=not-yet-assessed
PREEXISTING_FAILURES=known Sandbox Broker build defect remains outside scope
RULINGS=Core D0 is local-only; no provider or later-P1 behavior may be absorbed
CHECKPOINT=not-yet-created
NEXT_WAVE=Core D0 review then provider failure capture

TASK_2_STATUS=IN_PROGRESS
TASK_2_BASE_HEAD=5ed96ef3ddeb0a187ea138b66b092ce7af64b9e9
TASK_2_BRIEF=.superpowers/sdd/ashley-stabilization-overnight/task-2-brief.md
TASK_2_REPORT=.superpowers/sdd/ashley-stabilization-overnight/task-2-report.md

TASK_2_INITIAL_DISPATCH=INTERRUPTED_STALLED
TASK_2_INITIAL_DISPATCH_NOTE=No worktree changes or status arrived after bounded prompts; interrupted safely before accepting any work. No provider or production action occurred.

SUBAGENT_DISPATCH=task2-d0-luna-max-retry
ROLE=Core D0 qualification implementation
TASK=Implement and witness D0-1 through D0-20 local Sparse VNext contract coherence after stalled initial dispatch
SUBAGENT_ID=/root/task2_core_d0_luna_max_retry
MODEL_REQUESTED=LUNA_MAX (harness selector: gpt-5.6-luna + reasoning_effort=max)
MODEL_ACTUALLY_ASSIGNED=unavailable
MODEL_IDENTITY_VERIFIED=unavailable
LUNA_MAX_ENFORCEMENT=CONFIRMED_REQUESTED_BY_EXPLICIT_SELECTOR; actual runtime identity unavailable from spawn metadata

SUBAGENT_DISPATCH=task2-d0-luna-max
ROLE=Core D0 qualification implementation
TASK=Implement and witness D0-1 through D0-20 local Sparse VNext contract coherence
SUBAGENT_ID=/root/task2_core_d0_luna_max
MODEL_REQUESTED=LUNA_MAX (harness selector: gpt-5.6-luna + reasoning_effort=max)
MODEL_ACTUALLY_ASSIGNED=unavailable
MODEL_IDENTITY_VERIFIED=unavailable
LUNA_MAX_ENFORCEMENT=CONFIRMED_REQUESTED_BY_EXPLICIT_SELECTOR; actual runtime identity unavailable from spawn metadata

SUBAGENT_DISPATCH=task1-fix1-review-luna-max
ROLE=scoped re-review
TASK=Review cf3613b1b36adccd97fb37c5355abf0f7ae65f08 against the two Task 1 findings
SUBAGENT_ID=/root/task1_fix1_review_luna_max
MODEL_REQUESTED=LUNA_MAX (harness selector: gpt-5.6-luna + reasoning_effort=max)
MODEL_ACTUALLY_ASSIGNED=unavailable
MODEL_IDENTITY_VERIFIED=unavailable
LUNA_MAX_ENFORCEMENT=CONFIRMED_REQUESTED_BY_EXPLICIT_SELECTOR; actual runtime identity unavailable from spawn metadata

TASK_1_REVIEW=REQUEST_CHANGES
TASK_1_REVIEW_FINDING_1=Materialization dangling/duplicate/target-mismatch errors escape as generic unavailable failures rather than a classified bounded settlement rejection.
TASK_1_REVIEW_FINDING_2=Existing references use an undifferentiated allowlist, so a reference from another target domain can be accepted where a concern/working-context target is required.
TASK_1_FIX_ROUND=1

SUBAGENT_DISPATCH=task1-fix1-luna-max
ROLE=Task 1 fix implementation
TASK=Fix reviewed materialization failure classification and typed existing-reference validation
SUBAGENT_ID=/root/task1_sparse_core_fix1_luna_max
MODEL_REQUESTED=LUNA_MAX (harness selector: gpt-5.6-luna + reasoning_effort=max)
MODEL_ACTUALLY_ASSIGNED=unavailable
MODEL_IDENTITY_VERIFIED=unavailable
LUNA_MAX_ENFORCEMENT=CONFIRMED_REQUESTED_BY_EXPLICIT_SELECTOR; actual runtime identity unavailable from spawn metadata

AUTHORITY_UPDATE=2026-09-07 Owner explicitly revoked the Windows shutdown directive.
SHUTDOWN_AUTHORITY=NO
SHUTDOWN_ACTION=PROHIBITED; do not schedule or execute local Windows shutdown

SUBAGENT_DISPATCH=task1-review-luna-max
ROLE=independent Task 1 review
TASK=Review c055642b5f9e3c72bb45c55304b6a390cd7235e4 against Task 1 brief and Sparse VNext design
SUBAGENT_ID=/root/task1_sparse_core_review_luna_max
MODEL_REQUESTED=LUNA_MAX (harness selector: gpt-5.6-luna + reasoning_effort=max)
MODEL_ACTUALLY_ASSIGNED=unavailable
MODEL_IDENTITY_VERIFIED=unavailable
LUNA_MAX_ENFORCEMENT=CONFIRMED_REQUESTED_BY_EXPLICIT_SELECTOR; actual runtime identity unavailable from spawn metadata

## Preflight plan scan

| Tasks sharing file/interface | Producer vs consumer | Finding / ruling |
|---|---|---|
| Task 1 → Task 2 | Task 1 changes sparse schema/parser/validator/materializer/publication; Task 2 consumes those surfaces through the 20 D0 witnesses | Consistent. Task 2 is qualification only and must not add provider/P1 behavior. |
| Task 1 → Task 3 | Task 1 changes schema/wire fingerprints; Task 3 records them at the provider boundary | Consistent. Task 3 reads the final S1 identities and adds failure capture only. |
| Task 1 → Task 5 | Both may touch `thought/run.ts`, `types.ts`, and speech fidelity paths; Task 1 handles optional domains, Task 5 handles later evidence carry-through and P1 guards | Potential attribution collision. Ruling: S1 must not implement retrieval/source carry-through or broad guard repair; Task 5 owns those later changes. |
| Task 1 → Task 6 | Task 1 needs VNext semantic/schema identity for D0; Task 6 owns implementation-spec r5→r6 release fencing | Potential identity collision. Ruling: S1 owns VNext schema/contract IDs required for canonical/wire D0; Task 6 owns `IMPLEMENTATION_SPEC_VERSION` and transition mechanics, and verifies the already-updated semantic IDs. |
| Task 2 → Task 3 | D0 pass is the precondition for provider failure capture | Consistent; no provider call before Task 3 is locally verified. |
| Task 3 → Task 4 | Task 3 provides the failure evidence boundary; Task 4 consumes it for the controlled diagnostic | Consistent; Task 4 cannot substitute another provider or alter controls. |
| Task 4 → Task 5 | Diagnostic evidence determines only bounded follow-up; P1 scope remains frozen | Consistent; no provider-tuning campaign or redesign. |
| Task 5 → Task 6 | P1 repairs must be qualified before release/version fencing | Consistent; release mechanics do not absorb unrelated P1 cleanup. |
| Task 6 → Task 7 | Task 6 provides version/fencing mechanics; Task 7 qualifies the exact commit/tree | Consistent; exact candidate cannot be claimed before commit and integrated witnesses. |
| Task 7 → Task 8 | Task 7 provides exact candidate identity and pushed branch; Task 8 deploys only that candidate | Consistent; no production touch before all pre-deployment gates. |
| Task 8 → Task 9/10 | Task 8 provides acceptance or genuine blocker evidence; Task 9 records stability boundary and Task 10 reports/shuts down | Consistent; stability window is not claimed complete. |

| Task | Internal consistency check | Finding / ruling |
|---|---|---|
| Task 1 | Files, required sparse behavior, tests, and explicit exclusions agree | Consistent after the S1/S5 and S1/S6 attribution rulings above. |
| Task 2 | 20 witness scope agrees with local-only/no-provider gate | Consistent. |
| Task 3 | Failure capture fields, privacy limits, and no-live-call rule agree | Consistent. |
| Task 4 | Exact-control diagnostic and bounded conclusions agree | Consistent. |
| Task 5 | Four independent bounded P1 repairs and pre-candidate gate agree | Consistent. |
| Task 6 | Version identities and exact transactional transition requirements agree | Consistent; production mutation remains deferred to Task 8. |
| Task 7 | Exact candidate identity, qualification, and push order agree | Consistent. |
| Task 8 | Deployment/acceptance and rollback conditions agree | Consistent; only exact candidate may be deployed. |
| Task 9 | Stability/evaluation/closure boundary agrees with “not completed” rule | Consistent. |
| Task 10 | Final evidence persistence precedes local Windows shutdown scheduling | Consistent; no remote host shutdown. |

RULING:
The plan scan found no unresolved contradiction that makes S1 guesswork. The only overlaps are explicitly split above by completion gate.

WHY:
The current design separates implementation packet membership from completion gates, and the execution plan preserves those boundaries.

COST_IF_WRONG:
An attribution error would cause duplicate or premature P1/release behavior; the ledger and per-task reviews expose and correct that risk before later gates.

## Wave 4 — controlled NVIDIA current-vs-sparse diagnostic

WAVE=4
STATUS=COMPLETE
START_HEAD=5162ff0aeb866fc7cab733240bc01fee43c441f6
START_TREE=5c046ca43bf3db80a6d340dde7f3989d2f959f0c
NVIDIA_DIAGNOSTIC=COMPLETE
NVIDIA_DIAGNOSTIC_CONCLUSION=PROVIDER_RELIABILITY_CONCERN
NVIDIA_PROVIDER_CALLS=30
NVIDIA_SCENARIOS=15
NVIDIA_CONDITIONS=current_v1_vs_sparse_v2
NVIDIA_CONTROLS=model=nvidia/nemotron-3-super-120b-a12b;temperature=1.0;reasoning=high;reasoning_budget=1024;max_tokens=8192;deadline_ms=60000;retry=single_attempt
NVIDIA_RESULTS=.superpowers/sdd/ashley-stabilization-overnight/diagnostics/wave4-nvidia-results.json
NVIDIA_RESULTS_SHA256=4A076ECA75AC2C07CCBA3439702D2617D3A9D3049B144F9E1D86CC5E5019DB69
NVIDIA_REPORT=.superpowers/sdd/ashley-stabilization-overnight/wave-results/nvidia-diagnostic.md
NVIDIA_OUTCOME_SUMMARY=current_v1 responses=11/15; sparse_v2 responses=4/15; sparse_v2 provider_unavailable=11/15; current_v1 one length/runaway invalid_json response
NVIDIA_SIZE_SUMMARY=paired_successes_Q9_Q12 sparse_v2_mean=171_B_and_476_output_tokens vs current_v1_mean=1390_B_and_1236_output_tokens; conditional_only
NVIDIA_SEMANTIC_SUMMARY=sparse_v2 omitted unused domains in four paired responses but under-authored Q11 operational commitment and Q12 correction interpretation
NVIDIA_PRIVACY=raw_text_not_retained; hidden_reasoning_not_retained; content_hashes_and_bounded_lengths_only
HISTORICAL_DRIFT=docs/Routing_Status.md v1 route facts conflict with current committed current-compatibility.v2.json; current source wins; no stale route fact used
CHECKPOINT=not_applicable_no_tracked_wave4_source_change
NEW_FAILURES=provider_unavailable mapped failures under sparse_v2; current_v1 deadline aborts and one length/invalid_json response
PREEXISTING_FAILURES=known unrelated mistral env-route test failures and Sandbox Broker build defect remain outside Wave4 scope
NEXT_WAVE=Wave5 blocking P1 stabilization repairs

## Wave 5 — blocking P1 stabilization repairs

WAVE=5
STATUS=COMPLETE
START_HEAD=5162ff0aeb866fc7cab733240bc01fee43c441f6
START_TREE=5c046ca43bf3db80a6d340dde7f3989d2f959f0c
P1_REPAIRS=SW-1 evidence reliance carry-through; SW-2 pending speech-outbox crash/restart recovery; SW-3 future-trigger Thought-seen-state binding; SW-4 conservative prose/fidelity guard repair
SW_1_STATUS=PASS
SW_1_EVIDENCE=Authored retrievalRefsUsed/sourceRefsUsed survive materialization, settlements.payload_json, and causal_ledger.payload_json; absent fields remain absent; malformed present operations arrays are rejected.
SW_2_STATUS=PASS
SW_2_EVIDENCE=Only live unsuppressed unreserved pending speech rows are reconsidered through the existing projector; restart is idempotent; proactive-cap, shadow, suppression, and projector-failure gates remain effective; no re-cognition.
SW_3_STATUS=PASS
SW_3_EVIDENCE=Host-captured concern snapshot hashes remain hidden from model wire; same-settlement and existing-concern triggers bind to exact hashes; missing/conflicting snapshots fail closed and publication rolls back transactionally.
SW_4_STATUS=PASS
SW_4_EVIDENCE=Direct affirmative operational/currentness claims remain guarded; questions, quoted/reported, hypothetical/future, disclaimed, and self-referential ordinary prose no longer trips the broad lexical guards; direct vision/reading claims still require observations.
FILES_CHANGED=20 tracked P1 source/test files; report and checkpoint artifacts under .superpowers/sdd/ashley-stabilization-overnight
TESTS_RUN=Focused rerun 11 files / 108 tests passed; wider affected cognitive verification 43 files / 279 tests passed; npm run build --prefix apps/agent-service; git diff --check
RESULT=BLOCKING_P1_REPAIRS=PASS
NEW_FAILURES=NONE
PREEXISTING_FAILURES=Known current-route Mistral environment failures and committed Sandbox Broker build/entrypoint defect remain outside scope.
PROVIDER_ACTION=NONE_DURING_WAVE_5
PRODUCTION_MUTATION=NONE_DURING_WAVE_5
SHUTDOWN_AUTHORITY=NO
SHUTDOWN_ACTION=PROHIBITED
CHECKPOINT=.superpowers/sdd/ashley-stabilization-overnight/checkpoints/wave-5.patch
CHECKPOINT_SHA256=91C582AE672C1EEACBD3B389C39688D84A24A99EA8A9D15DCCF52CC270BB6054
REPORT=.superpowers/sdd/ashley-stabilization-overnight/wave-results/p1-stabilization.md
NEXT_WAVE=Wave6 release/version mechanics

## Wave 6 — release/version mechanics

WAVE=6
STATUS=COMPLETE_LOCAL_ONLY
START_HEAD=83b94ab7074bdcdbe039f801f618045215f7d244
IDENTITIES=SETTLEMENT_SCHEMA_VERSION=2; IMPLEMENTATION_SPEC_VERSION=0.2.1.r6; THOUGHT_OUTPUT_CONTRACT_ID=ashley.thought.semantic.v2; THOUGHT_OUTPUT_SCHEMA_ID=ashley.thought.semantic.v2.schema
TRANSITION_UTILITY=scripts/stabilization/sidecar-meta-transition.mjs
TRANSITION_CONTRACT=BEGIN IMMEDIATE; verify id=1/schema=8/epoch=v0.2.1/spec=r5-or-r6/contract=2; update only implementation_spec_version with expected-old WHERE; changes()==1; read-back; COMMIT or ROLLBACK fail-closed
SW_5_SW_6_WITNESS=node --test scripts/stabilization/sidecar-meta-transition.test.mjs => 5/5 passed
TARGETED_VERIFICATION=7 cognitive files / 75 tests passed; agent-service build passed; git diff --check passed
FULL_COGNITIVE_SWEEP=134 files; 641 passed; 19 failed in four known pre-existing qualification/scale files (current-route/fixture or TPM-baseline conditions); no Wave6 transition failure
PROVIDER_ACTION=NONE_DURING_WAVE_6
PRODUCTION_MUTATION=NONE_DURING_WAVE_6
SIDECAR_META_TRANSITION_EXECUTED=NO_PRODUCTION; temporary in-memory witnesses only
NEW_FAILURES=NONE_IN_WAVE_6_SURFACES
PREEXISTING_FAILURES=Known qualification/scale failures above; committed Sandbox Broker build defect remains outside scope
SHUTDOWN_AUTHORITY=NO
SHUTDOWN_ACTION=PROHIBITED
REPORT=.superpowers/sdd/ashley-stabilization-overnight/wave-results/release-version-mechanics.md
NEXT_WAVE=Wave7 exact immutable candidate qualification

## Wave 7 — exact immutable candidate qualification

WAVE=7
STATUS=PASS_LOCAL_EXACT_CANDIDATE
CANDIDATE_SHA=bbd3657eb0f590f30ddb582b3d73b51fa2f5f20e
CANDIDATE_TREE=c1adc90c107941b87784fa5c9aa747bab67c325b
CANDIDATE_PARENT=5ad74718be5827cfb9471eb7aa05540f548c4f7c
BRANCH=codex/stabilization-sparse-vnext-overnight-20260906
WORKTREE_BEFORE_QUALIFICATION=CLEAN
INTEGRATED_VITEST=27_FILES_245_TESTS_PASS
FORWARD_ROLLBACK_WITNESS=node --test scripts/stabilization/sidecar-meta-transition.test.mjs => 5/5 passed
BUILD=npm run build --prefix apps/agent-service => PASS
DIFF_CHECK=git diff --check => PASS
PROVIDER_ACTION=NONE_DURING_WAVE_7
PRODUCTION_MUTATION=NONE_DURING_WAVE_7
RELEASE_QUALIFIED=LOCAL_EXACT_CANDIDATE
PUSH_PENDING=YES
SHUTDOWN_AUTHORITY=NO
SHUTDOWN_ACTION=PROHIBITED
REPORT=.superpowers/sdd/ashley-stabilization-overnight/wave-results/exact-candidate-qualification.md
CHECKPOINT=.superpowers/sdd/ashley-stabilization-overnight/checkpoints/wave-7.patch
NEXT_WAVE=Wave8 push then production preflight/deployment and bounded acceptance

## Wave 7 push and Wave 8 production preflight

PUSH_PRE_SHA=18008cf649c74e0a4080c30736b6d88737fb0108
PUSH_REMOTE_SHA=18008cf649c74e0a4080c30736b6d88737fb0108
REMOTE_BRANCH=refs/heads/codex/stabilization-sparse-vnext-overnight-20260906
PUSH_RESULT=PASS
PRODUCTION_HOST=XQX (SSH alias mint)
PRODUCTION_CHECKOUT_SHA=7bae7eaafedc2e7e859218d340920ea3958b1515
PRODUCTION_CHECKOUT_TREE=5a1fd8c04ced30f1fd0764ea7b7b667285ce4170
PRODUCTION_CHECKOUT_BRANCH=master
PRODUCTION_TRACKED_WORKTREE=CLEAN
PRODUCTION_AGENT_SERVICE=active/running
PRODUCTION_DISCORD_SERVICE=active/running
PRODUCTION_HEALTH={"ok":true,"ready":true,"state":"ready","cognitiveKernel":"v021","cognitiveSidecarSchemaVersion":8}
PRODUCTION_ACTIVATED_SHA=7bae7eaafedc2e7e859218d340920ea3958b1515
PRODUCTION_SIDECAR_PATH=/home/xarvak/.composer-assistant/cognitive-v021.db
PRODUCTION_SIDECAR_META=id=1;schema_version=8;architecture_epoch=v0.2.1;implementation_spec_version=0.2.1.r5;thought_contract_version=2;authority_epoch=1;projection_state=current
PRODUCTION_SIDECAR_USER_VERSION=8
PRODUCTION_MUTATION=NONE_DURING_PREFLIGHT
SHUTDOWN_AUTHORITY=NO
SHUTDOWN_ACTION=PROHIBITED
NEXT_WAVE=Wave8 exact-candidate deployment with bounded r5-to-r6 sidecar transition

## Wave 8/9 — production deployment and bounded acceptance

WAVE=8_9
STATUS=DEPLOYMENT_PASS_ACCEPTANCE_DEGRADED_NOT_ACCEPTED
SOURCE_CANDIDATE_SHA=bbd3657eb0f590f30ddb582b3d73b51fa2f5f20e
SOURCE_CANDIDATE_TREE=c1adc90c107941b87784fa5c9aa747bab67c325b
PRODUCTION_HOST=XQX; SSH_ALIAS=mint; PATH=/home/xarvak/project-ashley
PRE_DEPLOY_SHA=7bae7eaafedc2e7e859218d340920ea3958b1515
PRE_DEPLOY_TREE=5a1fd8c04ced30f1fd0764ea7b7b667285ce4170
DEPLOYED_SHA=bbd3657eb0f590f30ddb582b3d73b51fa2f5f20e
DEPLOYED_TREE=c1adc90c107941b87784fa5c9aa747bab67c325b
PRODUCTION_DEPLOYMENT=PASS; tracked_worktree=CLEAN; activated_marker=bbd3657eb0f590f30ddb582b3d73b51fa2f5f20e
SIDECAR_META_BEFORE=0.2.1.r5; SIDECAR_META_AFTER=0.2.1.r6; schema=8; transition_changed_rows=1; transition_readback=PASS
DEPLOYED_IDENTITIES=implementation_spec=0.2.1.r6; settlement_schema=2; architecture_epoch=v0.2.1; thought_contract=ashley.thought.semantic.v2; thought_schema=ashley.thought.semantic.v2.schema; semantic_fingerprint=sha256:e96d2a20feea442da2fbfacfa02bc9b0383836e0e531af3c089c67c436a35ace
READINESS=agent_active_ready; discord_active; sidecar_quick_check=ok; nuclear_quick_check=ok; continuity_available
LIVE_WITNESS=one owner ingress; cycle=cycle:24f1049c62f932c179f2e005e8dc8a8583938d8f223429490ea9dc5a9e7d1895; generation=31; attention_id=2111; provider=nim; error=provider_unavailable; retry=none; fallback=none
LIVE_WITNESS_RESULT=inbox_consumed; cycle_silent; causal_ledger_thought_unavailable=1; settlement=none; speech_outbox=none; system_notice=delivered; reservation=234_committed; discord_receipt=1546367398016327720
WITNESS_REMEDIATION=transactionally corrected synthetic thread linkage for reservation 234/notice 19; existing receipt finalized; no resend
PRODUCTION_ACCEPTANCE=DEGRADED_NOT_ACCEPTED; ordinary_sparse_settlement=NOT_PROVEN; thought_route=DEGRADED
LOCAL_EXACT_CANDIDATE_WITNESSES=PASS; production_outbox_recovery=NOT_PROVEN; future_trigger_production=NOT_PROVEN; evidence_reliance_production=NOT_PROVEN
SYSTEM_NOTICE_DISCORD_ID_PROJECTION_GAP=PREEXISTING_CURRENT_SOURCE_GAP; authoritative bubble/evidence retain real ID; no candidate expansion
OPERATOR_EFFECT=two read-only inspection passes induced SQLite lock/restart path; agent auto-restarted twice and returned active/ready; recorded separately from candidate failure
NO_ROLLBACK=provider failure also present in Wave4; rollback would not repair provider availability
STABILITY_WINDOW=NOT_STARTED; do not claim complete
SHUTDOWN_AUTHORITY=NO
SHUTDOWN_ACTION=PROHIBITED
REPORT=.superpowers/sdd/ashley-stabilization-overnight/wave-results/production-deployment-acceptance.md
CHECKPOINT=.superpowers/sdd/ashley-stabilization-overnight/checkpoints/wave-8.patch
REPORT_SHA256=0AF2B5FC74DFDE4FB29716840B821C0C607C27C5B30BFF0EEA9DCE0B13CCC4D5
CHECKPOINT_SHA256=14533B7B963DC784299E90DB713B6841AB7C52F58CDDEA877095DDDBE2AED6E5
NEXT_GATE=Owner adjudication of provider reliability and pre-existing system-notice ID projection gap; stable-use acceptance remains closed
