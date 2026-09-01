# Project Ashley — Phase 5 Lightning Expansion and Qualification

Date: 2026-09-01

This report records the owner-approved Phase 5 expansion attempt for the
explicit candidate `nim/nvidia/nemotron-3.5-lightning-30b-a3b`. The expansion
terminated at the pre-candidate native-schema gate. No Lightning candidate was
frozen, pushed, physically qualified, installed, activated, deployed, or
promoted.

## Terminal field record

```text
OWNER_EXPANSION_SELECTION=nim/nvidia/nemotron-3.5-lightning-30b-a3b
LIGHTNING_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
LIGHTNING_ENDPOINT=https://integrate.api.nvidia.com/v1/chat/completions
LIGHTNING_PROBE_RESULT=NOT_ESTABLISHED
LIGHTNING_PROBE_CALL_COUNT=2
PROVEN_NATIVE_WIRE_MODE=NONE
CURRENT_GPT_OSS_BINDING_STATUS=NOT_QUALIFIED
HISTORICAL_W2_EVIDENCE_CHANGED=no
ATTENTION_FAILURE_CLASS=CLOCK_FIXTURE_DEFECT
ATTENTION_FIX=monthlyUsageSummary now accepts the injected AttentionClock and uses it for the cutoff calculation
W2_EVIDENCE_SCHEMA_CLASS=ADDITIVE_EXTENDED_ROUTE_QUALIFICATION_V1
BUILD=PASS
FULL_CORPUS=PASS_369_FILES_2261_TESTS_2_SKIPPED
NEW_BINDING_ID=NONE
NEW_PORTFOLIO_REVISION=NONE
NEW_CAPABILITY_FINGERPRINT=NONE
NEW_CANDIDATE_SHA=NOT_CREATED
REMOTE_CANDIDATE_SHA=NOT_CREATED
W2_LIGHTNING_PHYSICAL_QUALIFICATION=NOT_RUN_SCHEMA_GATE
W3_EXACT_CANDIDATE_STAGE_H=NOT_RUN_SCHEMA_GATE
TRANSPORT_ROUTE_READY=NOT_ESTABLISHED
THOUGHT_CONTRACT_QUALIFIED=NOT_ESTABLISHED
RELEASE_TRUTH_MATCHED=NOT_ESTABLISHED
PRODUCTION_ACCEPTED=NO
PRODUCTION_MUTATION=no
DEPLOYMENT_PERFORMED=no
W9_STARTED=no
LIGHTNING_EXPANSION_STATUS=REJECTED_AT_SCHEMA_GATE
READY_FOR_FINAL_INDEPENDENT_REVIEW=no
READY_FOR_PRODUCTION_DEPLOY=no
```

## Governing order and stop condition

The required order was applied:

```text
native-schema probe
→ candidate freeze
→ exact-SHA push
→ isolated Mint preparation
→ live W2
→ THOUGHT_CONTRACT_QUALIFIED / RELEASE_TRUTH_MATCHED
→ activation-gate evaluation
→ authorized live-runtime mutation
```

The native-schema probe did not establish a qualifying native enforcement mode.
The process therefore stopped before candidate freeze. The later steps were not
attempted. This probe was not W2 and does not qualify the candidate.

The probe used the real NVIDIA NIM adapter/API path on Linux Mint and made real
network requests to the exact endpoint recorded above. It used no Ashley or
private conversational context. It made exactly two sequential provider calls,
with no retry after the results were available:

| Call | Requested mode | Binding mode | HTTP | Provider response | JSON syntax | Schema conformance | Enforcement observed | Elapsed | Response bytes | Response SHA-256 |
|---|---|---|---:|---|---|---|---|---:|---:|---|
| 1 | `response_format_json_schema` | `nim_response_format_json_schema` | 200 | received; no provider error | fail | fail | false | 3210 ms | 1464 | `sha256:b77a060d16973c5a7143e21f674a8afd80c1b74919ee5e3324bdbf48a2aba1b0` |
| 2 | `guided_json` | `nim_guided_json` | 200 | received; no provider error | fail | fail | false | 2855 ms | 1496 | `sha256:401cbebc230c95a3774b0f31a2166d2585ad6b9acdf62572313105c3566eb951` |

Probe ID: `lightning-native-binding-probe-6fd322a0-1753-41ac-8657-e1b6aa328c0a`

Probe timestamp: `2026-09-01T01:25:25.075Z`

Probe schema digest:
`sha256:eac61a99f110558b9d98e7cb17ef0473f763761f7d2fa7bd5e625cef66b3a2fd`

The adversarial schema was an object with
`additionalProperties=false`, required property `value`, and
`value` constrained to the string constant `probe_ok`. The prompt requested the
wrong value `not_probe_ok`. A passing result required both
`SCHEMA_CONFORMANCE=PASS` and `ENFORCEMENT_OBSERVED=true`. Neither mode met
those requirements. HTTP 200, response receipt, JSON decoding, or prompt
obedience alone would not have been sufficient.

The durable probe evidence establishes:

```text
LIGHTNING_NATIVE_SCHEMA_SUPPORT=NOT_ESTABLISHED
PROVEN_NATIVE_WIRE_MODE=NONE
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
```

