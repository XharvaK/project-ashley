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
| Document reviewed at repository revision | `2026-09-08` closure-candidate audit; production baseline `9ef99620475552216905cd6995be2a11d1358519` |
| Route-table occupant audit baseline | `config/model-fabric/portfolios/current-compatibility.v3.json` (`mfp_current_compatibility_v3`) |
| Occupant-table compatibility check | 2026-09-08 source audit of the declared CURRENT v3 portfolio, resolver, registry, provider adapters, and current route tests. |
| Audit method | Read-only comparison of the current v3 portfolio to `portfolio.ts`, `router.ts`, `registry.ts`, provider adapters, deployment configuration, and focused Model Fabric/routing regressions. |
| Last route-table audit | 2026-09-08 current-v3 Thought-host migration audit |
| Currentness | Living source audit for the migration candidate. It does not claim production acceptance or deployment. Not constitutional law. |
| Stale when | the CURRENT portfolio, resolver, route-dispatch behavior, or provider bindings change and a new audit has not been performed |

Current route facts are now consumed from one validated CURRENT snapshot:

- [`config/model-fabric/portfolios/current-compatibility.v3.json`](../config/model-fabric/portfolios/current-compatibility.v3.json), which owns the complete current policy rows, route bindings, enablement, and quota contracts;
- [`portfolio.ts`](../apps/agent-service/src/core/model-fabric/portfolio.ts), which validates and hashes the snapshot and resolves role/occupancy/overrides; and
- [`router.ts`](../apps/agent-service/src/core/model-routing/router.ts), which projects the snapshot for Attention quota and route lifecycle checks.

The obsolete `config/models.json` registry has been removed. Owner-selected
future targets are **not** current routing.

The current v3 portfolio is a declared compatibility snapshot. It is the
source-derived route authority for this candidate. Thought uses Nemotron 3
Super with `reasoningPolicy=high` and native JSON Schema through Cloudflare
Workers AI using `@cf/nvidia/nemotron-3-120b-a12b`. Expression and utility/bulk
rows use NVIDIA NIM Nemotron 3.5 Lightning. The Expression fallback remains
Groq Qwen. Disabled rows remain disabled and do not create provider access.
Thought has no automatic provider fallback.

Nuclear schema version is source-derived from
[`core/db.ts`](../apps/agent-service/src/core/db.ts). Do not copy the integer
here.

Model IDs, quota values, and enabled states are `SOURCE-DERIVED CURRENT FACT`,
not architectural law. Model Fabric owns the future semantic profile/dispatch
contract. Refresh this file by re-auditing source; do not copy HEAD into the
tables without that audit.

The v3 portfolio replaces the v2 compatibility snapshot and is resolved by the
current Model Fabric loader. This document does not promote a declared row or
provider capability by itself.

## Current compatibility routing

| Purpose | Route alias | Provider | Model | Quota bucket |
|---|---|---|---|---|
| `expression` | `ashley_expression` | NVIDIA NIM | `nvidia/nemotron-3.5-lightning-30b-a3b` | `nim:nvidia/nemotron-3.5-lightning-30b-a3b` |
| Expression fallback after an eligible primary failure | `ashley_expression_fallback` | Groq | `qwen/qwen3.6-27b` | `groq:qwen/qwen3.6-27b` |
| `thought` | `thought` | Cloudflare Workers AI | `@cf/nvidia/nemotron-3-120b-a12b` | `cloudflare:@cf/nvidia/nemotron-3-120b-a12b` |
| `exchange_cognition` | `utility_bulk` | NVIDIA NIM | `nvidia/nemotron-3.5-lightning-30b-a3b` | `nim:nvidia/nemotron-3.5-lightning-30b-a3b` |
| `curiosity_consolidation` | `utility_bulk` | NVIDIA NIM | `nvidia/nemotron-3.5-lightning-30b-a3b` | `nim:nvidia/nemotron-3.5-lightning-30b-a3b` |
| `thought_observation` | `utility_bulk` configured / `thought` dispatched | Cloudflare Workers AI | `@cf/nvidia/nemotron-3-120b-a12b` | Thought bucket |
| `reflection_initiative` | `utility_bulk` configured / `thought` dispatched | Cloudflare Workers AI | `@cf/nvidia/nemotron-3-120b-a12b` | Thought bucket |
| `engineering` | `ashley_expression` | NVIDIA NIM | `nvidia/nemotron-3.5-lightning-30b-a3b` | `nim:nvidia/nemotron-3.5-lightning-30b-a3b` |
| `maintenance` | `utility_bulk` | NVIDIA NIM | `nvidia/nemotron-3.5-lightning-30b-a3b` | `nim:nvidia/nemotron-3.5-lightning-30b-a3b` |

This table is a source-derived projection of the current v3 portfolio. The
`thought_observation` and `reflection_initiative` rows retain their explicit
configured-route versus dispatched-route distinction. The dispatched route is
the authoritative current behavior for those callers.

The current Model Fabric path records configured route, dispatched route,
provider/model identity, reasoning policy, compatibility fingerprint, and
receipt truth for these current paths. It does not alter the bindings shown
here.

Live model IDs are **current facts**, not architecture. Owner-selected
**future** direct-provider targets (including Qwen-primary Expression and Groq
120B Thought) live only in
[Model Fabric Architecture §12.9](architecture/Model_Fabric_Architecture.md).
This file must not claim those targets are already production-routed.

