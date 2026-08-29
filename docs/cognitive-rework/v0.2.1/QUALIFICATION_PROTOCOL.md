# Qualification Protocol — Cognitive Rework v0.2.1

**When:** After Phase 08 candidate freeze. Phase 09 executes this file. **No source changes.**

**Protocol revision:** `r5` (R5 execution-identity and persistence contracts). Architecture laws are unchanged.

**Result vocabulary:** `PASS` or `FAIL`. There is no `PASS_WITH_NOTES` that bypasses a hard cognitive invariant.

**Non-hard notes:** latency quality, occupant voice taste, shadow duration. Must be labeled `NONHARD:` and cannot override FAIL.

---

## Qualification principle (freeze)

**ARCHITECTURE QUALIFICATION** must be exhaustive. It is Q1 (and Q6’s Q1 re-run). It uses deterministic fixtures, programmed `ThoughtStepOutput` sequences, malformed outputs, recorded/replayed model outputs, adversarial settlements, provider stubs, concurrency simulation, and crash/recovery injection. It **must not** call the live Thought API repeatedly to prove architecture laws.

**MODEL-INHABITATION WITNESSING** must be bounded and quota-aware. It is Q3 (compact live `thought` route), Q5 (real shadow traffic), and Phase 11 live Discord. The question is whether the **configured Thought occupant** can inhabit the v0.2.1 contract when the architecture finally gives it the right evidence and semantic authority.

This milestone is **not** a foundation-model benchmark campaign. Do not statistically rediscover occupant quality the owner already knows. Do not invert the evidence pyramid:

| Scale | What |
|---|---|
| LARGE | Deterministic architecture corpus (Q1) |
| MEDIUM | Recorded / replayed real-model regression (Q1 fixtures) |
| SMALL | Fresh Q3 real-model witness (bounded set below) |
| VALUABLE | Real production-host shadow (Q5) |
| MOST VALUABLE | Doc actually talking to Ashley live (Phase 11) |

No qualification stage may silently consume **unbounded** provider quota.

Programmed / fixture Thought settlements remain valid for Q1. They **must not** substitute for the bounded Q3 inhabit witness or for Q5 real shadow. Fixture replay may supplement Q5; it may not replace it.

**Wave Acceptance:** This protocol does not promote capabilities and does not imply `PRODUCTION_ACCEPTED`. See `docs/Wave_Acceptance_Protocol.md`.

---

## Identity

Every artifact binds:

| Field | Source |
|---|---|
| `candidateSha` | freeze source commit; runtime freeze file **points to** it |
| `selectedBaselineSha` | ignored IMPLEMENTATION_IDENTITY.md (Doc instruction) |
| `architectureVersion` | `v0.2.1` |
| `implementationSpecVersion` | `0.2.1.r5` |
| `qualificationProtocolRevision` | `r5` |
| `sidecarSchemaVersion` | `1` |
| `thoughtContractVersion` | `1` |
| `modelRoute` / occupant | live `thought` route + resolved occupant id (no secrets) |
| Mint host identity | hostname / documented Mint id |
| `qualificationTimestamp` | UTC |
| `shadowModeConfigHash` | hash of kernel flag + projector-off + no-send |
| `legacyImportToolVersion` | `1` |
| `outboxBridgeVersion` | `1` |
| quota budget | values recorded **before Q3** (section “Quota budget”) |

Final result **must** state: `QUALIFIED_SHA = <sha>`. Cutover refuses if HEAD or deployed artifact ≠ that SHA.

Do not collapse evidence into one “model pass.” Report these **separately**:

- `ARCHITECTURE_CORPUS_RESULT` (Q1)
- `EXACT_CANDIDATE_REVIEW_RESULT` (Q2)
- `REAL_MODEL_WITNESS_RESULT` (Q3)
- `ISOLATED_MINT_RESULT` (Q4)
- `PRODUCTION_SHADOW_RESULT` (Q5)
- `FINAL_UNCHANGED_SHA_RESULT` (Q6)
- `LIVE_WITNESS_RESULT` (Phase 11; after cutover)

Quota usage (no secrets):

- `REAL_MODEL_CALLS_USED`
- `FALLBACK_CALLS_USED`
- `SHADOW_CALLS_USED` where measurable
- `RETRIES_PREVENTED` / aborted retry storms

