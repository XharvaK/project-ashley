# W2 Pipeline MRI

Base evidence:

```text
BASE_CANDIDATE_SHA=9cf777c41e39271c4e2cb2db5ed89503f97ff88f
W2_ROUTE=mistral/mistral-small-2603
W2_REASONING=high
W2_FALLBACK=none
W2_WIRE=native_json_schema/mistral_response_format_json_schema
```

This MRI is source-derived. The historical W2 artifact retained byte counts
and digests, but not provider response bodies. A historical digest is not
treated as semantic evidence.

## Causal graph

The qualification path has two related but distinct paths:

```text
case fixture / live case input
  -> runW0Sequence
     -> runThoughtModel
        -> completeChat
           -> Model Fabric route and attempt binding
           -> attention admission
           -> Mistral adapter request
           -> provider response normalization
        -> parseThoughtSemanticOutput
        -> host materialization into ThoughtStepOutput
  -> gateEvidenceForSequence
     -> transport / dispatch truth
     -> qualification JSON parse
     -> qualification closed-schema oracle
     -> strict parser result
     -> kernel binding
     -> semantic validity
     -> fencing
     -> authority reachability
     -> resource policy
  -> evaluateQualificationCase
     -> firstFailureBoundary
     -> independentFailureCodes
     -> dependentNotReachedGates
     -> verdict
  -> writeRunReport
     -> w2-route-qualification.json
```

The current source before this closure pass projected all absent or failed
downstream gate evidence as `fail`. That projection is not causal. The repair
keeps the execution order above and represents gates that cannot execute as
`NOT_REACHED`.

## Stage contracts

```text
STAGE=case construction
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
SYMBOL=SEMANTIC_CASES; fixtureInput; runFixtureQualification; runLiveQualification
INPUT=run id, selected case id, frozen occupant identity, allowlisted reference turn-1
OUTPUT=ThoughtInput with host-owned cycle/generation/authority/trigger context
OWNER=qualification harness for case selection; host context for control fields
CAN_FAIL=candidate_route_mismatch; candidate_policy_mismatch; candidate_preflight_failed
FAILURE_CODE=preflight error code or no case
DEPENDENT_ON=current portfolio, policy, binding, candidate/build identity
```

```text
STAGE=provider request construction and route resolution
SOURCE_FILE=apps/agent-service/src/mistral-client.ts
SYMBOL=completeChat; resolveAttemptDispatchContract; singleDispatch
INPUT=Thought messages, CompletionOptions, trusted Thought invocation context, current policy
OUTPUT=one Model Fabric-bound provider attempt or a typed dispatch/admission failure
OWNER=Model Fabric and Attention own route, attempt identity, admission, and dispatch truth
CAN_FAIL=route/policy mismatch; admission budget; missing credential; provider dispatch; outcome unknown
FAILURE_CODE=metadata receipt/failure stage and dispatchTruth; no provider reliability claim when not_sent
DEPENDENT_ON=preflight route, frozen candidate identity, attention admission
```

```text
STAGE=native JSON Schema construction
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts
SYMBOL=THOUGHT_OUTPUT_SCHEMA; thoughtOutputStructuredRequest
INPUT=the frozen successor Thought semantic contract
OUTPUT=closed native schema and schema fingerprint in TrustedStructuredOutputControl
OWNER=Thought semantic contract; Model Fabric binds the trusted schema to the attempt
CAN_FAIL=unknown field; wrong kind; missing required field; type/enum/pattern/minLength/maxItems violation; schema drift
FAILURE_CODE=provider/schema diagnostics; qualification oracle codes such as oneOf_mismatch or unknown_field
DEPENDENT_ON=trusted dispatch binding and exact schema fingerprint
```

