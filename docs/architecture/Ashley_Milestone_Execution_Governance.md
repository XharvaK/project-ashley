# Project Ashley Milestone Execution Governance

**Status:** `AUTHORITATIVE` for execution discipline over already-named
engineering milestones. This document does not own architecture, add
milestones, authorize implementation, accept M3 or M4, promote a capability,
or design an Event Spine.

**Date:** 2026-08-23

**Kind:** Execution governance. It preserves architectural meaning while
existing roadmap items are implemented.

**Superseded by:** Vision, Core Principles, Constitution, Stewardship Compact,
Ethics, Hierarchy, Architecture Freeze, Cross-Phase Architecture, Wave
Acceptance Protocol, and the focused phase contract.

**Applies to:** engineering milestones named in
[Canonical Architecture Roadmap](Ashley_Architecture_Roadmap.md) §5.

```text
IMPLEMENTATION PROGRESS
  != ARCHITECTURAL MEANING CHANGE
MILESTONE COMPLETION
  != OWNERSHIP CHANGE
  != AUTHORITY EXPANSION
  != COGNITIVE ADVANCEMENT
```

## 0. Frozen assumptions (do not reopen)

Implementation teams must not reopen these:

1. No additional kernel, cognitive faculty, authority boundary, or
   infrastructure primitive.
2. Event Spine is design-later infrastructure, not a phase and not a current
   milestone.
3. External projects are mechanism inspiration only. They are not owners.
4. Owner-selected delivery and architecture-justified substance are two
   sequences. They must not be collapsed.
5. Model Fabric is mechanism work. Completing it does not unlock autonomy.
6. Sandbox completion does not unlock cognitive maturation.
7. M5 authorship is not apply-to-Ashley authority.
8. S1 is specification. It does not authorize self-modification execution.
9. C4 and C5 are siblings.
10. M3 `PRODUCTION ACCEPTED` and M4 `PRODUCTION ACCEPTED` are live evidence
    claims. If permitted evidence is absent: `UNKNOWN`. Do not infer them from
    source presence.

## 1. Milestone contract format

Every named milestone must answer these four questions before work starts and
again before any acceptance claim.

### 1.1 Identity

- Name and ID as already listed in the roadmap.
- Purpose in one sentence.
- Track: `mechanism` | `cognition` | `governance`.
- Existing owner / phase contract. A milestone may not create a new owner.

### 1.2 Dependency contract

Answer: **What must already be true before this milestone starts?**

State both:

- required predecessors and evidence class (`HARD_DEPENDENCY`,
  `EVIDENCE_DEPENDENCY`, `OWNER_SELECTED_IMPLEMENTATION_ORDER`,
  `CROSS_CUTTING_INTERFACE`);
- non-dependencies: what must **not** be treated as a start condition.

Design-only writing may precede implementation acceptance of a predecessor
when labeled design-only. Implementation, host effects, promotion, and
production acceptance may not.

### 1.3 Output contract

Answer: **What does this milestone create?**

State both:

- artifacts, runtime behavior, or evidence it is allowed to produce;
- what it does **not** create, even if a later reader would like it to.

### 1.4 Non-goals

Answer: **What tempting interpretation is forbidden?**

Name the likely false equation this milestone would be used to smuggle.

### 1.5 Acceptance contract

Compose with the [Wave Acceptance Protocol](../Wave_Acceptance_Protocol.md).
Do not invent a second ladder.

For implementation-bearing milestones:

```text
DESIGN ACCEPTED
  -> IMPLEMENTED
    -> LOCALLY VERIFIED
      -> INDEPENDENTLY REVIEWED
        -> PHYSICALLY QUALIFIED   (only if the claim depends on host/process)
          -> RELEASE_QUALIFIED
            -> DEPLOYED
              -> CAPABILITY PROMOTED
                -> PRODUCTION WITNESSED
                  -> PRODUCTION ACCEPTED
```

For evidence-recovery and acceptance gates (G0, G1, G2), the work is
establishing a claim on the ladder, not adding a new stage.

Every acceptance claim must name:

- exact candidate SHA;
- governing contract;
- required evidence;
- verification method selected by the claim;
- promotion criteria, or an explicit statement that promotion is out of
  scope;
- rollback / fail-closed expectation.

```text
IMPLEMENTED != ACCEPTED
ACCEPTED != PROMOTED
PROMOTED != PRODUCTION ACCEPTED
PASSED TEST != QUALIFICATION
```

## 2. Permanent execution rules

These rules are standing law for milestone work. They rest on existing
Cross-Phase and Freeze laws. They do not add owners.

**Rule 1 — Capability is not authority.**
Installed ≠ permitted. Available ≠ authorized. Connected ≠ admitted.

**Rule 2 — Authorship is not self-change.**
Candidate change ≠ Ashley change. M5 ≠ apply-to-Ashley. S1 ≠ execution.

**Rule 3 — Evidence is not truth.**
Source ≠ assertion. Retrieval ≠ belief. Receipt ≠ effect witness.
Documentation ≠ memory.

**Rule 4 — Completion is not graduation.**
A technical milestone does not advance Identity, Thought, Agency, or
relationship meaning. Model Fabric completion is not autonomy.

**Rule 5 — Promotion requires evidence.**
Implemented ≠ accepted. Accepted ≠ promoted. Exact-candidate production
witness is required for promotion claims. Older-SHA evidence does not
transfer by resemblance.

**Rule 6 — Events do not decide.**
Event ≠ truth, permission, memory assertion, effect witness, or instruction.
If a later Event Spine exists, it announces. Owner ledgers define.

**Rule 7 — Tracks do not unlock each other by convenience.**
Mechanism completion does not unlock cognition. Cognition does not grant
effect authority. Governance specification does not implement itself.

**Rule 8 — Unknown remains unknown.**
If predecessor acceptance cannot be shown from permitted evidence, the
predecessor is `UNKNOWN`. Work that requires it stays blocked. Silence is
not a gate.

## 3. Repository artifacts

A milestone may not advance a ladder stage without the matching artifact.
These are records, not new architecture owners.

| Ladder move | Required artifact | Not sufficient |
|---|---|---|
| Start design | Focused contract already exists, or a design note under that contract | A spike notebook treated as law |
| `DESIGN ACCEPTED` | Design document bound to the existing owner; owner sign-off | Implementation PR description |
| `IMPLEMENTED` | Implementation branch / commit bound to exact SHA and contract | Unbounded “also cleaned up” diffs |
| `LOCALLY VERIFIED` | Verification report using Wave Acceptance selection for the claim | Green CI as physical or production proof |
| `INDEPENDENTLY REVIEWED` | Independent review record of the exact candidate | Same-author checklist |
| `PHYSICALLY QUALIFIED` | Host-bound packet only when the claim depends on host/process | Local tests; docs-only edits |
| `RELEASE_QUALIFIED` | Release-qualification packet for the exact candidate | Physical kernel notes as a freeze packet |
| `DEPLOYED` | Deployment record for the exact candidate | Checkout resemblance |
| `CAPABILITY PROMOTED` | Promotion record in the capability plane + current admission | Source presence |
| `PRODUCTION WITNESSED` | Production witness bound to SHA, host, and claim | Discord chatter without packet identity |
| `PRODUCTION ACCEPTED` | Owner acceptance of the exact packet | `PROPOSED FOR ACCEPTANCE` |

G0 produces recovered evidence or an explicit `UNKNOWN`, not a new milestone.
G1 produces an acceptance decision on an existing packet.
G2 produces a promotion record only after G1.

Architecture decision records are not required for ordinary milestone
execution. They are required only if someone proposes to change Freeze,
Cross-Phase law, or owner map — which this governance forbids as a side
effect of implementation.

## 4. Complete milestone contracts

P1 (Procedural Skill Graduation) remains a named later mechanism milestone on
the roadmap. It is not in the current execution set below. It uses this same
format when it becomes current work. This section does not add it.

### G0 — Recover M3 production-acceptance evidence

