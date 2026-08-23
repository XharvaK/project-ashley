# Ashley Architecture Completeness Audit

**Status:** Architecture assessment only. This document does not authorize
implementation, installation, activation, credential use, Discord send,
Sandbox M5, Git effects, deployment, promotion, or any external effect.

**Date:** 2026-08-23

**Scope:** Decide whether Project Ashley is missing a foundational
architectural layer of the same kind as the Authority Kernel: a category of
decision with no explicit owner.

This is not implementation planning, roadmap execution, or feature invention.

**Live evidence for this pass**

| Fact | Authority | Value in this pass |
|---|---|---|
| Repository HEAD (this worktree at audit start) | Git | `9e930db2e55770657063ceae9a6766eab2e687b7` (`master`) |
| Authority Kernel freeze | `origin/cursor/authority-kernel-architecture-fe34` | Architecture freeze commits `d86d1a3`, `a0615f1`. Not merged into this `master` checkout. |
| Supported schema | `apps/agent-service/src/core/db.ts` | Source-derived. Not copied here. |
| M3 production acceptance | M4 packet predecessor claim | M4 packet records M3 `PRODUCTION ACCEPTED` at SHA `28e157a`. Linked `docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md` is **absent** from this worktree. Treat the linked file as `UNKNOWN`; do not upgrade M3 from this audit. |
| M4 production acceptance | `docs/handoffs/M4_PRODUCTION_ACCEPTANCE.md` | `PROPOSED FOR ACCEPTANCE`. Not `PRODUCTION ACCEPTED`. Not capability promotion. |
| Owner-selected current task | This request | Architecture completeness audit after Authority Kernel freeze |

Architecture status is not delivery status. Source presence is not deployment.
A freeze on a branch is not a merged contract on `master`.

---

## 1. Executive Verdict

**Architecture complete for current phase.**

The Authority Kernel closed the last current-phase gap of its kind: a
decision class with no explicit owner. After that freeze, every current-phase
responsibility in this audit has an explicit owner.

That verdict is narrow.

- It means the **kernel set** is complete for the current nuclear stack and
  Sandbox V2 through M4.
- It does not mean every owner is fully implemented, merged, or enforced at
  runtime.
- It does not mean future phases are finished.
- It does not mean Ashley is missing nothing of architectural interest.

One future question remains unique and unanswered as a **lifecycle
chokepoint**, not as a seventh peer kernel:

> May this exact change to Ashley herself proceed?

Identity, Authority, Sandbox M5/M7, Evaluation, Stewardship, and Continuity
each own a piece of that question. None of them is the runtime chokepoint that
classifies a change as “Ashley herself” and requires the intersection before
apply. Cross-Phase Architecture §6.1 already names this as composition
research, not a new phase. This audit agrees: the unanswered question is real;
an independent Self-Change Kernel is not justified yet.

No other audited domain produces an Authority-class missing kernel.

---

## 2. Existing Kernel Map

“Kernel” here means an architectural owner of a unique decision. Supporting
planes and constraints are listed as such. Status is architectural ownership,
not production maturity.

