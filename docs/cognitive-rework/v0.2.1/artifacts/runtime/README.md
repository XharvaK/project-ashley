# Runtime / qualification artifacts (untracked)

Packet templates remain in the parent `artifacts/` directory.

**After candidate freeze, Luna must not commit files here.**

Write execution outputs only under this directory (gitignored):

- `CANDIDATE_FREEZE.md` — points **to** `CANDIDATE_SHA`; must not be inside that commit
- `PHASE_XX_GATE.md`
- `QUOTA_BUDGET.md`
- `QUALIFICATION_RESULT.md`
- `EXACT_CANDIDATE_REVIEW.md`
- `SHADOW_RESULT.md`
- `CUTOVER_RESULT.md`
- `LIVE_EVIDENCE_REPORT.md`
- `LEGACY_IMPORT_REPORT.json`

`git status --porcelain` for tracked files must stay clean through Q1–Q6. Share these files with reviewers as attachments; they bind `candidateSha` in their contents.
