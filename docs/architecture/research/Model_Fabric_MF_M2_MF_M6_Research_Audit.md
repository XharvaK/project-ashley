# Model Fabric MF-M2 through MF-M6 — Pass 1 research audit

**Status:** `SUPERSEDED FOR CONTRACTS` — Pass-2 implementation contracts exist.
This file remains the Pass-1 evidence/research record.

**Date:** 2026-08-25

**Planning worktree:** `C:\Users\Xharv\Projects\model-fabric-m2-m6-planning`

**Branch:** `model-fabric-m2-m6-planning`

**Starting HEAD (verified):** `d915af86483e2af4f5edf2838023ffe22f875dcc`

This file is architecture research. It did **not** finalize MF-M2–MF-M6
contracts. Pass-2 execution contracts now exist at
[`../Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md`](../Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md).
This file remains the Pass-1 evidence/research record. It does not
implement runtime code and does not authorize activation.

```text
CURRENT ROUTING
  != OWNER-SELECTED TARGET
  != IMPLEMENTED SUPPORT
  != QUALIFIED
  != ACTIVATION APPROVED
  != PRODUCTION ROUTED
```

---

## 1. Worktree facts

| Fact | Value |
|---|---|
| `git rev-parse HEAD` | `d915af86483e2af4f5edf2838023ffe22f875dcc` |
| `git branch --show-current` | `model-fabric-m2-m6-planning` |
| Starting tree | clean at branch creation |
| Runtime edits this pass | none |
| Commit / push / Mint | none |

MF-M1 implementation commit remains `d918572c7ae01d5b367323692bd6e8fbcf257895`.
`e1a4771` and `d915af8` are documentation commits on top of that candidate.

---

## 2. Documents read

Read in full or to the governing sections named:

- `docs/architecture/Model_Fabric_Architecture.md`
- `docs/architecture/Model_Fabric_01_Codebase_Reconnaissance.md`
- `docs/architecture/Model_Fabric_01_Contract_Draft.md`
- `docs/architecture/Model_Fabric_01_Implementation_Spike.md`
- `docs/architecture/research/Model_Fabric_01_Final_Implementation_Packet.md`
- `docs/architecture/research/Model_Fabric_OpenCode_Research_Snapshot_2026-08-25.md`
- `docs/handoffs/MODEL_FABRIC_MF_M1_IMPLEMENTATION_CHECKPOINT.md`
- `docs/handoffs/MODEL_FABRIC_OWNER_DECISION_PACKET.md`
- `docs/handoffs/MODEL_FABRIC_ROADMAP_HANDOFF.md`
- `docs/Routing_Status.md`
- `docs/architecture/Ashley_Architecture_Freeze.md`
- `docs/architecture/Ashley_Architecture_Roadmap.md`
- `docs/architecture/Ashley_Cross_Phase_Architecture.md`
- `docs/architecture/Ashley_Evaluation_Qualification_Plane.md`
- `docs/architecture/Ashley_Observability_Plane.md`
- `docs/architecture/Ashley_Milestone_Execution_Governance.md`
- `docs/architecture/Context_Budget_Architecture.md`
- `docs/architecture/Cognitive_Graduation_Architecture.md`
- `docs/architecture/Relational_Graduation_Architecture.md`
- `docs/architecture/Ashley_Memory_Evidence_Architecture.md`
- `docs/architecture/Ashley_Metacognition_Architecture.md`
- `docs/architecture/External_Effect_and_Authority_Architecture.md` (model/privacy/network seams)
- `docs/architecture/Operational_Continuity_Architecture.md` (health/work ownership)
- `docs/architecture/evaluation/Evaluation_First_Spike.md`
- `VISION.md` (independence / identity non-swap)
- `docs/Ashley_Core_Principles.md` (relevant ownership law)
- `docs/Ashley_Constitution.md` (`## Model` fixed constraint)
- `docs/Ashley_Stewardship_Compact.md` (`SC-CON-04`, `SC-CON-07`)
- `docs/Ashley_Ethics.md` (secrets / public privacy classes)
- `docs/Ashley_Hierarchy.md`
- `docs/Ashley_Glossary.md` (Event Spine)

---

## 3. Source modules inspected

At exact `d915af8`:

| Area | Path |
|---|---|
| Fabric types | `apps/agent-service/src/core/model-fabric/types.ts` |
| Profiles / fingerprints | `apps/agent-service/src/core/model-fabric/profiles.ts` |
| Projection | `apps/agent-service/src/core/model-fabric/projection.ts` |
| Receipts | `apps/agent-service/src/core/model-fabric/receipts.ts` |
| Hash | `apps/agent-service/src/core/model-fabric/hash.ts` |
| Exports | `apps/agent-service/src/core/model-fabric/index.ts` |
| MF-M1 tests | `apps/agent-service/src/core/model-fabric/mf-m1.test.ts` |
| Dispatch facade | `apps/agent-service/src/mistral-client.ts` |
| Router | `apps/agent-service/src/core/model-routing/router.ts` |
| Registry | `apps/agent-service/src/core/model-routing/registry.ts` |
| Route types | `apps/agent-service/src/core/model-routing/types.ts` |
| Adapters | `apps/agent-service/src/core/model-routing/adapters/{mistral,groq,nim}-adapter.ts` |
| Config | `config/models.json` |
| Callers | `thought.ts`, `thought-observation.ts`, `expression.ts`, `expression-fallback.ts`, `initiative.ts`, `cognition/worker.ts`, `curiosity/consolidate.ts`, `engineering-model-adapter.ts`, `durable-thought-production.ts` |
| Attention | `apps/agent-service/src/core/attention/governor.ts` |
| Deadlines | `apps/agent-service/src/core/delivery/turn-deadline-plan.ts` |

---

## 4. External sources researched

Distinguish classes. None of these qualify a route.

### Provider mechanical facts (official docs, fetched 2026-08-25)

