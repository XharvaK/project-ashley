# W2 Qualification Semantics and True Structural-Correction Closure

Recorded: 2026-09-01

## Scope and disposition

This is the bounded Phase 5 W2 semantics and structural-correction closure
record. It does not redesign Thought, change the successor semantic contract,
loosen the strict parser, change the provider, model, reasoning effort, wire
binding, activation policy, deployment, W3, or W9.

The source candidate was repaired and passed local source verification. It was
then prepared and built in an isolated Mint checkout. One exact live W2 run was
performed from that checkout. The live candidate remained `NOT_QUALIFIED`.

Naturalistic fixture failures were retained as durable evidence. No second live
run was performed.

## A. Exact identities

| Item | Identity |
|---|---|
| Production checkout SHA | `573393c3fdb2392a45137d4625635658eb4b5d88` |
| Prior source candidate | `befe6a2d219c23d44082b1b01a8c9df43ac154de` |
| New source candidate | `fe7c923888e16b06fa58c7b1469e553a587661b4` |
| Branch | `codex/phase5-w2-first-boundary-diagnostic` |
| Mint host | `QXY` / SSH alias `mint` |
| Isolated checkout | `/tmp/ashley-phase5-w2-fe7c923` |
| Provider | `mistral` |
| Model | `mistral-small-2603` |
| Reasoning effort | `high` |
| Fallback | none |
| Wire mode | `native_json_schema` |
| Wire format | `mistral_response_format_json_schema` |
| Wire binding | `compat_thought_mistral_small_2603_native_json_schema_v2` |
| Logical binding | `ashley.thought.semantic.v1` |
| Schema fingerprint | `sha256:9bf27fc16755f26917ab2eeae55010b7a94212c593847aa37e5e4a634563fb9b` |
| Capability fingerprint | `sha256:57c2c88b32baea5182548dd73728688d36016722ab135a73020b700268034062` |
| Live run ID | `w2-20260901T140705421Z-fb602290-d0e8-4e7c-a30f-28c73c35b45f` |
| Durable live artifact SHA-256 | `9e602754ce5b14bf7f100aeb1bf37995233e11a8599460a4c56d877682d9e8c1` |

The source candidate was pushed before the isolated Mint build. The remote
branch resolved to the exact new candidate SHA. The isolated checkout had
generated package-lock changes from dependency preparation only; the checked
out source remained at the exact candidate SHA.

## B. Meta-fixture causal finding

### Prior fixture prompts

The prior live semantic fixture owner messages explicitly named the internal
semantic branches:

```text
Return the settlement semantic branch for the bounded qualification case.
Return the observation intent semantic branch for the bounded qualification case.
Return the effect intent semantic branch without executing any effect.
Return the abstain semantic branch because the fixture has insufficient evidence.
```

Those strings made the qualification input prescribe the branch that the run
was intended to measure. The frozen architecture and W2 contract do not require
internal branch names in `rawConversation`.

### Repaired fixture prompts

The live semantic fixture now uses these exact owner messages:

```text
Please acknowledge the supplied qualification message using only the evidence already present.
Please read README.md from the approved qualification-fixture project and report its current contents.
Please run the approved read-only verification for the qualification-fixture workspace and report the result without changing any files.
Please tell me what is in the private attachment; no attachment content is available in this qualification context.
```

The structural-correction fixture uses:

```text
Please answer only from the supplied evidence; no additional evidence is available.
```

The stale-before-publish and authority-revision fixtures use the natural
settlement message. None of these messages contains `settlement`,
`observation_intent`, `effect_intent`, `abstain`, or `semantic branch`.

`META_FIXTURE_DEFECT=PROVEN`. The old fixture authority was not a valid test of
branch selection. The repaired live run still exposed provider semantic
branch-selection failures, which is separate evidence and does not undo the
fixture defect finding.

## C. Fixture result matrix

The fixture output objects remain exact source-shaped Thought outputs. The
fixture-only `qualification-fixture-workspace` identifier is deterministic
test data. It is not live production workspace state.

### Settlement

Owner message:

```text
Please acknowledge the supplied qualification message using only the evidence already present.
```

Exact fixture result:

```json
{
  "kind": "settlement",
  "interpretation": {
    "discourseActs": ["inform"],
    "referentBindings": [{"span": "fixture", "sourceTurnRefs": ["turn-1"]}],
    "corrections": [],
    "unresolvedAmbiguities": [],
    "topics": ["qualification"]
  },
  "commitments": {
    "epistemic": [],
    "conversational": ["answer"],
    "stance": {
      "warmth": "medium",
      "humorAllowed": false,
      "disagreement": false,
      "uncertaintyDisplay": true
    }
  },
  "speech": {
    "mode": "draft",
    "mustSay": ["The fixture is verified."],
    "mustNotSay": [],
    "surfaceDraft": "The fixture is verified.",
    "acceptableRealizations": [],
    "presentationDirectives": []
  },
  "workingContextDeltas": [],
  "concernDeltas": [],
  "occupancyDeltas": [],
  "futureTriggerDeltas": [],
  "subscriptionDeltas": [],
  "durableNominations": [],
  "evidenceUse": {
    "observationRefsUsed": [],
    "retrievalRefsUsed": [],
    "sourceRefsUsed": ["turn-1"],
    "openIntentRefs": []
  }
}
```

### Observation intent

Owner message:

```text
Please read README.md from the approved qualification-fixture project and report its current contents.
```

Exact fixture result:

```json
{
  "kind": "observation_intent",
  "operationKind": "project.read_file",
  "request": {
    "version": 2,
    "operation": "project.read_file",
    "projectId": "qualification-fixture",
    "path": "README.md"
  },
  "purpose": "read the approved project file",
  "evidenceNeed": "the current file contents",
  "existingRefs": ["turn-1"]
}
```

### Effect intent

Owner message:

```text
Please run the approved read-only verification for the qualification-fixture workspace and report the result without changing any files.
```

Exact fixture result:

```json
{
  "kind": "effect_intent",
  "operationKind": "workspace.verify",
  "request": {
    "version": 2,
    "operation": "workspace.verify",
    "projectId": "qualification-fixture",
    "workspaceId": "qualification-fixture-workspace",
    "recipeId": "typescript_fixture_compile_v1"
  },
  "purpose": "run the approved read-only workspace verification",
  "expectedOutcome": "the mechanical verification result is reported without changing files",
  "existingRefs": ["turn-1"]
}
```

### Abstain

Owner message:

```text
Please tell me what is in the private attachment; no attachment content is available in this qualification context.
```

Exact fixture result:

```json
{
  "kind": "abstain",
  "reason": "insufficient_evidence",
  "explanation": "The fixture contains no more evidence.",
  "evidenceRefs": ["turn-1"]
}
```

### Structural-correction fixture

The first fixture candidate is the exact abstain object above with only this
change:

```json
{
  "kind": "abstain",
  "reason": "insufficient_evidence",
  "explanation": "The fixture contains no more evidence.",
  "evidenceRefs": ["not-allowlisted"]
}
```

The bounded correction may replace only `evidenceRefs` with the host-allowlisted
value `["turn-1"]`. The kind and every other field remain unchanged.

## D. Previous structural-correction path

Before the repair, the correction path sent:

1. the code-owned system contract and correction guidance; and
2. the original projected Thought input.

It did not send the previous model-authored semantic candidate as data. The
model therefore received the failure code, parser path, expected shape, and
host context without receiving the exact object that it was asked to repair.

The host did not own a candidate replacement. It did not synthesize a semantic
JSON object. The strict parser remained the first authority over model output.

The prior durable failure evidence contained raw-content byte counts and
digests, parser or semantic diagnostics, and allowlisted-reference context. It
did not establish a safe host-side semantic replacement.

## E. Repaired structural-correction path

The repaired path is:

```text
initial model output
  -> JSON extraction
  -> closed-schema validation
  -> strict Thought parser
  -> if localizable: system correction guidance
                    + unchanged projected input
                    + previous model-authored candidate as data
                    + failure code, failing path, exact constraint,
                      allowed scope, and host allowlist
  -> provider correction output
  -> JSON extraction
  -> closed-schema validation
  -> strict Thought parser
  -> host structural-scope validation
  -> kernel binding, semantic validity, fencing, and authority reachability
```

The candidate data is carried in a separate user message with the explicit
role `model_authored_data`. It is not promoted to authority. It is not inserted
into the system contract. The correction data contains:

```json
{
  "structuralCorrection": {
    "candidateRole": "model_authored_data",
    "previousCandidate": "<the exact parsed model candidate>",
    "failureCode": "reference_not_allowlisted",
    "failingPath": "existingRefs",
    "constraint": "Every reference must be present in the host allowlist.",
    "allowedRepairScope": {
      "kind": "localized",
      "path": "existingRefs",
      "preserveOutsidePath": true
    },
    "hostAllowlistedReferenceIds": ["turn-1"]
  }
}
```

For the tested effect-intent reference case, the previous candidate is an
`effect_intent` object with `existingRefs: ["not-allowlisted"]`. A valid
correction may change only `existingRefs` to the host-allowlisted reference.

If the correction returns `kind: "settlement"` for that previous
`effect_intent` candidate, the host returns the typed
`structural_correction_scope_violation` failure. It does not accept the
settlement, replace the semantic object locally, or publish it.

