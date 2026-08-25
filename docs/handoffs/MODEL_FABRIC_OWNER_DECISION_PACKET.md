# Model Fabric — owner decision packet

**Status:** `OWNER DECISION RECORD` (2026-08-25 closed set, source-baseline correction)

**Date:** 2026-08-25

**Does not implement MF-M1.** Canonical architecture:
[`../architecture/Model_Fabric_Architecture.md`](../architecture/Model_Fabric_Architecture.md)

This file records owner + ChatGPT design decisions. It is not a second
architecture.

```text
SOURCE SNAPSHOT != PROMOTED CANDIDATE != RUNNING PRODUCTION
OWNER-SELECTED TARGET != CURRENT ROUTING != QUALIFIED != AUTHORIZED ACTIVATION
```

Historical MF-M1 `planningBaselineSha` (pre-OF repair freeze):
`8eedad8bebbed2d8cd984849a269afe256a3d08a`.

Canonical runtime integration baseline for the current MF-M1 starting line:
`e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a`.

MF documentation checkpoint:
`7a7883753a7e6e5a002bf23d226645ce85730ee5` (docs-only, based on the
historical `8eedad8` line).

Owner **scope** for MF-M1 is `CLOSED`. Runtime implementation is `PENDING`.
This packet does **not** mean MF-M1 is implemented or production-accepted.

Operational Fulfillment M1 is production-proven at exact
`e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a`. The original `8eedad8`
planning identity is historical for this current integration line.

`48bad019…` is Sandbox M-series closure evidence only. It is **not** the MF-M1
source baseline. `04beaf1…` is historical routing-audit provenance on the line
`8eedad8` inherited.

Resume: [`MODEL_FABRIC_MF_M1_IMPLEMENTATION_CHECKPOINT.md`](MODEL_FABRIC_MF_M1_IMPLEMENTATION_CHECKPOINT.md).

## Closed decisions

| # | Decision | Status |
|---|---|---|
| 1 | First implementation milestone is **MF-M1** (seam around existing production routes, zero intended behavior change). Historical F1 Thought-observation is **F1-obs**, deferred optional | CLOSED |
| 2 | Do **not** move core Thought or Expression onto OpenCode for free capacity. Dedicated directly-qualified routes | CLOSED |
| 3 | First OpenCode Track A target = elastic **utility** (summarization, extraction, classification, maintenance), then later qualified specialist seats | CLOSED |
| 4 | Specialist **portfolio**: seats persist; models are occupants. Not “find the best model.” Not one permanent utility model | CLOSED |
| 5 | Automatic **catalog discovery** into `discovered / unqualified` is allowed. Automatic **promotion** is not | CLOSED |
| 6 | Role-specific substitution only among **owner-approved** candidates. Transport failover ≠ model substitution | CLOSED |
| 7 | Owner preference among approved routes outranks pure cost. Cost must not promote an unqualified model | CLOSED |
| 8 | Track A (inference) and Track B (OpenCode Worker) remain two architectures | CLOSED |
| 9 | Service-use / unattended-agent terms are **non-blocking** for architecture. Privacy / data-classification remains | CLOSED |
| 10 | Shared Groq 20B utility + Thought failover is a **resilience** motive for later elastic utility offload. No invented token-savings % | CLOSED |
| 11 | Qualification records **before** production OpenCode routing (MF-M3 catalog/qualification, then MF-M4 utility backend) | CLOSED |
| 12 | `thought_observation` configured-as-utility / dispatched-as-thought is **preserved and exposed** in MF-M1, not repaired | CLOSED |
| 13 | OpenCode scouting occupants: Spark, Hy3, MiMo-V2.5, Ultra, Lightning for named seats — accepted portfolio identities, not production | CLOSED |
| 14 | Owner hands-on rankings are **scouting prior**, not qualification | CLOSED |
| 15 | Review independence is representable (`independence_group` on identity; policy on review seats). Not required for every task | CLOSED |
| 16 | `ModelCapabilityProfile` is mechanical. Evaluation owns `QualificationResult`; Fabric owns `ModelProfileQualificationBinding` and may cite immutable qualification references | CLOSED |
| 17 | Exact current routes enter MF-M1 through non-transferable `existing_compatibility` **including inference-policy fingerprint**. Any changed provider/model/route/role/seat/fallback/privacy class **or material reasoning** requires exact qualification plus owner approval | CLOSED |
| 18 | Receipt levels are separate: provider `ModelAttemptReceipt`, invocation `ModelInvocationReceipt`, caller-level `ModelFallbackChain`. Attempt stage and send outcome are orthogonal | CLOSED |
| 19 | Every current production inference caller receives its own logical role. `utility_bulk` is a route, not a replacement semantic role | CLOSED |
| 20 | Active catalog refresh consumes Network capability and External Effect admission. Discovery can create only `discovered / unqualified` | CLOSED |
| 21 | **Direct-provider post-MF-M1 target map** in Architecture §12.9 is OWNER CLOSED as **target policy**. It is not live routing | CLOSED |
| 22 | **Expression target** is Qwen 3.6 27B primary (reasoning on / provider `default`, not `none`) with Mistral Medium fallback. **Live MF-M1 remains Mistral primary → Qwen fallback** | CLOSED |
| 23 | **Thought target** is Groq GPT-OSS 120B with NIM GPT-OSS 120B same-model transport failover; desired reasoning `high` (`max_supported` only after interactive latency qualifies). **Live MF-M1 remains NIM 20B `low` + Groq 20B failover** | CLOSED |
| 24 | Normalized `ReasoningPolicy` (`disabled` / `economical` / `standard` / `high` / `max_supported`) is first-class route policy. Capability profiles do not decide desired reasoning | CLOSED |
| 25 | Historical MF-M1 **planning** baseline was exact SHA `8eedad8…`, not `48bad019…`. The accepted post-OF integration baseline is `e36613b…`; owner scope remains closed | CLOSED |

