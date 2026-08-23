# Ashley Authority Kernel Architecture

**Status:** `AUTHORITATIVE`

**Date:** 2026-08-23

**Scope:** Architecture and documentation only. This document grants no
implementation, installation, activation, credential, Discord-send,
Sandbox M5, Git-effect, deployment, promotion, or other external-effect
authority.

**Parent contract:**
[`External_Effect_and_Authority_Architecture.md`](External_Effect_and_Authority_Architecture.md)

**Cross-phase laws:**
[`Ashley_Cross_Phase_Architecture.md`](Ashley_Cross_Phase_Architecture.md)

This document instantiates the External Effect and Authority contract as a
runtime kernel with domain policies. It does not replace that contract. It
does not create a Speech Authorization System. Communication is the first
policy consumer, not a separate subsystem.

Claims in this document are labeled:

- `CONFIRMED FROM SOURCE` — stated by a governing document or by current
  source in this checkout.
- `DESIGN DECISION` — architectural choice locked by this contract.
- `UNKNOWN` — cannot be established from permitted evidence in this checkout.

---

## 1. Purpose

**CONFIRMED FROM SOURCE.** Current runtime can decide whether Ashley may emit
a Discord message on a tick. Gates include eligibility, Agency speaking
stance, score threshold, and non-empty draft. Those gates do not answer which
external effect is authorized.

**DESIGN DECISION.** The Authority Kernel is the deterministic evaluator that
answers:

```text
May this exact external effect happen now?
```

It converts an admitted internal intention into a bounded grant, a typed
refusal, or a requirement for further owner authorization. It is the missing
boundary between cognition and the world.

**CONFIRMED FROM SOURCE.** Sending or publishing communication is already an
external effect. Local proposal formation, local draft creation, simulation,
and qualification are not the external effect.

The triggering Discord payload `"0.2.0"` remains an unproven causal incident.
**UNKNOWN.** Exact cause. Production `nuclear.db`, Discord snowflake, and
deployed SHA were not observed for this architecture pass. The incident is
used only as evidence that boolean send permission plus a language generator
can emit under-specified communication.

---

## 2. What the kernel is

**DESIGN DECISION.** The Authority Kernel is:

- one independent kernel;
- subordinate to External Effect and Authority law;
- the runtime owner of current-effect evaluation;
- the issuer of bounded `EffectAuthorization` objects;
- the enforcer of class preservation through Expression;
- the attachment point for domain policies.

The kernel is not:

- a second Agency;
- a Thought judge that can self-grant;
- a generic `externalAllowed` flag;
- a Speech Authorization System;
- a source of truth;
- a wording generator;
- a capability;
- a witness that the effect succeeded.

**DESIGN DECISION.** Authority is never:

```text
allowed = true
```

Authority is:

```text
a bounded, revocable, time-limited grant
for one exact external effect class, target, payload, audience,
representation, commitment, trigger, and budget
```

A later similar act requires a new intent and a new evaluation.

---

## 3. Problem the kernel solves

**CONFIRMED FROM SOURCE.** Present Discord send answers “may Ashley speak?”
It does not bind effect class, evidence, audience, representation, or
commitment. Expression may generate wording. Honesty may strip unlicensed
claims. Neither issues an effect grant.

**CONFIRMED FROM SOURCE.** `deriveEffectIntent` is a zero-authority transform.
`observeSandboxEffectIntentAdmission` is observe-only bookkeeping and must
not break the exchange. Proactive M3 and M4 fail closed. Proactive M2
inspection is allowed. Inspection success is not speech permission.

**DESIGN DECISION.** The kernel closes the gap by making every consequential
external effect pass:

```text
Agency admission
  -> EffectIntent
    -> Authority evaluation
      -> EffectAuthorization or typed refusal
        -> mechanism / Expression
          -> PreparedEffect
            -> Honesty
              -> REVALIDATE
                -> COMMIT
                  -> Receipt
                    -> Effect Witness / Reconciliation
```