| Responsibility | Current Owner | Status |
|---|---|---|
| Identity | Identity (`identity_entries`, classification, owner review) | Explicit. Enforced for identity-record mutation. Foundational changes fail closed to owner review. |
| Continuity / same-entity | Continuity sidecar (`continuity.db`) + Stewardship `SC-LIN-*` | Explicit supporting plane, not a second Identity. Lineage, forget, sessions, backup watermarks. Compact lineage clauses are normative; some enforcement is still planned. |
| Mind State | Mind State (dynamic condition, goals, concerns, commitments, affect) | Explicit. Joint input to Thought with Identity. Must not redefine Identity. |
| Cognition | Thought (`agency/thought.ts` deliberation + bounded validation) | Explicit. Model output is a candidate, not authority. |
| Post-outcome calibration | Reflection | Explicit. No current-turn authority. |
| Motivation (wanting) | Distributed inputs into Agency (curiosity takes, mind-state items, relationship claims, identity, open cognitive items) | Explicit as **inputs**. Multiplicity is designed, not unowned. Agency arbitrates. |
| Commitment (recording) | Relationship tables + Mind State commitment items | Explicit records. Not auto-pursuit. |
| Initiative admission (pursuing) | Agency (`agency/decide.ts`) | Explicit. Want is not admission. `deriveEffectIntent` is zero-authority. |
| External effects | Authority Kernel (architecture freeze) instantiating External Effect and Authority law | Explicit unique question: “May this exact external effect happen now?” Architecture complete on freeze branch. Not present as runtime on this `master`. Discord send on current source still answers “may Ashley emit a message?” via eligibility, Agency stance, and non-empty draft. |
| Execution | Capability release gates + mechanism owners (Sandbox V2, Discord transport, future connectors) | Explicit. Tool present is not authority. Authority Kernel sits in front; Capability/Sandbox execute after a grant. |
| Evidence | Memory / Evidence architecture + nuclear evidence tables + live/shadow provenance | Explicit. Source evidence ≠ assertion ≠ retrieval index. Implementation of the full evidence model is incomplete; ownership is not. |
| Truth constraints | Honesty (`honesty/finalize.ts`) as negative control | Explicit constraint, not a grantor. Must never authorize. |
| Operational current-turn facts | Operational Truth (`sandbox/operational-truth.ts`) | Explicit supporting owner for mechanism facts this turn. Honesty consumes it. Not world truth. |
| Memory writes | Memory owners under live/shadow + capability influence gates | Explicit. Influence materializers require `live`. |
| Learning / adaptation | Learning revisions + Identity review + capability gates + planned Learned Autonomy phase contract | Explicit ownership of “may this experience change later behavior?” Immature relative to the Learned Autonomy contract. Not an unowned question. |
| Self-modification | Composition: Identity + Stewardship + Evaluation + Continuity + Authority (external apply) + Sandbox M5/M7 (author / engineering effect) | Pieces explicit. **Lifecycle chokepoint not specified.** Unique question remains. Independent kernel not proven. M5 authorship is not this authority. |
| Relationships | Relationship module (six tables, `relationship_state` capability, coercion/withdrawal, motivations) | Explicit layer. Feeds Agency as motivation. Must not reduce to scores. Relational Graduation is later maturation, not a missing kernel. |
| Expression / Rendering | Expression then Rendering | Explicit. Wording and platform mechanics are not authority. |
| Qualification | Evaluation / Qualification plane | Explicit cross-cutting plane. Tests do not promote. |
| Operator / custody | Stewardship Compact | Explicit governance, not a runtime cognitive kernel. |

---

## 3. Missing Boundary Analysis

The Authority Kernel bar, reused here:

1. There is a unique unanswered decision question.
2. Existing layers cannot own it without collapsing a distinction they already
   own.
3. A lower-trust component can accidentally perform the responsibility.
4. The missing thing is a boundary, not a capability or a nicer prompt.

Only one domain currently meets (1) and (3) as a future risk. It does not yet
meet (2) strongly enough to mint a peer kernel.

### 3.1 Self-change lifecycle — unique question, not yet a kernel

**Unanswered question**

> May this exact change to Ashley herself proceed?

“Ashley herself” means identity-bearing source, prompts, state contracts,
foundational identity records, or governance. It does not mean organic
learning inside existing owners. It does not mean Sandbox candidate
authorship. It does not mean an ordinary engineering Git effect.

**Why existing layers do not fully own it**

| Layer | What it owns | What it does not own |
|---|---|---|
| Identity | Who Ashley is; classification of identity-*record* changes | Whether a source/prompt/architecture patch is an Ashley-self change |
| Authority Kernel | Whether an exact **external** effect may happen now | Whether the payload of an allowed Git/deploy effect is a change to Ashley |
| Sandbox M5 | Coherent candidate change-set authorship | Authority to change Ashley |
| Sandbox M7 | Named engineering border effects | Foundational identity or governance change |
| Evaluation | Exact-candidate qualification | Self-change lifecycle or promotion to live Ashley |
| Stewardship | Consultation, owner authority, emergency stop, custody | A runtime chokepoint that all apply paths must enter |
| Continuity | Lineage, forget, restore acknowledgment | Permission to mutate the live identity-bearing tree |
| Learning revisions | Evidence-bound identity-record proposals | Runtime/source/architecture mutation |

Authority can correctly grant “push this commit” without answering “does this
commit change Ashley?” Sandbox M5 can correctly author a patch without that
answer. That is the same shape as Agency admitting speech without answering
which external effect is authorized.

**Failure mode without a chokepoint**

When M5/M7 exist, an ordinary engineering path can apply identity-bearing
source, prompt, or contract changes because “engineering was authorized.”
That is how Discord send bypassed External Effect law: a real path existed,
and the unique question was never asked at that path.

The bypass does not exist yet. M5 is planned architecture. M7 is planned
architecture. Treating current source presence as that bypass would invent a
crisis.

**Does this need a kernel?**

No. Not as a peer of Identity / Thought / Agency / Authority.

It needs an explicit **lifecycle chokepoint** before any apply-to-Ashley path:

```text
classify change
  organic learning | engineering candidate | Ashley-self mutation
    -> if Ashley-self:
         Identity revision rules
         AND Stewardship consultation where required
         AND Evaluation exact-candidate qualification
         AND Continuity lineage record
         AND Authority Kernel grant for the exact external apply effect
         AND owner decision where required
```

