# Phase 5 W2 Remaining Failure Causal Closure

## Closure status

This report closes the approved remaining W2 causal investigation after the
bounded structural-correction repair, the effect-intent sample-1 analysis, the
historical settlement witness analysis, and one exact-candidate post-repair
live W2 run.

The prior causal closure remains accepted. This report does not reopen its
purpose or replace its findings.

~~~text
W2_REMAINING_FAILURE_CLOSURE_STATUS=COMPLETE
BASE_CANDIDATE_SHA=51351f86a9e0a930ce58f4b0e59c487d5eaea300
NEW_CANDIDATE_SHA=befe6a2d219c23d44082b1b01a8c9df43ac154de
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
THOUGHT_CONTRACT_QUALIFIED=no
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
READY_FOR_W3_STAGE_H=no
PRODUCTION_MUTATION=no
DEPLOYMENT_PERFORMED=no
W9_STARTED=no
~~~

The source candidate is the exact pushed commit
befe6a2d219c23d44082b1b01a8c9df43ac154de on
codex/phase5-w2-first-boundary-diagnostic. The report and qualification
artifact are evidence produced after that source candidate was frozen. They do
not change the frozen source candidate identity.

## Evidence identities and causal boundaries

~~~text
BASE_CANDIDATE_SHA=51351f86a9e0a930ce58f4b0e59c487d5eaea300
SOURCE_CANDIDATE_SHA=befe6a2d219c23d44082b1b01a8c9df43ac154de
SOURCE_BRANCH=codex/phase5-w2-first-boundary-diagnostic
SOURCE_REMOTE_MATCHED=yes
PRODUCTION_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
PRODUCTION_CHECKOUT_TOUCHED=no

CURRENT_W2_ARTIFACT=work/phase5-w2-full-diagnostic-befe6a2d219c23d44082b1b01a8c9df43ac154de/w2-route-qualification.json
CURRENT_W2_ARTIFACT_SHA256=sha256:9aa1c0ba41e5e1c45625a0cd26d9f935c597b1540e3c7cf443ff95e451898e6d
CURRENT_W2_RUN_ID=w2-20260901T115612025Z-733197a0-c366-4c5a-a92c-4885deea2bb6
CURRENT_W2_ENVIRONMENT=isolated_live
CURRENT_W2_CASES=12
CURRENT_W2_PROVIDER_ATTEMPTS=13
CURRENT_W2_CASE_VERDICTS=10 PASS / 2 NOT_QUALIFIED
CURRENT_W2_VERDICT=NOT_QUALIFIED

CURRENT_W2_PROVIDER=mistral
CURRENT_W2_MODEL=mistral-small-2603
CURRENT_W2_REASONING=high
CURRENT_W2_WIRE_MODE=native_json_schema
CURRENT_W2_WIRE_FORMAT=mistral_response_format_json_schema
CURRENT_W2_WIRE_BINDING=compat_thought_mistral_small_2603_native_json_schema_v2
CURRENT_W2_PROVIDER_DECLARED_ENFORCEMENT=unavailable
CURRENT_W2_CAPABILITY_FINGERPRINT=sha256:bec0ffdf9e6d4ee3c0db7af4fb6a344350e4257aaab7307b5f25eb187831688c
CURRENT_W2_BUILD_IDENTITY=befe6a2d219c23d44082b1b01a8c9df43ac154de
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
~~~

The artifact was copied from the isolated Mint output directory without
normalization. Its SHA-256 matched the Mint-side SHA-256 exactly. The artifact
retains normalized semantic failure text, byte counts, digests, provider
attempt identities, correction packets, and gate diagnostics. It does not
retain raw provider response bodies.

The two current failing rows are:

| Case | Current first boundary | Current provider evidence | Current independent failure | Dependent gates |
|---|---|---|---|---|
| observation_intent sample 0 | SEMANTIC_VALIDITY_REJECTION | one real provider attempt; JSON, closed schema, strict parser, Kernel, and resource policy PASS | semantic_branch_mismatch, semantic_invalid; retained normalized body has kind=settlement | fencing, authorityReachability = NOT_REACHED |
| effect_intent sample 2 | SEMANTIC_VALIDITY_REJECTION | two real provider attempts; JSON, closed schema, strict parser, Kernel, and resource policy PASS | semantic_branch_mismatch, semantic_invalid; retained final normalized body has kind=settlement | fencing, authorityReachability = NOT_REACHED |

