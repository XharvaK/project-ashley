# 03 — Master Implementation Plan

**Status:** Phase graph and execution policy for Luna Max. Types live in [02_IMPLEMENTATION_SPECIFICATION.md](02_IMPLEMENTATION_SPECIFICATION.md). Architecture: [00_ARCHITECTURE_REFERENCE.md](00_ARCHITECTURE_REFERENCE.md).

**For agentic workers:** Execute phases in order using the phase files. Do not implement from this master file alone.

**Execution status until Gate A:** `BLOCKED_PENDING_OWNER_BASELINE_SELECTION`.

---

## Why this order (source dependency)

The live cognitive inversion is concentrated in `runtime.ts` `handleReactiveChat` **and** in Discord `drainTurn`, which waits on `POST /chat/text` inside `ChannelQueue`. Rewriting runtime in place, or assuming compose/preempt after only removing `activeOwners`, would leave inbound cognition serialized at the bot. Therefore:

1. Owner architecture acceptance (done) and **owner baseline selection** (Gate A).
2. Revalidate the source map on the selected SHA.
3. Build the sidecar kernel (Phases 00–07).
4. Complete **all live-capable source** while still flag-gated (Phase 08): ingress split, live dispatcher, health, import tool, outbox projector, shadow/live modes, recovery, deploy hooks.
5. **Candidate freeze.** Clean commit. Record `CANDIDATE_SHA`.
6. Qualification Q1–Q6 on **that unchanged SHA** (Phase 09 operations).
7. Configuration-only cutover of `QUALIFIED_SHA` (Phase 10).
8. Live witness (Phase 11). Luna does not declare `PRODUCTION_ACCEPTED`.

No functional source change is permitted between candidate freeze and production cutover without invalidating qualification.

---

## Causal tail (do not reorder)

```
OWNER ARCHITECTURE ACCEPTANCE (done; OWNER_ACCEPTANCE_RECORD.md)
        ↓
OWNER IMPLEMENTATION BASELINE SELECTION (Gate A)
        ↓
SOURCE MAP REVALIDATION ON SELECTED BRANCH/SHA
        ↓
PHASES 00–07
        ↓
PHASE 08 — ALL LIVE-CAPABLE SOURCE, THEN CANDIDATE FREEZE
        ↓
CLEAN COMMIT → RECORD CANDIDATE_SHA
        ↓
Q1 FULL AUTOMATED CORPUS
        ↓
Q2 INDEPENDENT EXACT-CANDIDATE REVIEW (Gate R; Luna is not the reviewer)
        ↓
Q3 BOUNDED REAL-THOUGHT OCCUPANT WITNESS (configured route=thought only; not the Q1 corpus on the API)
        ↓
Q4 ISOLATED MINT QUALIFICATION
        ↓
OWNER AUTHORIZATION FOR SHADOW (Gate B)
        ↓
DEPLOY SAME SHA IN NON-AUTHORITATIVE PRODUCTION SHADOW
        ↓
Q5 REAL SHADOW EVIDENCE WINDOW
        ↓
Q6 FINAL QUALIFICATION PASS ON UNCHANGED SHA
        ↓
OWNER CUTOVER AUTHORIZATION (Gate C)
        ↓
CONFIGURATION-ONLY CUTOVER OF QUALIFIED_SHA
        ↓
PRODUCTION STRUCTURAL SMOKE
        ↓
LIVE PRODUCTION WITNESS + GROUNDED IDLE REVISIT
        ↓
LUNA: PRODUCTION_WITNESSED / PROPOSED_FOR_ACCEPTANCE
    | WITNESS_INCOMPLETE | LIVE_DEFECT_FOUND
        ↓
DOC: PRODUCTION_ACCEPTED | REJECTED / REPAIR REQUIRED (Gate D)
```

---

## Phase sequence (do not skip)

