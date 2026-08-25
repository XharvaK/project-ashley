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
| Document reviewed at repository revision | `b9f4ed1015ada9cd56f0f2b2d4046ed6a9a49095` |
| Route-table audit baseline | `b9f4ed1015ada9cd56f0f2b2d4046ed6a9a49095` |
| Audit method | Read-only comparison of the Wave 1 table below to `config/model-fabric/portfolios/current-compatibility.v1.json`, `portfolio.ts`, `router.ts`, `registry.ts`, provider adapters, and the focused MF-M1/MF-M2 routing regressions |
| Last route-table audit | 2026-08-25 MF-M2 candidate audit; current occupants, buckets, enablement, and compatibility scars remain unchanged |
| Stale when | the CURRENT portfolio, resolver, route-dispatch behavior, or provider bindings change and a new audit has not been performed |

Current route facts are now consumed from one validated CURRENT snapshot:

- [`config/model-fabric/portfolios/current-compatibility.v1.json`](../config/model-fabric/portfolios/current-compatibility.v1.json), which owns the complete current policy rows, route bindings, enablement, and quota contracts;
- [`portfolio.ts`](../apps/agent-service/src/core/model-fabric/portfolio.ts), which validates and hashes the snapshot and resolves role/occupancy/overrides; and
- [`router.ts`](../apps/agent-service/src/core/model-routing/router.ts), which projects the snapshot for Attention quota and route lifecycle checks.

`config/models.json` remains historical compatibility configuration and is no
longer the dispatch authority after MF-M2. Owner-selected §12.9 targets are
**not** current routing.

Pass-2/2.1 MF-M2–MF-ACT contracts are `IMPLEMENTATION_READY` machinery.
The local MF-M2 candidate does not change the live table below. Live Thought remains NIM
`openai/gpt-oss-20b` wire `low` (normalized policy `economical`, not
`standard`). Live Expression remains Mistral primary → Qwen `none`.
Live output ceilings (caller-owned, not a model change): Thought `2048`
with the existing 6000 ms interactive deadline; interactive Expression
`2048`. Declared TARGET after `mfp_target_12_9_v2` is still dark. See
[`docs/handoffs/MODEL_FABRIC_TARGET_PORTFOLIO_TOKEN_ENVELOPE_RECONCILIATION.md`](../handoffs/MODEL_FABRIC_TARGET_PORTFOLIO_TOKEN_ENVELOPE_RECONCILIATION.md).
Luna MUST NOT treat documentation fixtures as dispatch.

Nuclear schema version is source-derived from
[`core/db.ts`](../apps/agent-service/src/core/db.ts). Do not copy the integer
here.

Model IDs, quota values, and enabled states are `SOURCE-DERIVED CURRENT FACT`,
not architectural law. Model Fabric owns the future semantic profile/dispatch
contract. Refresh this file by re-auditing source; do not copy HEAD into the
tables without that audit.

The MF-M2 candidate started from exact `12b6b022c56321c8104d556fdd8a35a95419a51c`
and moves current route authority into the hashed portfolio without changing
occupants, provider/model bindings, failover eligibility, or fallback ownership.

## Implemented routing (Wave 1)

| Purpose | Route alias | Provider | Model | Quota bucket |
|---|---|---|---|---|
| `expression` | `ashley_expression` | Mistral | `mistral-medium-latest` | `mistral:mistral-medium-latest` unless `MISTRAL_MODEL` overrides |
| Expression fallback after an eligible primary failure | `ashley_expression_fallback` | Groq | `qwen/qwen3.6-27b` | `groq:qwen/qwen3.6-27b` |
| `thought` | `thought` | NVIDIA NIM (primary) / Groq (failover) | `openai/gpt-oss-20b` | `nim:openai/gpt-oss-20b` (primary) / `groq:openai/gpt-oss-20b` (failover) |
| `exchange_cognition` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |
| `curiosity_consolidation` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |
| `thought_observation` | `utility_bulk` configured / `thought` dispatched | NIM primary / Groq failover | `openai/gpt-oss-20b` | Thought buckets; Groq failover shares `groq:openai/gpt-oss-20b` |
| `maintenance` | `utility_bulk` | Groq | `openai/gpt-oss-20b` | `groq:openai/gpt-oss-20b` |

