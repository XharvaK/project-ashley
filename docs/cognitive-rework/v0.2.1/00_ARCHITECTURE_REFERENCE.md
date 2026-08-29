# PROJECT ASHLEY COGNITIVE ARCHITECTURE v0.2.1

**Packet role:** Canonical architecture reference for the v0.2.1 implementation packet. This file is the frozen architecture, not the software specification.

**Status:** `ACCEPTED ARCHITECTURE / IMPLEMENTATION PLANNED`. Owner-accepted target for the cognitive reconstruction. Does not mean implemented, qualified, deployed, or production accepted. Does not authorize cutover by itself.

**Owner acceptance:** [OWNER_ACCEPTANCE_RECORD.md](OWNER_ACCEPTANCE_RECORD.md) and [`docs/architecture/cognitive/Ashley_Cognitive_Architecture_v0.2.1.md`](../../architecture/cognitive/Ashley_Cognitive_Architecture_v0.2.1.md).

**Architecture-reference inspection SHA:** `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a`. Implementation baseline is owner-selected in [OWNER_BASELINE_GATE.md](OWNER_BASELINE_GATE.md).

**Governing packet:** [README.md](README.md)

**Do not reinterpret.** Software contracts live in [02_IMPLEMENTATION_SPECIFICATION.md](02_IMPLEMENTATION_SPECIFICATION.md).

---

North star: **one persistent, highly capable, increasingly autonomous cognitive entity and companion** — not a chatbot, coding-agent framework, worker router, federation of mini-minds, cron-with-personality, or profile-retrieval wrapper.

---

# SECTION 1 — EXECUTIVE ARCHITECTURE

Ashley thinks in **Cognitive Cycles**. Each cycle is fenced by `cycleId` + `generation`. **Thought** bound to that generation is the only process that may interpret the situation, form intentions, and author conversational stance. Thought is a capable model using evidence and tools, not a JSON clerk and not a metadata router.

Thought may, before publication, author **intra-cycle operational intent** (observe or effect). That intent is already meaning. It is Authority-checked, fenced, and receipt-bounded. It must not write conversational or durable semantic stores. The world may change; Ashley’s Working Context, occupancy, Memory, Identity, triggers, subscriptions, and licensed speech do not until publication.

When Thought is done, it emits a **Cognitive Settlement**. That object publishes **atomically**: Working Context, concern lineage, Mind State occupancy, FutureTriggers, ObservationSubscriptions, DurableNominations (queued), and — if speaking — a **speech outbox** intent containing the licensed draft. If that transaction fails, nothing semantic publishes. Software contracts implement this as `ThoughtSettlementDraft` (Thought JSON; no `finalLicensedText` / outbox / reservation) versus `PublishedCognitiveSettlement` (kernel-finalized licensed text). That is a type-boundary split, not a second semantic author.

**Expression**, if used, only adapts the already-licensed draft without transcript, memory, perception, or tools. Default Discord path delivers Thought’s `surfaceDraft` from the outbox.

**Authority** returns codes. **Admission** runs later on nominations still current under a generation/supersession fence. **Idle opportunity** and **ObservationSubscriptions** let existing state re-enter cognition without an interestingness engine. Empty house: no Thought.

If Thought cannot settle, Ashley does not speak in her own voice.

This is v0.2’s cognitive center, made technically true under concurrency, autonomy, and publication.

---

# SECTION 2 — v0.2 → v0.2.1 CORRECTIONS

| # | v0.2 | v0.2.1 |
|---|---|---|
| 3.1 | Settlement commit as the only semantic moment | Thought process is author; settlement is **publication**; operational intent may execute earlier |
| 3.2 | FutureTrigger-only wakes | **Idle cognitive opportunity** if grounded state exists; empty house → no Thought |
| 3.3 | No subscription object | **Thought-authored ObservationSubscriptions**; items are Observations |
| 3.4 | Draft + commitments underspecified | Frozen precedence; conflict → no delivery |
| 3.5 | Separate WC/Mind versions | **One atomic semantic transaction** |
| 3.6 | Delivery named, not outbox-tied | **Speech outbox** in the same txn as settlement |
| 3.7 | Compose policy only | **Inbound inbox**; append-to-log always; compose/preempt not drop |
| 3.8 | Admission “should” check | **Generation/supersession fence** (semantic, not a retry hint) |
| 3.9 | Mind State could hold duplicate prose | **Occupancy** over one **concern lineage** |
| 3.10 | Flat epistemic enum; AshleyBelief | **Dimensions**; no persistable Belief at cutover |
| 3.11 | Retrieval miss named | Trigger terms always in discovery; lexical/key/time fallbacks; keys are hints |
| 3.12 | Authority at proposal | **Dispatch-time recheck** of mutable packs |
| 3.13 | Recovery could double-speak | **Recovery speech suppression** on same correlation |
| 3.14 | Freeze live writers in shadow | **Sidecar shadow**; freeze only at cutover |

Frozen v0.2 center (no preprocessor mind, no Expression-as-brain, no score-speech, etc.) is unchanged. No new semantic faculty.

---

# SECTION 3 — SEMANTIC AUTHORSHIP AND PUBLICATION BOUNDARY

### A. Semantic authorship

The Thought process for the **active** `(cycleId, generation)` is the sole semantic author. Only it may:

- interpret conversation, referents, corrections, ambiguity;
- form hypotheses in Cognitive Workspace;
- judge relevance, interest, importance, investigation, memory-worthiness, speech;
- author ObservationRequest / EffectProposal;
- author Cognitive Settlement.

No other layer may answer those questions.

### B. Intra-cycle operational intent

During the cycle, Thought may emit:

- `ObservationRequest` — replay-safe evidence acquisition;
- `EffectProposal` — not replay-safe as a pure read.

An EffectProposal **is semantic intention**. It must:

- belong to this generation;
- pass Authority at proposal **and** at dispatch (`authorityEpoch` / mutable packs);
- carry `idempotencyKey`;
- persist as `in_flight` before dispatch;
- return `Observation` or `EffectReceipt` into this cycle or a **recovery** cycle.

It **must not** mutate: Working Context, Mind occupancy, Concern content (except via later settlement), Durable Memory, Identity, FutureTriggers, ObservationSubscriptions, licensed speech.

If the cycle dies after dispatch, the world may have changed. Recovery Thought consumes the receipt. Unknown remains unknown until evidence exists. Timeout ≠ did-not-happen.

### C. Cognitive Settlement (publication)

Settlement is the **only publication boundary** for:

- Working Context;
- Concern lineage upserts;
- Mind State occupancy;
- FutureTriggers;
- ObservationSubscriptions;
- DurableNomination enqueue;
- licensed speech (`speech.mode`, commitments, outbox draft).

Workspace hypotheses and operational intents are not published meaning.

**S2 (v0.2.1):** One Thought process per generation authors meaning. Settlement publishes conversational/durable state and licensed speech. Cycle-local operational intent may execute earlier; it remains Thought-authored, Authority-gated, and receipt-bounded.

---

# SECTION 4 — COMPLETE CAUSAL GRAPH

```
EVENT
  owner_message | idle_opportunity | subscription_item
  | future_trigger_due | observation_or_receipt | recovery
        │
        ▼
INBOX / LOG APPEND          (owner text & system events → evidence immediately)
        │
        ▼
CYCLE FENCE
  admit | compose into active generation | preempt/rebase | reject duplicate
  idle: admit Thought IFF activeConcerns>0 OR newSubscriptionItems>0
        OR due FutureTriggers  ELSE stop (no Thought)
        │
        ├──────────────────┐
        ▼                  ▼
 PERCEPTION           EVIDENCE ASSEMBLY
 (before Thought)     last N log turns, WC, occupancy, constitution,
                      capability, LearnedSelf slice, candidate hits
                      query ALWAYS includes current trigger terms
        │                  │
        └────────┬─────────┘
                 ▼
        THOUGHT  (same generation; N inference/tool passes allowed)
          Interpret → Need → Observe/Effect → Integrate → Settle → Bound
                 │                    ▲
                 │                    │ receipts / observations
                 ▼                    │
        Authority (codes) ────────────┘  (revision cap)
                 │
                 ▼  dispatch-time recheck on effects still queued
        ATOMIC SEMANTIC PUBLICATION
          WC + concern + occupancy + triggers + subscriptions
          + nomination enqueue + speech outbox (if draft)
                 │
        ┌────────┼────────────┐
        ▼        ▼            ▼
     OUTBOX   LEDGER     ASYNC ADMISSION (fenced)
        ▼
     TRANSPORT (Discord)
        ▼
     delivery reservation / discordMessageId
```

Optional Expression runs **after** Thought has a licensed draft and **before** publication, evidence-starved; its output is what enters the outbox. Fidelity failure → Thought, not Expression invention.

Same graph for reactive, idle, subscription, recovery. `speech.mode=none` skips outbox.

---

# SECTION 5 — COGNITIVE CYCLE / FENCE STATE MACHINE

**IDs:** `conversationId`, `cycleId`, `generation`, `authorityEpoch`, `occupantId`, `idempotencyKey`, `reservationId` / outbox id.

**One active semantic generation** per conversation (the generation that may publish or dispatch effects).

**States:** `admitted → assembling → thinking → awaiting_operation → thinking → authority_check → publishing → (outbox sending | silent) → idle`

### Owner inbound (inbox)

Every owner message **appends to Conversation Evidence Log immediately**, even if a cycle is running. Nothing is dropped.

**Compose** (default when no irreversible effect dispatched and no speech outbox **published**): attach new log ids to the active generation; Thought continues or restarts interpret with the fuller log. Undelivered in-cycle drafts (Workspace only) are discarded.

**Preempt** if settlement already published speech outbox or an irreversible effect is in_flight: bump generation; **suppress undelivered** outbox of the old generation; keep in_flight receipts for the new generation; do not unsend already-delivered Discord.

**Rapid HY4 / HY3 / LLM:** all three in the log; one coherent generation after compose or preempt; stale HY4 outbox not sent.

### Idle

Agency may emit `idle_opportunity` under resource budget. Fence admits Thought **only if** `activeConcerns > 0` OR `newSubscriptionItems > 0` OR due FutureTriggers. Else **no Thought call**.

Idle does not score interest or authorize speech.

### Duplicate / late provider

Result for wrong `generation` → ignore. Duplicate effect key → return existing receipt, do not re-execute if executor honors the key.

