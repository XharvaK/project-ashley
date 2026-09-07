# Task 2 — Core D0 Qualification Report

## Authority and scope

This report uses the current committed source and the current
`ASHLEY_SPARSE_THOUGHT_CONTRACT_VNEXT_DESIGN.md`. Older freeze/acceptance
documents were not used as current architecture authority. Core D0 was run in
the isolated stabilization worktree and remained local and provider-free.

No delegated D0 work was accepted. Three delegated attempts were interrupted
after the Owner switched the run to single-controller mode; no delegated source
or test changes were present in the worktree. The controller implemented the
qualification suite directly.

## Witness mapping

| Witness | Controller proof |
|---|---|
| D0-1 | Minimal `settlement` with draft speech parsed, materialized, persisted, and delivered to the local speech outbox. |
| D0-2 | `speech.mode: none` parsed and published without commitments or an outbox row. |
| D0-3 | Silent settlement published a Working Context upsert without speech. |
| D0-4 | Valid epistemic dimensions and statement parsed as a semantic commitment. |
| D0-5 | Host receipt licensed the matching operational claim; a contradictory claim was rejected. |
| D0-6 | Working Context local alias resolved to a UUID Host-minted durable ID. |
| D0-7 | Concern creation persisted a UUID and a SHA-256 snapshot matching the stored concern record. |
| D0-8 | Concern local alias resolved across the same settlement into the scheduled future trigger. |
| D0-9 | Evidence reference was accepted only with an allowlisted ID and rejected at the evidence field otherwise. No carry-through was asserted. |
| D0-10 | Nomination and assertion IDs were Host-minted UUIDs, distinct from each other; automatic admission remained outside the D0 fixture. |
| D0-11 | Correction accepted plain string `ExistingRef`; object-form reference was rejected. |
| D0-12 | Registered, available `project.read_file` observation capability parsed and produced a Host-bound replay-safe request. |
| D0-13 | Registered, available `workspace.verify` effect capability parsed and produced a Host-bound non-replay-safe proposal. |
| D0-14 | The three VNext abstain reasons parsed; `no_semantic_change_warranted` was rejected; a historical V1 draft remained readable. |
| D0-15 | Present empty optional arrays and composite objects rejected with `empty_when_present`. |
| D0-16 | Unknown root and nested fields rejected with `unknown_field`. |
| D0-17 | Settlement without speech rejected with `required_field_missing:speech`. |
| D0-18 | Explicit empty arrays were accepted by the historical V1 draft validator and rejected by fresh VNext parsing. |
| D0-19 | Canonical and fixed-namespace wire fingerprints were deterministic; wire specialization differed from canonical and from another namespace. |
| D0-20 | Empty operational namespace produced wire `maxItems: 0`; omitted operational claims remained valid and an invented claim failed schema qualification. |

## Verification

- D0 suite: `20/20` tests passed.
- Impacted neighboring suite: `14` files, `148/148` tests passed.
- Agent-service build/typecheck: `npm run build --prefix apps/agent-service` passed.
- Diff check: `git diff --cached --check` passed before commit.
- No provider call, production database access, deployment, restart, or
  production mutation occurred.

## Self-review

`CONTROLLER_SELF_REVIEW=PASS`.

The changed path is one qualification test file. The tests use in-memory
databases and fixture provider callbacks. They do not modify production source,
alter the semantic contract, add Host defaults, or implement later P1 work.

One initial D0-9 assertion expected a more specific parser error code than the
current source emits. The source rejected the non-allowlisted ID at the exact
`evidenceUse.sourceRefsUsed` field with `wrong_type`; the assertion was narrowed
to that source-owned rejection invariant. One D0-5 literal was typed explicitly
for TypeScript. D0 was rerun after both fixes.

## Commit and exclusions

Implementation commit: `b40cd03`

Excluded by design: provider failure capture, NVIDIA diagnostics, evidence
carry-through, future-trigger snapshot binding, speech-outbox recovery, broad
fidelity repair, release/meta transitions, rollback rehearsal, Sandbox changes,
deployment, production acceptance, and shutdown.
