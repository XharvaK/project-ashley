# Project Ashley Phase 5 Full-Corpus Root-Cause Closure and Mistral Candidate

Date: 2026-09-01

## Terminal result

FULL_CORPUS_CLOSURE=PASS_CANDIDATE_FROZEN_W2_NOT_QUALIFIED

The deterministic full corpus passed after the bounded source-derived fixture
and current-route correction pass. The exact passing candidate was frozen and
pushed. The exact candidate was built on Mint in an isolated qualification
checkout and sent through the real Mistral adapter with 12 primary-credential
requests. W2 transport completed, but the Thought contract was not qualified.

Production was not mutated. The production checkout was not updated. No
production process was started, restarted, activated, deployed, or promoted.
W3 Stage H was not run because the W2 gate did not permit continuation.

## Frozen initial evidence and closure evidence

The packet-authoritative initial result remains:

INITIAL_FAILED_FILES=34

INITIAL_FAILED_TESTS=67

370 test files were reported, with 336 passing and 34 failing. The corpus
reported 2303 tests, with 2234 passing, 67 failing, and 2 skipped. No candidate
was frozen at that point.

The deterministic local reproduction used for the MRI had the same 34 failing
test files but recorded 73 failed assertions. The six-assertion delta was
caused by the pre-existing shared temporary continuity sidecar state. It is
reported separately and is not substituted for the packet-authoritative
initial values:

REPRODUCED_INITIAL_FAILED_FILES=34

REPRODUCED_INITIAL_FAILED_TESTS=73

REPRODUCED_INITIAL_RESULT=370 files; 336 passed; 34 failed; 2303 tests; 2228 passed; 73 failed; 2 skipped

The first-boundary matrix below classifies the complete reproduced failure
set. The packet-authoritative 67 failures are a subset of the same 34-file
failure surface. The six extra reproduced assertions were not treated as
additional product regressions.

The final deterministic corpus result was:

FULL_CORPUS=PASS (371 test files; 2304 tests; 2302 passed; 0 failed; 2 skipped)

The two skipped tests are the existing UnixBrokerClientTransport timeout
sent-or-unknown test and UnixBrokerClientTransport framed-response test.

## Root-cause summary

ROOT_CAUSE_COUNT=3

ROOT_CAUSE_1=TEST_DB_BOOTSTRAP_DEFECT: file-backed test databases created under the ordinary temporary directory resolved to a shared temporary continuity sidecar. A fresh nuclear database therefore entered migration reconciliation with no lineage_mirror in its own file, while the migration path correctly required the lineage mirror and sidecar lineage.

ROOT_CAUSE_2=CURRENT_ROUTE_EXPECTATION_DRIFT: current tests still asserted predecessor Thought occupants, predecessor provider-key availability, predecessor fallback metadata, or predecessor quota identities after the owner-approved successor portfolio made Mistral Small the Thought route and NIM Lightning the utility and Expression route.

ROOT_CAUSE_3=TEST_FIXTURE_CONSTRUCTION_AND_LIFECYCLE_DEFECT: several tests constructed fakes with the wrong current identity, cleared a predecessor provider key instead of the current route key, failed to carry a continuity sidecar across restart, or leaked/closed the wrong fixture-owned handle. These were corrected in test and qualification-harness construction. No production migration or provider behavior was changed for this cluster.

LINEAGE_MIRROR_ROOT_CAUSE=TEST_DB_BOOTSTRAP_DEFECT

LINEAGE_MIRROR_FIX=Each file-backed qualification fixture now receives a unique isolated data-plane directory and an explicit continuity sidecar. Restart fixtures reuse the same continuity sidecar across close and reopen. Direct file-backed fixtures provide an explicit in-memory continuity sidecar where that is the intended test boundary. No generic CREATE TABLE workaround and no production migration DDL change were added.

