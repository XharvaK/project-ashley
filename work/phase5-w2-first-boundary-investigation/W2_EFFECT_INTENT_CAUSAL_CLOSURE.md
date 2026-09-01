# W2 Effect-Intent Causal Closure

## Closure status

This bounded closure resolves the contradiction between the prior W2 artifact,
which reported wrong_type at purpose, and the prior root-cause report, which
described an invalid existingRefs value.

The mechanically supported final classification is:

~~~text
W2_EFFECT_INTENT_CLOSURE_STATUS=COMPLETE
REPORT_VS_JSON_CONTRADICTION=RESOLVED
ROOT_CAUSE=PARSER_DIAGNOSTIC_DEFECT
FIRST_ACTUAL_FAILURE=STRICT_PARSER_REJECTION
FIRST_ACTUAL_CHECK=reference_not_allowlisted at existingRefs[0]
VIOLATION_1=MODEL_SEMANTIC_CONTRACT_VIOLATION: existingRefs[0] was not host allowlisted
VIOLATION_2=NONE in the exact historical body; purpose was valid
SCHEMA_PARSER_CONTRACT=INTENTIONAL_LAYERING_PROVEN
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
THOUGHT_CONTRACT_QUALIFIED=no
READY_FOR_W3_STAGE_H=no
~~~

The production semantic contract remains strict. The parser was not loosened.
No model, provider, reasoning value, token budget, route, fallback, credential,
or semantic prompt was changed.

## Evidence identities and boundaries

~~~text
BASE_HISTORICAL_CANDIDATE=9cf777c41e39271c4e2cb2db5ed89503f97ff88f
PRIOR_INVESTIGATION_CANDIDATE=df10fbce919ad6de370cce2984f0126bf8314c7a
NEW_EXACT_CANDIDATE=51351f86a9e0a930ce58f4b0e59c487d5eaea300
PRODUCTION_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
PRODUCTION_MUTATION=no
DEPLOYMENT=no
ACTIVATION=no
W3_STARTED=no
W9_STARTED=no
~~~

The new candidate was committed and pushed on
codex/phase5-w2-first-boundary-diagnostic. The exact candidate was checked out
detached in the isolated Mint qualification repository, built there, and
qualified through the real Mistral adapter path. The active production checkout
was not changed.

## 1. Exact historical attempt sequence

The prior complete W2 artifact is:

~~~text
path=C:\Users\Xharv\Projects\composer-assistant-w2-first-boundary-9cf\work\phase5-w2-full-diagnostic-df10fbce919ad6de370cce2984f0126bf8314c7a\w2-route-qualification.json
sha256=98de1667a9cb23cbbbaa4ac6e0f8a371dfc8c0561857df2b6d63054808b72819
runId=w2-20260901T090307569Z-7443b940-5179-4148-ae15-6f24555c945b
~~~

For effect_intent sample 0, that artifact durably retains three provider
attempt IDs. Their roles are established by the invocation ordinal and the
bounded correction loop. It does not retain per-attempt response bodies or
per-attempt diagnostics for attempts 1 and 2.

| Attempt | Provider attempt ID | Input type | Output hash/body | Static schema | Parser result | Parser path | Correction packet |
|---|---|---|---|---|---|---|---|
| 1 | f2991ae5-09ff-4c38-b4bf-1e83b23508b8:attempt:1 | initial semantic attempt | NOT_DURABLY_RETAINED | NOT_DURABLY_RETAINED | NOT_DURABLY_RETAINED | NOT_DURABLY_RETAINED | NOT_DURABLY_RETAINED |
| 2 | af2f34f7-8909-4033-9714-93636f86601e:attempt:1 | structural correction 1 | NOT_DURABLY_RETAINED | NOT_DURABLY_RETAINED | NOT_DURABLY_RETAINED | NOT_DURABLY_RETAINED | NOT_DURABLY_RETAINED |
| 3 | 0fbbce45-3d51-465c-9588-f2f24529beb4:attempt:1 | structural correction 2 and final retained attempt | 726 bytes; sha256:468a4718c5d45c501f3bb83156b43ce645467ca8154b1d8a0be67718c9a560a; normalized body retained | PASS | old artifact: wrong_type | old artifact: purpose; repaired replay: existingRefs | NOT_DURABLY_RETAINED |

