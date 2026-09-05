# PROJECT ASHLEY — PROJECTION ECONOMY + PROMPT CACHING

## CANONICAL IMPLEMENTATION-READY MATURATION PROGRAMME

```
STATUS:                    ARCHITECTURE_RECONCILED
                           IMPLEMENTATION_NOT_STARTED

SOURCE_BASELINE_SHA:       808e6a081a075e417e3af4a4b24385f815dc1f51
SOURCE_BASELINE_TREE:      2acd079a8417a31cc80d6eca5ac089018b2cb7f7

RESEARCH_INPUT:            CLAUDE_OPUS_4.6_INVESTIGATION
ARCHITECTURE_ADJUDICATION: OWNER_PLUS_SOL

RUNTIME_SOURCE_MUTATION:   no
TEST_SOURCE_MUTATION:      no
DATABASE_MUTATION:          no
PUSH_PERFORMED:            no
DEPLOYMENT_PERFORMED:      no
COMMIT_CREATED:            no
```

---

## 0. Document Authority and Status

This document is the canonical execution plan for the Projection Economy + Prompt
Caching maturation programme. It derives authority from:

1. **Owner + Sol architectural adjudication** — highest authority for programme decisions
2. **Verified repository source** at SHA `808e6a08` — source truth for all mechanical claims
3. **Opus investigation artifact** — research evidence, not frozen architecture
4. **Project Ashley governing documents** — constitutional and cross-phase laws

Implementation workers execute this plan wave by wave. They do not decide architecture.

If source truth contradicts this plan during implementation:

```
STOP
RETURN_SOURCE_CONTRADICTION
DO_NOT_INVENT_POLICY
```

---

## 1. Executive Programme Decision

### Track A — Projection Economy

Reduce logical tokens Thought actually needs.

```
MAXIMIZE_USEFUL_SEMANTIC_DENSITY
MINIMIZE_REDUNDANT_SERIALIZATION
PRESERVE_REQUIRED_SOURCE_TRUTH_EXACTLY_ONCE
LET_OPTIONAL_CONTEXT_COMPETE_FOR_REMAINING_CAPACITY
```

### Track B — Prompt / Prefix Caching

For legitimate tokens that remain logically present:

```
DO_NOT_REPEATEDLY_PAY
FULL_HOST_CONSTRUCTION + FULL_PROVIDER_PREFILL
```

when the stable prefix has not changed.

### Governing law

```
CACHED_TOKEN_IS_STILL_A_LOGICAL_CONTEXT_TOKEN
```

Provider caching must NOT cause cached logical tokens to be removed from the
semantic envelope calculation.

---

## 2. Project Ashley Architectural Laws

### 2.1 Thought is sole semantic author

Host may mechanically: retrieve, select, order, bound, hash, cache, version,
validate, serialize, route, persist receipts, reconcile currentness, gate.

Host must not manufacture: autobiographical meaning, emotional conclusions,
self-beliefs, semantic equivalence, Host summaries of omitted context.

```
HOST_SEMANTIC_SUMMARIZATION=no
HOST_SEMANTIC_DEDUPLICATION=no
HOST_EMBEDDING_EQUIVALENCE=no
```

### 2.2 Current trigger

```
CURRENT_AUTHORITATIVE_OWNER_TRIGGER=REQUIRED
CURRENT_TRIGGER_OMITTABLE_FOR_BUDGET=no
```

### 2.3 Frontier

```
UNRESOLVED_REACTIVE_FRONTIER=ACTIVE_COGNITIVE_OCCUPANCY
FRONTIER_CURRENT_IDENTITIES_LOST=0
```

### 2.4 Semantic budget

```
SEMANTIC_PROJECTION_ENVELOPE=9500
```

Frozen during this programme. Not a target prompt size. Not provider TPM.

### 2.5 Cache correctness

```
CACHE_HIT != CONTINUITY
CACHE_HIT != MEMORY
CACHE_HIT != IDENTITY
CACHE_HIT != CURRENTNESS
CACHE_HIT != PHYSICAL_TRUTH
CACHE_HIT != CORRECTNESS
```

Cache loss/miss/expiration/provider switch degrades only:

```
PERFORMANCE
COST
LATENCY
```

not Ashley correctness.

### 2.6 Cache miss law

```
CACHE_MISS → REBUILD_FROM_RIGHTFUL_SOURCE_TRUTH → SAME_LOGICAL_REQUEST → CORRECT_RESULT
```

### 2.7 Rebuildability

```
REBUILDABLE_CACHE > DURABLE_SECOND_TRUTH
```

No persistent cache truth DB unless overwhelming source evidence requires it.

### 2.8 No-provider-dispatch law

```
NO_PROVIDER_DISPATCH_SAMPLES
!=
AUTHORITY_TO_DEBUG_UNRELATED_CURRENT_THOUGHT_FAILURE
```

If production observation yields zero or insufficient provider dispatches, the provider cache baseline is recorded as `UNAVAILABLE`. This does NOT grant authority to diagnose, patch, or debug the unrelated live Thought failure, nor to alter the 9500 envelope or allocator behavior. Provider-independent waves whose prerequisites are satisfied proceed normally.

---

## 3. Current Source Baseline

Verified at plan construction time:

```
SHA=808e6a081a075e417e3af4a4b24385f815dc1f51
TREE=2acd079a8417a31cc80d6eca5ac089018b2cb7f7
BRANCH=master
```

Worktree: clean except known `cognitive-v021/index.ts` line-ending marker and
Owner-created untracked investigation artifacts. Neither touched.

---

## 4. Research Inputs and Evidence Ranking

| Source | Authority | Use |
|---|---|---|
| Owner + Sol adjudication packet | **HIGHEST** | Corrections override all other sources |
| Repository source at `808e6a08` | **SOURCE TRUTH** | Mechanical claims verified here |
| Opus investigation artifact | **RESEARCH EVIDENCE** | Findings used where source-confirmed |
| Provider documentation | **EXTERNAL FACT** | Provider behavior claims |
| Production observation | **RUNTIME TRUTH** | When available |

---

## 5. Opus Investigation — Accepted Findings

The following Opus findings are source-confirmed and accepted:

| Finding | Verified Source |
|---|---|
| Orientation kernel successfully deduplicated constitution + capabilityReality | `projection.ts:107-126`, `sections.ts:134-152` |
| Compatibility aliases use `enumerable: false` pattern | `orientation-kernel.ts:213-226`, `projection.ts:111-124` |
| No provider caching parameters sent in any adapter | All four adapters verified — zero cache parameters |
| `cachedInputTokens` exists in `ModelUsage` but hardcoded `null` | `receipts.ts:108`, `types.ts:332` |
| `TokenUsage` (adapter level) has no `cachedTokens` field | `model-routing/types.ts:63-68` |
| System message is stable per code release | `output-contract.ts:247-268`, `allocator.ts:82-93` |
| User message puts `cycleId`/`generation` at JSON positions 1-2 | `allocator.ts:237-238` |
| Orientation kernel serialized near end of user JSON | `allocator.ts:276-278` (position ~19 in property order) |
| Allocation loop calls `renderTentative` + `JSON.stringify` + `estimateRequestTokens` per candidate | `allocator.ts:298-380` |
| Typical candidate count: 25-65 per cycle | `sections.ts:95-399` analysis |
| `BYTES_PER_TOKEN = 2` is conservative over-estimate | `estimate.ts:10` |
| `SEMANTIC_PROJECTION_ENVELOPE = 9500` | `budget.ts:45-49` |
| Thought route: NIM primary → Groq failover, model `openai/gpt-oss-20b` | `Routing_Status.md` |
| Groq has confirmed 50% cached-token billing discount (official docs) | Web research |
| `staticOperatingContract` = `core.md` + `discord.md` + thin runtime rules | `prompts.ts:20-40` |

---

## 6. Owner + Sol Corrections

The following Owner + Sol corrections are reconciled into this plan:

### 6.1 Current system message may already cache

Opus claimed volatile fields "completely destroy" prefix caching. Corrected:

```
CURRENT_SYSTEM_MESSAGE_PREFIX_MAY_ALREADY_CACHE=yes
VOLATILE_FIELDS_IN_MESSAGES_1_PREVENT_DEEP_USER_MESSAGE_CACHING=yes
CURRENT_CACHE_HIT_RATE=UNKNOWN_UNTIL_W0_MEASURES
```

### 6.2 Token anatomy numbers are not authoritative

Opus mixed estimator tokens, provider tokens, and rough heuristics. Corrected:

```
TOKEN_BASELINE_REQUIRES_W0_MEASUREMENT=yes
```

Source-verified: `staticOperatingContract` alone is ~5100 bytes → ~2550 estimated
tokens (at `BYTES_PER_TOKEN=2`). Prior incident accounting showed kernel ~3599
and contract ~2854 estimated tokens. Opus estimates of "800-1000" and
"1200-1800" were materially low.

No speculative token savings frozen as acceptance targets.

### 6.3 NIM cache support is unresolved

```
NIM_PROVIDER_CACHE_SUPPORT=UNKNOWN
```

Must be mechanically determined in W0. Do not infer from OpenAI-compatible API.
W0 may parse `prompt_tokens_details.cached_tokens` if the field appears, but parsing
capability does not establish that NIM caching is enabled, exists on this endpoint,
or exposes identical fields. W0 must report separately:

```
NIM_CACHED_USAGE_FIELD_OBSERVED=<yes/no>
NIM_PROVIDER_CACHE_SUPPORT=<confirmed/unsupported/unknown>
```

Absence of a field means `NOT_OBSERVED` unless provider/source evidence proves
unsupported. Do not infer unsupported from null usage alone.

### 6.4 W1 reordering risk classification corrected

```
SOURCE_FACT_SET_CHANGED=no
SOURCE_AUTHORITY_CHANGED=no
MODEL_VISIBLE_PRESENTATION_ORDER_CHANGED=yes
BEHAVIORAL_EFFECT_POSSIBLE=yes
```

W1 requires behavioral regression qualification, not merely key-set equality.

### 6.5 Pointer compaction rejected as blanket removal

```
REMOVE_DISPOSITION_FROM_THOUGHT=PROHIBITED
```

unless source proves identical disposition truth survives elsewhere. Field-by-field
analysis required per §21 ADR-6.

### 6.6 Raw history 12→8 rejected

```
ARBITRARY_HISTORY_COUNT_OPTIMIZATION=PROHIBITED
```

Current allocator already provides token-driven admission with required-before-optional
ordering. Economy must be budget/value/priority-oriented, not count-based.

### 6.7 Contract compression route proof failed — W3 source-prosecuted no-change

Every Thought dispatch path must receive equivalent structured schema guidance
before prose can be removed. Route proof mechanically failed: Groq failover throws
`structured_output_native_unsupported` and dispatches `{ type: "json_object" }`
without schema descriptions, and multiple non-v021 Thought paths lack structured
output. Therefore:

```
W3_STATUS=SOURCE_PROSECUTED_NO_CHANGE
W3_IMPLEMENTATION_AUTHORIZED=no
ALL_CONTRACT_PROSE_PRESERVED=yes
```

W3 is closed and blocked from implementation for this programme.

### 6.8 Cross-cycle compiled cache deferred until measured

```
SMALLEST_RIGHTFUL_EXTENSION > PREEMPTIVE_CACHE_FRAMEWORK
```

Request-local memoization first. Cross-cycle only if measured residual justifies it.

### 6.9 Node concurrency is not inherently safe

Async operations may interleave. Cache design must prove correctness against
concurrent Thought execution or demonstrate serialization.

### 6.10 Cache privacy is per-provider

```
GROQ_CACHE_PRIVACY_RISK=<evidence-derived>
NIM_CACHE_PRIVACY_RISK=UNKNOWN
```

### 6.11 No arbitrary acceptance percentages before W0

```
TARGETS=PENDING_BASELINE
```

### 6.12 ADRs required

Full ADR-style entries required, not summary tables.

### 6.13 W0 scope expanded to empirical programme baseline

W0 is expanded from simple cached-token parsing into:

```
W0 — TOKEN + CACHE + PROJECTION BASELINE OBSERVABILITY
```

Establishing both (A) Provider usage baseline and (B) Projection economy baseline
(stable-prefix baseline, section token/byte distribution, optional-context displacement,
and allocation performance profile).

### 6.14 Primary qualification unit is sample-based, not time-only

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window
```

Elapsed time alone is insufficient evidence. Qualification requires sufficient
representative successful samples, with return ledgers reporting sample counts,
distributions, and elapsed observation windows.

### 6.15 No-provider-dispatch state does not authorize incident debugging

```
NO_PROVIDER_DISPATCH_SAMPLES
!=
AUTHORITY_TO_DEBUG_UNRELATED_CURRENT_THOUGHT_FAILURE
```

If production observation yields zero or insufficient provider dispatches, the provider
cache baseline is recorded as `UNAVAILABLE`. Workers must NOT debug the unrelated live
Thought failure, alter 9500, or modify allocator behavior. Provider-independent waves
proceed normally.

---

## 7. Current Thought Projection Architecture

### 7.1 Pipeline

```
Trigger
  → buildThoughtInput()                    input.ts:290-414
    → frontierAwareEvidenceSelection       input.ts:297-307
    → listWorkingContext                   working-context.ts
    → loadOccupancy                        input.ts:310-313
    → buildLearnedSelfSlice                learned-self.ts:37
    → buildOrientationKernel               orientation-kernel.ts:183
       → loadNuclearSystemPrompt("discord") prompts.ts:20-40
    → buildDomainPointers                  domain-pointers.ts:332-384
    → adaptC3Experiences                   c3-adapter.ts
    → retrieveCandidates                   input.ts:356-370
    → listInFlight                         in-flight.ts:95
  → allocateThoughtProjection()            allocator.ts:158-507
    → deriveThoughtBudget                  budget.ts:75 (9500 ceiling)
    → buildAllocationCandidates            sections.ts:95-399
    → Candidate inclusion loop             allocator.ts:298-380
       Per candidate: renderTentative + thoughtMessagesForProjection
                    + JSON.stringify + estimateRequestTokens
    → Final renderTentative + hash computation
  → runThoughtModel()                      run.ts:402-518
    → invokeThoughtComplete                run.ts:170-177
       → completeChat → Attention → adapter
```

### 7.2 Request structure

```
messages[0] system:  Thought output contract (stable per release)
  "You are Ashley's Thought layer."
  "Return exactly one JSON semantic Thought output."
  thoughtOutputCompatibilityInstruction()    ← ~16 dense sentences
  "Code validates identity, authority, speech licensing, and publication."
  "Do not return finalLicensedText, ..."
  [optional: structural feedback on retry]

messages[1] user:    JSON.stringify(modelVisibleThoughtProjection(projected))
  Property insertion order (current):
    1. cycleId              ← VOLATILE
    2. generation           ← VOLATILE
    3. occupantId           ← STABLE
    4. authorityEpoch       ← SLOW-CHANGING
    5. trigger              ← VOLATILE
    6. rawConversation      ← VOLATILE
    7. workingContext        ← DYNAMIC
    8. occupancy            ← DYNAMIC
    9. learnedSelfSlice     ← SLOW-CHANGING
   10. observations         ← VOLATILE
   11. retrieval            ← VOLATILE
   12. inFlight             ← VOLATILE
   13. authorityObjections  ← VOLATILE
   14. runtimeCondition     ← VOLATILE
   15. rememberDirective    ← VOLATILE
   16. conversationSelection ← VOLATILE
   17. orientationKernel    ← SLOW-CHANGING
   18. domainPointers       ← DYNAMIC