ROUTE_EXPECTATION_CLASSIFICATION=Current portfolio expectations were updated only where the test asserted current routing, current availability, current binding identity, or current quota behavior. Historical revision and historical GPT-OSS evidence tests were preserved. Generic routing tests remain behavior-focused. The Thought-owned semantic paths thought_observation and reflection_initiative resolve to Mistral Small; utility and bulk paths resolve to NIM Lightning.

HISTORICAL_TESTS_CHANGED=NO

CURRENT_ROUTE_TESTS_CHANGED=YES

CLUSTERS_C_D_F=NONE_PROVEN. No genuine routing regression, genuine migration regression, or other independent root cluster survived the source-first trace and final corpus.

## Source-first lineage_mirror MRI

The lineage mirror is current control-plane state. It is not a qualification-only
table and it is not a historical predecessor object.

The authority chain is:

1. apps/agent-service/src/core/continuity/nuclear-targetable.ts,
   ensureEntityUuidAndClassification(), defines lineage_mirror and establishes
   the single-row lineage invariant.
2. The schema transition in apps/agent-service/src/core/db.ts invokes
   ensureEntityUuidAndClassification() during the v13 transition.
3. Later migrations read lineage_mirror and require the corresponding
   continuity sidecar lineage before continuing.
4. reconcilePendingNuclearMigration() in apps/agent-service/src/core/db.ts
   reads lineage_mirror before the migration path can repair or establish the
   invariant for an arbitrary file-backed database.
5. openNuclearDb() derives a data plane for ordinary file paths. The prior
   qualification fixtures passed arbitrary files under the ordinary temporary
   directory without a unique isolated plane, so separate fixtures shared the
   temporary continuity sidecar.

The minimal mechanical reproduction created a unique temporary root, a
continuity sidecar with pending migration state, and a fresh nuclear database
with no lineage_mirror. Opening the database through the ordinary file-backed
path failed at the first read of lineage_mirror with no such table:
lineage_mirror. The same reproduction did not require a production database,
provider request, or schema mutation.

The failing qualification files did not share one production migration defect.
They shared an invalid test database construction boundary. Once the
qualification data plane was isolated, the lineage-focused cluster passed.

The state inventory continues to classify lineage_mirror as control-plane
state. The correction does not change that ownership.

## Complete first-boundary failure matrix

The observed-count column comes from the deterministic local failure artifact.
The matrix has one row for every failing test file and classifies each observed
assertion by its first causal boundary. A row with a mixed root records the
different first boundaries within that file. Later cleanup, close-of-undefined,
restart, or assertion failures that appeared only after the shared-sidecar
failure was removed are recorded as dependent fixture defects, not as new
root causes.

For this matrix:

- A = LINEAGE_MIRROR / DATABASE FIXTURE / MIGRATION.
- B = STALE ROUTE / MODEL / AVAILABILITY EXPECTATION.
- C = GENUINE ROUTING REGRESSION.
- D = GENUINE MIGRATION REGRESSION.
- E = TEST INFRASTRUCTURE / FIXTURE CONSTRUCTION DEFECT.
- F = OTHER.
- “Source changed” means production/runtime source, not a test-only edit.

