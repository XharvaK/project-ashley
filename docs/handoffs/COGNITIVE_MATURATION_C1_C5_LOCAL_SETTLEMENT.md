# Cognitive Maturation C1–C5 — Final Local Settlement

Date: 2026-08-27

## Final status

`C1_LOCAL_SETTLED_AND_COMMITTED: YES`

`C2_LOCAL_SETTLED_AND_COMMITTED: YES`

`C3_LOCAL_SETTLED_AND_COMMITTED: YES`

`C4_LOCAL_SETTLED_AND_COMMITTED: YES`

`C5_LOCAL_SETTLED_AND_COMMITTED: YES`

`FINAL_CROSS_MILESTONE_SETTLEMENT: PASS`

`NEW_RECONCILED_CANDIDATE_SHA: 09b73fbb180234a2ac7056756fc339083735f40e`

This is a current-production reconciliation candidate. It is ready for
independent differential review. It is not production-accepted, physically
qualified, activated, promoted, or deployed.

## Exact SHA record

| Record | Exact SHA |
|---|---|
| Original pre-C1 base for this reconciliation | `968787d1a5261aef4bf266091b8cf044eddbfdb2` |
| Historical previous integration base | `5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6` |
| Previous cognitive candidate, historical only | `a3bef15ec8e54ffc7fbf182572aeac716ca08021` |
| Accepted isolated cognitive functional source | `395b0b9ba6205fac86c4d70677bed36035e66a6c` |
| Reconciled C1 | `e71e1342551556212601db463f020e4d8642e163` |
| Reconciled C2 | `56d28258c7c1b066ee0059f5a88048fdf5a415cb` |
| Reconciled C3 | `5f65bec1a977a35d8a62d3a05b5713de6d79aba8` |
| Reconciled C4 | `2f918bd95feca44538d31c2970e2503f77a94540` |
| Reconciled C5 | `407c3b1b3466ddd58115d6b9ce6cab01dbb607ef` |
| C3-to-C4 evidence-binding repair | `d7842efc8cac1cf6054d15454ea7cfce1382d2a6` |
| Final candidate commit | `09b73fbb180234a2ac7056756fc339083735f40e` |
| Final handoff HEAD | Documentation-only descendant; exact value is recorded by the final `git rev-parse HEAD` in the return |

The final candidate commit is a descendant of current production. The final
handoff binding is documentation-only and does not change implementation
source. The required
ancestry proof is:

```text
git merge-base --is-ancestor 968787d1a5261aef4bf266091b8cf044eddbfdb2 <FINAL_HEAD>
```

## Settlement paths

- C1: `docs/handoffs/C1_LOCAL_SETTLEMENT.md`
- C2: `docs/handoffs/C2_LOCAL_SETTLEMENT.md`
- C3: `docs/handoffs/C3_LOCAL_SETTLEMENT.md`
- C4: `docs/handoffs/C4_LOCAL_SETTLEMENT.md`
- C5: `docs/handoffs/C5_LOCAL_SETTLEMENT.md`
- Current-production reconciliation: `docs/handoffs/COGNITIVE_MATURATION_CURRENT_PRODUCTION_RECONCILIATION.md`
- Differential review packet: `docs/handoffs/COGNITIVE_MATURATION_CURRENT_PRODUCTION_DIFFERENTIAL_REVIEW_PACKET.md`
- Physical qualification packet: `docs/handoffs/COGNITIVE_MATURATION_CURRENT_PRODUCTION_PHYSICAL_QUALIFICATION_PACKET.md`

## Schema progression

Current production is source-supported v35. The final additive progression is:

```text
v35 current production
  -> v36 C1 Memory / Evidence
  -> v37 C2 Context Budget
  -> v38 C3 Learned Autonomy
  -> v39 C4 Cognitive Graduation
  -> v40 C5 Relational Graduation
```

The final source reports `NUCLEAR_SUPPORTED_VERSION = 40`.

## Major implementation files by milestone

### C1 Memory / Evidence

- `apps/agent-service/src/core/memory/migration.ts`
- `apps/agent-service/src/core/memory/assertions.ts`
- `apps/agent-service/src/core/memory/eligibility.ts`
- `apps/agent-service/src/core/memory/corrections.ts`
- `apps/agent-service/src/core/memory/barriers.ts`
- `apps/agent-service/src/core/memory/fanout.ts`
- `apps/agent-service/src/core/memory/forget.ts`
- `apps/agent-service/src/core/agency/resolve-evidence.ts`

### C2 Context Budget

- `apps/agent-service/src/core/context-budget/plan.ts`
- `apps/agent-service/src/core/context-budget/eligibility.ts`
- `apps/agent-service/src/core/context-budget/receipts.ts`
- `apps/agent-service/src/core/context-budget/render.ts`
- `apps/agent-service/src/core/model-fabric/projection.ts`
- `apps/agent-service/src/mistral-client.ts`

### C3 Learned Autonomy

- `apps/agent-service/src/core/learned-autonomy/admit.ts`
- `apps/agent-service/src/core/learned-autonomy/eligibility.ts`
- `apps/agent-service/src/core/learned-autonomy/receipts.ts`
- `apps/agent-service/src/core/learned-autonomy/overlap-projection.ts`
- `apps/agent-service/src/core/agency/motivations.ts`
- `apps/agent-service/src/core/curiosity/reads.ts`

### C4 Cognitive Graduation

