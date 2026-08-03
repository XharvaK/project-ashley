# Boundary 4 — Identity Cleanup (Architecture Review)

**Boundary:** Prompt 4 — Identity cleanup (subtractive)  
**Date:** 2026-08-03  
**Normative source:** Nuclear Architecture Capability Audit plan; review method per [Architecture Review Protocol](../Architecture_Review_Protocol.md)

This document records why Boundary 4 satisfies the specification. It does not define additional acceptance criteria.

---

## Ownership Gate (pre-implementation)

| Field | Value |
|-------|--------|
| Current owner | Identity (seed text mixed stable disposition with turn-level conversational behavior) |
| Desired owner | Identity = stable characteristics only; Thought = reasoning stop / whether to admit uncertainty; Expression = wording |
| Why | Glossary uncertainty split; Prompt 4; Global Invariant 2 |
| Refused | Agency/Thought/Expression redesign, nuclear prompt redesign, Mind State, Honesty, Reflection/Learning, new abstractions |

---

## Implementation summary

**Algorithm:** Smallest valid ownership transfer (slimming / retirement; not a literal Move of code into Thought/Expression).

- Slimmed Identity seed strings in [`seed.ts`](../../apps/agent-service/src/core/identity/seed.ts).
- Bumped `SEED_VERSION` `3` → `4`.
- Retires obsolete seeded ownership statements via the existing seed/version path so only current Identity seed remains (no dual active ownership statements).
- Nuclear prompts, Agency, Expression, Honesty, ContextComposer, Rendering untouched.

**Ownership-driven wording changes:**

| Before | After |
|--------|--------|
| `accuracy over performance; say what is true and admit uncertainty` | `accuracy over performance; say what is true` |
| `comfortable with uncertainty; does not need false closure` | `comfortable with uncertainty` |

---

## Verification (Identity-owned surface)

Scanned Identity-owned code, seed text, and identity prompt material (`apps/agent-service/src/core/identity/*`).

**Result:** No remaining Identity-owned code, seed text, or identity prompt material instructs when reasoning should stop, whether uncertainty should be admitted, or how conversations should conclude.

- Active seed retains disposition only: `comfortable with uncertainty`.
- Obsolete phrases appear only as retirement `from` mappings and migration test fixtures, not as live Identity ownership.
- [`core.md`](../../workspace/prompts/nuclear/core.md) wrap-up line left untouched (Expression guidance; Prompt 6 + Expression per audit — not Identity-owned).

**Tests:** `store.test.ts` — 3/3 passed.

---

## Ownership tests

| Test | Result |
|------|--------|
| **Test 1:** Removing Identity should change personality but not conversation mechanics | Pass — Identity seed no longer encodes wrap-up / stop / admit / endings; those live outside Identity |
| **Test 2:** Changing Identity values should change preferences, not stop/admit/elaborate mechanics | Pass — remaining Identity text is personality/values/tastes/boundaries/comfort with uncertainty |
| **Test 3:** Expression can render Thought decisions correctly regardless of Identity | Pass — Identity no longer owns those decisions or their wording |

---

## 1. Ownership Transfer Record

| Field | Value |
|-------|--------|
| Current owner | Identity (seed statements that instructed admit-uncertainty / false-closure endings) |
| Desired owner | Thought (whether to admit / stop); Expression (wording); Identity retains comfort with uncertainty |
| Final owner | Identity slimmed; turn-level ownership removed from Identity (Thought/Expression already own those layers per stack — no code move this boundary) |
| Reason for transfer | Identity must own only stable characteristics; turn-level conversational behavior is misplaced ownership |
| Ownership rule cited | Prompt 4 goals; Glossary uncertainty split; Global Invariant 2 |
| Ownership transferred exactly once? | Yes (subtractive retirement of Identity ownership; no bounce) |
| Behavioral owner duplicated? | No |

---

## 2. Ownership Diff

```
Ownership changes
Identity admit-uncertainty instruction -> Thought/Expression (ownership removed from Identity)
Identity false-closure / ending instruction -> Thought/Expression (ownership removed from Identity)

Removed ownership
Identity conversation-ending behavior
Identity uncertainty admission behavior

Removed duplicate assembly
(none)

Removed ownership inversions
Identity controlling transient conversational behavior via seed text
```

---

## 3. Behavioral Classification

Every changed behavior appears exactly once:

| Behavior | Classification |
|----------|----------------|
| reasoning-stop ownership (Identity-encoded) | Behavior moved (removed from Identity) |
| wrap-up / false-closure ownership | Behavior moved (removed from Identity) |
| uncertainty admission ownership | Behavior moved (removed from Identity) |
| personality / values / tastes / opinions / long-term disposition | Behavior unchanged |
| comfort with uncertainty (disposition) | Behavior unchanged |
| Seed wording slim | Minimal observable behavior change (required by ownership transfer) |
| New behavior | empty |

---

## 4. Review Checklist

| Question | Answer |
|----------|--------|
| Did ownership move? | Yes (subtractive from Identity) |
| Was ownership transferred exactly once? | Yes |
| Was any upstream reconstruction by a downstream consumer introduced? | No |
| Was any behavioral logic duplicated? | No |
| Was coupling reduced? | Yes — Identity no longer encodes turn-level conversational mechanics |
| Which dependency or ownership inversion disappeared? | Identity seed instructing admit-uncertainty / false closure |
| Were any new peer dependencies introduced? | No |
| Was observable runtime behavior preserved? | Yes, aside from ownership-driven seed wording |
| Does the implementation satisfy every Definition of Done item? | Yes |
| Were obsolete forwarding wrappers removed (if applicable)? | N/A — obsolete seeded ownership statements retired |
| Was the smallest implementation algorithm step used? | Yes — smallest valid ownership transfer (slim + retire) |
| Were any unused extension points or scaffolding introduced? | No |

Passing tests are not sufficient. A boundary is accepted only if the review artifacts demonstrate compliance with the Ownership Gate, Normative Process, Definition of Done, Global Invariants, and the boundary-specific goals.

---

## Definition of Done (Prompt 4) — checked

- [x] Identity owns only stable characteristics
- [x] Identity no longer owns wrap-up behavior
- [x] Identity no longer owns reasoning termination
- [x] Identity no longer owns uncertainty admission
- [x] Identity no longer owns “I don’t know”
- [x] No remaining Identity-owned code, seed text, or identity prompt material instructs stop / admit / conclude
- [x] No new abstractions; no Prompt 5–7 work
- [x] Public behavior preserved except ownership-driven seed wording
- [x] Coupling reduced
- [x] Diff Identity-scoped and small