The current run therefore demonstrates provider semantic non-conformance under
the frozen contract. It does not demonstrate a transport failure, a native
wire-binding failure, a parser acceptance defect, or a model fundamental
incapability.

## Part 1 — Structural-correction sufficiency

### Frozen contract and source path

The frozen W2 contract requires strict parser rejection, host-owned reference
allowlisting, bounded structural corrections in the same semantic pass, and no
coercion or semantic replacement. The governing documents are:

~~~text
docs/audits/ashley-mri-phase5-573393c/77_PHASE5_GOVERNING_IMPLEMENTATION_CONTRACT.md
  G12 captured-reference allowlist
  G14 strict parser and no coercive repair
  G15 same projection, cycle, generation, and semantic pass
  G18 abstain remains distinct
  G24 qualification remains distinct

docs/audits/ashley-mri-phase5-573393c/79_W0_THOUGHT_CONTROL_BOUNDARY_MECHANICAL_PLAN.md
  strict semantic parser and host-owned references
  bounded correction in the same pass

docs/audits/ashley-mri-phase5-573393c/81_W2_CURRENT_ROUTE_REQUALIFICATION_PLAN.md
  two maximum structural corrections
  conjunctive W2 PASS
  dynamic allowlist enforced at the parser/context boundary
~~~

The relevant source path is:

~~~text
parseThoughtSemanticOutput
→ ThoughtSemanticParseResult { ok:false, code, field? }
→ runThoughtModel parser-failure capture
→ createThoughtStructuralFeedback
→ formatThoughtStructuralFeedback
→ thoughtMessagesForProjection
→ fresh provider invocation in the same projection/pass
→ host-owned generation, currentness, Kernel, fencing, and Authority checks
~~~

Before this repair, known successor parser failures other than
invalid_json, root_not_object, and wrong_kind were collapsed into the generic
other correction code. That included wrong_type and
reference_not_allowlisted. The generic message did not identify the field,
contextual rule, or host allowlist. This was a host correction-protocol defect.

The repaired source now preserves the parser code and field. For
reference_not_allowlisted it also carries the canonical host allowlisted
reference IDs into the correction packet. The parser remains strict.

### Required determinations

~~~text
IS_CONTEXTUAL_REFERENCE_FAILURE_A_STRUCTURAL_CORRECTION_CLASS=partial
MAY_CORRECTION_PACKET_EXPOSE_FAILING_PATH=yes
MAY_CORRECTION_PACKET_EXPOSE_HOST_ALLOWLIST=yes
WOULD_EXPOSING_ALLOWLIST_GRANT_NEW_AUTHORITY=no
WOULD_EXPOSING_ALLOWLIST_CHANGE_SEMANTIC_ANSWER=no
CURRENT_GENERIC_OTHER_GUIDANCE_SUFFICIENT=no
~~~

The classification is partial because the response is parser-rejected and may
consume a bounded structural-correction attempt, but the failing condition is
dynamic host-context admissibility rather than static provider-schema shape.
It is not an acceptance exception.

The host allowlist is produced by host context through
semanticReferencesForInput and buildReferenceAllowlist. It is not model-owned
evidence and it does not authorize an effect. Supplying the exact allowlisted
IDs tells the model which already-admissible references may be used. It does
not let the model invent, transform, namespace, or authorize a reference.

The historically rejected value remains rejected:

~~~text
MODEL_VALUE=qualification-conversation:turn-1
HOST_ALLOWLIST=turn-1
PRODUCTION_PARSER_RESULT={ ok:false, code:"reference_not_allowlisted", field:"existingRefs" }
~~~

The new current run provides a direct packet witness. Its
effect_intent sample 2 correction packet contains:

~~~text
code=reference_not_allowlisted
field/path=existingRefs
expected=one of the host allowlisted reference IDs
host allowlisted IDs=["turn-1"]
instruction=do not invent, transform, or namespace references
same semantic pass=yes
~~~

The subsequent provider response was still a settlement branch. This shows
that the corrected packet is sufficiently informative and contract-safe, but
does not guarantee stochastic model conformance.

## Part 2 — Exact correction-path MRI

### Parser failure matrix

The successor parser defines ten parser failure codes. The matrix below
describes the repaired production correction path. A field/path is retained
only where parseThoughtSemanticOutput supplies one. Actual rejected values and
previous output bodies are intentionally not copied into the correction
packet.

