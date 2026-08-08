# Wave 2 Gate Packet — Provenance / Time-Shift Isolation

**Wave:** 2 — Write-time `provenance` (`shadow`/`live`) on delayed-influence evidence
**Type:** Implementation wave (capability rollout follow-up)
**Status:** **Wave_pending** — implementation complete, acceptance pending Doc sign-off
**Date:** 2026-08-08
**Base SHA:** `c90425380212e20d1e97d0de100095a318237972`
**Worktree:** `master` with the pre-existing Wave 1 (capability rollout) changes preserved

**Scope lock:** local only. No deployment, systemd, provider call, credential
handling, production database, `apply` master flip, commit, push, or deploy.

## Preflight

| Gate | State |
|---|---|
| Rollout execution & influence audit | `docs/rollout-execution-influence-audit.md` — finding #4, section 8 target architecture |
| Behavioral evidence inventory audit | `docs/behavioral-evidence-inventory-audit.md` — finding #1 fixed earlier; this wave is the Wave 2 fix for finding #4 time-shift isolation |
| `VISION.md` | unchanged |
| Schema target | nuclear v21 |
| Host target | Linux Mint (unchanged) |

## Problem

Finding #4 of the rollout execution audit: delayed-influence artifacts
(`cur_takes`, `cur_reads`, `episodes`, `learning_revisions`,
`cur_source_candidates`) were recorded unconditionally while cognition ran
under `observe`. When a master or capability later moved to `apply`, those
observe-era rows became eligible for influence through every materializer
(motivations takes reader, own-time report, evidence resolution,
`attachAuthorizedClaims`, revision auto-apply, evidence eligibility counts,
source probation/activation) — influence by time-shift, without any per-item
authorization. Evidence-kind hardening (finding #1, shipped in Wave 1:
`evidence_kind='read_record'` + non-null `read_id` at the resolver) narrows
but does not answer the Wave 2 question: *was this particular artifact
created with behavioral authority?*

## Implemented design

Wave 2 answers that question at write time. The label is fixed when the row
is written and never re-derived:

- **Schema v21** (`src/core/provenance/migration-21.ts`):
  `provenance TEXT NOT NULL DEFAULT 'shadow' CHECK (provenance IN ('shadow','live'))`
  added to `cur_takes`, `cur_reads`, `episodes`, `learning_revisions`, and
  `cur_source_candidates`, plus five provenance indexes. All pre-existing rows
  backfill to `shadow`. That backfill is a **conservative authority
  classification, not proof of historical observe generation** — audits must
  not read the backfilled value as historical provenance; observe-era rows
  can never time-shift into influence after a later activation.
- **Write-time authority:**
  - `cur_reads` — `performGroundedReads` passes `provenance: "live"` only when
    `capabilityCanInfluence(db, "reading")`.
  - `cur_takes` — `consolidate` passes `live` only when
    `allowInfluence && capabilityCanInfluence(db, "reading")` (mirrors the
    motivations reader gate).
  - `episodes` — worker passes `live` only when `canInfluence("recall")`.
  - `learning_revisions` — worker passes `live` only when
    `canInfluence("learning")`; consolidate only when
    `allowInfluence && capabilityCanInfluence(db, "learning")`.
  - `cur_source_candidates` — `consolidate` passes `live` only when
    `allowInfluence && capabilityCanInfluence(db, "reading") &&
    capabilityCanInfluence(db, "source_discovery")` (the whole channel held
    behavioral authority at write time).
- **Every influence materializer requires `live`:**
  - motivations takes reader (`motivations.ts`) — `candidate.provenance === "live"`.
  - own-time report (`own-time-report.ts`) — `provenance = 'live'` on both the
    eligible-takes query and the owner-linked reads window.
  - evidence resolution (`resolve-evidence.ts`) — take case adds
    `AND t.provenance = 'live'`.
  - `attachAuthorizedClaims` (`decide.ts`) — take param now carries
    `provenance`; only live takes license reading claims.
  - revision auto-apply (`applyEligibleRevisions`) — SQL filter
    `AND provenance = 'live'` on the strict path.
  - evidence eligibility counts (`evidenceStats`) — episode/read/take sources
    only count when their `provenance = 'live'`; non-table source types
    (message, question, opinion) are user-flow artifacts and count as-is.
  - `processSourceProbation` (`sources.ts`) — candidate SELECT adds
    `AND provenance = 'live'`, so a candidate created in observe can never
    enter the probation → source-activation machinery, even after a later
    `source_discovery` activation. The tick-level capability gate alone is no
    longer relied on for per-candidate authority.
