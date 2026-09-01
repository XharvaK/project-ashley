# W2 First-Boundary Root Cause Report

## Status before the bounded live diagnostic

```text
BASE_CANDIDATE_SHA=9cf777c41e39271c4e2cb2db5ed89503f97ff88f
HISTORICAL_W2=NOT_QUALIFIED
W2_RAW_FAILURE_PAYLOAD_RECOVERABLE_FROM_EXISTING_ARTIFACT=no
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
PRODUCTION_MUTATION=no
```

The original Mistral artifact has no raw response body or normalized semantic
text. The following historical classifications therefore distinguish proven
qualification machinery defects from unresolved provider-content causes.

## Source findings

### 1. Strict-parser downstream projection

```text
CASE=effect_intent sample 0
HISTORICAL_FIRST_BOUNDARY=STRICT_PARSER_REJECTION
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=no necessarily applicable mismatch proven
NEW_CAPTURE_AVAILABLE=no
OFFLINE_REPLAY_RESULT=NOT_AVAILABLE
ROOT_CAUSE=QUALIFICATION_HARNESS_DEFECT
OWNING_LAYER=W2 result projection
SOURCE_PROOF=The old evaluateQualificationCase gateStatus mapped missing or failed downstream evidence to fail; gateEvidenceForSequence evaluated downstream predicates independently even when the parser failed.
TEST_PROOF=Focused qualification regression passes: parser failure leaves kernelBinding, semanticValidity, fencing, and authorityReachability as NOT_REACHED and emits no dependent failure codes.
FIX=Tri-state gate model with firstFailureBoundary, independentFailureCodes, dependentNotReachedGates, and bounded failure evidence.
WHY_THIS_IS_NOT_WHACK_A_MOLE=The same causal projection affected every parser-rejected case and is repaired at the common result boundary.
```

```text
CASE=abstain sample 1
HISTORICAL_FIRST_BOUNDARY=STRICT_PARSER_REJECTION
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=no necessarily applicable mismatch proven
NEW_CAPTURE_AVAILABLE=no
OFFLINE_REPLAY_RESULT=NOT_AVAILABLE
ROOT_CAUSE=QUALIFICATION_HARNESS_DEFECT
OWNING_LAYER=W2 result projection
SOURCE_PROOF=The historical artifact’s strict-parser failure was accompanied by synthetic downstream fail values; source shows those values were not proof of executed gates.
TEST_PROOF=The same focused tri-state regression covers every parser-rejected branch without projecting dependent failures.
FIX=Common tri-state/cause projection repair; no parser relaxation.
WHY_THIS_IS_NOT_WHACK_A_MOLE=It changes one evaluator contract used by all branches and all future W2 runs.
```

### 2. Settlement reachability projection and context

```text
CASE=settlement sample 0
HISTORICAL_FIRST_BOUNDARY=PROVIDER_CONTENT_RECEIVED (historical projection; independent gate boundary requires re-evaluation)
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=Production ordering is fencing before Authority; old W2 evaluated both independently and passed sidecar as the only Authority DB.
NEW_CAPTURE_AVAILABLE=no
OFFLINE_REPLAY_RESULT=NOT_AVAILABLE
ROOT_CAUSE=QUALIFICATION_HARNESS_DEFECT pending bounded live confirmation of provider-controlled fields
OWNING_LAYER=W2 reachability evaluator/context
SOURCE_PROOF=runCognitiveCycle validates the host-bound settlement draft before checkAuthority; qualification authorityPass loaded packs without the isolated nuclear attention DB used by production for currentness/barrier binding.
TEST_PROOF=Focused qualification regression proves fencing failure makes authority NOT_REACHED; the adjacent run and barrier suites pass with the production-equivalent authority DB path.
FIX=Evaluate causal order and load Authority packs with the isolated nuclear DB as authorityDb when a barrier exists.
WHY_THIS_IS_NOT_WHACK_A_MOLE=The repair follows the shared host-owned dependency graph and does not alter a model branch or tolerate a settlement.
```

```text
CASE=settlement sample 2
HISTORICAL_FIRST_BOUNDARY=PROVIDER_CONTENT_RECEIVED (historical projection)
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=Semantic failure must prevent dependent fencing and Authority evaluation; old artifact recorded all three as fail.
NEW_CAPTURE_AVAILABLE=no
OFFLINE_REPLAY_RESULT=NOT_AVAILABLE
ROOT_CAUSE=QUALIFICATION_HARNESS_DEFECT for the dependent-gate projection; provider semantic cause UNKNOWN
OWNING_LAYER=W2 result projection; provider content cause remains unresolved
SOURCE_PROOF=The source can establish parser/semantic validity before fencing, and the production settlement path fences before Authority. The old evaluator did not encode those dependencies.
TEST_PROOF=Focused qualification regression proves semantic failure yields fencing and Authority NOT_REACHED and no dependent failure codes.
FIX=Tri-state causal evaluation; preserve the semantic contract.
WHY_THIS_IS_NOT_WHACK_A_MOLE=One dependency repair handles every semantic failure and prevents false multi-boundary attribution.
```