External effects: **at-least-once**. Semantic publication: **local atomic**. Delivery: **outbox + reservation** (see §17–18).

---

# SECTION 6 — COGNITIVE SETTLEMENT CONTRACT

Smallest inspectable commit object. Thought may use free-form Workspace internally.

```
CognitiveSettlement
  cycleId, generation
  authorityEpoch, occupantId, architectureEpoch
  triggerRef

  interpretation          # AUTHORITATIVE
    discourseActs[]
    referentBindings[]    # span → concern/entity/sourceTurnIds
    corrections[]
    unresolvedAmbiguities[]
    topics[]              # conversational

  commitments             # AUTHORITATIVE  (see §7)
    epistemic[]           # dimensional tags, not a flat peer enum
    conversational[]      # answer | ask | acknowledge | disagree | hold | silence
    stance                # warmth, humorAllowed, disagreement, uncertaintyDisplay

  speech                  # AUTHORITATIVE
    mode                  # none | draft
    mustSay[]
    mustNot[]
    surfaceDraft          # required if mode=draft
    acceptableRealizations[]   # optional fidelity aids
    presentationDirectives[]

  workingContextDelta     # published atomically
  concernDeltas[]         # upsert/resolve concern lineage content
  occupancyDelta          # Mind State pointers/status/priority
  futureTriggers[]        # create/cancel; payload = concernId + snapshotHash
  subscriptions[]         # create/cancel ObservationSubscriptions
  durableNominations[]    # queued; not Memory yet; assertionKey + generation

  operations
    observationsConsumed[]
    effectsCompleted[]    # claims ≤ receipts
    intentsStillInFlight[]

  authority
    objectionsApplied[]
    revisionCount
```

**Authoritative:** interpretation, commitments, speech.mode/must*/draft, all deltas, nominations, operation refs.  
**Convenience:** presentationDirectives (style unless they contradict commitments).

Private success: `mode=none` with occupancy/triggers/subscriptions/nominations allowed.

---

# SECTION 7 — SURFACE DRAFT / COMMITMENT CONTRACT

Both are in the **same** settlement. Neither is optional for `mode=draft`.

**Commitments own:** epistemic tags; action/experience claims; identity claims; referent/correction obligations; mustSay/mustNot; speech.mode; substantive stance obligations (disagree / acknowledge correction / do not mention X).

**surfaceDraft owns:** natural wording inside that envelope — humor, warmth, ellipsis, rhetorical questions, unfinished cadence, acknowledgement — **provided** it does not introduce an unlicensed substantive commitment (new fact, action, identity, currentness, invented experience).

**Conflict → do not deliver.** Return to Thought. Expression may not repair it.

**Empty/invalid commitments + plausible prose = causal failure** (Law 26), even if Discord would look right.

**Implicature:** licensed by `stance` + conversational commitments, not by an atom for every joke. A joke that asserts a world fact needs that fact in commitments or mustNot.

Thought **is allowed to sound like Ashley**. Settlement exists to inspect and enforce, not to reduce her to metadata.

**Escalation (same mind):** if one call cannot produce both (E2), **settle then draft** inside the same Thought role and cycle. Not Expression-with-transcript.

Default Discord: publish `surfaceDraft` (or Expression-adapted text that still passes fidelity) into the outbox.

---

# SECTION 8 — AUTHORITY

One interface, deterministic packs: epistemic, currentness, receipt, capability, operational, relational, state/epoch.

**Codes (illustrative):** `CURRENTNESS_UNVERIFIED`, `RECEIPT_REQUIRED`, `RECEIPT_CONTRADICTS_CLAIM`, `IN_FLIGHT_UNKNOWN`, `CAPABILITY_UNAVAILABLE`, `EFFECT_NOT_AUTHORIZED`, `RELATIONAL_BOUNDARY`, `RELATIONAL_WITHDRAWAL`, `SOURCE_CLASS_INSUFFICIENT`, `STALE_STATE`, `IDENTITY_MUTATION_FORBIDDEN`, `SECRET_OR_CREDENTIAL`, `REVISION_BUDGET_EXHAUSTED`, `DISPATCH_EPOCH_CHANGED`.

Authority never authors P′ or canned speech.

**Proposal-time:** gate intents and settlement draft.  
**Dispatch-time:** recheck **mutable** facts only (withdrawal, capability, sandbox, permission). Do not reinterpret the intent. If blocked, do not dispatch; return code to Thought or recovery.

Currentness: Thought tags **and** draft-side detectors. Untagged evasive draft still fails fidelity.

Relational “never mention X”: Thought settles the constraint once; Authority matches thereafter.

`maxRevisions = 2` after first bound, then fail closed or publish largest fully licensed droppable subset — never livelock.

---

# SECTION 9 — CONVERSATION EVIDENCE / RETRIEVAL / PERCEPTION

### Conversation Evidence Log (EVIDENCE)

Append-only source: message id, entity uuid, role, raw or redacted text, times, Discord/delivery ids, producing cycle for Ashley speech, architecture epoch, hash, `sourceStatus` (available|redacted|deleted|unavailable).

**Ashley’s own text is evidence of what she said, not that it was true.**

Edits = new version rows. Deletion/redaction → `source_unavailable` to Thought, not confident invention.

Outranks Working Context. Compaction may drop from always-on; fetchable rows remain until retention/redaction.