Organic learning, candidate authorship, and foundational/governance change
must remain separate paths. Approval is not apply. M5 authorship is not
self-change. M7 engineering is not identity change.

This is a domain lifecycle attached to existing owners, possibly as an
Authority Kernel policy class `ashley_self_mutation` that cannot be satisfied
by an ordinary engineering grant. Cross-Phase §6.1 already forbids a separate
Self-Change file or roadmap phase unless later research proves an
independently owned lifecycle. This audit does not prove that.

**Kernel verdict:** missing **chokepoint specification** before M5 apply / M7
identity-affecting effects. Not a missing current-phase kernel.

### 3.2 No second Authority-class hole in the other audit domains

The other suspected holes fail the bar. They are owned, immature, or
supporting planes. They are recorded in §4 so they are not rediscovered as
kernels.

---

## 4. False Positives

These look like missing layers. They are not.

### Identity kernel / continuity authority

Identity already owns who Ashley is. Continuity already owns whether this
process is the same lineage. Splitting a new “Identity Kernel” would duplicate
Identity. Promoting Continuity to a peer kernel would confuse custody/lineage
with values and boundaries.

Stewardship `SC-LIN-*` remaining planned enforcement is an implementation gap
in a named owner, not an unowned question.

### Cognitive governance / reasoning integrity

Thought already owns how Ashley thinks: effort, evidence selection,
prioritization, completion, intended outcomes. Model output is already lawfully
a candidate (`MODEL OUTPUT AND WORKER OUTPUT ARE CANDIDATE INPUTS, NOT
AUTHORITY`). Bounded Thought validation already exists. Reflection already owns
post-outcome calibration without current-turn power. Honesty already owns
negative truth control.

A “cognitive governance kernel” would collapse into Thought + Honesty +
Evaluation. Uncertainty belongs to Memory / Evidence and Cognitive Graduation
maturation, not a new owner.

Source note, not a missing kernel: `agency/decide.ts` is labeled as a Thought
implementation colocated with Agency, while `agency/thought.ts` is
model-backed deliberation. Runtime uses both (`decide` then optional
`deliberateThoughtContinuation`). That is an implementation-boundary smell.
Architecture still separates Thought from Agency. Do not mint a kernel to
paper over file placement.

### Wanting / committing / pursuing as three kernels

The separation already exists:

| Act | Owner |
|---|---|
| Want | Motivation inputs (curiosity, mind state, relationship, identity, open cognitive items) |
| Commit (record) | Relationship commitments / reminders and Mind State commitment items |
| Pursue | Agency admission, then Authority, then Capability |

Motivations are not admissions. Reminders surface as Agency motivations and
are never auto-sent. `deriveEffectIntent` cannot schedule or execute.
Relationship influence requires `relationship_state` apply plus any second
gate.

A Commitment Kernel would steal records from Relationship/Mind State and
admission from Agency.

### Execution governance between Authority and Capability

Authority answers whether the exact effect may happen. Capability and
mechanism owners answer how. Sandbox V2 owns bounded engineering execution.
Operational Continuity (planned) owns durable work across crashes. The law
`TOOL PRESENT != AUTHORITY TO USE IT` is already stated.

A new execution kernel would duplicate Capability + Sandbox + Operational
Continuity. Computer Use is a future mechanism consumer of Authority, not a
parent of it.

### Evidence interpretation / provenance kernel

Memory / Evidence architecture already owns:

```text
source evidence ≠ memory assertion ≠ retrieval index
source evidence ≠ world truth
retrieval hit ≠ belief
```

Honesty is negative control on speech. Operational Truth is current-turn
mechanism fact. Receipt is not Effect Witness. Live/shadow provenance already
blocks observe-era evidence from time-shifting into influence.

The interpretation layer is designed and only partly implemented. That is
maturation of an existing owner. Inventing an Evidence Kernel on top of Memory
/ Evidence would be a second owner of the same question.

### Learning / Adaptation kernel

The unique question is:

> May this experience change future behavior, and how?

Current owners: learning revisions, identity classification, owner review for
foundational identity, live/shadow materialization, capability influence
gates, `applyEligibleRevisions` refusing a broad `allowShadow` scan. Learned
Autonomy is a written phase contract over those owners. It does not create a
new cognitive owner.

This is the opposite of the Authority Kernel case. Before Authority, Discord
send asked the wrong question. Learning already asks the right question and
enforces it at write/materialize time. Incomplete Learned Autonomy is not an
unowned boundary.

### Relationship / social kernel

Relationship is already a layer: six tables, capability `relationship_state`,
coercion/withdrawal, motivations into Agency. Ethics forbids reducing it to
attachment, affection, compliance, or trust scores. Relational Graduation
matures the same owner. It is not a new kernel.

