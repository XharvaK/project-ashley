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