### Always-on Thought input

1. Current trigger + inbound text  
2. Last N raw log turns (governor **must not** evict)  
3. Working Context  
4. Constitutional Identity  
5. Capability reality  
6. Compact **occupancy** (not duplicated concern essays)  
7. Compact admitted LearnedSelf slice (traits/interests, not Doc inferences)

### Retrieval (not a mind)

Candidate discovery **always includes current trigger terms**. WC topic must not be the sole query.

Paths: substring/lexical (including HY3, GPT, LLM, API); assertion/entity keys; temporal range; log search; optional vectors as **candidates**.

Keys are hints. Wrong keys **must not** disable lexical/time/log fallback.

Miss: Thought issues `ConversationHistoryRequest` / memory request in-cycle (“I told you months ago”). Rank ≠ relevance.

Prefetch parallel with perception. Ordinary turns: at most one miss round unless tools require more.

### Perception

Before Thought. Raw + derived as Observations (`derived=true`). Raw outranks derived. Further look = ObservationRequest or Effect per replay-safety.

---

# SECTION 10 — COMPLETE STATE MODEL

### SEMANTIC STORES (meaning)

| Store | Writer | Reader | Lifetime | Provenance | Correction | Always-on |
|---|---|---|---|---|---|---|
| Working Context | Settlement txn | Thought | Semantic lifecycle | source turn ids | supersede/abandon | yes |
| Concern lineage | Settlement txn | Thought | Until resolved/forgotten | concernId, cycle | supersede/resolve | content via occupancy pointers, not full dump |
| Mind occupancy | Settlement txn | Thought, idle fence | Occurrent | concernId | status change | compact yes |
| Durable Memory | **Admission only** | Thought retrieval / views | Until retract | assertionKey, generation, class dims | supersede lineage | no (except tiny explicit prefs if budgeted) |
| Identity | Protected admission; constitution no ordinary writer | Thought | Enduring | layer | protected | constitution yes; LearnedSelf slice yes |

### EVIDENCE

Conversation Evidence Log — inbox/transport writes; Thought reads; not interpretation.

### EPHEMERAL

Cognitive Workspace — Thought; cycle-scoped; discarded on preempt; never belief.

### EXECUTIVE

| Store | Writer | Role |
|---|---|---|
| Future Trigger queue | Settlement txn | Wake; points at concernId + snapshotHash; **revalidate on fire** |
| Observation Subscriptions | Settlement txn or explicit owner auth | Mechanical intake; items → Observations |
| Inbox | Runtime | Owner/system events |
| Speech outbox | Settlement txn | Licensed draft + reservation |
| In-flight ops | Kernel on Thought intent | Receipts / recovery |

### OBSERVE

Causality Ledger — runtime; no authority. Explains past settlement; **not** evidence the world is as concluded.

### DERIVED VIEWS (no writer)

- **OwnerKnowledgeView** — query Memory owner-typed assertions at assembly; no cache-as-truth  
- **RelationalConstraintView** — enforceable constraints only  
- **CalibrationSnapshot / RuntimeCondition** — occupant + this-cycle conditions  

Forgetting: redaction on log; Memory retract; occupancy resolved; subscriptions/triggers cancelled in the same settlement txn when the concern dies.

---

# SECTION 11 — MIND STATE / CONCERNS

**One `concernId` lineage.** Do not store the same question text in occupancy, Memory, trigger payload, and WC.

**Concern record (semantic content, pre- and post-admission):** settlement-authored object: question/hypothesis statement, source refs, epistemic dimensions, optional link to `assertionKey` if later admitted. This is the object occupancy points at. It is **not** Durable Memory until admission. It **is** persisted so idle can wake a real object, not an empty pointer.

**Mind State occupancy:** `{ concernId, status: active | investigating | waiting_for_evidence | dormant_but_revisitable | resolved, priority, updatedCycle }`. Priority orders **her own** concerns for compact always-on — **not** a speech threshold.

**WC:** may **reference** `concernId` if the concern is also conversational. No second essay.

**FutureTrigger / Subscription:** `concernId` + `snapshotHash`. On fire: if occupancy resolved/superseded or hash mismatch → **do not** start a stale-meaning cycle (suppress or start recovery with **current** occupancy only).

**Caps:** bounded active set; `abandonIfNoEvidenceBy`; idle no-ops N times → Thought should drop or we mark dormant. Not a junk drawer.

**Bleed:** occupancy influences Thought; it does not license mentioning the concern unless commitments say so.

**Affect:** not present.

**If occupancy were deleted:** the same capability would be `concern.status=active` + idle-if-active. Occupancy is that index, named. The capability stays.

---

# SECTION 12 — INITIATIVE / IDLE OPPORTUNITY / SUBSCRIPTIONS

### Allowed mechanical wakes

1. Owner message  
2. Due FutureTrigger (revalidated)  
3. Observation/receipt for in_flight work  
4. Recovery  
5. **Idle opportunity** iff grounded (active concerns OR new subscription items OR due triggers)  
6. **New subscription Observation** (may itself open a cycle, or wait for idle — both mechanical)

### Forbidden

Learned-interest scores; live interestingness models; stochastic desire; empty-house Thought; cron with no payload and no occupancy.

### Idle

