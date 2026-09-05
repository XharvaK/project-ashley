# Ashley Event Fabric and Architecture Freeze Review

**Status:** Architecture research and freeze only. This document does not
authorize implementation, installation, activation, credential use, Discord
send, Sandbox M5, Git effects, deployment, promotion, an event bus, schema
migration, or any external effect.

**Date:** 2026-08-23

**Predecessors (separate change sets, not required in this tree):**

- `docs/handoffs/ashley-architecture-completeness-audit.md`
  — no additional Authority-class kernel; self-change is a future lifecycle
  chokepoint, not a peer kernel.
- `docs/handoffs/ashley-functional-layer-completeness-research.md`
  — no new cognitive functional layer before later named phases; missing
  maturation of existing owners, not additional faculties.

**Question asked here:** does Ashley need an internal event substrate/fabric
as *infrastructure* to coordinate existing layers as the system grows?

**Question not asked here:** whether another kernel, cognitive faculty, or
abstraction layer is missing. Those audits already answered no. This pass
does not reopen them.

**Classification if later designed:** operating-system primitive, not a
cognitive organ. That distinction is part of the freeze, not a slogan.

**Live evidence for this pass**

| Fact | Authority | Value in this pass |
|---|---|---|
| Repository HEAD | Git | `9e930db2e55770657063ceae9a6766eab2e687b7` (`origin/master`) |
| Kernel-completeness verdict | predecessor audit | Current-phase kernel set complete; self-change is a future lifecycle chokepoint |
| Functional-layer verdict | predecessor research | No new peer faculty before later named phases |
| Observability ownership | `docs/architecture/Ashley_Observability_Plane.md` | Each semantic owner owns emitted facts. `LOG PRESENCE IS NOT EVENT AUTHORITY`. `TELEMETRY IS NOT EVIDENCE` |
| Cross-phase effect laws | `docs/architecture/Ashley_Cross_Phase_Architecture.md` | `RECEIPT IS NOT EFFECT WITNESS`. `PREPARE -> REVALIDATE -> COMMIT FOR CONSEQUENTIAL EFFECTS`. Persisted lineage is not live control authority |
| External effect plane | `docs/architecture/External_Effect_and_Authority_Architecture.md` | `EffectIntent` is not executable. A receipt is not an Effect Witness. Ambiguous effect → `OUTCOME_UNKNOWN` / reconcile, never blind retry |
| Operational Continuity contract | `docs/architecture/Operational_Continuity_Architecture.md` | Planned. Durable work is not Mind State. No general engine in current source |
| Historical “Event Fabric” usage | `docs/architecture/research/Operational_Continuity_01_Codebase_Reconnaissance.md` §13 | Incoming-event classification + durable inbox (`OPCONT-01B`). `EVENT != INSTRUCTION`. Not a pub/sub brain |
| Owner-selected delivery after Sandbox | `docs/architecture/Ashley_Architecture_Roadmap.md` §4–5 | Sandbox Autonomy → Model Fabric is `OWNER_SELECTED_IMPLEMENTATION_ORDER`, not semantic parent |
| M4 production acceptance | `docs/handoffs/M4_PRODUCTION_ACCEPTANCE.md` | `PROPOSED FOR ACCEPTANCE`. Not `PRODUCTION ACCEPTED` |
| M3 production acceptance | M4 packet predecessor claim | Linked `docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md` is **absent**. Treat as `UNKNOWN` |
| In-process concurrency | `apps/agent-service/src/core/runtime.ts` | In-memory `activeOwners`; concurrent chat throws `chat_in_progress`. Not a durable inbox |

Architecture status is not delivery status. Source presence is not deployment.
A freeze in this handoff is not a merged Cross-Phase law until that document
is updated by a later, explicit change.

---

## 0. Method and bar

An event fabric is justified only if it owns a *coordination* distinction that
existing owners cannot keep honest as causal chains span process, wait, crash,
and multiple ledgers.

| Keep direct ownership only | Add a fabric now | Design a spine later |
|---|---|---|
| In-process calls still make ownership obvious | Cross-owner causality is already unanswerable on current workloads | Current ledgers suffice, but later phases will need joinable transition facts |
| A bus would hide who decided | Replay or recovery is a present production blocker | Observability already forbids a global event authority |
| Every mutation-as-event would explode | Subscribers must act for the system to work | Events may be observed; owners still act |