| Field | Contract |
|---|---|
| Track | mechanism (evidence gate) |
| Purpose | Establish whether exact-candidate M3 is `PRODUCTION ACCEPTED` from permitted evidence |
| Existing owner | Sandbox V2 M-series + Wave Acceptance |
| Must already be true | M3 architecture accepted; a cited candidate identity exists to search |
| Must not be treated as required | M4 source; Model Fabric; S1; cognition track |
| Creates | Recovered packet, equivalent production observation bound to SHA `28e157a`, or an explicit `UNKNOWN` |
| Does not create | M4 acceptance; M5; promotion; a reconstructed history presented as current law |
| Forbidden reading | “M4 code exists, therefore M3 was accepted” |
| Evidence | `docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md` recovered, or production observation naming SHA, host, and claim |
| Verification | Documentary / production observation. Not Bubblewrap for this gate |
| Promotion | Out of scope |
| Rollback | If evidence cannot be established, leave M3 `UNKNOWN` and keep G1 blocked |

Live (`2026-08-23`): `UNKNOWN` in this worktree. Cited file absent.

### G1 — Close M4 production acceptance

| Field | Contract |
|---|---|
| Track | mechanism (acceptance gate) |
| Purpose | Decide the existing M4 packet; do not replace it with source presence |
| Existing owner | Sandbox V2 M4 contract + Wave Acceptance |
| Must already be true | G0 closed with M3 `PRODUCTION ACCEPTED` for the predecessor the M4 packet cites |
| Must not be treated as required | Capability promotion; M5; cognition; S1 execution |
| Creates | Owner acceptance or explicit rejection/deferral of packet `PROPOSED FOR ACCEPTANCE` at candidate `553553b` |
| Does not create | Promotion; Discord witness; production enablement; engineering judgment authority |
| Forbidden reading | “Packet + Mint kernel run + checkout match = PRODUCTION ACCEPTED” |
| Evidence | Reviewer decision on the existing M4 packet against the M-series ladder |
| Verification | Packet review. Physical notes already in the packet do not skip acceptance |
| Promotion | Out of scope. See G2 |
| Rollback | Rejection or deferral leaves M4 unaccepted; M5 stays blocked |

Live (`2026-08-23`): M4 remains `PROPOSED FOR ACCEPTANCE`. Not accepted.

### G2 — Promote M4 only after G1

| Field | Contract |
|---|---|
| Track | mechanism (promotion gate) |
| Purpose | Admit `candidate_verification` only after M4 production acceptance |
| Existing owner | Capability / Evaluation plane |
| Must already be true | G1 = M4 `PRODUCTION ACCEPTED` |
| Must not be treated as required | M5; Model Fabric; cognitive maturation |
| Creates | Capability record + current admission showing the M4 capability authorized |
| Does not create | M5 authorship; self-change; a standing verify-loop; Computer Use |
| Forbidden reading | “Accepted design or local tests promoted the capability” |
| Evidence | Promotion record bound to the accepted SHA + live admission |
| Verification | Capability-plane inspection, not a new M4 implementation |
| Promotion | This *is* the promotion step. It still is not production witness of later milestones |
| Rollback | Fail closed: capability remains unauthorized if admission cannot be shown |

### M5 — Authorship

| Field | Contract |
|---|---|
| Track | mechanism |
| Purpose | Produce a coherent, identity-bound engineering change set over candidate state |
| Existing owner | Sandbox Autonomy / M5 contract |
| Must already be true | G1 (M4 `PRODUCTION ACCEPTED`). Sandbox foundation and authorship borders defined |
| Must not be treated as required | S1 execution; Learned Autonomy; G2 is preferred but authorship authority is not promotion of M4 into live verify loops |
| Creates | Authored candidate change sets; provenance; still-advisory candidate work |
| Does not create | Approved Ashley changes; live-repo mutation; Git publication; autonomous improvement |
| Forbidden reading | “Ashley wrote a patch, so Ashley should become that patch” |
| Evidence | Exact-candidate M5 witness required by the M-series contract |
| Verification | Selected by the M5 claim: local falsification and independent review before the next M-series implementation. Physical qualification remains required where Git/filesystem mechanics are host-bound; it is batched with later M-series Mint qualification and is not skipped |
| Promotion | Separate later capability admission. M5 completion is not M5 promotion |
| Rollback | Candidate change remains inert; no live mutation on failure |