Executive/resource. Does not decide that a concern matters. Gives existing Ashley state a chance to re-enter Thought. Thought may silence, investigate, resolve, schedule a trigger, subscribe, nominate, or speak.

Cadence/budget = configuration (open parameter), not architecture.

### ObservationSubscriptions

Originate from **committed settlement** or **explicit owner authorization**.

Fields: `subscriptionId`, source, scope, optional **exact/structured topic or entity keys Thought named**, bounds, expiration, optional `concernId`.

**Matching is mechanical:** item belongs to that source; optional keys equality/substring as specified at subscribe time. No embedding-as-fire-path, no “is this interesting?”

Items become **Observations** (provenance: subscription + source). Thought then decides irrelevant / investigate / update concern / remember / tell Doc / nothing.

LearnedSelf may bias that **Thought** judgment. It may not create matches or speech.

---

# SECTION 13 — MEMORY / ADMISSION / EPISTEMIC LINEAGE

Admission is **off** the speech path. Input: `DurableNomination` from a **published** settlement only. No raw-conversation reinterpretation.

**Fence:** nomination carries `cycleId`, `generation`, `assertionKey`/`concernKey`, supersession pointer. Before live Memory write: if a later published generation superseded/retracted that key, **no-op** (history may record “admission skipped: superseded”). This is a semantic fence.

| Kind | Admission |
|---|---|
| Explicit remember / OwnerSuppliedClaim | Immediate if still current |
| Natural teaching | WC immediate at publication; Memory async as owner-sourced |
| Explicit correction | Immediate supersede |
| Interpretation / inferred preference | Deferred; never promote to owner-explicit by count |
| SharedEpisode | Episode evidence, not world belief |
| LearnedSelf | Accumulated independent cycles; not occupant quirks |
| AshleyBelief | **Not persisted at cutover** |

### Epistemic dimensions (compositional)

**Source:** owner utterance · Ashley interpretation · tool · perception · receipt · prior settlement  

**Status:** asserted · interpreted · unverified · contradicted · superseded · unresolved  

**Time:** current · historical · unknown freshness  

**Reliability:** owner-supplied · fallible observation · receipt-backed · inferred · unavailable source  

Not: CurrentObservation = truth. Tools and perception may be wrong. Two observations conflict → Thought settles uncertainty.

**Unknown** is a result/state, not a stored world fact.

Owner claim later observed: **same assertionKey**, additional support records; mixed source tags; no magic VerifiedWorldFact.

Correction example: “HY3 is an LLM” then “that wasn’t the one I meant” → supersede key; occupancy/triggers revalidate; admission of the old nomination no-ops.

---

# SECTION 14 — IDENTITY / LEARNEDSELF / OWNER KNOWLEDGE / RELATIONSHIP

**Constitutional Identity:** no ordinary writer; always-on.  
**Stable Self:** protected admission; slow.  
**LearnedSelf:** accumulated dispositions/interests from settled experience; compact slice always-on; never holds world claims like “HY3 is an LLM”; never speaks; never fires subscriptions.

**Owner Model store:** remains **removed**. Owner knowledge = typed Memory + WC temps + views computed at assembly. Inferences stay off always-on. Privacy: no inferred sensitive attributes.

**Relationship:** WC (temporary repair/misunderstanding); Memory (commitments, shared episodes); Authority (withdrawal, “don’t mention”). No scores, no narrator.

---

# SECTION 15 — CALIBRATION / OCCUPANT CONTINUITY

Calibration is occupant-scoped + architecture/contract version + RuntimeCondition (fallback, compression, lookup failed). Thought may see operational notes. It may not become “Ashley is anxious.”

**Survives occupant swap:** constitution, log, WC, concerns/occupancy, Memory lineage, LearnedSelf that is not occupant-styled, relational constraints.  
**Resets:** occupant calibration, ExpressionProfile habits.  
**Voice:** Thought-written drafts will change with the model. Honest. Optional evidence-starved ExpressionProfile may stabilize register only.

Entity continuity ≠ interchangeable celebrity personalities.

---

# SECTION 16 — OBSERVATION / EFFECT / OPERATIONAL RECOVERY

**Replay-safe as pure read → Observation.** Else **Effect.**  
GET without side effects: Observation if truly replay-safe. POST, paid APIs, browser click, mark-as-read, Git, Discord send, writes: Effect. Sandbox read vs write: split accordingly.

Dispatch-time Authority recheck for undispatched effects. Already dispatched: receipts/recovery.

**Orphan:** durable `in_flight`. Recovery trigger is infrastructure. Thought must see that an effect **may** have happened.

**Recovery speech suppression:** if the same `idempotencyKey` / reservation already **delivered** confirmation, recovery updates state **without** equivalent speech, unless commitments require a **new** contradictory outcome (“it actually failed”).

---

# SECTION 17 — EXPRESSION / FIDELITY / DELIVERY OUTBOX

Expression optional. Inputs: licensed draft, commitments, stance, directives, ExpressionProfile, MediumContext, LocalSurfaceStyle. **Not** transcript/memory/perception/tools/Workspace.

Allowed: paraphrase, compress, Discord register. Forbidden: new commitments, drop mustSay, polarity flip, invented experience, answering what the draft left unanswered.

**Fidelity (every speech):** mode=draft ⇒ draft present; mustSay covered (substring or acceptableRealizations); mustNot absent; high-risk draft detectors vs commitments/receipts; Expression input hash excludes forbidden evidence.