The provider attempt IDs prove that all three attempts reached the provider
dispatch path. They do not prove the missing bodies or diagnostics for attempts
1 and 2. The case-level host allowlist retained with the final failure evidence
was:

~~~text
allowlistedReferences=["turn-1"]
~~~

The displayed normalized body belongs to attempt 3, the final bounded
structural-correction attempt. The report's existingRefs explanation and the
displayed body therefore refer to the same retained final normalized body.
The contradiction was caused by the old parser diagnostic attribution, not by
mixing two retained final bodies.

The historical artifact retains raw byte counts and SHA-256 digests only. It
does not retain raw provider response bodies. Therefore:

~~~text
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
ATTEMPT_1_BODY=NOT_DURABLY_RETAINED
ATTEMPT_2_BODY=NOT_DURABLY_RETAINED
~~~

No missing response body was reconstructed.

### Exact retained historical normalized body

~~~json
{
  "kind": "effect_intent",
  "operationKind": "conversation.read",
  "request": {
    "conversationId": "qualification-conversation",
    "turnId": "turn-1",
    "role": "owner",
    "instruction": "Return the effect intent semantic branch without executing any effect."
  },
  "purpose": "To construct and return the effect intent semantic branch that satisfies the owner's qualification request without performing any actual effect operations",
  "expectedOutcome": "A properly formatted effect_intent JSON object containing the semantic representation of the requested effect intent branch, demonstrating correct structural compliance with the semantic contract",
  "existingRefs": ["qualification-conversation:turn-1"]
}
~~~

## 2. Exact effect-intent schema and parser matrix

The provider-facing schema is defined by
apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts,
symbol THOUGHT_OUTPUT_SCHEMA. The exact effect-intent branch requires:

~~~text
kind=const effect_intent
operationKind=enum REGISTERED_OPERATION_KINDS
request=JSON object; open payload object
purpose=string; minLength 1
expectedOutcome=string; minLength 1
existingRefs=array; items are strings
~~~

All listed fields are required.

| Field | Provider schema type | Required | Parser expected type | Runtime/context validation | Semantic validation |
|---|---|---:|---|---|---|
| operationKind | enum REGISTERED_OPERATION_KINDS | yes | string present in REGISTERED_OPERATION_KINDS | operation registry membership | operation meaning is checked later |
| request | type object; JSON object schema permits operation-specific keys | yes | jsonObject: JSON object with finite JSON values | no dynamic reference rule in this field | operation request meaning is checked later |
| purpose | type string; minLength 1 | yes | nonEmptyString: typeof value is string and value.length is greater than 0 | none beyond parser shape | qualification semantic check requires trim().length greater than 0 |
| expectedOutcome | type string; minLength 1 | yes | nonEmptyString: typeof value is string and value.length is greater than 0 | none beyond parser shape | qualification semantic check requires trim().length greater than 0 |
| existingRefs | array with string items | yes | string array; each item non-empty; each item must pass existingRef | exact membership in the host allowlist | no field-specific semantic check is reached after parser rejection |

### Purpose adjudication

~~~text
PURPOSE_SCHEMA_TYPE=string, minLength 1
PURPOSE_PARSER_EXPECTATION=non-empty string
PURPOSE_VALUE_TYPE=string
PURPOSE_VALUE_LENGTH=non-zero
PURPOSE_CONTRACT_STATUS=VALID
~~~

The purpose in the retained historical body is valid under both the provider
schema and the frozen parser. It is not a schema/parser mismatch and it is not
a strict-parser acceptance defect.

### Existing-reference adjudication

~~~text
EXISTING_REFS_VALUE=["qualification-conversation:turn-1"]
EXISTING_REFS_STATIC_SCHEMA_STATUS=VALID_TYPE_ONLY
EXISTING_REFS_PARSER_SHAPE_STATUS=VALID
EXISTING_REFS_HOST_ALLOWLIST=["turn-1"]
EXISTING_REFS_HOST_ALLOWLIST_STATUS=INVALID
~~~

The static schema intentionally describes only the type-level array and string
shape. The allowlist is per invocation and host-owned. The parser's
existingRef helper requires a non-empty string and allowlist.has(value), and
refArray applies that rule to every array item. The namespaced value is not
equal to the allowlisted value.

This is intentional layering. A dynamic enum could be generated for one
invocation, but the frozen source design keeps the host allowlist out of the
static provider schema and enforces it in the parser/context boundary. No
binding change is justified.

