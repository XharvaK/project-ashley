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
