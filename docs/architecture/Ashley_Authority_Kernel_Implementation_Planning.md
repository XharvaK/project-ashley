# Ashley Authority Kernel — Implementation Planning Foundation

**Status:** `SUPPORTING`

**Date:** 2026-08-23

**Scope:** Planning questions and seam inventory only. This document does not
authorize implementation, schema, migration, runtime change, tests as
promotion, M5, or production enablement.

**Parent contracts:**

- [`Ashley_Authority_Kernel_Architecture.md`](Ashley_Authority_Kernel_Architecture.md)
- [`External_Effect_and_Authority_Architecture.md`](External_Effect_and_Authority_Architecture.md)

The architecture is ready for an implementation plan. This file is not that
plan. It records what a later plan must answer.

---

## 1. Planning objective

**DESIGN DECISION.** The first implementation slice, when separately
authorized, should make Discord send a Communication Policy consumer of the
Authority Kernel. It should not build a Speech Authorization System. It
should not start M5.

**CONFIRMED FROM SOURCE.** Verification for a docs-only architecture change
is documentation verification. When code is later authorized, Wave
Acceptance selects focused falsification during ITERATION and SETTLEMENT
build/typecheck for settled code. Tests never promote.

---

## 2. Existing objects that already rhyme with the kernel

**CONFIRMED FROM SOURCE.** These exist and must not be forked into a second
ontology.

| Existing object / seam | Current meaning | Planning implication |
|---|---|---|
| `AgencyEffectIntent` / `deriveEffectIntent` | Zero-authority intent from Decision + revalidated OCI grounds; today maps grounded `question` to `sandbox_verify_build_health` | Current runtime cousin of architectural `EffectIntent`. Extend or wrap; do not fork a speech-only ontology |
| `observeSandboxEffectIntentAdmission` | Observe-only bookkeeping; swallows errors | Not the Discord gate. Do not promote bookkeeping into a grant |
| `DecisionKind` | Agency stance | Do not overload with effect class |
| `Decision.authorizedClaims` | Honesty claim license | Do not treat as `EffectAuthorization` |
| `Decision.operationalLicense` | Operational claim license | Honesty input, not send permission |
| Honesty `finalizeHonesty` | Negative control; locked OperationalTruth may replace wording | Keep negative; revalidate after mutation |
| Eligibility + score + non-empty draft | Boolean send path | Insufficient as Authority |
| Delivery reservation / bubbles / Discord send | Transport | COMMIT mechanism, not grant |
| Weekly review templated draft | Same send path, no Expression | Must still be a communication effect |
| Capability gates / `apply` ceiling | Mechanism eligibility | One conjunct, not the grant |
| Sandbox proactive M3/M4 fail-closed | Engineering invoke denied on proactive | Keep; add separate present authorization |

**UNKNOWN.** Whether any uncommitted local branch already drafted an
`EffectAuthorization` runtime type. This worktree’s tracked source was not
searched as an implementation task. A later plan must inventory current
TypeScript types before adding names.

---

## 3. Current Discord bypass

**CONFIRMED FROM SOURCE.** The bypass is that Discord send does not pass
External Effect `PREPARE -> REVALIDATE -> COMMIT` as an authorized
communication effect. Expression plus Honesty plus non-empty draft can
reserve and send.

Primary seams a later plan must name exactly:

- proactive runtime in `apps/agent-service/src/core/runtime.ts`
- reactive `POST /chat/text` in `apps/agent-service/src/server.ts`
- `apps/agent-service/src/core/conversation/expression.ts`
- Honesty `finalizeHonesty`
- delivery reservation / bubble send
- `apps/agent-service/src/core/sandbox/weekly-review-delivery.ts`
- Discord bot `sendBubbles` in `apps/discord-bot/src/conversation/send-bubbles.ts`

**DESIGN DECISION.** Smallest migration seam: intercept Discord send after
Agency admission and before reservation, requiring `EffectIntent` +
Communication Policy evaluation + class-preserving `PreparedEffect`.

Do not start by rewriting Agency, Thought, Sandbox M2–M4, or Honesty
philosophy.

---

## 4. Consumers the later plan must classify

| Path | Is it an external effect? | First-slice expectation |
|---|---|---|
| Proactive Discord DM | Yes, communication present | Must pass kernel |
| Reactive Discord reply | Yes, communication present | Must pass kernel |
| Weekly review template | Yes, communication present | Must pass kernel |
| Slash-command ephemeral status | Unknown until classified | Later plan must decide if it is owner-command reply or a distinct system surface |
| M2 inspection | Engineering/observation invoke | Already capability-gated; must not grant Discord present |
| M3 candidate experiment | Engineering write, fail-closed proactive | Keep fail-closed |
| M4 verification | Engineering execute, fail-closed proactive | Keep fail-closed |
| Curiosity fetch | Observation with network | Out of first Discord slice unless it sends |
| Capability observe-mode records | Local/cognitive | Not Discord authority |

---

## 5. Naming questions a later plan must resolve

These are planning questions, not schema authorization.

1. Keep `EffectAuthorization` as the runtime name, matching architecture?
2. Rename `authorizedClaims` to a claim-license name so it cannot be mistaken
   for effect authority?
3. Where does `effect_class` live: on `EffectIntent`, on a Communication
   Policy input, or both?
4. Is class preservation a deterministic checker after Expression, before
   Honesty, after Honesty, or both after Expression and after Honesty?
5. Are grants durable rows in `nuclear.db`, or ephemeral per send for the
   first slice?

**DESIGN DECISION for first slice, if the later plan does not override it:**
ephemeral per-attempt grants are enough for Discord send. Durable grant
tables are not required to close the bypass.

---

## 6. Tests a later plan must require

Focused falsification, not a generic corpus as the first proof.

1. Agency wants to speak + Authority refuses => no Discord send.
2. Non-empty under-specified draft (`"0.2.0"` class) => reject, do not send.
3. Successful M2 inspection + Agency speak + non-empty draft => still no
   send unless a communication `observation` grant exists and class is
   preserved.
4. Honesty flooring or locked OperationalTruth replacement => revalidation;
   class violation still refuses.
5. Weekly templated send cannot skip the kernel.
6. No `externalAllowed: true` API exists.
7. Model text cannot mint a grant.
8. Agency silence cannot be overridden by a leftover grant.

**CONFIRMED FROM SOURCE.** Passing those tests would not promote a
capability, accept M4, or start M5.

---

## 7. Acceptance evidence a later implementation wave must separate

| Claim | Evidence required |
|---|---|
| Architecture accepted | This kernel document plus parent External Effect contract |
| Implementation present | Named runtime seam and types |
| Locally verified | Focused falsification + build/typecheck |
| Independently reviewed | Separate review packet |
| Physically qualified | Only if the claim depends on Mint/Discord transport |
| Production accepted | Exact-candidate production witness of the communication consumer |

Do not collapse these.

**UNKNOWN.** Production deployed SHA and whether proactive M2 is enabled
there. A later physical or production claim must observe them.

---

## 8. Prerequisites before an implementation plan may start

1. This kernel architecture remains the current contract.
2. No Speech Authorization System is proposed instead.
3. M5 remains out of scope.
4. M3/M4 production-acceptance status is resolved live when those milestones
   are relevant; they are not unblocked by this kernel design.
5. Owner consultation is recorded if the implementation is judged a
   substantial grant of external authority (`SC-CON-06`). Closing the Discord
   bypass is constraint, not a new grant, but a later widening would be
   consultation-bearing.
6. The implementation plan names the exact files, objects, refusal codes,
   and falsification tests above.

Until that plan exists and is accepted, implementation is not authorized.
