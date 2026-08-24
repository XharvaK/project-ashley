# Routing Status

**Status:** `SUPPORTING / LIVING SOURCE STATUS`

This file is a human-readable snapshot of route bindings. It is not
architecture and not a current-state dashboard. Source is authoritative.

```text
Document reviewed at repository revision
  !=
Route bindings audited against revision
```

Do not infer an audit SHA from git history alone.

| | |
|---|---|
| Document reviewed at repository revision | `01d066d20268c10fd4b9415ae8483fee7b76452c` |
| Route-table audit baseline | `01d066d20268c10fd4b9415ae8483fee7b76452c` |
| Audit method | Read-only comparison of the Wave 1 table below to `config/models.json` `purpose_routes` / `routes`, `PURPOSE_TO_ROUTE` in [`router.ts`](../apps/agent-service/src/core/model-routing/router.ts), and `ROUTE_BINDINGS` in [`registry.ts`](../apps/agent-service/src/core/model-routing/registry.ts) |
| Stale when | those source files change, or `git rev-parse HEAD` differs and a new audit has not been performed |

Current route facts are split across:

- [`config/models.json`](../config/models.json), which supplies configured route
  entries and enablement;
- [`router.ts`](../apps/agent-service/src/core/model-routing/router.ts), whose
  `PURPOSE_TO_ROUTE` mapping currently resolves purposes; and
- [`registry.ts`](../apps/agent-service/src/core/model-routing/registry.ts),
  which currently owns dispatched provider and model values.

No one file is yet the complete route authority. A future Model Fabric
implementation must replace this split with one validated registry snapshot
consumed by dispatch and status. Documentation must not imply that
`config/models.json` already owns the whole route contract.

Nuclear schema version is source-derived from
[`core/db.ts`](../apps/agent-service/src/core/db.ts). Do not copy the integer
here.

Model IDs, quota values, and enabled states are `SOURCE-DERIVED CURRENT FACT`,
not architectural law. Model Fabric owns the future semantic profile/dispatch
contract. Refresh this file by re-auditing source; do not copy HEAD into the
tables without that audit.

## Implemented routing (Wave 1)

| Purpose | Route alias | Provider | Model | Quota bucket |
|---|---|---|---|---|
| `expression` | `ashley_expression` | Mistral | `mistral-medium-latest` | `mistral:mistral-medium-latest` unless `MISTRAL_MODEL` overrides |
| Expression fallback after an eligible primary failure | `ashley_expression_fallback` | Groq | `qwen/qwen3.6-27b` | `groq:qwen/qwen3.6-27b` |
| `thought` | `thought` | NVIDIA NIM (primary) / Groq (failover) | `openai/gpt-oss-20b` | `nim:openai/gpt-oss-20b` (primary) / `groq:openai/gpt-oss-20b` (failover) |
| `exchange_cognition` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |
| `curiosity_consolidation` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |
| `thought_observation` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |
| `maintenance` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |

This table is the audited source snapshot at the route-table audit baseline
named above. The Thought route implements bounded same-model provider failover
(NVIDIA NIM `openai/gpt-oss-20b` primary -> Groq `openai/gpt-oss-20b` secondary
on eligible transport/capacity failures when remaining deadline >= 2500ms).
The planned policy retires the former Groq 20B utility candidate from all future
roles, keeps Groq
`openai/gpt-oss-120b` as main Thought primary, and selects NVIDIA
`nvidia/nemotron-3.5-lightning-30b-a3b` as the specialist/utility primary
candidate. GPT-OSS-120B is only a later, route-qualified fallback candidate for
Lightning-backed routes. The first Thought-observation Model Fabric slice has no
fallback. See the current phase contract in the
[Model Fabric Architecture](architecture/Model_Fabric_Architecture.md).

Specific planned model candidates remain versioned policy. Changing them does
not change Model Fabric architecture when purpose, context, output, reliability,
privacy, and authority contracts remain the same.

Current callers do not use one uniform resolution path. Some pass a route
explicitly. Others begin with a purpose. The Thought observation path begins
with a purpose but is later forced to the `thought` route. This is why the
current split sources cannot be treated as one coherent registry.

### Thought-observation naming seam

These identifiers are not interchangeable:

| Identifier | Current meaning |
|---|---|
| `thought_observation` | Attention/routing purpose requested by the observation job |
| `utility_bulk` | Configured compatibility route for that purpose |
| `thought` | Route currently forced by `runThoughtModel`, which overrides the compatibility mapping at dispatch |
| `thought.observation` | Planned Model Fabric semantic purpose |
| `thought_observation_shadow` | Planned default-off feature mode for the first Model Fabric slice |

The first Model Fabric slice must resolve this mismatch explicitly. It must not
claim that the current `utility_bulk` mapping is the route actually dispatched
by the existing observation call.

## Shared quota buckets

The four utility purposes (`exchange_cognition`, `curiosity_consolidation`,
`thought_observation`, `maintenance`) all consume the single
`groq:openai/gpt-oss-20b` bucket. Quota is keyed by `provider:configuredModelId`,
not by purpose, so distinct purposes never spawn separate pools for the same
model. `resolved_model_id` is continuity metadata only and does **not** alter the
quota bucket.

## Key handling (provider-aware)

- Mistral routes require `MISTRAL_API_KEY`; Groq routes require `GROQ_API_KEY`.
- A missing key fails **before** attention reservation / limiter consumption and
  raises `agent_not_ready` (503). No `attention_requests` row is created.
- NIM (`NIM_API_KEY`) is only required for an **enabled** NIM route; NIM routes
  are currently disabled and require no key at boot.

## Fail-closed behavior

- **Disabled routes** (`sandbox_operator_light`, `sandbox_operator_deep`,
  `sandbox_reviewer`, `experimental_auditor`, `experimental_multimodal`) raise
  `operator_disabled` (503) and reserve no quota, invoke no adapter, require no
  key, and make no network call (e.g. no NIM `/v1/models`). There is **no
  fallback** to Mistral.
- **Unknown routes** raise `route_disabled` (404).
- **Unknown / not-yet-implemented providers** (e.g. `nim` before enablement)
  cause `adapterFor` to fail closed with `operator_disabled`.
- Route lifecycle (`enabled`) is checked before adapter selection.

## Thought failure model

`Thought` uses a deterministic floor: a rate-limited, unavailable, aborted, or
malformed model response yields `thoughtSource: "fallback"` with a sanitized
`thoughtError`. There is no background Mistral fallback for utility cognition;
background cognition is Groq-only.

## Disabled waves (NOT implemented)

- NVIDIA / NIM provider integration — disabled.
- Model-driven sandbox operator routes (`sandbox_operator_light`,
  `sandbox_operator_deep`, `sandbox_reviewer`) — disabled. Their names do not
  grant capability and their retained configuration does not create a V2
  broker dependency. Any future use must satisfy the direct-Bubblewrap V2
  milestone contract, purpose-specific Model Fabric qualification, and the
  relevant authority gates.

## Observability

`GET /nuclear/routing?owner_id=` (owner-only) returns per-route, non-secret
status: route alias, provider, configured model ID, enabled state, quota
bucket, health (`ok`/`degraded`/`disabled`/`unused`), quota availability, last
successful dispatch time, last error class, and resolved model ID when known.
No API keys, raw prompts, model outputs, or secret-bearing errors are exposed.
