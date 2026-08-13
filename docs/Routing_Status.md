# Routing status (Wave 1 — multi-provider model routing)

Authoritative route table: `config/models.json`. Fallback static table:
`apps/agent-service/src/core/model-routing/registry.ts`. Schema v18
(`NUCLEAR_SUPPORTED_VERSION`).

## Implemented routing (Wave 1)

| Purpose | Route alias | Provider | Model | Quota bucket |
|---|---|---|---|---|
| `expression` | `ashley_expression` | Mistral | `mistral-medium-latest` | `mistral:<MISTRAL_MODEL>` |
| `thought` | `thought` | Groq | `openai/gpt-oss-120b` | `groq:openai/gpt-oss-120b` |
| `exchange_cognition` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |
| `curiosity_consolidation` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |
| `thought_observation` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |
| `maintenance` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |

This table is current-source truth. It is not the future Model Fabric target.
The planned policy retires the former Groq 20B utility candidate from all future
roles, keeps Groq
`openai/gpt-oss-120b` as main Thought primary, and selects NVIDIA
`nvidia/nemotron-3.5-lightning-30b-a3b` as the specialist/utility primary
candidate. GPT-OSS-120B is only a later, route-qualified fallback candidate for
Lightning-backed routes. The first Thought-observation Model Fabric slice has no
fallback. See the
[canonical architecture roadmap](architecture/Ashley_Architecture_Roadmap.md#target-model-policy).

Call sites pass the semantic route explicitly (see C6 hardening) rather than
inferring it only from the purpose string.

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
  `sandbox_operator_deep`, `sandbox_reviewer`) — disabled until the sandbox
  authorization architecture (broker-final authorization, owner-signed
  delegated policy, protected roots, session capabilities, fixed recipes,
  approval-required transitions) is implemented.

## Observability

`GET /nuclear/routing?owner_id=` (owner-only) returns per-route, non-secret
status: route alias, provider, configured model ID, enabled state, quota
bucket, health (`ok`/`degraded`/`disabled`/`unused`), quota availability, last
successful dispatch time, last error class, and resolved model ID when known.
No API keys, raw prompts, model outputs, or secret-bearing errors are exposed.
