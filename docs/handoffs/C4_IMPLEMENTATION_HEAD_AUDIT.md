# C4 implementation-HEAD predecessor audit

**Wave:** C4 Cognitive Graduation
**Implementation HEAD:** `cb6b454a01988afea7678393f3c328bfeb9d2b3f`
**Audit date:** 2026-08-26
**Predecessors:** C1 `LOCAL_SETTLED` and C3 `LOCAL_SETTLED`

## Result

`PREDECESSOR_AUDIT: PASS`

C1 is locally settled and committed at `378e14b2a7dc1b61f0313e0729b2ac45dda666d6`.
C3 is locally settled and committed at `cb6b454a01988afea7678393f3c328bfeb9d2b3f`.
The worktree was clean before this audit. No C4 source or schema changes
existed at the audited HEAD.

## Assumed-interface comparison

| Contract interface | Current implementation | Classification | C4 action |
|---|---|---|---|
| C1 current assertions and deny barriers | `memory/assertions.ts`, `memory/eligibility.ts`, and `memory/barriers.ts` expose currentness, influence eligibility, and barrier reads | Locator / compatible | Consume these readers. Do not add a second truth store. |
| C3 qualified learned interest | `learned-autonomy/eligibility.ts` exposes active learned rows only for explicit `dark_apply` | Locator / compatible | Use qualified rows as optional evidence. Do not make C3 an owner of C4 meaning. |
| Thought decision identity | `agency/log.ts` persists `decision_log` rows and returns an integer id | Locator / compatible | Bind selected predictions to the persisted decision id. |
| Existing decision outcome | `decision_log.outcome_text` is delivered speech or bounded result text | Semantic boundary | Do not reinterpret it as prediction outcome. Add append-only C4 observations. |
| Reflection calibration | `reflection/initiative.ts` owns older kind-level initiative learning | Semantic boundary | Add a separate future-only C4 calibration interface. Do not reuse `initiative_learning`. |
| Operational receipts | Delivery, sandbox, and cognition paths persist operational records | Locator / compatible | Bind typed/resolvable observations from receipt-backed evidence only. A receipt does not adjudicate semantic disposition. |
| Evaluation plane | Existing qualification code covers other waves; no C4 dimension artifact adapter exists | Missing implementation detail | Add a small immutable artifact-id/hash adapter. Do not create a C4 pass/fail belief table. |
| Contract state | `cognitive_maturation_contract_state` contains C2/C3 markers and supports C4 wave values | Locator / compatible | Add C4 marker at schema v38 with current-candidate version fail-closed checks. |
| Runtime capability | `cognitive_graduation` exists and remains `observe`; `capabilityCanInfluence` requires live apply | Safety boundary | Use an explicit fixture-only `dark_apply` gate. Do not activate or promote. |

## Known C4 gaps at this HEAD

1. There is no `cognitive_predictions` table, so no selected consequential
   prediction can be distinguished from ordinary `decision_log` metadata.
2. There are no append-only operational observation or semantic adjudication
   records. `outcome_text` and operational receipts cannot fill that role.
3. There are no explicit C1 working-view links or evidence-bound
   lived-experience links.
4. There is no bounded future-Thought calibration record linked to the latest
   admitted adjudication.
5. There is no C4 EvaluationDefinition/QualificationResult reference adapter.

## C4 safety constraints carried into implementation

- Additive schema only; nuclear schema advances from v37 to v38.
- No historical `decision_log` backfill into selected predictions.
- No hidden chain-of-thought, global confidence, personhood, C5 tables, or
  `core/metacognition/` module.
- Current C1 assertion currentness and barriers remain the source of truth.
- Operational observations and semantic adjudications stay separate and
  append-only.
- Reflection can admit only bounded future-Thought calibration; it cannot
  mutate an in-flight `Decision`.
- C4 records stay observe/unpromoted. Dark apply is fixture-only.
- No provider calls, production database mutation, Mint access, qualification,
  activation, promotion, deployment, or push.
