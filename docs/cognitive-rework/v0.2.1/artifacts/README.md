# Phase / qualification artifacts

Tracked: this README and `runtime/README.md` only.

Luna writes **execution** outputs under [`runtime/`](runtime/) (gitignored except its README). Do not commit `IMPLEMENTATION_IDENTITY.md`, `QUALIFICATION_RESULT.md`, `CANDIDATE_FREEZE.md`, or gate reports into the candidate SHA.

Every execution artifact must bind `candidateSha`, `selectedBaselineSha`, `architectureVersion`, `implementationSpecVersion`, `qualificationProtocolRevision`, `sidecarSchemaVersion`, `thoughtContractVersion`, Thought occupant, Mint identity, timestamp, shadow config hash, import tool version, outbox bridge version.

`QUALIFICATION_RESULT.md` must report **separately**: `ARCHITECTURE_CORPUS_RESULT`, `EXACT_CANDIDATE_REVIEW_RESULT`, `REAL_MODEL_WITNESS_RESULT`, `ISOLATED_MINT_RESULT`, `PRODUCTION_SHADOW_RESULT`, `FINAL_UNCHANGED_SHA_RESULT`, plus quota fields including **shadow real Thought calls**.

`QUOTA_BUDGET.md` is written **before Q3** (and shadow budgets before Q5).

Do not put secrets, `.env` copies, or API keys in this directory.