### 3. Historical zero-attempt NIM abstain rows

```text
CASE=historical NIM abstain sample 1
HISTORICAL_FIRST_BOUNDARY=UNKNOWN
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=Old artifact omitted dispatch error metadata and used successful completion identity as the only providerAttemptIds source.
NEW_CAPTURE_AVAILABLE=no
OFFLINE_REPLAY_RESULT=NOT_AVAILABLE
ROOT_CAUSE=UNKNOWN; qualification observability limitation
OWNING_LAYER=historical W2 evidence capture
SOURCE_PROOF=The old artifact has invocationIds but no attempt IDs, wire facts, capability fingerprint, error code, dispatch stage, or diagnostics. Source catch handling retained only a generic error/outcomeUnknown projection.
TEST_PROOF=Focused qualification regression proves pre-dispatch errors preserve dispatchTruth, dispatchStage, error code, and no provider-reliability attribution.
FIX=Bounded failure evidence capture; do not count this row as a NIM provider failure.
WHY_THIS_IS_NOT_WHACK_A_MOLE=The correct repair is a common first-boundary evidence contract, not an inference for one sample.
```

```text
CASE=historical NIM abstain sample 2
HISTORICAL_FIRST_BOUNDARY=UNKNOWN
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=Same as historical NIM abstain sample 1.
NEW_CAPTURE_AVAILABLE=no
OFFLINE_REPLAY_RESULT=NOT_AVAILABLE
ROOT_CAUSE=UNKNOWN; qualification observability limitation
OWNING_LAYER=historical W2 evidence capture
SOURCE_PROOF=Zero providerAttemptIds and seven-to-nine millisecond elapsed time do not mechanically prove that Model Fabric did not allocate an attempt; the old artifact did not persist the receipt truth needed to decide.
TEST_PROOF=The same focused regression uses explicit not_sent receipt truth; the historical NIM rows remain UNKNOWN because their old artifact omitted that field.
FIX=Persist dispatch/attempt metadata in the qualification-only evidence package.
WHY_THIS_IS_NOT_WHACK_A_MOLE=Both rows are handled by one evidence contract and remain excluded from provider reliability.
```

## Current root-cause boundary

```text
W2_TRI_STATE_PROJECTION=PROVEN QUALIFICATION_HARNESS_DEFECT
W2_STRUCTURAL_CORRECTION_DIVERGENCE=PROVEN QUALIFICATION_HARNESS_DEFECT
W2_AUTHORITY_CONTEXT_DIVERGENCE=PROVEN QUALIFICATION_HARNESS_DEFECT
HISTORICAL_PROVIDER_PARSER_CAUSE=UNKNOWN because bodies were not retained
HISTORICAL_SETTLEMENT_MODEL_FIELD_CAUSE=UNKNOWN because body was not retained
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
```

The bounded live diagnostic is permitted only after the tri-state capture and
offline replay tests pass. It must use the frozen Mistral Small primary/high/
native/no-fallback route and may not change prompts or routing. A newly
captured failure must be replayed through normalization, schema, parser,
kernel, semantic, fencing, and Authority before it is assigned to the model.

## Final D3 and full-W2 adjudication

The exact candidate `df10fbce919ad6de370cce2984f0126bf8314c7a` was qualified in
an isolated Mint checkout. A process-only `ASHLEY_RELEASE_ID` override matched
the detached candidate, and a process-only `MISTRAL_REASONING_EFFORT=high`
override selected the frozen reasoning value. No persistent Mint environment,
active production checkout, service, deployment, or activation was changed.

The first diagnostic invocation stopped before dispatch because Mint's
inherited non-empty release label was stale. Its artifact records
`qualification_release_identity_mismatch`, `NOT_RUN`, zero cases, and zero
provider attempts. This was a local qualification preflight boundary, not a
provider failure. The corrected process-only identity allowed the bounded
diagnostic to make three real primary-credential requests. All three passed
the native schema and every downstream gate.

The complete requalification evaluated 12 cases using 20 provider attempts.
The eight additional attempts were bounded production structural corrections.
All 12 transports, JSON parses, closed-schema checks, and resource-policy
checks passed. Ten cases passed the full qualification path. Two cases were
not qualified:

~~~text
settlement sample 0
  firstFailureBoundary=SEMANTIC_VALIDITY_REJECTION
  independentFailureCodes=semantic_invalid
  dependentNotReachedGates=fencing,authorityReachability
  captured cause=the provider emitted speech.mode=draft without a non-empty speech.surfaceDraft

effect_intent sample 0
  firstFailureBoundary=STRICT_PARSER_REJECTION
  independentFailureCodes=PROVIDER_ACCEPTED_PARSER_REJECTED
  dependentNotReachedGates=kernelBinding,semanticValidity,fencing,authorityReachability
  captured cause=existingRefs contained qualification-conversation:turn-1 while the host allowlist contained turn-1
~~~

Both captured failures replayed offline with zero provider calls. Normalization
matched, and each replay reproduced the same first failure boundary and the
same dependent `NOT_REACHED` gates.

### Required case adjudication

