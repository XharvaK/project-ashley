# Model Fabric TARGET portfolio + token envelope reconciliation

**Status:** owner-accepted declared configuration. Not activation. Not
production. Not a requalification campaign.

**Candidate:** local worktree implementing `mfp_target_12_9_v2`.

## Frozen model identities

- Interactive Thought remains CURRENT NIM `openai/gpt-oss-20b`, semantic
  `economical`, wire `low`, deadline 6000 ms. Output ceiling is now 2048.
- Expression remains CURRENT Mistral `mistral-medium-latest` with the
  existing caller-owned Qwen compatibility fallback. Interactive output
  ceiling is now 2048. Proactive Expression remains a separate 500-token
  caller bound.

## Declared TARGET secondary / utility map

| Role | Intended occupant | Semantic | Wire | maxOutputTokens |
|---|---|---|---|---|
| thought_observation | Nemotron 3 Ultra | `max_supported` | `reasoning_effort=high` | 4096 |
| reflection_initiative | Nemotron 3 Ultra | `max_supported` | `reasoning_effort=high` | 4096 |
| exchange_cognition | Nemotron 3 Super | `high` | `reasoning_effort=high` | 4096 |
| curiosity_consolidation | Nemotron 3 Super | `high` | `reasoning_effort=high` | 4096 |
| maintenance | Nemotron 3 Super | `economical` | `reasoning_effort=low` | 2048 (existing bounded utility ceiling) |
| routine_validation | Nemotron 3 Super | `economical` | `reasoning_effort=low` | 1000 (existing short structured ceiling) |

Lightning remains implemented and catalogued. It is a deferred utility
candidate and is not an intended TARGET occupant in `mfp_target_12_9_v2`.

## Historical mixed-role smoke

Raw mixed-role dark-smoke results are unchanged.

- Ultra observation / Super exchange / Super curiosity:
  `FAIL_STRUCTURED_OUTPUT` under superseded ceilings 450 / 1100 / 900.
- Ultra reflection: role-smoke `PASS`.
- Super economical routine and structured cases: `PASS`.

Owner disposition of A/C/D:

`HISTORICAL_RESULT: FAIL_STRUCTURED_OUTPUT_UNDER_SUPERSEDED_TOKEN_ENVELOPE`

`OWNER_PORTFOLIO_DISPOSITION: COMPATIBLE / ACCEPTED FOR INTENDED TARGET DESIGN`

That is not a retroactive rewrite of the JSON artifacts, not a fake
`QualificationResult` PASS, and not a provider incompatibility finding.

Owner explicitly declined rerun.

## Activation mechanics

`validateActivation` requires a `PASS` `QualificationResult` plus
`OwnerApprovalRef` plus `ActivationRef` against the **loaded** TARGET
revision ID. `mfp_target_12_9_v2` is a new identity, so prior v1 citations
cannot activate it. Material inference fingerprints include `maxTokens`, so
4096 envelopes are new fingerprints. No new provider calls were made to mint
matching PASS records.

Classification:

`OWNER_ACCEPTED_TARGET_CONFIGURATION`

`PENDING_EXACT_ACTIVATION_ARTIFACT_IF_SCHEMA_REQUIRES`
