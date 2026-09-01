# Project Ashley — Phase 5 Candidate Freeze and Production Qualification

## Terminal state

```text
PHASE5_PRODUCTION_STATUS=QUALIFICATION_BLOCKED_DEPLOY_NOT_PERFORMED
```

The exact candidate was frozen and pushed. Mint preparation and live W2 qualification were performed in an isolated non-live worktree. The activation gate was evaluated after W2 and W3 results. The gate was not satisfied, so the active production checkout was not updated, and the production runtime was not mutated or activated.

## Required machine-readable fields

```text
REFERENCE_HEAD=573393c3fdb2392a45137d4625635658eb4b5d88
CANDIDATE_SHA=8c3c4706854c3e776080603bb8f3a4741fc5bebe
REMOTE_CANDIDATE_SHA=8c3c4706854c3e776080603bb8f3a4741fc5bebe
PRE_DEPLOY_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
MINT_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
CANDIDATE_FREEZE=PASS
BUILD=PASS
FULL_CORPUS=PASS (368 test files; 2253 passed; 2 skipped; exit 0)
W2_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
W3_PHYSICAL_QUALIFICATION=NOT_QUALIFIED
TRANSPORT_ROUTE_READY=PASS
THOUGHT_CONTRACT_QUALIFIED=NO
RELEASE_TRUTH_MATCHED=NO
SOURCE_DEPLOYED=NO
V021_ACTIVATED=NO (candidate)
PRODUCTION_ACCEPTED=NO
NUCLEAR_SCHEMA_VERSION=PRE_DEPLOY_OBSERVED_42; CANDIDATE_SUPPORTED_44
COGNITIVE_SIDECAR_SCHEMA_VERSION=PRE_DEPLOY_OBSERVED_1; CANDIDATE_SUPPORTED_5
AUTHORITY_BARRIER_STATE=NOT_PRESENT_PRE_DEPLOY (nuclear user_version=42; migration 44 not applied)
OLD_SEMANTIC_WRITERS_INERT=NOT_OBSERVED (candidate runtime not started)
SANDBOX_V1_REACTIVATED=no
W9_STARTED=no
PRODUCTION_MUTATION_PERFORMED=no
DEPLOYMENT_RESULT=QUALIFICATION_BLOCKED_DEPLOY_NOT_PERFORMED
POST_DEPLOY_HEALTH=NOT_RUN
POST_DEPLOY_EXACT_SHA=NOT_RUN
BLOCKER_COUNT=3
BLOCKERS=W2_STRICT_SEMANTIC_FAILURE; W2_BUILD_IDENTITY_MISMATCH; W3_STAGE_H_WAKE_REQUIRED
```

## Causal sequence and evidence

1. Candidate freeze: one commit was created at `8c3c4706854c3e776080603bb8f3a4741fc5bebe`. The commit contains 220 accepted paths. The required agent build passed. The required full corpus passed with 368 files, 2253 tests, and 2 skipped.
2. Exact push: `origin/codex/thought-context-optimization` was pushed by ordinary fast-forward. The remote ref matched `CANDIDATE_SHA` exactly.
3. Mint preparation: the candidate was fetched into `/tmp/ashley-phase5-candidate-GTpOji` as a detached worktree at the exact candidate SHA. The agent service compiled successfully there. The active checkout at `/home/xarvak/project-ashley` remained clean at `573393c3fdb2392a45137d4625635658eb4b5d88`.
4. Pre-activation live W2: the built isolated runner made live requests through the NVIDIA NIM adapter path with the exact command contract:

   ```text
   --live --provider nim --model openai/gpt-oss-20b --no-fallback --samples 3
   ```

   The run used an isolated in-memory nuclear database, isolated in-memory cognitive sidecar, and an isolated output directory. It did not activate or deploy production.

   The exact retrieved result is [w2-route-qualification.json](../../../work/phase5-w2-live-candidate-8c3c470/w2-route-qualification.json). Its SHA-256 is `sha256:f217e944e181ab6f1873722af3e49516b8d85e0c80e0356a51ee3e744b8337b0`.

   The live result was `NOT_QUALIFIED`, not `OUTCOME_UNKNOWN`. It contains 12 cases, 10 provider attempt identities, 10 transport successes, 2 transport failures, and 12 `NOT_QUALIFIED` case verdicts. No fallback or provider substitution was used. The exact target was `nim/openai/gpt-oss-20b`.

   The live responses passed JSON syntax and resource policy where returned, but failed the strict semantic contract. Observed failure classes include `closed_schema_rejected`, `PROVIDER_ACCEPTED_PARSER_REJECTED`, `kernelBinding_failed`, `fencing_failed`, `authorityReachability_failed`, and `semantic_invalid`. The W2 artifact also reported `preflight.buildIdentity=573393c3fdb2392a45137d4625635658eb4b5d88` while the isolated worktree SHA was the candidate SHA. That identity mismatch independently prevents exact-candidate qualification.

5. Independent exact-candidate W3 Stage H: the packet runner was invoked once against the candidate SHA and the frozen Stage A dataset manifest. It stopped before writing a Stage H artifact with `wake_required`. The candidate source intentionally refuses direct cycle admission without a durable `wakeId`; the runner calls `admitCycle` without one. This is recorded as `W3_PHYSICAL_QUALIFICATION=NOT_QUALIFIED`. No retry was performed.
6. Gate derivation: route and credential preflight plus real NIM transport established `TRANSPORT_ROUTE_READY=PASS`. W2 did not establish `THOUGHT_CONTRACT_QUALIFIED`. The candidate build identity mismatch and the absence of an exact-candidate production runtime witness establish `RELEASE_TRUTH_MATCHED=NO`. Therefore the activation gate was false.
7. Deployment decision: the existing deployment mechanism was not invoked. The active Mint services remained running on the pre-deploy SHA. No live database write, migration, service restart, checkout update, activation, arbitrary Discord message, W9 work, or production acceptance occurred.

## Pre-deploy Mint observation

```text
PREFLIGHT_TIMESTAMP=2026-09-01T01:55:25+03:00
MINT_HOST=QXY
PRODUCTION_BRANCH=codex/thought-context-optimization
PRODUCTION_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
PRODUCTION_WORKTREE=CLEAN
ASHLEY_AGENT=active/enabled
ASHLEY_DISCORD=active/enabled
HEALTH={"ok":true,"ready":true,"state":"ready","cognitiveKernel":"v021","cognitiveSidecarSchemaVersion":1}
NIM_API_KEY_PRESENT=yes (value not recorded)
PRE_DEPLOY_NUCLEAR_USER_VERSION=42
PRE_DEPLOY_SIDECAR_USER_VERSION=1
PRE_DEPLOY_SIDECAR_META_SCHEMA_VERSION=1
```

The active service was already reporting `v021`, but it was not the frozen candidate. `V021_ACTIVATED=NO (candidate)` preserves that distinction.

## Blockers

1. W2 live semantic qualification failed on real provider responses. The exact NIM route is not qualified for the Thought contract.
2. W2 capability evidence declared the pre-freeze build identity rather than the exact candidate SHA.
3. The exact-candidate Stage H runner stopped on the required wake admission contract before producing a passing physical qualification artifact.

These blockers are frozen evidence. They were not bypassed by deployment, activation, provider substitution, replay, or a production write.
