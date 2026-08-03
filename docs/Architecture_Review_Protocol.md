# Architecture Review Protocol

**Normative source:** the Nuclear Architecture Capability Audit plan
(`~/.cursor/plans/nuclear_capability_audit_0cc7c1af.plan.md`).
This repository copy is informational. If the two ever diverge, the plan governs.

---

This protocol defines the review artifacts produced after an architectural boundary implementation. It introduces no new implementation requirements and does not modify the Normative Process, Ownership Gate, Definition of Done, or Global Invariants. It exists solely to make architectural review reproducible and to allow independent reviewers to reach the same conclusion.

The protocol records why a boundary satisfies the specification; it does not define additional acceptance criteria.

Every boundary review (1–8) produces the four artifacts below.

## 1. Ownership Transfer Record

Every boundary review must explicitly document:

- Current owner
- Desired owner
- Final owner
- Reason for transfer (architectural explanation)
- Ownership rule cited (concrete citation from an ownership-related constraint already in the audit: Ownership Gate, Downward Migration, Global Invariant 3, boundary goals, etc. — not an invented argument)
- Ownership moved exactly once?
- Behavioral owner duplicated?

Ownership = the module making the behavioral decision, not the caller (Owner vs Location).

## 2. Ownership Diff

Every implementation must include an ownership-level diff separate from the code diff. This documents behavioral ownership movement rather than file movement.

```
Ownership changes
X -> Y
A -> B

Removed ownership
...

Removed duplicate assembly
...

Removed ownership inversions
...
```

## 3. Behavioral Classification

Every changed behavior must appear exactly once in this table, classified into exactly one category:

- Behavior moved
- Behavior unchanged
- Minimal observable behavior change (required by ownership transfer)
- New behavior (should be empty for Prompts 1–7)

## 4. Review Checklist

Every boundary review must answer the following questions:

- Did ownership move?
- Was ownership transferred exactly once?
- Was any upstream reconstruction by a downstream consumer introduced?
- Was any behavioral logic duplicated?
- Was coupling reduced?
- Which dependency or ownership inversion disappeared?
- Were any new peer dependencies introduced?
- Was observable runtime behavior preserved?
- Does the implementation satisfy every Definition of Done item?
- Were obsolete forwarding wrappers removed (if applicable)?
- Was the smallest implementation algorithm step used (Move → Rename → Extract → New abstraction)?
- Were any unused extension points or scaffolding introduced?

Passing tests are not sufficient. A boundary is accepted only if the review artifacts demonstrate compliance with the Ownership Gate, Normative Process, Definition of Done, Global Invariants, and the boundary-specific goals.
