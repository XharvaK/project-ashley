# Ashley Functional Layer Completeness Research

**Status:** Architecture research only. This document does not authorize
implementation, installation, activation, credential use, Discord send,
Sandbox M5, Git effects, deployment, promotion, or any external effect.

**Date:** 2026-08-23

**Predecessor:** [Ashley Architecture Completeness Audit](ashley-architecture-completeness-audit.md)

**Question asked here:** what functional layers a persistent cognitive entity
needs, and whether any are missing enough to design before later named phases.

**Question not asked here:** whether another Authority-class kernel is missing.
That audit already answered no.

**Live evidence for this pass**

| Fact | Authority | Value in this pass |
|---|---|---|
| Repository HEAD | Git | `9e930db2e55770657063ceae9a6766eab2e687b7` (`origin/master`) |
| Kernel-completeness verdict | predecessor audit | Current-phase kernel set complete; self-change is a future lifecycle chokepoint, not a peer kernel |
| Memory / Evidence contract | `docs/architecture/Ashley_Memory_Evidence_Architecture.md` | Source evidence ≠ assertion ≠ retrieval. Retrieval hit ≠ belief |
| Learned Autonomy contract | `docs/architecture/Learned_Autonomy_Architecture.md` | Deferred phase. Distributes learning across existing owners |
| Cognitive Graduation contract | `docs/architecture/Cognitive_Graduation_Architecture.md` | Deferred integration phase. Does not create a super-owner |
| Context Budget contract | `docs/architecture/Context_Budget_Architecture.md` | Deferred attention-allocation policy over persistent state |
| Perception in source | `apps/agent-service/src/core/perception/` | Turn intake for attachments, quoted reads, research intent |
| Attention in source | `apps/agent-service/src/core/attention/` | Model-dispatch admission, lanes, quotas, starvation |
| Affect in source | `apps/agent-service/src/core/state/affect.ts` | Valence, activation, openness, tension under Mind State |
| Capability self-description | `apps/agent-service/src/core/perception/capability-self-model.ts` | What current capabilities may influence |
| Open cognitive items | `apps/agent-service/src/core/cognition/open-items.ts` | Persistent questions, revisits, concerns |

---

## 0. Method and bar

A functional layer is justified only if it owns a distinction that would
otherwise collapse.

| Keep or mature in place | Add or design as a new layer |
|---|---|
| The question already has an owner | The question has no owner, or the owner would have to violate its own boundary to answer it |
| Later named phases already mature that owner | Waiting for a later phase would force a wrong owner to paper over the gap |
| A new name would only relabel existing work | Ashley would be less capable or less safe without the distinction |

This research prefers honest ownership over a larger diagram.

---

## 1. Current Ashley Layer Map

Layers that already exist as architecture, source, or both. “Kernel” is not
required. Status is ownership, not production maturity.

### 1.1 Cognitive core

| Layer | Unique problem | Question it answers |
|---|---|---|
| Identity | Stable who-Ashley-is across time | Who is she, what does she hold as values and boundaries? |
| Mind State | Dynamic condition without rewriting Identity | What is her current condition, concern, goal, commitment, unfinished work, affect? |
| Thought | Bounded reasoning and evidence selection | What should be considered, and what intended outcome follows? |
| Agency | Choice among motivations | Whether, when, and whether not to act? |
| Reflection | Post-outcome calibration | What did that outcome mean for later Thought? No current-turn authority |
| Honesty | Negative truth control | Which claims may not be said? Never a grantor |

### 1.2 World, evidence, and persistence

| Layer | Unique problem | Question it answers |
|---|---|---|
| Memory / Evidence | Durable record vs interpretation vs index | What is stored, what is asserted, what is merely retrievable? |
| Continuity | Same-entity lineage | Is this the same Ashley across process, restore, and forget? |
| Open cognitive items | Unfinished cognition across time | Which questions, revisits, and concerns remain open, delayed, or due? |

### 1.3 External coupling

| Layer | Unique problem | Question it answers |
|---|---|---|
| Authority | Exact external-effect permission | May this exact external effect happen now? |
| Capability | Release and influence of named faculties | May this faculty influence behavior under current gates? |
| Sandbox | Bounded engineering execution | What candidate engineering work may run, verify, or later take effect? |
| Perception | Untrusted sensory and fetch intake | What attachments, quoted pages, and research fetches become licensed inputs this turn? |
| Expression | Intentional wording | How should authorized meaning be said? |
| Rendering | Platform mechanics | How is that wording carried on Discord? |

