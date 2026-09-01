# Project Ashley — Phase 5 Qualification Substrate Repair

Date: `2026-09-01`

This report records the bounded qualification-substrate repair and the separate
non-promotable NIM capability probe authorized for the exact hosted endpoint.
It does not promote a capability, change the old W2 evidence, or authorize
deployment.

## Frozen starting state

The accepted failed compatibility-bound candidate remains:

`8c3c4706854c3e776080603bb8f3a4741fc5bebe`

The old W2 artifact remains immutable:

`work/phase5-w2-live-candidate-8c3c470/w2-route-qualification.json`

Artifact SHA-256:

`sha256:f217e944e181ab6f1873722af3e49516b8d85e0c80e0356a51ee3e744b8337b0`

Its run ID is:

`w2-20260831T225810965Z-9c48c69a-a8a4-45d2-983c-d0e342cb717f`

The frozen classifications remain:

```text
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
CURRENT_WIRE_BINDING_NOT_QUALIFIED=PROVEN
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
BUILD_IDENTITY_CLASS=QUALIFICATION_IDENTITY_BINDING_DEFECT
W3_WAKE_CLASS=QUALIFICATION_RUNNER_STALE
ARCHITECTURE_REOPEN_REQUIRED=no
```

The result of this source change is a new uncommitted candidate precursor. The
old SHA must not be described as containing these repairs.

## W2 evidence clarification

The old artifact contains 12 cases:

- 10 responses with provider attempt IDs, non-empty content byte counts, JSON
  syntax `pass`, closed-schema `fail`, and strict-parser `fail`.
- 2 abstain cases with zero provider attempt IDs, zero content bytes, empty
  content digests, no wire metadata, no capability fingerprint, and elapsed
  times of 9 ms and 7 ms.

All 10 responses use:

```text
wireMode=json_object_compatibility
wireFormat=json_object
providerDeclaredEnforcement=unavailable
```

The stored closed-schema diagnostic is `oneOf_mismatch:$`. The stored artifact
does not contain the response bodies. It contains byte counts and SHA-256
digests only.

```text
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
RAW_PROVIDER_CONTENT_PERSISTED=no
```

No existing qualification artifact or log was found that durably retained the
missing bodies. They were not reconstructed, inferred, or recovered by rerun.
The exact branch-level reason for the old `oneOf` mismatch therefore remains a
qualification-observability evidence limitation. It is not evidence that the
model is fundamentally incapable of the successor Thought contract.

The two zero-attempt abstain cases are not counted as NIM provider failures.
The old artifact does not retain the receipt metadata needed to identify their
first local boundary. Their exact old-artifact classification is:

```text
FIRST_FAILURE_BOUNDARY=NOT_DURABLY_IDENTIFIABLE_FROM_OLD_ARTIFACT
DISPATCH_TRUTH=NOT_PROVEN
PROVIDER_RELIABILITY_DENOMINATOR=EXCLUDED
```

The repaired evaluator now records the distinction when source metadata is
available. It reports `PRE_DISPATCH_LOCAL_FAILURE` only for a durable
`dispatchTruth=not_sent` record, and does not infer a provider failure from an
empty response alone.

## NIM binding trace and capability probe

The current selection is explicit in
`config/model-fabric/portfolios/current-compatibility.v1.json`:

```text
provider=nim
model=openai/gpt-oss-20b
occupantId=mfo_nim_openai_gpt_oss_20b_low
bindingId=compat_thought_nim_gpt_oss_20b_json_object_v1
mode=json_object_compatibility
```

The trace through source is:

1. The portfolio selects the compatibility binding.
2. `dispatch-contract.ts` resolves that binding to the compatibility wire
   shape, even though the logical Thought policy is `json_schema`.
3. `nim-adapter.ts` emits
   `response_format={type:"json_object"}` for that binding.
4. `wire-evidence.ts` records `json_object_compatibility`, `json_object`, and
   `providerDeclaredEnforcement=unavailable`.
5. The adapter also contains native branches for
   `nim_response_format_json_schema` and `nim_guided_json`, but the current
   portfolio does not select either branch.
6. The generic NIM profile declares structured JSON capability. It does not
   mechanically prove schema enforcement for this hosted endpoint/model pair.

The binding is therefore selected by explicit portfolio identity, not by live
endpoint capability discovery. The old compatibility binding was not mutated.

The authorized probe used the exact hosted endpoint and exact provider/model:

