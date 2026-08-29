# Packet bind manifest (R5)

Canonical list of paths Luna materializes onto `OWNER_SELECTED_SOURCE_BASELINE_SHA` after independent review PASSES and Doc supplies the source baseline.

Do **not** `git checkout APPROVED_PACKET_REVIEW_SHA --` whole pre-existing governing files. That can erase selected-baseline documentation added after `PACKET_BASE_SHA`.

**PACKET_BASE_SHA** (architecture inspection / packet merge-base): `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a`

**Conflict policy (all overlay rows):** same-hunk conflict is a **HARD BLOCKER**. Luna must not choose architecture wording. Stop and return the conflicted paths.

**Selected-baseline independent docs:** production-line commits after `PACKET_BASE_SHA` (observer documentation, architecture-index living notes, and similar) must survive unless they occupy the same hunk as a packet overlay. Three-way apply preserves them when they do not conflict.

**Production source after bind:** `apps/**`, `packages/**`, `scripts/**`, `deploy/**`, and runtime/config implementation source must be byte-identical to `OWNER_SELECTED_SOURCE_BASELINE_SHA`. `PRODUCTION_SOURCE_DIFF` must be `NONE`.

---

## Identities (never collapse)

| Identity | Lives in |
|---|---|
| `APPROVED_PACKET_REVIEW_SHA` | ignored `artifacts/runtime/IMPLEMENTATION_IDENTITY.md` after R5 PASS |
| `OWNER_SELECTED_SOURCE_BASELINE_SHA` | Doc supplies in the Luna goal / owner instruction; copied into that artifact |
| `IMPLEMENTATION_START_SHA` | `git rev-parse HEAD` **after** the docs-only bind commit; written to the same ignored artifact. **Not** written into this tracked packet. |
| `PACKET_BASE_SHA` | this file (constant above) |

Tracked [`OWNER_BASELINE_GATE.md`](OWNER_BASELINE_GATE.md) is law/template only. Do not mutate it to store execution SHAs.

---

## Path table

| PATH | MODE | PACKET_BASE_SHA | EXPECTED_SELECTED-BASELINE_BEHAVIOR | CONFLICT_POLICY |
|---|---|---|---|---|
| `docs/cognitive-rework/v0.2.1/` (entire tree, including this file) | `NEW_EXACT_FILE` | n/a (absent at packet base) | Add exact bytes from `APPROVED_PACKET_REVIEW_SHA`. Do not merge with a production-line copy; there is none. | n/a |
| `docs/architecture/cognitive/Ashley_Cognitive_Architecture_v0.2.1.md` | `NEW_EXACT_FILE` | n/a (absent at packet base) | Add exact bytes from approved packet. | n/a |
| `docs/superpowers/plans/2026-08-29-cognitive-v021-implementation.md` | `NEW_EXACT_FILE` | n/a (absent at packet base) | Add exact bytes from approved packet. | n/a |
| `docs/Ashley_Glossary.md` | `EXISTING_DOC_OVERLAY` | `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a` | Apply packet delta vs packet base with three-way merge against selected baseline. Preserve independent baseline additions. | HARD BLOCKER on same-hunk conflict |
| `docs/Ashley_Constitution.md` | `EXISTING_DOC_OVERLAY` | same | same | HARD BLOCKER |
| `docs/Ashley_Core_Principles.md` | `EXISTING_DOC_OVERLAY` | same | same | HARD BLOCKER |
| `docs/architecture/Ashley_Architecture_Freeze.md` | `EXISTING_DOC_OVERLAY` | same | same | HARD BLOCKER |
| `docs/architecture/Ashley_Architecture_Roadmap.md` | `EXISTING_DOC_OVERLAY` | same | same | HARD BLOCKER |
| `docs/architecture/Ashley_Cross_Phase_Architecture.md` | `EXISTING_DOC_OVERLAY` | same | same | HARD BLOCKER |
| `docs/architecture/Ashley_Milestone_Execution_Governance.md` | `EXISTING_DOC_OVERLAY` | same | same | HARD BLOCKER |
| `docs/architecture/Ashley_Architecture_Document_Index.md` | `EXISTING_DOC_OVERLAY` | same | same. Production-line observer/index additions after packet base must not be clobbered. | HARD BLOCKER |
| `.gitignore` | `IGNORE_RULE_OVERLAY` | same | Three-way apply of the packet `.gitignore` delta (runtime artifact ignore rules). Preserve unrelated selected-baseline ignore lines. | HARD BLOCKER |

No other paths are packet-owned. Do not overlay `apps/`, `packages/`, `scripts/`, `deploy/`, or runtime/config implementation source.

---

## Mechanical bind (after R5 PASS + Doc source-baseline instruction)