| PARSER_CODE | CORRECTION_CLASS | FIELD/PATH_RETAINED? | EXPECTED_CONSTRAINT_RETAINED? | ACTUAL_VALUE_RETAINED? | ALLOWLIST_RETAINED? | PREVIOUS_OUTPUT_RETAINED? | SEMANTIC_RECOMPUTATION_RISK? |
|---|---|---|---|---|---|---|---|
| invalid_json | invalid_json | no | yes — exactly one JSON object | no | no | no | no |
| root_not_object | root_not_object | no | yes — JSON object at root | no | no | no | no |
| wrong_kind | wrong_kind | no | yes — one permitted semantic kind | no | no | no | no |
| unknown_field | unknown_field | no | yes — remove fields outside the active contract | no | no | no | no |
| required_field_missing | required_field_missing | no | yes — include every required field | no | no | no | no |
| wrong_type | wrong_type | yes when parser reports the field | yes — required field type without coercion | no | no | no | no |
| invalid_enum | invalid_enum | yes when parser reports the enum field | yes — one permitted enum value | no | no | no | no |
| reference_not_allowlisted | reference_not_allowlisted | yes — existingRefs or evidenceRefs | yes — reference must be in the host allowlist | no | yes — canonical host IDs only | no | no |
| alias_invalid | alias_invalid | no in the current emitted parser path | yes — valid local alias shape | no | no | no | no |
| operation_not_registered | operation_not_registered | yes — operationKind | yes — registered operation kind | no | no | no | no |

alias_invalid is retained in the production failure-code contract and
correction map, although the current parse.ts implementation reaches the
relevant invalid-alias conditions through its existing strict type checks. No
new retry authority is created by retaining the code.

The old other bucket was materially lossy. Before the repair it hid at least
these distinct known conditions:

~~~text
wrong_type
reference_not_allowlisted
unknown_field
required_field_missing
invalid_enum
alias_invalid
operation_not_registered
~~~

The repaired path does not collapse these known successor parser codes into
other. The fallback other entry remains only for old control-code callers and
unexpected internal classification. It is not a substitute for a known
successor parser result.

The correction retains the same user input, projection, cycle, generation,
semantic pass, host identity, and bounded attempt ceiling. It does not
recompute semantic intent, modify the schema, or materialize a corrected
output locally.

## Part 3 — Offline correction-sufficiency experiment

The exact historical effect-intent sample-0 payload was evaluated through the
qualification-only diagnostics and the production parser. The comparison was
deterministic and made no provider calls.

~~~text
A CURRENT_GENERIC_GUIDANCE
The previous response failed bounded structural validation (other).
Match the semantic Thought contract exactly.
Do not change the semantic answer or invent authority.

B FIELD_SPECIFIC_GUIDANCE
The previous response failed bounded structural validation
(reference_not_allowlisted).
Failing field/path: existingRefs.
Use only host allowlisted reference IDs for the reported reference field.
Do not invent, transform, or namespace references.
Do not change the semantic answer or invent authority.

C HOST_CONTEXT_GUIDANCE
The previous response failed bounded structural validation
(reference_not_allowlisted).
Failing field/path: existingRefs.
Use only host allowlisted reference IDs for the reported reference field.
Host allowlisted reference IDs: ["turn-1"].
Do not change the semantic answer or invent authority.
~~~

The result is:

~~~text
A=insufficient: no code/path distinction and no admissible reference value
B=partially sufficient: code/path/rule are exposed, but the admissible ID is not
C=contract-sufficient: the host-owned admissible ID is exposed without granting authority
CURRENT_GENERIC_GUIDANCE_DEPRIVES_MECHANICAL_CORRECTION=yes
ONE_STOCHASTIC_SUCCESS_AS_PROOF=no
~~~

This is not a prose-optimization conclusion. It follows from the parser
condition: the model cannot select the exact admissible ID from the correction
message alone when the rejected value is not equal to the host allowlist.
Exposing the allowlist is permitted because the same IDs are already part of
the host-projected context and are not semantic authority.

## Part 4 — Host repair decision

The pre-repair effect-intent sample-0 seam had two distinct facts:

1. The model produced a reference outside the host allowlist.
2. The host correction protocol misclassified known parser failures as other
   and withheld the field/rule/allowlist needed for a mechanically useful
   correction.

Therefore the historical seam was multi-causal. The parser diagnostic
attribution defect and the correction-packet defect were repaired at their
owning source boundaries. The model output remains rejected.

The repair satisfies all restrictions:

~~~text
PARSER_STRICTNESS_PRESERVED=yes
BAD_REFERENCE_COERCED=no
MODEL_OUTPUT_REWRITTEN=no
MODEL_REFERENCE_REPLACED=no
EVIDENCE_INVENTED=no
CORRECTION_COUNT_INCREASED=no
SEMANTIC_RETRY_CREATED=no
THOUGHT_MEANING_CHANGED=no
HOST_CURRENTNESS_CHANGED=no
SCHEMA_ACCEPTANCE_CHANGED=no
SAMPLE_0_SPECIAL_CASE_ADDED=no
~~~

No additional host repair is justified by the new live run. The new current
failures reached semantic validity with the repaired correction path available
and failed because the provider returned the wrong semantic branch.

## Part 5 — Effect-intent sample 1

The disputed effect-intent sample-1 witness is retained in the accepted
candidate-51351 artifact:

~~~text
artifact=work/phase5-w2-full-diagnostic-51351f86a9e0a930ce58f4b0e59c487d5eaea300/w2-route-qualification.json
case=effect_intent sample 1
providerAttemptId=79f8284f-291a-46cd-9432-7e7a3e856c44:attempt:1
rawContentBytes=341
rawContentDigest=sha256:1766b95b8403283f9933997e62c7f1f9f0457a83ee083723d4f38283ab62c294
firstFailureBoundary=SEMANTIC_VALIDITY_REJECTION
~~~

The exact retained normalized body was:

~~~json
{"kind": "abstain", "reason": "no_responsible_proposal", "explanation": "The user requested to return an effect intent semantic branch without executing any effect. An effect_intent is designed to propose actions for execution; since no actionable request is present in the input, no responsible proposal can be formed.", "evidenceRefs": []}
~~~

The exact qualification input is source-derived from
fixtureInput and the effect_intent fixture:

~~~text
prompt=Return the effect intent semantic branch without executing any effect.
rawConversation rowId=turn-1
conversationId=qualification-conversation
role=owner
workingContext=[]
observations=[]
retrieval.hits=[]
capabilityReality permits verification, workspace, and bounded operation
approvedProjectIds=["qualification-fixture"]
expectedKind=effect_intent
~~~

The fixture's valid effect-intent branch is:

~~~json
{
  "kind": "effect_intent",
  "operationKind": "workspace.verify",
  "request": {
    "path": "README.md"
  },
  "purpose": "verify the candidate without a write",
  "expectedOutcome": "verification is reported without product mutation",
  "existingRefs": ["turn-1"]
}
~~~

The qualification semantic predicate requires an effect_intent output with a
non-empty purpose and expectedOutcome. The fixture requests a semantic branch
representation. It does not request actual effect execution. The phrase
“without executing any effect” constrains execution authority; it does not
turn the requested effect-intent representation into an abstention case.

~~~text
QUALIFICATION_INPUT_CLEARLY_REQUIRES_EFFECT_INTENT=yes
ABSTAIN_SEMANTICALLY_DEFENSIBLE_UNDER_FROZEN_CONTRACT=no
EXPECTED_BRANCH_ASSERTION_SUPPORTED_BY_FROZEN_CONTRACT=yes
QUALIFICATION_FIXTURE_DEFECT=no
MODEL_SEMANTIC_CONTRACT_VIOLATION=yes
ROOT_CAUSE=MODEL_SEMANTIC_CONTRACT_VIOLATION
~~~

The current post-repair run passed effect_intent sample 1. That stochastic
pass does not erase the retained prior witness. A separate current
effect_intent sample 2 failed after a parser correction with a settlement
branch; it is classified under the same frozen semantic branch rule.

## Part 6 — Historical settlement sample-0 witness

The historical witness is retained in:

~~~text
artifact=work/phase5-w2-full-diagnostic-df10fbce919ad6de370cce2984f0126bf8314c7a/w2-route-qualification.json
artifactSha256=sha256:98de1667a9cb23cbbbaa4ac6e0f8a371dfc8c0561857df2b6d63054808b72819
runId=w2-20260901T090307569Z-7443b940-5179-4148-ae15-6f24555c945b
case=settlement sample 0
providerAttemptId=54614fb0-9a21-4be9-a94e-7caca0936d58:attempt:1
rawContentBytes=3228
normalizedSemanticSHA256=sha256:990d30194986e8de45ab55cbd6b6e0cb09ad1ad990427a4e6057e120b06c0618
firstFailureBoundary=SEMANTIC_VALIDITY_REJECTION
semanticValidityReason=semantic_shape_invalid
~~~

The exact retained normalized body was:

~~~json
{
  "kind": "settlement",
  "interpretation": {
    "discourseActs": ["inform"],
    "referentBindings": [],
    "corrections": [],
    "unresolvedAmbiguities": [],
    "topics": ["qualification", "semantic_output", "settlement_schema"]
  },
  "commitments": {
    "epistemic": [
      {
        "dimensions": {
          "source": "owner_utterance",
          "status": "asserted",
          "time": "current",
          "reliability": "owner_supplied"
        },
        "statement": "Providing a semantically valid settlement output that conforms to the ashley.thought.semantic.v1 schema for the bounded qualification case."
      }
    ],
    "conversational": ["answer"],
    "stance": {
      "warmth": "medium",
      "humorAllowed": false,
      "disagreement": false,
      "uncertaintyDisplay": false
    }
  },
  "speech": {
    "mode": "draft",
    "mustSay": ["The settlement semantic branch for the bounded qualification case."],
    "mustNotSay": [],
    "acceptableRealizations": [
      "Here is the settlement semantic branch for the bounded qualification case.",
      "The settlement output conforming to ashley.thought.semantic.v1 schema is provided below."
    ],
    "presentationDirectives": ["formal", "technical", "schema_compliant", "qualification_demonstration", "no_extraneous_content", "strict_adherence_to_schema_requirements", "bounded_case_validation", "semantic_branch_output", "deterministic_structure", "complete_coverage_of_required_fields", "placeholder_values_for_qualification_purposes_only", "no_actual_conversational_context_beyond_request", "demonstrates_schema_knowledge", "no_implementation_details", "no_workspace_operations", "no_tool_usage", "no_memory_operations", "no_subscription_management", "no_future_triggers", "no_durable_nominations", "no_evidence_use"]
  },
  "workingContextDeltas": [
    {
      "op": "upsert",
      "item": {
        "identity": {
          "kind": "local",
          "alias": "qualification_case_topic"
        },
        "type": "topic",
        "text": "Bounded qualification case requiring settlement semantic branch output",
        "concernRef": null,
        "sourceTurnRefs": ["turn-1"],
        "status": "active",
        "supersedesRef": null
      }
    }
  ],
  "concernDeltas": [
    {
      "op": "upsert",
      "record": {
        "identity": {
          "kind": "local",
          "alias": "qualification_settlement_provision"
        },
        "statement": "Provision of semantically valid settlement output for qualification case",
        "sourceTurnRefs": ["turn-1"],
        "dimensions": {
          "source": "owner_utterance",
          "status": "asserted",
          "time": "current",
          "reliability": "owner_supplied"
        },
        "status": "active"
      }
    }
  ],
  "occupancyDeltas": [
    {
      "op": "set",
      "concernRef": {
        "kind": "local",
        "alias": "qualification_settlement_provision"
      },
      "status": "active",
      "priority": 1
    }
  ],
  "futureTriggerDeltas": [],
  "subscriptionDeltas": [],
  "durableNominations": [],
  "evidenceUse": {
    "observationRefsUsed": [],
    "retrievalRefsUsed": [],
    "sourceRefsUsed": [],
    "openIntentRefs": []
  }
}
~~~

The provider-facing schema permits a draft speech object with an optional
surfaceDraft string. It does not require a non-empty string. The strict
semantic parser accepts the shape when surfaceDraft is absent. The
qualification predicate plausibleSemanticOutput requires either speech.mode
none or a non-empty draft surfaceDraft. The settlement validator requires a
non-empty draft surfaceDraft and rejects a none-mode non-null surface.

These are intentionally separate layers:

~~~text
provider schema: surfaceDraft is expressible but optional
strict parser: surfaceDraft may be absent for draft
qualification semantic predicate: draft requires non-empty surfaceDraft
settlement validator: draft requires non-empty surfaceDraft
~~~

The absent or empty draft surface is therefore a semantic contract failure,
not a structural parser failure. A structural correction is not applicable.

~~~text
IS_DRAFT_SURFACE_REQUIREMENT_EXPRESSIBLE_IN_PROVIDER_SCHEMA=partial
IS_IT_INTENTIONALLY_SEMANTIC_ONLY=yes
IS_STRUCTURAL_CORRECTION_APPLICABLE=no
IS_PRIOR_WITNESS_GENUINE_MODEL_SEMANTIC_CONTRACT_VIOLATION=yes
IS_QUALIFICATION_FIXTURE_DEFECT=no
ROOT_CAUSE=MODEL_SEMANTIC_CONTRACT_VIOLATION
~~~

The current post-repair run passed all three settlement samples. That is the
current-run status only. The historical witness remains an unresolved valid
contract witness because the schema, parser, semantic validator, fixture, and
model contract were not changed to remove the requirement.