If Agency wants to speak and Authority refuses: no message.

---

## 4. Ownership

### 4.1 The kernel owns

**DESIGN DECISION.**

| Owned concern | Meaning |
|---|---|
| Current-effect evaluation | Intersection of required authorities for one exact effect |
| Grant issuance | `EffectAuthorization` objects |
| Typed refusal | Deterministic refusal codes |
| Class preservation | Prepared payload must remain the authorized class |
| Domain-policy dispatch | Communication, engineering, future account policies |
| Revalidation at commit | Prior grant is not assumed current |
| Non-grant of Agency silence | Kernel cannot compel speech |

### 4.2 The kernel does not own

**CONFIRMED FROM SOURCE / DESIGN DECISION.**

| Concern | Owner |
|---|---|
| Who Ashley is | Identity |
| Current condition | Mind State |
| What is considered | Thought |
| What is pursued / admitted | Agency |
| Claim licenses for wording | Thought / Honesty licenses |
| Truth constraints on wording | Honesty |
| Physical mechanism | Capability / connector / Discord transport / Sandbox |
| World facts | Evidence / originating semantic owner |
| Outcome proof | Effect Witness, not the executor |
| Durable work across waits | Operational Continuity |
| Owner infrastructure | Stewardship Compact |

---

## 5. Placement

**DESIGN DECISION.** The kernel sits after Agency admission and before
mechanism execution. Honesty sits on the prepared payload before commit.

```text
Identity + Mind State
        ↓
Thought
        ↓
Agency
        ↓
Authority Kernel
        |
        +------------------+
        |                  |
 Communication       Future Effect
 Policy              Policies
        |                  |
 Discord send        Engineering
                     Accounts
                     Other external systems
        ↓
Capability / Expression
        ↓
Honesty
        ↓
REVALIDATE
        ↓
COMMIT
        ↓
Receipt / Witness / Reconciliation
```

**CONFIRMED FROM SOURCE.** This placement matches External Effect law: the
plane is not a second Agency; it converts an admitted semantic decision into
bounded, enforceable, observable effect contracts.

Rejected placements, recorded so they are not reopened:

| Option | Verdict | Reason |
|---|---|---|
| Inside Agency | Rejected | Admission is not execution. Want would become permit. |
| Inside Thought | Rejected | Thought does not grant effect authority. Model output is not authority. |
| Honesty as authority | Rejected | Honesty is negative control and must never authorize. |
| Capability flags as authority | Rejected | Availability is not a grant. |
| Expression as authority | Rejected | Wording is not permission. |
| Separate Speech Authorization System | Rejected | Speech is a domain policy over the same kernel. |

---

## 6. Ontology

**CONFIRMED FROM SOURCE.** Do not create a competing object family. The kernel
uses External Effect terms.

| Object | Meaning | Authority content |
|---|---|---|
| `OperationalRequest` | Attributed operational input | None |
| `EffectIntent` | Desired external state transition | Zero |
| `EffectAuthorization` | Bounded current grant evidence | The grant |
| `PreparedEffect` | Immutable exact candidate | None until revalidated |
| `EffectCommitRecord` | Attempt boundary | Records exercise; does not grant |
| `Receipt` | Mechanism-observed facts | Not a witness |
| `EffectWitness` | Claim-scoped outcome proof | Not new permission |
| `EffectReconciliation` | Ambiguity disposition | Not retry authority |

**DESIGN DECISION.** Conceptual fields of `EffectAuthorization`:

Required:

- authorization identity
- subject
- `EffectIntent` identity and hash
- Agency decision reference
- effect class and kernel dimensions
- target / audience
- payload or payload-class predicate
- evidence references currently relied upon
- capability contract identity
- constraints
- issue time, expiry, nonce, replay limit
- revocation state
- prepared-effect hash before commit

Forbidden:

