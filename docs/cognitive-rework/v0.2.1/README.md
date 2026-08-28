# Cognitive Rework v0.2.1 — Implementation Packet

**Status:** `ACCEPTED ARCHITECTURE / IMPLEMENTATION PLANNED`

**Execution status:** `BLOCKED_PENDING_OWNER_BASELINE_SELECTION` until [`OWNER_BASELINE_GATE.md`](OWNER_BASELINE_GATE.md) records Doc’s SHA. After that gate, Luna may implement. This packet still does not authorize production cutover or `PRODUCTION_ACCEPTED`.

**Packet revision:** R2.1 (quota-aware Q3; Gate A still unset). Changelog: [`PACKET_CORRECTION_R2.md`](PACKET_CORRECTION_R2.md).

**Architecture-reference inspection SHA:** `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` (detached HEAD at packet R2 inspection). **Do not implement from a detached historical SHA.** Owner must select the implementation baseline.

**Canonical architecture:** [00_ARCHITECTURE_REFERENCE.md](00_ARCHITECTURE_REFERENCE.md) and focused contract [`docs/architecture/cognitive/Ashley_Cognitive_Architecture_v0.2.1.md`](../../architecture/cognitive/Ashley_Cognitive_Architecture_v0.2.1.md).

**Software contracts:** [02_IMPLEMENTATION_SPECIFICATION.md](02_IMPLEMENTATION_SPECIFICATION.md) (`IMPLEMENTATION_SPEC_VERSION = "0.2.1.r2"`).

**Do not reinterpret the architecture.** If a phase document and the specification disagree, the specification wins for types/names; the architecture reference wins for laws. If those two disagree, **HARD BLOCKER**.

---

## Luna Max — start here

Read in this exact order before any code:

1. This README
2. [LUNA_MAX_EXECUTION_HANDOFF.md](LUNA_MAX_EXECUTION_HANDOFF.md)
3. [OWNER_BASELINE_GATE.md](OWNER_BASELINE_GATE.md) — **STOP if UNSET**
4. [OWNER_ACCEPTANCE_RECORD.md](OWNER_ACCEPTANCE_RECORD.md)
5. [00_ARCHITECTURE_REFERENCE.md](00_ARCHITECTURE_REFERENCE.md)
6. [01_SOURCE_BASELINE_AND_MIGRATION_MAP.md](01_SOURCE_BASELINE_AND_MIGRATION_MAP.md) — revalidate on the selected SHA
7. [02_IMPLEMENTATION_SPECIFICATION.md](02_IMPLEMENTATION_SPECIFICATION.md)
8. [03_MASTER_IMPLEMENTATION_PLAN.md](03_MASTER_IMPLEMENTATION_PLAN.md)
9. The current phase file under [phases/](phases/)
10. After candidate freeze: [QUALIFICATION_PROTOCOL.md](QUALIFICATION_PROTOCOL.md)
11. After qualification PASS and owner cutover authority: [CUTOVER_AND_ROLLBACK_RUNBOOK.md](CUTOVER_AND_ROLLBACK_RUNBOOK.md)
12. After cutover: [LIVE_EVIDENCE_PROTOCOL.md](LIVE_EVIDENCE_PROTOCOL.md)

Do not skip 3–8. Do not begin Phase N+1 until Phase N’s gate report exists and PASS. Do not create source in Phases 09–11.

---

## Packet contents

