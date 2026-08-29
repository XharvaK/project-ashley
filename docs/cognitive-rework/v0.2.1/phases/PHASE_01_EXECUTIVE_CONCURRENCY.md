# Phase 01 — Executive Concurrency Foundation

## GOAL

Implement inbox + evidence log append, **durable Discord ingress** (not behind `/chat/text` wait), cycle fence, atomic semantic publication primitive, speech outbox **row** (not Discord send), in_flight pointers. **No Thought model. No cutover.** Sidecar schema remains **version 1** (tables already in Phase 00 DDL; implement writers).

## ARCHITECTURAL LAWS IMPLEMENTED

S2 (publication txn), S8 (outbox persistence), S24 (sidecar only), S27 (fence canon except Authority/admission), S3 (log is evidence).

## DEPENDENCIES

Phase 00 PASS.

## CURRENT SOURCE STATE

- `runtime.ts` `activeOwners` throws `chat_in_progress`
- `delivery/store.ts` `claimReactiveDelivery` BEGIN IMMEDIATE, inbound ids, `mem_messages`
- Durable jobs: `operational-job-store.ts`

## TARGET SOURCE STATE

Sidecar tables and functions per spec A, B, E, O, M (in_flight pointer only). Fake settlement publisher for tests (minimal JSON) **only** to exercise the txn — real `validateThoughtSettlementDraft` is Phase 02. Phase 01 `publishSemanticTransaction` accepts an already-valid `PublishedCognitiveSettlement` object in memory (tests construct it, including kernel-set `finalLicensedText`).

## FILES TO CREATE

- `cognitive-v021/evidence/conversation-log.ts` + `.test.ts`
- `cognitive-v021/cycle/inbox.ts` + `.test.ts`
- `cognitive-v021/cycle/fence.ts` + `.test.ts`
- `cognitive-v021/settlement/publish.ts` + `.test.ts`
- `cognitive-v021/speech/outbox.ts` + `.test.ts`
- `cognitive-v021/effect/in-flight.ts` + `.test.ts`
- `cognitive-v021/ingress/http.ts` + server route tests
- `cognitive-v021/cycle/inbox-consumer.ts` claim/lease primitives + restart tests
- Privacy: `detectCredentialShape` on owner append

## FILES TO MODIFY

- `sidecar/schema.ts`, `types.ts` (full structs for CycleRecord, ConversationEvidenceRecord, SpeechOutboxRow, InFlightRecord, CognitiveSettlement as TypeScript types — runtime validation Phase 02)

## FILES / PATHS THAT MUST NOT CHANGE

`runtime.ts` (no compose on live path). Discord production `index.ts` wiring is Phase 08. Phase 03 may extract `createMessageCreateHandler` for the ingress integration test.

## INTERFACES CONSUMED

`openCognitiveSidecarDb`, `CausalBundle` (not required to pass harness until Phase 02 settlements exist).

## INTERFACES PRODUCED

`appendOwnerUtterance`, `appendSystemEvent`, `admitCycle`, `composeOrPreempt`, `publishSemanticTransaction`, `insertOutboxPending`, `suppressUndeliveredOutbox`, `putInFlight`, `getInFlight`.

## DATABASE / MIGRATION CHANGES

Sidecar schema **stays version 1**. Writers for tables created in Phase 00 DDL. **Do not bump to version 2.**

## LEGACY COMPATIBILITY

Production still throws `chat_in_progress` on `/chat/text`. Ingress endpoint exists but Discord does not call it until wired in this phase’s bot tests / Phase 08 live wiring. Ingress must still be testable via HTTP in agent-service tests this phase.

---

## TEST-FIRST TASK SEQUENCE

### Task 1.1 Evidence log append

- [ ] Failing test: three owner messages HY4 / I meant HY3 / it’s an LLM → three rows, none dropped, hashes differ
- [ ] Command: `npm exec --prefix apps/agent-service -- vitest run src/core/cognitive-v021/evidence/conversation-log.test.ts --config vitest.offline.config.ts`
- [ ] Expected failure: `appendOwnerUtterance` missing
- [ ] Implement append-only insert; edits increment `version`
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): append-only conversation evidence log`

### Task 1.2 Inbox never drops during thinking

- [ ] Failing test: cycle state `thinking`; append owner message; log count +1; `composeOrPreempt` returns `compose` when no published outbox and no in_flight irreversible
- [ ] Expected failure: fence missing
- [ ] Implement `admitCycle`, `composeOrPreempt`
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): inbox compose while cycle thinking`

### Task 1.3 Preempt suppresses undelivered outbox

- [ ] Failing test: publish outbox pending; new owner message → `preempt`, generation 2, old outbox `suppressed`, new generation active
- [ ] Irreversible in_flight (flag `replaySafe=false`) also preempts
- [ ] Delivered outbox (`sendStatus=delivered`) is **not** unsent
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): preempt generation and suppress stale outbox`

### Task 1.4 Stale generation ignore

- [ ] Failing test: `publishSemanticTransaction` with generation 1 while active is 2 → no WC writes
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): ignore stale generation publish`