### 1.4 Relationship and motivation feeds

| Layer | Unique problem | Question it answers |
|---|---|---|
| Relationship | Shared history, commitments, tension, withdrawal | What is the relational standing with Doc, without reducing it to scores? |
| Curiosity | Intrinsic unknown-reduction | What is worth reading or asking because it is unknown, not because it fills a conversation? |

### 1.5 Resource, qualification, and custody

| Layer | Unique problem | Question it answers |
|---|---|---|
| Attention (resource plane) | Finite model dispatch | Which admitted job may consume which lane, quota, and deadline? |
| Context Budget (contracted, not delivered) | Finite context | Which eligible persistent state enters this model-facing projection? |
| Evaluation | Qualification claims | What exact candidate is qualified for what claim? |
| Stewardship | Operator custody | What may Doc decide, stop, or consult without owning Ashley? |
| Operational Continuity (contracted) | Durable work ≠ durable cognition | How does a work concern survive crash, wait, and resume? |
| Model Fabric (contracted) | Provider mechanism | How is a model call dispatched without owning meaning? |

### 1.6 Distinctions the current map already protects

```text
raw Discord text / attachment / fetch
        != licensed perception input
        != source evidence
        != memory assertion
        != belief
        != motivation
        != Agency admission
        != Authority grant
        != executed effect

Identity != Mind State != self-description of current faculties
Memory of what happened != interpretation of what it meant
Thought (consider) != Agency (pursue) != Operational work (durable task)
Curiosity != Agency
Reflection != current-turn Thought
Attention quota != salience != permission
Context eviction != forgetting
```

Those distinctions are the completeness bar. New layers must earn a seat by
protecting one of them, or a missing one of equal weight.

---

## 2. Candidate Missing Layers

Recommendation vocabulary:

| Recommendation | Meaning |
|---|---|
| Add now | Design as a named layer before later phases proceed |
| Design later | Real function; mature under an already-named owner or phase |
| Keep as existing responsibility | Already owned; a new name would duplicate |
| Reject | Unnecessary abstraction or harmful collapse |

### 2.1 Perception / input interpretation

**Problem solved.** Stop untrusted input from becoming fact, belief, or
command.

**Question.** What did the world present this turn, as observation, before
Thought treats it as meaning?

**Current owner.** Split, on purpose:

- Discord text and proactive wakes enter conversation / Agency triggers.
- `runPerceptionTurn` licenses attachments, quoted conversational reads, and
  research-intent fetches.
- Ethics: external entities are untrusted data, never authority.
- Memory / Evidence: source evidence ≠ world truth.
- Honesty: unlicensed activity and capability claims are stripped.

**Does a new layer clarify?** A *general* Perception box in front of all
cognition would either duplicate Honesty/Evidence or start owning meaning.
Artifact and fetch intake already has a perception boundary. System events,
sandbox receipts, and relationship events already have typed owners
(Operational Truth, Relationship, delivery). They should not be funneled
through a sensory Perception layer.

**Capability or safety gain?** Safety is already the Evidence + Honesty +
external-entity rule. Capability gain would come from more intake *kinds*
(vision, search) under the existing perception module, not from a new peer.

**Verdict on the four states.** Partially represented.

**Recommendation: Keep as existing responsibility.**

Do not add a peer Perception layer between every input and Thought. Keep
perception as the intake/licensing module it is. If later connectors and
Computer Use multiply event kinds, add a thin *ingress typing convention*
(observation vs request vs receipt vs command-shaped text). That is an
interface rule, not a cognitive layer. Design that convention when those
mechanisms exist, not before.

---

### 2.2 Attention / salience

**Problem solved.** Finite cognition must choose what occupies the field.

**Question.** What deserves cognitive priority right now?

**Current owner.** Three different functions currently share the English word
“attention”:

| Function | Owner |
|---|---|
| May this model job run under quota and lane? | `attention/` resource plane |
| What eligible state enters the prompt? | Context Budget (contracted); today Context Composer + Thought |
| What matters to Ashley as a person? | Mind State activation/urgency; Curiosity ranking; open-item wake selection; later learned salience |

Agency answers a fourth question: whether to pursue. That is not salience.

**Does a new layer clarify?** A Salience Layer would steal relevance from
Thought, urgency from Mind State, projection from Context Budget, and
admission from the attention resource plane. Learned salience is already
assigned to Mind State (active) and Memory Assertions (historical) by Learned
Autonomy.