messages[2] user (retry only): correction data
```

### 7.3 Allocation loop performance profile

Source-confirmed (allocator.ts:298-380):

| Work item | Per iteration? | Invariant across iterations? |
|---|---|---|
| `renderTentative()` — full object construction | YES | NO (accumulative) |
| `orderedConversation()` — array sort | YES | NO (grows) |
| `mintEffectRef()` — per in-flight item | YES | YES (invariant) |
| `attachC2CompatibilityFields` — Object.defineProperties | YES | YES |
| `thoughtMessagesForProjection()` — system message join | YES | YES (invariant) |
| `thoughtOutputCompatibilityInstruction()` — string generation | YES | YES (invariant) |
| `modelVisibleThoughtProjection()` — Object.entries/filter | YES | NO (grows) |
| `JSON.stringify()` — full projection serialization | YES | NO (grows) |
| `Buffer.byteLength()` — full string scan | YES | NO (grows) |
| `estimateRequestTokens()` — arithmetic | YES | NO |

For N ≈ 25–65 candidates, system message alone is reconstructed 26–66 times.
Full projection serialization produces ~0.6–3.2 MB of transient JSON strings
per allocation cycle.

---

## 8. Current Token / Usage Measurement Model

### 8.1 Estimation algorithm

```
estimatedInputTokens = ceil(utf8_bytes(all messages) / BYTES_PER_TOKEN) + FRAMING_TOKEN_OVERHEAD
BYTES_PER_TOKEN = 2                    estimate.ts:10
FRAMING_TOKEN_OVERHEAD = 64            estimate.ts:16
```

This is a conservative over-estimate. Real tokenizers average ~3.5-4 bytes/token
for English. Estimated tokens are ~1.3-2× actual provider tokens.

### 8.2 Current receipt infrastructure

| Type | Location | Fields | Persistent? | Extensible? |
|---|---|---|---|---|
| `AllocationTokenBreakdown` | `receipt.ts:5-19` | 12 section-level token fields + omission counts | Transient (receipt) | Yes — add fields |
| `AllocationReceipt` | `receipt.ts:38-62` | Budget, breakdown, hashes, decision | Transient (receipt) | Yes — add fields |
| `TokenUsage` | `model-routing/types.ts:63-68` | `promptTokens`, `completionTokens`, `reasoningTokens?` | Transient | YES — add `cachedTokens?` |
| `ModelUsage` | `model-fabric/types.ts:329-335` | `inputTokens`, `outputTokens`, `cachedInputTokens`, `reasoningTokens`, `providerReported` | Receipt (persisted via fabric) | `cachedInputTokens` exists, always `null` |
| `ThoughtCycleTokenMetrics` | `run.ts:125-137` | `first_pass_total_input_tokens`, `total_cycle_input_tokens_including_retries`, `retry_amplification_ratio`, `request_count` | Diagnostic | Yes — add fields |

### 8.3 Current gaps

```
TokenUsage.cachedTokens           = ABSENT (adapter level)
ModelUsage.cachedInputTokens      = HARDCODED_NULL (receipts.ts:108)
prefix_hash                       = ABSENT
prefix_byte_offset                = ABSENT
ashley_cache_hit                  = ABSENT
per_section_wire_bytes            = ABSENT (only computed at receipt time, not recorded per section)
provider_uncached_input_tokens    = ABSENT (derivable: inputTokens - cachedInputTokens)
```

---

## 9. Projection Economy Architecture

### 9.1 Governing laws

```
ONE_SOURCE_TRUTH → ONE_CANONICAL_INLINE_REPRESENTATION
DUPLICATE_REQUIRED_SERIALIZATION → REMOVE
REQUIRED_UNIQUE_SEMANTICS → PRESERVE
OPTIONAL_CONTEXT → COMPETE_FOR_REMAINING_CAPACITY
PROVIDER_CONTEXT_WINDOW != LICENSE_TO_INFLATE_PROMPT
```

### 9.2 Already accepted economy repairs

| Repair | Status | Source |
|---|---|---|
| Ordinary history is budget-degradable (optional) | ACCEPTED | `sections.ts:176-187` |
| Required candidates packed before optional | ACCEPTED | `allocator.ts:190-193` |
| Orientation kernel is canonical wire owner for identity | ACCEPTED | `orientation-kernel.ts`, `sections.ts:134-152` |
| Duplicate constitution/capabilityReality removed from wire | ACCEPTED | `projection.ts:107-149` |

### 9.3 Remaining economy surface

This programme addresses:
- Static Thought contract prose duplication (W3) — **SOURCE_PROSECUTED_NO_CHANGE / BLOCKED FROM IMPLEMENTATION**
- Specific wire field compaction where source-closed (W2)
- Request-local Host compute waste (W4)
- Optional context competition optimization (W5)

It does NOT address:
- Raw JSON key shortening (deferred)
- Host semantic summarization (prohibited)
- Embedding-based deduplication (prohibited)

---

## 10. Prompt / Prefix Caching Architecture

### 10.1 Design principle

Ashley's stable prefix consists of material that does not change between
consecutive Thought cycles when identity, capability, and code release remain
constant.

```
STABLE_PREFIX = messages[0] system message
             + early portion of messages[1] if reordered
```

Provider automatic prefix caching matches byte-identical request prefixes.
Ashley's job is to maximize this common prefix by:

1. Keeping system message stable per release (already true)
2. Ordering user message JSON with stable fields first (W1)
3. Moving volatile fields to the end (W1)

### 10.2 Three-tier caching

```
LAYER A — Request-Local Memoization
  Scope: within single allocateThoughtProjection call
  Purpose: avoid repeated system message + stable prefix construction
  Persistence: none
  Invalidation: N/A (per-call scope)

LAYER B — Provider Prefix Cache
  Scope: provider-managed, across consecutive requests
  Purpose: reduce prefill compute and billing
  Persistence: provider-owned volatile KV store
  Invalidation: automatic on byte-prefix mismatch

LAYER C — Cross-Cycle Ashley Compiled Core (DEFERRED)
  Scope: in-process memory, across Thought cycles
  Purpose: avoid redundant system message + identity serialization
  Persistence: in-process only, no disk
  Invalidation: source version hash comparison
  Gate: ONLY IF W4 profiling shows significant residual Host cost
```

Layer C is not pre-authorized. W4 must measure whether Layer A is sufficient.

---

## 11. Cache Correctness Laws

```
CACHE_HIT_LOGICAL_REQUEST == CACHE_MISS_LOGICAL_REQUEST
```

except transport/provider cache metadata.

```
CACHE_MISS → REBUILD_FROM_RIGHTFUL_SOURCE_TRUTH → CORRECT_RESULT
PROVIDER_SWITCH → ASHLEY_SOURCE_TRUTH_VALID → PROVIDER_CACHE_MISS → CORRECT
PROCESS_RESTART → EMPTY_CACHE → FIRST_CYCLE_CORRECT → CACHE_WARM_FROM_SECOND
IDENTITY_CHANGE → CACHE_INVALIDATION → CORRECT_REBUILD
```

Provider cache identity never becomes Ashley authority.

---

## 12. Provider Capability Matrix

| Feature | Groq | NIM (NVIDIA) | Mistral | OpenRouter |
|---|---|---|---|---|
| **Currently active for Thought** | Failover | Primary | No | No |
| **Cache support** | Yes (automatic prefix) | UNKNOWN | Yes (explicit key) | Yes (auto + explicit) |
| **Cache type** | Automatic prefix | UNKNOWN | Explicit `prompt_cache_key` | Provider-dependent |
| **Billing discount** | 50% cached input | UNKNOWN | ~90% cached input | Varies |
| **Usage reporting** | `prompt_tokens_details.cached_tokens` (per docs) | UNKNOWN | Usage response | `cached_tokens` |
| **Session/sticky routing** | Recommended | N/A | N/A | `session_id` |
| **Privacy scope** | Account-scoped | UNKNOWN | Account-scoped | Varies |
| **Retention** | Volatile memory | UNKNOWN | UNKNOWN | UNKNOWN |
| **Cross-tenant reuse** | No | UNKNOWN | No | UNKNOWN |
| **Deletion controls** | N/A (volatile) | UNKNOWN | UNKNOWN | UNKNOWN |
| **Prompt text or KV** | KV state (inferred) | UNKNOWN | UNKNOWN | UNKNOWN |

```
NIM_CACHE_SUPPORT=UNKNOWN
NIM_CACHE_REQUIRES_W0_INVESTIGATION=yes
NIM_CACHED_USAGE_FIELD_OBSERVED=UNKNOWN_UNTIL_W0
```

W0 may parse `prompt_tokens_details.cached_tokens` if the field appears in responses,
but parsing capability does not establish that NIM caching is enabled, exists on this
endpoint, or exposes the same fields as Groq. W0 must report separately:

```
NIM_CACHED_USAGE_FIELD_OBSERVED=<yes/no>
NIM_PROVIDER_CACHE_SUPPORT=<confirmed/unsupported/unknown>
```

Absence of a field means `NOT_OBSERVED` unless provider/source evidence proves
unsupported. Do not infer unsupported from null usage alone.

### 12.1 Privacy assessment

```
GROQ_CACHE_PRIVACY_RISK=LOW
  Evidence: account-scoped, volatile memory, single-user system, no cross-tenant
NIM_CACHE_PRIVACY_RISK=UNKNOWN
  Evidence: provider behavior unresolved; Ashley carries personal continuity
MISTRAL_CACHE_PRIVACY_RISK=NOT_CURRENTLY_RELEVANT
  Evidence: Mistral not active for Thought route
```

---

## 13. Cache Tier Classification

| Section | Cache Tier | Change Owner | Invalidation Signal | Can Provider Prefix Cache? | Can Host Cache? | Why |
|---|---|---|---|---|---|---|
| Thought output contract (system msg) | **S0 RELEASE-STABLE** | Code release | `THOUGHT_OUTPUT_SCHEMA_FINGERPRINT` change | Yes (first in request) | Yes (request-local) | Generated from code-owned constants |
| `staticOperatingContract` | **S0** | Prompt file release | `staticContractHash` (kernel computes) | Yes (inside user msg prefix if reordered) | Yes (request-local) | File read, deterministic |
| `orientationKernel.values` | **S1 SLOW-CHANGING** | Identity DB mutation | Identity version/hash change | If reordered before volatile | Yes (request-local) | DB-sourced, rare change |
| `orientationKernel.boundaries` | **S1** | Identity DB mutation | Same | Same | Yes | Same |
| `orientationKernel.selectedStableSelf` | **S1** | Identity DB mutation | Same | Same | Yes | Same |
| `orientationKernel.capabilityReality` | **S1** | Capability promotion | Capability version change | Same | Yes | Same |
| `learnedSelfSlice` | **S1** | Learned-self mutation | DB version change | If reordered before volatile | Yes (request-local) | Requires mechanical invalidation source |
| `occupantId` | **S1** | Never (fixed) | Config | Same | Yes | Fixed value |
| `authorityEpoch` | **S1** | Authority change (rare) | Authority event | Same | Yes | Rare |
| `workingContext` | **S2 DYNAMIC** | Per cycle | DB state | No | No | Changes each cycle |
| `occupancy` | **S2** | Per cycle | DB state | No | No | Same |
| `domainPointers` | **S2** | Per cycle | Multiple DB tables | No | No | Same |
| `rawConversation` | **S2** | Per cycle | Conversation log | No | No | Same |
| `retrieval` | **S2** | Per cycle | Retrieval engine | No | No | Same |
| `cycleId` | **S3 PER-CYCLE** | Every cycle | Host cycle mint | No | No | UUID per cycle |
| `generation` | **S3** | Every cycle | Host counter | No | No | Integer per cycle |
| `trigger` | **S3** | Every cycle | Event | No | No | Per-event |
| `observations` | **S3** | Every cycle | Observation results | No | No | Per-cycle |
| `inFlight` | **S3** | Every cycle | Effect state | No | No | Per-cycle |

Cacheability requirements:
```
mechanical_invalidation_source=REQUIRED
deterministic_serialization=REQUIRED
correctness_on_miss=REQUIRED
```

---

## 14. Prefix Determinism and Ordering

### 14.1 Current state

```
PREFIX_DETERMINISM_SYSTEM_MESSAGE = YES (stable per release)
PREFIX_DETERMINISM_USER_MESSAGE   = FAIL (cycleId UUID at position 1)
```

The system message (`messages[0]`) is deterministic per code release. It
reconstructs from `thoughtOutputCompatibilityInstruction()` which generates
from code-owned schema constants. Any provider automatic prefix cache should
match on system message bytes across consecutive calls.

The user message (`messages[1]`) currently fails prefix determinism because
volatile `cycleId` (UUID) appears as the first serialized JSON key.

### 14.2 Proposed target ordering (W1)

```
messages[1] user JSON key order:

  S1 SLOW-CHANGING (first for prefix)
    orientationKernel
    learnedSelfSlice
    occupantId
    authorityEpoch

  S2 DYNAMIC
    workingContext
    occupancy
    domainPointers
    rawConversation
    retrieval

  S3 PER-CYCLE (last)
    cycleId
    generation
    trigger
    observations
    inFlight
    authorityObjections
    runtimeCondition
    rememberDirective
    conversationSelection
