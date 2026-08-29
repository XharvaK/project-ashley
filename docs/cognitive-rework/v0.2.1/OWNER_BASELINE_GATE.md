# Owner Gate A — Implementation baseline selection

**Status:** `UNSET` — still a later human gate. Packet R4 must pass independent review **before** Doc fills this file.

R4 contract fixes do **not** fill this gate and do **not** choose M / C / Other.

**Luna must not begin Phase 00 kernel code until:**

1. This file records `OWNER_SELECTED_SOURCE_BASELINE_SHA` (owner act).
2. Luna has performed the **mechanical packet-binding** step below and recorded `IMPLEMENTATION_START_SHA`.

Luna must not guess the source baseline. Luna **may** perform packet-binding only after Doc records the source baseline.

---

## Three identities (never collapse)

| Identity | Owner | Meaning |
|---|---|---|
| `APPROVED_PACKET_REVIEW_SHA` | Independent review PASS, then recorded here | Exact packet/governance tree that passed review |
| `OWNER_SELECTED_SOURCE_BASELINE_SHA` | Doc (Gate A) | Exact production-line source SHA to implement on |
| `IMPLEMENTATION_START_SHA` | Luna mechanical bind after Gate A | Docs-only commit that places the approved packet onto a branch created from the source baseline |

Later identities (`CANDIDATE_SHA`, `QUALIFIED_SHA`, `DEPLOYED_SHA`) are not this gate.

If Doc selects `9d50740` and Luna checks out **only** that SHA, the accepted packet is **not** in that tree. Do not invent a merge. Follow **Packet binding** below.

---

## Observed git facts (verified 2026-08-29)

Worktree at architecture inspection / packet-branch parent:

| Fact | Value |
|---|---|
| Architecture-reference SHA | `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` |
| Packet R3 (superseded) | `de1f0fab20fd2faa56609ef07630075bf78fad7f` on `review/cognitive-v021-packet-r2` |
| Recommended production-line tip | `9d50740fb2709d6870e8d521cc8bff0d080cabf4` (`origin/master`) |
| Merge-base (packet parent, master) | `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` |
| Divergence | packet review branch ahead by packet-only docs commits; production line ahead by six observer/docs commits |

Cognitive Discord / Thought / delivery / runtime seams (`apps/discord-bot/src/**` chat path, `runtime.ts`, `thought.ts`, `delivery/store.ts`, `mistral-client.ts`) are **unchanged** between `c7c81c4` and `9d50740` except `privacy/secrets.ts`.

Architecture-reference SHA `c7c81c4` remains the packet’s **inspected** source map SHA until revalidation against `OWNER_SELECTED_SOURCE_BASELINE_SHA`.

---

## Choices (owner picks exactly one)

### Choice M — `origin/master` / `9d50740fb2709d6870e8d521cc8bff0d080cabf4`

**Relationship to `c7c81c4`:** verified descendant; six observer/docs commits.

**Risk of selecting:** production-line history includes the observer exporter and a `secrets.ts` refactor. Source map must be revalidated against `secrets.ts` and any new reserved paths. Lowest risk of implementing off a detached historical SHA.

**Packet note:** R2–R4 packet files are **not** on this SHA. Binding (below) is required.

### Choice C — detached architecture SHA `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a`

**Relationship:** architecture-reference inspection SHA. Not current `origin/master`.

**Risk of selecting:** implementing off the production-line tip. Observer pipeline and `secrets.ts` changes are absent. Later merge onto master is required. Forbidden as a silent default.

Binding is still required (packet commits are not *inside* `c7c81c4` either).

### Choice Other

Owner names a different SHA that **must** be a verified descendant of production-line history (HARD BLOCKER 3 if not). Luna records ancestry before binding.

---

## Packet binding (mechanical; after Gate A; docs-only)

Do **not** cherry-pick packet commits onto the source baseline. Packet history is not guaranteed to apply as a patch series on `9d50740`.

After Doc records `OWNER_SELECTED_SOURCE_BASELINE_SHA` and (after R4 PASS) `APPROVED_PACKET_REVIEW_SHA`:

```powershell
git fetch origin
git checkout -B feat/cognitive-v021-implementation OWNER_SELECTED_SOURCE_BASELINE_SHA
git checkout APPROVED_PACKET_REVIEW_SHA -- `
  docs/cognitive-rework/v0.2.1 `
  docs/architecture/Ashley_Architecture_Document_Index.md `
  docs/superpowers/plans/2026-08-29-cognitive-v021-implementation.md `
  .gitignore
# Stage only those paths. Commit docs-only:
#   docs(cognitive-v021): bind approved packet onto selected source baseline
```

Verify:

```powershell
git diff --name-only OWNER_SELECTED_SOURCE_BASELINE_SHA
# Must be a subset of the paths above. No apps/, packages/, SQL, deploy scripts.
git merge-base --is-ancestor OWNER_SELECTED_SOURCE_BASELINE_SHA HEAD
git rev-parse HEAD   # this is IMPLEMENTATION_START_SHA
```

Record `IMPLEMENTATION_START_SHA` and `IMPLEMENTATION_BRANCH` in the owner record below (Luna fills these two fields; Doc filled the source baseline).

**Phase 00 starts at `IMPLEMENTATION_START_SHA`.** Do not require `HEAD == OWNER_SELECTED_SOURCE_BASELINE_SHA` after binding. Candidate ancestry must descend from `IMPLEMENTATION_START_SHA` and therefore from `OWNER_SELECTED_SOURCE_BASELINE_SHA`.

Source-map revalidation diffs **production source** against `OWNER_SELECTED_SOURCE_BASELINE_SHA` (must be empty for TypeScript/SQL/runtime; packet docs are expected to differ).

---

## Owner record (fill after R4 PASS)

```text
APPROVED_PACKET_REVIEW_SHA=<unset>
OWNER_SELECTED_SOURCE_BASELINE_SHA=<unset>
OWNER_SELECTED_IMPLEMENTATION_BRANCH=<unset>
IMPLEMENTATION_START_SHA=<unset>
IMPLEMENTATION_BRANCH=<unset>
SELECTED_AT=<unset>
SELECTED_BY=Doc
ANCESTRY_TO_c7c81c4=<unset>
CLEAN_STATUS_REQUIRED=yes (implementation worktree; untracked junk must not be committed)
REMOTE_STATUS=<unset>
SOURCE_MAP_REVALIDATED_AT=<unset>
SOURCE_MAP_REVALIDATION_RESULT=<unset>
PACKET_BIND_DIFF_OK=<unset>
```

This file remains **UNSET**. Filling `OWNER_SELECTED_SOURCE_BASELINE_SHA` is a later owner act **after** packet R4 passes independent review.

Until then, packet **execution** status is `BLOCKED — PACKET R4 AWAITING INDEPENDENT REVIEW`.

After R4 PASSES, if source baseline is still empty, execution is `BLOCKED_PENDING_OWNER_BASELINE_SELECTION`. After Doc fills the source baseline, Luna binds the packet; until `IMPLEMENTATION_START_SHA` is recorded and verified, execution is `BLOCKED_PENDING_PACKET_BIND`. Then Phase 00 may start.

R4 contract fixes do **not** fill this gate and do **not** choose M / C / Other.