## F. Localizable and global failure taxonomy

The exact localizable parser classes are:

```text
wrong_type
invalid_enum
reference_not_allowlisted
operation_not_registered
```

A correction is localized only when the previous output is a valid JSON object
with a recoverable permitted semantic kind and the parser supplies a local
field/path. The path is bounded by the host correction policy.

The global classes include:

```text
invalid_json
root_not_object
wrong_kind
```

Global failures have no local candidate or local repair path. They use bounded
global regeneration. The host does not invent a missing object or select a
semantic kind on behalf of the model.

## G. Mechanical preservation invariants

For a localized correction, the host enforces all of these conditions after the
corrected output passes the strict parser:

1. The corrected semantic kind equals the previous model-authored kind.
2. Every field outside the permitted path or subtree is semantically identical.
3. Object key ordering is irrelevant to semantic equality.
4. Any array or nested value outside the permitted path is preserved.
5. A changed path outside the permitted path produces
   `structural_correction_scope_violation`.
6. A corrected kind change produces the same typed scope violation.
7. The host never synthesizes a replacement semantic object.
8. The host allowlist remains host-owned and cannot be expanded by model output.
9. Correction attempts retain bounded generation, cycle, and attempt identity
   semantics.
10. A correction must still pass the existing strict parser and all later
    kernel, semantic, fencing, and authority gates.

`parseThoughtSemanticOutput` was not loosened or changed by this repair.

## H. Historical witness and pre-dispatch evidence

The source-derived W2 lifecycle supports a historical witness transition from
`NOT_QUALIFIED` to `EXPANSION_SELECTION_GATE_REQUIRED`. It does not authorize a
permanent veto. The current exact run was allowed to execute after the source
repair and gate verification.

`HISTORICAL_WITNESS_PERMANENT_VETO=NOT_SOURCE_AUTHORIZED`.

### Historical zero-attempt rows

The previously inspected artifact

```text
C:\Users\Xharv\Projects\composer-assistant-audit-573393c\work\phase5-w2-live-candidate-8c3c470\w2-route-qualification.json
```

contains two abstain rows with:

```text
providerAttemptIds = []
elapsedMs = 9 and 7
wire metadata = absent
capability fingerprint = absent
raw content = empty
```

Those rows are `NOT_DEMONSTRATED_NIM_FAILURE`. Their stored first failure
boundary is `UNKNOWN`. The evidence does not show that a request reached NIM,
so they are not counted toward model or provider reliability.

### Current live transport row

The new exact live artifact has one different abstain row with a provider
attempt ID. Its durable diagnostics are:

```text
transport = failure
elapsedMs = 30009
firstFailureBoundary = PROVIDER_ERROR_RESPONSE
errorCode = mistral_unavailable
dispatchTruth = response_received
dispatchStage = provider_dispatch
providerRequestStarted = true
providerResponseReceived = true
```

This is reported separately from the historical zero-attempt rows. It is a
provider-dispatch availability failure, not a semantic-contract response. It
does not establish model incapability.

## I. Raw-response retention and observability

The inspected qualification artifacts contain raw-content byte counts and
SHA-256 digests. They do not contain exact raw provider response bodies. The
available historical artifacts contain no companion raw-response log.

```text
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
```

The current artifact additionally retains normalized semantic text for some
captured failures. That is not the exact raw provider response body.

The prior NIM compatibility artifact retains the closed-schema diagnostic
`oneOf_mismatch:$`, but it does not retain the response body needed to identify
the exact failing one-of branch or structural difference. Therefore:

```text
QUALIFICATION_OBSERVABILITY_LIMITATION=PROVEN
EXACT_PRIOR_ONEOF_STRUCTURAL_DIFFERENCE=NOT_DETERMINABLE_FROM_DURABLE_EVIDENCE
```

This evidence limitation is separate from model capability. The prior result
proves the then-current wire binding was not qualified. It does not prove that
`openai/gpt-oss-20b` is fundamentally incapable of the successor Thought
contract.

```text
CURRENT_WIRE_BINDING_NOT_QUALIFIED=PROVEN_FOR_THE_PRIOR_NIM_COMPATIBILITY_RUN
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
```

## J. Tests and source changes

The bounded source change is commit
`fe7c923888e16b06fa58c7b1469e553a587661b4`.

Changed source and tests:

```text
apps/agent-service/src/core/cognitive-v021/types.ts
apps/agent-service/src/core/cognitive-v021/thought/structural-feedback.ts
apps/agent-service/src/core/cognitive-v021/thought/structural-feedback.test.ts
apps/agent-service/src/core/cognitive-v021/thought/projection-allocator/allocator.ts
apps/agent-service/src/core/cognitive-v021/thought/run.ts
apps/agent-service/src/core/cognitive-v021/thought/run.test.ts
apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts
```

The tests prove:

- the correction packet contains the exact previous model candidate as data;
- a localized correction carries only the allowed path and host allowlist;
- kind drift is rejected;
- unrelated-field drift is rejected;
- every localizable parser class preserves kind;
- global failures do not receive local correction scope;
- the correction path retains fresh attempt, cycle, and generation identity;
- the host does not replace semantic JSON locally;
- internal branch-name mentions in owner messages do not force a semantic
  branch;
- naturalistic fixture messages do not contain internal branch names;
- the fixture outputs use source-shaped observation and workspace verification
  requests;
- the strict parser contract remains unchanged.

## K. Local and isolated verification

The test-first red run preceded the production changes:

```text
3 files: 22 passed, 8 failed
```

After the repair:

```text
Focused structural/qualification run: PASS — 3 files / 30 tests
Fresh parser/Thought/W2 focused run: PASS — 4 files / 36 tests
Full Thought subtree: PASS — 18 files / 60 tests
Local agent build: PASS
Full agent-service corpus: PASS — 372 files / 2322 passed / 2 skipped / 0 failed
Full corpus duration: 1026.18 seconds
Git whitespace check: PASS
```

The required full corpus command was:

```text
npm test --prefix apps/agent-service -- --no-file-parallelism --reporter=dot
```

The fresh focused command was:

```text
npm test --prefix apps/agent-service -- --run src/core/cognitive-v021/thought/structural-feedback.test.ts src/core/cognitive-v021/thought/run.test.ts src/core/cognitive-v021/thought/semantic-output-contract.test.ts src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts
```

The isolated Mint preparation initially failed because a fresh clone had no
built declarations for linked local `@composer-assistant/*` packages. That
preparation-only condition was corrected by installing and building the linked
packages in dependency order. The final exact-candidate isolated build passed:

```text
apps/sandbox-policy: PASS
apps/sandbox-m1: PASS
apps/sandbox-tree: PASS
apps/sandbox-broker: PASS
apps/sandbox-v2: PASS
apps/agent-service: PASS
```

No source files were changed on Mint.

## L. Exact live W2 qualification

The one live command was run only after the source candidate was frozen,
pushed, isolated, and built:

```text
ASHLEY_RELEASE_ID=fe7c923888e16b06fa58c7b1469e553a587661b4 MISTRAL_REASONING_EFFORT=high npx tsx apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts --live --provider mistral --model mistral-small-2603 --no-fallback --samples 3 --candidate-sha fe7c923888e16b06fa58c7b1469e553a587661b4 --output /tmp/ashley-phase5-w2-fe7c923-run-20260901
```

Durable preflight proves:

```text
buildIdentity = fe7c923888e16b06fa58c7b1469e553a587661b4
provider = mistral
model = mistral-small-2603
wireMode = native_json_schema
wireFormat = mistral_response_format_json_schema
fallback = none
```

The exact result was:

```text
cases = 12
provider attempts = 16
PASS = 3
NOT_QUALIFIED = 9
W2 verdict = NOT_QUALIFIED
```

Case disposition:

| Case family | Result | First-failure evidence |
|---|---:|---|
| settlement | 3/3 PASS | provider content received; all semantic and authority gates passed |
| observation_intent | 0/3 | two samples exhausted strict-parser correction attempts after `wrong_type` at `evidenceUse`; one returned a settlement and failed semantic branch validity |
| effect_intent | 0/3 | returned settlement-shaped content; semantic branch mismatch / semantic invalid |
| abstain | 0/3 | one separate `mistral_unavailable` provider-dispatch failure; two returned settlement-shaped content and failed semantic branch validity |

All actual content responses in this run used the native JSON-Schema wire mode.
The live failures therefore do not reproduce the prior NIM compatibility-mode
binding defect. They also do not prove fundamental model incapability. They
show that this exact model/reasoning/binding candidate did not satisfy the full
naturalistic W2 semantic branch matrix in this run.

The artifact was copied without normalization to:

```text
C:\Users\Xharv\Projects\composer-assistant-w2-first-boundary-9cf\work\phase5-w2-semantics-structural-closure\w2-route-qualification.json
```

## Terminal result