This pass prefers an operating-system primitive over a new organ. It prefers
honest coupling over hidden control flow.

---

## 1. Event Fabric recommendation

**Design later.**

Not **Add now**. Not **Reject**.

The later object is a **typed event spine**: immutable records of *critical
state transitions*, used for evidence, trace, reconstruction, and observation.

It is not:

- a cognitive layer;
- an authority layer;
- a decision maker;
- a global dispatcher that other layers must route through;
- a replacement for owner-specific ledgers;
- a pub/sub brain.

```text
RECOMMENDATION
  Design later: typed event spine (Option C)
  Control model remains: direct ownership (Option A)
  Rejected as control model: full event-driven bus (Option B)
```

If that spine is designed, treat it as closer to an operating-system primitive
than to a cognitive organ. Owners emit. Subscribers observe. Authority,
Thought, Agency, Memory, and Sandbox keep deciding, asserting, and witnessing
in their own stores.

---

## 2. Does Ashley already have an event fabric?

**No coherent typed event model exists.** What exists are owner-specific
ledgers, phase records, and in-memory triggers. That is closer to **C**
(intentional separation) with a growing **B** risk (disconnected triggers that
will be hard to join) than to **A** (one event model under different names).

### 2.1 Inventory

| Concept | Where it lives today | What it actually is | A / B / C |
|---|---|---|---|
| Conversation / turn intake | Discord DM → `POST /chat/text`; `runPerceptionTurn` | Direct call into Perception, then Thought | C. Intake is owned. Not a typed Ashley Event |
| In-flight chat exclusion | `runtime.ts` `activeOwners` / `chat_in_progress` | Process-local lock | B for crash/mid-flight input. C for current single-host exclusion |
| Proactive ticks | Agency eligibility → `decide` | Timer is not Agency. Direct ownership | C |
| Curiosity pipeline | scan → rank → choose → fetch → extract → record → form take → consolidate → motivate | Owned pipeline into Agency motivations | C. Takes are evidence, not a bus |
| Delivery / bubble receipts | `delivery_reservations`, bubble receipts, `recordPhaseLifecycle` | Transactional delivery ledger + turn-phase envelope | C. Strong local trace. Not a cross-owner fabric |
| Capability effects | `capability_events` via `recordEvent` in `apps/agent-service/src/core/rollout/capabilities.ts` | Capability-scoped audit ledger | C. Provenance, not a dispatcher |
| Attention admission | `attention_requests` | Resource/quota ledger | C. Dispatch admission, not salience |
| Sandbox receipts / operational truth | Sandbox V2 licenses, observations, `deriveOperationalTruth` | Owner-specific execution evidence | C. `RECEIPT IS NOT EFFECT WITNESS` already frozen |
| Agency decisions | `logDecision`; `deriveEffectIntent` is zero-authority | Decision records | C |
| Reflection outcomes | `reflection_events` (`initiative_reaction`) | Post-outcome calibration records | C. No current-turn authority |
| Relationship changes | relationship tables + `relationship_motivation_claims` | Owned records; motivations into Agency | C |
| Memory writes | nuclear evidence tables; live/shadow provenance | Owner writes. Influence materializers require `live` | C. Writes are not events-as-truth |
| Authority decisions | Architecture freeze on a separate branch; not runtime on this `master` | Exact-effect permission when present | C. Must never become “an event existed” |
| Continuity events | `continuity.db` lineage, forget, sessions | Same-entity sidecar | C. Not an event bus |
| Change-proposal / external-agency “events” | payload-sanitized helpers | Local payload hygiene, not a global bus | C |
| Observability / diagnostics | owner-scoped GET surfaces | Projections of owned records | C. Correlation IDs sketched; no unified spine |
| Operational Continuity | planned contract; domain-specific jobs in source | Future durable work, not implemented fabric | C as contract. Gap as recovery inbox |

### 2.2 Verdict on the three options

**A — already a coherent event model under different names.** False.

The tables above are not one schema with aliases. They do not share a typed
envelope, a single store, or a rule that “every critical transition emits.”
Delivery phases, capability events, and continuity lineage answer different
questions. Joining them today is archaeology, not a contract.

**B — disconnected triggers that will become difficult to maintain.** Partly
true as *scale risk*, not as current failure.

