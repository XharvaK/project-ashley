# Runtime / qualification artifacts (untracked)

Packet templates remain in the parent `artifacts/` directory.

**After candidate freeze, Luna must not commit files here.**

Write execution outputs only under this directory (gitignored):

- `IMPLEMENTATION_IDENTITY.md` — Gate A execution values after packet bind (`APPROVED_PACKET_REVIEW_SHA`, `OWNER_SELECTED_SOURCE_BASELINE_SHA`, `IMPLEMENTATION_START_SHA`, bind report). Written **after** the bind commit. No extra commit.
- `PACKET_BIND_REPORT.md` — optional sibling if the bind report is split from identity
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

Do **not** write execution SHAs into tracked `OWNER_BASELINE_GATE.md`.
