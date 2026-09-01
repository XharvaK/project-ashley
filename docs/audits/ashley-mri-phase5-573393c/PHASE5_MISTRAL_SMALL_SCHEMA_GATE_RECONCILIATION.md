# Project Ashley — Phase 5 Mistral Small Schema-Gate Reconciliation

Date: 2026-09-01

Worktree: C:/Users/Xharv/Projects/composer-assistant-audit-573393c

This report records the bounded Mistral Small reconciliation pass. It
preserves the earlier failed live probe and records the new source, focused
test, live-probe, and full-corpus evidence. The active production runtime was
not changed.

## Terminal field record

    MISTRAL_RECONCILIATION_STATUS=STOPPED_AFTER_FULL_CORPUS_FAILURE
    PREVIOUS_PROBE_CLASSIFICATION=OTHER
    MISTRAL_RESPONSE_EXTRACTION=CHUNK_AWARE
    PREVIOUS_OUTPUT_LIMIT=128
    PREVIOUS_FINISH_REASON=NOT_RETAINED
    PREVIOUS_PROBE_TRUNCATION=PLAUSIBLE_BUT_NOT_DETERMINABLE
    PROBE_A_NONE_SCHEMA=PASS
    PROBE_B_HIGH_W0_SCHEMA=PASS
    MISTRAL_NATIVE_SCHEMA_SUPPORT=ESTABLISHED
    MISTRAL_HIGH_REASONING_W0_COMPATIBILITY=ESTABLISHED
    BUILD=PASS
    FOCUSED_TESTS=PASS (33/33)
    FULL_CORPUS=FAIL (336/370 files passed; 34 failed; 2,234/2,303 tests passed; 67 failed; 2 skipped)
    NEW_CANDIDATE_SHA=NOT_CREATED
    W2_MISTRAL_SMALL=NOT_RUN_FULL_CORPUS_FAILED
    W3_STAGE_H=NOT_RUN_FULL_CORPUS_FAILED
    READY_FOR_FINAL_INDEPENDENT_REVIEW=no
    READY_FOR_DEPLOY=no
    PRODUCTION_MUTATION=no

The full corpus failure prevents candidate freeze. Therefore the exact
candidate freeze, push, isolated Mint build, Mistral W2, Stage H/W3, Release
Truth derivation, activation evaluation, and production mutation were not
performed.

## Historical live probe preserved

The previous Mistral result is not rewritten:

    HTTP_STATUS=200
    MODEL=mistral-small-2603
    REASONING_EFFORT=high
    OUTPUT_TOKENS=128
    COMPLETION_TEXT_BYTES=0
    JSON_SYNTAX=FAIL
    SCHEMA_CONFORMANCE=FAIL

The previous probe did not retain finish_reason or the raw provider response
body. Its output-token count reached the 128-token ceiling. Truncation is
plausible, but STOP, LENGTH, CONTENT_FILTER, TOOL, and other causes cannot be
distinguished from the stored evidence. The exact historical classification is
therefore PREVIOUS_FINISH_REASON=NOT_RETAINED and
PREVIOUS_PROBE_TRUNCATION=PLAUSIBLE_BUT_NOT_DETERMINABLE.

The adapter at the historical baseline was not string-only. It accepted plain
strings and partially handled arrays, while allowing type-less chunks and
silently dropping malformed or unknown content. It did not capture the
response-shape and finish-reason evidence required for diagnosis. The
historical classification is PREVIOUS_PROBE_CLASSIFICATION=OTHER, not
STRING_ONLY_BUG.

The earlier probe harness retained only an output-byte count and digest. It did
not durably retain the raw HTTP response body. No old call was rerun to recover
it:

    RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
    RAW_PROVIDER_CONTENT_PERSISTED=no

The missing body prevents identification of the exact provider-side
oneOf mismatch. That is an observability/evidence limitation. It is not proof
that Mistral Small is fundamentally incapable of the successor Thought
contract.

## Source-derived contract