```text
W2_QUALIFICATION_SEMANTICS_CLOSURE=REJECT
META_FIXTURE_DEFECT=PROVEN
STRUCTURAL_CORRECTION_SEMANTIC_PRESERVATION_DEFECT=PROVEN
HISTORICAL_WITNESS_PERMANENT_VETO=NOT_SOURCE_AUTHORIZED
SOURCE_CANDIDATE_SHA=fe7c923888e16b06fa58c7b1469e553a587661b4
FOCUSED_TESTS=PASS — fresh focused run: 4 files / 36 tests
BUILD=PASS — local agent build
FULL_CORPUS=PASS — 372 files / 2322 passed / 2 skipped / 0 failed
ISOLATED_MINT_BUILD=PASS — exact candidate on QXY
POST_REPAIR_W2=NOT_QUALIFIED
POST_REPAIR_CASES=12
POST_REPAIR_PROVIDER_ATTEMPTS=16
THOUGHT_CONTRACT_QUALIFIED=no
READY_FOR_W3_STAGE_H=no
PRODUCTION_MUTATION=no
DEPLOYMENT_PERFORMED=no
W9_STARTED=no
ARTIFACT=C:\Users\Xharv\Projects\composer-assistant-w2-first-boundary-9cf\work\phase5-w2-semantics-structural-closure\w2-route-qualification.json
```

## M. Current model-facing semantic branch pass

This section records the subsequent bounded model-facing semantic branch audit,
repair, exact-candidate Mint preparation, and one authorized live W2 run. The
earlier sections and their terminal fields are historical evidence for the
previous candidate `fe7c923888e16b06fa58c7b1469e553a587661b4`. This section is
the current closure for the candidate below. No second live W2 was performed.

### M.1 Exact identity and durable artifact

```text
PRODUCTION_CHECKOUT_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
PRIOR_SOURCE_CANDIDATE_SHA=fe7c923888e16b06fa58c7b1469e553a587661b4
SOURCE_CANDIDATE_SHA=8406ba405ab98a31620493ca6f0e53922d4d2103
BRANCH=codex/phase5-w2-first-boundary-diagnostic
MINT_ISOLATED_CHECKOUT=/home/xarvak/ashley-phase5-w2-8406ba4
MINT_ISOLATED_SHA=8406ba405ab98a31620493ca6f0e53922d4d2103
PROVIDER=mistral
MODEL=mistral-small-2603
REASONING_EFFORT=high
FALLBACK=none
WIRE_MODE=native_json_schema
WIRE_FORMAT=mistral_response_format_json_schema
LOGICAL_CONTRACT=ashley.thought.semantic.v1
SCHEMA_ID=ashley.thought.semantic.v1.schema
SCHEMA_FINGERPRINT=sha256:211999500e31d81d66bbf4af2bbe50076b1eb1abb7ac2c2e14a27ffafc9335e3
CAPABILITY_FINGERPRINT=sha256:41a568f69c3bb716990f6d96fb30e0f0e3fc5e54875ddeb3733c2ffd46371af9
LIVE_RUN_ID=w2-20260901T155054948Z-fa13f4aa-3dc0-41f6-9663-eadafa1fd984
LIVE_ARTIFACT_SHA256=sha256:db3f6ae59c2c6c57e6566b9e4a24ae7bf8dc8603f6fd46e8d065605d41410e52
LIVE_ARTIFACT=work/phase5-w2-semantics-structural-closure/w2-route-qualification-8406ba4.json
```

The candidate was committed and pushed before Mint preparation. Mint was a new
isolated clone. Locked dependencies were installed and these packages were
built in dependency order:

```text
apps/sandbox-policy: PASS
apps/sandbox-m1: PASS
apps/sandbox-tree: PASS
apps/sandbox-broker: PASS
apps/sandbox-v2: PASS
apps/agent-service: PASS
```

Mint reported the exact candidate SHA and no source or package-lock changes.
The active Mint production checkout was not updated.

### M.2 Q1-Q7 source prosecution

#### Q1 — Branch selection is now explicit at the model boundary

Before this bounded repair, the generated model-facing contract enumerated the
four permitted forms but did not explain when to select them. The generated
system contract now contains these exact selection rules from
`thoughtOutputCompatibilityInstruction()`:

```text
Semantic selection rules: choose settlement only when the current supplied evidence and context are sufficient to author the semantic answer without first acquiring additional evidence or performing a governed effect; choose observation_intent when the answer requires additional read-only evidence acquisition through a registered observation capability; choose effect_intent when the requested outcome requires a governed mechanical effect through a registered effect capability; choose abstain when required evidence, capability, or an admissible basis is absent or unresolved.
Do not use settlement as a placeholder for an unperformed observation or effect. If a required observation or effect cannot be truthfully authored from the current admissible context, use abstain rather than claim completion.
Capability reality is host-owned input: operationCapabilities identify available operations, their observation/effect class, request fields, operator-bound fields, and authorized project IDs. Use only available operations and authorized IDs; operation metadata does not choose the semantic branch for you.
```

The generated Thought message also now says:

```text
Code validates identity, authority, speech licensing, and publication.
```

It no longer says that code validates semantics. The current determination is:

```text
BRANCH_SELECTION_SEMANTICS_EXPLICIT=yes
PRE_REPAIR_BRANCH_SELECTION_SEMANTICS_EXPLICIT=no
MODEL_SEMANTIC_AUTHORITY_RETAINED=yes
HOST_SEMANTIC_BRANCH_SELECTION_ADDED=no
```

#### Q2 — The shape-only statement is now scoped correctly

The final generated contract retains this exact ending:

```text
This contract describes output shape only; branch selection is Thought-owned, while Ashley code remains authoritative for identity, authority, licensing, and publication.
```

The first clause describes schema ownership. It no longer stands alone as the
only model-facing semantic guidance. The second clause explicitly assigns
branch selection to Thought and retains code ownership of identity, Authority,
licensing, and publication.

```text
SHAPE_ONLY_MISFRAMING_PRE_REPAIR=PROVEN
SHAPE_ONLY_STATEMENT_CURRENT_SCOPE=NON_SEMANTIC_HOST_AUTHORITY_AND_PUBLICATION
```

#### Q3 — The native schema does not structurally force settlement

The exact schema sent through the Mistral native path has a root `oneOf` in
this order:

```text
1 settlement
2 observation_intent
3 effect_intent
4 abstain
```

The order is real, but it is not causal proof of settlement bias. Every branch
has `additionalProperties: false`, a distinct `kind` const, and distinct
required fields. No branch structurally subsumes another. The operation
request object is intentionally permissive because the registered operation
binding owns the operation-specific request contract.

The repair added branch `description` annotations to the exact native schema.
The Mistral adapter preserves the schema unchanged and emits:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "ashley.thought.semantic.v1.schema",
      "strict": true,
      "schema": "the exact THOUGHT_OUTPUT_SCHEMA"
    }
  }
}
```

The adapter regression test compares the serialized schema to
`thoughtOutputStructuredRequest().schema`. The live artifact reports
`wireMode=native_json_schema` and
`wireFormat=mistral_response_format_json_schema` for every content response.
`providerDeclaredEnforcement=unavailable` is only provider metadata. It does
not negate the captured native request binding.

The older NIM artifact remains separately classified as
`CURRENT_WIRE_BINDING_NOT_QUALIFIED`: its route selected
`json_object_compatibility`, and the stored evidence cannot establish whether
the NIM endpoint supports a stronger mode. The source-selected compatibility
binding is explained by the Model Fabric rule that native mode is selected only
when the current occupant has a trusted native `structuredOutputBinding`; the
NIM compatibility occupant did not have that binding. No source evidence proves
that NIM endpoint capability or authorizes changing that binding in this pass.

```text
SCHEMA_BRANCH_ORDER_SETTLEMENT_FIRST=yes
SCHEMA_BRANCH_OVERLAP_OR_SUBSUMPTION=disproved
SCHEMA_BRANCH_DESCRIPTIONS_PRESENT=yes
NATIVE_SCHEMA_PRESERVED_BY_MISTRAL_ADAPTER=yes
CURRENT_MISTRAL_NATIVE_BINDING_DEFECT=not_proven
CURRENT_NIM_WIRE_BINDING_NOT_QUALIFIED=proven
MODEL_FUNDAMENTALLY_INCAPABLE_FROM_SCHEMA_EVIDENCE=not_proven
```

#### Q4 — Operation capabilities are visible without giving the host semantic authority

The current projected `CapabilityReality.operationCapabilities` is:

```json
[
  {
    "operationKind": "project.read_file",
    "semanticClass": "observation",
    "available": true,
    "requiredRequestFields": ["projectId", "path"],
    "optionalRequestFields": [],
    "operatorBoundRequestFields": [],
    "authorizedProjectIds": ["qualification-fixture"]
  },
  {
    "operationKind": "workspace.verify",
    "semanticClass": "effect",
    "available": true,
    "requiredRequestFields": ["projectId"],
    "optionalRequestFields": ["workspaceId", "recipeId"],
    "operatorBoundRequestFields": ["workspaceId", "recipeId"],
    "authorizedProjectIds": ["qualification-fixture"]
  }
]
```

This descriptor is serialized in the required capability projection used by
the Thought allocator. It contains no `expectedKind`, `semanticBranch`, or
equivalent host-selected answer. `workspaceId` and `recipeId` are operator
control-plane facts. The source-defined verification binding resolves them
when the unique current candidate makes them safely inferable; their omission
from the model-facing capability descriptor is not a capability defect.

```text
PRE_REPAIR_OPERATION_SEMANTIC_CLASS_VISIBLE=no
PRE_REPAIR_OPERATION_REQUEST_METADATA_VISIBLE=partial
CURRENT_OPERATION_SEMANTIC_CLASS_VISIBLE=yes
CURRENT_OPERATION_REQUEST_METADATA_VISIBLE=yes
HOST_EXPECTED_BRANCH_EXPOSED=no
```

#### Q5 — Abstain is a distinct semantic branch

The current contract defines `abstain` as the semantic choice when required
evidence, capability, or an admissible basis is absent or unresolved. It
explicitly distinguishes that choice from a provider, parser, or deadline
failure. The natural owner prompt contains no internal branch name.

The current live abstain family passed two of three samples. The one rejected
sample was a provider error with no semantic response and is not evidence that
the model confused abstention with conversational refusal.

```text
ABSTAIN_SEMANTIC_DISTINCTION_CURRENT=explicit
ABSTAIN_INTERNAL_BRANCH_NAME_IN_OWNER_PROMPT=no
```

#### Q6 — Settlement is no longer presented as the general fallback form

Before repair, settlement was the first listed full conversational form and
the only form with a detailed shape instruction. Observation, effect, and
abstain had no separate model-facing selection law. That framing made a
settlement-shaped response a plausible general conversational fallback.

The current contract gives all four forms a semantic description and expressly
prohibits settlement as a placeholder for an unperformed observation or effect.
This is a model-facing contract repair, not a host fallback or a parser change.

```text
PRE_REPAIR_SETTLEMENT_GENERAL_FALLBACK_FRAMING=proven
CURRENT_SETTLEMENT_GENERAL_FALLBACK_FRAMING=disproved
```

#### Q7 — Semantic-kind mismatch is not a localized structural correction

The source path distinguishes parser-local field failures from semantic-kind
mismatches. The qualification harness now checks the expected semantic kind
before it schedules localized structural correction:

```text
previousCandidate.kind=settlement
expectedKind=observation_intent
localized structural correction=no