```text
PROBE_ID=nim-native-binding-probe-e36e6463-90a4-4c87-b6de-2d0d126655bc
TIMESTAMP=2026-09-01T00:13:57.173Z
ENDPOINT=https://integrate.api.nvidia.com/v1/chat/completions
PROVIDER=nim
MODEL=openai/gpt-oss-20b
REQUEST_SCHEMA_DIGEST=sha256:21305e7c7b985158e5c4030faaa5b8769dcd03bbce13268335ab4d99b376857b
```

The deterministic probe schema was an object with
`additionalProperties=false`, required `value`, and
`properties.value.const="probe_ok"`. The prompt requested an adversarial
`not_probe_ok` value. No Ashley or owner-private content was sent.

| Request wire mode | Adapter binding | HTTP | Response | Content JSON syntax | Schema conformance | Enforcement observed | Elapsed | Token usage | Response digest |
|---|---|---:|---|---|---|---|---:|---|---|
| `response_format_json_schema` | `nim_response_format_json_schema` | 200 | yes | fail | fail | false | 1366 ms | prompt 104 / completion 64 | `sha256:101df9b12da49643e3911c8ff27933c9f0a085dd53d836b76c8de931e37cdd1b` |
| `guided_json` | `nim_guided_json` | 200 | yes | fail | fail | false | 1833 ms | prompt 104 / completion 64 | `sha256:c89cd71bc5b9c6c582203b999b40e6084b74c6ca1f667a8c36e6384c5ce68f65` |

Both requests reached the endpoint and returned HTTP 200. The provider
content did not satisfy the adversarial constraint. HTTP acceptance alone was
not treated as native schema support. There was no provider error response and
no retry. The probe made exactly two calls and stopped without a third control
call.

```text
NIM_ENDPOINT_PROBE=COMPLETED_NON_PROMOTABLE_EXACT_HOSTED_ENDPOINT
NIM_NATIVE_SCHEMA_SUPPORT=NOT_ESTABLISHED
PROBE_CALL_COUNT=2
NATIVE_BINDING_CHANGE=NOT_PERFORMED
NATIVE_BINDING_ID=NONE
NATIVE_WIRE_FORMAT=NONE
```

This result proves that native schema enforcement was not established for the
tested hosted endpoint shape. It does not prove
`MODEL_FUNDAMENTALLY_INCAPABLE`.

## Qualification identity repair

The repaired isolated-live path accepts an explicit `--candidate-sha` and
resolves the actual checkout identity from Git. It compares:

```text
expected candidate SHA
actual qualification checkout identity
non-empty qualification release identity, when present
```

The comparison runs before candidate preflight, credential use, or network
dispatch. A stale non-empty `ASHLEY_RELEASE_ID` fails with
`qualification_release_identity_mismatch`. An empty release label is allowed
because credential inheritance and candidate identity are separate concerns.

The normal runtime `currentBuildIdentity()` behavior was not changed. The
isolated qualification path no longer uses a loaded production release label as
candidate truth.

Tests cover:

- stale production release identity rejected before `completeChat` is called;
- exact checkout/candidate identity accepted;
- inherited credentials do not supply candidate identity;
- checkout mismatch fails closed.

```text
IDENTITY_REPAIR=PASS_EXPLICIT_CANDIDATE_AND_GIT_CHECKOUT_BINDING
IDENTITY_FAIL_CLOSED_BEFORE_NETWORK=PASS
```

## W2 observability repair

The qualification case result was extended additively. The historical route
schema identifier remains `ashley.thought.route_qualification.v1`; old evidence
was not rewritten.

The new diagnostics preserve raw byte count and digest while recording:

```text
FIRST_FAILURE_BOUNDARY
CLOSED_SCHEMA_FAILURE_KEYWORD
CLOSED_SCHEMA_FAILURE_INSTANCE_PATH
CLOSED_SCHEMA_FAILURE_SCHEMA_PATH
CLOSED_SCHEMA_FAILURE_BRANCH
ERROR_CODE
DISPATCH_TRUTH
DISPATCH_STAGE
PROVIDER_REQUEST_STARTED
PROVIDER_RESPONSE_RECEIVED
ATTEMPT_ID
```

The evaluator distinguishes pre-dispatch local failure, dispatched/no response,
provider error response, provider content received, local schema rejection, and
strict parser rejection. It records downstream kernel, fencing, authority, and
semantic reachability as `NOT_REACHED` when JSON/schema/strict-parser stages
did not pass.

The provider completion/error paths now retain Model Fabric receipt metadata
needed for these classifications. No raw private Thought response body is
persisted.