**Capability or safety gain?** Safety: salience must never become permission.
That law already exists (`SALIENCE != PERMISSION`). Capability: Context Budget
and Learned Autonomy already name the missing *maturation*, not a missing
owner.

**Verdict.** Partially represented. Resource attention exists. Semantic
salience is distributed correctly and immature.

**Recommendation: Keep as existing responsibility.**

Do not mint an Attention/Salience peer. Do not confuse the dispatch governor
with “what matters.” Design later: Context Budget (projection) and learned
salience under Learned Autonomy / Cognitive Graduation, owned by Mind State
and Thought.

---

### 2.3 Belief / world model

**Problem solved.** Hold revisable views under uncertainty without treating
retrieval or model confidence as truth.

**Question.** What does Ashley currently hold, tentatively, about the world?

**Current owner.** Memory / Evidence owns assertions with provenance and
epistemic status. Thought adjudicates. Cognitive Graduation names working
beliefs and working theories *under those same owners*. Invariants already
freeze `RETRIEVAL HIT != BELIEF` and `SOURCE EVIDENCE != WORLD TRUTH`.

**Does a new layer clarify?** A Belief Layer beside Evidence would split the
assertion owner or freeze model output as a world model. Uncertainty and
confidence belong on assertions and Thought, not in a second store.

**Capability or safety gain?** Implementation of assertion/contradiction/
supersession is the real gap. That is Memory Evidence maturation, already a
hard predecessor to Learned Autonomy and Cognitive Graduation. A new Belief
kernel would make that worse: two writers of “what she thinks is so.”

**Verdict.** Partially represented as architecture; thin in source.

**Recommendation: Design later, as Memory Evidence maturation, not as a new
layer.**

Do not add a Belief / World Model peer. Do not design a belief graph before
assertion/contradiction/forgetting exist under Memory Evidence.

---

### 2.4 Planning

**Problem solved.** Persist how a desired future state might be reached across
turns.

**Question.** How, in steps, might this intended outcome be pursued?

**Current owner.**

| Kind of “plan” | Owner |
|---|---|
| What to consider now | Thought |
| Whether to act now | Agency |
| Unfinished cognitive thread | Open cognitive items (question / revisit / concern + delay) |
| Durable engineering/work steps | Operational Continuity (contracted); Sandbox M6 for bounded engineering loops |
| Standing aim | Mind State goal / unfinished |

Thought is not a planner. Agency is not a planner. Open cognitive items are
persistence of *unfinished consideration*, not milestones.

**Does a new layer clarify?** A Planning peer would either become a second
Agency or a second Operational Continuity. Cognitive multi-step persistence
already has a substrate (open items + Mind State). Work multi-step persistence
is Operational Continuity’s job.

**Capability or safety gain?** Long-horizon engineering needs Operational
Continuity, already named. Companion-scale “I will do X after Y” needs richer
Mind State / open-item use, not a plan object that can silently authorize
steps. A plan is not an Authority grant.

**Verdict.** Partially represented. Not missing an owner.

**Recommendation: Keep as existing responsibility; design later only as
records under current owners.**

Reject Planning as a peer layer. If later a milestone record is needed:

- cognitive aims and next considerations → Mind State + open cognitive items
- work stages → Operational Continuity

Thought still considers. Agency still admits. Authority still grants each
external step.

---

### 2.5 Goal management

**Problem solved.** Long-term objectives with a lifecycle.

**Question.** What is Ashley trying to bring about over time?

**Current owner.** Mind State item kind `goal` (also concern, commitment,
interest, unfinished) with `active` / `resolved` / `forgotten`. Relationship
commitments are relational, not personal goals. Curiosity interests are not
goals. Learned Autonomy: goal *candidates* owned by Thought until accepted
into Mind State. Cognitive Graduation: experience-derived goals remain Mind
State.

**Does a new layer clarify?** A Goal Management Layer would duplicate Mind
State. The missing richness is lifecycle vocabulary (candidate vs adopted vs
active vs abandoned), which Cognitive Graduation already allows Mind State to
mature.

**Capability or safety gain?** A goal is direction, not permission. Putting
goals in their own layer invites treating them as execution authority.

**Verdict.** Already owned. Lifecycle is coarse.

**Recommendation: Keep as existing responsibility (Mind State).**