Working directory: **repository root**.

```powershell
git fetch origin
git checkout -B feat/cognitive-v021-implementation OWNER_SELECTED_SOURCE_BASELINE_SHA

# A. NEW_EXACT_FILE — exact bytes from the approved packet
git checkout APPROVED_PACKET_REVIEW_SHA -- `
  docs/cognitive-rework/v0.2.1 `
  docs/architecture/cognitive/Ashley_Cognitive_Architecture_v0.2.1.md `
  docs/superpowers/plans/2026-08-29-cognitive-v021-implementation.md

# B. EXISTING_DOC_OVERLAY + IGNORE_RULE_OVERLAY — three-way packet delta only
git diff c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a APPROVED_PACKET_REVIEW_SHA -- `
  docs/Ashley_Glossary.md `
  docs/Ashley_Constitution.md `
  docs/Ashley_Core_Principles.md `
  docs/architecture/Ashley_Architecture_Freeze.md `
  docs/architecture/Ashley_Architecture_Roadmap.md `
  docs/architecture/Ashley_Cross_Phase_Architecture.md `
  docs/architecture/Ashley_Milestone_Execution_Governance.md `
  docs/architecture/Ashley_Architecture_Document_Index.md `
  .gitignore |
  git apply --3way
```

If `git apply --3way` exits nonzero or reports a conflict: **HARD BLOCKER**. Do not `-3` fallback to ours/theirs by hand. Do not semantically edit the conflicted governing file.

Then:

```powershell
git add -- `
  docs/cognitive-rework/v0.2.1 `
  docs/architecture/cognitive/Ashley_Cognitive_Architecture_v0.2.1.md `
  docs/superpowers/plans/2026-08-29-cognitive-v021-implementation.md `
  docs/Ashley_Glossary.md `
  docs/Ashley_Constitution.md `
  docs/Ashley_Core_Principles.md `
  docs/architecture/Ashley_Architecture_Freeze.md `
  docs/architecture/Ashley_Architecture_Roadmap.md `
  docs/architecture/Ashley_Cross_Phase_Architecture.md `
  docs/architecture/Ashley_Milestone_Execution_Governance.md `
  docs/architecture/Ashley_Architecture_Document_Index.md `
  .gitignore

git diff --cached --name-only
# Must be a subset of this manifest. HARD BLOCKER if apps/ packages/ scripts/ deploy/ appear.

git diff --cached -- apps packages scripts deploy
# Must be empty.

git commit -m "docs(cognitive-v021): bind approved packet onto selected source baseline"

# NOW HEAD is IMPLEMENTATION_START_SHA. Write it to the ignored artifact. No extra commit.
```

Write [`artifacts/runtime/IMPLEMENTATION_IDENTITY.md`](artifacts/runtime/README.md) (untracked) with the bind verification report below. Do **not** edit `OWNER_BASELINE_GATE.md`.

---

## Bind verification report (required fields)

Record in ignored `artifacts/runtime/IMPLEMENTATION_IDENTITY.md` and `artifacts/runtime/PACKET_BIND_REPORT.md` (may be the same file or adjacent):

```text
APPROVED_PACKET_REVIEW_SHA=<full>
OWNER_SELECTED_SOURCE_BASELINE_SHA=<full>
OWNER_SELECTED_SOURCE_BRANCH=<name or unset>
PACKET_BASE_SHA=c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a
IMPLEMENTATION_START_SHA=<git rev-parse HEAD after bind commit>
IMPLEMENTATION_BRANCH=feat/cognitive-v021-implementation
ANCESTRY_TO_ARCHITECTURE_SHA=<git merge-base --is-ancestor c7c81c4 ... result>
PACKET_BIND_DIFF_OK=yes|no
SOURCE_MAP_REVALIDATION_RESULT=<unset until revalidation>
SELECTED_BY=Doc
SELECTED_AT=<iso>

FILES_ADDED=<NEW_EXACT_FILE paths actually added>
FILES_OVERLAID=<overlay paths that changed vs selected baseline>
CONFLICTS=none | <paths>
PRODUCTION_SOURCE_DIFF=NONE
```

**Hard requirement:** `PRODUCTION_SOURCE_DIFF=NONE`.

Verify:

```powershell
git merge-base --is-ancestor OWNER_SELECTED_SOURCE_BASELINE_SHA HEAD
git diff --name-only OWNER_SELECTED_SOURCE_BASELINE_SHA
# subset of this manifest

git diff --stat OWNER_SELECTED_SOURCE_BASELINE_SHA -- apps packages scripts deploy
# empty
```

Phase 00 starts at `IMPLEMENTATION_START_SHA`. Source-map revalidation diffs production source against `OWNER_SELECTED_SOURCE_BASELINE_SHA`.
