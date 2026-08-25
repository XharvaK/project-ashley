# Routing Status

**Status:** `SUPPORTING / LIVING SOURCE STATUS`

This file is a human-readable snapshot of route bindings. It is not
architecture and not a current-state dashboard. Source is authoritative.

```text
Document reviewed at repository revision
  !=
Route bindings audited against revision
  !=
Owner-selected future target policy
```

Do not infer an audit SHA from git history alone.

| | |
|---|---|
| Document reviewed at repository revision | `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a` |
| Route-table audit baseline | `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a` |
| Audit method | Read-only comparison of the Wave 1 table below to `config/models.json` `purpose_routes` / `routes`, `PURPOSE_TO_ROUTE` in [`router.ts`](../apps/agent-service/src/core/model-routing/router.ts), and `ROUTE_BINDINGS` in [`registry.ts`](../apps/agent-service/src/core/model-routing/registry.ts) |
| Last route-table audit | 2026-08-25 post-OF baseline confirmation; route-binding inputs unchanged from the prior `8eedad8` audit |
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

The post-OF source comparison found no changes from `8eedad8` to
`e36613b` in `config/models.json`, the model-routing source, the provider
adapters, or the audited `completeChat` caller paths. The prior route-table
content therefore remains valid at the `e36613b` integration baseline.

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
named above. **Dispatch caveat:** `thought_observation` is *configured* as
`utility_bulk` in `config/models.json` and `PURPOSE_TO_ROUTE`, but
`runThoughtModel` currently **forces** `route: "thought"` (NIM/Groq 20B
failover), so observation does not actually consume the Groq utility bucket.
See the naming seam below.
(NVIDIA NIM `openai/gpt-oss-20b` primary -> Groq `openai/gpt-oss-20b` secondary
on eligible transport/capacity failures when remaining deadline >= 2500ms).

Live model IDs are **current facts**, not architecture. Owner-selected
**future** direct-provider targets (including Qwen-primary Expression and Groq
120B Thought) live only in
[Model Fabric Architecture §12.9](architecture/Model_Fabric_Architecture.md).
This file must not claim those targets are already production-routed.

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
| `thought.observation` | Historical F1-obs planned semantic purpose; not current dispatch; not MF-M1 |
| `thought_observation_shadow` | Deferred F1-obs feature mode; not MF-M1 |

**MF-M1** must **preserve and expose** this mismatch. It must not claim that
the current `utility_bulk` mapping is the route actually dispatched, and it
must not repair the force-to-`thought` behavior while establishing the seam.

## Shared quota buckets

Quota is keyed by `provider:configuredModelId`, not by purpose.
`resolved_model_id` is continuity metadata only.

- `exchange_cognition`, `curiosity_consolidation`, and `maintenance` that
  actually dispatch `utility_bulk` share `groq:openai/gpt-oss-20b` (TPM 8000).
- Thought **failover** uses that **same** Groq 20B bucket. Utility load can
  starve NIM→Groq Thought failover.
- `thought_observation` is *configured* as `utility_bulk` but is **dispatched
  as `thought`**, so it does **not** consume the utility bucket unless failover
  fires. The observation enqueue path also no-ops without `GROQ_API_KEY`.
- Expression fallback is a distinct Groq bucket `groq:qwen/qwen3.6-27b` (TPM
  **6100**).

## Key handling (provider-aware)

- Mistral routes require `MISTRAL_API_KEY`; Groq routes require `GROQ_API_KEY`.
- A missing key fails **before** attention reservation / limiter consumption and
  raises `agent_not_ready` (503). No `attention_requests` row is created.
- NIM (`NIM_API_KEY`) is required to dispatch the **primary** Thought NIM
  adapter. `routeReady("thought")` is true when the Thought route is enabled and
  **either** `NIM_API_KEY` or `GROQ_API_KEY` is present, because Thought may
  fail over to Groq on the same configured model id. Comments in
  [`config/env.example`](../config/env.example) that still say NIM is disabled
  and Thought is Groq 120B are **stale** relative to `config/models.json` and
  `registry.ts` as of this audit.
- Thought observation (`enqueueThoughtObservation`) still **no-ops without
  `GROQ_API_KEY`**, even though the subsequent call forces `route: "thought"`.
  NIM-only Thought can therefore run while observation is skipped.

## Fail-closed behavior

- **Disabled routes** (`sandbox_operator_light`, `sandbox_operator_deep`,
  `sandbox_reviewer`, `experimental_auditor`, `experimental_multimodal`) raise
  `operator_disabled` (503) and reserve no quota, invoke no adapter, require no
  key, and make no network call (e.g. no NIM `/v1/models`). There is **no
  fallback** to Mistral.
- **Unknown routes** raise `route_disabled` (404).
- **Unknown providers** cause `adapterFor` to fail closed with
  `operator_disabled`. NIM is a live Thought primary adapter as of this audit.
- Route lifecycle (`enabled`) is checked before adapter selection.

## Thought failure model

`Thought` uses a deterministic floor: a rate-limited, unavailable, aborted, or
malformed model response yields `thoughtSource: "fallback"` with a sanitized
`thoughtError`. There is no background Mistral fallback for utility cognition;
background cognition is Groq-only.

## Disabled waves (NOT implemented)

- NVIDIA / NIM provider integration is **implemented** for the enabled
  `thought` route (`openai/gpt-oss-20b` primary, Groq same-model failover).
  Older prose that said "NIM is disabled" is obsolete as of this audit.
- Model-driven sandbox operator routes (`sandbox_operator_light`,
  `sandbox_operator_deep`, `sandbox_reviewer`) — still **disabled**. Their names
  do not grant capability and their retained configuration does not create a V2
  broker dependency. Any future use must satisfy the direct-Bubblewrap V2
  milestone contract, purpose-specific Model Fabric qualification, and the
  relevant authority gates.
- `experimental_auditor` and `experimental_multimodal` remain disabled.

## Observability

`GET /nuclear/routing?owner_id=` (owner-only) returns per-route, non-secret
status: route alias, provider, configured model ID, enabled state, quota
bucket, health (`ok`/`degraded`/`disabled`/`unused`), quota availability, last
successful dispatch time, last error class, and resolved model ID when known.
No API keys, raw prompts, model outputs, or secret-bearing errors are exposed.

`GET /nuclear/attention?owner_id=` reports queue/continuity/outcomes, but its
`rpsLimit` / `tpmLimit` / `reservedTpm` fields are **Mistral env defaults**,
not per-bucket Groq/NIM pressure. Use `/nuclear/routing` for per-route TPM.
`foldAttentionDailyUsage` is not invoked in production.