| Phase | File | Source allowed? | Kernel Discord authority | Gate |
|---|---|---|---|---|
| 0 | [PHASE_00_BASELINE_SIDECAR_HARNESS.md](phases/PHASE_00_BASELINE_SIDECAR_HARNESS.md) | yes | none | baseline selected; sidecar opens; harness fails closed; stale nuclear v35 pins inventoried |
| 1 | [PHASE_01_EXECUTIVE_CONCURRENCY.md](phases/PHASE_01_EXECUTIVE_CONCURRENCY.md) | yes | none | durable ingress (not behind chat wait); fence; atomic txn; outbox row |
| 2 | [PHASE_02_SEMANTIC_CONTRACT.md](phases/PHASE_02_SEMANTIC_CONTRACT.md) | yes | none | ThoughtStepOutput + validateSettlement + attentionDb adapter |
| 3 | [PHASE_03_CONVERSATIONAL_CONTINUITY.md](phases/PHASE_03_CONVERSATIONAL_CONTINUITY.md) | yes | none | HY3/compose-preempt; **accepted generation** not one model call; bot→agent ingress test |
| 4 | [PHASE_04_AUTHORITY_OBSERVATION_EFFECT.md](phases/PHASE_04_AUTHORITY_OBSERVATION_EFFECT.md) | yes | none | operation loop via Thought steps |
| 5 | [PHASE_05_SPEECH_EXPRESSION_DELIVERY.md](phases/PHASE_05_SPEECH_EXPRESSION_DELIVERY.md) | yes | none | finalLicensedText; outbox projector to nuclear reservations |
| 6 | [PHASE_06_MEMORY_IDENTITY_MATURATION.md](phases/PHASE_06_MEMORY_IDENTITY_MATURATION.md) | yes | none | admission fence; import tool |
| 7 | [PHASE_07_INITIATIVE_PRIVATE_COGNITION.md](phases/PHASE_07_INITIATIVE_PRIVATE_COGNITION.md) | yes | none | idle-if-grounded |
| 8 | [PHASE_08_LIVE_CAPABLE_WIRING.md](phases/PHASE_08_LIVE_CAPABLE_WIRING.md) | yes, then **FREEZE** | none (legacy speaks) | flag-gated live dispatcher, health, shadow, recovery; freeze SHA |
| 9 | [PHASE_09_QUALIFICATION_REHEARSAL.md](phases/PHASE_09_QUALIFICATION_REHEARSAL.md) | **NONE** | none | [QUALIFICATION_PROTOCOL.md](QUALIFICATION_PROTOCOL.md) Q1–Q6 |
| 10 | [PHASE_10_PRODUCTION_CUTOVER.md](phases/PHASE_10_PRODUCTION_CUTOVER.md) | **NONE** | **v021** | config-only; `HEAD == QUALIFIED_SHA` |
| 11 | [PHASE_11_LIVE_EVIDENCE.md](phases/PHASE_11_LIVE_EVIDENCE.md) | **NONE** | v021 | witness report; owner acceptance |

Old mapping: Phase 08 was “sidecar shadow as an implementation phase that still edits runtime after qualification planning.” Shadow **code** is Phase 08. Shadow **operations** are Q5 in Phase 09. Phase 10 no longer creates `dispatch/live.ts`.

If a defect is found in 09–11: return to implementation, new SHA, restart qualification. Do not patch live in 09–11.

---

## Autonomy policy

### Normal failure (repair and continue)

TypeScript errors; unit/integration failures; migration fixture mismatch; SQL txn bugs; deterministic race tests; malformed settlement handling; extra model attempts from compose/preempt; source seam slightly different but mapping still valid **after** selected-baseline revalidation.

Loop: diagnose root → repair implementation → smallest tests → full phase gate → write `docs/cognitive-rework/v0.2.1/artifacts/PHASE_XX_GATE.md` → next phase.

Do not ask Doc for routine coding choices.

### HARD BLOCKER (stop, preserve evidence)

1. v0.2.1 not authoritatively reconciled into governing architecture docs.
2. No owner-selected implementation baseline.
3. Selected baseline is not a verified descendant / legitimate production-line source.
4. Source map materially invalid on selected baseline.
5. Candidate git tree dirty at freeze.
6. Deployed SHA != qualified SHA.
7. Code modification after candidate freeze without qualification reset.
8. No independent review of exact candidate SHA.
9. No bounded Q3 real-Thought occupant contract witness (skipped, fully mocked, or programmed settlements used as Q3). Exhaustive live-model corpus is **not** required and is **forbidden** as unbounded quota use.
10. No isolated Mint qualification.
11. No owner authorization for production-host shadow.
12. No real shadow evidence.
13. Production shadow accidentally sends candidate replies to Doc.
14. Outbox bridge cannot be proven idempotent/recoverable.
15. Migration/import count or hash mismatch.
16. Deployment ref unavailable on Mint.
17. In-flight state cannot be safely classified at cutover.
18. Required production secret/config absent and cannot be resolved safely.
19. Owner cutover authorization absent.
20. Required owner live input unavailable.
21. Grounded idle revisit not witnessed before production acceptance (Luna returns `WITNESS_INCOMPLETE`, not acceptance).
22. Post-cutover live causal evidence shows wrong semantic owner.
23. Production architecture contradicts frozen v0.2.1 and cannot be repaired locally.

Also stop for: two frozen invariants cannot hold together; irreversible migration cannot follow the runbook.

Return: failed invariant, source, evidence paths, why implementation cannot fix it.

### Forbidden repairs