G2 is not a semantic parent of M5. Do not start M5 while G1 is unmet. Do not
treat M5 as blocked on S1.

### M6 — Bounded operation

| Field | Contract |
|---|---|
| Track | mechanism |
| Purpose | Pursue one admitted engineering objective through a finite M3/M4/M5 sequence |
| Existing owner | Sandbox Autonomy / M6 contract |
| Must already be true | Implementation track: M5 `INDEPENDENTLY REVIEWED` for the candidate used. Production acceptance still requires M5 `PRODUCTION ACCEPTED` |
| Must not be treated as required | M7 border profiles; Computer Use; Operational Continuity as a new brain |
| Creates | One bounded operate attempt with budgets, receipts, and finite stop |
| Does not create | New effect class; worker identity; restart-transparent agency; “Ashley decided to keep going” |
| Forbidden reading | “A workflow ran, therefore Agency chose” |
| Evidence | One admitted objective completed through a finite sequence |
| Verification | Claim-selected tests + receipts. Physical qualification remains required for the real controller and failure/cleanup paths; it is batched with the later M-series Mint campaign and is not skipped |
| Promotion | Separate |
| Rollback | Cancel/expire fail closed; no new authority on retry |

### M7 — Named engineering-border effects

| Field | Contract |
|---|---|
| Track | mechanism |
| Purpose | Cross one named engineering border under independently authorized profiles |
| Existing owner | Sandbox M7 + External Effect and Authority |
| Must already be true | Implementation track: M6 `INDEPENDENTLY REVIEWED`. Production acceptance still requires M6 `PRODUCTION ACCEPTED` plus the External Effect contract for the named profile |
| Must not be treated as required | Computer Use; generic external agency; self-change; F1 |
| Creates | One named engineering-border profile admitted, committed, receipted, reconciled |
| Does not create | Computer Use; email/browser/purchase/account agency; apply-to-Ashley |
| Forbidden reading | “A computer was available, therefore the effect was authorized” |
| Evidence | Named profile + prepare/revalidate/commit + receipt + witness/reconcile |
| Verification | Physical where the border claim depends on host; never tests-as-witness |
| Promotion | Separate per profile. One profile does not admit another |
| Rollback | Reconcile `OUTCOME_UNKNOWN`; never blind retry |

### F1 — Model Fabric first Thought-observation slice

| Field | Contract |
|---|---|
| Track | mechanism |
| Purpose | One accepted Thought-observation slice over replaceable providers |
| Existing owner | Model Fabric |
| Must already be true | Owner-selected Sandbox delivery gate closed enough that F1 is the selected next implementation. No semantic parenthood from Sandbox |
| Must not be treated as required | Full Context Budget; Learned Autonomy; Cognitive Graduation; execution authority |
| Creates | Provider-neutral dispatch for one slice: one request, no fallback, receipts, privacy, cancellation, semantic qualification |
| Does not create | Better Identity; autonomy; self-improvement; truth; complete Context Budget |
| Forbidden reading | “Better routing means a more advanced mind” |
| Evidence | One accepted Thought-observation slice as named by the Fabric contract |
| Verification | Settlement for the slice; no second structural provider request |
| Promotion | Separate. A shadow slice is not live Thought |
| Rollback | Disable the slice; current purpose routing remains policy, not Fabric completion |

Do not start F1 implementation while Sandbox remains the owner-selected
current delivery focus.

### OC1 — Operational Continuity first durable-work slice

| Field | Contract |
|---|---|
| Track | mechanism |
| Purpose | One restart-resumable bounded work concern |
| Existing owner | Operational Continuity |
| Must already be true | Owner-selected after F1. Model-backed attempts use Fabric as interface only |
| Must not be treated as required | Event Spine; Mind State ownership; C3 |
| Creates | Durable work concern, attempt, lease, resume, cancel, artifacts, reconcile |
| Does not create | Mind State; `OpenConcern`; motivation; exactly-once external reality; Event Spine |
| Forbidden reading | “Durable work state is cognitive continuity” or “an inbox event is an instruction” |
| Evidence | Restart-resumable bounded work whose authority and ambiguous effect reconcile |
| Verification | Crash/resume falsifiers; not a spine design spike |
| Promotion | Separate |
| Rollback | Lease expire / cancel; resume must revalidate current authority |