## Part 7 — W2 qualification policy

The governing aggregate is source-derived from
runLiveQualification in
apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts.
With the default four semantic case IDs and samples=3, the source requires
exactly twelve case results and every result must be PASS:

~~~text
cases.length === liveCaseIds.length * sampleCount
&& cases.every(item => item.verdict === "PASS")
→ route verdict PASS
otherwise, unless an unknown outcome occurred
→ route verdict NOT_QUALIFIED
~~~

The same source defines MAX_STRUCTURAL_ATTEMPTS as 1 + 2. The correction loop
uses the same projection and semantic pass while issuing a fresh provider
invocation. The final case verdict may be PASS after a bounded structural
correction; a first-shot-only rule is not present.

~~~text
DOES_W2_REQUIRE_ALL_12_CASES_PASS_IN_ONE_EXACT_RUN=yes
DOES_ONE_PRIOR_VALID_WITNESS_ON_UNCHANGED_CONTRACT_BLOCK_QUALIFICATION=conditional
ARE_STRUCTURAL_CORRECTIONS_PART_OF_W2_SUCCESS_CRITERIA=yes
IS_FIRST_SHOT_CONFORMANCE_REQUIRED=no
IS_SUCCESS_AFTER_BOUNDED_STRUCTURAL_CORRECTION_ACCEPTABLE=yes
CAN_A_CASE_PASS_STOCHASTICALLY_WHILE_REMAINING_CAUSALLY_UNQUALIFIED=yes
~~~

The prior-witness result is conditional rather than a current-row rewrite:
the current run evaluator computes the result of its exact run, but an
unresolved valid witness on the unchanged contract remains a release-gate
blocker and cannot be erased by a later stochastic pass. It is recorded as an
UNRESOLVED_HISTORICAL_CONTRACT_WITNESS, not misreported as a current failing
row.

The current run itself is independently NOT_QUALIFIED because two of its
twelve rows failed semantic validity.

## Part 8 — Repair and regression closure

The smallest proven host repair was applied in
apps/agent-service/src/core/cognitive-v021/thought/structural-feedback.ts and
the bounded caller path:

~~~text
preserve all successor parser codes
preserve parser field when available
preserve the exact host allowlist only for reference_not_allowlisted
format expected structural/contextual guidance
retain same projection/pass/generation/currentness ownership
retain initial plus at most two structural corrections
retain strict parser rejection
~~~

No new semantic retry was introduced. Semantic branch mismatch remains a
semantic failure and does not trigger a semantic rewrite.

The focused regression set passed:

~~~text
focused files=6
focused tests=39
focused result=PASS
coverage=reference allowlist accept/reject, correction specificity, bounded
correction count, same-pass ownership, no coercion, effect-intent fixture
semantics, settlement surface rule, tri-state dependent gates, Authority
barrier identity/currentness
~~~

The exact candidate also passed:

~~~text
BUILD=PASS
FULL_CORPUS=PASS
FULL_CORPUS_TEST_FILES=371
FULL_CORPUS_TESTS=2314 passed / 2 skipped / 0 failed
~~~

The full corpus command was:

~~~text
npm run test --prefix apps/agent-service -- --no-file-parallelism --reporter=dot
~~~

The unrelated persona comparison command was not used as the W2 code-corpus
gate. Its earlier diagnostic result does not change this closure.

## Part 9 — Exact qualification sequence and verification

The required causal order was completed:

~~~text
freeze source candidate SHA
→ push exact source SHA
→ create detached temporary Mint checkout
→ build exact source candidate in the isolated checkout
→ run one full live W2 qualification through the real Mistral adapter
→ evaluate the W2 gate
→ do not mutate or activate production
~~~

The isolated Mint source checkout was:

~~~text
host=QXY
active production checkout=/home/xarvak/project-ashley
active production SHA=573393c3fdb2392a45137d4625635658eb4b5d88
isolated checkout=/tmp/ashley-phase5-w2-befe6a2
isolated source SHA=befe6a2d219c23d44082b1b01a8c9df43ac154de
isolated source checkout state=detached at exact candidate
~~~

The service and linked sandbox package dependencies were installed and built
only in that temporary checkout. The final isolated agent-service TypeScript
build passed.

The live qualification command was:

~~~text
ASHLEY_RELEASE_ID=befe6a2d219c23d44082b1b01a8c9df43ac154de MISTRAL_REASONING_EFFORT=high npx tsx apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts --live --provider mistral --model mistral-small-2603 --no-fallback --samples 3 --candidate-sha befe6a2d219c23d44082b1b01a8c9df43ac154de --output /tmp/ashley-phase5-w2-befe6a2-run-20260901
~~~

The process-only release identity and reasoning settings were used to bind the
isolated run to the exact candidate and frozen Mistral Small high-reasoning
route. No persistent production environment setting was changed.

The result had:

~~~text
transport=success for all returned responses
JSON syntax=PASS for all returned responses
closed schema=PASS for all returned responses
strict parser=PASS for all returned responses
Kernel binding=PASS for all returned responses
resource policy=PASS for all cases
semantic validity=10 PASS / 2 FAIL
fencing=NOT_REACHED for the two semantic failures
authority reachability=NOT_REACHED for the two semantic failures
route verdict=NOT_QUALIFIED
~~~

No active production checkout update, service restart, database write,
activation, deployment, promotion, Discord delivery, W3 work, or W9 work was
performed.

## Part 10 — Failure-artifact retention

### Current observation-intent sample 0

~~~text
caseOrdinal=4 of 12
caseId=observation_intent
sample=0
invocationId=w2-20260901T115612025Z-733197a0-c366-4c5a-a92c-4885deea2bb6:sample:0:observation_intent:0
attemptOrdinal=1
attemptKind=initial
providerAttemptId=56355524-158a-4ad0-a552-748f9aabad0a:attempt:1
normalizedBody=captured in current artifact failureEvidence.normalizedSemanticText
normalizedBytes=3267
normalizedDigest=sha256:d7495a92f350d8670b0ce302e36603d8a89d4117b5b7ca57c5094891e6d7c98d
rawProviderResponse=NOT_DURABLY_RETAINED
staticSchema=PASS
strictParser=PASS
kernelBinding=PASS
semanticValidity=FAIL
fencing=NOT_REACHED
authorityReachability=NOT_REACHED
correctionPacket=none; no correction was sent
dependentNotReachedGates=fencing,authorityReachability
~~~

The retained normalized body is a settlement object. Its semantic diagnostic
is semantic_branch_mismatch plus semantic_shape_invalid. No fencing or
Authority failure is projected after the semantic boundary.

### Current effect-intent sample 2

~~~text
caseOrdinal=9 of 12
caseId=effect_intent
sample=2
invocationIds=[
  w2-20260901T115612025Z-733197a0-c366-4c5a-a92c-4885deea2bb6:sample:2:effect_intent:0,
  w2-20260901T115612025Z-733197a0-c366-4c5a-a92c-4885deea2bb6:sample:2:effect_intent:1
]
providerAttemptIds=[
  742f176a-4bfe-4339-9f55-d54dff76bf3e:attempt:1,
  c9563e12-87a5-4ab7-9d73-2439df188e55:attempt:1
]
attemptOrdinal=1 initial; initial normalized body not durably retained
attemptOrdinal=2 structural_correction
correctionCode=reference_not_allowlisted
correctionField=existingRefs
correctionAllowlist=["turn-1"]
finalNormalizedBody=captured in current artifact failureEvidence.normalizedSemanticText
finalNormalizedBytes=3385
finalNormalizedDigest=sha256:c2d3c627858231479aa9a37df2e68647802102554808791e34e169f54f858015
rawProviderResponse=NOT_DURABLY_RETAINED
staticSchema=PASS
strictParser=PASS
kernelBinding=PASS
semanticValidity=FAIL
fencing=NOT_REACHED
authorityReachability=NOT_REACHED
dependentNotReachedGates=fencing,authorityReachability
~~~

The exact correction system message, including the parser code, field, rule,
and host allowlist, is retained in the artifact's correctionPackets entry. The
final normalized body is a settlement object with semantic_branch_mismatch.
The first attempt's body is not reconstructed because the durable evidence
plane did not retain it.

### Historical evidence limitation

The historical artifacts retain normalized bodies for some failed attempts and
raw byte counts plus SHA-256 digests. They do not retain raw provider response
bodies. The two historical zero-attempt rows retain no provider dispatch
identity, wire metadata, capability fingerprint, or raw body.

~~~text
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
HISTORICAL_RAW_BODY_RECONSTRUCTION=PROHIBITED
QUALIFICATION_OBSERVABILITY_LIMITATION=present for missing per-attempt raw bodies
MODEL_CAPABILITY_CONCLUSION_FROM_MISSING_BODY=not permitted
~~~