~~~text
CASE=effect_intent sample 0
HISTORICAL_FIRST_BOUNDARY=STRICT_PARSER_REJECTION
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=The static schema accepts a string array; the parser intentionally applies the runtime evidence allowlist.
NEW_CAPTURE_AVAILABLE=yes
OFFLINE_REPLAY_RESULT=PASS; same first boundary STRICT_PARSER_REJECTION
ROOT_CAUSE=MODEL_SEMANTIC_CONTRACT_VIOLATION
OWNING_LAYER=Thought provider semantic output, rejected by the strict parser's host-context allowlist
SOURCE_PROOF=parseOperationSemantic requires every existingRefs value to be in the host allowlist; the captured value was qualification-conversation:turn-1 and the allowlist was turn-1.
TEST_PROOF=The offline replay and strict-parser gate regression reproduce the parser boundary without downstream gate failures.
FIX=No parser relaxation. Preserve the candidate as NOT_QUALIFIED and retain the captured normalized payload.
WHY_THIS_IS_NOT_WHACK_A_MOLE=The failure is a deterministic context rule at the shared parser boundary; no branch-specific tolerance was added.

CASE=abstain sample 1
HISTORICAL_FIRST_BOUNDARY=STRICT_PARSER_REJECTION
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=No necessarily applicable structural schema/parser mismatch was proven.
NEW_CAPTURE_AVAILABLE=no; the bounded abstain diagnostic and all three new abstain samples passed.
OFFLINE_REPLAY_RESULT=NOT_AVAILABLE for the historical body
ROOT_CAUSE=UNKNOWN
OWNING_LAYER=UNKNOWN; historical digest-only evidence is insufficient
SOURCE_PROOF=The historical artifact retained no normalized body or parser diagnostic.
TEST_PROOF=Tri-state, bounded-capture, and replay tests pass; they do not identify an absent historical body.
FIX=No inference and no rerun for body recovery.
WHY_THIS_IS_NOT_WHACK_A_MOLE=The case remains explicitly unknown rather than being mapped to an unrelated new failure.

CASE=settlement sample 0
HISTORICAL_FIRST_BOUNDARY=NOT_RELIABLE_HISTORICAL_FENCING_AUTHORITY_PROJECTION
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=The old evaluator evaluated fencing and Authority with non-production-equivalent context; dependent gate projection was not causal.
NEW_CAPTURE_AVAILABLE=yes; new sample 0 failed earlier at semantic validity and did not reproduce the historical reachability pair.
OFFLINE_REPLAY_RESULT=PASS for the new semantic failure; historical body unavailable
ROOT_CAUSE=QUALIFICATION_HARNESS_DEFECT_REPAIRED; historical provider-controlled cause UNKNOWN
OWNING_LAYER=W2 reachability context and causal projection
SOURCE_PROOF=Production-equivalent Authority DB binding and fencing-before-Authority ordering are now used; a semantic failure leaves both downstream gates NOT_REACHED.
TEST_PROOF=Focused reachability tests, the bounded live diagnostic, and the new failure replay pass.
FIX=Use the isolated nuclear attention DB for the Authority barrier context and preserve causal gate ordering.
WHY_THIS_IS_NOT_WHACK_A_MOLE=The repair applies to the shared host-owned reachability graph and does not tolerate a provider settlement.

CASE=settlement sample 2
HISTORICAL_FIRST_BOUNDARY=NOT_RELIABLE_HISTORICAL_SEMANTIC_FENCING_AUTHORITY_PROJECTION
HISTORICAL_BODY_AVAILABLE=no
STATIC_CONTRACT_FINDING=The historical semantic failure could be independent; its recorded fencing and Authority failures were dependent projections and cannot be trusted.
NEW_CAPTURE_AVAILABLE=no for sample 2; the new sample 2 passed.
OFFLINE_REPLAY_RESULT=NOT_AVAILABLE for the historical body
ROOT_CAUSE=UNKNOWN for the historical provider payload; current semantic failure class is separately captured on settlement sample 0.
OWNING_LAYER=UNKNOWN historically; W2 projection defect repaired
SOURCE_PROOF=The source now stops at the first semantic failure and records fencing and Authority as NOT_REACHED.
TEST_PROOF=Tri-state and offline replay regressions pass.
FIX=No historical payload inference and no parser/schema weakening.
WHY_THIS_IS_NOT_WHACK_A_MOLE=The historical case remains unknown while the common projection defect is repaired once.
~~~

### Current contract conclusion

The native binding is no longer the observed failure boundary. The bounded
diagnostic and the full run show `native_json_schema` reaching Mistral and
passing the static schema for every case. `providerDeclaredEnforcement` is
`unavailable`, but that metadata does not negate the adapter's native request
evidence. The remaining failures are provider semantic-output violations under
the frozen parser/semantic contract. They do not prove that
`mistral-small-2603` is fundamentally incapable of the successor Thought
contract.

The frozen result remains:

~~~text
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
THOUGHT_CONTRACT_QUALIFIED=no
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
READY_FOR_W3_STAGE_H=no
PRODUCTION_MUTATION=no
~~~
