# Boundary 5 — Mind State Cleanup (Architecture Review)

**Boundary:** Prompt 5 — Mind State cleanup (ownership clarification)  
**Date:** 2026-08-03  
**Normative source:** Nuclear Architecture Capability Audit plan; review method per [Architecture Review Protocol](../Architecture_Review_Protocol.md)

This document records why Boundary 5 satisfies the specification. It does not define additional acceptance criteria.

---

## Ownership Gate (pre-implementation)

| Field | Value |
|-------|--------|
| Current owner | Mind State update paths persisted Thought `DecisionKind` / angles into `focus` |
| Desired owner | Mind State = transient condition only; Thought = every transient cognitive decision |
| Why | Glossary; Prompt 5; Global Invariant 2; Downward Migration |
| Refused | Thought/Agency/Identity/Expression/Honesty redesign; Reflection/Learning; Cognition stages; new abstractions; storage redesign |

## Focus invariant

`focus` represents the agent's current attentional condition, never a reasoning decision or `DecisionKind`. Only updated when attentional condition changes (e.g. sleep → `own_time`).

---

## Implementation summary

**Algorithm:** Smallest valid ownership transfer (subtractive cleanup of Mind State update paths).

In [`runtime.ts`](../../apps/agent-service/src/core/runtime.ts):

- Reactive non-speak / silence: patch `availability` only (`quiet` iff silence).
- Reactive speak: patch `availability: "available"` only.
- Proactive commit: patch `availability: "available"` only; leave `focus` unchanged.
- Sleep path unchanged: `availability: "quiet"`, `focus: "own_time"`.

No store schema/API, Agency, Expression, Honesty, Identity, or Decision changes.

---

## Verification

- Mind State module (`state/*`) assigns no transient cognitive decisions.
- No runtime path persists `DecisionKind`, decision angle, or equivalent transient cognitive output into `MindState`. Equivalent = any value whose semantics encode a Thought decision (including DecisionKind, decision-derived angles, speak/silence outcomes, or future aliases).
- Ownership direction: Mind State may influence Thought as an input; Thought decisions are not persisted back into Mind State except through genuine condition changes (`quiet`/`available`, sleep `own_time`).
- Tests: `runtime.test.ts`, `decide.test.ts`, `questions.test.ts` — 8/8 passed.

---

## Ownership tests

| Test | Result |
|------|--------|
| **Test 1:** Changing Mind State changes condition without changing reasoning policy | Pass |
| **Test 2:** Removing Mind State would change availability/focus/context, not ownership of cognitive decisions | Pass |
| **Test 3:** Mind State may influence Thought as an input, but Thought decisions must never be persisted back into Mind State except through genuine condition changes | Pass |

---

## 1. Ownership Transfer Record

| Field | Value |
|-------|--------|
| Current owner | Runtime Mind State updates writing Thought decisions into `focus` |
| Desired owner | Mind State condition only; Thought owns decisions |
| Final owner | Mind State (condition); Thought (decisions); update paths no longer invert ownership |
| Reason for transfer | Mind State must answer “what is my current cognitive condition?” only |
| Ownership rule cited | Prompt 5; Global Invariant 2; focus invariant |
| Ownership transferred exactly once? | Yes (subtractive removal of inversion) |
| Behavioral owner duplicated? | No |

---

## 2. Ownership Diff

```
Removed ownership
Mind State persistence of DecisionKind-derived focus

Removed ownership inversions
Runtime writing Thought decisions into Mind State
```

---

## 3. Behavioral Classification

| Classification | Content |
|----------------|---------|
| Behavior moved | none |
| Behavior removed | persistence of decision-derived focus |
| Behavior unchanged | reasoning, speech decisions, motivations |
| Minimal observable behavior change | ownership cleanup only (focus no longer echoes decisions) |
| New behavior | none |

---

## 4. Review Checklist

| Question | Answer |
|----------|--------|
| Did ownership move? | Yes (inversion removed) |
| Was ownership transferred exactly once? | Yes |
| Was any upstream reconstruction by a downstream consumer introduced? | No |
| Was any behavioral logic duplicated? | No |
| Was coupling reduced? | Yes — Mind State no longer mirrors Thought decisions |
| Which dependency or ownership inversion disappeared? | Runtime writing DecisionKind/angle into focus |
| Were any new peer dependencies introduced? | No |
| Was observable runtime behavior preserved? | Yes, aside from ownership-driven focus cleanup |
| Does the implementation satisfy every Definition of Done item? | Yes |
| Were obsolete forwarding wrappers removed (if applicable)? | N/A |
| Was the smallest implementation algorithm step used? | Yes — subtractive update-path cleanup |
| Were any unused extension points or scaffolding introduced? | No |

Passing tests are not sufficient. A boundary is accepted only if the review artifacts demonstrate compliance with the Ownership Gate, Normative Process, Definition of Done, Global Invariants, and the boundary-specific goals.

---

## Definition of Done (Prompt 5) — checked

- [x] Mind State owns only transient cognitive condition
- [x] Thought owns every transient cognitive decision
- [x] No remaining Mind State-owned code/update path determines reasoning behavior via stored DecisionKind
- [x] No runtime path persists DecisionKind, decision angle, or equivalent transient cognitive output into MindState
- [x] No new abstractions; no Prompt 6–7 work
- [x] Public behavior preserved except ownership-driven cleanup
- [x] Coupling reduced; diff Mind State-scoped