### C1 — Memory / Evidence maturation

| Field | Contract |
|---|---|
| Track | cognition |
| Purpose | Make source, assertion, contradiction, forgetting, provenance, live/shadow contract-complete for later consumers |
| Existing owner | Memory / Evidence |
| Must already be true | Current evidence architecture. Not Sandbox completion. Not F1 completion |
| Must not be treated as required | Model Fabric; M7; Event Spine |
| Creates | Qualified evidence/assertion/index distinctions usable by later cognitive milestones |
| Does not create | World truth; a Knowledge layer; docs-as-memory; autonomy |
| Forbidden reading | “Stored data is true” or “retrieval is belief” |
| Evidence | Contract-complete source vs assertion, contradiction, forgetting, provenance, live/shadow |
| Verification | Authority/migration regressions if schema is touched; docs-only if docs-only |
| Promotion | Separate. Observe-era evidence cannot time-shift into influence |
| Rollback | Fail closed to shadow / non-influence |

### C2 — Context Budget first bounded projection

| Field | Contract |
|---|---|
| Track | cognition (attention) |
| Purpose | Bounded inspectable projection of persistent state |
| Existing owner | Context Budget |
| Must already be true | `HARD_DEPENDENCY` on C1. `CROSS_CUTTING_INTERFACE` on Fabric `ContextProjection` envelope, not complete F1 |
| Must not be treated as required | C3; Computer Use; Operational Continuity except as `EVIDENCE_DEPENDENCY` for resumable work |
| Creates | Typed selection, budgets, eviction, inspection, deterministic rebuild |
| Does not create | Recall authority; forgetting; Mind State mutation; truth |
| Forbidden reading | “What was dropped from context was forgotten” or “docs projected into context are memory” |
| Evidence | Same persistent state, multiple budgets, no memory/truth change |
| Verification | Projection determinism tests; not memory-suite as a substitute |
| Promotion | Separate |
| Rollback | Rebuild from persistent state; eviction is not deletion |

### C3 — Learned Autonomy first qualified influence

| Field | Contract |
|---|---|
| Track | cognition |
| Purpose | One evidence-bound learned influence on a later choice |
| Existing owner | Learned Autonomy |
| Must already be true | `HARD_DEPENDENCY` on C1 |
| Must not be treated as required | F1 completion; M7; Computer Use; C4 |
| Creates | Traceable learned influence with revision, decay, contradiction, demotion |
| Does not create | Obedience optimization; Identity mutation; extra tools; graduation |
| Forbidden reading | “The model likes this, so Ashley prefers this” |
| Evidence | A later choice changes for a traceable reason, stays in authority, can be demoted |
| Verification | Contradiction/demotion falsifiers |
| Promotion | Separate. Learned state is not a capability grant |
| Rollback | Demote / decay; never silent Identity write |

### C4 — Cognitive Graduation

| Field | Contract |
|---|---|
| Track | cognition |
| Purpose | Long-horizon epistemic and motivational coherence under existing owners |
| Existing owner | Cognitive Graduation |
| Must already be true | `HARD_DEPENDENCY` on C1 and C3. Context Budget and OC1 are `EVIDENCE_DEPENDENCY` |
| Must not be treated as required | C5; Computer Use; personhood research |
| Creates | Qualification evidence of grounded revision, continuity, initiative diversity, refusal, rollback |
| Does not create | Personhood; external authority; silent Identity change; C5 |
| Forbidden reading | “She sounds continuous, therefore she graduated” |
| Evidence | Long-horizon packet named by the Cognitive Graduation contract |
| Verification | Longitudinal evaluation, not a single-session demo |
| Promotion | Separate from Relational Graduation |
| Rollback | Independent rollback; cannot take C5 down as a side effect |

