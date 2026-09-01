# Project Ashley — Phase 5 Mistral Small Thought and Lightning Expression Qualification

Date: `2026-09-01`

This report records the owner-approved routing expansion and the bounded live
Mistral schema-gate attempt. The active production runtime was not changed.

## Terminal field record

```text
OWNER_ROUTING_DECISION=ACCEPTED_SOURCE_PREPARATION_ONLY
THOUGHT_PRIMARY=mistral/mistral-small-2603
THOUGHT_REASONING_EFFORT=high
EXPRESSION_PRIMARY=nim/nvidia/nemotron-3.5-lightning-30b-a3b
EXPRESSION_FALLBACK=groq/qwen/qwen3.6-27b
EXPRESSION_FALLBACK_REASONING_EFFORT=none
MISTRAL_MEDIUM_ACTIVE=no
MISTRAL_PRIMARY_KEY_PRESENT=yes
MISTRAL_SECONDARY_KEY_PRESENT=no
MISTRAL_SECONDARY_USED=no
DUAL_CREDENTIAL_MECHANISM=SOURCE_PREPARED_SYNTHETIC_TESTED_ONLY
MAX_CREDENTIAL_FAILOVER_HOPS=1
LOAD_BALANCING=no
MISTRAL_SMALL_SCHEMA_GATE=FAIL
MISTRAL_SMALL_SCHEMA_GATE_CALL_COUNT=1
MISTRAL_SMALL_EXPANSION_STATUS=REJECTED_AT_SCHEMA_GATE
TRANSPORT_ROUTE_READY=SOURCE_AND_FOCUSED_TESTS_ONLY
THOUGHT_CONTRACT_QUALIFIED=NOT_ESTABLISHED
RELEASE_TRUTH_MATCHED=NOT_ESTABLISHED
FULL_CORPUS=NOT_RERUN_BY_OWNER_INSTRUCTION
CANDIDATE_FREEZE=NOT_PERFORMED
REMOTE_CANDIDATE_SHA=NOT_CREATED
W2_MISTRAL_PHYSICAL_QUALIFICATION=NOT_RUN_SCHEMA_GATE
W3_MISTRAL_PHYSICAL_QUALIFICATION=NOT_RUN_SCHEMA_GATE
PRODUCTION_ACCEPTED=NO
PRODUCTION_MUTATION=no
DEPLOYMENT_PERFORMED=no
W9_STARTED=no
```

## Required causal order and stop condition

The required pre-activation order is:

```text
freeze candidate SHA
→ push exact SHA
→ prepare/build exact SHA on Mint in a non-live qualification context
→ live NIM W2 qualification of that exact candidate
→ derive THOUGHT_CONTRACT_QUALIFIED and RELEASE_TRUTH_MATCHED
→ evaluate activation gate
→ only then mutate/activate the live production runtime if authorized
```

This pass stopped before candidate freeze because the owner-approved live
Mistral Stage A schema gate failed. No candidate SHA was frozen or pushed. No
Mistral W2, W3, activation, deployment, or production witness was attempted.

The full corpus was not rerun, per the owner's explicit instruction to rerun
only affected suites after the reasoning-value correction.

## Mistral Thought wire and reasoning contract

The current Thought route is Mistral Small:

```text
provider=mistral
configuredModelId=mistral-small-2603
bindingId=compat_thought_mistral_small_2603_native_json_schema_v2
wireMode=native_json_schema
wireFormat=mistral_response_format_json_schema
reasoningPolicy=high
effectiveReasoning=high
```

The Mistral adapter sends the provider field `reasoning_effort` on the native
request. The generic Model Fabric capability type admits the provider wire
vocabulary used across routes:

```text
none | low | medium | high
```

The selected Mistral Small profile explicitly declares only `none|high` as its
accepted reasoning set. The source-derived mapping is:

```text
disabled/economical → none
high/max_supported  → high
standard            → unsupported_reasoning_mapping
```

`none` means that Mistral's reasoning mode is disabled for that request. It is
not a missing value and it is not an Ashley abstention. `high` means that the
request asks Mistral for its high reasoning mode. NIM Lightning remains on
`none`; Mistral Small Thought remains on `high` as owner-directed.

## Bounded live Stage A schema gate

The probe used the real Mistral adapter native request path and the configured
Mistral API endpoint. It used only synthetic qualification content. It used
the primary credential seat and made no retry.