| File | Purpose |
|---|---|
| [OWNER_ACCEPTANCE_RECORD.md](OWNER_ACCEPTANCE_RECORD.md) | Owner accepted v0.2.1 as target architecture |
| [OWNER_BASELINE_GATE.md](OWNER_BASELINE_GATE.md) | Owner Gate A — implementation SHA |
| [PACKET_CORRECTION_R2.md](PACKET_CORRECTION_R2.md) | What R2 changed after the NO-GO review |
| [00_ARCHITECTURE_REFERENCE.md](00_ARCHITECTURE_REFERENCE.md) | Frozen v0.2.1 architecture (laws S1–S31) |
| [01_SOURCE_BASELINE_AND_MIGRATION_MAP.md](01_SOURCE_BASELINE_AND_MIGRATION_MAP.md) | Live source mapped KEEP/REHOME/REDESIGN/RETIRE |
| [02_IMPLEMENTATION_SPECIFICATION.md](02_IMPLEMENTATION_SPECIFICATION.md) | Implementable types, Thought steps, ingress, outbox bridge, import tool |
| [03_MASTER_IMPLEMENTATION_PLAN.md](03_MASTER_IMPLEMENTATION_PLAN.md) | Phase graph, freeze location, owner gates, law coverage |
| [phases/PHASE_00_BASELINE_SIDECAR_HARNESS.md](phases/PHASE_00_BASELINE_SIDECAR_HARNESS.md) | Baseline revalidation + sidecar + causal harness |
| [phases/PHASE_01_EXECUTIVE_CONCURRENCY.md](phases/PHASE_01_EXECUTIVE_CONCURRENCY.md) | Durable ingress, fence, atomic txn, outbox primitives |
| [phases/PHASE_02_SEMANTIC_CONTRACT.md](phases/PHASE_02_SEMANTIC_CONTRACT.md) | Thought step protocol + settlement + upstream evidence |
| [phases/PHASE_03_CONVERSATIONAL_CONTINUITY.md](phases/PHASE_03_CONVERSATIONAL_CONTINUITY.md) | WC, retrieval, compose/preempt (accepted generation) |
| [phases/PHASE_04_AUTHORITY_OBSERVATION_EFFECT.md](phases/PHASE_04_AUTHORITY_OBSERVATION_EFFECT.md) | Authority + operation loop |
| [phases/PHASE_05_SPEECH_EXPRESSION_DELIVERY.md](phases/PHASE_05_SPEECH_EXPRESSION_DELIVERY.md) | finalLicensedText + starved Expression + outbox bridge |
| [phases/PHASE_06_MEMORY_IDENTITY_MATURATION.md](phases/PHASE_06_MEMORY_IDENTITY_MATURATION.md) | Admission, Identity, import tool |
| [phases/PHASE_07_INITIATIVE_PRIVATE_COGNITION.md](phases/PHASE_07_INITIATIVE_PRIVATE_COGNITION.md) | Idle-if-grounded, subscriptions |
| [phases/PHASE_08_LIVE_CAPABLE_WIRING.md](phases/PHASE_08_LIVE_CAPABLE_WIRING.md) | All remaining live-capable source, then **candidate freeze** |
| [phases/PHASE_09_QUALIFICATION_REHEARSAL.md](phases/PHASE_09_QUALIFICATION_REHEARSAL.md) | Qualification operations only — **no source** |
| [phases/PHASE_10_PRODUCTION_CUTOVER.md](phases/PHASE_10_PRODUCTION_CUTOVER.md) | Configuration-only cutover — **no source** |
| [phases/PHASE_11_LIVE_EVIDENCE.md](phases/PHASE_11_LIVE_EVIDENCE.md) | Live witness — **no source**; Luna does not declare PRODUCTION_ACCEPTED |
| [QUALIFICATION_PROTOCOL.md](QUALIFICATION_PROTOCOL.md) | Q1 exhaustive deterministic corpus; Q3 bounded inhabit witness; quota budget |
| [CUTOVER_AND_ROLLBACK_RUNBOOK.md](CUTOVER_AND_ROLLBACK_RUNBOOK.md) | Mint config cutover of QUALIFIED_SHA |
| [LIVE_EVIDENCE_PROTOCOL.md](LIVE_EVIDENCE_PROTOCOL.md) | Witness states + mandatory grounded idle revisit |
| [LUNA_MAX_EXECUTION_HANDOFF.md](LUNA_MAX_EXECUTION_HANDOFF.md) | Autonomy, repair, blockers, return format |

Historical filename `phases/PHASE_08_SIDECAR_SHADOW.md` is replaced by `PHASE_08_LIVE_CAPABLE_WIRING.md`. If both exist, the live-capable wiring file wins.

---

## Four evidence levels (never collapse)

| Level | Proves | Does not prove |
|---|---|---|
| A. Implementation correctness | Code implements v0.2.1 contracts | Ashley talks well |
| B. Causal qualification | Thought authored meaning; Expression starved; settlement published state | Live Discord competence |
| C. Bounded occupant inhabit + shadow | Compact live `thought` witness (Q3) plus real Q5 shadow traffic | Production-accepted companion; not a model horse race |
| D. Live production evidence | Natural Discord after cutover, including grounded idle revisit | Nothing by tests alone |

Evidence pyramid (do not invert): **LARGE** Q1 deterministic corpus → **MEDIUM** recorded/replayed model fixtures in Q1 → **SMALL** fresh Q3 live witness → **VALUABLE** Q5 real shadow → **MOST VALUABLE** Doc talking to Ashley live.

`npm test` green is necessary for A and parts of B. It is never sufficient for C or D. Programmed settlements may not substitute for the **bounded** Q3 inhabit witness. Fixture replay may not substitute for Q5. Do not send the Q1 corpus to the live Thought API. Wrong causal owner + right sentence is **FAIL** at B, C, and D.

Luna may return `PRODUCTION_WITNESSED / PROPOSED_FOR_ACCEPTANCE`, `WITNESS_INCOMPLETE`, or `LIVE_DEFECT_FOUND`. Only Doc declares `PRODUCTION_ACCEPTED`.

---

## Module root Luna will create

All new cognitive kernel code lives under:

```
apps/agent-service/src/core/cognitive-v021/
```

Discord ingress split lives in `apps/discord-bot/src/` (handler, agent-client, tests). Outbox projector and nuclear additive column live in kernel + `delivery/store.ts` as specified. Import tool: `scripts/cognitive-v021/import-legacy-semantic-state.mjs`.

Legacy `handleReactiveChat` remains until configuration-only cutover of the frozen SHA.

---

## Owner gates (human; do not eliminate)

| Gate | File | Luna action |
|---|---|---|
| A. Implementation baseline | OWNER_BASELINE_GATE.md | STOP until filled |
| R. Independent exact-candidate review | QUALIFICATION_PROTOCOL Q2 | STOP; Luna is not the independent reviewer |
| B. Production-host shadow | QUALIFICATION_PROTOCOL Q5 | STOP until Doc authorizes |
| C. Production cutover | CUTOVER runbook | STOP until Doc authorizes |
| D. Production acceptance | LIVE_EVIDENCE_PROTOCOL | Luna proposes; Doc decides |

---

## Candidate freeze

The last source-creating phase is **Phase 08**. After freeze: no functional source change without invalidating qualification and minting a new SHA.
