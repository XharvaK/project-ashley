# Owner Gate A — Implementation baseline selection

**Status:** `UNSET` — still a later human gate. Packet R3 must pass independent review **before** Doc fills this file.

Quota-aware Q3/Q5 and R3 contract fixes do **not** fill this gate and do **not** choose M / C / Other.

**Luna must not begin Phase 00 implementation until this file records an owner-selected SHA.** Filling this file is an owner act. Luna must not guess.

After selection, Luna revalidates [`01_SOURCE_BASELINE_AND_MIGRATION_MAP.md`](01_SOURCE_BASELINE_AND_MIGRATION_MAP.md) against that exact SHA before writing kernel code. Material seam drift is HARD BLOCKER 4 until the map is reconciled.

---

## Observed git facts (verified 2026-08-29)

Worktree at inspection:

| Fact | Value |
|---|---|
| `git rev-parse HEAD` | `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` |
| Symbolic HEAD | **detached** at `c7c81c4` |
| `origin/master` | `9d50740fb2709d6870e8d521cc8bff0d080cabf4` |
| Merge-base(HEAD, origin/master) | `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` |
| Ancestry | `c7c81c4` **is an ancestor of** `origin/master` |
| Local `master` | `9d50740` tracking `origin/master` |
| Worktree | dirty / many untracked files (not source) |

### Commits on `origin/master` not in `c7c81c4` (six)

| SHA | Subject | Touch |
|---|---|---|
| `7bca445cb66b8735c2ca303df6be1500ccc680ad` | docs(observer): canonicalize field observation protocol | docs |
| `ea3673dc8332700bd241cff36ed052aaff8311e7` | docs(observer): canonicalize field observation protocol | `Ashley_Field_Observation_Protocol.md` |
| `a93471f911cf762d61c0355b7eda6f0e3615890a` | docs(observer): canonicalize field observation protocol | architecture index |
| `3d788f85b661c5b7649a5d88acdfd6a3e6c74693` | feat(observer): add read-only field observation pipeline | `apps/observer-exporter/**`, `packages/privacy-core/**`, `apps/agent-service/src/core/privacy/secrets.ts` (+ test), `package.json` |
| `678758841ec574dc35596b78c050760b611db43a` | fix(observer): run exporter from observer tools checkout | observer systemd + test |
| `9d50740fb2709d6870e8d521cc8bff0d080cabf4` | fix(observer): enforce read-only service custody | observer systemd + test |

Cognitive Discord / Thought / delivery / runtime seams (`apps/discord-bot/src/**` chat path, `runtime.ts`, `thought.ts`, `delivery/store.ts`, `mistral-client.ts`) are **unchanged** between these two SHAs except `privacy/secrets.ts` (credential-shape helper used by delivery claim).

Architecture-reference SHA `c7c81c4` remains the packet’s **inspected** source map SHA until revalidation.

---

## Choices (owner picks exactly one)

### Choice M — `origin/master` / `9d50740fb2709d6870e8d521cc8bff0d080cabf4`

**Relationship to `c7c81c4`:** verified descendant; six observer/docs commits.

**Risk of selecting:** production-line history includes the observer exporter and a `secrets.ts` refactor. Source map must be revalidated against `secrets.ts` and any new reserved paths. Lowest risk of implementing from a detached historical SHA and then fighting merge onto master.

**Risk of not selecting:** Luna implements from detached `c7c81c4`, then origin/master observer work must be merged later.

### Choice C — detached architecture SHA `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a`

**Relationship:** this is the architecture-reference inspection SHA. Not current `origin/master`.

**Risk of selecting:** implementing off the production-line tip. Observer pipeline and `secrets.ts` changes are absent. Later merge onto master is required. Forbidden as a silent default.

### Choice Other

Owner names a different SHA that **must** be a verified descendant of production-line history (HARD BLOCKER 3 if not). Luna records ancestry before Phase 00.

---

## Owner record (fill before Luna implementation)

```text
OWNER_SELECTED_IMPLEMENTATION_BASELINE_SHA=<unset>
OWNER_SELECTED_IMPLEMENTATION_BRANCH=<unset>
SELECTED_AT=<unset>
SELECTED_BY=Doc
ANCESTRY_TO_c7c81c4=<unset>
CLEAN_STATUS_REQUIRED=yes (implementation worktree; untracked junk must not be committed)
REMOTE_STATUS=<unset>
SOURCE_MAP_REVALIDATED_AT=<unset>
SOURCE_MAP_REVALIDATION_RESULT=<unset>
```

This file remains **UNSET**. Filling it is a later owner act **after** packet R3 passes independent review.

Until then, packet **execution** status is `BLOCKED — PACKET R3 AWAITING INDEPENDENT REVIEW` (contract reconciliation), not “blocked only by baseline selection.”

After R3 PASSES, if this file is still empty, execution is `BLOCKED_PENDING_OWNER_BASELINE_SELECTION`. Once Doc records the SHA and Luna revalidates the source map, implementation may begin.

Quota-aware Q3 (packet R2.1) and R3 contract fixes do **not** fill this gate and do **not** choose M / C / Other.
