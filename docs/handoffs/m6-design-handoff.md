# Sandbox V2 M6 — Design Handoff

**Status:** Design handoff only. This file does not authorize M6 implementation,
physical qualification, capability promotion, deployment, or production
acceptance.

**Date:** 2026-08-23

**Predecessor:** M5 local settlement recorded in
[`m5-local-settlement.md`](m5-local-settlement.md). Implementation-track entry
is M5 `INDEPENDENTLY REVIEWED`. Production-acceptance predecessor remains M5
`PRODUCTION ACCEPTED`.

**Authority:** [`ASHLEY_SANDBOX_V2_ROADMAP.md`](../architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md)
§14 owns the frozen M6 question. This handoff restates that contract. It does
not redesign M6.

---

## Frozen M6 question

> Can Ashley pursue one admitted engineering objective through a finite,
> budgeted sequence of already-accepted M3, M4, and M5 operations?

M6 does not add a new effect class. It removes the limitation that each turn
can perform only one isolated engineering action.

```text
M5 AUTHORSHIP != M6
M6 SEQUENCE != M7 BORDER EFFECT
M6 LOCAL SETTLEMENT != PHYSICAL QUALIFICATION
```

---

## What M6 uniquely adds

- One admitted engineering objective with origin, provenance, project/workspace
  scope, success/failure/abandon/cancel conditions, and finite budgets.
- A single-Ashley sequential controller: admit → inspect → choose one permitted
  step → execute once → settle → re-evaluate → next step or stop.
- Minimal durable task/step work state for audit and safe stop.
- Independent M6 capability plus objective admission. Child steps still need
  their own M3/M4/M5 grants.
- Stop on success, verified impossibility, budget exhaustion, cancellation,
  authority loss, unsafe ambiguity, repeated non-progress, cleanup failure, or
  operator emergency stop.

M6 does not add live apply, Git write, export, deploy, restart, network,
credentials, workers, a second Ashley, or restart-transparent auto-resume.

---

## What M5 remains responsible for

- Sealing one bounded `CandidateChangeSet`.
- Candidate and live non-mutation during authorship.
- Advisory `proposed` / `quarantined` control-plane state.
- The licensed sentence that the named change-set has not been applied.

M6 may consume a sealed M5 artifact. It may not become the authorship sealer,
and it may not treat sealing as apply.

---

## What M7 remains responsible for

Named border effects under independently authorized profiles, first
`patch_export`, then later `live_apply`, Git write, packages, deploy, and
restart. M6 cannot inherit any of those.

Impossible until M7:

- apply a sealed patch to live or candidate trees as a border effect
- Git commit, branch, push, or pull request
- patch export to an operator review destination
- deploy, restart, package acquire/install
- network or credentials

---

## Which M5 artifacts M6 may consume

- Existing M3 workspace identity and candidate tree
- Sealed M5 `CandidateChangeSet` rows, hashes, and control-plane artifacts
- Matching M4 receipts bound to the same candidate tree hash

M6 may not treat a receipt as approval, a sealed patch as Ashley, or workspace
files as Recall.

---

## Authority M6 must obtain independently

Do not reuse M5 `candidate_authorship` or `authorshipAllowed` as M6 authority.

M6 needs:

- its own capability grant
- objective admission (owner request or Ashley-origin private engineering
  interest under that grant)
- project/workspace scope
- per-step M3/M4/M5 sub-grants that remain subsets of parent authority
- finite budgets that cannot self-extend
- stop/cancel that fail closed
- border state fixed to none unless a separately admitted future M7 operation
  exists

`engineeringAllowed`, `candidateWorkspaceAllowed`, `verificationAllowed`, and
`authorshipAllowed` remain their own grants.

---

## Batched Mint qualification

M6 participates in the later coordinated Mint campaign after M7 independent
review. Local M6 settlement will mean design accepted, implemented, locally
verified, and independently reviewed. It will not mean `PHYSICALLY QUALIFIED`
or `PRODUCTION ACCEPTED`. Physical criteria for the real controller and
failure/cleanup paths remain required and are not skipped.

Do not implement M6 in the M5 settlement task.