```text
STAGE=Mistral native request construction
SOURCE_FILE=apps/agent-service/src/core/model-routing/adapters/mistral-adapter.ts
SYMBOL=buildNativeChatBody; createMistralAdapter dispatch path
INPUT=messages, max token limit, temperature, native schema control, trusted reasoning control
OUTPUT=POST body with response_format.type=json_schema, strict=true, schema, and reasoning_effort=high
OWNER=Mistral adapter for wire mechanics; Thought remains semantic owner
CAN_FAIL=unsupported binding; reasoning control mismatch; adapter/network/provider error
FAILURE_CODE=structured_output_native_unsupported; mistral_reasoning_control_mismatch; mapped provider error
DEPENDENT_ON=resolved native binding and trusted dispatch contract
```

```text
STAGE=provider response and attempt receipt
SOURCE_FILE=apps/agent-service/src/core/model-routing/adapters/mistral-adapter.ts; apps/agent-service/src/mistral-client.ts
SYMBOL=normalizeCompletion; singleDispatch
INPUT=Mistral HTTP response and the bound attempt
OUTPUT=ProviderCompletion plus responseDiagnostics, wire evidence, and response_received or failure truth
OWNER=adapter for response shape; Model Fabric/Attention for attempt receipt
CAN_FAIL=HTTP/provider error; missing or malformed message content; outcome unknown
FAILURE_CODE=credential_invalid; quota_exhausted; rate_limited; mistral_unavailable; extraction_failure; sent_outcome_unknown
DEPENDENT_ON=attempt allocation and adapter dispatch
```

```text
STAGE=chunk normalization and thinking/content separation
SOURCE_FILE=apps/agent-service/src/core/model-routing/adapters/mistral-adapter.ts
SYMBOL=extractContent; extractTextDelta; normalizeCompletion
INPUT=message.content string, null, unsupported container, or array of typed chunks
OUTPUT=normalized text plus bounded container/chunk/count/finish/extraction diagnostics
OWNER=Mistral adapter; thinking chunks are metadata and never semantic input
CAN_FAIL=missing_content; unsupported_container; malformed_chunk; unknown_chunk_type
FAILURE_CODE=ProviderResponseDiagnostics.extractionFailure
DEPENDENT_ON=provider response body
```

```text
STAGE=normalized semantic text extraction
SOURCE_FILE=apps/agent-service/src/core/model-routing/adapters/mistral-adapter.ts; apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
SYMBOL=normalizeCompletion.text; CompletionCapture.rawContent
INPUT=adapter-normalized text only
OUTPUT=rawContent held in memory for qualification evaluation; bounded failed-case evidence after repair
OWNER=adapter owns normalization; qualification owns bounded evidence persistence
CAN_FAIL=empty content; extraction failure; capture-size ceiling
FAILURE_CODE=empty_raw_content; diagnostic_capture_too_large
DEPENDENT_ON=successful response normalization
```

```text
STAGE=closed-schema validation
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
SYMBOL=validateThoughtOutputSchema; validateQualificationSchema; validateSchemaNode
INPUT=JSON.parse(normalized semantic text), exact THOUGHT_OUTPUT_SCHEMA
OUTPUT=OracleResult with ok or keyword/instance/schema path/branch diagnostic
OWNER=qualification oracle for W2 evidence; native schema remains provider-facing contract
CAN_FAIL=invalid JSON before this stage; oneOf/type/const/required/unknown/minLength/pattern/items/maxItems mismatch
FAILURE_CODE=invalid_json; closed_schema_rejected; oracle-specific structural code
DEPENDENT_ON=non-empty normalized text and successful JSON syntax
```

```text
STAGE=strict semantic parser
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/thought/parse.ts
SYMBOL=parseThoughtSemanticOutput
INPUT=the exact normalized semantic text and runtime allowlisted references
OUTPUT=ThoughtSemanticOutput or a typed parse failure
OWNER=Thought; sole live provider-output semantic parser
CAN_FAIL=root/branch shape; unknown fields; invalid enums/types; unregistered operation; invalid alias; non-allowlisted reference
FAILURE_CODE=invalid_json; root_not_object; wrong_kind; unknown_field; required_field_missing; wrong_type; invalid_enum; reference_not_allowlisted; alias_invalid; operation_not_registered
DEPENDENT_ON=JSON syntax and the live allowlisted reference context
```

