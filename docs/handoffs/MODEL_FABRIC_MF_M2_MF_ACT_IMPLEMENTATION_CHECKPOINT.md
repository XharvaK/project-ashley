# Model Fabric MF-M2 → MF-ACT implementation checkpoint

**Status:** `IN_PROGRESS` — local machinery implementation only.

**Worktree:** `C:\Users\Xharv\Projects\model-fabric-m2-act-implementation`

**Branch:** `model-fabric-m2-act-autopilot`

**Frozen baseline:** `12b6b022c56321c8104d556fdd8a35a95419a51c`

**Date:** 2026-08-25

This checkpoint records local implementation evidence. It is not a
qualification, release, deployment, production-acceptance, promotion, owner
approval, activation, or Mint witness.

```text
CURRENT ROUTING PRESERVED
TARGET 12.9 ROUTING DARK
NO PRODUCTION OWNER APPROVAL REF CREATED
NO PRODUCTION ACTIVATION REF CREATED
NO MINT
NO DEPLOY
NO PUSH
```

Governing contract:
[`../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md`](../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md)

## Slice status

| Slice | Local state | Production routing change |
|---|---|---|
| SLICE 0 | `IMPLEMENTED / focused verified` | None |
| MF-M2 | `IMPLEMENTED / focused verified` | None |
| MF-M3 | `IMPLEMENTED / focused verified` | None |
| MF-M4 | `IMPLEMENTED / focused verified` | None |
| MF-M5 | `IMPLEMENTED / focused verified` | None |
| MF-M6 | `PENDING` | None |
| MF-ACT | `PENDING` | None |

## SLICE 0 evidence

Implemented in the working tree:

- R1 failure finalization now preserves `transport_failover` when the
  compatibility Thought invocation reaches its second provider attempt.
- R2 recognizes SDK-shaped observed 4xx/5xx status as
  `provider_response` / `response_received` without using a mapped error's
  `httpStatus` as transport proof.
- Groq/NIM connection failures remain `dispatch_attempted` /
  `sent_outcome_unknown`.
- Mistral is constructed with `retryConfig: { strategy: "none" }`.
- Focused regressions are in
  `apps/agent-service/src/core/model-fabric/slice0-receipts.test.ts`.

Focused verification at this checkpoint:

- Model Fabric, Thought failover, and Groq/NIM adapter pack: **5 files, 45
  tests passed**.
- `apps/agent-service` `npm run build`: **PASS**.
- `git diff --check`: **PASS**; Git reports only its normal LF/CRLF warning
  for the edited TypeScript file.

The earlier broad baseline run is historical evidence only. Per the owner
test-scope override, it will not be repeated unless a concrete cross-subsystem
failure requires the smallest additional focused suite.

## MF-M2 evidence

Local commit:
`b9f4ed1015ada9cd56f0f2b2d4046ed6a9a49095`

Implemented:

- complete `config/model-fabric/portfolios/current-compatibility.v1.json`
  with all current role/occupancy rows and copied route enablement/quota
  contracts;
- typed, validated, stable-hashed CURRENT resolver;
- explicit route/model override recording;
- configured-versus-dispatched observation and reflection scars;
- engineering `SpecialistRequirement` record-only behavior;
- snapshot-backed route lifecycle/quota records;
- owner routing status projection with policy rows, occupants, admission basis,
  compatibility activation state, and distinct health predicates;
- provider wire translation data and Mistral retry pin.

Focused MF-M2 settlement:

- **10 test files, 110 tests passed** across Fabric, routing, adapters,
  Expression fallback, and route-precedence regressions;
- `apps/agent-service` `npm run build`: **PASS**;
- `git diff --check`: **PASS**.

## MF-M3 evidence

Local commit:
`9311d0a`

Implemented:

- independence-group, specialist-seat, and coupling catalog records;
- declared target portfolio `target-12-9.v1.json`, kept dark and excluded from
  CURRENT dispatch;
- discovery records that begin `unqualified` and do not mint owner approval;
- lifecycle transition guards for owner approval, invalidation, and degraded
  recovery;
- exact qualification-result-to-profile/inference binding validation;
- rejection of compatibility and aggregate reports as qualification evidence;
- independent-judge group separation and unordered candidate preservation.

Focused MF-M3 settlement:

- **2 test files, 14 tests passed** (MF-M2 adjacent regression plus MF-M3);
- `apps/agent-service` `npm run build`: **PASS**;
- `git diff --check`: **PASS**.

## MF-M4 evidence

Local commit:
`e61d563e824c15e27a8cf74134d87fab3ffb879d`

Implemented:

- raw OpenCode Zen `chat/completions` adapter with no SDK retry behavior;
- absent-key, unsupported-responses-endpoint, tool-bearing, and owner-private
  privacy refusals;
- one-provider-request accounting and normalized completion/error handling;
- explicit dark provider registration without adding Zen to the CURRENT route
  snapshot or Thought failover bucket;
- boot-safe environment fields for `OPENCODE_ZEN_API_KEY` and the Zen base URL.

Focused MF-M4 settlement:

- **4 test files, 49 tests passed** across the Zen adapter, routing integration,
  Thought failover, and MF-M2 current-routing regressions;
- `apps/agent-service` `npm run build`: **PASS**;
- `git diff --check`: **PASS**.

## MF-M5 evidence

Local commit:
`e909a68b45ca83b7b498f934e562430efa751a8f`

Implemented:

- distinct configured, available, qualified, owner-approved, active, degraded,
  cooldown, and ready predicates;
- process-local health registry with explicit failure, success, and restart
  behavior;
- ordered approved-chain filtering and deterministic ready-occupant walking;
- exclusion of unqualified, invalidated, revoked, inactive, and unordered
  candidates;
- fail-closed behavior when no approved occupant is ready, including quota
  pressure without arbitrary cheaper-occupant selection.

Focused MF-M5 settlement:

- **2 test files, 15 tests passed** (MF-M5 health plus MF-M2 routing-status
  regression);
- `apps/agent-service` `npm run build`: **PASS**;
- `git diff --check`: **PASS**.

## Gates remaining

- Specialist and activation machinery are not implemented yet.
- No route is qualified, owner-approved, activation-approved, deployed, or
  production-accepted by this worktree.