Current Ashley is a single-host Discord companion with bounded in-process
calls. Direct ownership is still readable. The B-risk appears when a chain
must span:

```text
Discord message
  -> perception
    -> thought
      -> agency decision
        -> authority grant
          -> effect
            -> receipt
              -> witness / reconcile
                -> reflection
```

Those steps already exist as separate owners. They are not one reconstructable
object. Sandbox M7, Operational Continuity, connectors, and Computer Use make
that join the normal case.

**C — intentionally separate because ownership boundaries require
separation.** True, and must stay true.

Observability already forbids a global event authority. Semantic owners write
authoritative domain records first. Telemetry may observe committed results.
That order must not reverse.

```text
DOMAIN TRANSITION
  -> AUTHORITATIVE DOMAIN RECORD
    -> REDACTED DIAGNOSTIC PROJECTION
      -> OPTIONAL TELEMETRY EXPORT
```

A later spine may *correlate* those records. It may not become the record.

### 2.3 Historical name collision

Research already used “Event Fabric” for a narrower Operational Continuity
object: classify incoming owner input (`EVENT != INSTRUCTION`) and persist a
durable inbox before acknowledgement (`OPCONT-01B`), replacing the in-memory
`chat_in_progress` lock.

That historical name is **not** this freeze’s object.

| Historical “Event Fabric” (recon) | This freeze’s typed event spine |
|---|---|
| Incoming-event classification + mid-flight inbox | Immutable critical-transition facts across owners |
| Bound to Operational Continuity work loop | Bound to observation, reconstruction, and recovery correlation |
| Must not bypass capability or commit validation | Must not authorize, decide, assert, or witness |

Both remain infrastructure. Neither is a brain. They may later share a
correlation envelope. They must not be merged into one dispatcher that
“handles everything that happens.”

---

## 3. What problem would a fabric solve?

Evaluate the four claimed gains. A spine is only justified where the gain is
real *and* does not require giving the spine ownership.

### 3.1 Traceability — yes, later

Can Ashley answer “what happened that caused this current state?”

**Today, inside one owner: often yes. Across owners: only by investigator
join.**

Delivery `recordPhaseLifecycle` can say a turn admitted perception, thought,
sandbox, expression, transport. Capability `capability_events` can say a
release was promoted. Agency can log a decision. Sandbox can derive
operational truth. Continuity can show lineage.

None of those systems is required to point at the others with a stable
correlation identity that means the same thing. Observability already names
the distinct IDs (`correlationId`, `decisionId`, `deliveryReservationId`,
`effectIntentId`, `workConcernId`, …) and forbids collapsing them. The missing
piece is a disciplined *emission* of critical transitions that carry those
IDs without becoming a second store of meaning.

A spine would help traceability if it is a join index over owner records.
It would harm traceability if “the event” replaced the owner record.

### 3.2 Replayability — reconstruction, not re-execution

Can a future system reconstruct why a decision happened, what evidence
existed, what state existed, and what effect occurred?

**Partially today, by ledger. Not as a causal object. Never as blind replay
of effects.**

Reconstruction is a Memory Evidence + Observability + Operational Continuity
problem. Re-executing an effect because an event exists is an authority leak.

```text
RECONSTRUCT WHY
  != REPLAY EFFECT

EVENT SPINE MAY SUPPORT RECONSTRUCTION
  EVENT SPINE MUST NOT RE-COMMIT
```

Replayability is therefore a reason to **design later**, bound to
non-reexecution. It is not a reason to add a bus that subscribers use to
“do the side effects again.”

### 3.3 Decoupling — no, not as the control model

Can layers subscribe without calling each other?

The example:

```text
SandboxCompleted event
  -> Memory reacts
  -> Reflection reacts
  -> Observability reacts
```

**Reject this as the default control flow.**

Sandbox completion is a Sandbox-owned fact. Memory may *later* form evidence
from authorized observations. Reflection may *later* calibrate from committed
outcomes. Observability may *observe* the committed record.

If those reactions become implicit subscribers, the question “who decided to
write memory / reflect / update relationship?” has no owner. That is hidden
cognition. Direct calls, or explicit owner-initiated follow-on work after
the owning commit, keep the chain readable.

Decoupling is a software convenience. Ashley’s constraint is ownership.
Convenience loses.