| TEST_FILE | OBSERVED_FAILURES | FIRST_FAILURE | DEPENDENT_FAILURES | ROOT_CLUSTER | LIKELY_OWNER | SOURCE_CHANGED_BY_CURRENT_WORKTREE | TEST_EXPECTATION_CHANGED | CLASSIFICATION |
|---|---:|---|---|---|---|---|---|---|
| apps/agent-service/src/core/agency/thought-continuation-repair.test.ts | 1 | Current route-availability assertion still used the predecessor provider-key boundary. | None at the initial boundary. | B | Current-route test | yes | yes | STALE_CURRENT_ROUTE_EXPECTATION |
| apps/agent-service/src/core/agency/thought-data-plane.test.ts | 1 | Provider spy expected Groq for a Thought call; current Thought resolves to Mistral Small. | None at the initial boundary. | B | Current-route test | yes | yes | STALE_THOUGHT_ROUTE_EXPECTATION |
| apps/agent-service/src/core/agency/wave01-thought.test.ts | 1 | No-key guard cleared the predecessor Groq key while current Thought remained Mistral-bound. | None at the initial boundary. | B | Current-route test and fixture setup | yes | yes | STALE_PROVIDER_KEY_EXPECTATION |
| apps/agent-service/src/core/cognition/reconsideration.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Reconsideration behavior was not reached. | A | Qualification database fixture | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/context-budget/eligibility.test.ts | 1 | Current route metadata assertion expected predecessor adapter/model fields. | Eligibility behavior itself was reached; only the occupant expectation was stale. | B | Current-route test | yes | yes | STALE_ROUTE_METADATA_EXPECTATION |
| apps/agent-service/src/core/conversation/expression-fallback.test.ts | 1 | Injected fake returned model while the assertion read the runtime environment model field. | Fallback hop behavior was not implicated. | E | Test fixture construction | no | yes | TEST_FIXTURE_IDENTITY_SHAPE_DEFECT |
| apps/agent-service/src/core/model-fabric/mf-m1.test.ts | 5 | Mixed first boundaries: local NIM readiness, invalid capability identity, and receipt assertions still encoded predecessor route/fallback metadata. | The invalid identity and receipt assertions were downstream of stale fixture/route assumptions. | B + E | Model Fabric test fixtures and current-route expectations | yes for route cases; no for fixture cases | yes | MIXED_STALE_ROUTE_AND_FIXTURE_CONTRACT |
| apps/agent-service/src/core/model-fabric/mf-target-envelope.test.ts | 1 | Target envelope assertion expected predecessor portfolio identity and token envelope. | Envelope construction was not a production failure. | B | Current portfolio test | yes | yes | STALE_CURRENT_PORTFOLIO_EXPECTATION |
| apps/agent-service/src/core/model-routing/adapters/zen-adapter.test.ts | 1 | Compatibility Thought assertion expected NIM instead of current Mistral Small. | Zen remained dark; no Zen regression was proven. | B | Current-route test | yes | yes | STALE_COMPATIBILITY_THOUGHT_EXPECTATION |
| apps/agent-service/src/core/qualification/init03-adversarial.test.ts | 2 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | INIT-03 adjudication was not reached. | A | Qualification database fixture | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/init03-evaluation.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | INIT-03 evaluation was not reached. | A | Qualification database fixture | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-affect.test.ts | 2 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Affect non-interference assertions were not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-attention-dispatch.test.ts | 9 | Seven assertions stopped at the shared-sidecar lineage_mirror read; two reached stale NIM GPT-OSS and predecessor quota expectations. | The two route/quota assertions were masked only by the database bootstrap failure in the other cases. | A + B | Counterfactual fixture and current-route expectations | yes for B cases; no for A cases | mixed | MIXED_BOOTSTRAP_CASCADE_AND_STALE_ROUTE |
| apps/agent-service/src/core/qualification/wave4-attention-route-precedence.test.ts | 2 | Both initial assertions stopped at the shared-sidecar lineage_mirror read. | After bootstrap repair, the route mock reported predecessor provider/model identity and was corrected to current Mistral identity. | A -> E | Counterfactual fixture and route mock | no | yes for mock contract | TEST_DB_BOOTSTRAP_WITH_LATENT_FIXTURE_IDENTITY_DEFECT |
| apps/agent-service/src/core/qualification/wave4-baseline.test.ts | 2 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Determinism comparison was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-curiosity.test.ts | 2 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Curiosity non-interference was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-failure-paths.test.ts | 4 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Failure-path no-credit assertions were not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-hard-turn.test.ts | 4 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Hard-turn shadow Thought assertions were not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-inventory.test.ts | 3 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | State inventory enumeration was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-latent-gaps.test.ts | 4 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Review, consolidation watermark, and receipt projections were not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-learning-identity.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Shadow learning identity assertions were not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-master-apply.test.ts | 2 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Master apply non-interference assertions were not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-proactive-boundary.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Proactive boundary assertion was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-promotion-boundary.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Promotion boundary assertion was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-qualification.test.ts | 2 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Qualification accumulation assertions were not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-relationship.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Relationship inertness assertion was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-restart.test.ts | 2 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Restart persistence was not reached; later sidecar carry-forward and handle cleanup defects were fixed after bootstrap repair. | A | Counterfactual restart fixture | no | no | TEST_DB_BOOTSTRAP_WITH_LATENT_LIFECYCLE_DEFECT |
| apps/agent-service/src/core/qualification/wave4-rollout-gate.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Rollout gate behavior was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-thread-isolation.test.ts | 2 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Thread isolation assertions were not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-time-shift.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Provenance time-shift assertion was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/qualification/wave4-track-e.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Episode evidence assertion was not reached. | A | Counterfactual fixture factory | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/reflection/initiative-review.test.ts | 1 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Reflection adjudication was not reached. | A | Reflection qualification fixture | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/runtime.test.ts | 6 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Runtime delivery, reflection, urgency, and proactive assertions were not reached. | A | Runtime test database fixture | no | no | TEST_DB_BOOTSTRAP_DEFECT |
| apps/agent-service/src/core/sandbox/v2-execution.test.ts | 3 | openNuclearDb -> reconcilePendingNuclearMigration -> nuclearLineageMirrorId -> no such table: lineage_mirror. | Sandbox offer and fail-closed execution assertions were not reached. | A | Sandbox qualification fixture | no | no | TEST_DB_BOOTSTRAP_DEFECT |