```text
STAGE=kernel binding and host materialization
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/thought/run.ts; apps/agent-service/src/core/cognitive-v021/thought/kernel-envelope.ts; qualification/thought-capability-qualification.ts
SYMBOL=runThoughtModel; materializeSemanticSettlement; validateKernelEnvelope; kernelBindingDiagnostic
INPUT=parser-valid ThoughtSemanticOutput, host ThoughtInput, captured attempt identity
OUTPUT=ThoughtInvocation with a host-bound kernel envelope and host-owned output fields
OWNER=Kernel; model cannot author cycle, generation, request, occupant, authority, or route identity
CAN_FAIL=missing/mismatched attempt; invalid envelope; wrong cycle/generation/authority/occupant/provider/model
FAILURE_CODE=kernel_binding_missing; kernelBinding_failed; thought_attempt_identity_mismatch class
DEPENDENT_ON=strict parser success and a captured provider attempt
```

```text
STAGE=semantic validity
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts; apps/agent-service/src/core/cognitive-v021/thought/parse.ts
SYMBOL=plausibleSemanticOutput; gateEvidenceForSequence; evaluateQualificationCase
INPUT=parser-valid output, expected branch, qualification semantic gate evidence
OUTPUT=PASS only for the expected branch and minimum non-empty semantic obligations
OWNER=Thought semantic contract plus deterministic qualification semantic checks
CAN_FAIL=wrong expected branch; empty required semantic purpose/outcome/explanation; provider semantic gate failure
FAILURE_CODE=semantic_branch_mismatch; semantic_invalid; semantic_evidence_missing
DEPENDENT_ON=strict parser success; it does not execute after parser rejection
```

```text
STAGE=evidence allowlist validation
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/thought/parse.ts
SYMBOL=existingRef; semanticRef; refArray; validEvidenceUse; parseOperationSemantic
INPUT=provider-authored references and the host-supplied allowlist
OUTPUT=accepted semantic reference fields or parser rejection
OWNER=Thought parser enforces the allowlist; host supplies the allowlist
CAN_FAIL=unknown existing reference; invalid semantic reference; invalid source/observation/retrieval/open-intent reference
FAILURE_CODE=reference_not_allowlisted; wrong_type
DEPENDENT_ON=parser branch and host reference context
```

```text
STAGE=fencing qualification
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts; apps/agent-service/src/core/cognitive-v021/settlement/validate.ts
SYMBOL=fencingDiagnostic; validateThoughtSettlementDraft; outputBaseMatches
INPUT=host cycle/generation/occupant/authority, request id, kernel-bound output, settlement draft or operation proposal
OUTPUT=host fence PASS/FAIL
OWNER=Kernel/host fencing; model supplies only semantic content and operation intent
CAN_FAIL=base identity mismatch; settlement draft identity/published-field/commitment/operation conflict; proposal identity mismatch
FAILURE_CODE=fencing_failed; validator-specific identity/conflict/stale codes
DEPENDENT_ON=kernel binding and semantic validity; no fencing execution after those fail
```

```text
STAGE=authority reachability qualification
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts; apps/agent-service/src/core/cognitive-v021/authority/packs.ts; apps/agent-service/src/core/cognitive-v021/authority/check.ts
SYMBOL=authorityDiagnostic; loadAuthorityPacks; checkAuthority; hasAuthorityBarrier
INPUT=host authority DB/sidecar, authority epoch/currentness, deterministic packs, kernel-bound output
OUTPUT=deterministic Authority verdict
OWNER=Authority; currentness and authority are host-owned
CAN_FAIL=authority epoch/currentness mismatch; withdrawal; unsupported currentness; effect receipt/revision budget; proposal refusal
FAILURE_CODE=authorityReachability_failed; authority-specific codes
DEPENDENT_ON=fencing PASS and the correct production-equivalent authority DB context
```

