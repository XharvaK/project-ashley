# Boundary 2 — Thought Output Contract (Architecture Review)

**Boundary:** Prompt 2 — Thought output contract  
**Mode:** Verification only (Prompt 2 already implemented in `44919dea`)  
**Date:** 2026-08-03  
**Normative source:** Nuclear Architecture Capability Audit plan; review method per [Architecture Review Protocol](../Architecture_Review_Protocol.md)

This document records why Boundary 2 satisfies the specification. It does not define additional acceptance criteria.

---

## Verification summary

Scanned Conversation, Expression (`conversation/render.ts`), Honesty, ContextComposer, and Runtime for upstream reconstruction of transient cognitive decisions by a downstream consumer.

**Findings:** No residual ownership violations.

- Expression consumes `Decision.authorizedClaims` only (does not infer license from `DecisionKind`).
- Runtime gates speak on `Decision.cognitiveAllocation.shouldSpeak` (Thought-owned field).
- Honesty finalize rejects unlicensed claims; does not authorize.
- `attachAuthorizedClaims` lives in Thought (`agency/decide.ts`) and runs before Expression.

**Code changes this pass:** none.

**Tests:** `decide.test.ts`, `finalize.test.ts`, `runtime.test.ts` — 10/10 passed.

---

## 1. Ownership Transfer Record

| Field | Value |
|-------|--------|
| Current owner | Conversation/Expression (historically reconstructed reading license / speak implications from `DecisionKind` + takes) |
| Desired owner | Thought (Agency location: `decide` / `attachAuthorizedClaims`) |
| Final owner | Thought (`apps/agent-service/src/core/agency/decide.ts`) |
| Reason for transfer | Emit complete transient cognitive output on `Decision` before Expression is invoked |
| Ownership rule cited | Prompt 2 Hard rule; Global Invariant 2 (Thought owns transient cognition); Global Invariant 3 (no upstream reconstruction by a downstream consumer) |
| Ownership moved exactly once? | Yes |
| Behavioral owner duplicated? | No |

Owner vs Location: behavioral decision is Thought; Runtime only orchestrates `decide` → `attachAuthorizedClaims` before Expression.

---

## 2. Ownership Diff

```
Ownership changes
Conversation reading-license reconstruction -> Thought.authorizedClaims
Conversation speak implication from kind -> Thought.cognitiveAllocation.shouldSpeak

Removed ownership
Conversation kind→take license inference

Removed duplicate assembly
(none for this boundary — Prompt 1)

Removed ownership inversions
Expression authorizing or re-inferring Thought decisions from kind
```

---

## 3. Behavioral Classification

Every changed behavior appears exactly once:

| Behavior | Classification |
|----------|----------------|
| kind → `cognitiveAllocation.shouldSpeak` | Behavior moved |
| kind + takes → `authorizedClaims` | Behavior moved |
| `decide` kind selection | Behavior unchanged |
| Honesty activity floor | Behavior unchanged |
| Proactive score floor (`score < 25`) | Behavior unchanged |
| Expression license-note presentation from `authorizedClaims` | Behavior unchanged (consumption) |

- Minimal observable behavior change (required by ownership transfer): none in this verification pass
- New behavior (should be empty for Prompts 1–7): empty

---

## 4. Review Checklist

| Question | Answer |
|----------|--------|
| Did ownership move? | Yes (historically; verified present) |
| Was ownership transferred exactly once? | Yes |
| Was any upstream reconstruction by a downstream consumer introduced? | No |
| Was any behavioral logic duplicated? | No |
| Was coupling reduced? | Yes — Expression no longer depends on kind→license reconstruction |
| Which dependency or ownership inversion disappeared? | Expression re-inferring reading authorization from `DecisionKind` |
| Were any new peer dependencies introduced? | No |
| Was observable runtime behavior preserved? | Yes (tests pass; no code change this pass) |
| Does the implementation satisfy every Definition of Done item? | Yes |
| Were obsolete forwarding wrappers removed (if applicable)? | N/A (none remaining) |
| Was the smallest implementation algorithm step used (Move → Rename → Extract → New abstraction)? | Yes — Move of existing derivation onto Decision fields (prior landing); this pass made no further steps |
| Were any unused extension points or scaffolding introduced? | No |

Passing tests are not sufficient. A boundary is accepted only if the review artifacts demonstrate compliance with the Ownership Gate, Normative Process, Definition of Done, Global Invariants, and the boundary-specific goals.

---

## Definition of Done (Prompt 2) — checked

- [x] Thought exclusively owns transient cognitive decisions emitted through Decision
- [x] Conversation no longer reconstructs Thought output
- [x] Decision exposes `kind`, `cognitiveAllocation`, `authorizedClaims`
- [x] No duplicate ownership; no new cognition architecture; no Reflection/Learning scaffolding
- [x] Public behavior preserved; incidental changes this pass: none
- [x] Coupling reduced per Global Invariants
- [x] Verification found no remaining downstream reconstruction of transient cognitive decisions outside Thought