- generic `allowed`
- model endorsement
- historical-similar-grant reuse as current permission
- standing unbounded permission

**DESIGN DECISION.** `Decision.authorizedClaims` remains a Honesty claim
license, not an `EffectAuthorization`. Implementation planning may rename the
field later to prevent confusion. This document does not authorize a schema
change.

---

## 7. Effect dimensions

**CONFIRMED FROM SOURCE.** External Effect deferred universal action-kind and
risk taxonomies. This kernel fills the dimension table only. It does not
select numeric risk scores, vendors, or storage schema.

**DESIGN DECISION.** Every external effect is classified on these dimensions.
They are canonical for Authority evaluation.

| Dimension | Values | Rule |
|---|---|---|
| Domain | `communication`, `engineering`, `external_account`, `observation` | Policy module key |
| Direction | `read`, `write`, `execute`, `present` | Invoke and present are distinct |
| Consequence | `ephemeral`, `durable`, `binding`, `public` | Higher consequence cannot be inferred |
| Representation | `ashley_as_self`, `relay_exact`, `represent_owner` | Last value default deny |
| Commitment | `none`, `ashley_bounded`, `owner_binding` | Last value default deny |
| Trigger | `reactive`, `proactive`, `owner_authorized` | Proactive is stricter |

**CONFIRMED FROM SOURCE.** Ordinary communication permission does not include
commitment permission. Account access does not imply representation. Child
authority must be a subset of current parent authority.

**DESIGN DECISION.** Two effects must not share one authorization:

1. capability invocation;
2. communication of that invocation’s result.

A permitted inspection does not authorize a Discord payload. A permitted
local change-set does not authorize presenting that change-set.

---

## 8. Intersection rule

**CONFIRMED FROM SOURCE.** A consequential commit requires the intersection
of current Agency admission, capability permission, effect-domain policy,
target and payload match, credential/session permission when needed,
representation or commitment permission when applicable, privacy permission,
resource budget, and any required explicit owner authorization.

**DESIGN DECISION.** The kernel evaluates that intersection. Missing, expired,
revoked, widened, stale, or unprovable input fails closed.

Agency silence cannot be overridden by a grant. A grant cannot be created by
Agency want. Honesty cannot fill a missing grant. A receipt cannot become a
later grant.

---

## 9. Communication Policy — first consumer

**DESIGN DECISION.** Communication Policy consumes the Authority Kernel. It is
not a Discord permission module and not a Speech Authorization System.

Current first mechanism: Discord owner DM. Future channels must reuse this
policy rather than invent a second speech kernel.

### 9.1 Classes

| Class | Meaning |
|---|---|
| `observation` | Grounded report of current evidence, class-preserving |
| `question` | Genuine uncertainty-reducing question |
| `relationship` | Relational presence without operational or engineering claim |
| `proposal` | Present a candidate plan or artifact as a proposal, not as a done change |
| `action_report` | Claim that an effect occurred |
| `owner_command_reply` | Direct answer to an owner message |

### 9.2 Class rules

| Class | Evidence | Proactive | Reactive | Extra approval |
|---|---|---|---|---|
| `observation` | Current bound observation identity | Deny unless evidence is bound and class is preserved | Permit if Agency admitted and Honesty passes | None beyond current communication gates |
| `question` | None for world facts; class preservation required | Deny unless Agency `ask` and class preserved | Permit | None |
| `relationship` | No operational claim | Existing eligibility still required; no engineering rights | Permit under relationship gates | None |
| `proposal` | Sealed artifact or explicit plan identity; advisory status | Deny | Deny unless owner-solicited or owner-authorized presentation grant | Presentation grant bound to that artifact |
| `action_report` | Current locked OperationalTruth or claim-scoped witness | Deny | Only with that current license | License-owned wording when locked |
| `owner_command_reply` | Ordinary conversation provenance | Not proactive | Permit under ordinary conversation gates | None |

