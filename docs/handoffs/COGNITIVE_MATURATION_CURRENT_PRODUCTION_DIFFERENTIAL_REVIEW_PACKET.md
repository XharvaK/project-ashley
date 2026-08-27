# Cognitive Maturation C1–C5 — Differential Review Packet

Date: 2026-08-27

## Review target

`NEW_RECONCILED_CANDIDATE_SHA: 09b73fbb180234a2ac7056756fc339083735f40e`

`CURRENT_PRODUCTION_BASE_SHA: 968787d1a5261aef4bf266091b8cf044eddbfdb2`

Review the exact candidate as:

```text
CURRENT PRODUCTION 968787d
        +
accepted C1–C5 semantics
        ->
NEW RECONCILED CANDIDATE
```

The previous candidate
`a3bef15ec8e54ffc7fbf182572aeac716ca08021` is historical and is not the
review base. Do not treat its qualification or review evidence as transferable
to the new SHA.

## Review boundary

This is a differential integration review. It is not a request for a new
conceptual redesign of accepted C1–C5 contracts.

The reviewer should verify that current-production authority remains intact
while accepted maturation semantics are added. The review should distinguish:

- implemented from tested;
- tested from independently reviewed;
- locally settled from physically qualified;
- physically qualified from production-accepted;
- observed state from live influence.

## Required precheck

```text
git rev-parse <NEW_RECONCILED_CANDIDATE_SHA>
git merge-base --is-ancestor 968787d1a5261aef4bf266091b8cf044eddbfdb2 <NEW_RECONCILED_CANDIDATE_SHA>
git diff --check <NEW_RECONCILED_CANDIDATE_SHA>^ <NEW_RECONCILED_CANDIDATE_SHA>
```

The ancestry command MUST pass before review evidence is accepted for this
current-production line.

## Review focus

### 1. Model Fabric and C2

Inspect:

- `apps/agent-service/src/core/context-budget/`
- `apps/agent-service/src/core/model-fabric/projection.ts`
- `apps/agent-service/src/mistral-client.ts`
- current Model Fabric route/profile/transport owners under
  `apps/agent-service/src/core/model-fabric/` and
  `apps/agent-service/src/core/model-routing/`

Verify:

- C2 produces an immutable bounded eligible projection;
- content and evidence bindings remain inspectable;
- privacy and currentness survive provider-bound projection;
- the same durable state can produce different bounded projections;
- projection does not select a route, authorize egress, or mutate Memory;
- current Model Fabric remains the sole route/model/transport owner.

### 2. Schema and migration

Inspect:

- `apps/agent-service/src/core/db.ts`
- `apps/agent-service/src/core/cognition/schema-contract.ts`
- C1–C5 migration modules under `apps/agent-service/src/core/`

Verify:

- current production v35 is preserved;
- final logical progression is v35 → v36 → v37 → v38 → v39 → v40;
- migration order is monotonic and additive;
- older readers reject newer milestone objects;
- no prior production migration history was renumbered or overwritten.

### 3. C1–C3 downstream non-revival

Inspect:

- `apps/agent-service/src/core/memory/`
- `apps/agent-service/src/core/learned-autonomy/`
- `apps/agent-service/src/core/agency/`
- `apps/agent-service/src/core/curiosity/reads.ts`

Verify:

- correction and barriers terminate C1-derived influence;
- corrected or shadow evidence cannot time-shift into live influence;
- learned autonomy requires attributed current C1 evidence;
- demotion cannot silently revive learned influence;
- all five capabilities remain observe/unpromoted/non-live;
- observe C3 does not change later Curiosity or Agency behavior.

### 4. C4 and current-turn authority

Inspect:

- `apps/agent-service/src/core/cognitive-graduation/`
- `apps/agent-service/src/core/reflection/c4-future-only.ts`
- `apps/agent-service/src/core/qualification/c4-evaluation-artifacts.ts`
- `apps/agent-service/src/core/runtime.ts`

Verify:

- selected predictions have traceable current C1 and repaired C3 bindings;
- prediction, operational observation, and adjudication remain separate;
- `missing` and `outcome_unknown` do not become success or failure;
- calibration is bounded and future-only;
- no current-turn Decision mutation, global confidence, personhood proof,
  Metacognition authority, Identity mutation, or OperationalClaimLicense is
  created.

### 5. C5 relational boundaries

Inspect:

- `apps/agent-service/src/core/relationship/`
- relationship callers in `apps/agent-service/src/core/runtime.ts` and
  `apps/agent-service/src/server.ts`
- `apps/agent-service/route-surface.json`

Verify:

- owner and Ashley state are read separately;
- shared culture is recomputed from separately current state;
- historical projections remain inspectable after overlap ends;
- consent, revocation, withdrawal, repair, disagreement, privacy, and
  non-manipulation remain distinct;
- withdrawn/revoked/corrected/rolled-back state cannot revive;
- C5 state does not become Agency, speech, operational, or Identity authority.

### 6. Current production authority

Inspect:

- `apps/agent-service/src/core/sandbox/reactive-operational-admission.ts`
- `apps/agent-service/src/core/sandbox/operational-truth.ts`
- `apps/agent-service/src/core/agency/`
- current Model Fabric dispatch and receipt code
- Discord presence consumers

Verify:

- cognitive records do not license executed-action claims;
- predictions are not executed actions;
- model output is not authority;
- relationship state is not speech authority;
- Sandbox V2 operational evidence remains the source for operational claims;
- current production Model Fabric and Discord Presence commits remain present.

## Existing local evidence

The implementation worktree has clean bounded focused evidence:

- cognitive domains: 54 files, 150 tests;
- Model Fabric and routing: 17 files, 165 tests;
- current production consumers and schema: 8 files, 74 tests;
- Operational Truth, Sandbox V2, Identity, routes, and capability ceilings:
  10 files, 94 tests;
- agent-service build: PASS;
- `git diff --check`: PASS, with expected Windows line-ending warnings only.

These are implementation evidence. They are not independent review or
physical qualification.

## Reviewer output requested

Record:

1. exact candidate SHA reviewed;
2. exact production base SHA checked;
3. ancestry result;
4. current Model Fabric seam verdict;
5. schema/migration verdict;
6. C1–C5 non-revival verdict;
7. runtime/Agency/Operational Truth/Sandbox authority verdict;
8. Identity and relational-boundary verdict;
9. findings with exact paths and severity;
10. whether the candidate may proceed to physical qualification.

An unavailable reviewer is not a clean review. No independent review has been
claimed by this implementation run.