previousCandidate.kind=effect_intent
failingPath=existingRefs
same-kind localized correction=allowed

corrected kind drift=scope violation
outside-path drift=scope violation
```

The expected kind is a qualification-side gate. It is not inserted into the
model prompt. The host still does not rewrite `kind`, choose a branch, or
synthesize a semantic replacement.

```text
LOCAL_STRUCTURAL_CORRECTION_CLASSIFICATION_DEFECT=proven_and_repaired
SEMANTIC_KIND_MISMATCH_TREATED_AS_LOCAL_FIELD_ERROR=current_path_no
STRICT_PARSER_CHANGED=no
```

### M.3 Root-cause classifications

The already accepted findings remain:

```text
META_FIXTURE_DEFECT=PROVEN
STRUCTURAL_CORRECTION_SEMANTIC_PRESERVATION_DEFECT=PROVEN
HISTORICAL_WITNESS_PERMANENT_VETO=NOT_SOURCE_AUTHORIZED
```

The current bounded audit classifies the material findings as follows.

| Classification | Status | Source evidence | Relevance to the prior 9 W2 failures / current result |
|---|---|---|---|
| `A_MODEL_FACING_SEMANTIC_CONTRACT_DEFECT` | `PROVEN` | Pre-repair generated contract enumerated shapes without branch-selection law and framed the contract as shape-only. The current contract now contains explicit four-way selection semantics. | `HIGH`; the repaired observation/effect/abstain results show this seam was causally material. |
| `B_CAPABILITY_PROJECTION_DEFECT` | `PROVEN` | Pre-repair `CapabilityReality` exposed booleans and approved IDs but not operation class, required fields, operator-bound fields, or operation-specific authorized IDs. | `MEDIUM`; the missing facts could leave Thought unable to form admissible operation intent. The current operation families passed. |
| `C_NATIVE_SCHEMA_BINDING_DEFECT` | `NOT_PROVEN` | Current Mistral W2 used the native JSON-Schema binding, strict schema request, exact schema fingerprint, and all content responses recorded native wire evidence. The separate historical NIM compatibility result remains not qualified, but no native binding defect is proven from the stored evidence. | `NONE` for the current Mistral result; NIM compatibility remains a separate qualification status. |
| `D_QUALIFICATION_HARNESS_CLASSIFICATION_DEFECT` | `PROVEN` | A settlement candidate with an observation expected kind could previously enter localized field correction. The repaired expected-kind gate blocks that path while preserving same-kind corrections. | `HIGH` for the prior observation failures; no current semantic failure entered correction. |
| `E_OBSERVABILITY_DEFECT` | `PROVEN` | Artifacts retain byte counts, digests, normalized semantic text for selected failures, and chunk metadata, but no exact raw provider response body. The exact historical NIM `oneOf` structural mismatch cannot be determined. | `MEDIUM` for historical causal precision; normalized text is sufficient to establish the current branch mismatch. |
| `F_PROVIDER_AVAILABILITY_ONLY` | `PROVEN` | Current abstain sample 2 has a provider attempt, `providerRequestStarted=true`, `PROVIDER_ERROR_RESPONSE`, `mistral_unavailable`, and about 30 seconds elapsed. | `LOW`; it is not model semantic evidence. |
| `G_MODEL_SEMANTIC_NONCOMPLIANCE` | `PROVEN` | Under the frozen W2 expected-kind contract, all three settlement prompts received valid abstain objects. JSON, closed schema, strict parser, Kernel binding, and request identity passed; semantic validity failed with `semantic_branch_mismatch`. | `HIGH` for the current 3 semantic rejected rows; this is not proof of fundamental incapability. |
| `H_UNKNOWN` | `PROVEN as an evidence classification` | The two older zero-attempt abstain rows have no provider attempt ID, wire mode, binding, capability fingerprint, or content. Their first failure boundary is not established. | `NONE` to model/provider reliability until a first boundary is proven. |

The current run therefore separates the remaining semantic result from the
prior NIM wire result and from provider availability:

```text
CURRENT_W2_REMAINING_SEMANTIC_RESULT=settlement branch mismatch
CURRENT_W2_NATIVE_BINDING_FAILURE=not_proven
CURRENT_W2_MODEL_FUNDAMENTAL_INCAPABILITY=not_proven
CURRENT_W2_ZERO_ATTEMPT_ROWS_COUNTED_AS_PROVIDER_FAILURE=no
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
QUALIFICATION_OBSERVABILITY_LIMITATION=PROVEN
```

### M.4 Repair summary and verification

The bounded repair changed only the proven owning seams:

```text
thought/output-contract.ts
  explicit semantic selection law
  branch descriptions in the native schema
  shape-only statement scoped to host authority/publication

thought/capability-reality.ts and cognitive-v021/types.ts
  host-owned operation descriptors
  observation/effect class
  request-field and operator-bound-field metadata
  authorized project IDs

qualification/thought-capability-qualification.ts
  expected-kind guard before localized correction
  schema-oracle handling for annotation-only descriptions

thought/run.ts
  identity/Authority/licensing/publication wording corrected
```

No provider, model, reasoning effort, fallback, resource ceiling, wall-clock
deadline, strict parser, host semantic conversion, or semantic retry policy was
changed.

The test-first and offline evidence was:

```text
RED focused run before repair: 4 failed / 26 passed
Focused repaired run: PASS — 5 files / 51 tests
Complete cognitive-v0.2.1 subtree: PASS — 106 files / 352 tests
Local agent-service build: PASS
Affected-suite rerun after the first concurrent-corpus failure: PASS — 6 files / 36 tests
Whole-corpus attempt: intentionally stopped before final summary by owner instruction; not rerun
Git whitespace check: PASS
```

The focused affected-suite evidence was accepted for progression. It must not
be restated as a completed whole-corpus result.

### M.5 Exact live W2 result

The single new live command was run only after the frozen candidate was pushed,
the exact SHA was cloned on Mint, and all six isolated package builds passed.
The live run used:

```text
provider=mistral
model=mistral-small-2603
reasoning=high
fallback=none
samples=3 per semantic family
wire_mode=native_json_schema
wire_format=mistral_response_format_json_schema
output_tokens=4096
thought_wall_clock=30s
max_structural_corrections=2
```

The exact durable result is:

```text
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
CASES=12
PROVIDER_ATTEMPTS=12
PASS=8
NOT_QUALIFIED=4
CORRECTION_PACKETS=0