### C5 — Relational Graduation

| Field | Contract |
|---|---|
| Track | cognition (relational) |
| Purpose | Long-horizon relational continuity without compulsion |
| Existing owner | Relational Graduation |
| Must already be true | `HARD_DEPENDENCY` on relationship-state foundation and C1. C3 is interface, not predecessor. Sibling of C4 |
| Must not be treated as required | C4 completion; F1; M7 |
| Creates | Qualification evidence of continuity, disagreement, withdrawal, repair, privacy, non-manipulation |
| Does not create | Engagement maximization; inferred consent; cognitive qualification |
| Forbidden reading | “The owner stayed, therefore the relationship graduated” |
| Evidence | Long-horizon packet named by the Relational Graduation contract |
| Verification | Longitudinal relational evaluation distinct from C4 |
| Promotion | Separate from C4 |
| Rollback | Independent |

### S1 — Self-change lifecycle specification

| Field | Contract |
|---|---|
| Track | governance |
| Purpose | Write the apply-to-Ashley lifecycle before any apply path exists |
| Existing owner | composed Identity, Stewardship, Evaluation, Continuity, Authority, Sandbox M5/M7 |
| Must already be true | Existing owners and Freeze statement that self-change is composed, not a kernel |
| Must not be treated as required | M5 blocked; C3; Event Spine |
| Creates | Written lifecycle: propose, review, exact-candidate bind, admit, apply, receipt, rollback, forbidden remainder |
| Does not create | A seventh kernel; self-modification execution; M5-as-self-change |
| Forbidden reading | “We specified it, so execution is authorized” or “M5 should wait for S1” |
| Evidence | Accepted specification under existing owners. No new file-as-kernel |
| Verification | Document review against Freeze and Cross-Phase; no Sandbox required |
| Promotion | Out of scope. Specification is not a capability |
| Rollback | Spec can defer; execution remains forbidden |

S1 may proceed in parallel with G0–M5. It must complete before any
apply-to-Ashley implementation. It must not block M5 authorship.

## 5. Milestone matrix

| Milestone | Track | Depends on | Produces | Explicitly does not produce |
|---|---|---|---|---|
| G0 | mechanism / evidence | M3 architecture; permitted production evidence to inspect | Recovered M3 acceptance evidence or `UNKNOWN` | M4 acceptance; promotion; inferred history-as-law |
| G1 | mechanism / acceptance | G0 = M3 `PRODUCTION ACCEPTED` | M4 `PRODUCTION ACCEPTED` or explicit reject/defer | Promotion; enablement; M5 |
| G2 | mechanism / promotion | G1 | M4 capability admission | M5; self-change; verify-loops as Agency |
| M5 | mechanism | G1; Sandbox authorship borders | Advisory authored candidate change sets | Approved Ashley changes; live Git mutation; autonomy |
| M6 | mechanism | M5 | One finite bounded operate attempt | New effect class; worker identity; Agency-by-workflow |
| M7 | mechanism | M6 + External Effect for the named profile | One named engineering-border effect, receipted and reconciled | Computer Use; generic agency; self-change |
| F1 | mechanism | Owner-selected after current Sandbox delivery | One Thought-observation Fabric slice | Identity; autonomy; self-improvement; full Context Budget |
| OC1 | mechanism | Owner-selected after F1 | One durable resumable work concern | Mind State; Event Spine; exactly-once world; instruction-by-event |
| C1 | cognition | Current Memory / Evidence architecture | Matured source/assertion/provenance/live-shadow contract | World truth; Knowledge layer; autonomy |
| C2 | cognition | C1 hard; Fabric `ContextProjection` interface | Bounded inspectable context projections | Forgetting; Recall authority; belief |
| C3 | cognition | C1 hard | One demotable learned influence | Identity mutation; obedience; graduation |
| C4 | cognition | C1 + C3 hard; C2/OC1 evidence | Cognitive Graduation qualification evidence | Personhood; C5; external authority |
| C5 | cognition | C1 + relationship foundation; sibling of C4 | Relational Graduation qualification evidence | C4; inferred consent; engagement max |
| S1 | governance | Existing composed owners | Self-change **specification** | Kernel; execution; M5 blockage |