The matrix's observed assertion counts sum to 73: 59 lineage-first
assertions, 11 stale-route/model expectation assertions, and 3 direct
fixture-construction or fixture-identity assertions. The packet-authoritative
initial total remains 67. The local six-assertion delta was not used to
increase any product-failure count.

After the A correction, seven latent lifecycle or identity fixture failures
were exposed across the affected cleanup/restart/identity paths. They were
closed by carrying the correct continuity sidecar across reopen, closing
fixture-owned databases in the correct order, using isolated temporary
directories, and returning the current Mistral provider/model identity from
route mocks. They were dependent failures, not a fourth root cause.

## Routing ownership and portfolio result

The current successor route is:

THOUGHT_OBSERVATION_ROUTE=thought -> mistral/mistral-small-2603 (high)

REFLECTION_INITIATIVE_ROUTE=thought -> mistral/mistral-small-2603 (high)

THOUGHT_OBSERVATION_ROUTE_OWNER=Thought semantic authorship

REFLECTION_INITIATIVE_ROUTE_OWNER=Thought semantic authorship

UTILITY_AND_BULK_ROUTE=nim/nvidia/nemotron-3.5-lightning-30b-a3b

THOUGHT=mistral/mistral-small-2603

THOUGHT_REASONING=high

EXPRESSION_PRIMARY=nim/nvidia/nemotron-3.5-lightning-30b-a3b

EXPRESSION_REASONING=none

EXPRESSION_FALLBACK=groq/qwen/qwen3.6-27b

UTILITY_BULK=nim/nvidia/nemotron-3.5-lightning-30b-a3b

SANDBOX_LIGHT=nim/nvidia/nemotron-3.5-lightning-30b-a3b

SANDBOX_LIGHT_ENABLED=no

SANDBOX_DEEP=nim/nvidia/nemotron-3-ultra-550b-a55b

SANDBOX_DEEP_ENABLED=no

MISTRAL_SCHEMA_PROBES_PRESERVED=yes

MISTRAL_NATIVE_SCHEMA_SUPPORT=ESTABLISHED

MISTRAL_HIGH_REASONING_W0_COMPATIBILITY=ESTABLISHED

No W0 capability probe was rerun. No provider substitution was introduced.