All production `completeChat` callers now enter the current Model Fabric
resolver.
Explicit route/model choices remain recorded overrides. The Thought
observation path still begins with `thought_observation` but dispatches the
forced `thought` route. Reflection still dispatches the current Thought route.
Engineering still records its specialist requirement while using the current
Expression/NIM Lightning compatibility row.

### Thought-observation naming seam

These identifiers are not interchangeable:

| Identifier | Current meaning |
|---|---|
| `thought_observation` | Attention/routing purpose requested by the observation job |
| `utility_bulk` | Configured compatibility route for that purpose |
| `thought` | Route currently forced by `runThoughtModel`, which overrides the compatibility mapping at dispatch |
| `thought.observation` | Historical F1-obs planned semantic purpose; not current dispatch; not MF-M1 |
| `thought_observation_shadow` | Deferred F1-obs feature mode; not MF-M1 |

The current resolver preserves and exposes this mismatch. The current `utility_bulk`
mapping is not claimed to be the route actually dispatched, and the
force-to-`thought` behavior is not repaired.

## Shared quota buckets

Quota is keyed by `provider:configuredModelId`, not by purpose.
`resolved_model_id` is continuity metadata only.

- `exchange_cognition`, `curiosity_consolidation`, and `maintenance` that
  dispatch `utility_bulk` share
  `nim:nvidia/nemotron-3.5-lightning-30b-a3b` under the v3 quota contract.
- `thought_observation` is *configured* as `utility_bulk` but is **dispatched
  as `thought`**, so it consumes the Cloudflare Thought bucket
  `cloudflare:@cf/nvidia/nemotron-3-120b-a12b`.
- Expression fallback is a distinct Groq bucket `groq:qwen/qwen3.6-27b` (TPM
  **6100**).

## Key handling (provider-aware)

- The enabled Thought route requires both `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`; enabled NIM routes require `NIM_API_KEY`; the
  enabled Groq fallback route requires `GROQ_API_KEY`.
- A missing key fails **before** attention reservation / limiter consumption and
  raises `agent_not_ready` (503). No `attention_requests` row is created.
- Cloudflare credentials are required only for the enabled Thought route. NIM
  (`NIM_API_KEY`) is required for enabled NIM rows. The Groq credential is
  required only for the enabled Expression fallback row.

## Fail-closed behavior

- **Disabled routes** (`sandbox_operator_light`, `sandbox_operator_deep`,
  `sandbox_reviewer`, `experimental_auditor`, `experimental_multimodal`) raise
  `operator_disabled` (503) and reserve no quota, invoke no adapter, require no
  key, and make no network call (e.g. no NIM `/v1/models`). There is **no
  fallback** to another provider.
- **Unknown routes** raise `route_disabled` (404).
- **Unknown providers** cause `adapterFor` to fail closed with
  `operator_disabled`. Cloudflare is the current candidate Thought primary
  adapter; NIM remains implemented and dormant for Thought.
- Route lifecycle (`enabled`) is checked before adapter selection.

## Thought failure model

`Thought` uses a deterministic floor: a rate-limited, unavailable, aborted, or
malformed model response yields `thoughtSource: "fallback"` with a sanitized
`thoughtError`. The current route snapshot does not provide a legacy background
Mistral or Groq cognition loop, and it does not introduce automatic
Cloudflare-to-NIM provider fallback.

## Disabled waves (NOT implemented)

- NVIDIA / NIM provider integration is **implemented** for the enabled current
  Thought, Expression, and utility rows. Older prose that said NIM was disabled
  is obsolete.
- Model-driven sandbox operator routes (`sandbox_operator_light`,
  `sandbox_operator_deep`, `sandbox_reviewer`) — still **disabled**. Their names
  do not grant capability and their retained configuration does not create a V2
  broker dependency. Any future use must satisfy the direct-Bubblewrap V2
  milestone contract, purpose-specific Model Fabric qualification, and the
  relevant authority gates.
- `experimental_auditor` and `experimental_multimodal` remain disabled.

## Additional live callers (not extra Wave 1 purposes)

These paths exist in the current source. They are **current** facts. They are
not owner-selected future targets.

| Caller | Logical role | What actually happens |
|---|---|---|
| `reflection/initiative.ts` | `reflection_initiative` | Configured as `utility_bulk`, then dispatched on the current Thought route |
| `engineering-model-adapter.ts` | `engineering` | Follows the current Expression/NIM Lightning compatibility row; `SpecialistRequirement` remains record-only |
| V0.2.1 Thought | `thought` | Current Thought-owned work uses the Cloudflare Nemotron 3 Super row |

Do not document these as already-migrated to Nemotron Ultra or as repaired.

## Observability

`GET /nuclear/routing?owner_id=` (owner-only) returns per-route, non-secret
status: route alias, provider, configured model ID, enabled state, quota
bucket, health (`ok`/`degraded`/`disabled`/`unused`), quota availability, last
successful dispatch time, last error class, resolved model ID when known, and
the current `fabric` projection containing portfolio revision, snapshot hash,
policy-row/occupant identity, admission basis, compatibility activation state,
and distinct health predicates. No API keys, raw prompts, model outputs, or
secret-bearing errors are exposed.

`GET /nuclear/attention?owner_id=` reports queue/continuity/outcomes, but its
`rpsLimit` / `tpmLimit` / `reservedTpm` fields are caller-level defaults, not
per-bucket pressure. Use `/nuclear/routing` for per-route TPM.
`foldAttentionDailyUsage` is not invoked in production.