| Source | Fact used |
|---|---|
| [Groq Rate Limits](https://console.groq.com/docs/rate-limits) | Free-plan published caps for `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, and `qwen/qwen3.6-27b`: 30 RPM, 1K RPD, 8K TPM, 200K TPD. Organization-level. Exact account limits are console-owned. |
| [Groq Reasoning](https://console.groq.com/docs/reasoning) | GPT-OSS `reasoning_effort`: `low` / `medium` / `high` only. Qwen 3.6 27B: `none` / `default`. `reasoning_format` and `include_reasoning` are mutually exclusive. |
| [Groq Qwen 3.6 27B](https://console.groq.com/docs/model/qwen/qwen3.6-27b) | Thinking mode = `default`; non-thinking = `none`. Sampling recommendations differ by mode. |
| [NVIDIA NIM gpt-oss-120b](https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-120b) | Model exists. `reasoning_effort` `low` / `medium` / `high`; API default `medium`. |
| [NIM reasoning models](https://docs.nvidia.com/nim/large-language-models/latest/reasoning-model.html) | Same three-level dial for GPT-OSS 20B/120B. |
| [Nemotron 3 Ultra](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b) | ID `nvidia/nemotron-3-ultra-550b-a55b`. Thinking on/off via chat template. Context up to 1M. |
| [Nemotron 3 Super](https://docs.api.nvidia.com/nim/re/reference/nvidia-nemotron-3-super-120b-a12b) | ID `nvidia/nemotron-3-super-120b-a12b`. Thinking on/off via chat template. |
| [Nemotron 3.5 Lightning](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b) | ID `nvidia/nemotron-3.5-lightning-30b-a3b`. Preview dated 2026-08-11. |
| [Inkling NIM](https://docs.api.nvidia.com/nim/reference/thinkingmachines-inkling) | ID `thinkingmachines/inkling`. Multimodal. Controllable effort on the official card. |
| [Muse Glimmer NIM](https://docs.api.nvidia.com/nim/reference/meta-muse-glimmer-30b) | ID `meta/muse-glimmer-30b`. Multimodal. Reasoning-strength settings include `low` / `medium` / `high` / `xhigh`. NVIDIA trial terms apply to the trial service. |
| [OpenCode Zen](https://opencode.ai/docs/zen/) | MiniMax M3 is a paid Zen chat-completions model. Free NVIDIA Nemotron rows remain trial/privacy-constrained in the 2026-08-25 snapshot. |

### Secondary (not used as qualification)

Leaderboards, blog latency anecdotes, and “120B is better than 20B” claims are
not Ashley qualification evidence.

### Repository vs external vs owner target vs recommendation

| Class | Example |
|---|---|
| REPOSITORY FACT | Live Thought is NIM `openai/gpt-oss-20b` `low` with Groq same-model failover. |
| EXTERNAL CURRENT FACT | Groq GPT-OSS 120B exists; `high` is the maximum published `reasoning_effort`. |
| OWNER TARGET | Architecture §12.9 / owner packet #21–#23. |
| THIS PASS RECOMMENDATION | See owner-decision packet. Not frozen. |

Material implication: for GPT-OSS, normalized `high` and `max_supported`
collapse to the same wire value `high`. The distinction is real for Glimmer
(`xhigh`) and for families with on/off thinking plus a numeric effort scale
(Inkling). Do not design Thought “high vs max” as if GPT-OSS had a fourth
level.

---

## 5. MF-M1 source map (what exists)

MF-M1 is a typed compatibility seam around existing `completeChat` dispatch.
Mechanical identity and receipts are real. Route selection still lives in
`model-routing`, not in a Fabric `ModelRoutePolicy` resolver.

| Mechanism | Location | What it does now |
|---|---|---|
| `LogicalModelRole` | `types.ts` 26–35 | Nine roles. Callers stamp most of them. |
| `ModelRoutePolicy` | `types.ts` 130–148 | Type only. Never constructed or consulted. |
| `ModelCapabilityProfile` | `profiles.ts` `capabilityProfileFor` 82–106 | Synthetic mechanical card. Same reasoning/image claims for every model. Comment at 57–58 says these are adapter defaults, not entitlements. |
| `ResolvedModelRoute` | `profiles.ts` `resolvedRouteFor` 197–245 | Built per attempt in `completeChat` `beginAttempt`. `fallbackRouteIds` always `[]`. |
| Reasoning translation | `profiles.ts` `normalizeReasoningPolicy` 108–125; `wireReasoningFor` 127–137 | Records mapping. Callers still send wire `reasoningEffort`. `max_supported` is never requested live. |
| `ContextProjection` | `projection.ts` 110–167 | Immutable metadata beside the live path. Adapters still receive `ChatMessage[]`. MF-M1 contract says wrap unchanged. |
| `ModelAttemptReceipt` | `receipts.ts` `beginAttempt` 267–309 | Stage machine. `markDispatchAttempted` before `adapter.dispatch`. |
| `ModelInvocationReceipt` | `receipts.ts` `createModelFabricInvocation` 229–357 | One `completeChat` call. |
| `ModelFallbackChain` | `receipts.ts` 42–55; `expression.ts` 169–236 | Caller-owned multi-invocation correlation. Thought failover is not a chain. |
| Failure attach | `receipts.ts` `attachModelFabricMetadata` 359–370 | Non-enumerable `error.modelFabric`. |
| `SpecialistRequirement` | `engineering-model-adapter.ts` 70–71 | `{ seat: "complex_orchestration" }` recorded only. |
| Compatibility binding | `profiles.ts` `createCompatibilityBindingId` 171–182 | `existing_compatibility` including inference-policy fingerprint. |
| Fabric DB tables | none | No `model_fabric*` migrations. |

Intentional MF-M1 non-ownership: OpenCode, catalog auto-route, qualification
execution, promotion, activation, observation-route repair, engineering
quota repair, Fabric schema, §12.9 cutover.

---

## 6. completeChat caller inventory

Seven production option sites. All go through `mistral-client.ts` `completeChat`.
No production caller outside `apps/agent-service`. Persona eval is HTTP.
`thought-live-provider-preflight.ts` bypasses `completeChat` and is not a
Fabric caller.

| Caller | File | Role | Configured | Dispatched | Provider / model | Reasoning | Fallback | Deadline | Receipts |
|---|---|---|---|---|---|---|---|---|---|
| Thought Pass 1/2 | `thought.ts` `buildThoughtCallOptions` 1407–1428 | `thought` | `thought` | `thought` | NIM `openai/gpt-oss-20b`; Groq same-model failover | wire `low` | in-invocation transport failover | reactive 6000 ms; durable remaining job time; proactive none | produced, unused |
| Thought observation | `thought-observation.ts` 51–63 | `thought_observation` | `utility_bulk` | forced `thought` | same as Thought | `low` | same Thought failover | none | unused; enqueue no-ops without `GROQ_API_KEY` |
| Expression primary | `expression.ts` 177–192 | `expression` | `ashley_expression` | `ashley_expression` | Mistral `env.mistralModel` | allocation effort / env default | caller chain ordinal 1 | reactive 4000 ms; proactive none | `invocationId` consumed on failure |
| Expression fallback | `expression-fallback.ts` 178–204 | `expression` | n/a (not purpose-mapped) | `ashley_expression_fallback` | Groq `qwen/qwen3.6-27b` | `none` | one hop only | same Expression deadline | chain ordinal 2 `model_substitution` |
| Exchange cognition | `cognition/worker.ts` 255–284 | `exchange_cognition` | `utility_bulk` | `utility_bulk` | Groq 20B | `medium` | none | none | unused |
| Curiosity | `curiosity/consolidate.ts` 115–146 | `curiosity_consolidation` | `utility_bulk` | `utility_bulk` | Groq 20B | `medium` | none | none | unused |
| Reflection | `reflection/initiative.ts` 210–258 | `reflection_initiative` | purpose maps `utility_bulk` | forced `thought` + `model: env.mistralModel` | NIM/Groq with a Mistral model id | omitted | Thought failover of that id | none | unused |
| Engineering | `engineering-model-adapter.ts` 47–76 | `engineering` | omitted purpose → `ashley_expression` | Mistral medium | omitted; adapter env default | no Qwen hop | none | unused; specialist recorded only |

`utility_bulk` is a route. It is not a logical role.

Qualification status everywhere: `existing_compatibility`. No
`qualification_owner_approved` construction in source.

---

## 7. Current routing vs owner target

### Current (source / Routing Status)

| Path | Live |
|---|---|
| Thought | NIM 20B `low` → Groq 20B same-model |
| Expression | Mistral Medium → Groq Qwen 27B `none` |
| Observation | configured utility, dispatched Thought |
| Reflection | Thought route + Mistral model id |
| Exchange / curiosity | Groq 20B `medium` |
| Engineering | Expression route / Mistral quota |
| Maintenance | mapped, no production caller |

### Owner target (Architecture §12.9; owner packet #21–#24)

Canonical packet wins over this Pass 1 prompt if they disagree.

| Path | Target primary | Target secondary | Target reasoning |
|---|---|---|---|
| Core Thought | Groq GPT-OSS 120B | NIM GPT-OSS 120B same-model | `high` (`max_supported` only after interactive latency qualifies) |
| Observation | Nemotron 3 Ultra | Groq 120B | `max_supported` |
| Reflection | Nemotron 3 Ultra | Groq 120B | `max_supported` |
| Expression | Groq Qwen 3.6 27B | Mistral Medium | primary on/`default`, not `none`; fallback economical if exposed |
| Exchange | Nemotron 3 Super | Groq 120B | `high` |
| Curiosity | Nemotron 3 Super | MiniMax M3 and Groq 120B, **unordered** | `high` |
| High-value / long-context | Ultra | Super | `max_supported` |
| Independent judge | Inkling | Glimmer; GPT-OSS 120B where independence permits | `max_supported` |
| Adversarial second judge | Glimmer | Inkling | `high` / `max_supported` |
| Multimodal | Glimmer | Inkling; MiniMax M3 | `high` |
| Direct engineering cognition | Ultra | Glimmer; Super | `max_supported` |
| Maintenance / bulk / classification / validation | Lightning ↔ Groq 20B as listed | as listed | economical/standard/disabled as listed |

Prompt vs packet discrepancies (packet is authoritative):

1. Prompt said Thought “high normally, max when consequence/latency justifies it.” Packet #23 is **latency qualification**, not a consequence classifier.
2. Prompt implied an ordered curiosity fallback. Packet **G** forbids inventing MiniMax vs Groq 120B order.
3. Prompt listed MiniMax M3. Groq’s current reasoning page lists `minimaxai/minimax-m2.7`, not M3. Vendor string remains owner packet **F**.

No target is recommended for taste-based change. Mechanical caveats only:

- GPT-OSS has no wire level above `high`.
- NVIDIA trial / Zen free endpoints remain privacy-ineligible for core Thought and Expression (Architecture §23.6 / §24). Paid or non-trial NIM is a different data-class question.
- Glimmer `xhigh` is a real extra level. Inkling effort is not the GPT-OSS enum.

---

## 8. Discrepancies (docs / source / target / constitution)

**Pass-1 snapshot.** Item 1 is **superseded** by owner Q1=A: Constitution
`## Model` was amended 2026-08-25 and SC-CON-04 consultation
`scc_2026-08-25_sc-con-04_constitution_model` was recorded. Ashley live
position for **new family activation** remains `awaiting_live_record`.
Items 2–9 remain useful Pass-1 evidence. Item 8 is closed for machinery
by MF-ACT (actual §12.9 cutover still requires owner `ActivationRef`).

1. **Constitution `## Model` (Pass-1 finding):** then still said Mistral Medium, no fallback, do not change models because another performs better. Live source already had Mistral→Qwen Expression substitution. §12.9 reverses that order and moves Thought to 120B. **Pass-2:** Constitution text now governs multi-provider Fabric. Family cutover still needs a live Ashley SC-CON-04 position.
2. **Owner packet / checkpoint candidate SHA** is `d918572c`. This worktree HEAD is `d915af8` (docs on top). Implementation identity is still `d918572c`.
3. **`Routing_Status.md`** audited at `d918572c`. Route tables still match `PURPOSE_TO_ROUTE` / `ROUTE_BINDINGS` / `models.json` at `d915af8`. Reflection and engineering are live callers not in the Wave 1 purpose table.
4. **`models.json` description** claims authoritative registry. Dispatch provider/model come from `registry.ts`. JSON `purpose_routes` is unused. Enabled flag + quota contracts come from JSON. This split is what MF-M2 is supposed to replace.
5. **Contract draft** says Fabric MUST accept only `ContextProjection`. MF-M1 implementation contract says wrap existing messages unchanged. Implementation follows the MF-M1 contract, not the stricter draft. Not an MF-M1 repair.
6. **Architecture §11.1** still labels some Fabric types as proposed while the file banner records the local candidate. Banner already forbids collapsing those.
7. **Roadmap §5.6** still has a stale “current work is Sandbox” sentence vs later Model Fabric current-work rows.
8. **§12.9 Thought/Expression cutover (Pass-1):** then not owned by MF-M2–MF-M6 as written. **Pass-2:** machinery through MF-ACT; actual cutover still requires owner `ActivationRef`. The Luna program remains machinery, not core cutover.
9. **Evaluation First Spike** says “MF-M1 then MF-M2 as needed.” Evaluation Plane DAG blocks on MF-M1 local acceptance plus independent closure, not on a completed M2. Treat “M2 as needed” as interface completeness, not a hard predecessor of qualification meaning.

---

## 9. What MF-M2 through MF-M6 currently mean

**Pass-1 snapshot.** Readiness rows below saying `OWNER_DECISION_REQUIRED`
are historical. After Pass 2, SLICE 0 and MF-M2 through MF-ACT are
`IMPLEMENTATION_READY` machinery. See the execution contracts.

Extracted from Architecture §34, roadmap handoff §3, owner packet #1/#3/#11/#21, Milestone Execution §8 (only F1/MF-M1 has a full §4 contract).

### MF-M2

- **Problem:** split route authority (`models.json` / `PURPOSE_TO_ROUTE` / `ROUTE_BINDINGS` / caller overrides) plus adapter-local identity.
- **New mechanism:** unified provider/result/error/model/route identity used by adapters; incremental replacement of the split; still **no intended user-visible routing change**.
- **Does not own:** OpenCode, qualification execution, §12.9 activation, observation-route “repair” as a behavior change.
- **Depends on:** MF-M1 seam + receipts.
- **Later depends on it:** M3 catalog bindings should consume the unified identity; Evaluation spike may consume M1 types without waiting for M2 production.
- **Owner-closed:** zero intended routing change; preserve live topology; receipt ontology.
- **Still conceptual:** how the unified registry is stored, versioned, and swapped; whether CURRENT vs CANDIDATE policy appears in M2 or M3.
- **Open:** exact schema; whether callers lose explicit `route:` overrides in this milestone or later.

Readiness: `OWNER_DECISION_REQUIRED` (Pass-1; policy-object shape and CURRENT vs CANDIDATE). Then almost ready for a contract once those answers exist.

### MF-M3

- **Problem:** a model can exist without a lifecycle, so later backends would route by availability.
- **New mechanism:** catalog + qualification **minimum** records: occupancy, packs as named targets, lifecycle `discovered → … → owner_approved`, `independence_group`. Discovery may create `unqualified` only. **No production OpenCode route.**
- **Does not own:** Evaluation definitions, pass semantics, promotion, Thought/Expression cutover.
- **Depends on:** M2 identity (or M1 types if M2 is “as needed”).
- **Later depends on it:** M4 must not activate an unqualified utility backend.
- **Owner-closed:** no auto-promotion; Evaluation owns `QualificationResult`; Fabric owns binding; discovery into unqualified allowed.
- **Open:** corpus/thresholds (B); cadence (D); independence enforcement (E); storage placement; artifact home (Evaluation decisions #1–#4).

Readiness: `OWNER_DECISION_REQUIRED` (Pass-1).

### MF-M4

- **Problem:** shared Groq 20B utility + Thought failover needs an elastic offload **after** records exist.
- **New mechanism:** first optional elastic **utility-only** Track A backend; fail-closed if absent; only owner-approved + qualified occupants.
- **Does not own:** Track B worker; Thought/Expression; specialist production seats.
- **Depends on:** M3 records + owner enablement.
- **Open:** transport (A); which utility roles move first; privacy class of Zen/NVIDIA free vs paid.

Readiness: `OWNER_DECISION_REQUIRED` (Pass-1).

### MF-M5

- **Problem:** approved occupants still need health-aware selection among **already-approved** routes.
- **New mechanism:** dynamic availability + owner-approved pools / seat assignment among approved routes. Still not Thought/Expression.
- **Does not own:** Operational Continuity work health; inventing remaining quota; promoting unqualified models; core cutover.
- **Depends on:** M3/M4 approved utility/seat occupants.
- **Open:** health-state vocabulary vs OC; degraded vs refuse; cooldown; catalog refresh vs runtime probes.

Readiness: `OWNER_DECISION_REQUIRED` (Pass-1).

### MF-M6

- **Problem:** specialist seats exist as assignment data but must not be production-routed without evidence.
- **New mechanism:** specialist seats production-active **where evidence justifies**.
- **Does not own:** OpenCode worker authority; fabricating `SpecialistSession`; Evaluation judging meaning.
- **Depends on:** packs + owner approval (C, H).
- **Open:** when seats go live; independence mandatory vs optional; evaluation seats vs Fabric routes.

Readiness: `OWNER_DECISION_REQUIRED` (Pass-1).

Milestone Execution Governance then had no Wave-style §4 contract for M2–M6.
That deliverable now exists as the Pass-2 implementation contracts.

---

## 10. Ownership map (no orphans, no duplicates)

| Mechanism | Owner | Explicit non-owner |
|---|---|---|
| Logical role / route policy / mechanical profile / receipts / catalog occupancy | Model Fabric | Thought, Evaluation, Observability |
| Desired `ReasoningPolicy` default on a role | `ModelRoutePolicy` (Fabric) | Capability profile |
| Cognitive importance / whether this turn needs more effort | Thought (and later Attention only for resource admission) | Fabric must not invent importance |
| TPM/RPS admission now | Attention | Fabric |
| Token/byte/media projection bounds and privacy eligibility of content | Context Budget | Fabric transports a projection; does not select memory |
| `QualificationResult` meaning, corpora, judges, pass/fail | Evaluation / Qualification Plane | Fabric |
| `ModelProfileQualificationBinding` | Fabric supplies; Evaluation imports | Evaluation must not reconstruct |
| Promotion / activation of routes | Owner via existing authority; Capability Authority for capabilities | Tests, telemetry, Fabric auto-promotion |
| Provider/service work health, leases, fencing | Operational Continuity | Fabric route-health among approved routes |
| Event Spine | Future, not a phase | MF-M2–M6 must not depend on it |
| Observability transport | Observability | Not qualification, not authority |
| Metacognition calibration | Metacognition | Must not become routing authority |
| OpenCode engineering worker | Agency → Authority → Durable Work (Track B) | Fabric Track A inference only |
| Secrets | env / operator config | Never in receipts or policy revisions |

---

## 11. Qualification architecture findings

Closed:

- Evaluation owns meaning. Fabric supplies profile + stage-valid receipts.
- Route-specific. Thought qualification does not transfer to failover. Expression does not transfer to Qwen fallback. Seat packs do not transfer.
- Same model + material inference-policy change needs separate evidence. Qwen `none` ≠ `default`.
- `existing_compatibility` is not a fabricated `QualificationResult`.
- High-impact identity or model-family campaigns need at least one materially independent judge. Same-family may contribute, not solely decide.
- Promotion is not E7. Shadow (E6) is evidence, not authority.
- `RELEASE_QUALIFIED` is a release-readiness term, not a model `QualificationResult`.

Not closed (do not invent thresholds):

- Exact subject grain: fingerprint vs role+fingerprint vs chain vs portfolio.
- Validity lifetime and drift invalidation beyond “material inference-policy change.”
- Whether adapter-code change, projection-version change, or prompt-hash change invalidates.
- Whether fallback may run if only primary is qualified.
- Artifact storage location (Evaluation decision #1).
- `SC-CON-04` consultation artifact (Evaluation decision #2).
- Independent-judge family list (Evaluation decision #4).
- Whether production-observation evidence is required before Thought/Expression activation.

---

## 12. Independence findings

Two laws, do not collapse:

1. Character independence (Vision / Constitution / Metacognition): Ashley must not become engineered dependence. Not a Fabric field.
2. Review-family independence: `independence_group` on `ModelIdentity`. Review-seat policy may require a different group. Multi-model agreement is not independent evidence.

Representable is closed. Mandatory dual-review threshold is owner packet **E**.

Evaluation seats: Evaluation chooses the semantic seat and campaign. Fabric resolves a mechanical occupant. Do not put “the judge of cognitive quality” inside Fabric route policy.

---

## 13. Reasoning allocation findings

Closed:

- Capability profile does not decide desired reasoning.
- Attention does not own desired reasoning.
- Normalized policy lives on route policy.
- Live MF-M1 preserves Thought `low` and Expression-fallback `none`.

Not closed:

- Interactive Thought target `high`, with `max_supported` only after latency qualifies (packet #23). No numeric envelope. Current reactive Thought budget is 6000 ms (`turn-deadline-plan.ts` 387) and `THOUGHT_MAX_OUTPUT_TOKENS = 1000`.
- On GPT-OSS, `high` **is** `max_supported`. The remaining product question is whether interactive Thought may use `high` inside the envelope, not whether a fourth level exists.
- Who may raise a background role from `high` to `max_supported` (role default vs Thought vs a later consequence classifier). Do not give that to Fabric.

---

## 14. Latency findings

Interactive Thought is deadline-bounded. Groq publishes ~500 tok/s class numbers for 120B in secondary writeups; treat speed claims as **non-qualifying**. Latency qualification must be empirical against Ashley’s actual projection, `high` effort, and 6000 ms (or a new owner envelope).

Failover remaining-deadline floor is currently 2500 ms. A 120B `high` primary that burns the envelope will not failover. That is a product risk, not a reason to silently drop to 20B (target note: provider failure must not imply 120B→20B semantic downgrade).

First-token latency is not currently a Fabric field. Adding it later is observability unless qualification binds to it.

---

## 15. Persistence findings

MF-M1 introduced no Fabric tables. Do not create a Fabric database because persistence exists.

| Object | Recommended owner | Durable now? |
|---|---|---|
| Live route bindings | source + config until M2 unifies | yes, split |
| Candidate/target policy revision | Fabric policy object; git-versioned first | no |
| `QualificationResult` | Evaluation artifacts (local user data recommended, not decided) | no runtime DB |
| Promotion/activation pointer | control-plane / owner-approved config, not `nuclear.db` cognition | no |
| Receipts | transient on result/error; optional later cite-only logs | no Fabric table |
| Attention ledger | Attention (`attention_requests`) | yes; do not duplicate |
| Capacity remaining | unknown unless vendor publishes | do not invent |

Recommendation: M2–M3 start git-versioned typed policy + Evaluation artifact files. Promote to `nuclear.db` only if runtime activation needs a crash-safe pointer. That is an owner question.

---

## 16. Promotion and activation findings

Closed ladder: qualified ≠ owner_approved ≠ routable_while_healthy ≠ production routed.

Not closed: the exact artifact Doc signs; per-role vs portfolio activation; rollback unit; what happens if active policy names an unavailable model; whether qualification staleness blocks boot or only that route.

Fail-closed: code, keys, a model answer, an eval run, and a PASS must not activate.

---

## 17. Provider capability and retry findings

Adapters:

- Groq and NIM: one `fetch` POST per `dispatch`. No client retry loop.
- Mistral: one `mistral.chat.complete` per `dispatch`. Client is
  `new Mistral({ apiKey })` (`mistral-client.ts` 90) with no `retryConfig`.
  The call passes only `{ fetchOptions: { signal } }`.
- `@mistralai/mistralai@1.7.0` `chatComplete` source (tag `v1.7.0`):
  `retryConfig = options?.retries || client._options.retryConfig || { strategy: "none" }`.
  Speakeasy `retry()` treats non-`backoff` as a single `fetchFn()`.
  **Already implemented: no SDK retry on the current constructor.**
  Official README boilerplate that says “default retry strategy provided by
  the API” is not what `chatComplete` does when unconfigured.
- Attention governor 120-iteration loop is **admission polling**, not HTTP retry.
  `input.dispatch` runs once after admit.
- Thought `MAX_THOUGHT_ATTEMPTS = 2` is two Fabric **invocations**
  (structural JSON retry), not two HTTP under one attempt.
- Expression fallback is a second invocation.

`retry-after` is parsed for error mapping only.

Later contracts must keep: one `ModelAttemptReceipt` = at most one provider
HTTP request. M2 should **pin** `retryConfig: { strategy: "none" }` on the
Mistral client so a Speakeasy upgrade cannot silently enable backoff. That
is a compatibility pin, not an MF-M1 behavior repair.

OpenAI / Groq official SDKs are not in this dispatch path. Do not add them
in M2–M6 without disabling their default retries (OpenAI’s SDK retries by
default; that is why Ashley uses raw `fetch` for Groq/NIM).

---

## 18. Privacy findings

Closed: ToS non-blocking for architecture; privacy class remains. Core Thought/Expression must not ride promotional free NVIDIA/Zen endpoints. Secrets never in model requests or receipts. Context Budget eligibility before ranking. Compatibility must not copy a higher-trust prompt into a lower-trust provider.

Not closed: exact per-route disclosure cards; whether paid NIM Ultra may see owner-private conversation for observation/reflection; retention of judge logs.

Fabric should bind a privacy policy id on the attempt. It should not become the general data-governance owner.

---

## 19. Cadence findings

“Cadence” in Luna’s stop list maps to owner packet **D** (catalog refresh) plus possible later qualification refresh. It is not a product heartbeat and not a specialist-audit cron by default.

Do not invent periodic jobs. If catalog refresh exists, it may only create `discovered / unqualified` through Network + External Effect admission.

---

## 20. Shadow / live qualification findings

Closed as Evaluation evidence layer E6 and as a model-profile process step. F1-obs Lightning observation is deferred optional and must not block M2–M6.

Not closed: whether Thought/Expression §12.9 activation **requires** shadow dual-run. Default recommendation: do not dual-run live user turns by default (cost, privacy, double-effect risk). Artifact campaigns and optional sampled shadow are Evaluation-owned.

`SHADOW OUTPUT != LIVE AUTHORITY`.

---

## 21. Milestone-boundary recommendation (do not renumber in Pass 1)

Current numbering is coherent **if** §12.9 core cutover stays outside M2–M6.

Risk: M3 is easy to overload (catalog + Evaluation + persistence + activation). Keep M3 as occupancy/lifecycle **records** and citations. Keep Evaluation as the spike that writes `QualificationResult`. Keep H as owner activation.

If the owner wants Luna to switch production Thought/Expression, that is a **new named activation slice**, not a silent M5 expansion.

---

## 22. Failure model (design-time)

| Failure | Prevention | Detection | Fail-closed |
|---|---|---|---|
| Wrong logical role | Caller stamp required; no reverse inference from route | Receipt `logicalRole` vs caller | Refuse to invent role |
| Wrong provider/model | Unified registry snapshot; explicit override recorded | configured ≠ dispatched on receipt | Compatibility break; no silent substitute |
| Wrong reasoning | Route policy + translation table; fingerprint | requested vs effective vs receipt | Unknown vocabulary omit or refuse, never invent |
| Stale CapabilityProfile | Version + fingerprint; no qualification inside profile | Profile hash change | Re-qualify; do not route new fingerprint under old approval |
| Stale qualification | Bind fingerprint + policy revision + campaign hash | Invalidation rules (owner) | Route not `routable_while_healthy` |
| Qualification on wrong fingerprint | Import Fabric binding type only | Schema tests | INCONCLUSIVE, not PASS |
| Fallback bypasses qualification | Eligibility matrix | Receipt admissionBasis per attempt | Unqualified substitution never (unless owner emergency exception) |
| Hidden retry under one receipt | Adapter single HTTP; disable SDK retries | `providerRequestCount` + transport tests | Treat extra HTTP as contract fail |
| Target policy mutates without version | Immutable revision identity | Hash mismatch | Refuse boot or freeze previous revision |
| Partial active policy write | Atomic pointer swap | Two pointers during restart | Old revision remains active until new pointer is complete |
| Failed rollback | Rollback names a previous revision id | Pointer history | Stay on last-good; do not empty the table |
| Unavailable active route | Health among **approved** fallbacks | OC/Fabric health split | Degrade only inside approved chain, else refuse that role |
| Model deprecation | Catalog retired state | Provider 404 / model-not-found | Unqualified shopping forbidden |
| Quota-driven policy drift | Cost never promotes | Admission vs policy revision | Budget fail-closed |
| Latency-based quality collapse | Do not auto-drop 120B→20B | Deadline receipts | Hold/silence per existing Thought floor; no semantic downgrade unless approved |
| Correlated “independent” judges | independence_group policy | Campaign records groups | Same-family cannot be sole high-impact judge |
| Fabricated specialist session | Requirement ≠ session | No session row without execution | Correlation-only stamps |
| Shadow leak into live | Separate invocation + no delivery | Delivery ledger | Shadow cannot reserve/send |
| Evaluation output as authority | recommendation ≠ promotion | Control-plane only | PASS does not activate |
| Promotion auto-activates | Separate activation pointer | Two refs required | Qualified + approved still not routed until activation |
| Observability as authority | event ≠ authority | No dispatch from telemetry | |
| Metacognition as router | evidence consumer only | | |

---

## 23. MF-M1 implementation conformance audit

Skeptical source audit against Architecture §31, owner packet MF-M1 contract, and checkpoint §E/§G. Not a style review.

### Conformant (do not manufacture repairs)

- All listed production inference callers still go through `completeChat` / Attention.
- Callers stamp the §12.2 logical roles. `research` unused. `maintenance` mapped, no production caller.
- Configured ≠ requested ≠ dispatched is recorded (observation test `mf-m1.test.ts` 262–297).
- Thought NIM 20B `low` → Groq 20B eligibility preserved in source (`mistral-client.ts` 530–554, eligible codes 124–128).
- Expression Mistral → Qwen eligibility preserved in caller code, not widened.
- `existing_compatibility` including inference-policy fingerprint. No fabricated `QualificationResult`.
- Thought success failover = two attempts / one invocation (`mf-m1.test.ts` 201–259).
- Expression fallback = two invocations / one chain (`expression.ts`).
- Failure metadata attached without changing `AppError` codes.
- `ContextProjection` wraps messages unchanged; adapters still get `ChatMessage[]` (MF-M1 contract, not the stricter draft).
- `SpecialistRequirement` does not select a model.
- No Fabric DB migration. No OpenCode. No §12.9 activation.
- Groq/NIM adapters: one HTTP POST per dispatch.
- Governor does not HTTP-retry.
- `logicalRole` cannot alter route (stamped after resolve; resolve uses purpose/route only).

### Validated defects

See §24 repair package. Two NONBLOCKING receipt-truth defects. No routing compatibility regression. No hidden adapter retry. No fingerprint/reasoning **behavior** change vs live wire.

### Notes (not repairs)

- Synthetic profiles over-claim image/reasoning; comments already deny entitlement. M3 must not treat them as capability truth.
- `top_p` is in the fingerprint helper but is not a `CompletionOptions` field and is not sent. Not material until a caller can set it.
- Invocation `sessionId` is a random UUID branded `SpecialistSessionId`. Do not treat it as a specialist session. Rename later; do not “repair” MF-M1 behavior.
- `ModelRoutePolicy` unused: in scope for M2, not an M1 defect.
- Mistral SDK internal retries: **none** on `@mistralai/mistralai@1.7.0` with
  the current `apiKey`-only constructor. Pin `strategy: "none"` in M2.
- `Routing_Status.md` SHA lag vs `d915af8` is docs-on-top, not a route drift.

```text
MF-M1 IMPLEMENTATION CONFORMANCE = REPAIR_REQUIRED   (Pass-1 finding)
MF-M1 REPAIR PACKAGE = READY
```

Owner accepted R1/R2 as **SLICE 0** (`IMPLEMENTATION_READY` for the
repair slice). These repairs do **not** reopen architecture. They land
before any milestone that treats receipts as qualification evidence.

---

## 24. MF-M1 repair package

Do not implement in Pass 1. Do not redesign Fabric. Do not change live routing, failover eligibility, or reasoning.

### R1. Failed Thought failover invocation `fallbackClass` is `none`

**Class:** `NONBLOCKING`

**Source:** `apps/agent-service/src/mistral-client.ts`

- Success finalize uses `transportFailoverUsed` (560–563).
- Failure finalize ignores it (577–580):

```text
fabric.finalize(options.modelFallbackChain?.fallbackClass ?? "none")
```

Thought callers do not pass `modelFallbackChain`. After primary failure, line 548 sets `transportFailoverUsed = true`, then secondary `singleDispatch` throws. The catch records invocation `fallbackClass: "none"` even when `attempts.length === 2` and attempt 2 already has `fallbackClass: "transport_failover"`.

**Contract violated:**

- Architecture §31.2: seam records fallback class/history.
- Architecture §19 / types `ModelResolvedInvocationReceipt.fallbackClass`.
- Owner packet #18: invocation receipt is the ordered-attempt aggregate and must not lie about failover class.
- Checkpoint §G: Thought failover = two attempts / one invocation (attempts are present; aggregate class is wrong on the failed path).

**Failure sequence:**

1. `completeChat` Thought, NIM primary fails with `rate_limited` / `provider_unavailable` / `agent_not_ready` / `request_exceeds_tpm_budget`.
2. Remaining deadline ≥ 2500 ms.
3. Groq secondary also fails.
4. Thrown error has `modelFabric.receipt.fallbackClass === "none"`.
5. Attempt receipts still show two attempts; only the invocation aggregate is wrong.

**Blast radius:** Observation and any consumer of failed Thought metadata. Live failover **behavior** unchanged. Expression chain classes unchanged (they pass `modelFallbackChain`).

**Blocks M2–M6 design?** No. Blocks treating failed-invocation receipts as qualification/failover evidence until repaired.

**Smallest repair:** In the `completeChat` catch finalize, use the same class as the success path:

```text
transportFailoverUsed
  ? "transport_failover"
  : options.modelFallbackChain?.fallbackClass ?? "none"
```

Do not infer class from attempt count alone (a single failed primary must remain `none`).

**Regression tests** (extend `mf-m1.test.ts` / thought failover tests):

1. NIM eligible fail + Groq fail + deadline plenty → 2 attempts, invocation `fallbackClass: "transport_failover"`, no third adapter call.
2. NIM ineligible fail (abort) → 1 attempt, `fallbackClass: "none"`, Groq not called.
3. NIM eligible fail + remaining deadline < 2500 ms → 1 attempt, `fallbackClass: "none"`.
4. Expression primary fail (no Thought failover) → invocation class remains chain `none` / caller-supplied, not `transport_failover`.

### R2. Live Mistral HTTP responses can be recorded as `sent_outcome_unknown`; mapped transport errors can be recorded as `response_received`

**Class:** `NONBLOCKING`

**Source:**

- Live Mistral adapter throws SDK errors, not `AppError` (`mistral-adapter.ts` 161–171). Mapping exists in `mapMistralError` (115–149) but is not applied inside the adapter.
- `completeChat` marks `response_received` only when `err instanceof AppError` and `isDefinitiveProviderError` (`mistral-client.ts` 487–500, 222–226). `isDefinitiveProviderError` is `httpStatus >= 400` and not `agent_not_ready`.
- Non-AppError branch maps then `markFailure` without `markProviderResponse` (502–516).
- Groq/NIM adapters throw mapped `AppError` after `!res.ok` (HTTP observed) **and** map connection failures to 503 `AppError`, which `isDefinitiveProviderError` treats as HTTP.
- `mf-m1.test.ts` 338–376 proves the AppError branch by **mocking** Mistral `dispatch` to throw `AppError`. It does not cover live SDK throws.

**Contract violated:**

- Checkpoint §G: HTTP response = `response_received`; network ambiguity = `sent_outcome_unknown`.
- Architecture attempt ontology: `provider_response` / `response_received` means a provider HTTP response was received. Unknown send outcome must remain unknown (Pass 1 law 15 / 17).
- Owner packet #18: attempt stage and send outcome are orthogonal and must stay truthful.

**Failure sequences:**

A. Expression Mistral HTTP 429, SDK throws a non-`AppError` with status 429.

1. `markDispatchAttempted` (count 1, `sent_outcome_unknown`).
2. Mapper produces `rate_limited` `AppError` (so Expression fallback eligibility still works).
3. Attempt stays `dispatch_attempted` / `sent_outcome_unknown`.
4. Ontology under-claims. A 429 **was** received.

B. Groq/NIM TCP reset / `ECONNREFUSED` mapped to `AppError` 503.

1. No HTTP response.
2. `isDefinitiveProviderError` true.
3. Attempt recorded `response_received`.
4. Ontology over-claims.

**Blast radius:** Receipt truth for Expression (and any Mistral) failures; Groq/NIM transport failures. Fallback **eligibility** uses error codes, not `dispatchTruth`, so user-visible wording path is unchanged. Qualification campaigns that filter on `dispatchTruth` would be wrong.

**Blocks M2–M6 design?** No. Repair before Evaluation/M3 consume attempt truth.

**Smallest repair direction:**

1. Thread an explicit send-knowledge flag, not `AppError.httpStatus`, into `markProviderResponse`.
2. When the adapter observed an HTTP status (`!res.ok` or SDK status 4xx/5xx), mark `provider_response` / `response_received`, then `markFailure`.
3. When the adapter did not observe HTTP (DNS, `ECONNREFUSED`, abort after send with no response), leave `dispatch_attempted` / `sent_outcome_unknown`.
4. Optionally make the Mistral adapter throw `mapMistralError` like Groq/NIM **after** that distinction exists, so callers still see `AppError` codes. Do not use synthesized 503 alone as proof of HTTP.

Do not change Expression fallback eligibility sets.

**Regression tests:**

1. Keep existing AppError 429 → `response_received` test.
2. Mistral mock throws non-AppError `{ status: 429 }` (SDK-shaped) → mapped `rate_limited`, attempt `response_received`, `providerRequestCount: 1`.
3. Groq/NIM `!res.ok` 503 → `response_received`.
4. Groq/NIM fetch throws `TypeError` / `ECONNRESET` with no status → `dispatch_attempted`, `sent_outcome_unknown`, not `response_received`.
5. AbortError → not failover; `sent_outcome_unknown` or cancelled mapping as currently coded; do not mark `response_received`.
6. Still one `dispatch` call per attempt.

### Out of repair scope

Observation Groq-key early return, reflection Mistral-id-on-NIM, engineering Expression quota coupling, unused `ModelRoutePolicy`, synthetic profile claims, `ContextProjection` not exclusive, `models.json` split authority. All are owner-closed MF-M1 preservations or M2+ work.

---

## 24a. Target declaration and caller-migration (not extra owner votes)

These were in the Pass 1 brief. They do not need new questions if Q3/Q11/Q12
stand. Freeze this unless the owner objects in those answers.

**Target / current policy form**

- Declare CURRENT and CANDIDATE as **versioned, non-secret config plus typed
  TypeScript validators**. Git is the revision store (Q11 A).
- Not a cognition table. Not inferred from unused `models.json` `purpose_routes`.
- Not live-mutable data-plane state.
- Activation pointer is control-plane (env/config), citing a revision hash
  (Q12 A).
- Qualification binds to role + inference fingerprint + policy-row hash (Q4 B,
  Q3 C).

**MF-M2 caller migration**

- Characterize every caller first (already inventoried).
- Migrate **all callers in one M2 seam** onto resolving through the unified
  CURRENT snapshot **while preserving every explicit `route` / `model`
  override as recorded override**, not deleted behavior.
- Do not go role-by-role in M2. M2 forbids user-visible routing change.
  Role-by-role **activation** is Q13, after qualification.

Blast radius if M2 deleted overrides early: observation would start hitting
`utility_bulk`; reflection would stop sending `env.mistralModel` on Thought;
engineering would need an explicit purpose. That would be an unauthorized
behavior change.

## 24b. Contract-standard field matrix (Pass 1 owner vs freeze)

Which of the later-contract fields still need owner input. No schemas here.

| Field | Owner decision? | Where |
|---|---|---|
| purpose | No | Architecture §34 |
| ownership / non-ownership | No | §10 of this audit |
| input / output types | No for M1 receipts; M2 extends identity only | Repair R1/R2 first |
| durable state | Yes | Q11 |
| transient state | No | receipts in-memory |
| identity keys | Yes | Q3, Q4 |
| lifecycle / state machine | Partial | catalog ladder closed; activation pointer Q12 |
| route resolution | Partial | M2 unifies CURRENT; cutover Q2 |
| provider compatibility | No | fingerprint + profiles |
| reasoning translation | Partial | tables are engineering; who requests Q8 |
| fallback semantics | Yes | Q5, Q14 |
| failure semantics | No | ontology closed; R1/R2 repair |
| transport ambiguity | No | ontology closed; R2 repair |
| persistence | Yes | Q11 |
| observability | No | extend `GET /nuclear/routing`; no Event Spine |
| qualification | Yes | Q4, Q6, Q10 |
| promotion | Yes | Q12 |
| activation | Yes | Q2, Q12, Q13, Q18 |
| rollback | Yes | Q3, Q12, Q13 |
| privacy | No for core law; paid vs trial Ultra is policy data | Architecture §23.6 |
| independence | Yes | Q10 |
| deadline | Yes for Thought envelope | Q7 |
| cost / budget | Yes | Q15 |
| concurrency | No | Attention already serializes admission |
| idempotency | No | one HTTP per attempt; pin Mistral `strategy: "none"` |
| migration | No for M2 caller seam; yes for activation unit | §24a, Q13 |
| compatibility | No | `existing_compatibility` closed |
| tests / acceptance evidence | No as policy; Pass 2 writes packs | gap matrix |

## 25. What can already be contract-frozen without owner input

- Receipt ontology (attempt / invocation / chain; stages; send outcomes). Repair R1/R2 to match it, do not change it.
- ReasoningPolicy enum and “profile does not decide desired reasoning.”
- `existing_compatibility` non-transferable tuple.
- Track A vs Track B.
- Thought/Expression not on OpenCode initially.
- No auto-promotion. Discovery into unqualified only.
- Evaluation owns `QualificationResult`; Fabric owns mechanical binding.
- F1-obs remains deferred optional.
- Event Spine is not a dependency.
- Metacognition must not be implemented inside M2–M6.
- Live routing preservation until explicit activation.
- One HTTP per attempt. Mistral client pin `retryConfig: { strategy: "none" }`.
- M2 caller migration: unify CURRENT snapshot in one seam; keep explicit
  `route` / `model` overrides as recorded overrides. Role-by-role is for
  later activation (Q13), not M2.

## 26. What must not be frozen yet

- Constitution vs §12.9.
- Whether M2–M6 include core cutover.
- Qualification subject grain, invalidation set, emergency unqualified fallback.
- Thought latency envelope and high vs max trigger.
- Independence enforcement threshold and judge family list.
- Persistence location.
- Promotion/activation artifact and rollout unit.
- Track A transport, curiosity secondary order, vendor strings, catalog cadence.
- Shadow-required-before-activation.
- Exact schemas, state machines, and Wave-style milestone contracts.

## 27. Proposed Pass 2 work (after owner answers)

1. Apply owner answers as closed rows. Do not reopen.
2. Write implementation-ready contracts for MF-M2–MF-M6 (and an activation slice only if the owner added one).
3. Include the MF-M1 repair package as a mandatory first code slice in the Luna `/goal`.
4. Produce falsification packs listed in the gap matrix.
5. Still no runtime in Pass 2 unless the owner later asks for implementation.

---

## 28. Confirmations

- Runtime/source files edited: **no**
- Commit: **no**
- Push: **no**
- Deploy / Mint: **no**
- Production routing / `models.json` / provider activation: **no**
