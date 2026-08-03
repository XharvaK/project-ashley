# Boundary 6 — Thought Completion Ownership (Architecture Review)

**Boundary:** Prompt 6 — Thought completion ownership  
**Date:** 2026-08-03  
**Normative source:** Nuclear Architecture Capability Audit plan; review method per [Architecture Review Protocol](../Architecture_Review_Protocol.md)

This document records why Boundary 6 satisfies the specification. It does not define additional acceptance criteria.

**Completion** means the decision that no further reasoning should be emitted, not the stylistic appearance of the final response.

- Thought → decides reasoning is complete.
- Expression → chooses how that completed or incomplete reasoning is phrased.
- Rendering → formats transport only.

---

## Ownership Gate (pre-implementation)

| Field | Value |
|-------|--------|
| Current owner | Expression nuclear guidance claimed when reasoning had finished |
| Desired owner | Thought determines completion; Expression only renders wording |
| Why | Prompt 2 Decision contract + Prompt 3 Expression/Rendering + Glossary uncertainty split |
| Refused | Agency/Decision redesign, new reasoning stages, Reflection/Learning, prompt expansion, new abstractions |

---

## Audit

Audited Expression code, Expression-owned prompts (`workspace/prompts/nuclear/`), ContextComposer, Runtime, and Expression-owned documentation for completion-policy ownership.

| Location | Finding |
|----------|---------|
| [`core.md`](../../workspace/prompts/nuclear/core.md) | **Violation:** “When reasoning has finished…” assigned completion to Expression |
| Other nuclear prompts | No completion-policy ownership |
| `expression.ts` | No completion-policy logic |
| ContextComposer | Transports Decision (`Should speak`) without deciding |
| Runtime | Gates Expression on Thought `shouldSpeak` |
| Expression-owned docs | No additional ownership violations |

**Fix scope:** `core.md` only. No further documentation changes.

---

## Implementation summary

Removed Expression ownership of *when* reasoning finished. Preserved wording guidance: do not manufacture concluding paragraphs; incomplete endings are fine.

**Before:** `When reasoning has finished, do not manufacture a concluding paragraph. Incomplete endings are fine.`  
**After:** `Do not manufacture a concluding paragraph. Incomplete endings are fine.`

No Agency, Decision, Runtime, ContextComposer, Expression.ts, Identity, Mind State, or Honesty code changes.

---

## Verification

- Thought exclusively owns reasoning completion (`shouldSpeak` / silence / delay).
- Expression owns wording only.
- No Expression-owned artifact determines, implies, or infers when reasoning has completed.
- No downstream reconstruction of completion state.
- Sequencing: Thought → Honesty (in Expression path) → Expression → Rendering.

---

## Ownership tests

| Test | Result |
|------|--------|
| **Test 1:** Replacing Expression changes wording only | Pass |
| **Test 2:** If Thought indicates the response is incomplete, Expression cannot complete it on its own | Pass — Runtime withholds Expression when `!shouldSpeak`; Expression prompt no longer claims completion timing |
| **Test 3:** Completion decisions are never reconstructed downstream | Pass |
| **Test 4:** Conversation transport does not determine completion | Pass |

---

## 1. Ownership Transfer Record

| Field | Value |
|-------|--------|
| Current owner | Expression prompt guidance (`core.md`) |
| Desired owner | Thought (completion); Expression (phrasing only) |
| Final owner | Thought owns completion; Expression owns wording guidance without timing claim |
| Reason for transfer | Completion is a Thought decision; Expression must not determine when further reasoning should stop |
| Ownership rule cited | Prompt 6; Glossary uncertainty split; Global Invariant 2 |
| Ownership transferred exactly once? | Yes (subtractive removal of Expression claim) |
| Behavioral owner duplicated? | No |

---

## 2. Ownership Diff

```
Removed ownership
Expression prompt claim on when reasoning finished

Removed ownership inversions
Expression implying completion timing via nuclear core guidance
```

---

## 3. Behavioral Classification

| Classification | Content |
|----------------|---------|
| Behavior moved | none (completion already Thought-gated in runtime; Expression prompt ownership removed) |
| Behavior removed | Expression prompt claim on when reasoning finished |
| Behavior unchanged | shouldSpeak gating, Decision transport, incomplete-ending wording allowance |
| New behavior | empty |

---

## 4. Review Checklist

| Question | Answer |
|----------|--------|
| Did ownership move? | Yes (Expression completion claim removed) |
| Was ownership transferred exactly once? | Yes |
| Was any upstream reconstruction by a downstream consumer introduced? | No |
| Was any behavioral logic duplicated? | No |
| Was coupling reduced? | Yes — Expression no longer owns completion timing |
| Which dependency or ownership inversion disappeared? | Expression guidance deciding when reasoning finished |
| Were any new peer dependencies introduced? | No |
| Was observable runtime behavior preserved? | Yes (no wrap-up manufacturing; incomplete endings still allowed) |
| Does the implementation satisfy every Definition of Done item? | Yes |
| Were obsolete forwarding wrappers removed (if applicable)? | N/A |
| Was the smallest implementation algorithm step used? | Yes — subtractive prompt ownership fix only |
| Were any unused extension points or scaffolding introduced? | No |

Passing tests are not sufficient. A boundary is accepted only if the review artifacts demonstrate compliance with the Ownership Gate, Normative Process, Definition of Done, Global Invariants, and the boundary-specific goals.

---

## Definition of Done (Prompt 6) — checked

- [x] Thought exclusively owns reasoning completion
- [x] Expression never determines conversation completion
- [x] No Expression-owned artifact determines, implies, or infers when reasoning has completed
- [x] No downstream reconstruction of completion state
- [x] No new abstractions; no Decision redesign; no Prompt 7 work
- [x] Public behavior preserved
- [x] Coupling reduced; diff limited to audited completion-ownership violations and this review document