The current route and capability sources resolve the Thought route to:

    provider=mistral
    configuredModelId=mistral-small-2603
    structuredOutput=json_schema
    bindingMode=native_json_schema
    wireFormat=mistral_response_format_json_schema
    reasoningPolicy=high
    effectiveReasoning=high

The source-derived Mistral reasoning set is none|high. The translation is:

    disabled/economical -> none
    high/max_supported -> high
    standard -> unsupported_reasoning_mapping

none disables Mistral reasoning for that request. It is not a missing value and
it is not an Ashley abstention. high requests Mistral high reasoning. NIM
Lightning remains on none. Mistral Small Thought remains on high.

The current Mistral native adapter emits the raw Chat API request:

    POST {mistralBaseUrl}/chat/completions
    response_format.type=json_schema
    response_format.json_schema.strict=true
    response_format.json_schema.schema=<code-owned Thought schema>
    reasoning_effort=<translated none or high>
    max_tokens=<bounded request ceiling>

The native request uses the configured primary credential for this pass. The
adapter binding was not changed during reconciliation. The live probes tested
the existing native binding on the configured endpoint and exact model.

The live semantic authority remains parseThoughtSemanticOutput. It parses a
string with JSON.parse, requires an object root, rejects unknown fields and
invalid forms, enforces the allowlisted-reference rules, and returns a
typed semantic result. It does not extract JSON from markdown, reconstruct
partial JSON, or promote provider reasoning into semantic output.

Structural retries rebuild the Thought messages with bounded structural
feedback. The source reuses a semantic projection where available, but it does
not replay a provider assistant response, a provider thinking chunk, or a
previous completion body as a new assistant message. The operation loop passes
only the normalized completion text to parseThoughtSemanticOutput.

## Response extraction repair

The adapter now has one strict normalization boundary:

    string content -> preserve the exact string
    array content -> concatenate only ordered type=text chunks
    type=thinking -> count for diagnostics and ignore semantically
    null content -> empty final text and missing-content diagnostic
    missing content -> empty final text and missing-content diagnostic
    unknown container or chunk type -> fail closed
    malformed chunk -> fail closed

If any array chunk is unknown or malformed, the adapter returns no semantic
prefix. This prevents a valid-looking prefix from reaching the JSON parser.
Thinking content is never inspected for semantic JSON and is never replayed.

The adapter now records bounded, non-secret diagnostics:

    CONTENT_CONTAINER_TYPE
    CONTENT_CHUNK_TYPES
    TEXT_CHUNK_COUNT
    THINKING_CHUNK_COUNT
    FINAL_TEXT_BYTES
    FINISH_REASON
    FINISH_REASON_CLASS
    OUTPUT_TOKEN_LIMIT
    OUTPUT_TOKENS
    REASONING_TOKENS
    EXTRACTION_FAILURE

finish_reason is classified as STOP, LENGTH, CONTENT_FILTER, TOOL, OTHER, or
UNKNOWN. Raw provider bodies and private Thought reasoning are not persisted.

## Adversarial tests

The adapter tests express the source-derived contract:

    A  plain string is preserved exactly
    B  thinking chunks are ignored and final text is extracted
    C  multiple final text chunks retain provider order
    D  thinking-only content produces no semantic output
    E  unknown and malformed chunks fail closed
    F  JSON final text remains byte-for-byte unchanged after thinking
    G  JSON inside thinking is never promoted
    H  usage, output ceiling, and finish_reason are retained

Null and missing content are also covered. The first test-first run produced
the expected RED result: 13 tests ran and 8 failed against the old
implementation. After the smallest source repair, the focused adapter suite
passed 14/14. The combined affected adapter and Mistral-client suites passed
33/33.

## Authorized live probes

The probe harness used the real Mistral adapter native path, the configured
Mistral endpoint, the exact model mistral-small-2603, synthetic content only,
the primary credential only, no retry, no secondary credential, and a
30-second per-call bound. Two calls were used, which was the authorized
maximum.