## Verification before candidate qualification

FOCUSED_TESTS=PASS: lineage-focused cluster 27 files / 128 tests; route suites 9 files / 105 tests; cleanup/restart/identity group 5 files / 21 tests

BUILD=PASS: npm run build --prefix apps/agent-service

The final corpus was run deterministically with one file at a time and one
worker. The corpus passed with 371 test files, 2304 tests, 2302 passed, zero
failed, and two skipped.

No provider probes were run during source diagnosis or focused verification.

## Candidate identity and Mint preparation

NEW_CANDIDATE_SHA=9cf777c41e39271c4e2cb2db5ed89503f97ff88f

REMOTE_CANDIDATE_SHA=9cf777c41e39271c4e2cb2db5ed89503f97ff88f

CANDIDATE_COMMIT_MESSAGE=fix(cognitive-v021): close Phase 5 corpus and route qualification

The candidate was pushed by ordinary fast-forward to
origin/codex/thought-context-optimization. The candidate checkout on Mint was
an isolated clone at /home/xarvak/project-ashley-qualification-9cf777c. Its
HEAD matched NEW_CANDIDATE_SHA and its worktree was clean.

The six required Mint package builds passed:

- apps/sandbox-m1
- apps/sandbox-policy
- apps/sandbox-tree
- apps/sandbox-v2
- apps/sandbox-broker
- apps/agent-service

The production checkout /home/xarvak/project-ashley remained at
573393c3fdb2392a45137d4625635658eb4b5d88 and clean. It was not used as the
qualification checkout.

MISTRAL_PRIMARY_PRESENT=yes

MISTRAL_SECONDARY_PRESENT=no

MISTRAL_SECONDARY_USED=no

## Live W2 physical qualification

W2 was run only after the exact candidate SHA was frozen, pushed, cloned into
an isolated Mint checkout, and built. The run used the real Mistral adapter and
the real Mistral API path for the exact target model. It used the primary
MISTRAL_API_KEY, high reasoning, no fallback, and no alternate provider.

W2_ENVIRONMENT=isolated_live

W2_PROVIDER=mistral

W2_MODEL=mistral-small-2603

W2_REASONING=high

W2_FALLBACK=none

W2_OCCUPANT=mfo_mistral_small_2603_high

W2_RUN_ID=w2-20260901T071858609Z-f8f469cf-f341-48bf-a5ce-178b0f2fa257

W2_ARTIFACT_LOCAL_PATH=work/phase5-w2-live-candidate-9cf777c/w2-route-qualification.json

W2_ARTIFACT_REMOTE_PATH=/home/xarvak/phase5-qualification-9cf777c-output/w2/w2-route-qualification.json

W2_ARTIFACT_SHA256=2d8fcc3455e5bf54f51a863d5af7eca25648e04aa3011484a3199924eca752b8

W2_REGISTRY_VERSION=sha256:1268a8de9745abe0b872bd4f801d0440c2567055cd9f811a639db45f93d2934e

W2_PORTFOLIO_REVISION=mfp_current_compatibility_v2

W2_POLICY_ROW=mfr_thought_interactive_compat_v1

W2_LOGICAL_BINDING=ashley.thought.semantic.v1

W2_SCHEMA_FINGERPRINT=sha256:9bf27fc16755f26917ab2eeae55010b7a94212c593847aa37e5e4a634563fb9b

W2_CAPABILITY_FINGERPRINT=sha256:2f154eb5e15834bca360b19e7d27af7461abc9a82d1d4ad124554e79e44a2a45

W2_BINDING=native_json_schema

W2_WIRE_FORMAT=mistral_response_format_json_schema

W2_WIRE_BINDING_ID=compat_thought_mistral_small_2603_native_json_schema_v2

W2_PROVIDER_DECLARED_ENFORCEMENT=unavailable

W2_BUILD_IDENTITY=9cf777c41e39271c4e2cb2db5ed89503f97ff88f