```text
STAGE=resource policy
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
SYMBOL=gateEvidenceForSequence; evaluateQualificationCase
INPUT=elapsed time, completion token count, structural attempt count, configured limits
OUTPUT=PASS/FAIL/NOT_REACHED resource result
OWNER=qualification/resource policy; provider does not set the limit
CAN_FAIL=30 second deadline; 4096 output-token ceiling; one initial plus two structural attempts; missing usage
FAILURE_CODE=resource_policy_mismatch
DEPENDENT_ON=an attempt/capture exists; independent of semantic downstream gates
```

```text
STAGE=first-boundary and verdict construction
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
SYMBOL=firstFailureBoundaryForCase; evaluateQualificationCase; routeResult
INPUT=all executed gate states, dispatch truth, raw byte count, bounded diagnostics
OUTPUT=firstFailureBoundary, independentFailureCodes, dependentNotReachedGates, case verdict, route verdict
OWNER=qualification projection; it must not invent downstream failures
CAN_FAIL=any executed gate or transport/resource failure; OUTCOME_UNKNOWN remains distinct
FAILURE_CODE=boundary-specific and independent gate codes only
DEPENDENT_ON=causal gate states and dispatch evidence
```

```text
STAGE=artifact serialization
SOURCE_FILE=apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
SYMBOL=writeRunReport; writeQualificationResult
INPUT=ThoughtRouteQualification and, only for a failed case, bounded qualification evidence
OUTPUT=w2-route-qualification.json and optional control artifact
OWNER=qualification evidence plane; no secret or hidden reasoning body persistence
CAN_FAIL=isolated output validation; file/lock/write error; evidence-size ceiling
FAILURE_CODE=qualification_output_must_be_isolated; qualification_run_lock_unavailable; diagnostic_capture_too_large
DEPENDENT_ON=completed case evaluation and isolated output directory
```

## Structural correction audit

The frozen W2 plan permits one initial Thought attempt plus at most two bounded
structural corrections. The production path in
`apps/agent-service/src/core/cognitive-v021/thought/run.ts` records a malformed
invocation, sends source-defined structural feedback, reuses the same absolute
Thought deadline, and retries with the bounded retry output limit. It retries
only malformed output and creates a fresh provider invocation identity.

Before this pass, `runW0Sequence` iterated its supplied `rawHints` but did not
stop after a successful invocation and the live path supplied `[null]`. It
therefore did not exercise the production correction path and could not
qualify a candidate according to the frozen bounded W2 contract.

```text
W2_STRUCTURAL_CORRECTION_EXPECTATION=PRODUCTION_CORRECTION_PATH_REQUIRED
SOURCE=docs/audits/ashley-mri-phase5-573393c/81_W2_CURRENT_ROUTE_REQUALIFICATION_PLAN.md §C, §J; apps/agent-service/src/core/cognitive-v021/thought/run.ts runCognitiveCycle malformed branch
CLASSIFICATION=QUALIFICATION_HARNESS_DEFECT
```

The repair must preserve the exact parser, feedback, retry ceiling, deadline,
identity, and no-fallback rules. It must not add retries after a parser-valid
semantic failure or use correction to relax the contract.

## Settlement reachability finding

The old qualification projection called `fencingPass` and `authorityPass`
independently. In particular, it could report both as `fail` even when the
semantic parser and kernel binding passed. The production source orders the
settlement path as:

```text
parse/materialize
  -> validateThoughtSettlementDraft (fencing)
  -> loadAuthorityPacks + checkAuthority (authority)
  -> current-generation/fidelity/publication checks
```

The old qualification `authorityPass` loaded `loadAuthorityPacks(db)` from its
single argument. In the live runner that argument was the isolated cognitive
sidecar, while production loads sidecar packs with the nuclear attention DB as
`authorityDb` for currentness/barrier checks. The qualification helper
therefore could not be treated as a production-equivalent authority context.
This is a qualification-harness context defect, not evidence that Mistral
controlled the host barrier.

The corrected evidence path must evaluate authority only after fencing passes
and must pass the isolated nuclear attention DB as the production-equivalent
currentness authority DB where a barrier exists. Exact provider-controlled
settlement fields remain unknown for the historical artifact because its body
was not retained.