- Reintroduce `decide()` as meaning, easy-turn Expression answers, `finalizeHonesty` surgery, perception-after-Thought, Expression transcript privilege
- Patch the HY3 phrase without fixing referent state
- Add prompt wording when Authority/types are wrong
- Dual-write production meaning in shadow
- Hybrid cognitive turn (legacy Thought + new Expression, or vice versa, as Doc’s utterance)
- Qualify on programmed settlements instead of the bounded Q3 inhabit witness
- Send the Q1 architecture corpus to the live Thought API
- Benchmark all providers / run a model horse race
- Blind-retry live model calls after a classified implementation failure (quota storm)
- Replace Q5 with fixture replay
- Declare `PRODUCTION_ACCEPTED`

---

## Commit policy (Luna)

After each **task** that the phase file marks as a commit boundary **and only in Phases 00–08**:

- Stage **only** files named in that task (paths under `apps/agent-service/src/core/cognitive-v021/`, discord ingress files named in the phase, tests, `env.ts` kernel flag, nuclear additive outbox column, packet artifacts).
- Do not add untracked root packets, `.env`, mint forensic scripts, or unrelated docs.
- Message form: `feat(cognitive-v021): <phase-task why>`
- Do not `--no-verify`. Do not force-push. Do not commit unless the phase file’s commit step is reached.
- Do not push unless Doc asked.
- After freeze: **no commits** until a qualification-invalidating repair is explicitly started as a new candidate.

Doc’s review of this packet is not a commit instruction.

---

## Empirical parameters (resolved for implementation)

| ID | Parameter | Frozen default | How tests select |
|---|---|---|---|
| E1 | ACK bypass | **Off.** Always an **accepted** Thought settlement on owner_message | `acceptedSettlements >= 1` on hi/thanks; model attempts may be >1 |
| E2 | settle-then-draft | Allowed extra **pass** same generation | If first JSON missing draft, another Thought **step**; Expression still starved |
| E3 | tools-in-Thought vs multi-pass | Multi-pass in-cycle (`awaiting_operation`) via `ThoughtStepOutput` | No extra occupant |
| E4 | last N | `DEFAULT_LAST_N_TURNS = 12` | Governor must not evict |
| E5 | detector lexicons | Reuse `honesty/claims.ts` regexes as reject-only detectors | No surgery |
| E6 | occupant | KEEP route `thought` / registry model | Swap test uses fake occupantId |
| E7 | admission keys | From Thought nomination, not transcript scanner | Fence test |
| E8 | idle cadence | `DEFAULT_IDLE_TICK_MS = 60_000` | Empty house 0 calls regardless of cadence |
| E9 | max Thought passes | `MAX_THOUGHT_PASSES = 6` | Includes observation/effect rounds and compose restarts of the attempt |
| E10 | max observation rounds | `MAX_OBSERVATION_ROUNDS = 4` | Per generation |
| E11 | max effect rounds | `MAX_EFFECT_ROUNDS = 4` | Per generation |
| E12 | Q3 live-call ceiling | Owner/config `REAL_MODEL_WITNESS_MAX_CALLS` (recommended 20 if unset) | Recorded in `artifacts/QUOTA_BUDGET.md` before Q3 |
| E13 | Q3 family retry cap | Owner/config `REAL_MODEL_WITNESS_RETRY_CAP` (recommended 2) | Stop family; no retry storm |
| E14 | Fallback smoke | Owner/config `FALLBACK_SMOKE_MAX_CALLS` (recommended 2) | Fallback route only; no horse race |
| E15 | Shadow synthetic extras | Owner/config `SHADOW_MODEL_CALL_BUDGET` (recommended 0) | Real ingress is the evidence |
| E16 | Live witness recapture | Owner/config `LIVE_WITNESS_RETRY_CAP` (recommended 1) | Then defect/incomplete |

Open but named: `IDLE_NOOP_BEFORE_DORMANT = 3`, `DEFAULT_MAX_SUBSCRIPTIONS = 16`, `DEFAULT_MISS_ROUND_CAP = 1`, `DEFAULT_TOOL_CYCLE_LEASE_MS = 120_000`. Changing defaults is not architecture if tests still enforce the laws. E12–E16 are **not** architecture; they bound quota. Unbounded silent API spend is an execution defect.

---

## Law coverage (S1–S31)