Allowed later: **observe-only** subscribers (diagnostics, correlation, owner
projections). Disallowed: subscribe-to-act as the way Memory, Reflection,
Relationship, or Agency learn that something happened.

### 3.4 Temporal continuity — yes, but Operational Continuity owns the work

Does this help crash recovery, long-running processes, operational
continuity?

**The durable-work problem is already contracted.** Operational Continuity
owns work concerns, attempts, leases, resumption, cancellation, artifacts,
and effect reconciliation. The in-memory `chat_in_progress` lock is a known
gap for mid-flight owner input.

A typed spine can help *correlate* recovery scans with owner records. It
does not replace WorkConcern / WorkAttempt, delivery reservations, or
effect witnesses.

```text
JOB MUST CONTINUE
  != ASHLEY STILL CARES

DURABLE INBOX
  != EVENT BUS BRAIN

CRASH RECOVERY
  != EVENT AUTHORITY
```

Bind spine design to Operational Continuity and Observability. Do not create
a third durability owner.

### 3.5 Problem statement (what it may later solve)

| Problem | Spine may help | Spine must not become |
|---|---|---|
| Cross-owner “what caused this?” | Joinable transition facts | The meaning of what happened |
| Reconstruct decision context | Pointers to owner records and evidence IDs | A serialized Ashley mind |
| Survive crash / wait / resume | Correlation with work attempts and inboxes | Permission that outlives revalidation |
| Observe without scraping every table | Redacted projections from committed events | Control plane |

What it does **not** need to solve now: in-process layer calls on a
single-host Discord runtime with owner-specific SQLite ledgers.

---

## 4. Danger analysis

Do not recommend a fabric without naming how it fails. These dangers are why
the recommendation is **Design later** with a hard non-ownership list, not
**Add now**.

### 4.1 Event fabric becoming authority

Danger:

```text
Event exists
  -> everyone assumes it happened
```

But:

```text
EVENT != TRUTH
EVENT != PERMISSION
EVENT != MEMORY ASSERTION
EVENT != EFFECT WITNESS
EVENT != INSTRUCTION
LOG PRESENCE != EVENT AUTHORITY
```

**Boundary.**

An event is a *claim that a named owner committed a named transition at a
named time*, carrying correlation identifiers. It is evidence *that the owner
recorded a transition*, not proof of the world, not a grant, not an
assertion Ashley should believe, and not a witness that an external effect
occurred.

| If you need… | Ask… | Not… |
|---|---|---|
| May this exact effect happen now? | Authority Kernel | whether an event was emitted |
| Did the world actually change? | Effect Witness / reconcile | receipt or event |
| May this be remembered as a fact? | Memory Evidence + Honesty + live provenance | event existence |
| May this change behavior? | Capability influence gates | that a `capability_events` row exists |
| Should Ashley act? | Agency | that a tick or inbox item exists |
| Is this the same Ashley? | Continuity | a correlation ID |

Persisted events do not preserve live permission. Observability already says
correlation propagation does not preserve permission across a process
boundary or restart. The spine inherits that law.

### 4.2 Event fabric becoming hidden cognition

Danger:

```text
Event Bus
  -> Ashley brain
```

where everything routes through one central system that “decides what Ashley
thinks.”

**Avoid.** A dispatcher that chooses which layers run, in what order, from
event type, is Thought/Agency by another name. That would undo both prior
audits: it would be a new organ pretending to be infrastructure.

Allowed shape:

```text
Owner commits its record
  -> owner may emit a transition fact
    -> observers may correlate / project
      -> some other owner may *later* decide, using its own admission
```

Disallowed shape:

```text
Anything interesting
  -> bus
    -> Memory writes itself
    -> Reflection thinks
    -> Relationship updates
    -> Agency maybe sends
```

The test: if you cannot name which owner decided a follow-on write without
reading subscriber tables, the spine has become cognition.

### 4.3 Event explosion

Not every field mutation needs an event.

Emitting on every SQLite column change would:

- drown reconstruction in noise;
- invite treating chatter as evidence;
- couple storage internals to architecture;
- make “critical transition” meaningless.

**Emission rule (freeze):** only *critical state transitions* — admitted
decisions, authority outcomes, capability influence/execution changes,
effect prepare/commit/receipt/witness/reconcile, delivery reserve/send/
finalize, sandbox operational-truth changes, continuity forget/restore
watermarks, identity-review decisions, work-concern/attempt lifecycle.