High-risk model audit sampled or always for action/identity/currentness — **reject only**.

Fail → Thought (or one Expression retry if Expression ran). Never canned honesty surgery.

### Speech outbox

Publication txn includes `speech.mode=draft` **and** outbox row: licensed text, generation, reservation id, `sendStatus=pending`.

Transport sends from outbox. Crash after publish, before send: recovery **sends the same text**. No fresh Thought to regenerate.

- Discord success, local crash: persist `discordMessageId` as soon as known; retry no-ops if set.  
- Recorded attempt, Discord fail: `send_failure`; retry **same** outbox, not new Thought.  
- Duplicate retry: reservation/idempotency where Discord permits.

**Guarantee:** at-least-once send attempt; **exactly-once meaning publication**; **best-effort single visible message** via reservation ids. Not metaphysical exactly-once networking.

---

# SECTION 18 — CONCURRENCY / TRANSACTIONS

Conceptual canon:

| Piece | Guarantee |
|---|---|
| Inbox + log append | Source durability; no dropped owner text |
| cycleId + generation | One active publisher |
| Compose / preempt | Natural multi-message; stale undelivered suppressed |
| Atomic semantic txn | WC + concern + occupancy + triggers + subs + nominations + outbox **all or none** |
| OCC / rebase | Stale base → reload and Thought retry once, else fail closed |
| authorityEpoch + dispatch recheck | Mutable packs |
| idempotencyKey + in_flight | At-least-once effects; receipts |
| Orphan recovery | Unknown until evidence |
| Admission generation fence | No live Memory from superseded nominations |
| Outbox + reservation | Speech from published draft |
| Recovery suppression | No duplicate confirmation chatter |

**Not claimed:** exactly-once external effects; exactly-once Discord if the provider duplicates.

WC OCC vs Mind OCC as **separate commits is forbidden**.

---

# SECTION 19 — MODEL CALL / LATENCY ARCHITECTURE

Ordinary Discord: **1 serial Thought call**. Perception, retrieval prefetch, Authority, fidelity (deterministic), OCC: CPU/IO parallel or after, not extra LLMs.

| Class | Serial LLM | Notes |
|---|---|---|
| hi / thanks / HY3 correction / teaching / what did you just say | 1 | Compose rapid messages into one generation |
| Memory miss | 1–2 | Second only on miss |
| Web / inspection / effect | 2 or tools-in-Thought (E3) | 6s Thought budget **must not** force semantic bypass; tool cycles get a wider lease |
| Idle empty house | **0** | |
| Idle with occupancy | 1 | Often `mode=none` |
| Optional Expression | +1 | Off default Discord text |
| Settle-then-draft | +1 same role | E2 escalation only |

Admission, sampled audit, calibration: off speech path.

---

# SECTION 20 — SEMANTIC CAUSALITY / OBSERVABILITY

Ledger records: trigger, generation, versions, occupant, annotations (non-meaning), requests, observations, intents, receipts, Authority codes, settlement id, nomination ids, outbox/delivery, fidelity, architecture epoch.

Three histories: conversation (log), semantic (settlements + published stores), operational (receipts).

“Why did you say X?” → settlement + outbox + receipts, not invented rationale and not ledger-as-world-fact.

Operator vs self-observation: bounded projection to Thought.

---

# SECTION 21 — C1–C5 SALVAGE

**C1:** provenance, sticky dimensions, unknown stays unknown → Memory + Authority + commitments. Keep assertion lineage code; retire prompt currentness.

**C2:** Resource Governor only; never evict always-on 1–5; reserve miss budget.

**C3 (v0.2.1):** LearnedSelf + concern occupancy + idle-if-grounded + Thought subscriptions. **No** score→speech/trigger. Not a C3 organ.

**C4:** occupant calibration / RuntimeCondition. Not personality.

**C5:** WC repair, Memory commitments/episodes, Authority constraints. No narrator, no scores.

---

# SECTION 22 — CURRENT-SOURCE KEEP / REHOME / REDESIGN / RETIRE

Unchanged in spirit from v0.2; v0.2.1 adds reuse of **delivery reservations as outbox**, **durable jobs as in_flight**, and **replacement of `chat_in_progress` throw with inbox compose**.

| Item | Verdict |
|---|---|
| Thought `{trigger,base,candidates}` / Decision metadata | REDESIGN |
| `decide()` / score&lt;25 / easy-turn | RETIRE as meaning |
| Expression evidence privilege | REDESIGN (starve) |
| finalizeHonesty / core.md currentness sentence | RETIRE |
| tokenize length≥4 | REDESIGN |
| Perception, capability self-model | REHOME upstream |
| Identity entries, C1 assertions, log messages | KEEP/REHOME |
| Sandbox V2, receipts, durable jobs | KEEP |
| Delivery reservations / bubble ids | KEEP as outbox/idempotency |
| `activeOwners` mutex | REDESIGN to one generation + inbox |
| Model fabric | KEEP |
| Discord transport | KEEP |
| Affect license as selfhood | RETIRE |
| Curiosity takes→speech | REDESIGN to observations |
| OCI | REHOME into concern + occupancy + triggers |

---

# SECTION 23 — MIGRATION / SHADOW / CUTOVER / ROLLBACK

