# Phase 04 — Authority / Observation / Effect

## GOAL

Deterministic Authority packs (proposal, settlement, dispatch-time recheck), ObservationRequest vs EffectProposal, **Thought operation loop** via `ThoughtStepOutput`, Sandbox/receipt integration, orphan recovery, currentness detectors (reject-only).

## ARCHITECTURAL LAWS IMPLEMENTED

S7, S12, S13, S14, S15, S3 (perception), S31 (tools fallible).

## DEPENDENCIES

Phase 03 PASS.

## CURRENT SOURCE STATE

- `honesty/claims.ts` regex detectors + `finalizeHonesty` surgery
- `evaluateReactiveOperationalAdmission` fail-closed execution
- `operational-job-store.ts` in_flight
- Perception after Thought on live path
- `core.md` currentness sentences

## TARGET SOURCE STATE

`checkAuthority` for three stages. Dispatch recheck uses `authorityEpoch`. Sandbox reads → Observation; writes → Effect. Recovery cycle consumes receipts. **Do not** call `finalizeHonesty` from the new kernel.

## FILES TO CREATE

- `authority/codes.ts`
- `authority/packs.ts`
- `authority/check.ts` + `.test.ts`
- `authority/currentness-detectors.ts` (wrap `honesty/claims.ts` patterns; no strip)
- `observation/request.ts` + tests
- `effect/proposal.ts` + tests
- `effect/recovery.ts` + tests
- `acceptance/authority-scenarios.test.ts`

## FILES TO MODIFY

`runCognitiveCycle` awaiting_operation loop; `in-flight.ts`.

## FILES / PATHS THAT MUST NOT CHANGE

`finalizeHonesty` implementation (legacy). Do not delete claims.ts; reuse.

## INTERFACES CONSUMED

Sandbox executors injected as `KernelDeps`: `executeProjectInspectionV2`, `executeWorkspaceExperimentV2`, `executeCandidateVerificationV2` from `core/sandbox/v2-execution.ts`. Tests use fakes with the same function names.

## INTERFACES PRODUCED

`checkAuthority`, `AuthorityCode`, `ObservationRequest`, `EffectProposal`, `recoverInFlight`.

## DATABASE / MIGRATION CHANGES

`authority_epoch` integer on sidecar meta, bump on pack mutation in tests.

## LEGACY COMPATIBILITY

Live honesty surgery remains on production.

---

## TEST-FIRST TASK SEQUENCE

### Task 4.1 Authority codes exhaustive

- [ ] Switch on `AuthorityCode` with `never` default in a `describeCode` helper (typescript-exhaustive-switch)
- [ ] Commit: `feat(cognitive-v021): define AuthorityCode union`

### Task 4.2 Settlement currentness

- [ ] Draft “the latest HY4 shipped today” without observation and without CURRENT time dimension on commitments → `CURRENTNESS_UNVERIFIED`, no publish
- [ ] Same with observation `modality:"page"` consumed → ok
- [ ] Must **not** rewrite the draft (no surgery)
- [ ] Commit: `feat(cognitive-v021): currentness Authority reject without draft surgery`

### Task 4.3 Receipt claims

- [ ] `effectsCompleted` success claim while receipt `unknown` → `IN_FLIGHT_UNKNOWN` or `RECEIPT_REQUIRED`
- [ ] Receipt failed vs draft “it worked” → `RECEIPT_CONTRADICTS_CLAIM`
- [ ] Commit: `feat(cognitive-v021): receipt-bounded action claims`

### Task 4.4 Proposal vs dispatch epoch

- [ ] EffectProposal stored epoch 1; before dispatch packs bump to 2 (simulate withdrawal) → do not dispatch; `DISPATCH_EPOCH_CHANGED`
- [ ] Commit: `feat(cognitive-v021): dispatch-time Authority recheck`

### Task 4.5 Observation vs Effect classification

- [ ] `project.read_file` → ObservationRequest
- [ ] `workspace.write_file` → EffectProposal
- [ ] Ambiguous `"unknown_op"` → Effect
- [ ] Commit: `feat(cognitive-v021): classify observation vs effect fail-closed`

### Task 4.6 Sandbox observation into cycle

- [ ] Fake read_file returns text; Thought second pass (or same cycle awaiting_operation) sees Observation; WC not updated until publish
- [ ] Commit: `feat(cognitive-v021): intra-cycle observation without premature semantic publish`

### Task 4.7 Orphan recovery

- [ ] in_flight + process restart simulation (`recoverInFlight` on open) → triggerKind recovery; Thought sees `unknown` possible; timeout ≠ failed
- [ ] Commit: `feat(cognitive-v021): orphan in-flight recovery as unknown`

### Task 4.8 Tool failure

- [ ] Effect receipt failed; settlement must not claim success; draft may explain failure only if receipt says failed
- [ ] Commit: `feat(cognitive-v021): tool failure cannot be narrated as success`

### Task 4.9 Relational withdrawal pack

- [ ] Pack says withdrawn; EffectProposal Discord-adjacent or `RELATIONAL_WITHDRAWAL` on speak-mode if constraint says silence — **decision rule:** withdrawal blocks **speech.mode=draft** at settlement when pack `relational.withdrawalActive`; effects that notify Doc also blocked at dispatch
- [ ] Commit: `feat(cognitive-v021): relational withdrawal Authority pack`

### Task 4.10 Revision budget

- [ ] Two Authority revision loops then third conflict → `REVISION_BUDGET_EXHAUSTED`; `mode=none` or infrastructure notice; no livelock (max 3 checkAuthority settlement calls)
- [ ] Commit: `feat(cognitive-v021): Authority revision cap fail-closed`

### Task 4.11 Thought operation loop

- [ ] Fake Thought returns `observation_request` then, after fake observation, `settlement`
- [ ] Cycle state visits `awaiting_operation`
- [ ] Receipt/observation reinjected; original log still in next `ThoughtInput`
- [ ] Stale generation step ignored
- [ ] `pass` increments; `MAX_THOUGHT_PASSES` fail-closed
- [ ] Commit: `feat(cognitive-v021): Thought step protocol operation loop`

## CAUSAL ACCEPTANCE TESTS

K (dispatch epoch), L start (unknown receipt). Currentness with/without evidence.

## CONCURRENCY TESTS

Dispatch recheck vs concurrent pack bump (deterministic fake clock/epoch++).

## NEGATIVE TESTS

Surgery: assert output draft unchanged when rejected (no stripped sentence).

## LATENCY / RESOURCE TESTS

Tool cycle may use `DEFAULT_TOOL_CYCLE_LEASE_MS`; ordinary non-tool still 1 Thought call.

## FULL PHASE GATE

```powershell
npx vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npx tsc --noEmit
npm run test:offline --prefix apps/agent-service
```

## EXPECTED PASS SIGNATURE

authority-scenarios PASS; `finalizeHonesty` not imported from `cognitive-v021/**`.

## AUTONOMOUS REPAIR POLICY

If a test only passes by calling `finalizeHonesty`, delete that call.

## HARD BLOCKERS

Need live Bubblewrap for unit Authority tests (must fake). Need to change honesty surgery globally.

## OUTPUT ARTIFACT

`artifacts/PHASE_04_GATE.md`

## NEXT PHASE PRECONDITIONS

checkAuthority three stages; recovery unknown; no honesty import.