## 6. Boundary leakage analysis

| Leakage | False equation | Milestones most at risk | Prevention already in contract |
|---|---|---|---|
| Authority | available = permitted | M7, F1, G2, OC1 | Rule 1; named profile admission; G2 after G1 only |
| Memory | stored = true | C1, C2, F1 | Rule 3; source vs assertion; projection ≠ memory |
| Agency | workflow ran = Ashley decided | M6, OC1, F1 | Finite stop; work concern ≠ `OpenConcern`; Thought/Agency remain owners |
| Self-change | candidate patch = Ashley should become this | M5, S1, M7 | Rule 2; M5 advisory; S1 spec-only |
| Event | event exists = fact/action/permission | OC1, later D1 | Rule 6; inbox ≠ spine; `EVENT != INSTRUCTION` |
| Graduation | slice shipped = mind advanced | F1, C3, C4 | Rule 4; Fabric is mechanism; C4 needs long-horizon evidence |
| Gate | proposed = accepted | G0, G1, G2 | Rule 5 and Rule 8; `UNKNOWN` stays `UNKNOWN` |

No milestone in this set is permitted to close a leakage by adding an owner.

## 7. Execution-order analysis

1. **Missing prerequisite?** G1 currently lacks a worktree-visible M3
   `PRODUCTION ACCEPTED` packet. That is a missing **evidence** prerequisite,
   not a missing architecture prerequisite. M5 is blocked on G1. F1 is blocked
   on owner-selected Sandbox delivery remaining current. C3 is blocked on C1,
   not on Sandbox.
2. **Early capability grant?** G2 would be early if performed before G1. M7
   would be early if treated as Computer Use. F1 would be early if started
   while Sandbox is still the selected delivery focus. C3 would be early
   without C1.
3. **Architecture work in the wrong place?** S1 must stay specification under
   existing owners. OC1 must not become Event Spine design. C2 must not become
   a Knowledge layer. None of these are authorized as architecture expansion.
4. **Unnecessarily blocked?** S1 is not blocked by M5, and M5 is not blocked
   by S1. C1 is not blocked by Sandbox. C5 is not blocked by C4. C2 is not
   blocked on complete F1, only on the `ContextProjection` interface when
   projections actually cross Fabric. Do not add waits.
5. **Track separation?** Mechanism, cognition, and governance are separated in
   §4–§5. Do not reorder owner-selected mechanism edges without owner
   evidence. Do not serialize cognition behind mechanism without a classified
   dependency.

No reordering is recommended.

## 8. What should happen next from current repository state

Live (`2026-08-23`):

| Fact | Reading |
|---|---|
| Owner-selected delivery | Sandbox |
| `origin/master` | `9e930db` — M4 packet |
| M3 `PRODUCTION ACCEPTED` | `UNKNOWN` here |
| M4 | `PROPOSED FOR ACCEPTANCE`; not accepted; not promoted |
| Allowed parallel now | S1 specification writing; C1 design/maturation under Memory / Evidence, labeled as not current Sandbox delivery |
| Not allowed now | M5 implementation as current delivery; F1 implementation as current delivery; G2; apply-to-Ashley; Event Spine implementation |

**Next mechanism action:** G0. Recover or equivalently observe M3 production
acceptance for SHA `28e157a`. If that cannot be done, G1 stays blocked and
M3 remains `UNKNOWN`.

**Next governance action (parallel):** S1 specification only.

**Next cognition action (parallel, not a Sandbox substitute):** C1
maturation under the existing Memory / Evidence contract.

**Do not do next:** treat the M4 packet as accepted; promote M4; start M5 as
if G1 were closed; start F1; design Event Spine as a phase.

This document does not authorize those next actions. It only ranks them.

## 9. How to use this model on later named work

When a deferred item (D1–D6 or P1) becomes current work, fill §1 against its
already-existing phase contract. Do not add a phase. Do not add an ID that is
not already on the roadmap.