```

### 14.3 Determinism proof requirements

W1 must prove:
```
same S0 sources → same S0 bytes
same S1 sources → same S1 bytes
trigger change → S0/S1 prefix unchanged
cycleId change → S0/S1 prefix unchanged
identity change → S1 prefix changes
contract release change → S0 prefix changes
```

---

## 15. Invalidation Model

### 15.1 Mechanical rules

Cache identity derived from source version hashes only:

| Cache Component | Invalidation Trigger | Detection |
|---|---|---|
| System message string | Code release | `THOUGHT_OUTPUT_SCHEMA_FINGERPRINT` change |
| Static operating contract | Prompt file change | `staticContractHash` (already computed) |
| Identity values/boundaries | `/identity` approve/reject | Identity DB version |
| Capability reality | Capability promotion/rollback | Capability version |
| Learned self | Learned-self mutation | DB version |

### 15.2 Never used for invalidation

```
TTL-only expiry
semantic similarity
model judgment
"probably unchanged"
provider cache state
```

### 15.3 Provider prefix identity

For automatic prefix caching: byte-identical prefix match (provider-managed).
For explicit cache key (if ever needed): composite of source version hashes.

```
BYTE_CHANGE → CACHE_IDENTITY_CHANGE
```

---

## 16. Privacy / Retention

Per-provider assessment:

### Groq (Thought failover)

```
CACHE_SCOPE:          Account-scoped
RETENTION:            Volatile memory, eviction-based
PERSISTENCE:          None (inference server memory)
CROSS_TENANT_REUSE:   No
DELETION:             N/A (volatile)
PROMPT_TEXT_OR_KV:    KV states (inferred from API documentation)
RISK:                 LOW (single-user, account-scoped, volatile)
```

### NIM (Thought primary)

```
CACHE_SCOPE:          UNKNOWN
RETENTION:            UNKNOWN
PERSISTENCE:          UNKNOWN
CROSS_TENANT_REUSE:   UNKNOWN
DELETION:             UNKNOWN
PROMPT_TEXT_OR_KV:    UNKNOWN
RISK:                 UNKNOWN (requires W0 investigation)
```

---

## 17. Observability Contract

W0 expands from simple cached-token parsing into the empirical baseline for the entire
programme. It establishes two parallel baselines: **(A) Provider Usage Baseline** and
**(B) Projection Economy Baseline**.

### 17.1 Provider usage baseline metrics

All provider metrics extend existing transient receipt types or adapter-level types.
No new provider request parameter is sent; no cache-control header is transmitted.

| Metric | Type | Location | Baseline Source |
|---|---|---|---|
| `cachedTokens` | number? | `TokenUsage` (adapter) | **NEW in W0**: parsed from provider usage |
| `provider_input_tokens` | number \| null | `ModelUsage.inputTokens` | Existing adapter usage response |
| `provider_output_tokens` | number \| null | `ModelUsage.outputTokens` | Existing adapter usage response |
| `provider_cached_input_tokens` | number \| null | `ModelUsage.cachedInputTokens` | Exists in type, always null — **W0 populates** |
| `provider_uncached_input_tokens` | number \| null | Diagnostic derived | `inputTokens - cachedInputTokens` (when both non-null) |
| `NIM_CACHED_USAGE_FIELD_OBSERVED` | boolean | W0 diagnostic report | Recorded dynamically from NIM responses |
| `NIM_PROVIDER_CACHE_SUPPORT` | string | W0 diagnostic report | `confirmed` \| `unsupported` \| `unknown` |

**NIM Reporting Rules:**
- W0 parses `prompt_tokens_details.cached_tokens` if present.
- Parsing capability does NOT prove NIM caching is enabled or supported.
- `NIM_PROVIDER_CACHE_SUPPORT=UNKNOWN` remains frozen until empirical confirmation.
- Absence of cached-token field means `NOT_OBSERVED`; do not infer unsupported from null usage alone.

### 17.2 Projection economy baseline metrics

W0 establishes a mechanical baseline for projection layout and section token demand.
Where `AllocationTokenBreakdown` already provides an equivalent metric, **reuse existing metric**.
Where exact byte lengths are computed, derive them diagnostically without persistent schema.

| Metric | Source / Derivation | Storage | Status |
|---|---|---|---|
| `system_message_bytes` | `Buffer.byteLength(systemMessage.content, "utf8")` | Transient diagnostic | Mechanical derivation |
| `system_message_estimated_tokens` | `ceil(system_message_bytes / 2)` | Transient diagnostic | `static_contract_tokens` |
| `orientation_kernel_bytes` | Transient byte measurement of kernel JSON | Transient diagnostic | Mechanical derivation |
| `orientation_kernel_estimated_tokens` | `AllocationTokenBreakdown.identity_kernel_tokens` | Receipt breakdown | Existing metric |
| `required_base_estimated_tokens` | Sum of required candidates token demand | Receipt / diagnostic | Existing allocator data |
| `optional_context_estimated_tokens` | Sum of optional candidates token demand | Receipt / diagnostic | Existing allocator data |
| `conversation_estimated_tokens` | `AllocationTokenBreakdown.conversation_tokens` | Receipt breakdown | Existing metric |
| `working_context_estimated_tokens` | `AllocationTokenBreakdown.working_context_tokens` | Receipt breakdown | Existing metric |
| `domain_pointer_estimated_tokens` | `AllocationTokenBreakdown.domain_pointer_tokens` | Receipt breakdown | Existing metric |
| `learned_self_estimated_tokens` | `AllocationTokenBreakdown.learned_self_tokens` | Receipt breakdown | Existing metric |
| `retrieval_estimated_tokens` | `AllocationTokenBreakdown.retrieval_tokens` | Receipt breakdown | Existing metric |
| `observations_estimated_tokens` | `AllocationTokenBreakdown.observations_tokens` | Receipt breakdown | Existing metric |
| `in_flight_estimated_tokens` | `AllocationTokenBreakdown.in_flight_effect_tokens` | Receipt breakdown | Existing metric |
| `omitted_for_budget_tokens` | `AllocationTokenBreakdown.omitted_for_budget_tokens` | Receipt breakdown | Existing metric |
| `omitted_for_budget_count` | `AllocationTokenBreakdown.omitted_for_budget_count` | Receipt breakdown | Existing metric |
| `headroom_tokens` | `AllocationReceipt.headroomTokens` | Receipt | Existing metric |

### 17.3 Stable-prefix baseline metrics

W0 derives stable-prefix boundary metrics for the current request layout to establish the
empirical baseline against which W1 will be evaluated:

```
system_prefix_bytes                     = Buffer.byteLength(messages[0].content, "utf8")
system_prefix_estimated_tokens          = ceil(system_prefix_bytes / BYTES_PER_TOKEN)
candidate_S0_S1_prefix_bytes            = byte length through end of S1 material (simulated)
candidate_S0_S1_prefix_estimated_tokens = estimated tokens through S1 boundary
first_volatile_field                    = "cycleId" (current position 1 in user message)
first_volatile_byte_offset              = byte offset where cycleId begins in user message
```

**Content Logging Prohibition:** Do NOT log prompt text or user content.
Use counts, byte lengths, hashes, and field identities only.

### 17.4 Optional-context displacement baseline metrics (for W5)

W0 provides mechanical evidence to evaluate optional context competition:
- Which optional sections are admitted
- Which optional sections are omitted
- Omission reason (`budget_omission`, `duplicate`, `fuse`, `not_eligible`)
- Section priority (from `sections.ts`)
- Estimated token demand per section
- Starvation detection: whether lower-priority optional sections (retrieval, optional WC, C3)
  are systematically omitted across cycles

Existing `AllocationDecision` (`included` and `omitted` arrays in `receipt.ts`) already exposes
candidate section IDs, required status, and omission reasons. W0 reuses these receipts without
inventing a subjective "value score."

### 17.5 Allocation performance baseline metrics (for W4)

W0 establishes an empirical baseline for Host allocation cost:
- `allocation_candidate_count`: total candidates evaluated in `candidates` loop (typically 25–65)
- `renderTentative_call_count`: candidate loop iterations + final render (N+1)
- `thoughtMessagesForProjection_call_count`: N+1 calls
- `allocation_elapsed_ms`: Wall-clock allocation duration if measurable without hot-path perturbation

If exact timing instrumentation would materially perturb hot-path behavior or requires broad
infrastructure, candidate count and deterministic operation-count witnesses serve as the
initial baseline. W4 must not claim measured latency reduction before timing data exists.
No external profiler framework may be introduced.

### 17.6 Derived metrics (diagnostic computation, not persisted)

```
provider_cache_hit_ratio       = cachedInputTokens / inputTokens
estimation_accuracy            = inputTokens / estimatedInputTokens
required_base_share            = required_base_estimated_tokens / estimatedInputTokens
raw_history_share              = conversation_tokens / estimatedInputTokens
provider_uncached_input_tokens = inputTokens - cachedInputTokens
```

### 17.7 Schema impact

```
NEW_DB_SCHEMA_REQUIRED=no
```

All new metrics extend existing transient receipt types (`TokenUsage`, `AllocationReceipt`)
or adapter-level types. `ModelUsage.cachedInputTokens` already exists in `model-fabric/types.ts`.

### 17.8 Qualification and dispatch laws

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window
```

```
NO_PROVIDER_DISPATCH_SAMPLES
!=
AUTHORITY_TO_DEBUG_UNRELATED_CURRENT_THOUGHT_FAILURE
```

If production observation yields zero provider dispatches:
- `provider_cache_baseline=UNAVAILABLE`
- `provider_cached_input_tokens_baseline=UNAVAILABLE`
- Status: `LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES`
- Workers must NOT debug the unrelated live failure or modify allocator/budget behavior.
- Provider-independent waves proceed normally.

---

## 18. Token Economy Ledger

### 18.1 Per-section ledger contract

Each allocation section carries:

```
section_id              AllocationSectionId
source_owner            file:symbol that produces the data
required                boolean
priority                number (from sections.ts)
wire_bytes              number (computed by structuralTokens at receipt time)
estimated_tokens        number (wire_bytes / BYTES_PER_TOKEN)

change_class            S0 | S1 | S2 | S3
cache_tier              RELEASE_STABLE | SLOW_CHANGING | DYNAMIC | PER_CYCLE

admitted                boolean
omitted                 boolean
omission_reason         budget_omission | duplicate | fuse | not_eligible
```

### 18.2 Provider usage ledger

```
provider                string (groq | nim)
model                   string (openai/gpt-oss-20b)
provider_input_tokens   number | null
provider_output_tokens  number | null
cached_input_tokens     number | null
uncached_input_tokens   number | null (derived)
reasoning_tokens        number | null
```

No private content logged.

---

## 19. Projection Economy Opportunity Register

| ID | Surface | Source Owner | Type | Source Evidence | Semantic Risk | Arch Risk | Complexity | Requires Baseline? | Requires Owner+Sol? | Wave |
|---|---|---|---|---|---|---|---|---|---|---|
| PE-1 | Contract prose duplicating schema descriptions | `output-contract.ts:253-255` | MECHANICALLY_DUPLICATED_PROSE | Schema `description` fields contain same selection rules | N/A — PROSE PRESERVED (route proof failed on Groq failover + non-v021 paths) | LOW | MEDIUM | No | NO (route proof failed) | W3 (BLOCKED — SOURCE_PROSECUTED_NO_CHANGE) |
| PE-2 | Contract verbose epistemic time guidance | `output-contract.ts:256` | GENUINE_SEMANTIC_PROSE | No schema equivalent | MEDIUM | LOW | MEDIUM | No | YES | Deferred |
| PE-3 | `staticContractHash` in wire kernel | `orientation-kernel.ts:206` | HOST_METADATA_IN_WIRE | Model does not use hash value | LOW | LOW | LOW | No | No | W2 |
| PE-4 | Fixed `canonicalStore` constant strings | `domain-pointers.ts`, `orientation-kernel.ts` | FIXED_LABEL_IN_WIRE | Constant on StableSelf; domain store on DomainPointer | LOW | LOW | LOW | Yes (need size) | DomainPointer: YES (G4); StableSelf: No | W2 (StableSelf: SOURCE_PROOF_REQUIRED; Domain: Deferred G4) |
| PE-5 | Fixed `status: "eligible"` on stableSelf pointers | `orientation-kernel.ts:174` | FIXED_LABEL_IN_WIRE | Always "eligible" by construction | LOW (if entitlement truth survives) | LOW | LOW | Yes (need size) | No | W2 (SOURCE_PROOF_REQUIRED_BEFORE_REMOVAL) |
| PE-6 | `pointerOnly` boolean IF derivable from `disposition` | Domain pointer fields | DERIVABLE_FIELD | `pointerOnly = (disposition === "POINTER_ONLY")` | LOW | LOW | LOW | Yes (verify derivability) | No | W2 (READY_IF_EXACT_DERIVATION_CONFIRMED) |
| PE-7 | System message reconstructed 25-65× per allocation | `allocator.ts:329` calls `thoughtMessagesForProjection` per candidate | HOST_COMPUTE_WASTE | Invariant across loop iterations | NONE | LOW | LOW | No | No | W4 |
| PE-8 | `mintEffectRef()` called per iteration on invariant inFlight | `allocator.ts:255-258` | HOST_COMPUTE_WASTE | Same inFlight data, same result | NONE | LOW | LOW | No | No | W4 |
| PE-9 | `orderedConversation()` re-sorts growing array per iteration | `allocator.ts:242` | HOST_COMPUTE_WASTE | Sort result only adds one element | NONE | LOW | LOW | No | No | W4 |
| PE-10 | Optional context competition (history vs retrieval vs WC) | `sections.ts` priority ordering | BUDGET_COMPETITION_POLICY | Current priorities may not be optimal | MEDIUM | MEDIUM | MEDIUM | YES (need displacement data) | YES | W5 |

---

## 20. Cache Opportunity Register

| ID | Material | Change Frequency | Invalidation Owner | Host Cache Opportunity | Provider Cache Opportunity | Current Provider Support | Cache Miss Behavior | Privacy | Complexity | Wave |
|---|---|---|---|---|---|---|---|---|---|---|
| CA-1 | System message (Thought contract) | Per release | Code schema fingerprint | Request-local memoization | Automatic prefix (current system msg) | Groq: yes. NIM: UNKNOWN | Full reconstruction | N/A (code-owned) | LOW | W0 (measure), W4 (memoize) |
| CA-2 | Orientation kernel | Identity/capability change | Identity + capability hash | Request-local memoization | If reordered before volatile (W1) | Same | Full kernel rebuild | LOW (identity data) | MEDIUM | W1 |
| CA-3 | `learnedSelfSlice` | Learned-self mutation | DB version | Request-local memoization | If reordered before volatile (W1) | Same | Full rebuild | LOW | LOW | W1 |
| CA-4 | Provider `cachedInputTokens` observation | N/A (observability) | N/A | N/A | Observe current hits | Groq: yes. NIM: UNKNOWN | N/A | N/A | LOW | W0 |
| CA-5 | Extended stable prefix (system + identity) | Identity/capability change | Composite hash | Request-local | Automatic after reorder | Same | Full prefill | Per-provider | MEDIUM | W1 |

---

## 21. Architecture Decision Records

### ADR-1 — Stable-Prefix Request Layout

**Decision:** Reorder `ProjectedThoughtInput` property construction in
`renderTentative` to place slow-changing (S1) fields before volatile (S3) fields.

**Options:**
1. **Current ordering** — cycleId/generation first, orientationKernel near end
2. **Stable-first object ordering** — orientationKernel/learnedSelf first, cycleId/generation last
3. **Separate message structure** — split stable material into a separate user message before the dynamic user message

**Source evidence:**
- `allocator.ts:236-290` — current property insertion order puts volatile first
- Provider automatic prefix caching matches byte-identical prefixes
- V8 `JSON.stringify` preserves insertion order for string keys

**Tradeoffs:**
- Option 1: No change, current system message prefix may already cache. No behavioral risk.
- Option 2: Extends cacheable prefix to include identity core. Low semantic risk (same key-value pairs). Model sees same information in different visual order — behavioral effect possible.
- Option 3: Two user messages. Higher structural change. May affect provider structured output behavior. Not supported by all providers identically.

**Recommendation:** Option 2. Same source facts, maximum prefix extension, minimal structural change.

**What would change the decision:** If W0 shows current system-message-only prefix caching is already providing substantial benefit and extended prefix adds marginal value.

**OWNER_SOL_DECISION_REQUIRED:** No (direction accepted in adjudication). Behavioral qualification required.

---

### ADR-2 — Provider Cache Strategy

**Decision:** Use automatic prefix caching only. Do not add explicit cache keys
or cache control parameters.

**Options:**
1. **Automatic only** — rely on byte-identical prefix matching
2. **Explicit cache key** — send `prompt_cache_key` (Mistral) or `session_id` (OpenRouter)
3. **Provider-specific hybrid** — auto for Groq/NIM, explicit for Mistral

**Source evidence:**
- Groq: automatic prefix caching, no API parameter needed
- NIM: cache support UNKNOWN
- Mistral: supports `prompt_cache_key` but not current Thought provider
- Current adapters send zero cache parameters

**Tradeoffs:**
- Option 1: Simplest. Works for Groq. May work for NIM. No adapter changes needed for cache control. Only needs usage-parsing changes.
- Option 2: Requires per-provider adapter changes. Cache key management. May provide better hit rates.
- Option 3: Maximum provider-specific optimization. Most complex.

**Recommendation:** Option 1 for this programme. Re-evaluate if Thought routes to a provider requiring explicit keys.