W2_REAL_PROVIDER_ATTEMPTS=12

W2_TRANSPORT=PASS: 12 of 12 requests had provider attempt IDs and transport=success

W2_CASES=8 PASS / 4 NOT_QUALIFIED

W2_JSON_SYNTAX=12 PASS

W2_CLOSED_SCHEMA_CONFORMANCE=12 PASS

W2_STRICT_PARSER=10 PASS / 2 FAIL

W2_SEMANTIC_VALIDITY=9 PASS / 3 FAIL

W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED

The four non-qualified case results were:

| CASE | SAMPLE | FIRST_FAILURE | STORED RESULT |
|---|---:|---|---|
| settlement | 0 | PROVIDER_CONTENT_RECEIVED; fencing and authority reachability failed | NOT_QUALIFIED |
| settlement | 2 | PROVIDER_CONTENT_RECEIVED; semantic validity, fencing, and authority reachability failed | NOT_QUALIFIED |
| effect_intent | 0 | STRICT_PARSER_REJECTION after provider content was received | NOT_QUALIFIED |
| abstain | 1 | STRICT_PARSER_REJECTION after provider content was received | NOT_QUALIFIED |

The two settlement responses reached the provider and returned content. Their
transport was successful. The effect_intent and abstain responses also reached
the provider, passed JSON syntax and closed-schema conformance, and were
rejected by the local strict parser. The provider-declared enforcement field
was unavailable, but the selected native_json_schema binding is established by
the frozen preflight binding and per-case wire fields. That field is not itself
a transport or schema failure.

CURRENT_W2_FAILURE_CLASS=STRICT_SEMANTIC_QUALIFICATION_FAILURE

CURRENT_W2_TRANSPORT_FAILURE=NO

MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN

The W2 artifact durably stores raw content byte counts and SHA-256 digests,
not raw provider response bodies. The already-created local W2 qualification
artifacts inspected for this pass did not contain the missing bodies.
Therefore:

RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED

No response body was reconstructed, inferred, or recovered by rerunning W2.
The exact structural or semantic content behind the strict-parser failures
cannot be determined from the body-free artifact. That is an observability
limitation in addition to the W2 qualification failure; it is not evidence
that Mistral Small is fundamentally incapable of the successor Thought
contract.

## W3, release truth, and production boundary

W3_STAGE_H=NOT_RUN_W2_NOT_QUALIFIED

The Stage H occurrence -> admitWake -> durable wakeId -> admitCycle(wakeId)
sequence was not started because W2 did not qualify the exact Mistral Small
Thought candidate.

TRANSPORT_ROUTE_READY=PASS

THOUGHT_CONTRACT_QUALIFIED=no

RELEASE_TRUTH_MATCHED=no

PRODUCTION_ACCEPTED=no

READY_FOR_FINAL_INDEPENDENT_REVIEW=no

PRODUCTION_MUTATION=no

DEPLOYMENT_PERFORMED=no

W9_STARTED=no

No production activation, live checkout update, service restart, deployment,
promotion, production database write, or release witness was performed.

The exact current blocker is the W2 semantic/strict-parser and reachability
qualification result for Mistral Small. The result is not a transport failure,
and it does not prove MODEL_FUNDAMENTALLY_INCAPABLE.

## Evidence files

- Source and tests are in candidate commit NEW_CANDIDATE_SHA.
- The initial deterministic failure artifact is
  work/phase5-full-corpus-initial-deterministic.json.
- The focused lineage artifact is work/phase5-lineage-focused.json.
- The final deterministic corpus artifact is
  work/phase5-full-corpus-final.json.
- The live W2 artifact is
  work/phase5-w2-live-candidate-9cf777c/w2-route-qualification.json.

The qualification artifacts remain outside the candidate commit so the exact
candidate SHA remains immutable. This report is a separate post-candidate
evidence record and does not change or qualify the candidate SHA.