```text
W2_OBSERVABILITY_REPAIR=PASS_ADDITIVE_BOUNDARY_AND_ORACLE_DIAGNOSTICS
```

## W3 Stage H wake repair

The Stage H runner now admits the qualification event through the authoritative
wake ledger. It derives occurrence identity, calls `admitWake`, requires a
`created` or `existing` wake with a non-empty durable ID, and passes the
returned `wake.wakeId` to `admitCycle`.

The runner does not fabricate a wake ID, permit wake-less admission, or bypass
the W5 singularity path. Local tests cover wake-required rejection, valid wake
forwarding, and stale/cancelled wake refusal without a cycle call.

No W3 physical candidate qualification was run in this task.

```text
W3_WAKE_REPAIR=PASS_LOCAL_AUTHORITATIVE_WAKE_ADMISSION
WAKE_BYPASS_ADDED=no
```

## W4 barrier source adjudication

The disputed W4 rule was derived from artifact 83 and the complete caller
graph before deciding whether to change `barrier.ts`.

Artifact 83 establishes in §K:

```text
stable -> transitioning -> reconciling -> stable
```

Artifact 83 §N requires a non-stable barrier to remain fail-closed while a
canonical/projection gap is reconciled and requires startup reconciliation
before dispatch. Artifact 83 §P makes transition identity part of idempotent
recovery.

The complete source caller graph is:

- `barrier.ts:252` calls `markReconcilingInTransaction` through the public
  `markAuthorityBarrierReconciling` wrapper.
- `barrier.ts:266` calls it through the existing-transaction wrapper. No
  current production caller of that wrapper was found.
- `memory/forget.ts:1256` calls the public wrapper after a started forget
  transition's canonical commit failure.
- `barrier.ts:285` calls the public wrapper during startup recovery when the
  barrier is already non-stable and pending derived invalidations remain.
- `serve.ts:99` and `core/db.ts:3346` call
  `reconcileAuthorityBarrierOnStartup`.
- `barrier.test.ts` is the test caller and covers the adversarial transitions.

The source-derived relation is:

| Source state | Destination | Legal | `active_transition_id` | Reason |
|---|---|---|---|---|
| `transitioning` | `reconciling` | yes | preserve existing value | recovery after an incomplete transition or forget commit failure |
| `reconciling` | `reconciling` | yes | preserve existing value, including `NULL` | idempotent recovery reapplication with updated reason |
| `stable` | `reconciling` | no | no mutation | a new transition must start through `stable -> transitioning` |
| `transitioning` or `reconciling` | `stable` | separate stabilization operation | clear only at stable boundary | vector/token-checked stabilization |

The current `barrier.ts:227-242` implements exactly this relation. Its SQL
updates only `transitioning` and `reconciling`, does not write
`active_transition_id`, and checks the affected-row count. The existing
`barrier.test.ts:57-88` proves both legal recovery states preserve the active
transition identity and proves the stable-source call is rejected.

Therefore the reviewer concern about the current barrier implementation was
rejected from source evidence. `barrier.ts` was not changed in this pass.

## Legacy Thought closure boundary

The previously closed successor-v021 legacy surface remains closed:

- `parseThoughtStepOutput` is absent from current v021 source.
- `LEGACY_THOUGHT_OUTPUT_SCHEMA` is absent from current v021 source.
- `parseThoughtSemanticOutput` is the live provider-output parser used by
  `cognitive-v021/thought/run.ts` and qualification.
- Successor-branch, predecessor-envelope rejection, kernel-identity rejection,
  exact structured-request, and no-publication tests remain in place.
- No environment variable or parser flag selects the removed v021 parser.

The separate `core/agency/thought.ts` module retains a private JSON extractor
and operational request decoders because actual callers remain in the
separately routed legacy `AshleyCore` runtime and its sandbox/legacy tests
(`runThoughtModel` and continuation call sites at lines 1949 and 2532;
`parseCandidateAuthorshipRequest` and `parseBoundedOperationRequest` have
multiple callers). Those decoders are not imported by the successor-v021
provider-response path and are not the successor Thought schema authority.
The existing `ASHLEY_COGNITIVE_KERNEL=legacy` selector chooses that separate
legacy kernel; it is not a parser fallback or escape hatch inside the successor
v021 path. Removing that separately routed kernel is outside this bounded
qualification repair.

## Files changed by this bounded pass