**What would change the decision:** If W0/W6 shows automatic caching is not engaging on the current provider, or if Thought routes to Mistral.

**OWNER_SOL_DECISION_REQUIRED:** No.

---

### ADR-3 — Host Cache Granularity

**Decision:** Request-local memoization first (W4). Cross-cycle compiled core
only if W4 profiling shows significant measured residual.

**Options:**
1. **None** — accept current per-candidate rebuild cost
2. **Request-local memoization** — cache invariant computations within single allocation call
3. **Cross-cycle compiled core** — new `CompiledThoughtCore` module, invalidation logic, cross-cycle memory

**Source evidence:**
- System message reconstructed N+1 times per allocation (N=25-65 candidates)
- `thoughtOutputCompatibilityInstruction()` generates from code constants — deterministic
- `loadNuclearSystemPrompt()` reads files — I/O per invocation
- Each call produces ~0.6-3.2 MB transient JSON strings
- Current allocation already runs in single synchronous function scope

**Tradeoffs:**
- Option 1: No change. Allocation latency may be measurable but not blocking.
- Option 2: Memoize system message + stable elements within allocation call. Simple. No cross-cycle invalidation needed. No concurrency risk.
- Option 3: Avoids file reads and string generation across cycles. Needs invalidation logic. Must prove concurrency safety. More complex.

**Recommendation:** Option 2. Measure after. Only pursue Option 3 if measured residual justifies it.

**What would change the decision:** If W4 profiling shows allocation latency is a meaningful contributor to Thought TTFT, and request-local memoization doesn't eliminate it.

**OWNER_SOL_DECISION_REQUIRED:** No for Option 2. Yes for Option 3 if later proposed.

---

### ADR-4 — Raw History / Optional Context Economy

**Decision:** Investigate optional context competition using W0 baseline data.
Do not reduce `DEFAULT_LAST_N_TURNS`.

**Options:**
1. **Fixed count reduction** (12→8) — REJECTED by Owner+Sol
2. **Current token-driven admission** — keep current priorities as-is
3. **Priority/competition reordering** — adjust section priorities based on evidence
4. **Section budget caps** — reserve bounded capacity for selected categories
5. **Dynamic competition rules** — adapt priorities based on available headroom

**Source evidence:**
- Current priorities: `sections.ts` — trigger(2), frontier(5), recent_raw(6), WC-required(12-15), WC-optional(16-17), retrieval(18), C3(18)
- Budget-driven admission already works: `allocator.ts:339-379`
- Unknown: which sections are regularly starved, actual displacement patterns

**Tradeoffs:**
- Option 1: Prohibited — replaces one magic count with another
- Option 2: May already be optimal — unknown until measured
- Option 3: Evidence-driven, but needs displacement data
- Option 4: Could guarantee retrieval/WC gets space, but adds complexity
- Option 5: Most adaptive, most complex

**Recommendation:** MEASURE FIRST (W0). Then evaluate Options 2-4 with evidence.

**What would change the decision:** W0 data showing specific sections systematically starved.

**OWNER_SOL_DECISION_REQUIRED:** Yes — after W0 evidence is available.

---

### ADR-5 — Thought Contract Economy

**Decision:** Remove only mechanically duplicated prose where route proof confirms
all paths receive equivalent schema guidance. Genuine semantic prose requires
separate review.

**Options:**
1. **Retain all prose** — no risk, no saving
2. **Remove schema-duplicated prose only** — requires route proof
3. **Broader semantic compression** — rewrite verbose instructions

**Source evidence:**
- `output-contract.ts:253-255` — semantic selection rules prose
- `output-contract.ts:154-179` — schema `description` fields contain same rules
- `thoughtOutputStructuredRequest()` returns full schema with descriptions
- Primary route (NIM): uses `guided_json` or `json_schema` — must verify
- Failover route (Groq): must verify schema guidance delivery
- Structural retry: must verify correction maintains schema

**Tradeoffs:**
- Option 1: Safe. No reduction.
- Option 2: Moderate saving. Requires proving every dispatch path delivers schema descriptions. Source-closed if proven.
- Option 3: Larger saving but risks model behavior change. Not source-closed.

**Classification of contract instructions:**

| Instruction (line) | Classification |
|---|---|
| L251: Contract/schema identifiers | UNIQUE_SEMANTIC_REQUIREMENT |
| L252: Permitted kinds/forms listing | UNIQUE_SEMANTIC_REQUIREMENT |
| L253: Semantic selection rules | DUPLICATED_BY_SCHEMA (if schema descriptions delivered) |
| L254: Settlement placeholder warning | DUPLICATED_BY_SCHEMA (settlement description) |
| L255: Observation_intent caveat | GENUINE_SEMANTIC_PROSE (more specific than schema description) |
| L256: Epistemic time guidance | UNIQUE_SEMANTIC_REQUIREMENT |
| L257: Capability reality semantics | UNIQUE_SEMANTIC_REQUIREMENT |
| L258: Semantic class binding | UNIQUE_SEMANTIC_REQUIREMENT |
| L259: CapabilityReality field semantics | UNIQUE_SEMANTIC_REQUIREMENT |
| L260: Forbidden kernel/lifecycle fields | UNIQUE_SEMANTIC_REQUIREMENT |
| L261: Required settlement sections | UNIQUE_SEMANTIC_REQUIREMENT |
| L262: Speech shape | UNIQUE_SEMANTIC_REQUIREMENT |
| L263: mustSay contract | UNIQUE_SEMANTIC_REQUIREMENT |
| L264: Commitments required fields | UNIQUE_SEMANTIC_REQUIREMENT |
| L265: Forbidden publication fields | UNIQUE_SEMANTIC_REQUIREMENT |
| L266: Contract scope statement | UNIQUE_SEMANTIC_REQUIREMENT |

**Recommendation:** ROUTE PROOF FAILED. W3 is **SOURCE_PROSECUTED_NO_CHANGE** and **BLOCKED from implementation**.
Groq failover dispatches `{ type: "json_object" }` with zero schema descriptions, and non-v021 paths lack structured output.
Prompt prose is the only kind-selection guidance available to Thought on Groq failover.
All contract prose lines are PRESERVED. No implementation authorized.

**What would change the decision:** If Groq gains native schema support or Thought routing changes (see §26 reopening conditions).

**OWNER_SOL_DECISION_REQUIRED:** No for current blocked status. Yes if reopening is ever proposed.

---

### ADR-6 — Pointer Metadata Compaction

**Decision:** Field-by-field source prosecution required. No blanket removal.

**Governing Law:**
```
DERIVABLE_BOOLEAN_REMOVAL_ALLOWED_ONLY_IF_RETAINED_FIELD_FULLY_PRESERVES_TRUTH
```

Do NOT infer "constant → zero cognitive information" broadly. `canonicalStore` carries provenance.
`status="eligible"` may carry entitlement/currentness meaning.

**Per-field assessment:**

| Field | Source Owner | Cognitive Purpose | Derivable? | Duplicated? | Model Needs It? | Status / Disposition | Token Saving |
|---|---|---|---|---|---|---|---|
| `disposition` | domain-pointers.ts | YES — EMPTY/POINTER_ONLY/UNREACHABLE truth | No | No | YES | **PRESERVE (MANDATORY)** | — |
| `canonicalStore` | domain-pointers.ts | Host metadata — where data lives | No | No | UNKNOWN | DEFERRED (Gate G4) | ~15 tokens × 9 domains = ~135 |
| `pointerOnly` | domain-pointers.ts | Convenience boolean | YES: `disposition === "POINTER_ONLY"` | YES (derivable) | UNKNOWN | **READY_IF_EXACT_DERIVATION_CONFIRMED** | ~5 tokens × 9 = ~45 |
| `status` on StableSelfPointer | orientation-kernel.ts | "eligible" | Constant in constructor | No | UNKNOWN | **SOURCE_PROOF_REQUIRED_BEFORE_REMOVAL** | ~5 tokens × remainder |
| `canonicalStore` on StableSelfPointer | orientation-kernel.ts | "nuclear.db:identity_entries" | Constant in constructor | No | UNKNOWN | **SOURCE_PROOF_REQUIRED_BEFORE_REMOVAL** | ~15 tokens × remainder |

**Mechanical Source Prosecution Protocol for StableSelf Fields:**
Before implementation removes either `canonicalStore` or `status` on `StableSelfPointer`:
1. `FIELD`: Identify exact field (`canonicalStore` or `status`).
2. `RIGHTFUL_SOURCE_OWNER`: `orientation-kernel.ts` (`clonePointer`).
3. `MEANING`: Provenance for `canonicalStore`; entitlement/eligibility for `status`.
4. `PROVEN_CONSTANT?`: Verify whether value is invariant across all code paths.
5. `PROVEN_DERIVABLE?`: Check if mechanically derivable from other retained model-visible fields.
6. `IS_PROVENANCE?`: Determine if downstream Thought reasoning or validation depends on provenance.
7. `IS_ENTITLEMENT/CURRENTNESS?`: Determine if `eligible` status conveys validity to the model.
8. `DOES_EQUIVALENT_MODEL_VISIBLE_TRUTH_SURVIVE_ELSEWHERE?`: Source-prove survival in orientation kernel or other visible fields.
9. `CAN_REMOVE?`: Only YES if survival of equivalent truth is proven without semantic loss.

**Execution Rule:**
- `DomainPointer.pointerOnly`: **READY_IF_EXACT_DERIVATION_CONFIRMED** (`pointerOnly === (disposition === "POINTER_ONLY")`).
- `StableSelfPointer.canonicalStore`: **SOURCE_PROOF_REQUIRED_BEFORE_REMOVAL**.
- `StableSelfPointer.status`: **SOURCE_PROOF_REQUIRED_BEFORE_REMOVAL**.
- If bounded source prosecution confirms equivalent semantic/provenance/currentness truth survives elsewhere: remove as specified (make non-enumerable).
- If source proof does NOT confirm: **PRESERVE, REPORT_NO_CHANGE, and CONTINUE W2**.
- No Owner/Sol interruption is required merely to preserve the fields.
- If removal would require a new semantic policy decision: **STOP THAT SUBCHANGE, OWNER_SOL_ADJUDICATION_REQUIRED**.

**OWNER_SOL_DECISION_REQUIRED:** No for bounded source prosecution of StableSelf fields. Yes for `canonicalStore` on DomainPointer (Gate G4).

---

### ADR-7 — 9500 Envelope Calibration

**Decision:** Frozen during this programme. Re-evaluate after W7 measurement.

```
SEMANTIC_PROJECTION_ENVELOPE=9500 (unchanged)
```

**Options:**
1. Keep 9500
2. Lower after economy gains free headroom
3. Raise if provider capacity permits
4. Dynamic envelope based on route/provider

**Recommendation:** Keep 9500. Revisit in W7 with production data.

**OWNER_SOL_DECISION_REQUIRED:** Yes — when W7 data is available.

---

### ADR-8 — Cache Observability Persistence

**Decision:** Extend existing transient receipt types. No new persistent DB schema.

**Options:**
1. **Extend existing receipts** — add fields to `TokenUsage`, populate `ModelUsage.cachedInputTokens`
2. **New persistent token_economy table** — track historical token distributions
3. **Diagnostic endpoint additions** — expose via existing `/nuclear/` diagnostics

**Source evidence:**
- `ModelUsage.cachedInputTokens` already exists in type system
- `AllocationTokenBreakdown` already records 12 section-level fields
- Receipt infrastructure persists via Model Fabric

**Recommendation:** Option 1. If persistent tracking needed later, requires separate adjudication.

**OWNER_SOL_DECISION_REQUIRED:** No for Option 1. Yes for Option 2.

---

## 22. Programme Dependency Graph

```
W0 (Token + Cache + Projection Baseline Observability)
├── W1 (Stable-Prefix Reordering)        — depends on W0 baseline
├── W2 (Wire Field Compaction)            — independent of W1 (source-gated)
├── W3 (Thought Contract Economy)         — SOURCE_PROSECUTED_NO_CHANGE (BLOCKED)
├── W4 (Request-Local Compute Economy)    — independent of W1 (depends on W0)
│
W0 + measurements
└── W5 (Optional Context Economy)         — depends on W0 evidence + Gate G1

W0 + W1 + provider truth
└── W6 (Provider Cache Qualification)     — depends on W0 + W1 (may be qualification-only)

All accepted implemented waves (W0, W1, W2, W4, and W5/W6 if qualified)
└── W7 (Programme Qualification)          — evaluates accepted set; records W3 as no-change
```

W2 and W4 can execute in parallel after W0, independent of W1.
W1 proceeds after W0 baseline measurements are available.
W3 was investigated, route proof failed, and is **SOURCE_PROSECUTED_NO_CHANGE** — it is not an implementation wave, does not deploy, and does not block any other wave.
W5 requires W0 empirical displacement evidence and Owner+Sol adjudication (Gate G1).
W6 requires W0 provider investigation + W1 prefix reordering (may remain live-qualification pending if no provider-dispatched samples exist).
W7 is the final programme gate evaluating only the accepted set of actually implemented waves.

---

## 23. Wave W0 — TOKEN + CACHE + PROJECTION BASELINE OBSERVABILITY

```
WAVE_ID:     W0
TITLE:       Token + Cache + Projection Baseline Observability
STATUS:      READY_FOR_IMPLEMENTATION
PURPOSE:     EMPIRICAL PROGRAMME BASELINE
```

### GOAL

Establish the empirical baseline for the entire programme:
1. **Provider Usage Baseline**: Where provider tokens go, what is cached, what Groq/NIM actually report.
2. **Projection Economy Baseline**: Exact section-level token and byte distributions, stable-prefix geometry, optional-context displacement patterns, and Host allocation compute profile.

### WHY_THIS_WAVE_EXISTS

Cannot evaluate or qualify any subsequent wave without observing current empirical truth.
Later waves directly depend on W0 baseline data:
- W1 depends on W0 stable-prefix measurement and provider cache baseline.
- W2 depends on W0 section token breakdown for pointer size comparisons.
- W4 depends on W0 allocation candidate and operation profile.
- W5 depends on W0 optional-context displacement evidence.
- W6 depends on W0 provider usage and cache observation.

### RIGHTFUL_OWNER

Model Fabric receipts + provider adapters + allocation diagnostic observers

### SOURCE_PRECONDITIONS

HEAD at `808e6a08`. No prior programme wave landed.

### SCOPE SPECIFICATION

#### A. Provider Usage Baseline
- Parse `prompt_tokens_details.cached_tokens` from Groq responses into `TokenUsage.cachedTokens`.
- Parse `prompt_tokens_details.cached_tokens` from NIM responses when present into `TokenUsage.cachedTokens`.
- Populate `ModelUsage.cachedInputTokens` in `receipts.ts` from `usage?.cachedTokens ?? null`.
- Derive `provider_uncached_input_tokens` diagnostically as `inputTokens - cachedInputTokens`.
- Report NIM status separately:
  `NIM_CACHED_USAGE_FIELD_OBSERVED=<yes/no>`
  `NIM_PROVIDER_CACHE_SUPPORT=<confirmed/unsupported/unknown>`
  (Absence of field means `NOT_OBSERVED`; do not infer unsupported from null usage alone).
- **Prohibitions**: No new provider request parameter; no cache-control header; no provider behavior change.