This table is the audited source snapshot at the route-table audit baseline
named above. **Dispatch caveat:** `thought_observation` is *configured* as
`utility_bulk` in `config/models.json` and `PURPOSE_TO_ROUTE`, but
`runThoughtModel` currently **forces** `route: "thought"` (NIM/Groq 20B
failover), so observation does not actually consume the Groq utility bucket.
See the naming seam below.
(NVIDIA NIM `openai/gpt-oss-20b` primary -> Groq `openai/gpt-oss-20b` secondary
on eligible transport/capacity failures when remaining deadline >= 2500ms).

The MF-M1 candidate records configured route, dispatched route, provider/model
identity, reasoning policy, compatibility fingerprint, and receipt truth for
these current paths. It does not alter the bindings shown here.

Live model IDs are **current facts**, not architecture. Owner-selected
**future** direct-provider targets (including Qwen-primary Expression and Groq
120B Thought) live only in
[Model Fabric Architecture §12.9](architecture/Model_Fabric_Architecture.md).
This file must not claim those targets are already production-routed.

All production `completeChat` callers now enter the MF-M2 CURRENT resolver.
Explicit route/model choices remain recorded overrides. The Thought
observation path still begins with `thought_observation` but dispatches the
forced `thought` route. Reflection still forces `thought` and overrides
`model: env.mistralModel`. Engineering still records its specialist
requirement while using the Expression/Mistral compatibility row.

### Thought-observation naming seam

These identifiers are not interchangeable:

| Identifier | Current meaning |
|---|---|
| `thought_observation` | Attention/routing purpose requested by the observation job |
| `utility_bulk` | Configured compatibility route for that purpose |
| `thought` | Route currently forced by `runThoughtModel`, which overrides the compatibility mapping at dispatch |
| `thought.observation` | Historical F1-obs planned semantic purpose; not current dispatch; not MF-M1 |
| `thought_observation_shadow` | Deferred F1-obs feature mode; not MF-M1 |

**MF-M1/MF-M2** preserve and expose this mismatch. The current `utility_bulk`
mapping is not claimed to be the route actually dispatched, and the
force-to-`thought` behavior is not repaired.

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

## Additional live callers (not extra Wave 1 purposes)

These paths exist in source at the MF-M1 candidate. They are **current**
facts. They are not §12.9 targets. MF-M1 preserved them; MF-M2 must keep
them as recorded overrides / scars.

| Caller | Logical role | What actually happens |
|---|---|---|
| `reflection/initiative.ts` | `reflection_initiative` | Purpose maps `utility_bulk`, then forced `thought` with `model: env.mistralModel` |
| `engineering-model-adapter.ts` | `engineering` | Omitted purpose resolves to Expression / Mistral quota; `SpecialistRequirement` recorded only |
| Durable/proactive Thought | `thought` | Same NIM→Groq 20B occupants as reactive Thought; deadline is remaining job time or none |

Do not document these as already-migrated to Nemotron Ultra or as repaired.

## Observability

`GET /nuclear/routing?owner_id=` (owner-only) returns per-route, non-secret
status: route alias, provider, configured model ID, enabled state, quota
bucket, health (`ok`/`degraded`/`disabled`/`unused`), quota availability, last
successful dispatch time, last error class, resolved model ID when known, and
the MF-M2 `fabric` projection containing portfolio revision, snapshot hash,
policy-row/occupant identity, admission basis, compatibility activation state,
and distinct health predicates. No API keys, raw prompts, model outputs, or
secret-bearing errors are exposed.

`GET /nuclear/attention?owner_id=` reports queue/continuity/outcomes, but its
`rpsLimit` / `tpmLimit` / `reservedTpm` fields are **Mistral env defaults**,
not per-bucket Groq/NIM pressure. Use `/nuclear/routing` for per-route TPM.
`foldAttentionDailyUsage` is not invoked in production.
