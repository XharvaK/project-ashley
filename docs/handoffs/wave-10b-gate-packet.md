# Wave 10b Gate Packet

**Wave:** 10b — Deterministic evaluation and scenario coverage
**Type:** Implementation subwave
**Status:** **Wave_accepted** — Doc sign-off recorded 2026-08-04
**Date:** 2026-08-04
**Base SHA:** `6507cb08822b0a1dc075cf567790f20b7176d1c3`
**Worktree:** `master` with pre-existing Wave 00–10a changes preserved

**Not authorized:** release qualification, Mint or systemd work, live Mistral or
Discord, credentials, network adapters, production dispatch, `apply`, commit,
push, or deploy.

## Scope completed

Wave 10b adds an offline-only deterministic assurance layer:

- [`docs/stabilization/scenario-matrix.json`](../stabilization/scenario-matrix.json)
  defines the 15 stable scenario IDs from the accepted design, their verdict
  class, evidence paths, and explicit known gaps;
- [`scripts/stabilization/eval-deterministic.mjs`](../../scripts/stabilization/eval-deterministic.mjs)
  derives `covered`, `partial`, `gap`, and `deferred` from local evidence,
  optionally checks an already-captured replay run, and never calls Mistral or
  stores reply text in its report;
- [`scripts/stabilization/eval-deterministic.test.mjs`](../../scripts/stabilization/eval-deterministic.test.mjs)
  covers stable counts, evidence drift, deterministic run flags, and malformed
  matrix entries; and
- root scripts `eval:deterministic` and `test:stabilization` provide the
  repeatable entry points.

Deterministic run flags are hard failures. Subjective style/relational judging
is not imported into the evaluator and cannot waive them. `--strict` additionally
fails when a hard-gate deterministic scenario is not fully covered.

## Preflight

| Check | Result |
|---|---|
| Wave 10 design | **Design_accepted** — 2026-08-04 |
| Wave 10a | **Wave_accepted** — 2026-08-04 |
| 10c | **Wave_accepted** — separate gate packet; Doc sign-off recorded 2026-08-04 |
| Waves 00–05 | `legacy_local`; no retroactive formal acceptance |
| `VISION.md` | unchanged |
| Scope lock | 10b only; no production work |

## Scenario result

| Status | Count | IDs |
|---|---:|---|
| `covered` | 10 | `S-REFUSE`, `S-DM`, `S-THOUGHT`, `S-DELIV`, `S-CANCEL`, `S-QUOTA`, `S-ALIAS`, `S-PRIV`, `S-SANDBOX`, `S-SELFMOD` |
| `partial` | 4 | `S-AFFECT`, `S-DEP`, `S-BACKUP`, `S-EXT` |
| `gap` | 1 | `S-INJECT` |
| `deferred` | 0 | — |

The gap and partial rows are intentional, machine-readable, and visible in the
report. This packet does not claim full scenario closure. In particular,
perception injection fixtures, end-to-end affect/dependency expression checks,
production dual-DB restore, and the explicitly deferred external handlers are
not silently treated as covered.

## Verification transcript

| Check | Result |
|---|---|
| `npm run test:stabilization` | Pass — **4 tests** |
| `npm run eval:deterministic` | Pass — report generated with explicit gap/partial statuses |
| `npm run build --prefix apps/agent-service` | Pass |
| `npm test --prefix apps/agent-service` | Pass — **231 tests** |
| `npm run build --prefix apps/discord-bot` | Pass |
| `npm test --prefix apps/discord-bot` | Pass — **71 tests** |
| `npm run build --prefix apps/sandbox-broker` | Pass |
| `npm test --prefix apps/sandbox-broker` | Pass — **52 tests** |
| `npm run build --prefix apps/external-broker` | Pass |
| `npm test --prefix apps/external-broker` | Pass — **21 tests** |
| `npm run verify:status` | Pass — **90 manifest entries, 72 routes, 20 capabilities, 9 commands** |
| `npm run phase0:offline` | Pass — **231 agent tests**, offline tier green |
| `git diff --check` | Pass (CRLF warnings only) |
| `git diff --quiet -- VISION.md` | Pass — no diff |

`node scripts/stabilization/eval-deterministic.mjs --strict` is intentionally
not a release claim: it reports the uncovered `S-INJECT` hard-gate scenario and
exits non-zero. The default command is report-only so gaps remain visible
without being mislabeled as implementation failures.

## Evidence and invariants

| Invariant | Evidence |
|---|---|
| Scenario IDs are stable | Evaluator requires the exact 15 IDs and order from the accepted design |
| Coverage is derived, not hand-promoted | A row becomes `covered` only when every declared evidence file exists, all anchors match, and no known gap is declared |
| Missing evidence is honest | Missing files/anchors produce `partial` or `gap`; strict mode can gate on them |
| Deterministic and subjective verdicts stay separate | Only objective replay flags are hard failures; no Mistral judge call exists in this evaluator |
| Reports are content-minimized | Reports contain IDs, flags, statuses, paths, and counts, never raw replies |
| External effects are absent | No agent startup, network fetch, Discord, Mint, credentials, or production database is used |

## Non-guarantees and deferrals

- This is **Locally_verified**, not `Wave_accepted`, `Release_qualified`, or
  `Deployed`.
- Scenario `S-INJECT` remains an explicit deterministic coverage gap.
- Partial scenario rows are evidence of bounded implementation coverage, not
  proof that the missing behavior is safe in every path.
- The evaluator checks declared local evidence and optional captured-run
  receipts; it does not execute the full repository test suite itself.
- 10c health/readiness, resource, backup/restore, and check-only Mint audits
  are outside this packet; see [`wave-10c-gate-packet.md`](wave-10c-gate-packet.md).
- No live Mistral, Discord gateway, Mint host, network adapter, credential, or
  production socket was used.

## Sign-off

- Doc sign-off phrase: **"Accept Wave 10b"**
- Signed by: Doc
- Date: **2026-08-04**
- Result: Wave 10b is **Wave_accepted**; 10c implementation is authorized.

This acceptance does not authorize release qualification, Mint or live work,
`apply`, commit, push, or deploy.

## Next gate

Wave 10c is separately **Wave_accepted** in
[`wave-10c-gate-packet.md`](wave-10c-gate-packet.md). Wave 10 has no remaining
implementation subwave. Release qualification, Mint or live work, `apply`,
commit, push, and deploy still require a separate gate.