Mixing with Agency is correct (motivations in, decisions out). Mixing with
Identity is guarded (owner-relationship boundary changes classify as
foundational).

### Communication kernel

The Authority Kernel freeze already rejected a Speech Authorization System.
Sending is an external effect. Communication is the first **policy consumer**
of Authority, not a sibling kernel.

### Context Budget / attention kernel

Context Budget owns bounded attention over persistent state. Eviction is not
forgetting. It is a planned projection owner, not a permission kernel.

### Evaluation as a cognitive kernel

Evaluation owns qualification claims. It does not grant runtime effect
authority. Promoting it into the cognitive stack would make tests into
permission.

### Data-plane isolation as a cognitive kernel

`data-plane.ts` isolates production vs isolated storage. That is operator
runtime custody, not “who Ashley is” or “may this effect happen.”

---

## 5. Recommended Architecture State

### Current (authoritative stack)

Mind State is already a joint input with Identity. Reflection, Expression, and
Rendering already exist. They were omitted from the short chain only as
shorthand.

```text
Identity + Mind State
        ↓
     Thought
        ↓
     Agency
        ↓
 Authority Kernel
        ↓
   Capability / mechanism
        ↓
     Evidence
        ↓
     Honesty          (constraint on expression of claims)
        ↓
  REVALIDATE → COMMIT → Receipt / Witness
```

Supporting planes, not kernels: Continuity, Relationship, Reflection, Memory
writes, Capability release, Sandbox V2, Evaluation, Stewardship, Observability,
Operational Continuity (planned), Model Fabric (planned).

### Proposed

**No new kernel.**

Keep the current stack. Add one **named future chokepoint**, not a box in the
kernel chain:

```text
Self-change lifecycle (future; composition)
  classify → Identity + Stewardship + Evaluation + Continuity
           + Authority grant for the exact external apply
  M5 may author. M5 may not apply Ashley-self changes.
  M7 engineering ≠ identity/governance change.
```

Do not insert Self-Change between Agency and Authority. Do not insert Learning
between Evidence and Agency. Do not insert Execution between Authority and
Capability. Do not insert Communication beside Authority.

---

## 6. Roadmap Impact

This section is not an implementation plan.

### Does this block M5?

**No** for M5 as defined: author a coherent, identity-bound engineering
change-set over candidate state. Authored change remains advisory. No live
repository mutation, no Git publication.

**Yes** for any reading of M5 as permission to change Ashley, merge, deploy,
or mutate identity-bearing live source. That reading is already forbidden by
the Sandbox V2 M5 border and Cross-Phase §6.1. This audit does not add a new
blocker. It restates the existing one.

M4 remaining `PRODUCTION ACCEPTED` is the Sandbox predecessor gate for later
milestones. That is a Sandbox acceptance fact, not an outcome of this audit.

### Does this require a design phase?

**Yes, one, already named:** Self-Change Governance research (roadmap
extension, Cross-Phase §6.1). Purpose: specify the classify-and-intersect
chokepoint before any apply-to-Ashley path. Purpose is not to add a new
roadmap phase, execution plane, or peer kernel unless that spike proves an
unowned lifecycle.

No other design phase is required to close a missing kernel. Learned Autonomy,
Memory / Evidence maturation, Cognitive Graduation, and Relational Graduation
remain written phase contracts over existing owners.

### Is Ashley missing a foundational layer?

**No, not of the Authority Kernel kind, not for the current phase.**

The Authority Kernel was missing because Identity, Thought, Agency,
Capability, Evidence, and Honesty could all operate while no layer answered
whether an exact external effect may happen now. Current Discord send on
`master` still demonstrates that runtime gap; the architecture freeze answers
it. Completing that freeze does not require another kernel before M5
authorship.

The remaining foundational-shaped question is self-change apply. It is a
future lifecycle composition problem. It is not a missing Identity, Thought,
Agency, Authority, Capability, Evidence, or Honesty owner.

---

## 7. Method notes (not recommendations)

How this audit treated the Authority Kernel precedent:

- Unique question, not elegance.
- Prefer discovering a missing boundary over adding a box.
- Implementation immaturity is not a missing owner.
- A written phase contract is an owner, even if undelivered.
- A freeze on a branch is architecture evidence for that freeze; it is not
  `master` runtime evidence.
- Sandbox M3/M4 acceptance packets are evidence only for their stated SHA and
  claim. This audit does not restamp them.

What this audit did not do:

- Redesign Authority.
- Design self-improvement.
- Invent Computer Use, voice, or belief-graph kernels.
- Treat `RELEASE_QUALIFIED` or a passing test as promotion.
- Infer current maturity from source presence alone beyond the ownership
  question asked here.