Do not reopen closed rows as if they were still owner questions.

## Remaining open

| # | Question | Why still open |
|---|---|---|
| A | Exact first OpenCode Track A **transport** (Zen HTTP vs isolated `serve` vs other qualified backend) | Implementation/qualification choice; not architectural identity |
| B | Exact qualification **corpus and thresholds** per pack | Evaluation Plane + later execution; this pass only designed packs |
| C | When specialist seats become **production-active** | MF-M6 gate; evidence-dependent |
| D | Catalog **refresh cadence** | Operational, not a law |
| E | Precise **independence enforcement** threshold (when dual-model review is mandatory vs optional) | Policy detail after a real dual-review path exists |
| F | Exact vendor strings / backends for §12.9 occupants | Policy data; not architecture |
| G | Ordered curiosity secondary chain (MiniMax vs Groq 120B) | Owner forbade inventing an order until qualification/policy defines one |
| H | Owner **activation** of any §12.9 target after qualification | Separate from selection |
| I | Whether a later OF forensic repair SHA supersedes `8eedad8` as MF-M1 freeze | Resolved for this integration line: `e36613b…` supersedes `8eedad8`; revalidate only if a later accepted candidate is named |

## MF-M1 contract (exact; not implemented here)

In: exact per-caller logical role; optional `SpecialistRequirement`; requested
purpose; configured route; explicit requested route; dispatched route; backend;
provider; model; inference-policy fingerprint; `existing_compatibility`; one
stage-valid receipt per provider attempt; one aggregate receipt per invocation;
explicit caller fallback-chain correlation; tests that **live** Thought
NIM 20B `low` → Groq 20B and Expression Mistral → Qwen eligibility are
unchanged; every current mismatch truthfully recorded.

Out: OpenCode; catalog auto-route; Lightning cutover; observation-route
repair; engineering specialist models; Mint routing change; new fallback;
§12.9 target models/reasoning as current behavior; Fabric DB migration.

Engineering is represented as `logicalRole = engineering` plus
`SpecialistRequirement(seat = complex_orchestration)` for the current adapter.
The requirement is descriptive in MF-M1 and does not select a specialist
model.