Do not emit for:

- working-set / context projection churn (Context Budget);
- ranking cache or FTS updates (retrieval ≠ belief);
- telemetry samples (sampling must never decide whether an authoritative
  domain record is written);
- speculative model tokens;
- every Mind State affect tick unless it is a committed item transition.

Exact catalog is an unresolved design question. The freeze is the *bar*, not
the list.

### 4.4 Replay as re-effect

A reconstructable log is useful. A replay that re-sends Discord, re-runs
Sandbox, or re-commits Git because “the event is in the log” is an effect
authority bypass.

```text
REPLAY FOR UNDERSTANDING
  != REPLAY FOR EFFECT
```

Operational Continuity and External Effect already require revalidation
before commit. The spine must not grow a “redeliver all subscribers” path.

---

## 5. Compare architectures

### Option A — Current direct ownership

```text
Layer A
  |
  v
Layer B
```

**Advantages.** Simple. Explicit ownership. Matches nuclear stack, Honesty,
Authority, and Observability. Current source is already this.

**Risks.** Growing coupling as Sandbox M7, connectors, Computer Use, and
durable work add hops. Cross-owner “why” becomes tribal knowledge.

**Verdict.** Keep as the **control model**. In-process owners still call the
next owner. That is a feature.

### Option B — Full event-driven architecture

```text
Everything
  |
  v
Event Bus
  |
  v
Subscribers
```

**Advantages.** Decoupling, independent scaling, easy to add listeners.

**Risks.** Hidden control flow. Accidental authority (“it was on the bus”).
Dispatcher-as-brain. Event explosion. Hard to reason, which Ashley’s
governance explicitly refuses.

**Verdict.** **Reject** as Ashley’s control architecture. Single-host SQLite
does not need it. A persistent autonomous companion cannot afford it.

### Option C — Typed event spine

```text
Critical state transitions produce immutable events.

Events provide:
  - evidence that a transition was recorded
  - trace / correlation
  - reconstruction support
  - observation

Events do not:
  - authorize
  - decide
  - replace ownership
  - become memory assertions
  - become effect witnesses
```

**Fit.** Yes, as a later infrastructure primitive beside Observability and
Operational Continuity.

**Does not fit** as a thing to build during Sandbox, or as a way to skip
Memory Evidence maturation.

**Relation to A and B.** C is A plus a joinable audit/correlation spine. It
is not a polite name for B.

### Comparison

| | Option A now | Option B | Option C later |
|---|---|---|---|
| Who decides? | Named owner | Subscriber set / dispatcher | Named owner (unchanged) |
| Who records? | Named owner ledger | Bus plus subscribers | Owner ledger, then optional transition fact |
| Trace across owners | Manual | Central, but untrustworthy as meaning | Designed correlation |
| Authority leak risk | Low if owners stay honest | High | Manageable if non-ownership is enforced |
| Hidden cognition risk | Low | High | High if subscribers act; low if they only observe |
| Right time | Current phase | Never as control model | With Operational Continuity / recovery, not as a brain phase |

---

## 6. Updated Ashley architecture map

Do not mix these categories. A box may *use* another category. It may not
absorb it.

This map is a freeze of *kinds of owner*, not a claim that every box is
implemented, merged, or production-accepted.

### 6.1 Cognitive owners

These answer who Ashley is, what her condition is, what she considers, and
whether she pursues. None of them is infrastructure.

| Owner | Unique question |
|---|---|
| Identity | Who is she, stably? |
| Mind State | What is her current condition, concern, goal, commitment, unfinished cognitive work, affect? |
| Thought | What should be considered, and what intended outcome follows? |
| Agency | Whether, when, and whether not to act? |
| Reflection | What did that outcome mean for later Thought? No current-turn authority |
| Relationship | What mutual, reminder, tension, and withdrawal records exist? Motivations only, never auto-send |
| Curiosity | What is worth reading, and what grounded take follows? Never sends |

Supporting cognitive *mechanisms* that are not peer faculties (pass 2):

- Perception: turn intake for attachments, quotes, research intent.
- Open cognitive items: persisted unfinished cognition. Not Operational
  Continuity.
- Expression → Rendering: language then platform mechanics.

### 6.2 Boundary / control owners