| Law | Spec section | Phase | Qualification | Live witness |
|---|---|---|---|---|
| S1 Thought draft; Expression form | C, D, V, speech transform | 2, 5 | Q1 exhaustive; Q3 W8 | D prior-speech / naturalness |
| S2 author vs publication; intra-cycle ops | A, B, D-step, L, M | 1, 2, 4 | Q1 C/D/K; Q3 W6 | causal trace |
| S3 raw outranks derived | E, K | 2, 4 | C | correction sequence |
| S4 confidence ≠ evidence | D, Q | 2, 6 | C | memory |
| S5 retrieval; trigger terms | J | 3 | Q1 HY3 suite; Q3 W2/W5 | original failure shape |
| S6 recorded ≠ true | E, T | 1, 6 | C | — |
| S7 traceable ≠ authorized | N | 4 | C, K | operation |
| S8 persistence ≠ confirmation | M, O, bridge | 4, 5 | H, I, L | — |
| S9 nomination ≠ admission; fence | P, Q | 6 | G | memory |
| S10 workspace ≠ belief | D | 2 | C | — |
| S11 calibration ≠ identity | S, R | 6 | occupant swap | — |
| S12 timeout ≠ non-occurrence | M | 4 | L | — |
| S13 claims ≤ receipts | N, C | 4, 5 | C | operation |
| S14 Authority codes + dispatch | N | 4 | K | — |
| S15 model ≠ Authority | N | 4 | C | — |
| S16 Agency executive | H, I, idle | 1, 7, 8 | A, B | idle revisit: kernel did not decide importance |
| S17 allowed wakes; empty house | A, I | 7 | A, B, C | grounded idle **mandatory** |
| S18 failure ≠ Expression/decide | U | 5 | Thought-down | — |
| S19 no optimization bypass | all | 5, 9 | invariant audit | — |
| S20 prompts ≠ authority | N | 4, 5 | invariant audit | canned architecture phrases fail |
| S21 draft/commitment; empty+pretty fail | C.1, speech transform | 5 | Q1 E; Q3 W8 | naturalness |
| S22 one lineage; pointers | G, H, I | 3, 7 | D | unanswered question return |
| S23 no richer downstream evidence | V | 5 | invariant audit | — |
| S24 no hybrid; no dual-write production | W, ingress, freeze | 8, 10 | J, Q5, cutover | no hybrid utterance |
| S25 DB existence ≠ continuity | W | 0, 10 | cutover | — |
| S26 right text wrong owner fail | Y | 0–9 | every Q1 causal test; Q3 if executed | live causal owner |
| S27 fence canon | A, B, O, ingress | 1, 3, 8 | F, H, J, bot ingress test | rapid messages |
| S28 occupant calibration | S | 6 | occupant swap | — |
| S29 private silence success | C mode=none | 5, 7 | private silence | idle may be silent |
| S30 persistent state must re-enter | G, H | 7 | A | idle revisit |
| S31 utterance ≠ world fact | E, T, K, D-step | 4, 6 | Q1 C; Q3 W4/W5 | — |

No law is prompt-only. No law is orphaned.

---

## Source coverage

Every row in [01_SOURCE_BASELINE_AND_MIGRATION_MAP.md](01_SOURCE_BASELINE_AND_MIGRATION_MAP.md) §2 appears in a phase. Discord ingress is **REDESIGN** (not KEEP). Cutover (10) makes RETIRE-as-meaning paths unreachable on the live kernel **by configuration of already-frozen source**.

---

## Qualification vs tests

Phases 00–08: implement and gate. Freeze. Phase 09: Q1–Q6 on frozen SHA, **no source**. Phase 10–11: operations. Q1 is exhaustive and deterministic. Q3 is a **bounded** inhabit witness of the configured Thought occupant, not the Q1 corpus on the API. Programmed Thought settlements remain valid for Q1. They do not close Q3 or Q5. Q5 real shadow and Phase 11 live Discord are higher-value real-model evidence than extra synthetic API suites. Occupant change → bounded OCCUPANT CONTRACT WITNESS, not a live rerun of Q1.

---

## Artifact directory

```
docs/cognitive-rework/v0.2.1/artifacts/
  PHASE_00_GATE.md … PHASE_08_GATE.md
  CANDIDATE_FREEZE.md          # CANDIDATE_SHA, spec versions, dirty=false
  QUOTA_BUDGET.md              # recorded before Q3; owner/config ceilings
  QUALIFICATION_RESULT.md      # QUALIFIED_SHA; separate Q1–Q6 fields; quota used
  SHADOW_RESULT.md
  CUTOVER_RESULT.md
  LIVE_EVIDENCE_REPORT.md
```

Every qualification artifact binds: `candidateSha`, `selectedBaselineSha`, `architectureVersion=v0.2.1`, `implementationSpecVersion=0.2.1.r2`, `qualificationProtocolRevision=r2.1`, `sidecarSchemaVersion=1`, `thoughtContractVersion=1`, Thought route/occupant, Mint host identity, timestamp, shadow mode config hash, `legacyImportToolVersion=1`, `outboxBridgeVersion=1`, recorded quota ceilings.

---

## Next-phase precondition (universal)

- Previous `PHASE_XX_GATE.md` exists and says PASS
- `git status` shows no unrelated staged files
- `npm run build:agent` passed in that phase gate (Phases 00–08)
- No HARD BLOCKER open
- After Phase 08: `CANDIDATE_FREEZE.md` exists; Phases 09–11 must not change source