This is a binding qualification failure, not proof that
`nvidia/nemotron-3.5-lightning-30b-a3b` is fundamentally incapable of the
successor Thought contract. The probe response bodies were not durably retained
by this probe; only byte counts and SHA-256 digests were retained. No body was
reconstructed and no qualification was rerun.

## Existing GPT-OSS W2 evidence remains immutable

The prior GPT-OSS result remains:

```text
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
binding=compat_thought_nim_gpt_oss_20b_json_object_v1
wireMode=json_object_compatibility
```

The old artifact was
`work/phase5-w2-live-candidate-8c3c470/w2-route-qualification.json` with
artifact digest
`sha256:f217e944e181ab6f1873722af3e49516b8d85e0c80e0356a51ee3e744b8337b0`.
Its run ID was
`w2-20260831T225810965Z-9c48c69a-a8f4-45d2-983c-d0e342cb717f`.

The ten actual provider responses were recorded as
`wireMode=json_object_compatibility`, `wireFormat=json_object`, and
`providerDeclaredEnforcement=unavailable`. They were JSON-syntax-valid but were
rejected by Ashley's closed-schema oracle with `oneOf_mismatch:$`, followed by
strict-parser rejection. The old artifact retained byte counts and digests, not
raw response bodies:

```text
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
RAW_PROVIDER_CONTENT_PERSISTED=no
```

The exact structural reason beneath `oneOf_mismatch:$` therefore remains an
observability/evidence limitation. It is not evidence of fundamental model
incapability.

The two old abstains were kept separate from provider reliability. Each had zero
`providerAttemptIds`, approximately 7–9 ms elapsed time, no wire mode, no wire
binding, no capability fingerprint, and empty raw content. The artifact does not
durably identify their first pre-dispatch boundary:

```text
FIRST_FAILURE_BOUNDARY=NOT_DURABLY_IDENTIFIABLE_FROM_OLD_ARTIFACT
DISPATCH_TRUTH=NOT_PROVEN
PROVIDER_RELIABILITY_DENOMINATOR=EXCLUDED
```

The existing route, binding, portfolio, and W2 artifact were not modified.

## Source trace of the current GPT-OSS compatibility binding

The source trace from the existing qualification substrate shows that the
logical `json_schema` contract can be mapped by `dispatch-contract.ts` to the
compatibility actual format `json_object`; `nim-adapter.ts` then emits
`response_format={type:"json_object"}`. `wire-evidence.ts` records the
compatibility wire mode and unavailable provider-declared enforcement. The NIM
adapter contains stronger native branches, but the current GPT-OSS portfolio
does not select them.

The generic NIM profile's structured-JSON declaration is not endpoint/model
enforcement proof. The Lightning probe was the required direct check for the
selected model and endpoint. Because both permitted native modes failed the
adversarial conformance gate, this pass does not change the binding.

## Attention failure repair

The required pre-freeze full-corpus attention failure was reproduced in
`apps/agent-service/src/core/attention/attention.test.ts`:

```text
folds the same day twice identically and monthly totals once
expected monthly input 8, received 0
```

The failure was caused by `monthlyUsageSummary` using wall-clock `Date.now()`
while the test fixture used a deterministic `AttentionClock` set to the fixture
date. The minimal repair injects `AttentionClock` into
`monthlyUsageSummary` and uses `clock.nowMs()` for its cutoff. The test now passes
the fixture clock explicitly.

Verification after the repair:

```text
focused attention suite: 1 file passed, 18 tests passed
agent-service build: PASS
full agent-service corpus: 369 files passed; 2261 tests passed; 2 skipped
```

The repair is independent of the rejected Lightning schema gate. It does not
authorize a candidate freeze or a production change.

## Preserved closure boundaries

No W4 barrier change was made. The already-derived source/test contract remains
the authority for the barrier transition behavior, including preservation of
`active_transition_id` where required.

The successor `parseThoughtSemanticOutput` remains the sole live v0.2.1
provider-output parser. Historical legacy decoding remains isolated from live
provider-response authority; no runtime or environment escape hatch restoring
legacy parsing was added.

No current route binding, portfolio revision, capability fingerprint, candidate
SHA, remote candidate ref, production checkout, activation epoch, deployment, or
W9 work was created or mutated during this expansion attempt. Existing unrelated
worktree changes were preserved.

## Final disposition

```text
LIGHTNING_EXPANSION_STATUS=REJECTED_AT_SCHEMA_GATE
W2_LIGHTNING_PHYSICAL_QUALIFICATION=NOT_RUN_SCHEMA_GATE
W3_EXACT_CANDIDATE_STAGE_H=NOT_RUN_SCHEMA_GATE
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED (historical GPT-OSS result preserved)
PRODUCTION_ACCEPTED=NO
PRODUCTION_MUTATION=no
DEPLOYMENT_PERFORMED=no
W9_STARTED=no
```

The next allowed action requires a separately evidenced native schema-enforcing
NIM mode for the exact Lightning model and endpoint. This pass does not infer
that the model is fundamentally incapable, and it does not rerun the probe.