Design later, inside Cognitive Graduation / Learned Autonomy: candidate →
adopted → active → completed/abandoned, still Mind State. Reject a Goal
Management peer.

---

### 2.6 Self-model

**Problem solved.** Distinguish who she is from what she currently can do,
knows she cannot do, and is in the middle of.

**Question.** What does Ashley justifiably believe about her present faculties,
limits, and situation?

**Current owner.**

| Content | Owner |
|---|---|
| Values, boundaries, identity development | Identity |
| Current projects, concerns, condition | Mind State |
| Which faculties may influence | Capability + `composeSelfCapabilityContext` |
| Current-turn mechanism facts | Operational Truth + Honesty |
| What own-time actually did | Own-time sessions; Honesty forbids fabricated presence |

The Identity / self-model distinction is real. The second half is already a
composition, not an orphan.

**Does a new layer clarify?** A Self-Model peer of Identity would start
rewriting Identity through the back door, or duplicate Capability/Honesty.

**Capability or safety gain?** Safety is Honesty plus capability self-
description. The remaining gap is evidence-bound *assertions about herself*
(limits, history of failures). That is Memory Evidence about the self, plus
Identity review when foundational.

**Verdict.** Partially represented by composition.

**Recommendation: Keep as existing responsibility.**

Reject Self-Model as a peer of Identity. Design later: self-related Memory
Assertions under Memory Evidence / Cognitive Graduation, never as a second
Identity.

---

### 2.7 Experience / lived continuity

**Problem solved.** Distinguish what happened from what it meant in an ongoing
life.

**Question.** Which events are merely stored, and which have been interpreted
as formative without fabricating a narrative?

**Current owner.** Episodes store what happened (summary, salience,
unresolved). Continuity stores lineage, not meaning. Reflection interprets
after outcomes. Memory Evidence owns interpretation as assertions with
provenance. Cognitive Graduation explicitly: an episode is not automatically
experience-derived meaning; lived-experience *links* join episodes, receipts,
reflections, and revisions without copying source truth.

**Does a new layer clarify?** An Experience Layer would either become a second
Memory or a license to generate autobiography. The needed object is a *link
with provenance*, already specified under Cognitive Graduation.

**Capability or safety gain?** Safety: narrative honesty. Architecture already
forbids implied unseen experience. Capability: Cognitive Graduation’s
lived-experience continuity, after Memory Evidence and Reflection are strong
enough.

**Verdict.** Partially represented. Meaning-links are contracted, not a missing
owner.

**Recommendation: Design later under Cognitive Graduation. Reject Experience
as a peer layer.**

Memory keeps “what happened.” Reflection plus assertions keep “what it meant.”
Continuity keeps “same entity.” Do not merge them.

---

### 2.8 Curiosity / exploration

**Problem solved.** Reduce uncertainty for its own reasons.

**Question.** What is unknown, worth reading, and worth remembering as a take?

**Current owner.** Curiosity pipeline: scan → rank → choose → fetch → extract
→ record → form take → consolidate → motivate → Thought. Consolidation may
propose interests, questions, and opinions; it does not admit speech or
effects. Agency still decides whether a take becomes pursuit.

**Does a new layer clarify?** Curiosity is already a functional architecture,
not “just a motivation bit.” Promoting it to a peer of Agency would let
unknowns authorize action.

**Capability or safety gain?** Strengthening ranking, source quality, and
take-grounding is implementation under the existing pipeline. Not a new layer.

**Verdict.** Present and correctly bounded.

**Recommendation: Keep as existing responsibility.**

Do not create another Agency. Do not design a separate Exploration kernel
before later phases.

---

### 2.9 Reflection / metacognition

**Problem solved.** Improve later reasoning from outcomes without seizing the
current turn.

**Question.** How did that thinking and acting go, and what should later
Thought change?

**Current owner.** Reflection: post-outcome, including initiative-reaction
learning. No current-turn authority. Cognitive Graduation: reflection-informed
future cognition, still not a current-turn command. Thought remains the owner
of present reasoning, including uncertainty.

**Does a new layer clarify?** In-turn “thinking about thinking” is Thought
(effort, evidence sufficiency, uncertainty). A Metacognition Layer with
current-turn power would violate Reflection’s boundary and compete with
Thought.

**Capability or safety gain?** Richer post-outcome evaluation (strategy, error
classes) can mature *inside Reflection* during Cognitive Graduation. Detecting
insufficient evidence mid-turn is already Thought’s job.

