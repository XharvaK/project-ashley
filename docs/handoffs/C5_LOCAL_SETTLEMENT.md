# C5 Local Settlement — Relational Graduation

Date: 2026-08-27

## Result

`C5 LOCAL_SETTLED: YES`

C5 is implemented on the committed C4 baseline
`2f918bd95feca44538d31c2970e2503f77a94540`, on the current-production line
rooted at `968787d1a5261aef4bf266091b8cf044eddbfdb2`.

`IMPLEMENTATION_HEAD: 407c3b1b3466ddd58115d6b9ce6cab01dbb607ef`
`RECONCILIATION_REPAIR: d7842efc8cac1cf6054d15454ea7cfce1382d2a6`

This is a local milestone checkpoint. It is not the C1–C5 program
completion claim. C5 remains observe/unpromoted; the dark-apply path is a
local fixture path only.

## Contract and authority

The implementation follows the accepted local mirror of the frozen packet:

- `docs/architecture/C5_Relational_Graduation_Implementation_Contracts.md`

The local mirror records `ACCEPTED FOR OWNER-AUTHORIZED IMPLEMENTATION RUN`.
It does not authorize providers, Mint access, qualification, activation,
promotion, deployment, push, production mutation, or external effects.

## Implementation scope

- Added the additive C5 schema for current and historical relationship
  projections, typed interaction contracts, append-only consent events, and
  separate repair proposal, evidence, and adjudication records.
- Added v14 relationship-row provenance and party-scope fields, C5 decision
  bindings, Ashley confirmation evidence, withdrawal evidence, and repair
  links.
- Added fail-closed C5 contract compatibility and mode handling. C5 apply is
  refused; observe remains non-influential and dark apply is fixture-only.
- Added shared-culture recomputation from separately current owner-model C1
  assertions and Ashley Identity state. Current overlap can end without
  deleting historical projections or rewriting Ashley Identity. The
  recomputation path uses a non-seeding Identity read and therefore does not
  create default Identity rows as a projection side effect.
- Added typed Q16 interaction contracts. Implicit hypotheses remain
  non-binding and cannot silently become strong contracts.
- Added explicit owner-authenticated C5 runtime admission methods and the
  `POST /nuclear/relationship/c5` event route. Model output does not call the
  seam directly, and callers cannot select dark apply or bypass the master
  ceiling.
- Added production-path writers for Ashley self-commitments and tensions,
  reminder due-clock handling without auto-send, bilateral mutual proposal,
  confirmation, delivery validation, activation, and withdrawal.
- Extended the legacy reminder writer with explicit provenance and party
  scope. Only the existing relationship influence gate can mark a reminder
  live; observe or non-influential writes remain shadow.
- Added bilateral current consent checks. Delivery, consent, mutuality,
  repair, and relationship authority remain separate facts.
- Added repair lifecycle materialization, withdrawal and proactive-silence
  barriers, coercion protection, rollback/non-revival behavior, and C5
  dependent forgetting with append-only evidence preservation.
- Added C5 filtering at relationship motivation projection so C5 shadow rows
  cannot enter Agency, while legacy owner-scoped v14 rows retain their
  existing gate.
- Added recomputation seams after owner correction, Ashley Identity revision,
  cognition-worker revision application, and relationship redaction.
- Updated the historical v34 schema characterization to assert the current
  source-supported v40 database while retaining its durable-cognition column
  witness.
- Aligned the route registry with the already-registered C2/C3/C4 diagnostics
  while adding the C5 admission route.

## Schema and migration

- Nuclear schema progression: v35 (current production) → v36 (C1) → v37
  (C2) → v38 (C3) → v39 (C4) → v40 (C5).
- Current schema authority is `apps/agent-service/src/core/db.ts`;
  `NUCLEAR_SUPPORTED_VERSION` is `40` at this implementation head.
- C5 contract version is `1`. The durable C5 marker starts at `observe` with
  `live_authority_existed = 0`.
- v40 is additive. It does not backfill historical shared culture, infer
  consent, create a relationship score, auto-send reminders, or promote C5.