| Phase | Legacy writers | New kernel writers | Authority |
|---|---|---|---|
| **LEGACY LIVE** | Live tables | none | Legacy |
| **SHADOW** | Live tables **remain live** | **Sidecar only** | Legacy production; sidecar is candidate, not Doc’s Ashley |
| **CUTOVER** | **Disabled** | Production semantic stores (sidecar promoted or swapped) | New kernel only |
| **POST-CUTOVER** | Unreachable | New only | New |
| **ROLLBACK** | Restore snapshot + flag | Sidecar frozen | Explicit; no merge theater |

Shadow: new kernel **reads** replicated conversation evidence; **writes only sidecar** WC/concerns/occupancy/Memory/triggers/subs. Multi-day evaluation in sidecar. **No freeze of live writers while legacy serves Doc.** **No dual-write of production meaning.** **No hybrid cognitive turn** (a turn is all-legacy or all-sidecar-eval, never mixed owners in one utterance to Doc).

Cutover: stop legacy cognition; drain in_flight as recovery; Discord inbox to new kernel; import selected legacy as `legacy_quarantine` (retrieval, not always-on). `legacy_unverified` must not dump into compact views.

Rollback: snapshot of new semantic state. Post-cutover Memory is not poured into old organs.

---

# SECTION 24 — ACTIVATION TARGET

**CORE CUTOVER:** fence, inbox, log, perception+capability before Thought, always-on set, settlement + draft/commitment rule, atomic publication, outbox, Authority packs + dispatch recheck, structural fidelity, no Expression-as-brain, no score-speech, Thought-down = infrastructure notice, orphan recovery + speech suppression, fenced async admission, concerns+occupancy, FutureTriggers, **idle-if-grounded**, **ObservationSubscriptions**, private `mode=none`, owner teaching/correction/retrieval.

**POST-CUTOVER:** richer retrieval, LearnedSelf accumulation, sampled high-risk fidelity, optional Expression/voice, stronger curiosity sources.

**RESEARCH-ONLY:** affect; ACK bypass (E1); LLM admission over transcripts; live interest classifiers; relationship narrator.

Core already **can** become autonomous without another cognitive redesign.

---

# SECTION 25 — ACCEPTANCE / FALSIFICATION SUITE

Causal bundle every scenario: evidence shown to Thought; settlement; WC/concern/occupancy; Authority; receipts; nominations; Expression input or skip; outbox text; delivered text; trigger/subscription lineage.

Wrong owner + right text = fail. Empty commitments + pretty draft = fail.

**This suite is architecture qualification (Q1):** exhaustive, deterministic, programmed/replayed Thought steps. It is **not** a live-API campaign. Bounded live inhabit witnessing is Q3 W1–W10 in [`QUALIFICATION_PROTOCOL.md`](QUALIFICATION_PROTOCOL.md). Do not send this entire section to the configured Thought occupant.

Prior v0.2 suite (HY4, I meant HY3, teaching, what did you just say, the second one, ambiguity, topic return, later correction, currentness with/without web, tool failure, Thought-down, timeout+receipt, preempt DM, duplicate trigger, restart, boundary, occupant swap, private silence, interest-must-not-speak) **plus:**

**A. Idle autonomy:** active concern, no timer, Doc silent, idle fires, Thought revisits; idle did not choose the outcome.  
**B. Empty house:** no concern, no sub item, no due trigger → **zero Thought calls**.  
**C. Subscription:** prior subscribe; item is Observation; Thought judges; no upstream classifier.  
**D. Stale trigger:** resolved before fire → suppress stale meaning.  
**E. Draft/commitment conflict:** Unknown vs “HY4 definitely shipped” → no delivery.  
**F. Atomic publish:** Mind write abort → WC unchanged, no outbox.  
**G. Admission race:** N nominates X, N+1 supersedes, async N → no live Memory X.  
**H. Outbox crash:** publish then die → same draft sent, no new Thought.  
**I. Discord success / local crash:** no duplicate where `discordMessageId` observable.  
**J. Rapid HY4 thread:** all in log; one coherent generation; no stale HY4 speech; HY3+teaching authoritative.  
**K. Authority change before dispatch:** undispatched effect blocked.  
**L. Orphan + already delivered confirmation:** no duplicate narration.

---

# SECTION 26 — SYSTEM LAWS v0.2.1