No aggregate benchmark score may override a hard architecture invariant.

---

## Quota budget (owner / configuration parameters)

Exact integers are **OWNER / CONFIGURATION PARAMETERS** because free-tier quotas change. They are not architecture. The invariant is: **bounded, recorded, never silent-unbounded.**

Before Q3 starts, Luna **must** write `artifacts/runtime/QUOTA_BUDGET.md` with the values in force. If Doc has not set them, Luna uses the **recommended ceilings** below and records that fact. Luna may not raise a ceiling without Doc. Luna may lower a ceiling.

| Parameter | Meaning | Recommended ceiling if unset |
|---|---|---|
| `REAL_MODEL_WITNESS_MAX_CALLS` | Fresh live Thought API invocations for Q3 (all families + allowed perturbations + allowed retries) | `20` |
| `REAL_MODEL_WITNESS_RETRY_CAP` | Extra live attempts of the **same** failed family after implementation defects are excluded | `2` then stop that family |
| `FALLBACK_SMOKE_MAX_CALLS` | Fallback-route smoke only (if architecture requires a fallback) | `2` |
| `SHADOW_MODEL_CALL_BUDGET` | Cap on **synthetic extra** live calls during Q5 | `0` |
| `SHADOW_REAL_THOUGHT_MAX_CALLS` | Real mirrored shadow Thought invocations (candidate kernel) | `40` |
| `SHADOW_MAX_CYCLES` | Candidate cycles during Q5 | `40` |
| `SHADOW_MAX_DURATION` | Wall clock | `48h` |
| `LIVE_WITNESS_RETRY_CAP` | Diagnostic recapture of a failed live turn after cutover | `1` then record defect/incomplete |

Hitting a ceiling without a completed required family is not an automatic architecture FAIL. Classify: quota exhausted vs occupant incompatible vs implementation bug. Quota exhaustion from **blind retries** is an **execution defect**: stop, do not keep calling.

---

## Q1 — Full automated corpus (exhaustive, mostly deterministic)

FROM REPOSITORY ROOT:

```powershell
npm run build:agent
npm run build:discord
npm exec --prefix apps/agent-service -- tsc --noEmit
npm test --prefix apps/agent-service -- src/core/cognitive-v021
npm run test:offline --prefix apps/agent-service
npm test --prefix apps/discord-bot
```

Q1 **must** cover with **no live Thought API requirement**:

- semantic ownership
- ThoughtStep protocol (including malformed / incomplete JSON)
- generation fencing; compose/preempt; accepted generation ≠ raw call count
- atomic publication **and** crash-after-publish replay (zero duplicate deltas/outbox)
- Authority codes
- outbox / projector idempotency including global `DeliveryProjectionKey` (`speech:` vs `system:`)
- retrieval and trigger-term discovery (HY3 + perturbed entities as **fixtures**); live vs quarantined Memory tagging
- correction lineage
- admission fencing; `/remember` reference-only directive vs Thought-authored kind; credential-shaped `/remember` stores placeholder, inbox has no owner prose, remain non-admitted
- forget matrix restart (forgotten source cannot re-enter; concern statement redacted; subscription topic keys absent; pending speech cannot deliver)
- crash / recovery injection
- migration / import dry-run on isolated copies
- bot ingress integration test (real ChannelQueue)
- no legacy bypass on the new kernel path
- no score-speech
- no Expression-as-brain
- no hybrid production meaning

Use: deterministic fixtures; programmed `ThoughtStepOutput` sequences; intentionally malformed outputs; **recorded** real-model outputs where available; replay fixtures; adversarial settlements; deterministic provider stubs; concurrency simulation; crash/recovery injection.

**Do not** call the real Thought API to prove these laws.

Host-only Bubblewrap tests are **not** required on Windows. Q4 covers Mint.

**PASS iff:** all commands exit 0 and `HEAD == CANDIDATE_SHA`.

---

## Q2 — Independent exact-candidate review (Owner Gate R)

Review the **exact** `CANDIDATE_SHA`. Luna is not the independent reviewer.

**Publication mechanism (pre-authorized for this packet):** after the functional source commit and a **clean** tree:

1. Verify `git status --porcelain` has no tracked dirt.
2. Write **untracked** `docs/cognitive-rework/v0.2.1/artifacts/runtime/CANDIDATE_FREEZE.md` pointing **to** `CANDIDATE_SHA` (do not commit it into the candidate).
3. Create and push **non-merging** ref `review/cognitive-v021-candidate-<shortsha>` at **exactly** `CANDIDATE_SHA`.
4. No source modifications on that push. No force push. No PR/merge required.
5. Return repository, review ref, full SHA, runtime artifact coordinates.
6. **STOP.** Doc gives those coordinates to the independent reviewer.
7. Verdict is recorded in untracked `artifacts/runtime/EXACT_CANDIDATE_REVIEW.md`.

This push is the **explicit exception** to “do not push unless Doc asked” for Gate R only. Other pushes still require Doc.

**PASS iff:** independent verdict ACCEPT (or ACCEPT_WITH_NONBLOCKING_NOTES that do not touch frozen contracts) bound to `CANDIDATE_SHA`.

HARD BLOCKER 8 if skipped.

---

## Q3 — Bounded real Thought occupant contract witness

Q3 is **not:** “run the entire canonical and perturbed corpus using the real model.”

Q3 is: run a **compact representative witness set** proving that the candidate’s configured `route = "thought"` occupant can inhabit the frozen contract.

Use the actual candidate Thought route/occupant. **Do not** benchmark all configured providers. **Do not** compare every registry model. **Do not** use this milestone to choose “the smartest model.”

If the architecture requires a fallback route, run only a **minimal fallback smoke** (`FALLBACK_SMOKE_MAX_CALLS`): route selection works; `ThoughtStepOutput` parses; semantic authority is unchanged; fallback does not reactivate Expression cognition. Do not consume fallback quota otherwise.

Programmed settlements are **forbidden** as the primary Q3 evidence. Recorded fixtures may **not** replace Q3 for the current occupant+contract pair, but they should prevent re-spending quota on identical parser tests (those belong in Q1).

### Required witness families (one primary each)

| ID | Family | Minimum proof |
|---|---|---|
| W1 | Normal natural conversation | Valid settlement; natural `surfaceDraft` when speaking |
| W2 | Multi-turn correction / reference | Shape: HY4 → “I meant HY3” → referent continuity in settlement/WC |
| W3 | Natural owner teaching | Immediate Working Context use; valid `DurableNomination` **shape** (not live Memory) |
| W4 | Genuine ambiguity / uncertainty | Thought may leave ambiguity unresolved rather than confidently fabricate |
| W5 | Retrieval miss | Thought issues retrieval/history request; reintegrates; settles without inventing the miss |
| W6 | One `ObservationRequest` loop | thinking → awaiting_operation → integrate → settlement |
| W7 | One `EffectProposal` / receipt loop | **Only if safe** in isolated qualification (no production Discord send; no unsafe sandbox). Else `W7: SKIPPED_NO_SAFE_TARGET` with reason — not a Q3 FAIL |
| W8 | `surfaceDraft` + commitments | Natural speech; structurally valid settlement; draft/commitment licensed |
| W9 | One private cognition | `speech.mode = none` is a successful settlement |
| W10 | One Authority objection / Thought revision | Where safely reproducible; else `W10: SKIPPED_NOT_SAFELY_REPRODUCIBLE` — not a Q3 FAIL |

Perturbations: **at most one** extra live call per family, and only when needed to show the behavior is not phrase-specific. Do **not** run dozens of near-duplicate live-model calls.

Do not add extra families (currentness, Thought outage, duplicate delivery, restart, occupant swap, idle, subscription, stale trigger, relational boundary, rapid-compose) as **live** Q3. Those remain **Q1 deterministic** proofs. Rapid-compose restarts are proven with stubs. Idle-if-grounded live proof is Q5/Phase 11, not a Q3 quota campaign.

### Retry-storm prevention (autonomous repair)

If real-model witnessing fails repeatedly because of parser bug, schema mismatch, bad Thought prompt, malformed adapter, incorrect reinjection, or other **implementation** bugs:

