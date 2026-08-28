# Phase / qualification artifacts

Luna writes gate reports here (`PHASE_XX_GATE.md`, `CANDIDATE_FREEZE.md`, `QUALIFICATION_RESULT.md`, `QUOTA_BUDGET.md`, `EXACT_CANDIDATE_REVIEW.md`, `SHADOW_RESULT.md`, `CUTOVER_RESULT.md`, `LIVE_EVIDENCE_REPORT.md`, `LEGACY_IMPORT_REPORT.json`).

Every qualification artifact must bind `candidateSha`, `selectedBaselineSha`, `architectureVersion`, `implementationSpecVersion`, `qualificationProtocolRevision`, `sidecarSchemaVersion`, `thoughtContractVersion`, Thought occupant, Mint identity, timestamp, shadow config hash, import tool version, outbox bridge version.

`QUALIFICATION_RESULT.md` must report **separately**: `ARCHITECTURE_CORPUS_RESULT`, `EXACT_CANDIDATE_REVIEW_RESULT`, `REAL_MODEL_WITNESS_RESULT`, `ISOLATED_MINT_RESULT`, `PRODUCTION_SHADOW_RESULT`, `FINAL_UNCHANGED_SHA_RESULT`, plus quota fields. Do not collapse into one model score.

`QUOTA_BUDGET.md` is written **before Q3** with `REAL_MODEL_WITNESS_MAX_CALLS`, `REAL_MODEL_WITNESS_RETRY_CAP`, `FALLBACK_SMOKE_MAX_CALLS`, `SHADOW_MODEL_CALL_BUDGET`, `LIVE_WITNESS_RETRY_CAP` (owner/config; recommended ceilings in QUALIFICATION_PROTOCOL if unset).

Do not put secrets, `.env` copies, or API keys in this directory.