settlement=0/3 PASS
observation_intent=3/3 PASS
effect_intent=3/3 PASS
abstain=2/3 PASS
```

All three settlement failures have the same first failing boundary:

```text
transport=success
wireMode=native_json_schema
jsonSyntax=PASS
closedSchemaConformance=PASS
strictParser=PASS
kernelBinding=PASS
firstFailureBoundary=SEMANTIC_VALIDITY_REJECTION
semanticValidity=FAIL
failureCodes=semantic_branch_mismatch,semantic_invalid
fencing=NOT_REACHED
authorityReachability=NOT_REACHED
```

The normalized semantic texts are durably retained only as normalized text and
digests. They are all `kind=abstain` with
`reason=insufficient_evidence`. Their three digests are:

```text
sha256:236abc5804cd32f0d2bda2195b9cf48936c470629926f04dc4b63309e4362aa6
sha256:554afe331f3e7ff7f172ebbd22a4fff218274800819af3723787afbb59bcc0eb
sha256:1247c78765fcebdf00ce3ec74f49b825cdd71eeceb9025aef9bb50b36ebe17e8
```

The rejected abstain sample is a separate provider-availability row:

```text
providerAttemptId=90e3caed-ed16-47f9-b378-f63e451848e2:attempt:1
firstFailureBoundary=PROVIDER_ERROR_RESPONSE
errorCode=mistral_unavailable
providerRequestStarted=true
providerResponseReceived=true
elapsedMs=30005
wireMode=null
capabilityFingerprint=null
```

It is not counted as a semantic model failure. The two older zero-attempt rows
remain `H_UNKNOWN`; they were not used to characterize this run and were not
rerun.

### M.6 Current terminal result

```text
PHASE5_W2_CAUSAL_CLOSURE=REJECT
ROOT_CAUSE_CLASSIFICATIONS=A_MODEL_FACING_SEMANTIC_CONTRACT_DEFECT:PROVEN;B_CAPABILITY_PROJECTION_DEFECT:PROVEN;C_NATIVE_SCHEMA_BINDING_DEFECT:NOT_PROVEN;D_QUALIFICATION_HARNESS_CLASSIFICATION_DEFECT:PROVEN;E_OBSERVABILITY_DEFECT:PROVEN;F_PROVIDER_AVAILABILITY_ONLY:PROVEN;G_MODEL_SEMANTIC_NONCOMPLIANCE:PROVEN;H_UNKNOWN:PROVEN_AS_BOUNDARY_UNKNOWN
MODEL_FACING_SEMANTIC_CONTRACT_DEFECT=PROVEN
CAPABILITY_PROJECTION_DEFECT=PROVEN
NATIVE_SCHEMA_BINDING_DEFECT=NOT_PROVEN
QUALIFICATION_HARNESS_CLASSIFICATION_DEFECT=PROVEN
OBSERVABILITY_DEFECT=PROVEN
REPAIRS_IMPLEMENTED=explicit branch-selection contract; operation capability projection; expected-kind correction guard; schema annotation oracle support; identity wording correction
FOCUSED_TESTS=PASS — 5 files / 51 tests; affected-suite rerun PASS — 6 files / 36 tests
FULL_CORPUS=NOT_COMPLETED_BY_OWNER_INSTRUCTION
FULL_CORPUS_AFFECTED_SUITE_ACCEPTANCE=PASS
ISOLATED_MINT_BUILD=PASS — exact SHA 8406ba405ab98a31620493ca6f0e53922d4d2103
POST_REPAIR_W2=NOT_QUALIFIED
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
THOUGHT_CONTRACT_QUALIFIED=no
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
READY_FOR_W3_STAGE_H=no
RELEASE_TRUTH_MATCHED=no
DEPLOYMENT_PERFORMED=no
PRODUCTION_MUTATION=no
W9_STARTED=no
EXPANSION_SELECTION_GATE_REQUIRED=yes
NEXT_STEP=owner-approved expansion selection; do not silently substitute a provider or model; do not rerun this W2 unchanged
ARTIFACT=work/phase5-w2-semantics-structural-closure/w2-route-qualification-8406ba4.json
```

No W3 Stage H, release-truth activation evaluation, production checkout
mutation, service restart, deployment, or production acceptance was attempted
because the exact W2 gate remained `NOT_QUALIFIED`.

## N. Three-auditor settlement-oracle adjudication and corrected-fixture W2

This section is the current closure after the three independent auditor
adjudication. Sections A–M remain preserved historical evidence. In particular,
the `G_MODEL_SEMANTIC_NONCOMPLIANCE=PROVEN` field in section M is superseded for
its three settlement rows by the adjudication below; the earlier artifact and
report text are not rewritten.

### N.1 Frozen adjudication and surgical repair

```text
THREE_INDEPENDENT_AUDITS_COMPLETE=yes
THREE_AUDITOR_SETTLEMENT_ORACLE_ADJUDICATION=ACCEPTED
SETTLEMENT_FIXTURE_EVIDENCE_DEFECT=PROVEN_AND_REPAIRED
SETTLEMENT_EXPECTED_KIND_ORACLE_DEFECT=PROVEN_AND_REPAIRED
PREVIOUS_G_MODEL_SEMANTIC_NONCOMPLIANCE=RETRACTED_FOR_DEFECTIVE_SETTLEMENT_ROWS
CURRENT_SETTLEMENT_MODEL_SEMANTIC_NONCOMPLIANCE=DISPROVEN_FOR_PREVIOUS_DEFECTIVE_FIXTURE
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
CURRENT_MISTRAL_NATIVE_BINDING_DEFECT=NOT_PROVEN
MODEL_SUBSTITUTION_AUTHORIZED=no
```

The previous settlement fixture asked for acknowledgement of a nonexistent
separate qualification message while its hidden oracle required the unsupported
assertion `The fixture is verified.`. The fixture was repaired to use the
self-contained owner turn:

```text
Please acknowledge that you received this message.
```

The expected speech is the ordinary acknowledgement:

```text
Got it.
```

The owner turn remains the only source reference:

```text
sourceRefsUsed=["turn-1"]
```

The owning regression mechanically establishes:

```text
SETTLEMENT_FIXTURE_SELF_CONTAINED=yes
SETTLEMENT_FIXTURE_HIDDEN_FACT_REQUIRED=no
SETTLEMENT_FIXTURE_REQUIRES_OBSERVATION=no
SETTLEMENT_FIXTURE_REQUIRES_EFFECT=no
SETTLEMENT_FIXTURE_REQUIRES_UNAVAILABLE_CAPABILITY=no
SETTLEMENT_EXPECTED_SPEECH_SUPPORTED_BY_MODEL_VISIBLE_CONTEXT=yes
```

No model-facing branch-selection wording, provider, model, reasoning effort,
wire binding, schema semantics, strict parser, structural-correction policy,
host authority, deadline, token budget, fallback, or runtime settlement
boundary changed. The current source candidate was based on the approved
`8406ba405ab98a31620493ca6f0e53922d4d2103` repairs and changed only these
qualification files:

```text
apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts
```

```text
PARENT_SOURCE_CANDIDATE_SHA=8406ba405ab98a31620493ca6f0e53922d4d2103
EXACT_NEW_CANDIDATE_SHA=41e890a5c8ce83fba26f6ce8777a4fd631cd19fc
RUNTIME_SEMANTIC_CONTRACT_CHANGED=no
QUALIFICATION_FIXTURE_CHANGED=yes
```

### N.2 Offline and isolated Mint verification

The test-first repair was verified as follows:

```text
RED_FIXTURE_COHERENCE_TEST=1 failed / 20 passed
REPAIRED_OWNING_QUALIFICATION_SUITE=PASS — 1 file / 21 tests
FOCUSED_AFFECTED_SUITES=PASS — 7 files / 48 tests
COMPLETE_COGNITIVE_V021_SUBTREE=PASS — 106 files / 353 tests
AGENT_SERVICE_BUILD=PASS
GIT_DIFF_CHECK=PASS
```

The exact candidate was pushed before isolated preparation. A fresh Mint
checkout at the exact SHA was clean. These packages were installed and built
in dependency order:

```text
apps/sandbox-policy: PASS
apps/sandbox-m1: PASS
apps/sandbox-tree: PASS
apps/sandbox-broker: PASS
apps/sandbox-v2: PASS
apps/agent-service: PASS
```

The active Mint production checkout was not updated. No service restart,
deployment, or production mutation occurred.

### N.3 One exact corrected-candidate W2

Exactly one new live W2 was run from the isolated Mint checkout. No unchanged
extra run was performed. The frozen settings were:

```text
provider=mistral
model=mistral-small-2603
reasoning=high
fallback=none
wire_mode=native_json_schema
wire_format=mistral_response_format_json_schema
interactive_thought_output_tokens=4096
durable_proactive_thought_output_tokens=4096
structural_correction_output_tokens=2048
thought_wall_clock=30s
max_structural_corrections=2
samples=3 per semantic family
```

The durable artifact is:

```text
LIVE_RUN_ID=w2-20260901T163931392Z-07d0d967-01e1-4dd1-9670-280228c0b7c2
LIVE_ARTIFACT=work/phase5-w2-semantics-structural-closure/w2-route-qualification-41e890a.json
LIVE_ARTIFACT_SHA256=sha256:a3ef5ab27d4d22ec355809da6b4afc558abc2b18015cb102d8d40652ee394a6e
ARTIFACT_BUILD_ID=41e890a5c8ce83fba26f6ce8777a4fd631cd19fc
```

The artifact confirms the exact candidate and current Mistral native binding:

```text
buildIdentity=41e890a5c8ce83fba26f6ce8777a4fd631cd19fc
wireMode=native_json_schema
wireBindingId=compat_thought_mistral_small_2603_native_json_schema_v2
wireFormat=mistral_response_format_json_schema
capabilityFingerprint=sha256:01acdf5a2fd25ae55bd599c159e06b55833962e747ce7ed48749068b51eefe46
```

The result is:

```text
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
CASES=12
PROVIDER_ATTEMPTS=13
PASS=9
NOT_QUALIFIED=3
CORRECTION_PACKETS=1

