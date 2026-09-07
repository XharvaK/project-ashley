# Task 2 — S2 Core D0 Qualification (20 local witnesses)

Work only in the isolated Project Ashley stabilization worktree. The current
committed source and the current 2026-09-06 Sparse VNext design control this
task; older freeze/acceptance documents are historical evidence only. Task 1
Sparse VNext implementation is accepted at the current branch HEAD. This task
is qualification and focused test work only. Do not call providers, modify
production, implement Wave 3 failure capture, or implement any later P1.

## Gate and chain

Prove the exact local chain:

canonical schema → wire specialization → fixture → parser → validator →
authority → materialization → persistence

Core D0 must be 20/20 before provider failure capture or NVIDIA diagnostic.
Keep evidence reliance carry-through, future-trigger snapshot binding, pending
speech-outbox recovery, broad fidelity repair, release meta transition, and
rollback rehearsal out of this task even when a fixture touches a nearby API.

## Required witnesses

Implement a focused test suite with one explicit witness per item, using test
names/IDs D0-1 through D0-20 and asserting invariant behavior rather than only
implementation details:

1. Ordinary draft speech (E1): `kind` + `speech` is sufficient.
2. Silent settlement (E2): explicit `{mode:"none"}` is valid without
   commitments.
3. Silence plus Working Context delta (E3): internal change publishes beside
   intentional silence.
4. Epistemic commitment (E4): valid epistemic dimensions/statement validate.
5. Operational claim (E6): receipt matrix preserves operational honesty.
6. Working Context upsert with local alias (E7): alias resolves to a Host-
   minted durable ID.
7. Concern creation (E8): concern mutation publishes and snapshot hash behavior
   remains truthful (do not implement future-trigger binding here).
8. Cross-domain co-reference (E9): same-settlement concern/WC alias use
   resolves only where creation-capable and target-compatible.
9. Evidence reliance (E5): evidence refs validate against the allowlist. Do
   not require retrieval/source carry-through; that is SW-1/P1 later.
10. Durable nomination (E10): Host mints nomination/assertion IDs; no alias
    is authored or trusted.
11. Correction (E12): corrected existing references use plain opaque strings,
    not object-form `ExistingRef`.
12. Observation intent (E13): registered operation and availability check.
13. Effect intent (E14): registered operation and availability check.
14. Abstain (E15): the three fresh VNext reasons validate; fresh
    `no_semantic_change_warranted` rejects; historical tolerance remains only
    in the narrow direct-reader path.
15. Empty-when-present rejection (I4): every present optional event array and
    empty composite fails; omission remains distinct.
16. Unknown-field rejection (I10): root/nested unknown fields fail closed.
17. Missing-speech rejection (I1): settlement without `speech` reports the
    required-field failure.
18. V1 legacy tolerance: explicit empty arrays are accepted only by the narrow
    V1 historical reader, not by fresh VNext parser authoring.
19. Fingerprint consistency: canonical fingerprint is deterministic, wire
    fingerprint is deterministic for a fixed namespace, and they differ when
    wire bounds/namespace specialization is applied.
20. Empty operational namespace: wire operational claims are impossible when
    the Host-admitted namespace is empty (`maxItems:0`); no operation is
    fabricated.

## Test discipline

Use isolated temporary SQLite databases/fixtures. Do not touch production
databases or call external providers. If an existing API cannot expose one
witness without adding architecture, record the bounded limitation and prove
the nearest existing source-owned invariant. Do not change production source
just to make a witness pass. Run the new D0 suite, impacted neighboring tests,
`git diff --check`, and the agent-service build/typecheck. Classify failures as
new-related, new-unrelated, pre-existing-proven, or unknown.

Stage only explicit Task 2 test/support/qualification paths. Commit one
coherent D0 qualification commit. Write a complete report to
`.superpowers/sdd/ashley-stabilization-overnight/task-2-report.md` containing
the 20 witness mapping, commands/results, any pre-existing failures, commit
SHA, and scope exclusions. Return a concise status contract.