**DESIGN DECISION.** `"0.2.0"` as a standalone Discord payload is not a valid
`observation`. An observation must preserve the authorized sentence shape:
what was inspected or observed, under what identity, what was seen. A bare
token fails class preservation even if the token appeared in inspection
bytes.

### 9.3 Discord send path

**DESIGN DECISION.** Replace:

```text
Scheduler -> Agency -> Thought -> Expression -> Discord
```

with:

```text
Scheduler
  -> Agency
    -> EffectIntent
      -> Authority Kernel + Communication Policy
        -> Expression
          -> PreparedEffect
            -> Honesty
              -> REVALIDATE
                -> COMMIT Discord send
```

This applies to proactive, reactive, and templated Discord sends.
**DESIGN DECISION.** Templates are `PreparedEffect` bodies, not exemptions.
Weekly review drain is a communication effect.

If Authority refuses: no reservation, no send, no “send the fragment anyway.”

---

## 10. Expression contract

**CONFIRMED FROM SOURCE.** Expression owns wording. Rendering owns transport
mechanics. Honesty is last-resort negative control and must never authorize
claims.

**DESIGN DECISION.** After this contract, Expression may:

- transform already-authorized meaning into language;
- stay inside the authorized class, audience, representation, and commitment.

Expression may not:

- create authority;
- change effect class;
- upgrade an observation into an action report;
- add a commitment or owner-representation implication;
- bypass evidence;
- treat Agency stance as a grant;
- treat a capability result as a grant.

If generated text violates the authorization, the send is rejected. Do not
silently send a remainder, a token, or a floored fallback unless that fallback
is itself a newly authorized `PreparedEffect`.

If Honesty mutates wording, including locked OperationalTruth replacement,
the payload changed. Revalidation is required. Locked replacement is
license-owned mechanical wording, not Honesty granting send permission.

---

## 11. Future policy modules

**DESIGN DECISION.** Later consumers attach as policies, not as new kernels.

| Policy | First effects | Notes |
|---|---|---|
| Communication | Discord present | First consumer |
| Engineering | inspect, experiment, verify, author locally, later M7 borders | Local candidate work is not live Git. Presenting results is Communication. |
| External account | read, request, write, execute | Credential use ≠ action authority |
| Observation | bounded external read | Incidental write side-effects must be declared or refused |

Engineering local work may still require capability gates. It does not
inherit Discord send rights. Discord send does not inherit engineering
rights.

---

## 12. M5 relationship

This document does not design M5.

**CONFIRMED FROM SOURCE.** M5 creates a coherent, identity-bound engineering
change set over candidate state. Authored change remains advisory. No live
repository mutation or Git publication. Owner approval of a change set
records a decision state. It does not by itself authorize apply, commit,
push, deploy, restart, installation, or capability promotion. Git commit,
branch, push, and PR remain M7 profiles.

**CONFIRMED FROM SOURCE.** Local proposal formation is not the external
effect. Presenting a proposal externally is.

**CONFIRMED FROM SOURCE.** M5 is blocked until M4 `PRODUCTION ACCEPTED`. In
this checkout, `docs/handoffs/M4_PRODUCTION_ACCEPTANCE.md` is
`PROPOSED FOR ACCEPTANCE` and does not claim `PRODUCTION ACCEPTED`.
`docs/handoffs/M3_PRODUCTION_ACCEPTANCE.md` is absent. M3 production
acceptance is therefore `UNKNOWN` as independently verified from this
worktree, even though the M4 packet cites predecessor SHA
`28e157a4d2029c3196559fd2569d73e48c53e1b3`.

**DESIGN DECISION.** Authority enables later M5 by splitting three acts:

| Act | Class | Default |
|---|---|---|
| Seal a local change-set artifact | engineering local authoring | Requires the M5 milestone and capability; not a Discord grant |
| Tell Doc a proposal exists | communication `proposal` | Deny unsolicited; require a presentation grant bound to the artifact hash |
| Claim the live system changed, merged, or deployed | communication `action_report` plus engineering apply | Deny |