settlement=0/3 PASS
observation_intent=3/3 PASS
effect_intent=3/3 PASS
abstain=3/3 PASS
```

All three settlement requests reached the real provider and passed transport,
native wire binding, JSON syntax, closed-schema conformance, strict parsing,
and Kernel binding. All three stopped at:

```text
firstFailureBoundary=SEMANTIC_VALIDITY_REJECTION
semanticValidity=FAIL
fencing=NOT_REACHED
authorityReachability=NOT_REACHED
```

The settlement samples were materially different:

```text
settlement sample 0:
  provider response kind=settlement
  semantic failure=semantic_shape_invalid
  stored normalized output omits speech.surfaceDraft for speech.mode=draft

settlement samples 1 and 2:
  provider response kind=abstain
  reason=insufficient_evidence
  semantic failure=semantic_branch_mismatch
```

The two abstain outputs explicitly treated conversational acknowledgement as
unavailable or unobservable. This is new evidence that the repaired
self-contained conversational fixture still drives abstention in the live
model path. Therefore:

```text
MODEL_FACING_CONTRACT_OVER_CORRECTION=SUPPORTED_OR_PROVEN_BY_NEW_EVIDENCE
CURRENT_W2_SETTLEMENT_SEMANTIC_RESULT=0/3
CURRENT_W2_MODEL_FUNDAMENTAL_INCAPABILITY=NOT_PROVEN
```

The observation, effect, and unavailable-evidence abstain families passed. The
new run had no provider availability failure. The previous
`mistral_unavailable` row remains a real, separate provider-availability fact
from the earlier artifact and is not semantic evidence.

```text
CURRENT_MISTRAL_SEMANTIC_STATUS=settlement 0/3; observation_intent 3/3; effect_intent 3/3; abstain 3/3; settlement stopped at semantic validity
CURRENT_PROVIDER_AVAILABILITY_STATUS=no availability failure in corrected W2; prior mistral_unavailable remains separate and real
CURRENT_MISTRAL_NATIVE_BINDING_STATUS=native_json_schema observed; defect not proven
```

The corrected artifact contains raw byte counts and SHA-256 digests, normalized
semantic text for failed cases, and diagnostics. It contains no raw provider
response bodies. The isolated run directory contained no companion response
log. No response body was reconstructed or recovered.

```text
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
QUALIFICATION_OBSERVABILITY_LIMITATION=PROVEN_FOR_EXACT_RAW_PROVIDER_BODIES
NORMALIZED_SEMANTIC_DIAGNOSTICS=RETAINED
```

### N.4 Conditional release stop

The corrected candidate did not satisfy the conjunctive W2 gate. The packet's
first-boundary rule therefore requires a stop and architecture adjudication;
no further model-facing wording change or live W2 is authorized by this pass.

```text
THOUGHT_CONTRACT_QUALIFIED=no
READY_FOR_W3_STAGE_H=no
RELEASE_TRUTH_MATCHED=no
MODEL_EXPANSION_SELECTION_GATE=NOT_REACHED_PENDING_ARCHITECTURE_ADJUDICATION
W3_STAGE_H=NOT_REACHED
DOWNSTREAM_RELEASE_GATES=NOT_REACHED
DEPLOYMENT_PERFORMED=no
PRODUCTION_ACCEPTED=no
PRODUCTION_MUTATION=no
SERVICE_RESTART=no
W9_STARTED=no
```

The historical W2 artifacts remain unchanged. The current exact verdict is
preserved as `W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED`; the new evidence
explains why the repaired fixture still fails without converting that result
into a claim of fundamental model incapability.

## O. Final Q8/Q9 causal prosecution and one conditional W2

Recorded: 2026-09-01.

This section is appended after sections A–N. It records the final source
prosecution from parent candidate `41e890a5c8ce83fba26f6ce8777a4fd631cd19fc`,
the repaired exact candidate, and the one conditional live W2. It does not
rewrite historical evidence.

### O.1 Q8 — surfaceDraft authority

The source-derived canonical rule is:

```text
IS_SURFACE_DRAFT_REQUIRED_WHEN_MODE_DRAFT=yes
Q8_SURFACE_DRAFT_CANONICAL_RULE=When speech.mode is draft, surfaceDraft must be present and non-empty before Settlement validation, speech fidelity, or publication.
```

The pre-repair source was not one coherent contract. The successor semantic
TypeScript type declared `surfaceDraft?: string`; `validSpeech` allowed the
field to be absent; the native draft schema exposed the property but did not
list it as required and had no minimum length; and generated model-facing
speech guidance therefore omitted it from the required list. In contrast,
Settlement validation required the field and rejected null or trimmed-empty
text, speech fidelity rejected a missing or empty draft, and
`plausibleSemanticOutput` required a trimmed non-empty draft.

The downstream rule is authoritative for safe publication. `run.ts` materializes
the parsed successor output and validates it before Authority, fidelity, and
publication. The materialization path no longer inserts `null` for a draft
whose source semantic output is missing `surfaceDraft`.

```text
Q8.1_TYPESCRIPT_SEMANTIC_TYPE_BEFORE_REPAIR=no
Q8.1_TYPESCRIPT_SEMANTIC_TYPE_CURRENT=yes
Q8.2_STRICT_PARSER_BEFORE_REPAIR=no
Q8.2_STRICT_PARSER_CURRENT=yes
Q8.3_NATIVE_SCHEMA_BEFORE_REPAIR=no
Q8.3_NATIVE_SCHEMA_CURRENT=yes
Q8.4_GENERATED_MODEL_CONTRACT_BEFORE_REPAIR=no
Q8.4_GENERATED_MODEL_CONTRACT_CURRENT=yes
Q8.5_DOWNSTREAM_SETTLEMENT_EXPRESSION_REQUIREMENT=yes
Q8.6_PLAUSIBLE_SEMANTIC_OUTPUT_CANONICAL_AUTHORITY=no
Q8.7_PLAUSIBLE_SEMANTIC_OUTPUT_WAS_HIDDEN_STRICT_ORACLE_BEFORE_REPAIR=yes
SURFACE_DRAFT_ALIGNMENT=MULTIPLE_LAYERS_MISALIGNED
Q8_ROOT_CAUSE=upstream successor type, strict parser, native schema, and generated model contract were weaker than the downstream publication invariant; plausibleSemanticOutput was source-supported defense-in-depth but was also a hidden stricter qualification oracle at the unaligned boundary
```

The bounded repair aligned the six named source/test seams. The successor
draft type now requires `surfaceDraft`; the strict parser requires it and
rejects an empty value; the native schema lists it as required and sets
`minLength=1`; generated model-facing speech guidance derives the required
field from that schema; and the semantic-output regression proves parser and
schema rejection for both absence and an empty string. No host text is
fabricated, and no post-parse draft default is used.

### O.2 Q9 — conversationalRead meaning and projection

The source meaning is:

```text
Q9_CONVERSATIONAL_READ_CANONICAL_MEANING=CapabilityReality.conversationalRead reports whether an additional authorized user-requested URL/page read may be performed; it does not report whether already-projected rawConversation is visible.
```

`V021_LIVE_PERCEPTION_CAPABILITIES` is empty in this candidate, so
`getCapabilityReality` truthfully reports `conversationalRead=false`. The
perception capability registry and URL-read implementation identify this as
additional conversational page retrieval, not ordinary visibility of current
conversation evidence. `buildThoughtInput` independently supplies at least
the current `rawConversation` entry, and `projectThoughtInput` copies it into
the model-visible projection. The production path is
`serve.ts` → `getCapabilityReality` → `buildThoughtInput` →
`projectThoughtInput` → Thought message construction, so the combination
`rawConversation present + conversationalRead=false` is a real production
state.

Before repair, the model-facing contract explained operation capabilities but
did not explain this boolean's retrieval-only meaning. A reasonable model
could therefore treat `false` as invalidating the owner turn it could visibly
read. The new general compatibility instruction states the distinction for
every Thought request. It does not select a semantic branch and does not
special-case the W2 fixture.

```text
Q9.1_CONVERSATIONAL_READ_FALSE_MEANS_NO_CONVERSATION_VISIBILITY=no
Q9.2_CONVERSATIONAL_READ_FALSE_MEANS_NO_ADDITIONAL_URL_PAGE_READ=yes
Q9.3_RAW_CONVERSATION_INDEPENDENTLY_ADMISSIBLE=yes
Q9.4_DISTINCTION_EXPLICIT_BEFORE_REPAIR=no
Q9.4_DISTINCTION_EXPLICIT_CURRENT=yes
Q9.5_MODEL_COULD_REASONABLY_MISREAD_FALSE_AS_NO_VISIBLE_CONTEXT=yes
Q9.6_PRODUCTION_PROJECTS_RAW_CONVERSATION_WITH_FALSE=yes
Q9.7_FIELD_CLASSIFICATION=additional perception/retrieval capability fact, not conversation visibility
CONVERSATIONAL_READ_PROJECTION=CORRECT_BUT_MODEL_FACING_AMBIGUOUS
Q9_ROOT_CAUSE=truthful additional-page-read capability was serialized beside visible current conversation without model-facing semantic clarification
```

### O.3 Test-first repair and exact candidate

The two new regressions were run RED before source changes:

```text
semantic-output-contract.test.ts=RED; 1 failed, 8 passed
projection.test.ts=RED; 1 failed, 3 passed
```

The repaired source candidate is:

```text
PARENT_SHA=41e890a5c8ce83fba26f6ce8777a4fd631cd19fc
EXACT_CANDIDATE_SHA=76562f6dc325b2d1ca8c62f0f907276352d9ef4c
Q8_REPAIR=successor type + strict parser + native schema + generated model-facing contract aligned to required non-empty draft; post-parse draft fallback removed
Q9_REPAIR=general model-facing CapabilityReality/rawConversation distinction added; truthful conversationalRead=false preserved
```

Changed source/test files in the exact candidate:

```text
apps/agent-service/src/core/cognitive-v021/types.ts
apps/agent-service/src/core/cognitive-v021/thought/parse.ts
apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts
apps/agent-service/src/core/cognitive-v021/thought/run.ts
apps/agent-service/src/core/cognitive-v021/thought/semantic-output-contract.test.ts
apps/agent-service/src/core/cognitive-v021/thought/__tests__/projection.test.ts
```

### O.4 Offline and isolated Mint verification

```text
FOCUSED_AFFECTED_SUITES=PASS — 7 files / 51 tests
POST_BRIDGE_FOCUSED_TESTS=PASS — 2 files / 16 tests
COMPLETE_COGNITIVE_V021_SUBTREE=PASS — 106 files / 355 tests
LOCAL_AGENT_SERVICE_BUILD=PASS
GIT_DIFF_CHECK=PASS
REMOTE_DIAGNOSTIC_BRANCH=76562f6dc325b2d1ca8c62f0f907276352d9ef4c
ISOLATED_MINT_CHECKOUT=/home/xarvak/ashley-phase5-w2-76562f6
ISOLATED_MINT_CHECKOUT_SHA=76562f6dc325b2d1ca8c62f0f907276352d9ef4c
ISOLATED_MINT_BUILD=PASS — sandbox-policy, sandbox-m1, sandbox-tree, sandbox-broker, sandbox-v2, agent-service
PRODUCTION_CHECKOUT_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
PRODUCTION_CHECKOUT_MUTATED=no
```

### O.5 One conditional exact W2

Exactly one new live W2 was run. No unchanged rerun was performed.

```text
W2_RUN_ID=w2-20260901T171208681Z-888b1b11-94f3-4a0d-910b-21a4d3afa08e
W2_ENVIRONMENT=isolated_live
W2_PROVIDER=mistral
W2_MODEL=mistral-small-2603
W2_REASONING=high
W2_FALLBACK=none
W2_WIRE_MODE=native_json_schema
W2_WIRE_FORMAT=mistral_response_format_json_schema
W2_WIRE_BINDING=compat_thought_mistral_small_2603_native_json_schema_v2
W2_SAMPLES=3 per semantic family
W2_THOUGHT_OUTPUT=4096
W2_STRUCTURAL_CORRECTION_OUTPUT=2048
W2_WALL_CLOCK=30s
W2_MAX_CORRECTIONS=2
W2_PROVIDER_AVAILABILITY_FAILURES=0
W2_ARTIFACT=work/phase5-w2-semantics-structural-closure/w2-route-qualification-76562f6.json
W2_ARTIFACT_SHA256=sha256:bc0890c871243ba8f3e75a91cc1ee97fbf7da7fc9990d50bac836cd155b97114
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
```

The exact artifact records 12 cases and 14 provider attempts. All cases have
real provider attempt IDs; no zero-attempt row is counted as a provider
failure. The result is:

```text
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
CASES=12
PROVIDER_ATTEMPTS=14
PASS=11
NOT_QUALIFIED=1
OUTCOME_UNKNOWN=0