1. Capture exact raw and parsed evidence on the **first meaningful failure**.
2. Classify **implementation vs occupant**.
3. If implementation: repair locally, add **deterministic** parser/fixture regression (Q1), **do not** keep calling the API.
4. Rerun **only** the smallest affected real-model witness family.
5. If `REAL_MODEL_WITNESS_RETRY_CAP` is exhausted for that family after implementation is excluded: stop that family; record occupant incompatibility evidence (below). Do not spray remaining budget hoping for a pass.

Quota exhaustion caused by blind retries is an **execution defect**, not a reason to keep calling.

### Q3 HARD BLOCKER threshold

One weird real-model response is **not** an architecture failure.

Q3 becomes HARD BLOCKER 9 only when, after implementation defects have been excluded, evidence shows the configured occupant **cannot reliably satisfy a core contract**. Examples:

- repeated malformed `ThoughtStepOutput`
- repeated inability to produce a valid settlement
- supplied conversation still not used for correction/reference (W2)
- repeated unlicensed draft/commitment contradictions (W8)
- required operation loop cannot be completed when W6/W7 are in scope and safe
- latency fundamentally exceeds the permitted lease under normal conditions (not a single slow call)

Do not burn quota attempting statistical perfection.

Record: observed failure; attempt count; repair attempts; why implementation was excluded; why occupant is now considered incompatible.

**PASS iff:** each required family is `PASS` or an allowed `SKIPPED_*`; hard invariant violations on executed families = 0; no Expression-as-brain; wrong causal owner fails even if text looks good; quota budget recorded; `REAL_MODEL_CALLS_USED` ≤ recorded `REAL_MODEL_WITNESS_MAX_CALLS` unless Doc raised the ceiling in writing.

HARD BLOCKER 9 if Q3 is skipped, fully mocked, or replaced by programmed settlements.

---

## Occupant-change qualification

Changing the Thought occupant does **not** require rerunning the entire architectural corpus against the new model. Q1 remains deterministic.

A new occupant requires a bounded **OCCUPANT CONTRACT WITNESS**: W1, W2, W5, W6, W8, plus latency, plus any known occupant-specific failure mode. Same quota rules. Do not benchmark unrelated models.

Recorded outputs are **not** world truth and are **not** sufficient after a Thought contract or occupant materially changes. They remain Q1 parser/regression gold.

---

## Recorded real-model outputs

Where permitted, preserve representative successful and malformed Thought outputs as Q1 regression fixtures (no secrets). Suggested path after implementation:

`apps/agent-service/src/core/cognitive-v021/acceptance/recorded-thought-steps/`

They may later validate: ThoughtStep parser; settlement validation; Authority integration; surfaceDraft/commitment fidelity; model-contract compatibility; schema changes.

They must not be treated as live inhabit evidence for a new occupant or a changed Thought contract.

---

## Q4 — Isolated Mint qualification

Q4 occurs **before** Owner Gate B. It **must not** stop or restart production `ashley-discord.service` / `ashley-agent.service`.

`deploy/linux-mint/update.sh` stops those units. **Do not run it against the production checkout for Q4.**

Frozen isolated path:

- separate worktree/checkout of `CANDIDATE_SHA`;
- isolated data dir (`dataPlane.kind=isolated`); never live `nuclear.db` / production sidecar as write target;
- alternate agent port;
- `node` process or **temporary qualification units that do not replace live Ashley**;
- static review of `update.sh` plus rehearsal of equivalent build/start **in isolation**.

If true isolation cannot be achieved on that host: **Owner Gate Q4-HOST** before any disruptive rehearsal.

Prove: schema init/migration, isolated service start/restart, sidecar recovery, orphan recovery, outbox projector recovery, credentials/config **presence** without exposing secrets, Bubblewrap/Sandbox still loads, database path/permissions, isolated cutover/rollback rehearsal on copies.

Any build/tsc/test commands used in Q4 follow the repository-root command freeze (README).

Q4 is not a second live-model corpus.

**PASS iff:** isolated rehearsal script PASS.

HARD BLOCKER 10 if skipped or if production units were stopped without owner authorization.

---

## Q5 — Owner-authorized production shadow (Owner Gate B)

**Requires explicit Doc authorization.** Deploy/restart the **same SHA** with `ASHLEY_COGNITIVE_KERNEL=shadow`.