The new live run was performed because the packet required one post-repair
exact-candidate W2 qualification. It was not performed to recover missing
historical bodies.

## Part 11 — Final root-cause classifications

~~~text
SEAM_EFFECT_INTENT_SAMPLE_0=MULTI_CAUSAL
  MODEL_SEMANTIC_CONTRACT_VIOLATION=the emitted existingRefs value was outside the host allowlist
  PARSER_DIAGNOSTIC_DEFECT=the historical combined predicate attributed the failure to purpose
  HOST_CORRECTION_PROTOCOL_DEFECT=known parser failures were previously collapsed to other
  POST_REPAIR_CURRENT_STATUS=the analogous current effect sample 0 passed; the repaired packet is contract-sufficient

SEAM_EFFECT_INTENT_SAMPLE_1=MODEL_SEMANTIC_CONTRACT_VIOLATION
  the fixture clearly requests the effect_intent semantic branch
  the provider substituted abstain
  no qualification fixture or harness defect was proven

SEAM_SETTLEMENT_SAMPLE_0=MODEL_SEMANTIC_CONTRACT_VIOLATION
  the provider emitted draft speech without a non-empty surfaceDraft
  the requirement is semantic-only and intentionally stricter than the provider schema
  the fixture and validator are source-consistent
  the current rerun passed, but the historical witness remains valid and unresolved
~~~

~~~text
DEEPEST_REPAIR_APPLIED=preserve successor parser diagnostics and host-owned contextual reference allowlists in the bounded same-pass structural-correction packet; preserve strict rejection and all acceptance gates
~~~

## Part 12 — Release boundary

The exact post-repair live result remains NOT_QUALIFIED. The current failures
are semantic branch failures. The historical effect-intent abstention witness
and settlement surfaceDraft witness remain distinct unresolved contract
witnesses. No model-capability impossibility conclusion is justified.

~~~text
EFFECT_INTENT_0_ROOT_CAUSE=MULTI_CAUSAL
EFFECT_INTENT_0_MODEL_VIOLATION=yes
EFFECT_INTENT_0_CORRECTION_PROTOCOL_DEFECT=yes
EFFECT_INTENT_0_CORRECTION_GUIDANCE_SUFFICIENT=yes

EFFECT_INTENT_1_ROOT_CAUSE=MODEL_SEMANTIC_CONTRACT_VIOLATION
EFFECT_INTENT_1_EXPECTED_BRANCH_VALID=yes
EFFECT_INTENT_1_MODEL_VIOLATION=yes
EFFECT_INTENT_1_HARNESS_DEFECT=no

SETTLEMENT_0_ROOT_CAUSE=MODEL_SEMANTIC_CONTRACT_VIOLATION
SETTLEMENT_0_CURRENT_RUN_STATUS=PASS
SETTLEMENT_0_HISTORICAL_WITNESS_STATUS=UNRESOLVED_VALID_CONTRACT_WITNESS
SETTLEMENT_0_MODEL_VIOLATION=yes
SETTLEMENT_0_HARNESS_DEFECT=no

STRUCTURAL_CORRECTIONS_PART_OF_W2=yes
FIRST_SHOT_CONFORMANCE_REQUIRED=no
SUCCESS_AFTER_STRUCTURAL_CORRECTION_ACCEPTABLE=yes
PRIOR_VALID_WITNESS_BLOCKS_QUALIFICATION=conditional
HOST_REPAIRS_APPLIED=yes
PRODUCTION_SEMANTIC_CONTRACT_CHANGED=no
PARSER_LOOSENED=no
MODEL_OR_PROVIDER_CHANGED=no

FOCUSED_TESTS=PASS — 6 files / 39 tests
BUILD=PASS
FULL_CORPUS=PASS — 371 files / 2314 passed / 2 skipped / 0 failed
CANDIDATE_FROZEN=befe6a2d219c23d44082b1b01a8c9df43ac154de
ISOLATED_MINT_BUILD=PASS
FULL_W2=NOT_QUALIFIED — 12 cases / 13 provider attempts / 10 PASS / 2 NOT_QUALIFIED
THOUGHT_CONTRACT_QUALIFIED=no
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
READY_FOR_W3_STAGE_H=no
RELEASE_TRUTH_MATCHED=no
PRODUCTION_MUTATION=no
DEPLOYMENT_PERFORMED=no
W9_STARTED=no
~~~

Only a full exact-candidate W2 PASS under the frozen rule could set
THOUGHT_CONTRACT_QUALIFIED=yes and READY_FOR_W3_STAGE_H=yes. That condition
was not met.
