# C2 Local Settlement — Context Budget

Date: 2026-08-26

## Result

`C2 LOCAL_SETTLED: YES`

C2 is implemented on the committed C1 baseline
`378e14b2a7dc1b61f0313e0729b2ac45dda666d6`.

The C2 capability remains `observe`. Dark-apply is a local test and inspection
path only. It does not grant live influence, route authority, promotion, or
activation.

## Implementation scope

- Added additive nuclear schema v36 for versioned context-budget policies,
  allocation receipts, summary projections, and maturation contract state.
- Added fail-closed v35/v36 schema validation and migration wiring.
- Added C2 eligibility from C1 currentness, provenance, privacy classification,
  retrieval eligibility, correction barriers, and canonical route bindings.
- Added UTF-8-byte budget planning with separate token estimation, required
  section protection, deterministic omission, and bounded selection.
- Added immutable provider-independent `ContextProjection` with evidence
  references, content binding, structural telemetry, and measured bounds.
- Added metadata-only allocation receipts and owner-scoped inspection.
- Added Thought initial and continuation enrollment, Expression primary
  enrollment, and a distinct Expression fallback projection.
- Added a minimal `completeChat` projection transport seam. Provider routes,
  adapters, role labels, and model payload contracts remain unchanged.
- Added owner-scoped `/nuclear/context-budget` diagnostics without prompt
  bodies.

The durable memory/evidence truth is not mutated to satisfy a budget. Local
persistence and inference locality remain separate. C2 remains a bounded
projection layer and does not become Recall or Memory authority.

## Schema and migration

- Nuclear schema progression: v35 (C1 baseline) → v36 (C2).
- C2 contract state is versioned at contract version `1` and defaults to
  `observe` with no live high-water mark.
- C2 schema validation rejects newer v36 objects while validating a v35
  database and fails closed for unsupported newer schema versions.

## Exact implementation files

### New

- `apps/agent-service/src/core/context-budget/context-budget-gap.test.ts`
- `apps/agent-service/src/core/context-budget/contract-state.ts`
- `apps/agent-service/src/core/context-budget/dark-apply.test.ts`
- `apps/agent-service/src/core/context-budget/dark-apply.ts`
- `apps/agent-service/src/core/context-budget/eligibility.test.ts`
- `apps/agent-service/src/core/context-budget/eligibility.ts`
- `apps/agent-service/src/core/context-budget/inspect.ts`
- `apps/agent-service/src/core/context-budget/migration-36.ts`
- `apps/agent-service/src/core/context-budget/plan.test.ts`
- `apps/agent-service/src/core/context-budget/plan.ts`
- `apps/agent-service/src/core/context-budget/provider-bound.test.ts`
- `apps/agent-service/src/core/context-budget/receipt.test.ts`
- `apps/agent-service/src/core/context-budget/receipts.ts`
- `apps/agent-service/src/core/context-budget/render.ts`
- `apps/agent-service/src/core/context-budget/schema.test.ts`
- `apps/agent-service/src/core/context-budget/settlement.test.ts`
- `apps/agent-service/src/core/context-budget/types.ts`
- `apps/agent-service/src/core/agency/thought-context-budget.test.ts`
- `apps/agent-service/src/core/conversation/expression-context-budget.test.ts`
- `apps/agent-service/src/core/model-fabric/index.ts`
- `apps/agent-service/src/core/model-fabric/projection.test.ts`
- `apps/agent-service/src/core/model-fabric/projection.ts`
- `docs/handoffs/C2_IMPLEMENTATION_HEAD_AUDIT.md`
- `docs/superpowers/plans/2026-08-26-c2-context-budget-implementation.md`

### Modified

- `apps/agent-service/src/core/agency/thought.ts`
- `apps/agent-service/src/core/cognition/schema-contract.ts`
- `apps/agent-service/src/core/conversation/expression-fallback.ts`
- `apps/agent-service/src/core/conversation/expression.ts`
- `apps/agent-service/src/core/db.ts`
- `apps/agent-service/src/core/rollout/capabilities.ts`
- `apps/agent-service/src/mistral-client.ts`
- `apps/agent-service/src/server.ts`

## Acceptance witnesses

- The same candidate state can produce different bounded selections under
  different policies while durable candidate truth remains unchanged.
- UTF-8 byte accounting is hard; token estimation is separate telemetry.
- Required sections refuse when privacy/currentness filtering removes their
  only eligible input or when their required minimum exceeds the budget.
- I4 and barrier-covered current material do not enter the projection.
- Shadow material is not current influence evidence; corrected/historical
  labels remain inspectable without reviving influence.
- Caller-supplied route-class or remote approval hints do not authorize egress.
- Projection parts and bounds are immutable, evidence references are non-empty,
  and content binding is distinct from structural telemetry.
- Allocation receipts contain metadata and references only; prompt bodies are
  absent.
- Thought initial and continuation use the C2 seam in dark apply.
- Expression primary and fallback use distinct purposes and allocations.
- Observe mode preserves the existing unbudgeted compatibility path and emits
  no C2 allocation receipt.
- Groq/NIM adapter fixtures receive the bounded messages without changing
  provider role labels or adapter payload semantics.
- A higher C2 contract version fails closed.

## Focused verification

Command:

```text
npm test --prefix apps/agent-service -- src/core/context-budget/context-budget-gap.test.ts src/core/context-budget/schema.test.ts src/core/context-budget/eligibility.test.ts src/core/context-budget/plan.test.ts src/core/context-budget/receipt.test.ts src/core/context-budget/dark-apply.test.ts src/core/context-budget/settlement.test.ts src/core/model-fabric/projection.test.ts src/core/agency/thought-context-budget.test.ts src/core/conversation/expression-context-budget.test.ts src/core/context-budget/provider-bound.test.ts
```

Result: `11` test files passed, `30` tests passed.

Additional verification:

- `npm run build --prefix apps/agent-service` — passed.
- `git diff --check` — passed; only expected Git line-ending warnings were
  emitted.

## Explicit exclusions and remaining debt

- No provider calls or live provider smoke were run.
- No full repository corpus was run.
- No Mint access, Linux qualification, deployment, production mutation,
  activation, promotion, or push was performed.
- No independent accepted remote I2/I3 approval path exists in this slice;
  remote protected context therefore remains excluded.
- C2 live `apply` and capability promotion remain outside this implementation
  run.
- CompleteChat callers outside the frozen C2 enrollment set remain explicitly
  legacy/unbudgeted.
- C2 does not claim production readiness or qualified routing.

## Forbidden-scope confirmation

No push, deployment, Mint access, production mutation, Model Fabric
activation, qualification, promotion, external effect, or provider call was
performed.
