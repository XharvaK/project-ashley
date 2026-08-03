# Boundary 3 — Expression / Rendering Separation (Architecture Review)

**Boundary:** Prompt 3 — Expression / Rendering separation  
**Date:** 2026-08-03  
**Normative source:** Nuclear Architecture Capability Audit plan; review method per [Architecture Review Protocol](../Architecture_Review_Protocol.md)

This document records why Boundary 3 satisfies the specification. It does not define additional acceptance criteria.

---

## Ownership Gate (pre-implementation)

| Field | Value |
|-------|--------|
| Current owner | Conversation (`renderSpeak`, render helpers, rendering utilities) |
| Desired owner | Expression owns wording; Rendering owns transport formatting only |
| Why | Audit: Expression = language generation; Rendering = transport; Rendering must never create wording |
| Refused | Prompt redesign, Decision redesign, Honesty redesign, ContextComposer redesign, Reflection/Learning, Cognition stages |

---

## Implementation summary

**Algorithm step used:** Move + mechanical completion (then rename module to Expression).

- Moved wording generation from `conversation/render.ts` → `conversation/expression.ts` (`expressSpeak`).
- Moved language-adjacent `stripPipelineNarration` from Rendering into Expression.
- Rendering (`renderForTransport`) retains only transport-required transforms: typography sanitize, metadata echo strip, media marker strip.
- Deleted obsolete `conversation/render.ts`.
- Runtime callers updated to `expressSpeak`.

**Incidental behavior change (transport/ownership-required):** Honesty finalize now sees Expression wording before transport sanitize (single `renderForTransport` pass after honesty). Same Discord-facing pipeline otherwise.

---

## 1. Ownership Transfer Record

| Field | Value |
|-------|--------|
| Current owner | Conversation (mixed wording + Discord formatting) |
| Desired owner | Expression (wording); Rendering (transport only) |
| Final owner | Expression (`conversation/expression.ts`); Rendering (`conversation/rendering.ts`) |
| Reason for transfer | Separate language generation from Discord-compatible transport so Rendering cannot invent or rewrite wording |
| Ownership rule cited | Prompt 3 goals; Glossary Expression vs Rendering; Global Invariant 3 (Rendering must not reconstruct/invent wording) |
| Ownership transferred exactly once? | Yes |
| Behavioral owner duplicated? | No |

---

## 2. Ownership Diff

```
Ownership changes
Conversation wording responsibilities -> Expression
Conversation Discord formatting -> Rendering
stripPipelineNarration (language cleanup) -> Expression

Removed ownership
Conversation mixed language/transport responsibilities

Removed duplicate assembly
(none — Prompt 1)

Removed ownership inversions
Rendering inspecting conversational semantics via pipeline-narration wording removal
```

---

## 3. Behavioral Classification

Every changed behavior appears exactly once:

| Behavior | Classification |
|----------|----------------|
| wording generation (`expressSpeak` / LLM path) | Behavior moved |
| transport formatting (`renderForTransport`) | Behavior moved |
| `stripPipelineNarration` | Behavior moved (Expression) |
| final Discord output shape | Behavior unchanged |
| prompt behavior | Behavior unchanged |
| Decision consumption (authorizedClaims → license note) | Behavior unchanged |
| Honesty finalize (last-resort floor) | Behavior unchanged |
| Honesty sees pre-transport wording | Minimal observable behavior change (required by ownership transfer) |
| New behavior | empty |

---

## 4. Review Checklist

| Question | Answer |
|----------|--------|
| Did ownership move? | Yes |
| Was ownership transferred exactly once? | Yes |
| Was any upstream reconstruction by a downstream consumer introduced? | No |
| Was any behavioral logic duplicated? | No |
| Was coupling reduced? | Yes — wording and transport no longer mixed in one Conversation owner |
| Which dependency or ownership inversion disappeared? | Rendering owning language-adjacent pipeline-narration stripping |
| Were any new peer dependencies introduced? | No |
| Was observable runtime behavior preserved? | Yes, aside from named incidental honesty/transport ordering |
| Does the implementation satisfy every Definition of Done item? | Yes |
| Were obsolete forwarding wrappers removed (if applicable)? | Yes — deleted `render.ts` |
| Was the smallest implementation algorithm step used (Move → Rename → Extract → New abstraction)? | Yes — Move + rename to Expression; no new abstraction beyond named product types |
| Were any unused extension points or scaffolding introduced? | No |

Passing tests are not sufficient. A boundary is accepted only if the review artifacts demonstrate compliance with the Ownership Gate, Normative Process, Definition of Done, Global Invariants, and the boundary-specific goals.

---

## Verification (Rendering purity)

- Rendering does not access Identity, Mind State, Decision, Motivation, or Memory.
- Rendering only consumes Expression output text + transport requirements.
- Tests: `runtime.test.ts`, `decide.test.ts`, `finalize.test.ts`, `typography.test.ts` — 17/17 passed.

---

## Definition of Done (Prompt 3) — checked

- [x] Expression owns all language generation
- [x] Rendering owns only transport
- [x] Rendering is a pure function of Expression output and platform requirements
- [x] Rendering performs no lexical decision-making
- [x] Rendering no longer depends on Identity, Mind State, Decision, Memory, or Motivation
- [x] Coupling is reduced
- [x] No new architectural layers introduced
- [x] No Reflection/Learning scaffolding
- [x] Public behavior preserved except explicitly identified transport-only / ordering changes