#### B. Projection Economy Baseline
- Establish mechanical baseline across cycles for:
  - `system_message_bytes` and `system_message_estimated_tokens`
  - `orientation_kernel_bytes` and `orientation_kernel_estimated_tokens`
  - `required_base_estimated_tokens`
  - `optional_context_estimated_tokens`
  - `conversation_estimated_tokens` (reuse `AllocationTokenBreakdown.conversation_tokens`)
  - `working_context_estimated_tokens` (reuse `AllocationTokenBreakdown.working_context_tokens`)
  - `domain_pointer_estimated_tokens` (reuse `AllocationTokenBreakdown.domain_pointer_tokens`)
  - `learned_self_estimated_tokens` (reuse `AllocationTokenBreakdown.learned_self_tokens`)
  - `retrieval_estimated_tokens` (reuse `AllocationTokenBreakdown.retrieval_tokens`)
  - `observations_estimated_tokens` (reuse `AllocationTokenBreakdown.observations_tokens`)
  - `in_flight_estimated_tokens` (reuse `AllocationTokenBreakdown.in_flight_effect_tokens`)
  - `omitted_for_budget_tokens` and `omitted_for_budget_count` (reuse existing breakdown fields)
  - `headroom_tokens` (reuse `AllocationReceipt.headroomTokens`)
- Where `AllocationTokenBreakdown` provides an equivalent metric: **REUSE EXISTING METRIC**. Do not duplicate.
- Where exact bytes are derived: **COMPUTE DIAGNOSTICALLY**. Do not introduce persistent schema.

#### C. Stable-Prefix Baseline
- Measure/derive for current request layout:
  - `system_prefix_bytes` and `system_prefix_estimated_tokens`
  - `candidate_S0_S1_prefix_bytes` and `candidate_S0_S1_prefix_estimated_tokens`
  - `first_volatile_field` (`"cycleId"` at position 1) and `first_volatile_byte_offset`
- **Content Logging Prohibition**: Counts, byte lengths, hashes, and field identities only. Do not log prompt text.

#### D. Optional-Context Displacement Baseline (for W5)
- Provide mechanical evidence to answer:
  - Which optional sections are admitted
  - Which optional sections are omitted
  - Omission reason (`budget_omission`, `duplicate`, `fuse`, `not_eligible`)
  - Section priority (from `sections.ts`)
  - Estimated token demand per section
  - Starvation detection: whether lower-priority optional sections (retrieval, optional WC, C3) are systematically omitted
- Reuses existing `AllocationDecision` (`included`/`omitted` arrays). No subjective "value score."

#### E. Allocation Performance Baseline (for W4)
- Establish measurement for Host allocation cost:
  - `allocation_candidate_count`: candidates evaluated in candidate loop (typically 25–65)
  - `renderTentative_call_count`: candidate loop iterations + final render (N+1)
  - `thoughtMessagesForProjection_call_count`: N+1 calls
  - `allocation_elapsed_ms`: Wall-clock allocation duration if measurable without hot-path perturbation
- Candidate count and deterministic operation-count witnesses serve as the initial baseline if timing would perturb execution. W4 must not claim measured latency reduction before timing data exists. No profiler framework.

### FILES_EXPECTED_TO_CHANGE

```
apps/agent-service/src/core/model-routing/types.ts
apps/agent-service/src/core/model-routing/adapters/groq-adapter.ts
apps/agent-service/src/core/model-routing/adapters/nim-adapter.ts
apps/agent-service/src/core/model-fabric/receipts.ts
```

*(Allocation diagnostic metrics reuse existing `receipt.ts` / `allocator.ts` structures; transient diagnostic logging added where required).*

### SYMBOLS_EXPECTED_TO_CHANGE

```
TokenUsage (types.ts:63-68)
  ADD: cachedTokens?: number

GroqUsage (groq-adapter.ts:33-37)
  ADD: prompt_tokens_details?: { cached_tokens?: number }
toTokenUsage (groq-adapter.ts:45-59)
  PARSE: prompt_tokens_details.cached_tokens → cachedTokens

NimUsage (nim-adapter.ts:37-42)
  ADD: prompt_tokens_details?: { cached_tokens?: number }
toTokenUsage (nim-adapter.ts:50-64)
  PARSE: prompt_tokens_details.cached_tokens → cachedTokens

usageFor (receipts.ts:104-112)
  POPULATE: cachedInputTokens from usage.cachedTokens (instead of hardcoded null)
```

### EXACT_MECHANICAL_CHANGE

1. ADD optional `cachedTokens?: number` to `TokenUsage` type
2. In Groq adapter `GroqUsage` type: ADD `prompt_tokens_details?: { cached_tokens?: number }`
3. In Groq adapter `toTokenUsage`: PARSE `prompt_tokens_details.cached_tokens` when present, populate `cachedTokens` on `TokenUsage`
4. In NIM adapter `NimUsage` type: ADD `prompt_tokens_details?: { cached_tokens?: number }`
5. In NIM adapter `toTokenUsage`: PARSE `prompt_tokens_details.cached_tokens` when present, populate `cachedTokens` on `TokenUsage`
6. In `receipts.ts` `usageFor`: POPULATE `cachedInputTokens` from `usage?.cachedTokens ?? null` (instead of hardcoded `null`)
7. Collect baseline diagnostic projections from existing `AllocationReceipt` / `AllocationTokenBreakdown` during production observation.

### SOURCE_SEMANTICS_CHANGED

No

### MODEL_VISIBLE_PRESENTATION_CHANGED

No

### PROVIDER_BEHAVIOR_CHANGED

No (no new parameters sent to provider)

### LOGICAL_TOKEN_EFFECT

None

### HOST_COMPUTE_EFFECT

Negligible (field parsing and existing receipt telemetry)

### PROVIDER_CACHE_EFFECT

Observability only — no cache parameter added

### INVARIANTS

```
Thought semantic output: UNCHANGED
Allocation logic: UNCHANGED
Request body to provider: UNCHANGED
Existing receipt consumers: UNAFFECTED (null → number|null is compatible)
System message: UNCHANGED
User message: UNCHANGED
```

### PROHIBITED_CHANGES

```
Changing allocation logic
Adding provider request parameters
Changing provider request body
Adding persistent DB schema
Sending cache control headers
Modifying system or user messages
Adding external profiler framework
Debugging unrelated live Thought failures
```

### TARGETED_TESTS

```
Unit: Groq toTokenUsage parses cached_tokens when present in prompt_tokens_details
Unit: Groq toTokenUsage returns undefined cachedTokens when field absent
Unit: NIM toTokenUsage parses cached_tokens when present
Unit: NIM toTokenUsage returns undefined cachedTokens when field absent
Unit: usageFor populates cachedInputTokens from cachedTokens
Unit: usageFor sets cachedInputTokens null when cachedTokens absent
Unit: existing usage parsing unchanged for promptTokens/completionTokens/reasoningTokens
```

### NEGATIVE_TESTS

```
Missing prompt_tokens_details → cachedTokens undefined → cachedInputTokens null
Non-numeric cached_tokens → cachedTokens undefined → cachedInputTokens null
prompt_tokens_details present but cached_tokens absent → cachedInputTokens null
```

### GOLDEN_TESTS

```
Existing adapter test fixtures: identical behavior for all non-cache fields
```

### OBSERVABILITY_WITNESS

```
After deployment: ModelUsage.cachedInputTokens populated with non-null values
  from Groq responses (if automatic prefix caching is engaging)
If NIM reports cached tokens: same
If provider does not report: cachedInputTokens remains null (backward compatible)
NIM reporting explicitly records NIM_CACHED_USAGE_FIELD_OBSERVED and NIM_PROVIDER_CACHE_SUPPORT
Baseline distributions recorded for all Section 17 metrics
```

### PRODUCTION_QUALIFICATION

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window (≥24h secondary guard)

Record in return ledger:
  sample_count (total successful Thought cycles observed)
  provider_dispatch_count (successful provider completions)
  wake_type_distribution (reactive, idle, curiosity, etc.)
  provider_distribution (Groq vs NIM)
  elapsed_window (start time to end time)
  provider_input_tokens distribution (p50, p95)
  provider_cached_input_tokens distribution (may be null/zero)
  provider_uncached_input_tokens distribution
  estimation_accuracy = provider_input / estimated_input
  system_prefix_bytes and estimated tokens
  orientation_kernel_estimated_tokens
  required_base_share and raw_history_share
  headroom_tokens distribution
  omitted_for_budget_count and section displacement patterns
  allocation candidate count and operation count profile
```

### NO-PROVIDER-DISPATCH LAW

```
NO_PROVIDER_DISPATCH_SAMPLES
!=
AUTHORITY_TO_DEBUG_UNRELATED_CURRENT_THOUGHT_FAILURE
```

If production observation yields `provider_dispatch_count = 0` or insufficient provider-dispatched
samples:
- `provider_cache_baseline = UNAVAILABLE`
- `provider_cached_input_tokens_baseline = UNAVAILABLE`
- Qualification status: `LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES`
- Do NOT diagnose why Thought failed to reach the provider.
- Do NOT patch the unrelated live failure.
- Do NOT raise 9500 or alter allocator behavior.
- **Continue provider-independent waves whose prerequisites are satisfied:**
  - W2 proceeds if its source gates pass.
  - W4 proceeds if W0 local/mechanical profiling data is sufficient.
  - W3 remains no-change / blocked.
  - W5 remains gated on actual optional-context displacement evidence (Gate G1).
  - W1 may be implemented if source prerequisites are met (live cache qualification remains pending).
  - W6 remains PENDING until provider-dispatched samples exist.

### ROLLBACK

Revert adapter changes and receipts.ts. `cachedInputTokens` returns to always-null.
Dependent qualification evidence relying on W0 instrumentation is invalidated if W0 is reverted.

### STOP_CONDITIONS

```
Provider response format change breaks existing usage parsing
Test failures on existing adapter behavior
```

### ACCEPTANCE_CRITERIA

```
All existing adapter tests pass
New cache-token parsing tests pass
Production observation records required sample counts and baseline distributions
OR confirms provider does not report cached tokens / no dispatches reached provider
Status explicitly reported as QUALIFIED or LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES
```

### DEPENDENCIES

None

### OWNER_SOL_ADJUDICATION_REQUIRED

No

---

## 24. Wave W1 — DETERMINISTIC STABLE-PREFIX LAYOUT

```
WAVE_ID:     W1
TITLE:       Deterministic Stable-Prefix Layout
STATUS:      READY_FOR_IMPLEMENTATION (after W0 baseline)
```

### GOAL

Extend exact shared provider prefix as far as source truth permits by reordering
`ProjectedThoughtInput` property construction.

### WHY_THIS_WAVE_EXISTS

Current volatile fields at JSON positions 1-2 prevent provider automatic prefix
caching from extending into the user message. Moving stable identity material
before volatile cycle data maximizes cacheable prefix.

### RIGHTFUL_OWNER

Projection allocator

### SOURCE_PRECONDITIONS

W0 landed. Baseline measurements available.

### FILES_EXPECTED_TO_CHANGE

```
apps/agent-service/src/core/cognitive-v021/thought/projection-allocator/allocator.ts
```

### SYMBOLS_EXPECTED_TO_CHANGE

```
renderTentative (allocator.ts:220-296)
  REORDER: property construction to place S1 fields first, S3 fields last
```

### EXACT_MECHANICAL_CHANGE

In `renderTentative` (allocator.ts:236-290), change property insertion order from:

```
BEFORE: cycleId, generation, occupantId, authorityEpoch, trigger, rawConversation, ...
        ..., orientationKernel, domainPointers
```

to:

```
AFTER:  orientationKernel, learnedSelfSlice, occupantId, authorityEpoch,
        workingContext, occupancy, domainPointers, rawConversation, retrieval,
        cycleId, generation, trigger, observations, inFlight,
        authorityObjections, runtimeCondition, rememberDirective,
        conversationSelection, c3Experiences
```

No field added. No field removed. No value changed.

### SOURCE_SEMANTICS_CHANGED

No — same key-value pairs in JSON object.

### MODEL_VISIBLE_PRESENTATION_CHANGED

**YES** — model sees tokens in different visual order.

### PROVIDER_BEHAVIOR_CHANGED

Potential: provider prefix cache may now match deeper into user message.

### LOGICAL_TOKEN_EFFECT

None (same content)

### HOST_COMPUTE_EFFECT

Negligible

### PROVIDER_CACHE_EFFECT

Extended prefix: system message + identity core (~S0+S1 material) now
byte-identical across consecutive cycles with same identity.

### INVARIANTS

```
SOURCE_FACT_SET_CHANGED: no
SOURCE_AUTHORITY_CHANGED: no
MODEL_VISIBLE_PRESENTATION_ORDER_CHANGED: yes
Same key-value pairs in ProjectedThoughtInput
Same token estimate (same bytes, different order)
Same allocation decisions (same budget logic)
Same required/optional classification
Current trigger: REQUIRED (unchanged)
Frontier: PRESERVED (unchanged)
Disposition truth: PRESERVED (unchanged)
```

### PROHIBITED_CHANGES

```
Adding or removing fields
Changing field values
Changing serialization format
Changing allocation logic
Changing budget enforcement
Changing required/optional classification
```

### TARGETED_TESTS

```
Unit: renderTentative output contains all expected keys (key-set equality)
Unit: modelVisibleThoughtProjection excludes same fields as before
Serialization: same input → same key-value pairs (order differs)
Prefix: two cycles with same identity/capability/contract → byte-identical
  prefix from start through end of orientationKernel serialization
```

### NEGATIVE_TESTS

```
Identity change → S1 prefix changes (prefix MUST invalidate)
Static contract change → S0 prefix changes
Different trigger → prefix unchanged through S1 boundary
Different cycleId → prefix unchanged through S1 boundary
```

### GOLDEN_TESTS

```
Before/after: same ThoughtInput → semantically identical projected output
  (key sets identical, values identical, order differs)
```

### OBSERVABILITY_WITNESS

```
dispatchMessagesHash: EXPECTED TO CHANGE (different key ordering = different bytes)
semanticProjectionHash: EXPECTED TO CHANGE IF HASH IS BYTE-ORDER SENSITIVE
After deployment:
  Compare provider_cached_input_tokens before/after W1
  If caching extends: cachedInputTokens should increase
```

### PRODUCTION_QUALIFICATION

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window (≥48h secondary guard)

Record in return ledger:
  sample_count (total successful Thought cycles observed)
  provider_dispatch_count (successful provider completions)
  wake_type_distribution where relevant
  provider_distribution where relevant
  elapsed_window
  Thought output structural parse failure rate (must not increase)
  provider_cached_input_tokens distribution (compare to W0 baseline)
  Thought behavioral quality (Owner qualitative observation)
  Any Thought semantic regression signals
```

Distinguish:
- `IMPLEMENTATION_ACCEPTANCE`: Granted when unit tests, key-set equality tests, and prefix determinism tests pass.
- `LIVE_PROVIDER_CACHE_QUALIFICATION`: Requires representative successful provider-dispatched samples. If no provider dispatches exist due to unrelated current Thought failure:
  Status: `LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES`.
  This does NOT block implementation acceptance or downstream provider-independent waves.

### ROLLBACK

Revert `renderTentative` key ordering. Hashes return to pre-W1 values.
Dependent qualification evidence (e.g. W6 cache qualification against W1) is invalidated if W1 is rolled back.

### STOP_CONDITIONS

```
Increased Thought structural parse failure rate
Owner-reported cognitive regression
Model behavioral quality degradation
```

### ACCEPTANCE_CRITERIA