- v39 readers reject v40 C5 tables, indexes, columns, and the C5 contract
  marker when newer content rejection is requested.

## Exact implementation files

### New

- `apps/agent-service/src/core/relationship/c5-adversarial.test.ts`
- `apps/agent-service/src/core/relationship/c5-contract-state.ts`
- `apps/agent-service/src/core/relationship/c5-schema.test.ts`
- `apps/agent-service/src/core/relationship/c5-settlement.test.ts`
- `apps/agent-service/src/core/relationship/consent.ts`
- `apps/agent-service/src/core/relationship/graduation-gap.test.ts`
- `apps/agent-service/src/core/relationship/interaction-contracts.test.ts`
- `apps/agent-service/src/core/relationship/interaction-contracts.ts`
- `apps/agent-service/src/core/relationship/migration-39.ts`
- `apps/agent-service/src/core/relationship/non-revival.test.ts`
- `apps/agent-service/src/core/relationship/projections.test.ts`
- `apps/agent-service/src/core/relationship/repair-consent.test.ts`
- `apps/agent-service/src/core/relationship/self-commitments.ts`
- `apps/agent-service/src/core/relationship/tensions.ts`
- `apps/agent-service/src/core/relationship/writers.test.ts`

### Modified

- `apps/agent-service/route-surface.json`
- `apps/agent-service/src/core/agency/decide.ts`
- `apps/agent-service/src/core/agency/motivations.ts`
- `apps/agent-service/src/core/cognition/schema-contract.ts`
- `apps/agent-service/src/core/cognition/worker.ts`
- `apps/agent-service/src/core/cognitive-graduation/schema.test.ts`
- `apps/agent-service/src/core/context-budget/schema.test.ts`
- `apps/agent-service/src/core/db.ts`
- `apps/agent-service/src/core/identity/store.ts`
- `apps/agent-service/src/core/learned-autonomy/schema.test.ts`
- `apps/agent-service/src/core/memory/fanout.ts`
- `apps/agent-service/src/core/memory/forget.ts`
- `apps/agent-service/src/core/memory/forget-oci.test.ts`
- `apps/agent-service/src/core/qualification/state-inventory.ts`
- `apps/agent-service/src/core/relationship/authority.ts`
- `apps/agent-service/src/core/relationship/forget.test.ts`
- `apps/agent-service/src/core/relationship/forget.ts`
- `apps/agent-service/src/core/relationship/mutual.test.ts`
- `apps/agent-service/src/core/relationship/projections.ts`
- `apps/agent-service/src/core/relationship/relationship.test.ts`
- `apps/agent-service/src/core/relationship/repair.ts`
- `apps/agent-service/src/core/relationship/store.ts`
- `apps/agent-service/src/core/relationship/transitions.ts`
- `apps/agent-service/src/core/relationship/types.ts`
- `apps/agent-service/src/core/relationship/withdrawal-repair.test.ts`
- `apps/agent-service/src/core/runtime.ts`
- `apps/agent-service/src/core/sandbox/migration-34.test.ts`
- `apps/agent-service/src/core/types.ts`
- `apps/agent-service/src/route-surface.test.ts`
- `apps/agent-service/src/server.ts`

## Acceptance witnesses

- One current shared-culture projection and prior historical snapshot are
  maintained. C1 owner correction removes the owner fact from the current
  projection, preserves history, and does not rewrite Ashley Identity.
- C1 correction fan-out recomputes C5 without seeding or otherwise mutating
  Identity rows. Apply-era legacy reminder sources retain an explicit live
  provenance binding for OCI, while non-influential reminder writes remain
  shadow.
- Shared projections vary by observe versus dark-apply mode without changing
  durable source truth. C1 currentness, provenance, privacy, and correction
  barriers remain enforced.
- The four Q16 interaction-contract kinds are typed separately. Exact
  bilateral evidence is required for a mutual contract; implicit hypotheses
  remain non-binding.
- Production-path C5 writers require host/evidence and validated decisions
  where required. Observe rows remain shadow; dark-apply fixture rows are live;
  apply fails closed.