## Frozen W4 barrier proof used by this MRI

Artifact 83 and the complete current caller graph prove:

```text
stable -> transitioning -> reconciling -> stable
transitioning -> reconciling is legal
reconciling -> reconciling is legal and idempotent
stable -> reconciling is rejected
active_transition_id is preserved during reconciling
active_transition_id is cleared only by stabilize
```

Source proof:

- `apps/agent-service/src/core/cognitive-v021/authority/barrier.ts` guards
  `markReconcilingInTransaction` against `stable`, updates only state, reason,
  and timestamp, and accepts `transitioning` or `reconciling`.
- `memory/forget.ts` marks a started transition reconciling after a canonical
  commit failure.
- `reconcileAuthorityBarrierOnStartup` marks a non-stable pending projection
  reconciling when the projection is not ready, and otherwise stabilizes it.
- `docs/audits/ashley-mri-phase5-573393c/83_W4_R1_SEMANTIC_AUTHORITY_DERIVED_RETRACTION_MECHANICAL_PLAN.md`
  §§K, N, and P require the non-stable recovery state and idempotent transition
  identity.
- Existing barrier tests prove the legal transitions, rejection, and token
  preservation. No `barrier.ts` change is warranted by this investigation.

## Historical evidence boundaries

```text
CURRENT_MISTRAL_FAILURE_BODIES=NOT_DURABLY_RETAINED
W2_RAW_FAILURE_PAYLOAD_RECOVERABLE_FROM_EXISTING_ARTIFACT=no
CURRENT_MISTRAL_FAILURE_CAUSE=not mechanically identifiable from digest-only evidence
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
```

The two historical NIM abstain rows with zero `providerAttemptIds`, seven-to-
nine millisecond elapsed time, empty content, and no wire/capability metadata
are not counted as provider failures. Their first pre-dispatch boundary is
`UNKNOWN` because the old artifact omitted the error metadata and the source
used only a successful completion attempt identity when populating that field.

## D3 and complete-W2 evidence

The exact candidate `df10fbce919ad6de370cce2984f0126bf8314c7a` was detached in
an isolated Mint checkout. The process-only qualification environment supplied
the same candidate as `ASHLEY_RELEASE_ID` and set `MISTRAL_REASONING_EFFORT=high`;
the Mint production checkout and its persistent environment were not changed.

The bounded live diagnostic made one real primary-credential Mistral request
for each of `settlement`, `effect_intent`, and `abstain`. All three cases used
`native_json_schema` and passed every executed gate through resource policy.
This proves that the corrected qualification path reaches the real adapter and
endpoint with the native schema binding. `providerDeclaredEnforcement` remained
`unavailable`; that response metadata does not override the observed request
wire evidence.

The complete W2 run made 12 case evaluations and 20 provider attempts. The
additional eight attempts were source-defined structural corrections after
malformed responses. All 12 provider transports, JSON parses, and closed-schema
checks passed. Eleven final attempts passed the strict parser. Ten cases passed
all downstream gates. The two non-qualified cases stopped at their first
independent boundary and recorded dependent gates as `NOT_REACHED`.

The captured settlement failure was parser-valid and kernel-bound, but its
draft speech omitted `speech.surfaceDraft`. The qualification semantic check
therefore rejected it before fencing and Authority. The captured effect
failure passed the static schema but used `existingRefs=["qualification-conversation:turn-1"]`
while the host allowlist contained `turn-1`; the strict parser rejected that
context-dependent reference. The static schema cannot encode a runtime
allowlist. These are provider semantic-output violations, not evidence of
fundamental model incapability or a native-wire failure.

Both captured failures replayed offline through normalization, schema, parser,
kernel, semantic, fencing, Authority, and verdict projection with zero provider
calls and reproduced their first failure boundaries exactly. The original
digest-only failure bodies remain unrecoverable; the new full-W2 artifact does
contain bounded normalized semantic text for its failed cases.