Legacy Ashley remains the only authority responding to Doc. Candidate:

- receives real ingress/evidence (mirrored; must not block ingress)
- writes only sidecar semantic state
- produces candidate settlements/drafts/traces
- **NEVER** sends candidate Discord replies (HARD BLOCKER 13)
- **NEVER** mutates legacy production semantic stores
- outbox projector **off**

Run a meaningful shadow window (not a single fixture). Treat **real shadow settlements** as high-value model-inhabitation evidence. Prefer real traffic + causal trace inspection over large artificial prompt suites.

The shadow window **ends** on whichever comes first: `SHADOW_MAX_DURATION`, `SHADOW_REAL_THOUGHT_MAX_CALLS`, `SHADOW_MAX_CYCLES`, sufficient evidence recorded, or hard failure. No unbounded mirror. Record `SHADOW_CALLS_USED`.

Candidate outbox must be `suppressed_shadow`. Zero sendable shadow rows at window end.

Legacy replies must still occur if sidecar ingress fails.

`artifacts/runtime/SHADOW_RESULT.md` + config hash.

HARD BLOCKER 11 if no owner auth. HARD BLOCKER 12 if no real shadow evidence.

After shadow: `git rev-parse HEAD` still `CANDIDATE_SHA`.

---

## Q6 — Final unchanged-SHA qualification

Re-run **Q1**. Confirm SHA unchanged.

**Do not** re-run the full Q3 live witness if occupant and Thought contract are unchanged. Q5 already spent real-model quota on genuine traffic.

If occupant or Thought contract changed after freeze: that is a **new candidate** (HARD BLOCKER 7) — not a Q6 extra suite.

**PASS iff:** `HEAD == CANDIDATE_SHA == QUALIFIED_SHA` after Q5, Q1 green, identity table complete.

Then Luna may **request** owner cutover authorization. Luna must not cut over.

---

## Architectural invariant audit (part of Q1)

Fail if: decide() as meaning on new kernel; Expression transcript; perception after Thought on new kernel; score-gated speech; easy bypass; honesty surgery; hybrid path reachable with `v021`; `thoughtCalls`/attempts confused with accepted generation; schema version ≠ 1; `withdrawal.active` identifier exists; `ThoughtOutput` union without steps.

---

## Autonomous repair

**Q1 / implementation:** diagnose → repair → deterministic regression → rerun phase/Q1. After freeze: repair means **new SHA**, new freeze, restart Q1–Q6. Do not patch in place and keep the old SHA.

**Q3 implementation-classified failure:** capture once → repair → Q1 fixture → smallest live family only. Never retry-storm.

**Q3 occupant-classified core-contract failure after implementation excluded:** HARD BLOCKER 9. Do not spend remaining quota “to be sure.”

Architectural contradiction: HARD BLOCKER 23.

---

## Result file

`docs/cognitive-rework/v0.2.1/artifacts/runtime/QUALIFICATION_RESULT.md`

```
RESULT: PASS | FAIL
QUALIFIED_SHA: <sha>
CANDIDATE_SHA: <sha>
selectedBaselineSha: <sha>
qualificationProtocolRevision: r4
...identity table...

ARCHITECTURE_CORPUS_RESULT: PASS | FAIL
EXACT_CANDIDATE_REVIEW_RESULT: PASS | FAIL
REAL_MODEL_WITNESS_RESULT: PASS | FAIL
ISOLATED_MINT_RESULT: PASS | FAIL
PRODUCTION_SHADOW_RESULT: PASS | FAIL
FINAL_UNCHANGED_SHA_RESULT: PASS | FAIL

REAL_MODEL_WITNESS_MAX_CALLS: <n>
REAL_MODEL_CALLS_USED: <n>
FALLBACK_SMOKE_MAX_CALLS: <n>
FALLBACK_CALLS_USED: <n>
SHADOW_MODEL_CALL_BUDGET: <n>
SHADOW_CALLS_USED: <n or UNKNOWN>
RETRIES_PREVENTED: <n>
W1–W10: PASS | FAIL | SKIPPED_* with reason
```

Phase 11 later adds `LIVE_WITNESS_RESULT` in `LIVE_EVIDENCE_REPORT.md`. It is not a Q1–Q6 field.
