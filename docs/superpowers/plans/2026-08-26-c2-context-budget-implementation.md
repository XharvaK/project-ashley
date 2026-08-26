# C2 Context Budget Implementation Plan

**Status:** execution plan for the owner-accepted C1–C5 continuation

**Baseline:** C1 commit `378e14b2a7dc1b61f0313e0729b2ac45dda666d6`

**Scope:** implement and locally settle C2 only, then commit it before
continuing to C3. C3–C5 are not implemented in this plan.

## Contract decisions

1. Use UTF-8 bytes as the hard accounting unit and derive the token estimate
   with divisor 4. Numeric policy limits are implementation policy, not
   architecture.
2. Add the C2 tables and shared `cognitive_maturation_contract_state` in the
   next source-derived migration, v36. Do not backfill prompt bodies or
   historical projections.
3. Add a minimal `core/model-fabric/projection.ts` envelope because the current
   implementation HEAD has no projection seam. Keep it caller-built and
   immutable. Do not change route occupants, provider registry, or fallback
   policy.
4. Enroll exactly Thought, Expression primary, and Expression fallback. Keep
   cognition worker, Curiosity consolidation, Reflection OCI adjudication, and
   engineering model calls explicitly `legacy_unbudgeted`.
5. Use `canEnterModelContext` for classification enforcement. Use C1
   `influenceEligibleAt`, `annotationForAssertion`, and source-specific
   eligibility readers for current versus retrieval sections.
6. Keep C2 default `observe`. Dark-apply is a fixture option on C2 library
   calls only; no live promotion or capability activation is added.
7. Omit whole context items with explicit reasons. Do not strip C1 role labels,
   mutate C1 rows, or add a `ContextMemory`/vector store.

## Implementation sequence

### Slice 0 — audit and characterization

- Keep the current-gap audit in
  `docs/handoffs/C2_IMPLEMENTATION_HEAD_AUDIT.md`.
- Add `context-budget-gap.test.ts` to pin the pre-C2 facts: no allocation
  receipts, empty Fabric seam, Thought candidate count cut, expression overlap,
  fallback distinction gap, and excluded legacy callers.

### Slice 1 — additive schema and capability

- Add `core/context-budget/migration-36.ts` with policy, allocation receipt,
  optional summary, and shared contract-state tables.
- Wire v36 into `core/db.ts`, update schema-content validation, and preserve
  migration protocol behavior.
- Add `context_budget` as an observe-only capability with a C1 dependency.
- Add schema tests for constraints, empty migration state, and higher-version
  fail-closed behavior.

### Slice 2 — typed eligibility

- Add `context-budget/types.ts` for requests, candidates, budgets, selections,
  projection and receipt shapes.
- Add `context-budget/eligibility.ts` for classification, C1 currentness,
  barrier, provenance, route trust, required-section, and omission decisions.
- Reject secret, I4, unknown/unsafe remote I2/I3, forgotten/redacted, and
  barrier-covered current-assumption inputs.
- Preserve labeled historical/corrected input only in inspect/labeled sections.

### Slice 3 — deterministic budget planning

- Add `context-budget/plan.ts` for policy loading, section reservations,
  UTF-8 accounting, total-ceiling checks, and required-section refusal.
- Add multiple-budget tests proving the same snapshot can produce different
  selections without changing source rows.

### Slice 4 — projection, rendering, and receipts

- Add `core/model-fabric/projection.ts` with immutable parts, evidence refs,
  measurements, bounds, content binding, and content-free telemetry shape.
- Add `context-budget/render.ts` and `receipts.ts` to render provider-bound
  messages, preserve C1 labels, fill Fabric evidence refs, and persist a
  content-free allocation receipt.
- Add `inspect.ts` and owner-scoped diagnostics.
- Add receipt hash/projection-binding and provider-envelope tests.

### Slice 5 — Thought installation

- Route initial Thought candidate context through the C2 builder.
- Route Pass 2 continuation through the same bounded path, including bounded
  operational observation content.
- Keep model parsing and semantic adjudication in Thought.
- Preserve retry and existing completion semantics.

### Slice 6 — Expression installation

- Route the primary Expression system/history/current message through C2.
- Treat fallback as a separately identified ContextRequest and receipt.
- Remove system/history duplication through allocation selection, not by
  mutating memory or dropping C1 labels.
- Preserve private `never_public` eligibility and public `ordinary` ceiling.

### Slice 7 — provider-bound witnesses

- Inspect mapped NIM, Mistral, and Groq adapter request bodies through injected
  fetch/client seams.
- Prove corrected/current/historical C1 role labels survive mapping.
- Prove same snapshot plus two budgets creates distinct bindings when omission
  is required, while source rows remain unchanged.

### Slice 8 — settlement and adversarial closure

- Add settlement tests for dark-apply only, default observe/unpromoted state,
  crash/refusal, higher persisted version rejection, rollback safety, no
  forgotten-content retention, and legacy-caller exclusion.
- Run the exact C2 focused test pack and affected existing regressions.
- Run `npm run build --prefix apps/agent-service` and `git diff --check`.
- Write `docs/handoffs/C2_LOCAL_SETTLEMENT.md`.
- Stage only C2 paths, verify staged scope and whitespace, and create one
  coherent local C2 commit. Record its exact SHA, then continue to C3.

## Verification commands

Use only explicit files from the focused strategy. The C2 settlement command
will name the new C2 tests plus affected current tests individually. Do not run
the full corpus, `phase0:offline`, `eval:full`, provider smoke, or Mint work.