## 3. Strict parser evaluation order

The live path is:

~~~text
parseThoughtSemanticOutput
→ parse semantic JSON
→ require root object
→ dispatch effect_intent branch
→ exactRecord required-field check
→ operationKind type and registry check
→ request JSON-object check
→ purpose nonEmptyString check
→ existingRefs array and string-item shape check
→ existingRefs non-empty-item check
→ existingRefs host-allowlist check
→ expectedOutcome nonEmptyString check
~~~

In the prior candidate, parseOperationSemantic used one combined condition:

~~~text
if (!nonEmptyString(record.purpose) || !refArray(record.existingRefs, allowlist))
  return semanticFailure("wrong_type", "purpose");
~~~

The retained body makes the first operand false because purpose is valid. The
second operand then evaluates refArray and fails because the value is not in
the allowlist. The combined condition nevertheless returns wrong_type at
purpose. This is the proven parser diagnostic defect.

The repaired source splits the checks:

~~~text
if (!nonEmptyString(record.purpose)) return wrong_type at purpose
if (!stringArray(record.existingRefs)) return wrong_type at existingRefs
if (an existingRefs item is empty) return wrong_type at existingRefs
if (!refArray(record.existingRefs, allowlist)) return reference_not_allowlisted at existingRefs
~~~

The acceptance boundary remains strict. The same body is still rejected.

### Diagnostic-only replay

The production parser remains fail-fast. The qualification-only diagnostic
wrapper calls the production schema oracle and parser, then independently
checks the exact effect-intent fields. It never accepts or materializes output.

For the exact retained historical body and allowlist ["turn-1"]:

~~~text
staticSchema=PASS
productionParser={ok:false,code:"reference_not_allowlisted",field:"existingRefs"} on the repaired candidate
firstFailingCheck={category:"contextual_reference",code:"reference_not_allowlisted",path:"existingRefs[0]"}
structuralViolations=[]
contextualReferenceViolations=[
  {
    code="reference_not_allowlisted",
    path="existingRefs[0]",
    expected="one of the host allowlisted reference IDs",
    actual="qualification-conversation:turn-1"
  }
]
semanticViolationsAfterStructuralAcceptance=NOT_REACHED
~~~

The pre-repair offline replay returned wrong_type at purpose. Independent
checks proved that purpose was a valid non-empty string and that only the
allowlist condition failed in the retained body.

### Multi-fault diagnostic

The diagnostic-only probe was also run against a body with both an empty
purpose and the disallowed reference:

~~~text
productionParser={ok:false,code:"wrong_type",field:"purpose"}
firstFailingCheck={category:"structural",code:"wrong_type",path:"purpose"}
structuralViolations=[
  {code:"wrong_type",path:"purpose",expected:"non-empty string",actual:"empty string"}
]
contextualReferenceViolations=[
  {
    code="reference_not_allowlisted",
    path="existingRefs[0]",
    expected="one of the host allowlisted reference IDs",
    actual="qualification-conversation:turn-1"
  }
]
semanticViolationsAfterStructuralAcceptance=NOT_REACHED
~~~

This proves that production parser behavior is deterministic fail-fast while
the qualification diagnostic can report independent detectable faults.

## 4. Structural-correction packet analysis

The live correction path in
apps/agent-service/src/core/cognitive-v021/thought/run.ts maps only
invalid_json, root_not_object, and wrong_kind to their specific parser
feedback. Other parser failures, including wrong_type and
reference_not_allowlisted, map to the ThoughtParserFailureCode other. The
resulting correction message is:

~~~text
The previous response failed bounded structural validation (other). Match the semantic Thought contract exactly. Do not change the semantic answer or invent authority.
~~~

The correction packet does not include the parser path, expected field shape,
actual field shape, host allowlisted IDs, or the previous rejected output. The
qualification input exposes turn-1 as a raw conversation row ID and trigger
reference, but it does not expose a separate machine-readable allowlist field.
The correction path therefore did not provide an explicit
qualification-conversation:turn-1 versus turn-1 distinction.

The exact correction exchanges for attempts 1 and 2 are not durably retained.
The source proves the generic mapping for a retained wrong_type or
reference_not_allowlisted result, but it cannot prove the exact prior parser
code for each missing attempt. Correction guidance accuracy is therefore:

~~~text
STRUCTURAL_CORRECTION_GUIDANCE_ACCURATE=partial
~~~

The guidance did not authorize a semantic relaxation or transform the
reference. It was not specific enough to expose the actual host-reference
violation. No correction prompt change was made.

## 5. Root-cause classification

~~~text
ROOT_CAUSE=PARSER_DIAGNOSTIC_DEFECT
OWNING_LAYER=strict parser diagnostic attribution in parseOperationSemantic; qualification-only independent-fault diagnostic
FIRST_FAILING_BOUNDARY=STRICT_PARSER_REJECTION
FIRST_ACTUAL_CHECK=reference_not_allowlisted at existingRefs[0]
VIOLATION_1=MODEL_SEMANTIC_CONTRACT_VIOLATION: existingRefs[0] was not in the host allowlist
VIOLATION_2=NONE in the exact retained historical body
SECONDARY_UNREACHED_OR_MASKED_BOUNDARY=semantic validity, kernel binding, fencing, and Authority were not reached
REPORT_VS_JSON_CONTRADICTION=RESOLVED
SCHEMA_PARSER_CONTRACT=INTENTIONAL_LAYERING_PROVEN
~~~

The old artifact's wrong_type/purpose value was not evidence that purpose was
invalid. It was the result of diagnostic attribution after a later
existingRefs allowlist predicate failed. The host-context reference violation
remains a genuine model output violation. The primary classification is the
host diagnostic defect because that defect caused the disputed report to name
the wrong field.

The repair was the deepest common repair for the proven defect: split the
parser predicates and add qualification-only independent diagnostics. It did
not special-case effect_intent sample 0. It did not remove allowlist
enforcement, coerce values, transform reference IDs, or change the schema.

## 6. Settlement sample 0

The prior complete W2 run independently captured:

~~~text
case=settlement sample 0
firstFailureBoundary=SEMANTIC_VALIDITY_REJECTION
independentFailureCodes=semantic_invalid
dependentNotReachedGates=fencing,authorityReachability
captured cause=speech.mode=draft without a non-empty speech.surfaceDraft
~~~

The new stochastic exact-candidate run passed settlement sample 0. That does
not erase the prior captured semantic-invalid witness because the parser
diagnostic repair did not change settlement semantics or the qualification
acceptance rule. No settlement code was changed.

~~~text
SETTLEMENT_SAMPLE_0_STATUS=STILL_INDEPENDENT_FAILURE
~~~

## 7. Exact-candidate verification

### Focused tests and build

~~~text
candidate=51351f86a9e0a930ce58f4b0e59c487d5eaea300
focused command=npm test --prefix apps/agent-service -- src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts src/core/cognitive-v021/thought/semantic-output-contract.test.ts src/core/cognitive-v021/thought/run.test.ts src/core/model-routing/adapters/mistral-adapter.test.ts src/core/cognitive-v021/authority/barrier.test.ts
focused result=5 files passed; 44 tests passed
build command=npm run build --prefix apps/agent-service
build result=PASS
~~~

The focused tests include the exact captured replay, purpose positive and
negative cases, allowlisted and disallowed reference cases, the multi-fault
diagnostic, production fail-fast behavior, tri-state dependent-gate behavior,
and the existing barrier identity tests.

### Full deterministic corpus

~~~text
command=npm run test --prefix apps/agent-service -- --no-file-parallelism --reporter=dot
testFiles=371 passed
tests=2312 passed
skipped=2
failed=0
result=PASS
durationSeconds=1006.64
~~~

### Isolated Mint build

~~~text
host=QXY
checkout=/tmp/ashley-phase5-w2-first-boundary-Rv442z/repo
candidate=51351f86a9e0a930ce58f4b0e59c487d5eaea300
dependency preparation=six required package installs completed
TypeScript build=PASS
active production checkout touched=no
~~~

### Exact-candidate full W2 requalification

The new full W2 artifact is:

~~~text
path=C:\Users\Xharv\Projects\composer-assistant-w2-first-boundary-9cf\work\phase5-w2-full-diagnostic-51351f86a9e0a930ce58f4b0e59c487d5eaea300\w2-route-qualification.json
sha256=189fa4d0e88a84b1e143f4271c3e721190e94bb0babd4a79f0382ddc47a6b289
runId=w2-20260901T095504421Z-bf77b0cb-cd3d-440b-bc9f-cded1716640e
environment=isolated_live
provider=mistral
model=mistral-small-2603
reasoning=high
wireMode=native_json_schema
wireFormat=mistral_response_format_json_schema
wireBindingId=compat_thought_mistral_small_2603_native_json_schema_v2
fallback=none
credential=primary_only
occupantId=mfo_mistral_small_2603_high
providerDeclaredEnforcement=unavailable
caseEvaluations=12
providerAttempts=14
caseVerdicts=10 PASS, 2 NOT_QUALIFIED
verdict=NOT_QUALIFIED
~~~

Gate counts in the new artifact are:

~~~text
transportPass=12
jsonSyntaxPass=12
closedSchemaPass=12
strictParserPass=11
kernelBindingPass=11
semanticValidityPass=11
fencingPass=10
authorityReachabilityPass=10
resourcePolicyPass=12
~~~

The two additional provider attempts beyond the twelve cases were the two
bounded structural corrections for effect_intent sample 0. All fourteen
attempts have provider attempt IDs in the new artifact. There are no zero
attempt rows in this requalification.

#### Exact retained new failure bodies

The new effect_intent sample 0 response passed transport, JSON syntax, and
closed-schema checks, then failed the strict parser:

~~~json
{
  "kind": "effect_intent",
  "operationKind": "workspace.read_file",
  "request": {
    "filePath": "qualification-fixture/sample.txt"
  },
  "purpose": "Demonstrate semantic branch structure for qualification without executing any effect",
  "expectedOutcome": "The file content at qualification-fixture/sample.txt would be returned if executed",
  "existingRefs": ["qualification-fixture"]
}
~~~

Its durable result is:

~~~text
firstFailureBoundary=STRICT_PARSER_REJECTION
parserErrorCode=reference_not_allowlisted
parserPath=existingRefs
hostAllowlistedReferences=["turn-1"]
dependentNotReachedGates=kernelBinding,semanticValidity,fencing,authorityReachability
~~~

The new effect_intent sample 1 response was:

~~~json
{
  "kind": "abstain",
  "reason": "no_responsible_proposal",
  "explanation": "The user requested to return an effect intent semantic branch without executing any effect. An effect_intent is designed to propose actions for execution; since no actionable request is present in the input, no responsible proposal can be formed.",
  "evidenceRefs": []
}
~~~

It failed at semantic validity because the expected branch was effect_intent.
The separate settlement sample 0 semantic witness from the prior run remains
preserved as described above.

The new run therefore confirms that the repaired candidate reports the
effect-intent reference failure at its owning field, but W2 remains
NOT_QUALIFIED. A stochastic pass on any individual sample would not erase a
reproducible captured contract violation when the contract and owning cause
remain unchanged.

## 8. Historical NIM zero-attempt rows and evidence limits

The two historical NIM abstain rows remain:

~~~text
providerAttemptIds=0
elapsedMs=approximately 7-9
wireMode=absent
wireBinding=absent
capabilityFingerprint=absent
rawContent=empty
classification=NOT_DEMONSTRATED_NIM_FAILURE
firstFailureBoundary=UNKNOWN
countedTowardProviderReliability=no
~~~

Their first failure boundary cannot be identified from the retained artifact.
The artifact does not prove dispatch, provider allocation, or a NIM response.
They are excluded from model/provider reliability. No rerun was performed to
recover their missing data.

Across the old artifacts, raw provider response bodies were not durably
retained. Normalized semantic text, byte counts, digests, parser diagnostics,
and bounded failure metadata are available only where the artifact records
them. Missing bodies and missing per-attempt diagnostics are not reconstructed.

## Final release boundary

~~~text
CURRENT_WIRE_BINDING_NOT_QUALIFIED_FOR_THOUGHT_CONTRACT=no
CURRENT_WIRE_BINDING_NATIVE_REQUEST_PATH=PROVEN
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
THOUGHT_CONTRACT_QUALIFIED=no
READY_FOR_W3_STAGE_H=no
PRODUCTION_MUTATION=no
DEPLOYMENT_PERFORMED=no
W9_STARTED=no
~~~

The native Mistral JSON Schema binding was not changed. The corrected source
candidate only repaired parser diagnostic attribution and added
qualification-only diagnostic coverage. The closure stops here.