```
All existing Thought tests pass
Prefix determinism tests pass
No increase in Thought parse failure rate
No Owner-reported cognitive regression
W0 vs W1 cachedInputTokens comparison recorded (or LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES explicitly noted)
```

### DEPENDENCIES

W0 (baseline measurements)

### OWNER_SOL_ADJUDICATION_REQUIRED

No (direction accepted). Behavioral qualification required.

---

## 25. Wave W2 — SOURCE-CLOSED WIRE FIELD COMPACTION

```
WAVE_ID:     W2
TITLE:       Source-Closed Wire Field Compaction
STATUS:      READY_FOR_IMPLEMENTATION (after W0; field-level source gates apply)
```

### GOAL

Remove provably constant, derivable, or Host-only metadata from serialized
Thought projection. Field-by-field source prosecution, not blanket removal.

### GOVERNING LAW

```
DERIVABLE_BOOLEAN_REMOVAL_ALLOWED_ONLY_IF_RETAINED_FIELD_FULLY_PRESERVES_TRUTH
```

Do NOT infer "constant → zero cognitive information" broadly. `canonicalStore` carries
provenance. `status="eligible"` may carry entitlement/currentness meaning.

### WHY_THIS_WAVE_EXISTS

Some serialized fields carry zero distinct cognitive information because they are
purely derivable convenience booleans or because equivalent provenance/currentness truth
is proven to survive elsewhere in the model-visible context.

### RIGHTFUL_OWNER

Orientation kernel + domain pointers

### SOURCE_PRECONDITIONS

W0 landed (for baseline size comparison).

### FIELD-LEVEL STATUS & EXECUTION RULES

```
DomainPointer.pointerOnly:
  READY_IF_EXACT_DERIVATION_CONFIRMED (pointerOnly === (disposition === "POINTER_ONLY"))

StableSelfPointer.canonicalStore:
  SOURCE_PROOF_REQUIRED_BEFORE_REMOVAL

StableSelfPointer.status:
  SOURCE_PROOF_REQUIRED_BEFORE_REMOVAL

DomainPointer.canonicalStore:
  DEFERRED PENDING INVESTIGATION (Gate G4)

DomainPointer.disposition:
  PRESERVE (MANDATORY ARCHITECTURAL TRUTH)
```

### MECHANICAL SOURCE PROSECUTION PROTOCOL (StableSelfPointer fields)

Before implementation removes either `canonicalStore` or `status` from model-visible
serialization, the implementation worker must mechanically prosecute:
1. `FIELD`: Specific target field (`canonicalStore` or `status`).
2. `RIGHTFUL_SOURCE_OWNER`: `orientation-kernel.ts` (`clonePointer`).
3. `MEANING`: Provenance for `canonicalStore`; entitlement/eligibility for `status`.
4. `PROVEN_CONSTANT?`: Verify whether value is invariant across all runtime paths.
5. `PROVEN_DERIVABLE?`: Check if mechanically derivable from other retained model-visible fields.
6. `IS_PROVENANCE?`: Determine if downstream Thought reasoning depends on knowing the store.
7. `IS_ENTITLEMENT/CURRENTNESS?`: Determine if `status: "eligible"` conveys validity to the model.
8. `DOES_EQUIVALENT_MODEL_VISIBLE_TRUTH_SURVIVE_ELSEWHERE?`: Source-prove survival in orientation kernel or visible context.
9. `CAN_REMOVE?`: Only YES if equivalent truth survives without semantic loss.

**Autonomous Campaign Execution Rule:**
- If equivalent semantic/provenance/currentness truth is mechanically proven elsewhere:
  **remove as specified** (use `Object.defineProperty` / `Object.defineProperties` to make non-enumerable).
- If source proof does NOT confirm equivalent truth survives:
  **PRESERVE, REPORT_NO_CHANGE, and CONTINUE W2**.
- No Owner/Sol interruption is required merely to preserve the fields.
- If removal would require a new semantic policy decision:
  **STOP THAT SUBCHANGE, OWNER_SOL_ADJUDICATION_REQUIRED**.

### FILES_EXPECTED_TO_CHANGE

```
apps/agent-service/src/core/cognitive-v021/thought/orientation-kernel.ts
apps/agent-service/src/core/cognitive-v021/thought/domain-pointers.ts
```

### SYMBOLS_EXPECTED_TO_CHANGE

```
clonePointer (orientation-kernel.ts:168-176)
  MAKE NON-ENUMERABLE: canonicalStore, status (IF source-proven)

pointerFromRows (domain-pointers.ts:72-99)
  MAKE NON-ENUMERABLE: pointerOnly (IF exact derivation confirmed)
```

### EXACT_MECHANICAL_CHANGE

1. In `pointerFromRows` (domain-pointers.ts:78-99): confirm exact derivation
   `pointerOnly === (disposition === "POINTER_ONLY")`. Use `Object.defineProperty`
   to make `pointerOnly` non-enumerable on `DomainPointer`.
2. In `clonePointer` (orientation-kernel.ts:168-176): prosecute `canonicalStore`
   and `status` per protocol. If proven safe, use `Object.defineProperties` to make
   non-enumerable; otherwise preserve.
3. PRESERVE `disposition` as enumerable — it carries essential cognitive truth
   (EMPTY / POINTER_ONLY / UNREACHABLE).
4. PRESERVE `canonicalStore` on DomainPointer as enumerable (Gate G4).

### SOURCE_SEMANTICS_CHANGED

Yes — model no longer sees fields made non-enumerable in serialized projection.

### MODEL_VISIBLE_PRESENTATION_CHANGED

Yes — qualified fields omitted from wire JSON.

### PROVIDER_BEHAVIOR_CHANGED

No

### LOGICAL_TOKEN_EFFECT

Reduction: ~25–50 estimated tokens (small but source-closed).

### HOST_COMPUTE_EFFECT

Negligible

### PROVIDER_CACHE_EFFECT

Smaller identity prefix (when combined with W1).

### INVARIANTS

```
disposition truth: PRESERVED on DomainPointer (MANDATORY)
canonicalStore: PRESERVED on DomainPointer (Gate G4)
entityIds: PRESERVED
status on DomainPointer: PRESERVED (not the same as StableSelfPointer status)
Coverage manifest: UNAFFECTED (already non-enumerable)
Receipt readers: UNAFFECTED (access properties directly, not via JSON.parse)
Host in-process access: PRESERVED (properties exist, just non-enumerable)
```

### PROHIBITED_CHANGES

```
Removing disposition from DomainPointer serialization
Removing entityIds
Removing domain name
Removing updatedAtMs
Removing status from DomainPointer
Removing StableSelf fields without source-closed survival proof
Changing any field values
```

### TARGETED_TESTS

```
Unit: StableSelfPointer serializes without canonicalStore/status IF proven safe
Unit: StableSelfPointer still has canonicalStore/status accessible directly
Unit: DomainPointer serializes without pointerOnly (if derivation confirmed)
Unit: DomainPointer still has pointerOnly accessible directly
Unit: DomainPointer disposition still serializes (EMPTY, POINTER_ONLY, UNREACHABLE)
Unit: coverage manifest still accessible
```

### NEGATIVE_TESTS

```
Receipt code that JSON.stringifies pointers → verify it still works
Coverage manifest code → verify unaffected
```

### OBSERVABILITY_WITNESS

```
identity_kernel_tokens: decreased if StableSelf fields compacted
domain_pointer_tokens: decreased (pointerOnly removed)
```

### PRODUCTION_QUALIFICATION

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window (≥24h secondary guard)

Record in return ledger:
  sample_count (total successful Thought cycles observed)
  elapsed_window
  identity_kernel_tokens and domain_pointer_tokens before/after
  Verify Thought output quality unaffected (Owner qualitative observation)
  Verify no receipt or coverage manifest reader breaks
```

### ROLLBACK

Revert non-enumerable property definitions. Fields return to enumerable.
Downstream qualification evidence (e.g. W7 programme comparison) must account for W2 being absent.

### STOP_CONDITIONS

```
Receipt or coverage readers break
Thought cognitive regression
Removal of any field without required source proof
```

### ACCEPTANCE_CRITERIA

```
All existing tests pass
Pointer serialization provably smaller
disposition truth preserved in all projections
Field-level source prosecution documented in ledger
No cognitive regression
```

### DEPENDENCIES

W0 (for baseline comparison)

### OWNER_SOL_ADJUDICATION_REQUIRED

No for bounded source prosecution of StableSelf fields.
Yes for DomainPointer `canonicalStore` removal (Gate G4).

---

## 26. Wave W3 — THOUGHT CONTRACT ECONOMY

```
WAVE_ID:     W3
TITLE:       Thought Contract Economy
STATUS:      SOURCE_PROSECUTED_NO_CHANGE — BLOCKED_FROM_IMPLEMENTATION
```

```
W3_STATUS=SOURCE_PROSECUTED_NO_CHANGE
W3_IMPLEMENTATION_AUTHORIZED=no
ROUTE_PROOF_STATUS=FAILED
CONTRACT_PROSE_REMOVAL=BLOCKED
ALL_CONTRACT_PROSE_LINES_PRESERVED=yes
NO_DEPLOYMENT=yes
NO_ROLLBACK_REQUIRED=yes
```

W3 was thoroughly investigated in research and adjudicated by Owner + Sol. Route proof
mechanically failed across multiple current Thought dispatch paths (Groq failover sends
`{ type: "json_object" }` without schema descriptions; non-v021 paths lack structured output).
W3 is NOT pending implementation and is NOT waiting for another worker to retry route proof.
No runtime change is authorized for this programme. Contract prose remains preserved in full.

### GOAL

Remove only mechanically duplicated prose from Thought contract where route proof
confirms all dispatch paths receive equivalent schema guidance.

### WHY_THIS_WAVE_EXISTS

Lines 253-254 of `output-contract.ts` restate selection rules that are
also present in schema `description` fields on the four root `oneOf` forms.
If every dispatch path delivered schema descriptions, the prose would be
mechanically redundant.

### ROUTE PROOF RESULT

```
ROUTE_PROOF_STATUS = FAILED

PRIMARY_THOUGHT_ROUTE_SCHEMA_GUIDANCE:
  NIM with guided_json or json_schema → PRESENT (schema descriptions sent)
  NIM with json_object_compatibility → ABSENT (only { type: "json_object" })

FAILOVER_THOUGHT_ROUTE_SCHEMA_GUIDANCE:
  Groq → ABSENT
  Groq adapter throws structured_output_native_unsupported for json_schema
  Groq sends ONLY { type: "json_object" } — NO schema or descriptions

STRUCTURAL_RETRY_SCHEMA_GUIDANCE:
  Same dispatch path as primary → inherits primary behavior

NON_V021_PATHS:
  Reflection adjudicator → NO structured output
  Runtime deliberation → json_object only, NO schema
  Continuation/observation pass 2 → json_object only, NO schema
  Durable thought production → json_object only, NO schema
  Shadow thought observation → json_object only, NO schema
```

**Source evidence:**
- `groq-adapter.ts:104-118` — throws `structured_output_native_unsupported`,
  falls back to `{ type: "json_object" }` with NO schema descriptions
- `nim-adapter.ts:112-134` — supports `guided_json` and `json_schema` (descriptions
  present), but `json_object_compatibility` sends NO schema
- `output-contract.ts:154-179` — descriptions exist ONLY on 4 root `oneOf` forms;
  nested properties (`speech`, `mustSay`, `commitments`, `workingContextDeltas`,
  etc.) have ZERO description fields
- Multiple non-v021 paths dispatch with `responseFormat: "json_object"` and
  custom prose, not `thoughtOutputCompatibilityInstruction()`

### CONSEQUENCE

```
PROSE_REMOVAL_BLOCKED = yes

REASON_1: Groq failover sends { type: "json_object" } without any schema.
           The prompt prose is the ONLY kind-selection guidance available
           to Thought on Groq failover.

REASON_2: Multiple non-v021 Thought paths dispatch without structured output.
           They rely entirely on prompt prose for output contract compliance.

REASON_3: Even on NIM with guided_json, nested field semantics (mustSay,
           epistemic time, capability reality bindings) have no schema
           description equivalent. These are GENUINE_SEMANTIC_PROSE, not
           duplicates.
```

### CORRECTED CLASSIFICATION

| Instruction (L#) | Classification | Safe to Remove? |
|---|---|---|
| L251: Contract/schema identifiers | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L252: Permitted kinds/forms | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L253: Semantic selection rules | REQUIRED_FOR_GROQ_FAILOVER | **NO** |
| L254: Settlement placeholder warning | REQUIRED_FOR_GROQ_FAILOVER | **NO** |
| L255: Observation_intent caveat | GENUINE_SEMANTIC_PROSE | NO |
| L256: Epistemic time guidance | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L257: Capability reality semantics | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L258: Semantic class binding | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L259: CapabilityReality field semantics | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L260: Forbidden kernel/lifecycle fields | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L261: Required settlement sections | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L262: Speech shape | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L263: mustSay contract | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L264: Commitments required fields | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L265: Forbidden publication fields | UNIQUE_SEMANTIC_REQUIREMENT | NO |
| L266: Contract scope statement | UNIQUE_SEMANTIC_REQUIREMENT | NO |

### FUTURE REOPENING CONDITIONS

W3 could be reopened ONLY if:

1. Groq adapter gains native `json_schema` support AND the Thought route
   is reconfigured to use it, OR
2. Thought routing changes to only use providers with native schema support, OR
3. The contract prose is restructured so that essential guidance lives in both
   the schema descriptions AND the prompt (true dual-path redundancy)

Until one of these conditions is met:

```
W3_CONTRACT_PROSE_REMOVAL = BLOCKED
ALL_LINES_PRESERVED = yes
```

### REMAINING CONTRACT ECONOMY OPPORTUNITY

The contract prose CANNOT be shortened, but it CAN potentially be made
more token-efficient through:
- Tabular rather than prose formatting (same content, fewer tokens)
- Semantic compression without information loss

However, these are GENUINE_SEMANTIC_REWRITES requiring:

```
OWNER_SOL_ADJUDICATION_REQUIRED = yes
BEHAVIORAL_REGRESSION_QUALIFICATION_REQUIRED = yes
```

This is deferred to a future programme.

### DEPENDENCIES

Reopening depends on Groq/provider evolution or routing changes.

### OWNER_SOL_ADJUDICATION_REQUIRED

**YES** — if reopening is proposed.
**NO** — for current blocked status (source evidence is definitive).

---

## 27. Wave W4 — REQUEST-LOCAL COMPUTE ECONOMY

```
WAVE_ID:     W4
TITLE:       Request-Local Compute Economy
STATUS:      READY_FOR_IMPLEMENTATION (after W0)
```

### GOAL

Remove repeated Host construction/serialization work within single allocation
cycle. Measure whether cross-cycle caching is needed.

### WHY_THIS_WAVE_EXISTS

Source-confirmed: system message reconstructed N+1 times per allocation
(N=25-65), inFlight mapped N times with invariant data, conversation sorted
N times with growing arrays. Total transient allocation: 0.6-3.2 MB JSON.

### RIGHTFUL_OWNER

Projection allocator

### SOURCE_PRECONDITIONS

W0 baseline available with allocation candidate and operation profile.

```
HOST_COMPUTE_WASTE = source-proven
HOST_LATENCY_IMPACT = baseline-dependent
```

If W0 provides timing, use timing. If W0 provides only deterministic operation counts,
latency reduction must not be claimed as already measured prior to qualification.
Request-local memoization is authorized because repeated invariant work is mechanically proven.

### ESTIMATOR EQUIVALENCE LAW (FROZEN INVARIANT)

```
ESTIMATED_INPUT_BEFORE == ESTIMATED_INPUT_AFTER
```

This equivalence must hold for every identical projection fixture. Exactly, not approximately.
The implementation must strictly account for:
- Message roles (`role: "system"`, `role: "user"`)
- Message content UTF-8 byte lengths (`Buffer.byteLength(content, "utf8")`)
- JSON serialization framing
- Fixed `FRAMING_TOKEN_OVERHEAD` (64 tokens, applied once per request)
- `Math.ceil(totalBytes / BYTES_PER_TOKEN)` behavior over total combined bytes
- Structural feedback and retry message additions

No estimator redesign is permitted.
No change to `BYTES_PER_TOKEN` (2), `FRAMING_TOKEN_OVERHEAD` (64), or `9500`.

**Implementation Stop Condition:**
If additive decomposition cannot reproduce the current estimator exactly across all fixtures:
```
DO_NOT_USE_PARTIAL_ESTIMATOR_OPTIMIZATION
```
Memoize only string and object content construction, and retain the full existing
`estimateRequestTokens(tentativeMessages, ...)` call over the joined message list.

### FILES_EXPECTED_TO_CHANGE

```
apps/agent-service/src/core/cognitive-v021/thought/projection-allocator/allocator.ts
```

### SYMBOLS_EXPECTED_TO_CHANGE

```
allocateThoughtProjection (allocator.ts:158-507)
  ADD: request-local memoization of invariant computations before loop