**Verdict.** Present; later expansion is the same owner.

**Recommendation: Keep as existing responsibility.**

Design later: broader post-outcome evaluation under Cognitive Graduation.
Reject a turn-taking Metacognition peer. Keep:

```text
Thought: solve and judge evidence now
Reflection: evaluate that process after the outcome
```

---

### 2.10 Emotion / affect

**Problem solved.** Dynamic internal signals that change priority without
becoming personality, leverage, or fake feeling.

**Question.** What is the current non-identity condition of activation,
tension, openness, and related urgency?

**Current owner.** Mind State. Source: `affective_state` (valence, activation,
openness, tension) with attributed events. Mind State items carry activation
and urgency. Ethics: grounded expression vs leverage. Honesty: do not
fabricate emotion.

**Does a new layer clarify?** An Emotion peer would anthropomorphize and split
Mind State. Functional signals already live there.

**Capability or safety gain?** Safety is the ethics/honesty pair, not a new
store. Capability: keep affect as Mind State condition that can bias
motivation scores, never Authority.

**Verdict.** Sufficiently owned.

**Recommendation: Keep as existing responsibility (Mind State).**

Reject a peer Emotion layer. Do not design “feelings” as a faculty. If affect
needs more structure later, it remains Mind State fields with provenance.

---

### 2.11 Memory subtype architecture

**Problem solved.** Different kinds of persistence (episode, fact, procedure,
relationship, identity, working set).

**Question.** Are those different owners, or different records?

**Current owner.**

| Proposed subtype | Actual owner |
|---|---|
| Experience / episodic | Episodes under Memory / Evidence |
| Semantic | Facts / assertions under Memory / Evidence |
| Procedural | Not memory. Future Procedural Skill Graduation: qualified reusable procedure, not “remembered how” |
| Relationship | Relationship layer |
| Identity | Identity layer |
| Working | Not memory. Context Budget / Context Composer: bounded projection. Eviction ≠ forgetting |

**Does splitting Memory into six layers clarify?** It would shatter the
Evidence owner and confuse projection with storage. The frozen Memory Evidence
model already has the useful split: canonical source, assertions,
rebuildable indexes, recall into Thought.

**Capability or safety gain?** No. Procedural skill must not hide inside
Memory (availability ≠ authority). Working context must not mutate Memory.

**Verdict.** Classification is useful as record *kinds*. Not as peer layers.

**Recommendation: Reject as separate layers.**

Keep typed records under Memory Evidence, Relationship, and Identity. Treat
working set as Context Budget. Treat procedure as Procedural Skill Graduation
when that phase is due.

---

### 2.12 Learning architecture

**Problem solved.** Change from experience without silent identity rewrite or
ungrounded behavior change.

**Question.** May this experience become a candidate, and may that candidate
change owned state?

**Current owner.** Distributed, by design:

```text
experience / evidence
  -> learning candidate (revision, take, opinion proposal)
    -> Evaluation / identity review where required
      -> owned state change (Identity, Mind State, Memory Assertion)
        -> later Agency may see a new motivation
```

Source already has `learning_revisions` with live/shadow, `applyEligibleRevisions`,
and identity review for foundational targets. Learned Autonomy is the phase
that matures this pipeline. It explicitly does **not** become an omnibus
learning store.

Self-change of Ashley-source/architecture remains the separate lifecycle
chokepoint from the kernel audit. Organic learning ≠ runtime/source change ≠
foundational Identity change.

**Does a Learning Layer before Learned Autonomy clarify?** It would become the
omnibus store the phase contract forbids, or relabel work already scheduled.

**Capability or safety gain?** Safety is provenance, review, and
live-vs-shadow. Those exist and must stay. Capability is Learned Autonomy,
after Memory Evidence can support attributed assertions.

**Verdict.** Pipeline present; phase contracted; not an unowned function.

**Recommendation: Keep as existing responsibility; do not add a Learning layer
before Learned Autonomy.**

Do not design a new Learning peer now. Do not collapse remembering, adapting,
identity change, and behavior change into one layer. Remembering is Memory.
Adapting is the revision pipeline. Identity change is Identity review.
Behavior change is owned-state change plus Agency. Changing Ashley herself is
the future self-change chokepoint.

---

## 3. Recommended Future Architecture

Optimize for clear ownership, not for fewer or more boxes.

### 3.1 Current (keep)