### Task 1.5 Atomic semantic transaction

- [ ] Failing test: occupancy INSERT trigger/callback forces error after WC insert → rollback, WC empty, no outbox, no settlement row
- [ ] Implementation: `BEGIN IMMEDIATE`; write all spec §B sets; `COMMIT`/`ROLLBACK`
- [ ] SQLite pattern: copy `claimReactiveDelivery` (`delivery/store.ts` 178)
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): atomic semantic publication transaction`

### Task 1.6 Outbox pending in same txn

- [ ] Failing test: settlement `speech.mode=draft` with `finalLicensedText` `"hello"` (tests may set it equal to surfaceDraft) → outbox row pending, `licensedText` exact; `mode=none` → zero outbox rows
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): speech outbox row in publication txn`

### Task 1.7 In-flight pointer

- [ ] Failing test: `putInFlight` then duplicate idempotencyKey returns same effectId; timeout leaves `unknown` not `failed`
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): idempotent in-flight effect pointers`

### Task 1.8 Duplicate inbound Discord ids

- [ ] Failing test: same first `discordMessageId` append twice → second is no-op (same lineage), like `findReservationByInboundIds`
- [ ] Duplicate **second** id of a three-id merge → same lineage, no second row
- [ ] Three-fragment merged turn: three mapping rows, one lineage, version 1
- [ ] Edit version 2 with the **same** Discord id: mapping remains; unique PK does not reject
- [ ] Restart: mapping table survives; duplicate ingress still no-op
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): idempotent inbound discord evidence ids`

### Task 1.9 POST /chat/ingress durable admit

- [ ] Failing HTTP test: two sequential ingress posts while a fake cycle is `thinking` → both 202, both evidence rows, second returns before any Thought
- [ ] Implement `POST /chat/ingress` in `server.ts` calling sidecar append+inbox only
- [ ] Must not call `handleReactiveChat` / `completeChat`
- [ ] Commit: `feat(cognitive-v021): durable chat ingress without waiting for Thought`

### Task 1.10 Conversation identity (`resolveActiveThread`)

- [ ] First-ever owner ingress with empty `mem_threads` creates one active nuclear thread; sidecar `conversationId` equals that id
- [ ] `/new` (`archiveActiveThread` + `resolveActiveThread`) then ingress binds the **new** id
- [ ] Shadow-mode test: `resolveActiveThread` may UPDATE/INSERT thread rows; WC/Memory nuclear writes still forbidden
- [ ] Commit: `feat(cognitive-v021): conversation id uses nuclear active thread`

### Task 1.11 DataClassification round-trip

- [ ] Persist and read back `ordinary`, `sensitive`, `never_public`, `secret` on Conversation Evidence
- [ ] Credential-shaped text → `secret` + placeholder; never raw
- [ ] Commit: `feat(cognitive-v021): sidecar evidence uses source DataClassification`

### Task 1.12 Publication replay idempotency

- [ ] Inbox claimed → `publishSemanticTransaction` COMMIT succeeds → process dies before inbox `consumed`
- [ ] Restart reclaims same inbox event; publish replayed
- [ ] Zero duplicate WC/concern/occupancy/nomination/speech outbox; original settlement/outbox ids returned; inbox eventually consumed
- [ ] Meta remains singleton `id=1`
- [ ] Commit: `feat(cognitive-v021): semantic publication replay is idempotent`

## CAUSAL ACCEPTANCE TESTS

Rapid three-message log preservation (J partial). Atomic abort (F).

## CONCURRENCY TESTS

Deterministic: thinking+append compose; publish+append preempt; stale publish.

## NEGATIVE TESTS

Stale generation; duplicate discord ids; mode=none no outbox.

## LATENCY / RESOURCE TESTS

None (no LLM).

## FULL PHASE GATE COMMANDS

FROM REPOSITORY ROOT:

```powershell
npm exec --prefix apps/agent-service -- vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npm exec --prefix apps/agent-service -- tsc --noEmit
npm run test:offline --prefix apps/agent-service
```

## EXPECTED PASS SIGNATURE

cognitive-v021 PASS; tsc PASS; offline PASS; `runtime.ts` unmodified.

## AUTONOMOUS REPAIR POLICY

Txn tests flaky → fix IMMEDIATE/locking, do not disable tests.

## HARD BLOCKERS

Need to modify live `activeOwners` to pass these tests (must not). If SQLite cannot rollback the named set, STOP.

## OUTPUT ARTIFACT

`artifacts/runtime/PHASE_01_GATE.md`

## COMMIT MESSAGE / COMMIT GROUPING

Per task.

## NEXT PHASE PRECONDITIONS

Publish txn + fence + log + outbox primitives exist.