settlement=3/3
observation_intent=3/3
effect_intent=2/3
abstain=3/3
```

The three settlement cases passed transport, native schema, strict parsing,
Kernel binding, fencing, Authority reachability, semantic validity, and the
resource policy. This confirms that the Q8 surface-draft defect and Q9
conversation-capability ambiguity were causal to the earlier settlement
failure family and are repaired in this candidate.

The single remaining failure is exact and separate:

```text
case=effect_intent sample=0
firstFailureBoundary=SEMANTIC_VALIDITY_REJECTION
transport=success
providerRequestStarted=true
providerResponseReceived=true
jsonSyntax=PASS
closedSchemaConformance=PASS
strictParser=PASS
kernelBinding=PASS
semanticValidity=FAIL
failureCodes=semantic_branch_mismatch, semantic_invalid
normalizedSemanticText={"kind": "observation_intent", "operationKind": "project.read_file", "request": {"projectId": "qualification-fixture", "path": "README.md"}, "purpose": "Perform read-only verification of qualification-fixture workspace by inspecting documentation to understand its purpose and structure", "evidenceNeed": "Content of README.md to establish baseline understanding of the qualification-fixture workspace contents and verification requirements", "existingRefs": ["turn-1"]}
```

After Q8 and Q9 are clean, this live effect-branch mismatch supports a
remaining model-facing branch-selection problem for this exact sample. It
does not by itself prove a general law over-correction or fundamental model
incapability, and no further W2 was authorized or performed.

```text
GENERIC_BRANCH_SELECTION_OVER_CORRECTION=SUPPORTED_FOR_THE_REMAINING_EFFECT_SAMPLE_ONLY; GENERAL_LAW_NOT_PROVEN
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
CURRENT_MISTRAL_NATIVE_BINDING_DEFECT=NOT_PROVEN
```

### O.6 Terminal gates

```text
THOUGHT_CONTRACT_QUALIFIED=no
RELEASE_TRUTH_MATCHED=no
W3_STAGE_H=NOT_REACHED
DOWNSTREAM_RELEASE=NOT_REACHED
ACTIVATION=NOT_REACHED
DEPLOYMENT=NOT_PERFORMED
PRODUCTION_ACCEPTED=no
PRODUCTION_MUTATION=no
SERVICE_RESTART=no
W9_STARTED=no
```

No live production checkout was updated, activated, restarted, deployed, or
promoted. The exact verdict remains `W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED`.

### P. Final effect-intent termination audit

This section records the final bounded audit required after the exact
`76562f6dc325b2d1ca8c62f0f907276352d9ef4c` W2 result. Sections A–O are
historical evidence and are not rewritten.

#### P.1 Frozen starting evidence

The starting W2 failure was the `effect_intent` sample whose provider returned
`observation_intent` for `workspace.verify`. The stored result proved:

```text
CURRENT_EFFECT_SAMPLE_SEMANTIC_MISCLASSIFICATION=PROVEN
GENERIC_BRANCH_SELECTION_LAW_DEFECT=NOT_PROVEN
MISTRAL_FUNDAMENTAL_INCAPABILITY=NOT_PROVEN
```

The failure was not a provider-availability failure. The provider request
started, a response was received, JSON syntax passed, closed-schema
conformance passed, strict parsing passed, Kernel binding passed, and semantic
validity rejected the selected branch. The durable artifact stores byte counts
and SHA-256 digests, not raw response bodies:

```text
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
```

#### P.2 Q10 — canonical capability semantics

The canonical operation registry is `apps/sandbox-v2/src/v2-types.ts`.
`v2CapabilitySpec("project.read_file")` resolves to family
`project_inspection`, `readOnly=true`, and `requiresProject=true`.
`v2CapabilitySpec("workspace.verify")` resolves to family
`project_verification`, `readOnly=true`, and `requiresProject=true`.

`apps/agent-service/src/core/sandbox/verification-binding.ts` provides
human-readable grounded verification semantics, but that helper is called by
legacy `apps/agent-service/src/core/agency/thought.ts`; it is not called by the
successor `cognitive-v021` Thought projection. The successor
`ThoughtOperationCapability` records originally exposed only operation kind,
`semanticClass`, availability, request fields, operator-bound fields, and
authorized project IDs. They omitted the canonical registry family and
read-only/project-binding facts. The qualification fixture repeated the same
omission.

```text
Q10.1_CANONICAL_OPERATION_DESCRIPTION_EXISTS=yes — canonical structured operation-purpose metadata exists; no single prose description field exists
Q10.2_WORKSPACE_VERIFY_CANONICAL_DESCRIPTION=project_verification operation; binds an operator-owned candidate workspace and recipe, runs the catalog-controlled mechanical verification, returns a verification receipt, writes only ephemeral /output, and requires the candidate tree to remain unchanged
Q10.3_PROJECT_READ_FILE_CANONICAL_DESCRIPTION=project_inspection operation; performs bounded read-only project evidence acquisition and returns file content as an observation
Q10.4_DESCRIPTION_CURRENTLY_PROJECTED_TO_THOUGHT=no — family, readOnly, and requiresProject were omitted before this repair, and the legacy grounding prose was not on the successor projection path
Q10.5_MODEL_CURRENTLY_EXPECTED_TO_MAP_NATURAL_LANGUAGE_TO_OPERATION_KIND_BY_IDENTIFIER_ALONE=yes — the model received operation identifiers, class, fields, and IDs without the canonical family/read-only meaning
Q10_CAPABILITY_PURPOSE_PROJECTION_DEFECT=PROVEN
```

#### P.3 Q11 — semantic class authority

`semanticClass` is constructed by host code in
`apps/agent-service/src/core/cognitive-v021/thought/capability-reality.ts`.
It is a normative host-owned classification of the registered capability. It
does not decide what the owner means, whether an operation is required, which
operation satisfies the request, or whether Thought should abstain.

The source-derived form relation is:

```text
semanticClass="observation" -> observation_intent
semanticClass="effect" -> effect_intent
```

Before this repair, the relation was not explicitly communicated at the
successor model boundary. The class was projected without stating what it
required for output-form selection. The repair states that relation while
leaving semantic selection with Thought.

```text
Q11.1_SEMANTIC_CLASS_NORMATIVE_HOST_OWNED=yes
Q11.2_EFFECT_CLASS_REQUIRES_EFFECT_INTENT=yes
Q11.3_OBSERVATION_CLASS_REQUIRES_OBSERVATION_INTENT=yes
Q11.4_SEMANTIC_CLASS_TO_FORM_RELATION_EXPLICIT_BEFORE_REPAIR=no
Q11.5_SEMANTIC_CLASS_PROJECTED_WITHOUT_FORM_EXPLANATION_BEFORE_REPAIR=yes
Q11_SEMANTIC_CLASS_MODEL_FACING_SUFFICIENCY=INSUFFICIENT_BEFORE_REPAIR; EXPLICIT_AFTER_REPAIR
```

#### P.4 Q12 — read-only verification is still an effect

`apps/sandbox-v2/src/verification/executor.ts` validates the named recipe,
resolves the operator registry entry, binds a candidate snapshot, executes the
catalog recipe with the candidate mounted read-only and ephemeral `/output`
writable, hashes the candidate afterward, discards `/output`, and records
`candidateUnchanged`. The result is a governed mechanical verification receipt
with a separate protocol state and verification outcome. It is not a pure
file-read observation.

```text
WORKSPACE_VERIFY_MUTATES_WORKSPACE=no
WORKSPACE_VERIFY_IS_GOVERNED_MECHANICAL_EXECUTION=yes
WORKSPACE_VERIFY_SEMANTIC_CLASS=effect
Q12_READ_ONLY_EFFECT_DISTINCTION=MODEL_FACING_AMBIGUOUS_BEFORE_REPAIR; EXPLICIT_AFTER_REPAIR
```

Therefore read-only/non-mutating does not imply `observation_intent`.
`workspace.verify` remains `effect_intent` because it performs a governed
mechanical operation. `project.read_file` remains `observation_intent` because
it acquires file evidence. The owner’s effect fixture explicitly requests the
approved verification to be run and its result reported; it does not merely
ask for README contents.

```text
EFFECT_FIXTURE_VALID=yes
PROJECT_READ_FILE_VALID_SUBSTITUTE=no — project.read_file cannot execute the bound recipe or produce the verification receipt
```

#### P.5 Outcome A — bounded source repair

The audit proved an Ashley successor model-boundary defect. The repair was
test-first:

```text
RED=confirmed — capability-reality and semantic-output-contract regressions failed for the missing projection and missing form law
GREEN=confirmed — affected tests passed 11/11
```

The repair:

* derives `family`, `readOnly`, and `requiresProject` from the canonical
  Sandbox V2 registry in live capability reality;
* carries the same canonical facts into the exact W2 qualification projection;
* states the observation/effect form relation and the read-only verification
  distinction in the generated successor Thought instruction;
* does not add `expectedKind`, fixture-specific prose, model-answer injection,
  host operation selection, parser coercion, qualification loosening, or model
  substitution.

```text
ASHLEY_EFFECT_PROJECTION_DEFECT=PROVEN
TERMINATION_OUTCOME=A_BOUNDED_ASHLEY_REPAIR
REPAIR_CANDIDATE_SHA=efff4c7927600f28f462df55fcbdfe69e0af072c
```

#### P.6 Verification and one final exact W2

```text
FILES_CHANGED=
apps/agent-service/src/core/cognitive-v021/types.ts
apps/agent-service/src/core/cognitive-v021/thought/capability-reality.ts
apps/agent-service/src/core/cognitive-v021/thought/capability-reality.test.ts
apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts
apps/agent-service/src/core/cognitive-v021/thought/semantic-output-contract.test.ts
apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts
```

```text
OFFLINE_VERIFICATION=PASS — affected contract tests 11/11; complete cognitive-v021 subtree 106 files / 355 tests; agent-service build PASS; git diff --check PASS; exact isolated Mint build PASS for sandbox-policy, sandbox-m1, sandbox-tree, sandbox-broker, sandbox-v2, and agent-service
ISOLATED_MINT_CHECKOUT=/home/xarvak/ashley-phase5-w2-efff4c7
ISOLATED_MINT_SHA=efff4c7927600f28f462df55fcbdfe69e0af072c
```

The final W2 was the only W2 run after this repair. It used the frozen
provider, model, reasoning, no-fallback, native-schema, sample, output-budget,
correction, and 30-second rules. No unchanged rerun or additional tuning was
performed.

```text
FINAL_MISTRAL_W2_PERFORMED=yes
FINAL_W2_RUN_ID=w2-20260901T174249254Z-bf991d18-098b-47eb-ac14-a394b3b97d20
FINAL_W2_ARTIFACT=work/phase5-w2-semantics-structural-closure/w2-route-qualification-efff4c7.json
FINAL_W2_ARTIFACT_SHA256=sha256:9d2fa9b4fb80d38cb428f54775a323618dbf3fe47fbeb36360d1983d4106a1eb
FINAL_W2_BUILD_IDENTITY=efff4c7927600f28f462df55fcbdfe69e0af072c
FINAL_W2_PROVIDER=mistral
FINAL_W2_MODEL=mistral-small-2603
FINAL_W2_OCCUPANT=mfo_mistral_small_2603_high
FINAL_W2_REASONING=high
FINAL_W2_FALLBACK=none
FINAL_W2_WIRE=native_json_schema
FINAL_W2_SAMPLES=3 per semantic family
FINAL_W2_INTERACTIVE_THOUGHT=4096
FINAL_W2_DURABLE_PROACTIVE_THOUGHT=4096
FINAL_W2_STRUCTURAL_CORRECTION=2048
FINAL_W2_WALL_CLOCK=30s
FINAL_W2_MAX_CORRECTIONS=2
FINAL_W2_PROVIDER_AVAILABILITY_FAILURES=0
FINAL_W2_PROVIDER_ATTEMPTS=12
FINAL_W2_CASES=12
FINAL_W2_SETTLEMENT=3/3
FINAL_W2_OBSERVATION_INTENT=3/3
FINAL_W2_EFFECT_INTENT=3/3
FINAL_W2_ABSTAIN=2/3
FINAL_W2_FIRST_FAILURE_BOUNDARY=SEMANTIC_VALIDITY_REJECTION
FINAL_W2_FAILURE_CODES=semantic_branch_mismatch, semantic_invalid
FINAL_W2_FAILURE_CASE=abstain sample=2
FINAL_W2_NORMALIZED_OUTPUT={"kind": "observation_intent", "operationKind": "project.list_directory", "request": {"projectId": "qualification-fixture"}, "purpose": "Discover files in the qualification-fixture project that may contain information about the private attachment referenced in the owner's message.", "evidenceNeed": "Directory listing of qualification-fixture project to identify relevant files that could describe or contain the private attachment.", "existingRefs": ["turn-1"]}
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
```

The new final failure is also a real provider response, not an availability
failure. It is not a basis for another semantic-contract investigation or a
fundamental model-capability conclusion. The packet requires termination after
this failed final W2.

#### P.7 Required terminal return

```text
Q10_CANONICAL_OPERATION_PURPOSE_EXISTS=yes — structured canonical metadata exists; no dedicated prose descriptor
Q10_CAPABILITY_PURPOSE_PROJECTION_DEFECT=PROVEN
Q11_SEMANTIC_CLASS_CANONICAL_MEANING=normative host-owned capability classification; it constrains the semantic form after Thought selects an operation
Q11_SEMANTIC_CLASS_MODEL_FACING_SUFFICIENCY=INSUFFICIENT_BEFORE_REPAIR; EXPLICIT_AFTER_REPAIR
Q12_READ_ONLY_EFFECT_DISTINCTION=MODEL_FACING_AMBIGUOUS_BEFORE_REPAIR; EXPLICIT_AFTER_REPAIR
EFFECT_FIXTURE_VALID=yes
PROJECT_READ_FILE_VALID_SUBSTITUTE=no
ASHLEY_EFFECT_PROJECTION_DEFECT=PROVEN
TERMINATION_OUTCOME=A_BOUNDED_ASHLEY_REPAIR
FILES_CHANGED=6 source/test files listed in P.6
OFFLINE_VERIFICATION=PASS
FINAL_MISTRAL_W2_PERFORMED=yes
W2=NOT_QUALIFIED
THOUGHT_CONTRACT_QUALIFIED=no
MODEL_EXPANSION_SELECTION_GATE=NOT_REACHED
DOWNSTREAM_RELEASE=NOT_REACHED
DEPLOYMENT=NOT_PERFORMED
PRODUCTION_ACCEPTED=no
```

The final exact W2 verdict remains:

```text
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
MISTRAL_EXACT_OCCUPANT_W2_RELIABILITY=NOT_QUALIFIED
MISTRAL_FUNDAMENTAL_INCAPABILITY=NOT_PROVEN
PRODUCTION_MUTATION=no
```