```text
ENDPOINT=https://api.mistral.ai/v1
MODEL=mistral-small-2603
PRIMARY_CREDENTIAL_USED=yes
SECONDARY_CREDENTIAL_USED=no
PROBE_1=adversarial_minimal_json_schema
PROBE_1_SCHEMA=value must equal the const string probe_ok
PROBE_1_PROMPT=requested the contradictory value not_probe_ok
PROBE_1_HTTP_STATUS=200
PROBE_1_PROVIDER_RESPONSE_PRESENT=yes
PROBE_1_MODEL_IDENTITY=mistral-small-2603
PROBE_1_JSON_SYNTAX=FAIL
PROBE_1_CLOSED_SCHEMA_CONFORMANCE=FAIL
PROBE_1_STRICT_PARSER=NOT_RUN
PROBE_1_ENFORCEMENT_OBSERVED=adversarial_constraint_not_conformed
PROBE_1_WIRE_MODE=native_json_schema
PROBE_1_WIRE_FORMAT=mistral_response_format_json_schema
PROBE_1_PROVIDER_DECLARED_ENFORCEMENT=unavailable
PROBE_1_ELAPSED_MS=1278
PROBE_1_INPUT_TOKENS=48
PROBE_1_OUTPUT_TOKENS=128
PROBE_1_TOTAL_TOKENS=176
PROBE_1_COMPLETION_TEXT_BYTES=0
PROBE_1_OUTCOME=FAIL
PROBE_2=NOT_SENT_SCHEMA_GATE_FAILED
```

The stored completion-text digest was:

```text
sha256:12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126
```

The probe harness did not durably retain the raw HTTP response body. The byte
count and digest above describe the adapter completion text only. Therefore:

```text
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
RAW_PROVIDER_CONTENT_PERSISTED=no
```

The result establishes that this exact native request did not establish the
successor schema gate. It does not establish that Mistral Small is
fundamentally incapable of the successor Thought contract:

```text
CURRENT_MISTRAL_NATIVE_BINDING_NOT_QUALIFIED=PROVEN
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
```

Because the raw body was not retained and the adapter completion text was
empty, the exact provider-side response structure cannot be reconstructed from
this probe. Any finer structural diagnosis is an observability/evidence
limitation, not a model-capability conclusion.

## Credential-seat and failover boundary

The source prepares two named Mistral credential seats:

```text
mistral_primary
mistral_secondary
```

Only `MISTRAL_API_KEY` is present in the current environment. The secondary
seat is not configured and was not used. Focused tests cover the source-derived
one-hop rule: a fresh same-model Mistral attempt may use the secondary seat only
after a definitive account-scoped failure with a provider response received,
and only when the remaining deadline permits it. There is no round-robin
selection, third hop, model substitution, or Thought fallback to another
provider. Ambiguous, schema, semantic, provider-wide, deadline, and local
failures do not trigger credential failover.

## Expression and utility routing

The prepared source route is:

```text
Expression primary = nim/nvidia/nemotron-3.5-lightning-30b-a3b
Expression fallback = groq/qwen/qwen3.6-27b
Utility/bulk = nim/nvidia/nemotron-3.5-lightning-30b-a3b
NIM Lightning reasoning = none
Groq Expression fallback reasoning = none
```

Expression fallback remains caller-owned and is not a Thought fallback. NIM
Lightning physical qualification was not attempted in this Mistral schema-gate
pass because no exact candidate was frozen and the required sequence stopped at
the Mistral gate.

## Historical GPT-OSS qualification remains unchanged

The prior GPT-OSS evidence remains immutable:

```text
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
CURRENT_WIRE_BINDING_NOT_QUALIFIED=PROVEN
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
RAW_PROVIDER_RESPONSE=NOT_DURABLY_RETAINED
```

The old artifact used `json_object_compatibility` with
`wireFormat=json_object` and `providerDeclaredEnforcement=unavailable`. Its
stored responses were JSON-syntax-valid but rejected by Ashley's closed-schema
oracle with `oneOf_mismatch:$`, followed by strict-parser rejection. The two
zero-attempt abstains remain excluded from provider reliability because the
artifact does not prove that a provider request reached NIM.

No old GPT-OSS artifact was rewritten and no old qualification was rerun to
recover raw bodies.

## Verification

The affected suites were rerun after the reasoning-value correction:

```text
Test Files  9 passed (9)
Tests       89 passed (89)
```

The agent-service TypeScript build passed after widening the explicit reasoning
capability type to include `none`:

```text
npm run build --prefix apps/agent-service = PASS
```

No full corpus was run in this pass. No production checkout, active runtime,
database, activation epoch, deployment, or remote ref was mutated.

## Final disposition

```text
MISTRAL_SMALL_EXPANSION_STATUS=REJECTED_AT_SCHEMA_GATE
CURRENT_MISTRAL_NATIVE_BINDING_NOT_QUALIFIED=PROVEN
MODEL_FUNDAMENTALLY_INCAPABLE=NOT_PROVEN
W2_MISTRAL_PHYSICAL_QUALIFICATION=NOT_RUN_SCHEMA_GATE
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED (historical GPT-OSS result preserved)
THOUGHT_CONTRACT_QUALIFIED=NOT_ESTABLISHED
RELEASE_TRUTH_MATCHED=NOT_ESTABLISHED
PRODUCTION_ACCEPTED=NO
PRODUCTION_MUTATION=no
DEPLOYMENT_PERFORMED=no
W9_STARTED=no
```

The next permitted qualification attempt requires a retained response body or
equivalent provider-side diagnostic if exact structural diagnosis is required,
and must again follow the exact-candidate freeze, push, isolated Mint build,
pre-activation live qualification, and activation-gate order.