renderTentative (allocator.ts:220-296)
  ACCEPT: pre-computed invariants as parameters
```

### EXACT_MECHANICAL_CHANGE

Before the candidate loop (allocator.ts:298), compute and cache:

1. **System message content**: Call `thoughtOutputCompatibilityInstruction()` once.
   Store result. Pass to `thoughtMessagesForProjection` inside loop.

2. **Structural feedback strings**: Call `formatThoughtStructuralFeedback` and
   `formatThoughtStructuralCorrectionData` once. Store results.

3. **InFlight effect refs**: Pre-compute `input.inFlight.map(item => ({
   effectRef: mintEffectRef(...), status: item.status }))` once before loop.
   Use pre-computed array in `renderTentative`.

4. **System message byte estimate**: If and only if exact estimator equivalence is proven,
   compute `Buffer.byteLength(systemContent, "utf8")` once and apply as a constant byte offset;
   otherwise retain the full existing estimator.

Modify `thoughtMessagesForProjection` (or create a variant) to accept
pre-computed system content string and pre-computed feedback strings instead
of regenerating them.

### SOURCE_SEMANTICS_CHANGED

No

### MODEL_VISIBLE_PRESENTATION_CHANGED

No

### PROVIDER_BEHAVIOR_CHANGED

No

### LOGICAL_TOKEN_EFFECT

None (same output)

### HOST_COMPUTE_EFFECT

Reduction: system message construction from N+1 calls to 1. InFlight mapping
from N to 1. String generation/joining from N+1 to 1.

### PROVIDER_CACHE_EFFECT

None (request content unchanged)

### INVARIANTS

```
ESTIMATED_INPUT_BEFORE == ESTIMATED_INPUT_AFTER (exact estimator equivalence)
Final projection: BYTE-IDENTICAL to current (same inputs → same outputs)
System message content: IDENTICAL
Allocation decisions: IDENTICAL
```

### PROHIBITED_CHANGES

```
Changing system message content
Changing projection content
Changing allocation logic
Changing estimator parameters (BYTES_PER_TOKEN, FRAMING_TOKEN_OVERHEAD, 9500)
Partial estimator optimization that diverges by even 1 token
Introducing cross-cycle state without Gate G3
Introducing persistent cache
```

### TARGETED_TESTS

```
Golden: memoized path produces byte-identical output to current path across all fixtures
Golden: estimatedInputTokens exactly matches before/after across all fixtures
Unit: system message computed exactly once per allocation
Unit: inFlight mapping computed exactly once
```

### NEGATIVE_TESTS

```
Stale memoized value cannot persist across allocations
Additive byte estimate cannot diverge from full estimate on odd-byte sums
```

### OBSERVABILITY_WITNESS

```
Allocation latency: decreased (if profiling available)
Candidate count and operation count profile recorded
Zero token metric difference (same output and exact estimator equivalence)
```

### PRODUCTION_QUALIFICATION

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window (≥24h secondary guard)

Record in return ledger:
  sample_count (total successful Thought cycles observed)
  elapsed_window
  Verify Thought output unchanged
  Measure allocation timing / candidate counts against W0 baseline
```

### ROLLBACK

Revert memoization. Return to per-candidate reconstruction.
Dependent qualification evidence is invalidated if W4 is reverted.

### STOP_CONDITIONS

```
Golden equivalence test failure
Any estimatedInputTokens difference (>0 tokens divergence)
Any output difference from current path
```

### ACCEPTANCE_CRITERIA

```
Byte-identical output to current path (golden test)
Exact estimator equivalence proven across all test suites
All existing tests pass
Measured allocation cost reduction (witnessed via operation count or timing)
```

### DEPENDENCIES

W0 (baseline). Independent of W1, W2, W3.

### OWNER_SOL_ADJUDICATION_REQUIRED

No

### CROSS-CYCLE CACHE GATE

```
SMALLEST_RIGHTFUL_EXTENSION > PREEMPTIVE_CACHE_FRAMEWORK
DO_NOT_BUILD_COMPILED_CROSS_CYCLE_CACHE
```

After W4 is deployed, measure:

```
REMAINING_HOST_ALLOCATION_COST=<measured>
CROSS_CYCLE_CACHE_JUSTIFIED=<yes/no based on measurement>
```

If cross-cycle cache justified:
```
OWNER_SOL_ADJUDICATION_REQUIRED=yes (Gate G3, for CompiledThoughtCore design)
CONCURRENCY_SAFETY_PROOF_REQUIRED=yes
```

If not justified:
```
DO_NOT_BUILD_COMPILED_CROSS_CYCLE_CACHE
```

---

## 28. Wave W5 — OPTIONAL CONTEXT / RAW HISTORY ECONOMY

```
WAVE_ID:     W5
TITLE:       Optional Context Economy
STATUS:      PENDING_W0_EVIDENCE + OWNER_SOL_ADJUDICATION
```

### GOAL

Optimize competition for optional semantic capacity using evidence from W0
production measurements.

### WHY_THIS_WAVE_EXISTS

Optional sections (raw history, retrieval, optional WC, C3) compete for
remaining budget after required sections. Current priority ordering may not be
optimal but evidence is needed.

### RIGHTFUL_OWNER

`sections.ts` + allocation policy

### SOURCE_PRECONDITIONS

W0 production data available showing:
- raw_history_share distribution
- which sections are regularly starved
- which sections are most frequently omitted
- displacement patterns
- headroom distribution

### EXACT_MECHANICAL_CHANGE

```
PENDING_W0_EVIDENCE
```

This wave does NOT pre-commit a specific mechanism. After W0 evidence:

Potential directions to evaluate:
- Current priorities already optimal → NO CHANGE
- Priority reordering among optional categories
- Section budget/cap for raw history share
- Reserved headroom for retrieval
- Other evidence-driven policy

### PROHIBITED_CHANGES

```
DEFAULT_LAST_N_TURNS = 12 → 8 (or any other fixed count)
  ARBITRARY_HISTORY_COUNT_OPTIMIZATION = PROHIBITED
Host semantic summarization of omitted context
Removal of frontier from priority system
Removal of current trigger requiredness
```

### DEPENDENCIES

W0 (evidence), Owner+Sol adjudication (policy decision)

### OWNER_SOL_ADJUDICATION_REQUIRED

**YES** — after W0 evidence is presented.

---

## 29. Wave W6 — PROVIDER CACHE QUALIFICATION

```
WAVE_ID:     W6
TITLE:       Provider Cache Integration Qualification
STATUS:      PENDING_W0_W1 (MAY_HAVE_NO_CODE_CHANGE)
```

### GOAL

Qualify provider prefix caching behavior with production evidence.

### WHY_THIS_WAVE_EXISTS

W0 reveals provider caching behavior. W1 extends stable prefix. W6 qualifies
the combined effect in production.

### RIGHTFUL_OWNER

Model Fabric + provider adapters

### SOURCE_PRECONDITIONS

W0 + W1 landed. Provider caching behavior observed.

```
NIM_PROVIDER_CACHE_SUPPORT = UNKNOWN (must not be assumed)
```

### EXACT_MECHANICAL_CHANGE

If Groq automatic prefix caching requires no request parameter:
```
W1_STRUCTURE_IS_SUFFICIENT = yes
NO_ADDITIONAL_ADAPTER_CHANGE_NEEDED = yes
```
(W6 may require zero code changes; it is a qualification wave).

If NIM requires configuration for caching:
```
DESIGN_MINIMAL_NIM_ADAPTATION
OWNER_SOL_ADJUDICATION_REQUIRED (Gate G5)
```

If provider caching is unsupported:
```
NO_SEMANTIC_WORKAROUND
REPORT_EMPIRICAL_LIMITATION
```

### CORRECTNESS_PROOFS_REQUIRED

```
cache hit → same logical request as cache miss
cache miss → full prefill, correct result
provider switch (NIM→Groq) → provider cache miss, correct result
model switch → provider cache miss, correct result
process restart → cold start, correct result
cache expiry → transparent miss, correct result
```

### PRODUCTION_QUALIFICATION

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window (≥48h secondary guard)
```

If no provider dispatches exist due to unrelated current Thought failure:
```
STATUS = LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES
```
This does NOT block preceding wave implementation acceptance or provider-independent waves.
Do NOT debug the unrelated live failure as part of this programme.

### DEPENDENCIES

W0, W1

### OWNER_SOL_ADJUDICATION_REQUIRED

Only if provider-specific adapter changes needed (Gate G5).

---

## 30. Wave W7 — PROGRAMME QUALIFICATION + ENVELOPE ADJUDICATION

```
WAVE_ID:     W7
TITLE:       Programme Qualification
STATUS:      PENDING_ALL_ACCEPTED_WAVES
```

### GOAL

Measure programme-level impact and adjudicate envelope policy across the accepted
set of actually implemented waves.

```
W3_DISPOSITION = NO_CHANGE_SOURCE_CLOSED
```

### WHY_THIS_WAVE_EXISTS

Longitudinal comparison of pre/post-programme token economy.

### RIGHTFUL_OWNER

Owner + Sol

### SOURCE_PRECONDITIONS

All accepted implemented waves deployed (W0, W1, W2, W4, and W5/W6 if qualified).
W3 evaluated as source-closed with no code change.

### MEASUREMENTS

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window (≥1 week secondary guard)

estimated_input_tokens p50/p95 (compare W0 baseline)
provider_input_tokens p50/p95
provider_cached_input_tokens p50/p95
provider_uncached_input_tokens p50/p95

required_base_tokens p50/p95
optional_context_tokens p50/p95

headroom_tokens p50/p95
omitted_for_budget_count
section_displacement_patterns

latency p50/p95 (Host allocation + provider TTFT)
parse_failure_rate
Thought structural validity

Owner qualitative cognitive observations
```

### ENVELOPE_ADJUDICATION

Based on measurements, Owner + Sol adjudicate:

```
KEEP_9500 | LOWER_9500 | RAISE_9500 | OTHER_POLICY
```

No automatic envelope change. 9500 remains frozen during this programme.

### DEPENDENCIES

All accepted preceding waves

### OWNER_SOL_ADJUDICATION_REQUIRED

**YES** (Gate G2)

---

## 31. Cross-Wave Verification Protocol

### Per-wave verification

| Wave | Subsystem Tests | Invariant Tests | Build/Typecheck | Provider Tests | Full Corpus |
|---|---|---|---|---|---|
| W0 | Adapter usage parsing | Existing receipt consumers | Yes | toTokenUsage unit tests | No |
| W1 | Prefix determinism | Allocation key-set equality | Yes | No | No (unless broad regression) |
| W2 | Pointer serialization | Coverage manifest + receipt readers | Yes | No | No |
| W3 | Route proof source audit | Contract prose preserved | Yes | None (no change) | No |
| W4 | Golden equivalence | Allocation byte-identical output | Yes | No | No |
| W5 | Budget competition | Current trigger/frontier preserved | Yes | No | Possibly (if broad priority change) |
| W6 | Cache hit/miss equivalence | Provider switch correctness | Yes | Provider-specific | No |
| W7 | Programme metrics | Full regression if needed | Yes | No | Yes (programme gate) |

```
W3:
SOURCE_PROSECUTION_COMPLETE
NO SOURCE CHANGE
NO DEPLOYMENT
NO ROLLBACK REQUIRED
W3_DISPOSITION = NO_CHANGE_SOURCE_CLOSED
```

### Golden law

```
CACHE_HIT_LOGICAL_REQUEST == CACHE_MISS_LOGICAL_REQUEST
```

---

## 32. Production Qualification Protocol

### Governing Principles

```
PRIMARY_QUALIFICATION_UNIT = successful representative Thought/provider samples
SECONDARY_QUALIFICATION_UNIT = elapsed observation window
```

Elapsed time alone is insufficient evidence (e.g. 48 hours with 2 Thought calls is far weaker
than 12 hours with 100 representative successful calls). Elapsed windows remain as secondary
longitudinal guards, but qualification requires sufficient representative successful samples
to establish the measured behavior.

Every qualification return ledger must report:
```
sample_count
provider_dispatch_count
wake_type_distribution where relevant
provider_distribution where relevant
elapsed_window
```

### No-Provider-Dispatch Handling

```
NO_PROVIDER_DISPATCH_SAMPLES
!=
AUTHORITY_TO_DEBUG_UNRELATED_CURRENT_THOUGHT_FAILURE
```

If production observation yields zero or insufficient provider dispatches:
- Provider cache effect is assigned status: `LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES`.
- Workers must NOT debug the unrelated Thought dispatch failure.
- Implementation acceptance of provider-independent waves (W0, W1, W2, W4) proceeds on local/deterministic evidence.
- W6 live cache qualification remains pending until provider dispatches exist.

### Per-Wave Qualification Matrix

| Wave | Qualification Method | Primary Evidence (Samples) | Secondary Guard (Time) | Success Signal |
|---|---|---|---|---|
| W0 | Verify receipts show actual usage & collect baseline | Sufficient representative Thought cycles | ≥24h | Non-null cachedInputTokens OR confirmed absent/unsupported; baseline distributions recorded |
| W1 | Verify prefix determinism & cognitive quality | Sufficient representative Thought cycles | ≥48h | No parse failure increase; no Owner regression report; extended prefix verified |
| W2 | Verify wire field compaction & parser compatibility | Sufficient representative Thought cycles | ≥24h | Token breakdown decrease; no coverage manifest breaks; disposition truth intact |
| W3 | Route proof verification (source closed) | None — no runtime change | N/A | Route proof remains source-valid; all contract prose preserved in full |
| W4 | Verify allocation compute reduction & output equality | Sufficient representative Thought cycles | ≥24h | Golden equivalence; exact estimator equivalence; no regression |
| W5 | Verify optional context distribution | Sufficient representative Thought cycles | ≥48h | Evidence-driven policy improvement (under Gate G1) |
| W6 | Verify provider cache hit/miss behavior | Sufficient representative provider completions | ≥48h | Correct behavior on both hit and miss paths (or LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES) |
| W7 | Full programme longitudinal comparison | Longitudinal representative sample set | ≥1 week | Statistically grounded token economy improvement; envelope adjudication |