```text
Identity + Mind State (incl. affect, goals, concerns)
        ↓
     Thought
        ↓
     Agency
        ↓
   Authority Kernel
        ↓
 Capability / Sandbox / connectors
        ↓
     Evidence
        ↓
     Honesty

Supporting, not substitutes:
  Continuity, Relationship, Reflection, Curiosity,
  Perception (intake), Expression → Rendering,
  Attention (resource admission), Open cognitive items,
  Evaluation, Stewardship
```

### 3.2 Necessary future — maturations of existing owners, not new peers

These are required for a long-lived cognitive entity. They are already named.
They should not be redesigned as extra layers.

| Future need | Stays owned by | Named vehicle |
|---|---|---|
| Revisable assertions, contradiction, forgetting | Memory / Evidence | Memory Evidence maturation |
| Bounded projection of persistent state | Context Budget | Context Budget phase |
| Experience → candidate meaning → owned state | existing owners | Learned Autonomy |
| Working beliefs, lived-experience links, richer goals | Memory Evidence, Thought, Mind State, Reflection | Cognitive Graduation |
| Durable work across crash and wait | Operational Continuity | Operational Continuity phase |
| Qualified reusable procedures | Procedural Skill Graduation | that phase |
| Provider-neutral model dispatch | Model Fabric | Model Fabric phase |
| Apply-to-Ashley chokepoint | Identity + Stewardship + Evaluation + Continuity + Authority | Cross-Phase self-change composition |

```text
Memory Evidence maturation
        ↓
Learned Autonomy ─────────────┐
        ↓                     │
Cognitive Graduation          │
                              ├── Relational Graduation (sibling, not parent)
Operational Continuity ───────┘
        +
Self-change lifecycle before any apply-to-Ashley path
```

### 3.3 Deferred — real functions, still not new layers

| Function | When | Form |
|---|---|---|
| Working belief / hypothesis records | After Memory Evidence assertions | Assertion type + Thought adjudication |
| Lived-experience links | Cognitive Graduation | Provenance links, not a memoir store |
| Learned salience | Learned Autonomy | Mind State (active) + historical assertions |
| Goal lifecycle richness | Cognitive Graduation | Mind State statuses |
| Cognitive next-step records | When open items + Mind State prove insufficient | Records under those owners |
| Ingress typing for many effect sources | When Computer Use / connectors exist | Interface convention, not a Perception kernel |
| Richer Reflection error/strategy classes | Cognitive Graduation | Same Reflection owner, still no current-turn power |
| Self-related limitation assertions | With Memory Evidence | Assertions about self, Identity review if foundational |

### 3.4 Rejected as peer layers

Belief/World Model, Planning, Goal Management, Self-Model, Experience,
Emotion, Metacognition-during-turn, Curiosity-as-Agency, Salience-as-Agency,
six-way Memory split, Learning-as-omnibus.

### 3.5 What to design before later phases

**No new functional layer needs a design phase now that is not already a named
contract.**

The only design-before-M5-*apply* item remains the self-change **lifecycle
chokepoint** from the kernel audit. It is not a functional cognitive layer in
this list. M5 *authorship* stays unblocked.

On the cognitive track, the first thing that must exist before Learned Autonomy
and Cognitive Graduation is **Memory Evidence maturation** (assertions vs
source vs index, contradiction, forgetting). That is already a hard
dependency. It is not a newly discovered layer.

Do not insert Perception, Salience, Belief, Planning, or Learning boxes in
front of those phases. That would delay the real work and collapse owners.

---

## 4. Direct answers

**What would make Ashley a more complete persistent cognitive entity?**

Not more peers. Stronger existing distinctions:

- evidence that is not belief,
- Mind State goals that are not permission,
- Curiosity that is not Agency,
- Reflection that is not current-turn Thought,
- work continuity that is not cognition,
- experience meaning that is not generated autobiography,
- learning that cannot silently rewrite Identity or expand Authority.

**Is anything missing enough to design before later phases?**

No new functional layer. Yes, continue to treat Memory Evidence maturation as
the next cognitive-track architectural substance, and self-change composition
as the next *apply-to-Ashley* substance. Both are already named.

**Is Ashley missing a persistent-entity function the way she was missing
Authority?**

No. Authority was an unowned decision at the world boundary. The functions in
this pass are owned or already scheduled under their owners. The remaining
work is to let those owners grow without being renamed into a thicker stack.
