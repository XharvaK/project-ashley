# Cognitive Maturation C1–C5 — Current-Production Physical Qualification Packet

Date: 2026-08-27

## Candidate binding

`NEW_RECONCILED_CANDIDATE_SHA: PENDING_FINAL_DOCS_COMMIT`

`CURRENT_PRODUCTION_BASE_SHA: 968787d1a5261aef4bf266091b8cf044eddbfdb2`

`PREVIOUS_COGNITIVE_CANDIDATE_SHA: a3bef15ec8e54ffc7fbf182572aeac716ca08021`

The previous candidate's physical qualification, if any, does not qualify this
candidate. This packet is a new exact-candidate qualification plan and remains
`NOT RUN` in this implementation run.

## Qualification status

`PHYSICAL_QUALIFICATION: NOT RUN`

`MINT_ACCESS: NOT PERFORMED`

`PRODUCTION_MUTATION: NOT PERFORMED`

`PROVIDER_SMOKE: NOT RUN`

No Linux Mint, Bubblewrap, production database, deployment, activation,
promotion, or external-effect action was performed.

## Required exact-candidate preflight

Before any authorized physical attempt, record the exact candidate SHA from the
checked-out source and run:

```text
git rev-parse HEAD
git status --short
git diff --check
git merge-base --is-ancestor 968787d1a5261aef4bf266091b8cf044eddbfdb2 HEAD
```

The source must be clean. The ancestry check must pass. An ambiguous or failed
preflight does not qualify the candidate.

## Proportional qualification witnesses

Qualification should be limited to the current-production reconciliation delta
and the exact claims that depend on Linux Mint or physical runtime behavior.

| Witness | Required evidence |
|---|---|
| Source identity | Exact candidate SHA, clean source, current-production ancestry |
| Build | Linux agent-service build/typecheck from the exact SHA |
| Startup | Agent startup and health behavior without provider calls unless separately authorized |
| Migration | Current production schema v35 migrates monotonically through v40; restart/readback remains coherent |
| Capability ceiling | `memory_evidence`, `context_budget`, `learned_autonomy`, `cognitive_graduation`, and `relational_graduation` remain observe/unpromoted/non-live |
| C1 non-revival | Owner correction, barriers, forgetting, restore, and restart-like reads do not revive downstream influence |
| C2 projection | Bounded projection changes with budget while durable truth and semantic truth remain unchanged; privacy/currentness remain enforced |
| C3 inertness | Observe C3 does not alter Curiosity or Agency; demotion/correction blocks learned influence |
| C4 inertness | Prediction/adjudication/calibration remain future-only and do not mutate current-turn authority or Operational Truth |
| C5 inertness | Consent, withdrawal, repair, privacy, and historical shared culture remain bounded; no relationship state becomes speech or Identity authority |
| Identity | Non-seeding reads remain non-mutating; owner correction and shared-culture recomputation do not rewrite Ashley Identity |
| Operational Truth | Cognitive records cannot produce an executed-action claim without current operational evidence |
| Sandbox V2 | Current reactive operational admission and evidence binding remain the authority; no V1 broker is reactivated |
| Integration seam | Current Model Fabric, routing, runtime/Agency, Operational Truth, Sandbox, and Discord Presence behavior remains intact |

## Local evidence available before qualification

The candidate has passed the following local bounded packs:

- C1–C5 cognitive domains: 54 files, 150 tests;
- Model Fabric and model routing: 17 files, 165 tests;
- production consumers and schema: 8 files, 74 tests;
- Operational Truth, Sandbox V2, Identity, routes, and capability ceilings:
  10 files, 94 tests;
- agent-service build: PASS;
- `git diff --check`: PASS, with expected Windows line-ending warnings only.

Local evidence does not replace physical qualification where the claim depends
on Linux Mint, Bubblewrap, process, filesystem, timing, or exact startup
behavior.

## Authority limits

This packet does not authorize:

- provider calls or provider smoke;
- production database access or mutation;
- deployment or restart;
- capability activation, promotion, or production routing;
- push or external effects.

Those actions require their own exact-candidate gates and owner authority.

## Qualification result fields

The authorized qualifier must record:

1. exact candidate SHA;
2. current production base SHA;
3. ancestry result;
4. exact host/environment;
5. exact attempt count;
6. each witness result;
7. any `OUTCOME_UNKNOWN` or `NOT RUN` result without inference;
8. source and environment cleanliness;
9. whether the candidate is eligible for the next release gate.

Until that record exists, this candidate is locally reconciled and ready for
differential review, not physically qualified or production-ready.