- `apps/agent-service/src/core/cognitive-graduation/predictions.ts`
- `apps/agent-service/src/core/cognitive-graduation/observations.ts`
- `apps/agent-service/src/core/cognitive-graduation/adjudications.ts`
- `apps/agent-service/src/core/cognitive-graduation/calibration.ts`
- `apps/agent-service/src/core/cognitive-graduation/view-links.ts`
- `apps/agent-service/src/core/qualification/c4-evaluation-artifacts.ts`
- `apps/agent-service/src/core/reflection/c4-future-only.ts`

### C5 Relational Graduation

- `apps/agent-service/src/core/relationship/projections.ts`
- `apps/agent-service/src/core/relationship/consent.ts`
- `apps/agent-service/src/core/relationship/interaction-contracts.ts`
- `apps/agent-service/src/core/relationship/repair.ts`
- `apps/agent-service/src/core/relationship/forget.ts`
- `apps/agent-service/src/core/relationship/authority.ts`
- `apps/agent-service/src/core/agency/motivations.ts`

### Current-production authority preserved

- `apps/agent-service/src/core/model-fabric/`
- `apps/agent-service/src/core/model-routing/`
- `apps/agent-service/src/core/runtime.ts`
- `apps/agent-service/src/core/sandbox/reactive-operational-admission.ts`
- `apps/agent-service/src/core/sandbox/operational-truth.ts`
- `apps/agent-service/src/core/identity/`
- `apps/discord-bot/`

## Acceptance evidence by milestone

| Milestone | Acceptance witnesses |
|---|---|
| C1 | Currentness, provenance, typed correction, barriers, fan-out, receipts, reconciliation, forgetting, restore witnesses, reader cutover, and non-revival. `memory_evidence` remains observe/unpromoted/non-influential. |
| C2 | Bounded UTF-8 projection, required-section refusal, currentness/privacy/provenance filtering, immutable content/evidence bindings, metadata-only receipts, distinct initial/continuation/fallback allocations, and no truth mutation under budget pressure. |
| C3 | Two temporally distinct C1-live references, explicit adjudication, bounded learned-interest choice receipt, C1 revalidation, demotion/non-revival, observe inertness, and no Identity mutation. |
| C4 | C1/C3-bound prediction, separate observation/adjudication, typed deterministic comparison, unresolved unknown outcomes, future-only calibration, lived-experience binding, rollback/non-revival, and no current-turn or Operational Truth authority. |
| C5 | Separately current owner/Ashley shared culture, historical preservation, bilateral consent/revocation, interaction contracts, disagreement/withdrawal/repair, privacy/non-manipulation, dependent forgetting, and no Identity or speech-authority collapse. |

## Focused verification totals

The final bounded focused verification passed:

| Focused pack | Test files | Tests |
|---|---:|---:|
| C1–C5 cognitive domains | 54 | 150 |
| Current Model Fabric and model routing | 17 | 165 |
| Current production consumers and schema | 8 | 74 |
| Operational Truth, Sandbox V2, Identity, routes, capability ceilings | 10 | 94 |

The packs overlap. These totals are evidence-pack totals, not a unique-test
sum. The exact milestone reconciliation results were C3 11/24, C4 plus
compatibility 13/35, and C5 plus compatibility 22/59. C1/C2 combined
compatibility verification passed 27/91.

The initial oversized mixed invocation exited on a Vitest `onTaskUpdate`
timeout after its assertions passed. It is not counted as a clean pass. The
bounded reruns above exited cleanly.

## Build and diff

- `npm run build --prefix apps/agent-service`: PASS.
- `git diff --check`: PASS; only expected Windows line-ending warnings were
  emitted.
- Final worktree: clean at the final handoff HEAD, with the implementation
  candidate commit recorded separately above.

## Cross-milestone verdict

`CROSS_C1_C5_CONTRACT_VERDICT: PASS`

The cross-milestone audit proves:

- C1 correction/currentness and provenance are respected by C2 projection and
  C3 influence;
- C1 and repaired C3 learned-state semantics are consumed by C4 without
  current-turn authority;
- C1 owner/Ashley temporal state is consumed by C5 without Identity collapse;
- C2 budget variation does not alter durable or semantic truth;
- C3 learned influence does not widen authority;
- C4 calibration does not become global confidence, Metacognition authority,
  or Identity authority;
- C5 recomputation preserves separate owner and Ashley identities;
- historical state remains inspectable where required;
- invalid, corrected, superseded, withdrawn, revoked, demoted, and rolled-back
  state cannot silently revive downstream;
- owner correction cannot mutate Ashley Identity;
- Reflection does not become authority;
- Metacognition is not created as a self-modification authority.

## Production and qualification boundaries

Provider calls: none.

Production database mutation: none.

Mint access: none.

Physical qualification: not run.

Deployment or restart: none.

Activation or promotion: none.

Push: none.

The candidate is not production-ready. It requires independent differential
review, then exact-candidate physical qualification and the separately
authorized release gates before any production action.

## Remaining debt

- Independent differential review is pending.
- Physical Linux Mint/Bubblewrap qualification is pending.
- Exact-candidate production acceptance is pending.
- Provider smoke remains intentionally unrun.
- Full repository corpus and full evaluation campaign remain intentionally
  unrun.
- C1–C5 capabilities remain observe/unpromoted/non-live by design.

## Recommendation

Proceed to the differential review packet bound to the final exact SHA. If that
review passes, perform the separately authorized physical qualification packet.
Do not treat this local settlement as deployment, activation, promotion, or
production acceptance.