---

## 33. Rollback Protocol

Every wave is independently reversible at the code level:

```
CODE_ROLLBACK_INDEPENDENT = yes
EACH_WAVE = ONE_BOUNDED_COMMIT (where scope permits)
```

However, dependent qualification evidence is not independent:

```
DEPENDENT_QUALIFICATION_EVIDENCE_INVALIDATED_IF_PREREQUISITE_ROLLED_BACK = yes
```

If a prerequisite wave is rolled back, all downstream qualification evidence that relied
on that wave's code or telemetry becomes invalid and must be re-established:
- **Rollback W0**: Later historical comparisons lose baseline instrumentation.
- **Rollback W1**: W6 cache qualification against W1 layout is invalidated.
- **Rollback W2**: W7 programme comparison must account for W2 wire compaction absent.
- **Rollback W4**: Host compute savings are lost; cross-cycle gate data invalidated.

### Per-wave code rollback:

```
W0 rollback: cachedInputTokens returns to null; baseline telemetry reverted
W1 rollback: key ordering in renderTentative returns to pre-W1 order
W2 rollback: fields return to enumerable
W3 rollback: N/A (no runtime code change implemented)
W4 rollback: memoization removed; per-candidate reconstruction restored
W5 rollback: optional context competition policy reverted
W6 rollback: adapter changes reverted (if any were introduced under G5)
W7 rollback: N/A (measurement and adjudication gate)
```

---

## 34. Owner + Sol Adjudication Gates

| Gate | Wave | Question |
|---|---|---|
| G1 | W5 | Optional context economy: what policy change (if any) after W0 evidence? |
| G2 | W7 | 9500 envelope: keep/lower/raise/other? |
| G3 | W4 (conditional) | Cross-cycle compiled cache: justified by measurement? |
| G4 | W2 (deferred) | DomainPointer `canonicalStore` removal: does Thought use it? |
| G5 | W6 (conditional) | NIM-specific cache adapter changes: if NIM requires explicit config |

---

## 35. Deferred Opportunities

| Opportunity | Why Deferred | Revisit When |
|---|---|---|
| JSON key shortening | High complexity, moderate saving, readability impact | After programme qualification |
| Mistral prompt_cache_key | Not current Thought provider | If Thought routes to Mistral |
| Cross-cycle CompiledThoughtCore | Needs W4 measurement justification | After W4 data |
| DomainPointer canonicalStore removal | Needs cognitive purpose investigation | After G4 adjudication |
| Contract L255 observation caveat edit | GENUINE_SEMANTIC_PROSE | Separate architecture review |
| Epistemic time prose compression | GENUINE_SEMANTIC_PROSE | Separate architecture review |
| 9500 envelope change | Needs programme data | W7 adjudication |
| Multi-level explicit cache objects | Current providers support auto-cache | If auto-cache insufficient |
| Allocation delta-based estimation | Major allocator refactor | If allocation latency remains high after W4 |

---

## 36. Prohibited Architecture

The following are explicitly frozen out of this programme:

```
Host-generated semantic summaries
Embedding-based prompt deduplication
Provider session as continuity
Provider cache as memory
Persistent cache truth DB (unless separately adjudicated)
Generic cache daemon
Redis / distributed cache
Cross-provider fake KV-cache layer
Fixed 12→8 history optimization
Removal of EMPTY / POINTER_ONLY / UNREACHABLE disposition truth
Provider-TPM-driven semantic budget
Automatic raising/lowering of 9500
Large cache framework without profiling gate
Cached-token removal from semantic envelope calculation
"Single-threaded Node means race-free" assumptions
Blanket pointer metadata removal
DO_NOT_DEBUG_UNRELATED_CURRENT_THOUGHT_FAILURE_AS_PART_OF_THIS_PROGRAMME
DO_NOT_TREAT_ABSENT_PROVIDER_CACHE_USAGE_AS_PROOF_OF_UNSUPPORTED_CACHE
DO_NOT_REMOVE_STABLESELF_PROVENANCE_OR_ELIGIBILITY_WITHOUT_SOURCE_CLOSED_SURVIVAL_PROOF
DO_NOT_REOPEN_W3_CONTRACT_COMPRESSION_DURING_AUTONOMOUS_IMPLEMENTATION
```

---

## 37. Final Implementation Sequence

The programme sequence clearly distinguishes implementation waves, source-prosecuted
no-change waves, evidence-gated waves, adjudication gates, and qualification phases:

```
W0 — Token + Cache + Projection Baseline Observability
     STATUS: READY
     CLASSIFICATION: IMPLEMENTABLE [Immediate empirical baseline]

W1 — Deterministic Stable-Prefix Layout
     STATUS: READY_AFTER_W0_BASELINE
     CLASSIFICATION: IMPLEMENTABLE [Depends on W0 prefix baseline]

W2 — Source-Closed Wire Field Compaction
     STATUS: READY_AFTER_W0
     CLASSIFICATION: IMPLEMENTABLE [FIELD_LEVEL_SOURCE_GATES_APPLY]

W3 — Thought Contract Economy
     STATUS: SOURCE_PROSECUTED_NO_CHANGE
     CLASSIFICATION: SOURCE_PROSECUTED_NO_CHANGE [DO_NOT_IMPLEMENT — Route proof failed]

W4 — Request-Local Compute Economy
     STATUS: READY_AFTER_W0
     CLASSIFICATION: IMPLEMENTABLE [Exact estimator equivalence required]

W5 — Optional Context Economy
     STATUS: PENDING_W0_EVIDENCE
     CLASSIFICATION: EVIDENCE_GATED / ADJUDICATION_GATED [Requires Gate G1]

W6 — Provider Cache Qualification
     STATUS: PENDING_W0_W1
     CLASSIFICATION: QUALIFICATION_ONLY [MAY_HAVE_NO_CODE_CHANGE; pending provider dispatches]

W7 — Programme Qualification + Envelope Adjudication
     STATUS: FINAL_GATE
     CLASSIFICATION: ADJUDICATION_GATED [Evaluates accepted set; records W3 as no-change]
```

### Execution Rules:
- W2 and W4 may proceed independently after W0.
- W1 may proceed after W0 baseline measurements are established.
- W3 was investigated, route proof failed, and is **SOURCE_PROSECUTED_NO_CHANGE**; it does not deploy and does not block any wave.
- W5 requires empirical displacement evidence from W0 and Owner+Sol adjudication (Gate G1).
- W6 may remain in status `LIVE_QUALIFICATION_PENDING_INSUFFICIENT_PROVIDER_SAMPLES` if no provider-dispatched samples exist; this does not block provider-independent waves.
- W7 evaluates the accepted set of actually implemented waves, recording `W3_DISPOSITION = NO_CHANGE_SOURCE_CLOSED`.

---

## 38. Implementation Worker Handoff Contract

This contract governs autonomous execution (intended for Luna Max under MAT-II execution rules).

### Autonomy Model

```
AUTONOMOUS_IMPLEMENTATION = yes
AUTONOMOUS_ARCHITECTURE = no
```

Implementation workers may autonomously:
- Implement mechanically `READY` waves per specification.
- Run targeted unit and golden tests.
- Run build/typecheck validation (`npm run build`).
- Make bounded implementation repairs within frozen wave semantics.
- Create bounded per-wave candidate commits if separately authorized.
- Proceed between mechanically unblocked waves.
- Maintain and populate the wave evidence ledger.

Implementation workers MUST stop on:
- Any Owner + Sol adjudication gate (Gates G1, G2, G3, G4, G5).
- Any source contradiction requiring an architectural decision.
- Any new semantic ownership decision.
- Any proposed 9500 envelope change.
- Any Attention authority change.
- Any provider routing change.
- Any persistent cache design proposal.
- W5 optional-context policy selection prior to Gate G1.
- Cross-cycle compiled cache implementation prior to Gate G3.
- NIM-specific adapter integration prior to Gate G5.

### Bounded Source Prosecution Rule:
For source-prosecuted substeps (e.g. W2 StableSelf fields):
```
IF PROVEN SAFE: REMOVE AS SPECIFIED
IF NOT PROVEN SAFE:
  REPORT_NO_CHANGE
  CONTINUE_CAMPAIGN
```
No Owner/Sol interruption is necessary merely to preserve fields when equivalent truth
does not survive elsewhere. If removal would require an architectural policy decision:
`STOP THAT SUBCHANGE, OWNER_SOL_ADJUDICATION_REQUIRED`.

If implementation reveals a hard source contradiction:
```
STOP
RETURN_SOURCE_CONTRADICTION
DO_NOT_INVENT_POLICY
```

---

## Appendix A — Structural Retry Prefix Preservation

### Request Layout Across Attempts

```
FIRST ATTEMPT:
[BASE SYSTEM MESSAGE]
[USER PROJECTION]

STRUCTURAL RETRY:
[BASE SYSTEM MESSAGE]
[STRUCTURAL FEEDBACK APPENDED TO SYSTEM MESSAGE]
[USER PROJECTION]
[CORRECTION DATA]
```

### Contiguous Longest-Prefix Caching Model

For a provider using contiguous longest-common-prefix caching (such as Groq):
- `[BASE SYSTEM MESSAGE]` may still match and remain reusable from the prefix cache.
- The first byte divergence occurs at `[STRUCTURAL FEEDBACK APPENDED TO SYSTEM MESSAGE]`.
- The insertion of structural feedback breaks the contiguous prefix match at that exact point.
- After divergence, later user-message S1 content does **NOT** independently resume the same contiguous prefix cache, unless the provider explicitly documents multi-segment or block-level caching.

```
STRUCTURAL_RETRY_CACHE_BEHAVIOR = PROVIDER_SPECIFIC
BASE_SYSTEM_PREFIX_MAY_REUSE = yes
FEEDBACK_INSERTION_BREAKS_PREFIX_AT_INSERTION_POINT = yes
LATER_USER_PREFIX_REJOIN = no
```

Structural retry is a rare path (≤2 attempts per cycle). Base system message prefix reuse
provides partial prefill economy on retry; no deeper prefix resumption across divergence
points is assumed without provider-specific evidence.

---

## Appendix B — Wake Type Prefix Compatibility

| Wake Type | Same system message? | Same S1 prefix? |
|---|---|---|
| Reactive (owner message) | Yes | Yes |
| Idle wake | Yes | Yes |
| Curiosity wake | Yes | Yes |
| Proactive evaluation | Yes | Yes |
| Frontier continuation | Yes | Yes |

All wake types use the same `buildThoughtInput` → `allocateThoughtProjection`
pipeline. The system message and orientation kernel are constructed from the
same sources. S1 prefix should be identical across wake types when identity
and capability are unchanged.

Different wake types affect:
- Trigger kind/content (S3 — at end after reorder)
- Dynamic state (S2 — middle)
- Structural feedback (only on retry)

No wake-type-specific prefix divergence in S0/S1.

---

## Appendix C — Node Concurrency Assessment

Investigation required for W4 cross-cycle cache gate:

```
CAN_TWO_THOUGHT_CYCLES_BUILD_CACHE_CONCURRENTLY=<must determine>
CAN_INVALIDATION_INTERLEAVE_WITH_REBUILD=<must determine>
```

Source evidence to check:
- `PRIVATE_THOUGHT_MAX_CONCURRENT = 1` (types.ts:45) — suggests serialization
- Attention queue/admission control
- Whether proactive + reactive can overlap

If concurrent: cache publication requires deterministic atomic version comparison.
If serial: request-local memoization has no concurrency risk; cross-cycle cache
(if later justified) must still prove atomic publication.

Do not assume "single-threaded Node.js → inherently safe."

---

## Appendix D — Final Artifact Self-Audit and Completion Ledger

```text
PROJECT ASHLEY — PROJECTION ECONOMY + PROMPT CACHING
IMPLEMENTATION-READY ARTIFACT COMPLETION LEDGER

SOURCE_SHA=808e6a081a075e417e3af4a4b24385f815dc1f51
SOURCE_TREE=2acd079a8417a31cc80d6eca5ac089018b2cb7f7

TARGET_ARTIFACT=
docs/maturation/PROJECTION_ECONOMY_AND_PROMPT_CACHING_IMPLEMENTATION_PLAN.md

OPUS_RESEARCH_RECONCILED=yes
OWNER_SOL_CORRECTIONS_RECONCILED=yes

ARTIFACT_BODY_COMPLETE=yes

W0_PROVIDER_USAGE_OBSERVABILITY_DEFINED=yes
W0_PROJECTION_BASELINE_DEFINED=yes
W0_PREFIX_BASELINE_DEFINED=yes
W0_OPTIONAL_DISPLACEMENT_BASELINE_DEFINED=yes
W0_ALLOCATION_PROFILE_DEFINED=yes

W1_STABLE_PREFIX_REORDERING_DEFINED=yes

W2_FIELD_LEVEL_SOURCE_GATES_DEFINED=yes
W2_DISPOSITION_TRUTH_PRESERVED=yes
W2_STABLESELF_PROVENANCE_ELIGIBILITY_GATED=yes

W3_STATUS=SOURCE_PROSECUTED_NO_CHANGE
W3_IMPLEMENTATION_AUTHORIZED=no

W4_REQUEST_LOCAL_COMPUTE_ECONOMY_DEFINED=yes
W4_EXACT_ESTIMATOR_EQUIVALENCE_REQUIRED=yes
CROSS_CYCLE_CACHE_PREAUTHORIZED=no

W5_MAGIC_HISTORY_COUNT_PLAN_PRESENT=no
W5_OWNER_SOL_GATE_PRESENT=yes

W6_PROVIDER_CACHE_QUALIFICATION_DEFINED=yes
NIM_CACHE_SUPPORT_ASSUMED=no

W7_PROGRAMME_QUALIFICATION_DEFINED=yes

CURRENT_CACHE_HIT_RATE_ASSUMED=no

QUALIFICATION_SAMPLE_BASED=yes
TIME_ONLY_QUALIFICATION=no

NO_PROVIDER_DISPATCH_INCIDENT_REOPEN_PROHIBITED=yes

STRUCTURAL_RETRY_PREFIX_MODEL_CORRECTED=yes

ROLLBACK_CODE_INDEPENDENCE_DEFINED=yes
DEPENDENT_EVIDENCE_INVALIDATION_DEFINED=yes

9500_CHANGED=no

THOUGHT_SEMANTIC_AUTHORITY_CHANGED=no
CURRENT_TRIGGER_SEMANTICS_CHANGED=no
FRONTIER_SEMANTICS_CHANGED=no
C2_CURRENTNESS_CHANGED=no

RUNTIME_SOURCE_MUTATION=no
TEST_SOURCE_MUTATION=no
DATABASE_MUTATION=no
PROVIDER_CONFIG_MUTATION=no

UNRESOLVED_ARCHITECTURE_DECISIONS=0

OWNER_SOL_ADJUDICATION_GATES=
G1_W5_OPTIONAL_CONTEXT_POLICY
G2_W7_9500_ENVELOPE
G3_W4_CROSS_CYCLE_CACHE_IF_JUSTIFIED
G4_W2_DOMAIN_POINTER_CANONICALSTORE_IF_REOPENED
G5_W6_NIM_SPECIFIC_INTEGRATION_IF_REQUIRED

READY_FOR_OWNER_SOL_FINAL_AUDIT=yes
READY_FOR_IMPLEMENTATION=no
```