Probe A used reasoning none, output limit 512, and an adversarial minimal
schema whose only legal value was probe_ok while the prompt requested
not_probe_ok. It passed:

    HTTP_STATUS=200
    MODEL_IDENTITY=mistral-small-2603
    CONTENT_CONTAINER_TYPE=string
    FINAL_TEXT_BYTES=21
    FINISH_REASON=stop
    FINISH_REASON_CLASS=STOP
    OUTPUT_TOKENS=8
    JSON_SYNTAX=PASS
    SCHEMA_CONFORMANCE=PASS
    EXTRACTION_FAILURE=none
    ELAPSED_MS=548

Probe B used reasoning high, output limit 4096, and the exact exported W0
Thought schema. It passed:

    HTTP_STATUS=200
    MODEL_IDENTITY=mistral-small-2603
    CONTENT_CONTAINER_TYPE=array
    CONTENT_CHUNK_TYPES=thinking,text
    TEXT_CHUNK_COUNT=1
    THINKING_CHUNK_COUNT=1
    FINAL_TEXT_BYTES=94
    FINISH_REASON=stop
    FINISH_REASON_CLASS=STOP
    OUTPUT_TOKENS=349
    JSON_SYNTAX=PASS
    SCHEMA_CONFORMANCE=PASS
    STRICT_PARSER=PASS
    EXTRACTION_FAILURE=none
    ELAPSED_MS=2506

The durable structural evidence is in
work/phase5-mistral-schema-reconciliation/reconciliation.json. It contains
text digests and bounded shape/accounting diagnostics only. It does not contain
raw response bodies or private reasoning:

    RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED

These two successful calls establish Mistral native JSON-schema support for
this exact model, endpoint, native binding, and tested request class. They also
establish compatibility between high reasoning, the exact W0 schema, and the
repaired chunk-aware extraction path for this call. They do not turn the model
into a generally promoted production capability.

## Full-corpus gate

The full deterministic agent-service corpus was run after the two successful
probes. Result:

    Test Files  34 failed | 336 passed (370)
    Tests       67 failed | 2,234 passed | 2 skipped (2,303)
    Duration    184.64s

The dominant observed failure cluster is no such table: lineage_mirror during
migration or qualification-fixture startup. It affects multiple existing
qualification, cognition, runtime, and Sandbox suites. Several dependent
cleanup failures then report an undefined fixture close.

Other observed failures are route-contract expectation mismatches in existing
tests, including tests still expecting the prior NIM/gpt-oss Thought route
while the current dirty worktree selects Mistral Small, plus stale model
identity and route-availability expectations. The worktree already contained
broader route, qualification, and fixture changes outside this bounded
response-extraction repair. Those unrelated failures were not relabeled as
Mistral probe failures and were not changed in this pass.

Because the corpus gate failed, this pass does not claim a settled candidate.

## Verification and disposition

    npm --prefix apps/agent-service test -- src/core/model-routing/adapters/mistral-adapter.test.ts src/mistral-client.test.ts
    PASS: 2 files, 33 tests

    npm run build --prefix apps/agent-service
    PASS

    npm test --prefix apps/agent-service
    FAIL: 34 files and 67 tests failed

The historical GPT-OSS evidence remains unchanged:

    W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
    CURRENT_WIRE_BINDING_NOT_QUALIFIED=PROVEN for the historical compatibility binding
    MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
    RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED

No GPT-OSS qualification was rerun. No binding change was made for the old
GPT-OSS route. The Mistral result is a separate bounded finding:

    MISTRAL_NATIVE_SCHEMA_SUPPORT=ESTABLISHED
    MISTRAL_HIGH_REASONING_W0_COMPATIBILITY=ESTABLISHED

The next continuation must first resolve the full-corpus failures and then
repeat the exact candidate lifecycle. The required order remains:

    freeze candidate SHA
    -> push exact SHA
    -> prepare/build exact SHA on Mint in a non-live qualification context
    -> live Mistral W2 qualification of that exact candidate
    -> derive THOUGHT_CONTRACT_QUALIFIED and RELEASE_TRUTH_MATCHED
    -> evaluate activation gate
    -> only then mutate or activate the live production runtime if authorized

PRODUCTION_MUTATION=no. DEPLOYMENT_PERFORMED=no. W9_STARTED=no.