---

## 13. Lifecycle

**CONFIRMED FROM SOURCE.** Persisted authorization is not assumed current
after delay, restart, human handoff, payload change, or policy change.

**DESIGN DECISION.**

```text
evaluate -> refuse | grant
grant is time-bound, class-bound, payload-bound, audience-bound
PREPARE exact payload
Honesty may strip or replace wording
wording change => new PreparedEffect => REVALIDATE or refuse
COMMIT consumes replay slot
revocation / emergency stop / pause / expiry / context change => fail closed
rollback reduces future authority; it does not erase a completed send
```

Compensation is a new effect with its own authorization.

---

## 14. Threat model

### 14.1 Model self-authorization

**CONFIRMED FROM SOURCE.** Model output is candidate input, not authority.
External entities cannot grant permissions or authorize execution.

**DESIGN DECISION.** No authorization field exists for model endorsement.
Thought or Agency text cannot widen class, audience, representation,
commitment, or budget.

### 14.2 Capability confusion

**CONFIRMED FROM SOURCE.** Tool present is not authority to use it.
Capability success is not permission to speak or to act further.

**DESIGN DECISION.** Invoke and present use separate authorizations.

### 14.3 Evidence confusion

**CONFIRMED FROM SOURCE.** Source evidence is not world truth. Receipt is not
Effect Witness. Observe-era evidence cannot time-shift into influence.

**DESIGN DECISION.** Evidence references must be current. Historical
similarity is not a grant field.

### 14.4 Scope expansion

**CONFIRMED FROM SOURCE.** Child authority must remain a subset of current
parent authority. No generic action-authority boolean.

**DESIGN DECISION.** Replay limit and exact payload binding prevent a narrow
grant from becoming standing permission.

### 14.5 Social engineering

**CONFIRMED FROM SOURCE.** Ashley must not imply that Doc approved, promised,
agreed, purchased, accepted, waived, or endorsed something unless the exact
authority exists.

**DESIGN DECISION.** `proposal` payloads remain advisory. `action_report`
without a current license is refused. Language cannot create the missing
grant.

### 14.6 Kernel capture

**CONFIRMED FROM SOURCE.** The External Effect plane must not create desires
or replace Agency. Operator authority does not compel speech.

**DESIGN DECISION.** If the kernel starts choosing goals or compelling
speech, it has failed. Substantial later widening of external-effect grants
requires consultation (`SC-CON-06`).

### 14.7 Bypass

**DESIGN DECISION.** Every Discord send is a communication effect, including
reactive replies and templated weekly review. A new channel cannot skip the
kernel by calling itself “just messages.”

---

## 15. Acceptance of this architecture

This architecture is accepted as the kernel contract when:

- no Speech Authorization System is introduced beside it;
- no generic external-allow boolean is introduced;
- Discord send is recognized as a Communication Policy consumer;
- Expression cannot change class or mint grants;
- Honesty remains negative;
- M5 remains undesigned here and blocked on documented predecessors;
- implementation remains unauthorized until a separate implementation plan
  is accepted.

This document does not implement the kernel. It does not complete a
milestone. It does not accept M3, M4, or M5.

---

## 16. Live facts used in this reading

| Fact | Result |
|---|---|
| Architecture parent | External Effect and Authority, `AUTHORITATIVE`, 2026-08-21 |
| M3 production packet | `UNKNOWN` / absent |
| M4 production packet | `PROPOSED FOR ACCEPTANCE`; not `PRODUCTION ACCEPTED` |
| M4 candidate SHA in packet | `553553b0d0ee6a6d2cabd8928b901400e5a1ea74` |
| `"0.2.0"` cause | `UNKNOWN` |
| Deployed SHA | `UNKNOWN` |