These answer permission, release, isolation, and what must not be claimed.

| Owner | Unique question |
|---|---|
| Authority | May this exact external effect happen now? |
| Capability | May this named faculty influence or execute under current gates? |
| Sandbox | May this bounded engineering operation run, and what operational truth follows? |
| Honesty | Which claims may not be said? Never a grantor |
| Evaluation / Qualification | What exact-candidate evidence exists? Pass ≠ authority |
| Stewardship / owner authority | Consultation, stop, custody, promotion, apply-to-Ashley authorization |
| External Effect plane | Prepare, revalidate, commit, receipt, witness, reconcile |
| Attention (resource) | May this model dispatch proceed under lanes and quotas? Not salience |

Self-change remains a **composed lifecycle chokepoint** across Identity,
Stewardship, Evaluation, Continuity, Authority, and Sandbox M5/M7. It is not
a seventh kernel and not an event-spine feature. Cross-Phase §6.1 already
owns that composition research.

### 6.3 Persistence / evidence owners

These answer what is stored, what is asserted, what is merely retrievable,
and whether this is the same Ashley.

| Owner | Unique question |
|---|---|
| Memory / Evidence | Canonical source vs assertion vs retrieval index. Retrieval hit ≠ belief |
| Continuity | Same-entity lineage, forget, sessions, backup watermarks |

Delivery reservations and effect witnesses remain **owned evidence** of
their planes. They are not Memory Assertions and not Continuity.

### 6.4 Infrastructure substrates

These provide mechanism. They do not own meaning, permission, or “what
Ashley thinks.”

| Substrate | Unique question | Status in this freeze |
|---|---|---|
| Event spine (this pass) | How are critical owner transitions correlated, reconstructed, and observed without becoming a brain? | **Design later** |
| Operational Continuity | What operational work exists across wait, crash, cancel, and ambiguous effect? | Planned phase. Durable work ≠ cognition |
| Context Budget | Which bounded projection of persistent state is in attention now? Eviction ≠ forgetting | Planned. `HARD_DEPENDENCY` on Memory / Evidence |
| Model Fabric | How are provider-neutral model attempts dispatched, receipted, and cancelled? | Owner-selected next delivery after Sandbox. Mechanism, not semantic parent of cognition |
| Observability | How are owned facts inspectable without becoming evidence or permission? | Authoritative plane already. Not the event spine |

```text
INFRASTRUCTURE
  != COGNITION
  != AUTHORITY
  != MEMORY ASSERTION

EVENT SPINE
  != OPERATIONAL CONTINUITY
  != OBSERVABILITY EXPORT
  != MODEL FABRIC
```

Observability may consume spine facts as one projection source. Operational
Continuity may correlate attempts to spine facts. Neither owns the other’s
question.

### 6.5 How they sit together

Control flow (Option A) stays vertical among cognitive and boundary owners:

```text
Identity + Mind State
        |
        v
     Thought
        |
        v
     Agency
        |
        v
   Authority
        |
        v
 Capability / Sandbox / connectors
        |
        v
  receipt / witness / reconcile
        |
        v
     Evidence
        |
        v
     Honesty
```

The spine, if later designed, sits *beside* that chain as a correlation
primitive, not above it:

```text
Owner transition (committed)
        |
        +--> owner ledger (authoritative)
        |
        +--> typed event spine (optional, immutable, non-authorizing)
                    |
                    +--> Observability projection
                    +--> recovery / reconstruction join
                    +--> observe-only diagnostics
```

Curiosity, Relationship, and Reflection feed Agency as motivations or later
calibration. They do not subscribe to a bus to become Agency.

### 6.6 What this map refuses

- Event Fabric as a cognitive owner.
- Event Fabric as a seventh kernel or Authority substitute.
- Model Fabric, Context Budget, or Operational Continuity as Thought.
- Observability as Memory or Effect Witness.
- Mixing Memory Evidence with Continuity, or either with the event spine.

---

## 7. Roadmap implications after Sandbox

This section updates **planning priorities**. It does not authorize work, does
not reorder the canonical roadmap’s `OWNER_SELECTED_IMPLEMENTATION_ORDER`
edges, and does not start Memory Evidence, Event spine, or self-change
implementation.