```text
apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts
apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
apps/agent-service/src/core/cognitive-v021/qualification/types.ts
apps/agent-service/src/core/rollout/capabilities.ts
apps/agent-service/src/core/rollout/qualification-identity.test.ts
scripts/cognitive-v021/f011-stage-h.mjs
scripts/cognitive-v021/f011-stage-h.test.mjs
docs/audits/ashley-mri-phase5-573393c/PHASE5_QUALIFICATION_SUBSTRATE_REPAIR.md
```

No model-fabric configuration, portfolio binding, native adapter branch, W4
barrier implementation, Thought semantic schema, resource policy, provider,
fallback, or production database was changed.

## Verification

Focused verification passed:

```text
3 Vitest files, 17 tests passed
Stage H Node tests: 5 passed
npm run build --prefix apps/agent-service: PASS
git diff --check: PASS
```

The required deterministic full corpus was run:

```text
npm run test --prefix apps/agent-service -- --no-file-parallelism --reporter=dot
```

It completed with:

```text
Test Files 1 failed | 368 passed (369)
Tests 1 failed | 2259 passed | 2 skipped (2262)
Errors 1 error
```

The sole test failure is the untouched
`src/core/attention/attention.test.ts:720` case
`folds the same day twice identically and monthly totals once`. A single-test
rerun reproduced it. The run also reported a Vitest worker
`Timeout calling "onTaskUpdate"` error. The unrelated attention subsystem was
not modified.

## Required state

```text
NIM_ENDPOINT_PROBE=COMPLETED_NON_PROMOTABLE_EXACT_HOSTED_ENDPOINT
NIM_NATIVE_SCHEMA_SUPPORT=NOT_ESTABLISHED
PROBE_CALL_COUNT=2

IDENTITY_REPAIR=PASS_EXPLICIT_CANDIDATE_AND_GIT_CHECKOUT_BINDING
IDENTITY_FAIL_CLOSED_BEFORE_NETWORK=PASS

W2_OBSERVABILITY_REPAIR=PASS_ADDITIVE_BOUNDARY_AND_ORACLE_DIAGNOSTICS
RAW_PROVIDER_CONTENT_PERSISTED=no

W3_WAKE_REPAIR=PASS_LOCAL_AUTHORITATIVE_WAKE_ADMISSION
WAKE_BYPASS_ADDED=no

NATIVE_BINDING_CHANGE=NOT_PERFORMED
NATIVE_BINDING_ID=NONE
NATIVE_WIRE_FORMAT=NONE
SAME_PROVIDER_MODEL=yes

BUILD=PASS
FOCUSED_TESTS=PASS
FULL_CORPUS=FAIL_UNRELATED_ATTENTION_TEST_AND_VITEST_WORKER_ERROR

ARCHITECTURE_REOPEN_REQUIRED=no
THOUGHT_SEMANTICS_CHANGED=no
RESOURCE_POLICY_CHANGED=no
MODEL_CHANGED=no
PROVIDER_CHANGED=no
FALLBACK_CHANGED=no
W9_STARTED=no
PRODUCTION_MUTATION=no
```

## Final classification

```text
QUALIFICATION_REPAIR_STATUS=BOUNDED_SOURCE_REPAIR_COMPLETE_NATIVE_SUPPORT_NOT_ESTABLISHED_FULL_CORPUS_GATE_FAIL
NIM_NATIVE_SCHEMA_SUPPORT=NOT_ESTABLISHED
CURRENT_COMPAT_BINDING_STATUS=NOT_QUALIFIED
NEW_NATIVE_BINDING_STATUS=NOT_CREATED

BUILD_IDENTITY_REPAIRED=PASS
W2_DIAGNOSTICS_REPAIRED=PASS
W3_WAKE_RUNNER_REPAIRED=PASS_LOCAL_ONLY

NEW_CANDIDATE_REQUIRED=yes
READY_FOR_INDEPENDENT_REVIEW=yes
READY_FOR_W2_RERUN=no
READY_FOR_DEPLOY=no

BLOCKER_COUNT=5
BLOCKERS=
1. Current compatibility binding remains W2 NOT_QUALIFIED and no native hosted-endpoint enforcement was established.
2. A new exact candidate and a future W2 qualification run are required; W2 was not rerun in this task.
3. Exact-candidate W3 physical qualification was not performed in this task.
4. The required full corpus has one reproduced unrelated attention test failure and one Vitest worker-update error.
5. The old W2 artifact lacks raw response bodies and dispatch receipt metadata for exact branch/first-boundary reconstruction.

READY_FOR_W2_RERUN=no
READY_FOR_DEPLOY=no
```

No commit, push, deployment, activation, promotion, W2 rerun, W3 physical
qualification, or production mutation was performed.