- **Single documented exception, exact-item scoped:** the owner-authorized
  identity-review flows (`runtime.ts` `recordAshleyReviewPosition` /
  `recordDocReviewDecision`) pass `{ allowShadow: true, revisionIds: [<id>] }`
  to `applyEligibleRevisions` — the id comes from the reviewed
  `identity_revisions` row, so the shadow permission is exact-item only.
  A broad `allowShadow` scan (no exact `revisionIds`) throws
  `allowShadow_requires_exact_revision_ids`. The worker auto-apply path never
  passes `allowShadow`.

## Verification transcript

| Check | Result |
|---|---|
| `npx tsc --noEmit` (agent-service) | Pass |
| `npx vitest run` (agent-service) | Pass — **657 tests, 71 files** (1 skipped) |

### New regression coverage

- `src/core/provenance/migration-21.test.ts` (3 tests): fresh migrate to v21
  with columns on all five tables; `shadow` default on insert; CHECK rejects
  unknown values; DDL backfills pre-existing rows to `shadow`.
- `revisions.test.ts` (4 new tests): shadow revisions never auto-apply even
  with live evidence; `{ allowShadow: true, revisionIds: [...] }` is the only
  path that applies them; a broad `allowShadow` scan without exact ids is
  refused; an exact-item `allowShadow` never applies unrelated shadow
  revisions. Existing tests updated to seed live episodes/revisions.
- `wave01-thought.test.ts` (1 new test): `resolveEvidenceRefs` fails closed on
  a `read_record` take whose provenance is `shadow`; the positive test now
  seeds live.
- `consolidate.test.ts` (2 new tests): observe-era (shadow) candidates are
  never put through probation (stay `proposed`, zero successful fetches, no
  discovered source); candidates are labeled `live` only when reading and
  source_discovery both held authority at write time (and `allowInfluence`).
- `runtime.test.ts` (1 new test): the joint review flow applies exactly the
  reviewed shadow revision, only after both Ashley's position and Doc's
  decision are recorded.
- `own-time-report.test.ts` / `decide.test.ts` / `episodes.test.ts`:
  seeding updated to live where eligibility is expected.
- Legacy-schema migration tests (`db.test.ts`, v4/v9 + agency-enums reopen
  paths) updated for v21 semantics.

## Files changed

- `src/core/provenance/migration-21.ts` (new), `src/core/provenance/migration-21.test.ts` (new)
- `src/core/db.ts` (v21 block), `src/core/types.ts` (`EvidenceProvenance`)
- `src/core/curiosity/feed.ts`, `src/core/curiosity/reads.ts`, `src/core/curiosity/consolidate.ts`,
  `src/core/curiosity/sources.ts` (live-only probation reader)
- `src/core/memory/episodes.ts`, `src/core/learning/revisions.ts`
- `src/core/cognition/worker.ts`, `src/core/agency/motivations.ts`,
  `src/core/agency/own-time-report.ts`, `src/core/agency/resolve-evidence.ts`,
  `src/core/agency/decide.ts`, `src/core/runtime.ts` (exact-item review apply)
- Tests: `revisions.test.ts`, `episodes.test.ts`, `wave01-thought.test.ts`,
  `own-time-report.test.ts`, `decide.test.ts`, `db.test.ts`, `health.test.ts`,
  `migration-20.test.ts`, `wave05/06-migration.test.ts`,
  `migration-18.test.ts`, `migration-19.test.ts`, `buckets.test.ts`,
  `wave08b.test.ts`, `wave09b.test.ts`, `consolidate.test.ts`, `runtime.test.ts`
- `AGENTS.md` (schema v21 note), `docs/behavioral-evidence-inventory-audit.md` (finding #1 FIXED record)

## Acceptance criteria (Wave 2)

1. Every delayed-influence artifact carries a fixed write-time provenance; pre-v21 rows are `shadow` (conservative classification, not historical proof).
2. No influence materializer reads shadow provenance rows — including `processSourceProbation` for source candidates.
3. The only shadow-permitting path is owner-authorized identity review (`allowShadow` with exact `revisionIds`), never the worker.
4. Full agent-service suite green; typecheck clean.
5. `AGENTS.md` documents schema v21 semantics (including the backfill semantics and the exact-item `allowShadow` rule).

## Residual risk / notes

- `consolidate.ts` take/revision/candidate labeling depends on the same
  `allowInfluence` flag the motivations reader uses; if that flag drifts from
  the capability gate, labels follow the flag. The strict reader checks below
  it (motivations `provenance === "live"`, `evidenceStats`,
  `processSourceProbation` `provenance = 'live'`) still bound influence
  independently.
- `learning_revisions` is created only by the base schema; the v4-era
  legacy-schema migration test now includes it explicitly (per the v3-test
  convention). Real deployments always carry it from the base schema.
- `cur_source_candidates` is created by `MIGRATION_8` (not the base schema),
  so every legacy reopen path carries it; the v21 ALTER is additive for it.