- Mutual state remains proposed until the required bilateral timestamps,
  Ashley decision, current bilateral consent, and validated delivery binding
  exist. Delivery does not equal consent, repair, or acceptance.
- A due reminder may become an Agency motivation only with an explicit due
  clock. A null due time does not become fuel, and no reminder is auto-sent.
- Repair proposal, repair evidence, repair adjudication, and delivery remain
  separate. Adjudication updates derived tension/proposal state without
  fabricating repair or experience.
- Withdrawal blocks initiative and conservatively blocks topic-proactive
  selection. Coercive pressure remains blocked.
- Consent revocation, withdrawal, corrected state, and rollback remain
  effective across observe transitions and restart-like reads. No withdrawn
  or revoked state silently revives.
- C5 shadow rows cannot reach Agency under the C5 projection gate. Existing
  owner-scoped legacy relationship rows retain their separate legacy gate.
- `secret` material remains excluded from model context. `never_public` is
  distinguished from private Thought eligibility and owner-facing
  `/commitments` display policy.
- C5 forgetting discovers and redacts dependent projection, contract,
  proposal, tension, and repair state while preserving append-only consent,
  repair evidence, adjudication, and historical evidence rows as required.
- C3 learned interest cannot become mutuality, consent, loyalty, or a
  relationship score. No authority widening or Identity mutation is created.
- The explicit owner-authenticated route is registered and tested. The route
  does not accept a caller-selected `dark_apply` mode.

## Focused verification

Exact C5 package command:

```text
npm test --prefix apps/agent-service -- src/core/relationship/graduation-gap.test.ts src/core/agency/relationship-motivations.test.ts src/core/relationship/coercion-gate.test.ts src/core/relationship/c5-schema.test.ts src/core/relationship/projections.test.ts src/core/relationship/interaction-contracts.test.ts src/core/relationship/writers.test.ts src/core/relationship/repair-consent.test.ts src/core/relationship/withdrawal-repair.test.ts src/core/relationship/non-revival.test.ts src/core/relationship/c5-adversarial.test.ts src/core/relationship/c5-settlement.test.ts src/core/relationship/forget.test.ts src/core/relationship/mutual.test.ts src/core/relationship/relationship.test.ts src/core/relationship/authority.test.ts src/core/relationship/reminder-agency.test.ts src/route-surface.test.ts
```

Result: `18` test files passed, `52` tests passed.

After current-production reconciliation and schema renumbering, the exact C5
plus compatibility pack passed `22` files and `59` tests. The consolidated
cognitive pack passed `54` files and `150` tests.

Additional verification:

- `npm run build --prefix apps/agent-service` — passed.
- `npx vitest run src/core/relationship --reporter=verbose` — passed, `16`
  files and `45` tests.
- `npx vitest run src/route-surface.test.ts --reporter=verbose` — passed, `4`
  tests.
- `git diff --check` — passed; Git emitted only expected Windows line-ending
  conversion warnings.

## Explicit exclusions and remaining debt

- No provider calls or live provider smoke were run.
- No full repository corpus, `phase0:offline`, or full evaluation campaign was
  run.
- No Mint access, Linux/Bubblewrap qualification, deployment, production
  mutation, Model Fabric activation, capability promotion, external effect,
  or push was performed.
- C5 remains observe/unpromoted. `dark_apply` is a local fixture path only;
  C5 apply is refused.
- Independent review, candidate freeze, physical qualification, and any
  production-routing decision remain outside this implementation run.
- C5 does not add a relationship score, attachment/dependency optimization,
  auto-send engine, third-party relationship representation, or Identity
  rewrite.
- The frozen packet leaves projection recompute batching and the exact
  consent scope string as implementation non-decisions. This implementation
  uses rebuildable projection rows and the typed
  `private_relationship_projection` scope with the accepted legacy alias.

## Forbidden-scope confirmation

No push, deployment, Mint access, production mutation, Model Fabric
activation, qualification, promotion, external effect, or provider call was
performed.

```text
C5 LOCAL_SETTLED: YES
```