**S1.** Thought settles meaning and may utter a surface draft. Expression, if used, only adapts form.  
**S2.** Thought bound to `(cycleId, generation)` is the sole semantic author. Cognitive Settlement is the sole **publication** of conversational/durable state and licensed speech. Intra-cycle operational intent may execute earlier; it remains Thought-authored, Authority-gated, idempotent, in_flight, and must not publish those stores.  
**S3.** Raw evidence outranks derived projections. Unavailable source is unavailable.  
**S4.** Model confidence is not evidence.  
**S5.** Retriever score is not relevance. Current trigger terms always participate in discovery. Keys never disable lexical/time/log fallback.  
**S6.** Recorded is not true.  
**S7.** Traceable is not authorized.  
**S8.** Persistence is not confirmation.  
**S9.** Nomination is not admission. Admission may not reinterpret the conversation. Superseded generations must not become live Memory.  
**S10.** Workspace hypothesis is not belief.  
**S11.** Self-reflection is not self-knowledge. Occupant quirks are not LearnedSelf.  
**S12.** Requested effect is not completed. Timeout is not non-occurrence.  
**S13.** Action and experience claims may not exceed receipts.  
**S14.** Authority emits codes, including at dispatch for mutable packs. It does not author meaning.  
**S15.** Model output is not Authority.  
**S16.** Agency is executive. It does not judge interestingness, agreement, or answers.  
**S17.** A wake is a chance to think. Allowed: owner, revalidated FutureTrigger, licensed observation/receipt, recovery, idle **only if** active concerns or new subscription items or due triggers exist, subscription intake. Learned interests do not create triggers or speech. Empty house: no Thought.  
**S18.** Failure may reduce availability. It may not hand meaning to Expression or `decide()`.  
**S19.** Optimization may not bypass these contracts.  
**S20.** Prompts do not create authority.  
**S21.** Unlicensed substantive commitments may not appear in speech. Draft/commitment conflict: no delivery. Empty commitments + plausible prose is failure.  
**S22.** One semantic fact or concern key, one lineage. Occupancy, triggers, and subscriptions **point**; they do not copy meaning.  
**S23.** No downstream layer may receive richer semantic evidence than Thought and reinterpret it.  
**S24.** No hybrid cognitive turn. No dual-write of **production** meaning. Shadow sidecar is not production authority. Nuclear `resolveActiveThread` is a narrow evidence/executive conversation-identity write, not a Memory/settlement writer.  
**S25.** Database existence is not continuity entitlement.  
**S26.** Right text through the wrong owner is failure.  
**S27.** Cycles are fenced: inbox, one active generation, compose/preempt, atomic semantic transaction, OCC, authorityEpoch, dispatch-time recheck, idempotent in_flight effects, orphan recovery, nomination fence, speech outbox, delivery reservation, recovery suppression.  
**S28.** Occupant calibration is not identity.  
**S29.** Private cognition and silence can be successful settlement.  
**S30.** Persistent internal state must causally enter later settlement or not exist.  
**S31.** An utterance in the evidence log is not proof of its content. Tools and perception are fallible. Ledger conclusions are not world evidence.

---

# SECTION 27 — EXPERIMENT REGISTER

| ID | Question | Not architecture? |
|---|---|---|
| E1 | ACK bypass vs always Thought | ACK remains experiment; baseline always settlement |
| E2 | One call settlement+draft vs settle-then-draft | Escalation allowed; both same mind |
| E3 | Tools-in-Thought vs explicit multi-pass | |
| E4 | Always-on N | Governor must not evict last N |
| E5 | Detectors vs human leak labels | |
| E6 | Occupant swap divergence | |
| E7 | Admission duplicates / paraphrase | Keys from Thought, not transcript admission |

**Add E8:** idle cadence/budget (when to tick), not whether idle-if-grounded exists.

**Not experiments:** atomic semantic txn; admission fence; outbox; idle-if-grounded vs coma; draft/commitment conflict = no send; sidecar shadow.

---

# SECTION 28 — OPEN IMPLEMENTATION PARAMETERS

Not architectural uncertainty:

- N (last turns), occupancy compact K, revision cap (default 2), idle tick interval and compute budget, max subscriptions, miss-round cap on ordinary turns  
- Thought occupant (20B vs frontier) — swap uses bounded OCCUPANT CONTRACT WITNESS, not a live rerun of this suite  
- Q3/Q5/live quota ceilings (owner/config; see QUALIFICATION_PROTOCOL E12–E16 / quota budget)
- Tool-cycle deadline (must exceed 6s when effects run)  
- Optional Expression on/off per medium  
- Shadow duration, quarantine import lists  
- Retention/redaction windows  
- Exact detector lexicons (quality, not graph)

---

# SECTION 29 — ARCHITECTURAL FREEZE CANDIDATES

Now frozen:

- Single Thought author per generation; settlement publication; operational intent rules  
- No preprocessor mind; starved optional Expression; default Thought draft  
- Authority codes + dispatch recheck  
- Off-path fenced admission; no Belief class at cutover; dimensional epistemology  
- State taxonomy §10–11 (concern lineage + occupancy)  
- Idle-if-grounded + Thought subscriptions; no interestingness engine  
- Atomic semantic txn; outbox; inbox compose; recovery suppression  
- Retrieval fallbacks; trigger terms always in query  
- Sidecar shadow; cutover freeze; no hybrid turn  
- Laws S1–S31  
- Core vs maturation vs research split  
- Acceptance suite including A–L  

Empirical: §27–28. Research: affect, ACK bypass.

---

# SECTION 30 — FINAL READINESS VERDICT

**READY FOR IMPLEMENTATION-GRADE SPECIFICATION**

The v0.2.1 corrections compose: idle does not score; subscriptions do not speak; occupancy does not duplicate content; outbox does not re-think; admission cannot outrun supersession; shadow does not freeze a live companion; effects can run without pretending OCC is the only semantic moment.

**Frozen for spec:** Section 29 list.

**Empirical parameters:** Section 28 / E1–E8.

**Future research:** affect as self-state; ACK bypass; any live interest classifier (still rejected unless it collapses to mechanical subscription+Thought).

Next artifact is the implementation-grade specification, not code in this turn.