Current delivery focus remains Sandbox Autonomy. M4 on this tree is
`PROPOSED FOR ACCEPTANCE`, not `PRODUCTION ACCEPTED`. M5 authorship stays
advisory. M7 remains named engineering borders. Do not infer apply-to-Ashley
from M5/M7.

### 7.1 Two orders that must not be collapsed

| Order | What it is | What it is not |
|---|---|---|
| Owner-selected delivery | Sandbox Autonomy → Model Fabric → Operational Continuity, as already classified | Proof that Model Fabric is the next *cognitive* substance |
| Architecture-justified substance | What must mature before advanced autonomy is honest | A silent rewrite of the canonical roadmap |

Sandbox Autonomy → Model Fabric remains `OWNER_SELECTED_IMPLEMENTATION_ORDER`.
Model Fabric does not derive authority from Sandbox. Parallel mechanism work
may proceed if the owner selects it. This freeze does **not** tell the owner
to abandon that delivery choice.

It does say: after Sandbox, **do not jump to Learned Autonomy, Cognitive
Graduation, or Relational Graduation**, and **do not insert a new Event
Fabric phase** as if it were a faculty.

### 7.2 Before advanced autonomy

Architecture-justified next substance, independent of whether Model Fabric
is implemented as a mechanism in parallel:

1. **Memory / Evidence maturation**  
   `HARD_DEPENDENCY` for Learned Autonomy and Cognitive Graduation.
   Assertions vs source vs index, contradiction, forgetting, live/shadow.
   Pass 2 already named this as the next cognitive-track substance.

2. **Self-change lifecycle specification**  
   Composition research already named in Cross-Phase §6.1 and Roadmap
   Self-Change Governance (`HIGH-VALUE NEXT RESEARCH`). Required before any
   apply-to-Ashley path. Does not block M5 authorship. Does not become a
   kernel or an event-spine feature.

3. **Typed event spine — design later**  
   Adjacent to Operational Continuity and Observability. Not a new roadmap
   phase. Not a brain. First honest slice is likely correlation + recovery
   join, plus the already-named durable inbox for mid-flight input — still
   without subscribe-to-act.

4. **Context Budget**  
   `HARD_DEPENDENCY` on Memory / Evidence. `CROSS_CUTTING_INTERFACE` on
   Model Fabric `ContextProjection` transport. Eviction is not forgetting.

5. **Operational Continuity**  
   Durable work, crash, mid-flight input, ambiguous-effect reconcile.
   `EVIDENCE_DEPENDENCY` for unattended learning and multi-step Computer Use.
   Durable work is not Mind State.

Suggested relative order among those five:

```text
Memory / Evidence maturation
        |
        +--> Context Budget
        |
Self-change lifecycle spec  (before any apply-to-Ashley; parallel to cognitive track)
        |
Operational Continuity implementation
        |
        +--> event spine design (with OPCONT / Observability, not before they have a question to answer)
```

Design the spine when recovery and cross-owner trace are real requirements,
not as speculative pub/sub during Sandbox.

Model Fabric may sit beside this list as owner-selected mechanism work. It
is not a substitute for Memory / Evidence.

### 7.3 Later autonomy

| Phase | Remains | Must not start just because Sandbox completed |
|---|---|---|
| Learned Autonomy | After Memory / Evidence can support attributed, non-time-shifting influence | Yes: do not start now |
| Cognitive Graduation | After Memory / Evidence and Learned Autonomy | Yes |
| Relational Graduation | Sibling of Cognitive Graduation; `HARD_DEPENDENCY` on relationship-state foundation and Memory / Evidence | Yes as a graduation; recording already exists |
| Model Fabric | Mechanism; owner-selected after Sandbox | No semantic block from this freeze; not advanced autonomy |

Procedural Skill Graduation and Computer Use stay on their existing edges.
Computer Use has a `HARD_DEPENDENCY` on External Effect and Authority.
Procedure is preferred mechanism, not semantic parent.

### 7.4 Deferred

- voice;
- Computer Use as current work;
- broad external tools / generic agency;
- self-modification **execution** (apply-to-Ashley).

These remain real later functions. They are not unlocked by an event spine.

### 7.5 What not to do after Sandbox

- Do not add an Event Fabric implementation slice “to get ahead.”
- Do not treat Model Fabric completion as cognitive graduation.
- Do not treat M5 authored change-sets as self-change authority.
- Do not invent Perception, Salience, Belief, Planning, or Learning peers
  (pass 2).
