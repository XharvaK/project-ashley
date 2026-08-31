# Phase 5 W1 Implementation Evidence

```text
WAVE_ID=W1
STATE=OFFLINE_VERIFIED
PREDECESSOR=W0_OFFLINE_VERIFIED
CANDIDATE_HEAD=573393c3fdb2392a45137d4625635658eb4b5d88
BUILD_IDENTITY=573393c3fdb2392a45137d4625635658eb4b5d88
CHECKOUT_STATE=detached HEAD
PATCH_SHA_TRACKED_DIFF=e4a224cd06e6b2d418527d3edd197bd8cadeca15
PROVIDER_QUALIFICATION=NOT GENERATED (W1 stops before provider qualification)
PRODUCTION_ACCEPTANCE=NOT ESTABLISHED
```
## Implemented W1 controls

- Capability identity binds executable build, W0 semantic schema, Kernel Envelope, parser, provider, model, occupant, logical binding, wire binding, schema-enforcement mode, resource policy, and adapter compatibility.
- Qualification records use the capability-bound v2 schema. Legacy v1 records remain readable but are ineligible for W1 Thought qualification.
- Qualification and Release Truth artifacts use immutable content-hashed control-root publication. Identical bytes are idempotent; changed bytes under one identity fail closed.
- Logical structured-output evidence and sanitized emitted-wire evidence are separate. Provider grammar metadata remains `unavailable` when not exposed.
- Attempt receipts retain the capability fingerprint and sanitized wire evidence without message content.
- Release Truth compares the release claim, process identity, exact capability components, and qualification state. A stale process identity yields a build mismatch.
- W1 health predicates remain separate: transport route readiness, Thought contract qualification, Release Truth match, and production acceptance.
- NIM, Mistral, Groq, and OpenCode Zen adapter fixtures emit W1 wire evidence. Mistral native-schema requests fail closed because that adapter does not support that mode.

## Required artifact 80 gates

| Gate | Result |
|---|---|
| Unit command: capability identity, Release Truth, qualification ledger | PASS — 3 files, 11 tests |
| Integration command: MF-M2/M3/M5/M6, MF-ACT, dispatch, activation qualification path, Mistral client | PASS — 7 files, 64 tests |
| Explicit host-only activation qualification test | PASS — 1 file, 8 tests |
| Adapter command: NIM, Mistral, Groq, OpenCode Zen | PASS — 4 files, 39 tests |
| `npm run build:agent` | PASS — exit code 0 |

The repository Vitest configuration excludes `src/activation-qualification.test.ts` from the ordinary command.
That file was run explicitly with `npx vitest run --config vitest.host.config.ts src/activation-qualification.test.ts`.

## W1 falsification evidence

- Every capability component mutation produced a different aggregate fingerprint.
- Malformed capability fingerprints were rejected.
- Forged release identity, qualification absence, occupant/component mismatch, stale process build identity, and schema-enforcement mismatch were rejected or reported as mismatch evidence.
- A stronger logical enforcement mode with weaker or different wire evidence was rejected.
- Corrupted or changed immutable artifact content was rejected; identical publication was idempotent.
- Legacy profile-only v1 Thought qualification remained ineligible.
- Sanitized wire evidence excluded private message content.
- Adapter tests covered the actual selected compatibility/native modes and provider declaration absence.

## Candidate identity evidence

The current source-derived build identity is the detached candidate HEAD because no separate built release identity was supplied.
The W0 contract identifiers and resource-policy fingerprint are recorded in `W0_IMPLEMENTATION_EVIDENCE.md`.
W1 does not create primary or fallback provider qualification result IDs; those are generated independently by W2 for the exact current route.

Selected source SHA-256 values:

```text
apps/agent-service/src/core/model-fabric/capability-identity.ts=0CABAF6F679EA3B49C743CB8A04FB86A3DCE1495C1DFF7E678CE16BD6B8B3B33
apps/agent-service/src/core/model-fabric/release-truth.ts=F46A7295714224BEE214FFEE637D93DD373C0E569FD84358730AE7D56B88DA13
apps/agent-service/src/core/model-fabric/qualification-ledger.ts=9096E3971653D3AA4D016252F9E09C738783E639D84A0AADF8E6E8F3FECD6364
apps/agent-service/src/core/model-fabric/wire-evidence.ts=1AFB58D33035A0D85B759FA25689EEA66CA147DFCD13BB90C985BD5A586A7731
apps/agent-service/src/core/model-fabric/health.ts=79AAAF24F682749C68A3FA5C8CEC9FE95E0267105697F8FB638564B0A9E308B1
apps/agent-service/src/core/model-fabric/activation.ts=3F13C382F23D5B7AAA0C88A132040CEC76CEFA613A569780DA395D323C8EA2ED
apps/agent-service/src/core/model-fabric/catalog.ts=9DD1CB62B034C3D0D0538050CFEB6B1E82FDE19143939046AD3423B078AC6353
apps/agent-service/src/core/model-fabric/receipts.ts=D963FCB01A21082CAC5FF99E9234A8DDCE1458F05465D898F6F3E4A0B3024ACC
apps/agent-service/src/core/model-routing/adapters/mistral-adapter.ts=908EA518FACFAFDBFC45FEE21128A9C7D4347C6C3CB253F28012D46B7B65D30C
apps/agent-service/src/core/model-routing/adapters/nim-adapter.ts=C5791167D43658E25467756843D73E87D098A353B3CD25945504C09E4FA38B51
apps/agent-service/src/core/model-routing/adapters/groq-adapter.ts=9E5015F08A9C8873D1B18355206D03F533FC26B911D7B4D5FBDB28F2E287616B
apps/agent-service/src/core/model-routing/adapters/zen-adapter.ts=311484F95E17B2132C2617E94597102A89218AEF528254326644B094672CC80A
apps/agent-service/src/mistral-client.ts=F1D899A1926BD88106AB839B7EDCBA83C8152F100C1524E2C92420AA491E0ECD
```

```text
REVIEWER_ID=Codex current task mechanical review
SEPARATE_REVIEWER=NOT RUN
```

## Boundary

W1 is complete for its offline implementation and evidence gates.
No provider call, activation, deployment, production database write, production acceptance, or promotion was performed.

```text
W1_GATE=COMPLETE_FOR_OFFLINE_VERIFICATION
NEXT_AUTHORIZED_WAVE=W2
```