- Do not invent a seventh kernel (pass 1).
- Do not replace owner ledgers with a bus.

---

## 8. Frozen decisions, unresolved questions, future research

### 8.1 Architecture frozen by this series

Reaffirmed from passes 1–2, plus this pass:

| Decision | Origin |
|---|---|
| No additional Authority-class kernel | Pass 1 |
| Self-change is a composed lifecycle chokepoint, not a peer kernel | Pass 1 / Cross-Phase §6.1 |
| Communication is an Authority policy consumer, not a speech kernel | Pass 1 |
| No new cognitive faculty or layer before later named phases | Pass 2 |
| Missing work is maturation of existing owners | Pass 2 |
| Tool present ≠ authority; salience ≠ permission; retrieval ≠ belief; receipt ≠ witness; approval ≠ execution; telemetry ≠ evidence | Cross-phase / prior freezes |
| Direct ownership remains the current **control** model | This pass |
| Full event-driven bus is rejected as control architecture | This pass |
| Typed event spine is **Design later**, not Add now, not Reject | This pass |
| If designed, the spine is an OS primitive, not a cognitive organ | This pass |
| Events do not authorize, decide, replace ownership, assert memory, or witness effects | This pass |
| Not every field mutation emits an event; only critical transitions | This pass |
| Observe-only consumers are allowed; subscribe-to-act is not the default | This pass |
| Spine is not a new roadmap phase and not a substitute for Memory / Evidence | This pass |
| Owner-selected Sandbox → Model Fabric delivery is not overridden here | Roadmap §4; this pass |
| After Sandbox, do not jump to Learned Autonomy / Cognitive Graduation | This pass |
| Historical recon “Event Fabric” (inbox) ≠ this spine; do not merge them into a brain | This pass |

### 8.2 Unresolved design questions

These are named so they are not invented silently. They are not tasks to
implement now.

- Exact emission catalog: which transitions are “critical.”
- Spine schema and versioning.
- Store location: `nuclear.db` vs Continuity sidecar vs Observability-only
  projection. Lean against a fourth database unless ownership requires it.
- Whether `OPCONT-01B` durable inbox is the first slice of the spine, a
  narrower Operational Continuity object, or both sharing a correlation
  envelope.
- How the Observability correlation envelope relates to semantic ledgers
  without collapsing IDs (plane already sketches the IDs).
- Whether Cross-Phase should later receive explicit `EVENT != TRUTH` /
  `EVENT != PERMISSION` laws, or keep them in this freeze until spine design.
- Post-Sandbox **delivery** choice: owner-selected Model Fabric first vs
  architecture-justified Memory / Evidence first. This freeze refuses to
  pretend they are the same question.
- Reconstruction API vs owner diagnostic GETs: who may join, under what
  redaction.

### 8.3 Future research areas

- Spine emission catalog against live owner ledgers (delivery, capability,
  sandbox operational truth, agency decisions, continuity).
- Reconstruction without re-execution: fixtures that prove a join cannot
  commit.
- Subscriber policy: observe vs act; fail the latter in design review.
- Crash-recovery join: WorkAttempt × delivery × effect witness × spine.
- Ingress typing when connectors / Computer Use exist — interface
  convention, still not a Perception kernel (pass 2).
- Relationship between Memory Evidence *source events* (what was observed)
  and spine *transition facts* (what an owner committed). They must not
  collapse. Source evidence ≠ world truth remains Memory’s law.
- Self-change composition (already `HIGH-VALUE NEXT RESEARCH`). Not an event
  problem.

---

## 9. Direct answers

**Does Ashley need a typed internal event model?**

Not as a brain, not as authority, not as current work. Later, as a typed
spine of critical transitions, if and when cross-owner reconstruction and
operational recovery need a join that owner ledgers cannot honest-join
alone.

**Add now / Design later / Reject?**

**Design later.**

**What problem it solves.**

Joinable trace, reconstruction support, and observation of committed owner
transitions as the system becomes a long-lived autonomous process.

**What it must never own.**

Permission, decision, memory assertion, effect witness, Thought, Agency,
or “what happened in the world.”

**Objective of this freeze.**

Keep Ashley simple enough to reason about, and structured enough to survive
persistence without hidden coupling or authority leaks.
