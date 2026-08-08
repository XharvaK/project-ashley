# Wave 4 Kilo → OpenCode Handoff

**Generated:** 2026-08-08 (Kilo session, before handoff).
**Working tree is UNCOMMITTED and must be preserved.** OpenCode must NOT reset, stash, discard, or rebase the working tree.

---

## 1. Baseline

- **Starting HEAD:** `aec4015269420dc9d545882cecc83ff6cfd02dab` (clean `master` at plan start).
- **Current branch:** `master` (working tree dirty with uncommitted Wave 4 work).
- **Schema version:** v21. **Must stay v21** — no schema v22 is permitted under the scope lock.
- **Production status:** production Discord host = Linux Mint only; `masterMode` defaults to `observe`; no capability promoted; no live provider calls in qualification.
- **Waves 1/2/3 accepted invariants that must not regress:**
  - Wave 1: provenance `live`/`shadow` split is real; shadow artifacts must never gain behavioral authority pre-promotion.
  - Wave 2: behavioral materializers reject `shadow` provenance (this is exactly what Track E hardening enforces).
  - Wave 3: shadow Thought correlation is `same thread + consolidate_thread completed run + shadow provenance + source_end_message_id < currentUserMessageId(T) + nearest preceding eligible run`. Shadow execution may run in `observe`; live influence requires `active` state + dependency chain.

---

## 2. Current Working Tree

Modified:
- `apps/agent-service/src/core/agency/resolve-evidence.ts`
  - **why:** Track E production hardening (correction #5, owner-approved): added `AND provenance = 'live'` to the `case "episode"` branch of `resolveEvidenceRefs`.
  - **status:** COMPLETE (4 lines added).
  - **kind:** PRODUCTION code (approved, exempt from the defect-proven template).

Untracked directories/files:
- `apps/agent-service/src/core/qualification/` (entire dir)
  - **why:** all Wave 4 harness helpers + scenario/track test files.
  - **status:** COMPLETE for helpers; COMPLETE for most tests; a few tests have a known `tsc` error (see §7/§5).
  - **kind:** test/helper code.
- `docs/handoffs/wave-4-counterfactual-noninterference-report.md`
  - **why:** the Wave 4 qualification report (plan §6/Phase 6 deliverable).
  - **status:** PARTIAL / IN PROGRESS — sections populated through scenarios B and Track E; needs full scenario/track results + final verdict before completion.
  - **kind:** documentation.
- `.kilo/` (includes `.kilo/plans/1786192723913-wave-4-counterfactual-noninterference.md`, the approved plan)
  - **why:** Kilo tooling + the approved plan document.
  - **status:** reference only.
  - **kind:** tooling/documentation.

**Preserve the working tree. Do NOT `git checkout .`, `git stash`, `git clean -fd`, or `git reset --hard`.**

---

## 3. Wave 4 Plan Status

| Planned item | Status |
|---|---|
| State inventory (`state-inventory.ts`, allowlist-by-exclusion) | COMPLETE |
| Normalization rules (timestamps/UUIDs/ids → `<TS>`/`<UUID>`/`<LOCALID>`) | COMPLETE |
| `snapshotLiveBehavioralState` (= `snapshotLive`) + `expectLiveEquivalent` + first-difference reporting | COMPLETE |
| B-vs-B deterministic self-check (A′) | COMPLETE (wave4-baseline.test.ts) |
| Primary shadow ON vs unpumped OFF harness (`Fixture`/`runCounterfactual`) | COMPLETE |
| Secondary rollout-gate check (Fixture C: `recordCriticalFailure` → recall disabled → worker early-exit) | NOT STARTED (no `wave4-rollout-gate.test.ts`) |
| Easy baseline (scenario A) | COMPLETE |
| Prior-exchange cognition → hard Thought (B1/B2) | COMPLETE |
| Multiple hard turns / artifact creep (scenario C) | NOT STARTED (no dedicated test; B1/B2 exist separately) |
| Restart / persistence (file DB close+reopen) | COMPLETE (wave4-restart.test.ts) |
| Qualification accumulation → `promotionEligible=true` without activation | COMPLETE (wave4-qualification.test.ts) |
| `masterMode=apply` with capabilities `observe` | COMPLETE (wave4-master-apply.test.ts) |
| Provenance time-shift scenario | COMPLETE (wave4-time-shift.test.ts) |
| ContextComposer comparison | PARTIAL — live DB snapshot covers behavioral inputs; `expressionCapture` captures exact Expression `messages[]`; no separate `captureContextComposer` helper exists (harness limitation, documented). |
| Agency/Decision comparison | PARTIAL — covered via `decision_log` LIVE rows in `snapshotLive` + `expressionCapture`; no separate Decision object capture. |
| Expression input comparison | COMPLETE (exact `expressionCapture` equality asserted where used) |
| Live motivations | COMPLETE (covered via `motivations` LIVE table in `snapshotLive` + curiosity/relationship tests) |
| Learning/identity | COMPLETE (wave4-learning-identity.test.ts + Track R in latent-gaps) |
| Affect | COMPLETE (wave4-affect.test.ts) |
| Curiosity/reading | COMPLETE (wave4-curiosity.test.ts) |
| Relationship / identity review (Track R) | COMPLETE (wave4-relationship.test.ts + Track R in latent-gaps) |
| Proactive / own-time boundary | COMPLETE (wave4-proactive-boundary.test.ts) |
| Thread isolation | COMPLETE (wave4-thread-isolation.test.ts) |
| Failure paths | COMPLETE (wave4-failure-paths.test.ts: analyze throw, missing mind state, Thought throw, curiosity fetch fail) |
| Explicit promotion boundary (Phase 5 isolated) | NOT STARTED (no `wave4-promotion-boundary.test.ts`) |
| Final report | PARTIAL (report doc exists, needs full results + verdict) |

---

## 4. Investigation Tracks

### Track M — attention/model dispatch
- **findings:** M3 route-precedence proof = **NO DEFECT** (explicit `route:"thought"` wins over `purpose:"thought_observation"`; `resolveRoute` has no `thought_observation` entry so a purpose-only call throws rather than silently rerouting to `utility_bulk`). M1 wiring proof = NO DEFECT (shadow Thought wires `purpose:"thought"`, `lane:"interactive"`, `route:"thought"`, `attentionDb: undefined`). M4 quota-bucket isolation = NO DEFECT (groq vs mistral buckets differ). M5 model-continuity pre-promotion = NO DEFECT (no demotion fires pre-promotion). **M2 ledger A/B = DEFECT PROVEN**: a previously-enqueued shadow-Thought request (older `age_origin_at`, tier-0 `interactive`) preempts/delays the subsequent live Expression request in the global attention queue (`tryAdmitRequest` → `preempted`, live stays `queued`, `dispatch_sequence` shifts 1→2). Bounded: a shadow enqueued *after* the live request does not preempt.
- **tests written:** `wave4-attention-route-precedence.test.ts` (M3) + `wave4-attention-dispatch.test.ts` (M1/M2/M4/M5/M6) — 14 tests total, all passing.
- **current verdict:** M2 DEFECT PROVEN; M1/M3/M4/M5/M6 NO DEFECT.
- **defect proven:** YES (M2).
- **production code changed:** NO. The plan's pre-registered M-FIX (purpose `"thought_observation"` / lane `"exchange_cognition"` while **explicitly keeping `route:"thought"`**) is safe because M3 passed, BUT it is a production routing/attention-governance change and was **NOT applied** this session per the explicit "do not change routing" constraint. It remains an approved-but-deferred remediation (record it as a recommended production fix requiring separate owner authorization).

### Track R — identity_reviews
- **findings:** shadow-originated `identity_reviews` row: `ashley_position`/`doc_decision`/`applied_at` = NULL; `applyEligibleRevisions` returns `[]` (fail-closed); `allowShadow` without exact ids throws; with exact ids still `[]`; after a single owner-side `recordDocReviewDecision(approve)` still `[]` and no `identity_entries` change; `expectLiveEquivalent(on,off)` holds. Source guard confirms only `learning/revisions.ts`, `runtime.ts`, `db.ts` read `identity_reviews` — no ContextComposer/Agency/Decision/Expression reader.
- **tests written:** inside `wave4-latent-gaps.test.ts` (Track R block) + `wave4-relationship.test.ts`.
- **current verdict:** NO DEFECT / CONTROL_PLANE (review state, dual-owner-approval required to apply).
- **defect proven:** NO.
- **production code changed:** NO.

### Track E — episode evidence provenance
- **findings (COMPLETE):** regression now valid. `resolveEvidenceRefs` `case "episode"` requires `provenance='live'`; a manually-supplied SHADOW episode ref is dropped, a LIVE episode ref with identical shape is materialized.
- **fixture history / correction:** the first fixture passed `messageIds:[1,2]` for BOTH the shadow and live episodes → the `episodes` dedup key (`owner_id, thread_id, source_start_message_id, source_end_message_id`) collided and the "live" `createEpisode` call returned the existing SHADOW row, so the test falsely showed one row. The second attempt used `messageIds:[3,4]` for the live episode, which violated the `mem_messages` FK (only messages 1,2 existed from one `f.turn`) → `FOREIGN KEY constraint failed`. **Corrected fixture:** `beforeEach` does one `f.turn("hello")` (owner + thread1 + messages 1,2); the `it` block does a second `f.turn("world")` (thread2 + messages 3,4). Shadow episode = thread1 + `[1,2]` + `provenance:'shadow'`; live episode = thread2 + `[3,4]` + `provenance:'live'`. This gives a distinct dedup key AND valid FK message ids, correctly isolating provenance filtering.
- **exact production change:** `apps/agent-service/src/core/agency/resolve-evidence.ts` — added `AND provenance = 'live'` to the `case "episode"` SELECT (4 lines incl. comment). This is owner-approved correction #5 (Wave 2 consistency / defense-in-depth), exempt from the defect-proven template.

### Track C — episode consolidation watermark
- **findings (PROVEN):** `listUnconsolidatedMessages` computes `MAX(source_end_message_id) FROM episodes WHERE owner_id AND thread_id` with **no provenance filter**. A pre-promotion shadow episode covering messages `[1,2]` makes `listUnconsolidatedMessages` return only `[3,4]`, while `MAX(...) WHERE provenance='live'` is NULL. Post-promotion the first live `consolidate_thread` starts at 3, so `[1,2]` are **never re-consolidated with live (behavioral) authority** — a permanent, silent loss of live recall coverage caused purely by pre-promotion shadow execution (the provenance time-shift class Waves 1–4 exist to eliminate).
- **tests written:** `wave4-latent-gaps.test.ts` (Track C block) — pre-promotion A≡B passes; post-promotion asymmetry unit test on `listUnconsolidatedMessages` proves the divergence.
- **current verdict:** DEFECT PROVEN.
- **defect proven:** YES.
- **production code changed:** NO. Per correction #3, **FIRST REAL CAPABILITY PROMOTION = NO-GO** until fixed + regression-tested. Proposed minimal fix (NOT applied): add `AND provenance = 'live'` to the `MAX(source_end_message_id)` query in `memory/episodes.ts:listUnconsolidatedMessages`.

### Track P — revision dedupe across provenance
- **findings (PROVEN):** `proposeRevision`'s existing-row lookup matches on `(owner_id, target_layer, target_key, lower(proposed_value), status='proposed')` with **no provenance filter**. A shadow proposal followed by a live proposal (and a `WORTH DEFENDING` variant) all reuse the same row; exactly 1 row remains with `provenance='shadow'`, 0 `provenance='live'` rows; 3 evidence links (≥ opinion threshold 2) yet `applyEligibleRevisions(apply)` = `[]` and no `opinions` row. A live-only control (same shape) DOES apply — isolating provenance as the sole blocker.
- **tests written:** `wave4-latent-gaps.test.ts` (Track P block).
- **current verdict:** DEFECT PROVEN.
- **defect proven:** YES.
- **production code changed:** NO. Per correction #3, **FIRST REAL CAPABILITY PROMOTION = NO-GO** until fixed + regression-tested. Proposed minimal fix (NOT applied): add `AND provenance = ?` to the existing lookup in `learning/revisions.ts:proposeRevision`.

### Track F — forget receipt observability
- **findings:** real `/forget` path (`forgetOwnerTopicImmediate` + in-memory continuity lineage) under shadow ON reports `episodesForgotten`/`runsRedacted` > shadow OFF (=0) because `memory/forget.ts` counts `episodes`/`cognitive_runs` with no provenance filter. `messagesRedacted` and `factsReconciled` are equal, and `expectLiveEquivalent(on,off)` still holds after deletion — i.e., the difference is confined to the receipt string + `forget_receipts`/`episodes`/`cognitive_runs` counts (no LIVE behavioral state diverges).
- **tests written:** `wave4-latent-gaps.test.ts` (Track F block).
- **current verdict:** INTENTIONAL OBSERVABILITY EXCEPTION (correction #4) — not a behavioral divergence. Admin/diagnostic output truthfully reporting `SHADOW_ARTIFACT` state may differ and must be documented, not omitted.
- **defect proven:** NO (by design, documented exception).
- **production code changed:** NO.

---

## 5. Proven Defects and Production Changes

Only ONE production change was made during Wave 4, and it is an approved hardening (not a defect-driven fix):

### Track E (approved hardening, correction #5)
```
DEFECT PROVEN:            N/A — hardening, not a defect (exempt from template)
FAILING TEST:             apps/agent-service/src/core/qualification/wave4-track-e.test.ts
                          ("shadow episode ref is dropped; live episode ref materializes")
MINIMAL FIX:              resolve-evidence.ts case "episode": add `AND provenance = 'live'`
FILES:                    apps/agent-service/src/core/agency/resolve-evidence.ts (4 lines)
CURRENT TEST RESULT:      PASS (1/1)
WHY TEST-ONLY WAS INSUFFICIENT: N/A — applied under owner approval as Wave 2 consistency.
```

### Track C (defect proven, NOT fixed — first promotion NO-GO)
```
DEFECT PROVEN:            listUnconsolidatedMessages MAX(source_end_message_id) ignores provenance
                          -> post-promotion shadow era permanently blocks live re-consolidation of [1..N]
FAILING TEST:             wave4-latent-gaps.test.ts (Track C block)
MINIMAL FIX (proposed):   add `AND provenance = 'live'` to MAX(...) in memory/episodes.ts
FILES:                    (none changed)
CURRENT TEST RESULT:      PASS (proves the defect)
WHY TEST-ONLY WAS INSUFFICIENT: real production query defect; must be fixed in episodes.ts
```

### Track P (defect proven, NOT fixed — first promotion NO-GO)
```
DEFECT PROVEN:            proposeRevision existing-lookup ignores provenance -> live revision
                          can never be created; applyEligibleRevisions stays [].
FAILING TEST:             wave4-latent-gaps.test.ts (Track P block)
MINIMAL FIX (proposed):   add `AND provenance = ?` to the lookup in learning/revisions.ts
FILES:                    (none changed)
CURRENT TEST RESULT:      PASS (proves the defect)
WHY TEST-ONLY WAS INSUFFICIENT: real production query defect; must be fixed in revisions.ts
```

### Track M2 (defect proven, M-FIX approved-but-DEFERRED — not applied)
```
DEFECT PROVEN:            shadow-Thought request preempts/delays live Expression in global attention queue
FAILING TEST:             wave4-attention-dispatch.test.ts (M2)
MINIMAL FIX (pre-registered, approved by plan IF M3 passes — it did): change enqueueThoughtObservation
                          purpose "thought_observation" / lane "exchange_cognition" while KEEPING explicit
                          route:"thought" (router must honor explicit route over purpose-derived utility_bulk).
FILES:                    (none changed — deferred: not applied this session due to "do not change routing")
CURRENT TEST RESULT:      PASS (proves the defect)
WHY TEST-ONLY WAS INSUFFICIENT: production attention-admission defect; M-FIX is a production change.
```

No speculative/experimental production changes exist.

---

## 6. Tests Already Added

All under `apps/agent-service/src/core/qualification/`. Run result: **19 files, 51 tests, all PASS** (see §7).

| File | Tests | Invariant proved | Status |
|---|---|---|---|
| `state-inventory.ts` | (helper) | allowlist-by-exclusion table enumeration + normalizers | COMPLETE |
| `fake-clock.ts` | (helper) | deterministic fake clock (`toFake:["Date"]`) | COMPLETE (has 1 known `tsc` error, see §7) |
| `counterfactual-harness.ts` | (helper) | `Fixture`/`runCounterfactual`/`fakeAnalyze`/`pump`/`quiesce` | COMPLETE |
| `mistral-client-mock-state.ts` | (helper) | `makeFakeCompleteChat`, `expressionCapture`, `thoughtCapture`, `clearCaptures` | COMPLETE |
| `attention-dispatch-calls.ts` | (helper) | dispatch-call spy for Track M | COMPLETE |
| `wave4-baseline.test.ts` | 2 | scenario A (easy baseline) + self-check A′ (B run twice byte-identical) | PASS (has 2 known `tsc` errors, see §7) |
| `wave4-hard-turn.test.ts` | 3 | B1 boundary hard turn, B2 high-stakes hard turn, control (shadow OFF never enqueues Thought) | PASS |
| `wave4-track-e.test.ts` | 1 | Track E: shadow episode ref dropped, live materialized | PASS |
| `wave4-cognitive-jobs-guard.test.ts` | 2 | `cognitive_jobs` reader guard (executor/prune/owner-diagnostics only) | PASS |
| `wave4-inventory.test.ts` | 2 | every real table classified (no UNCLASSIFIED_TABLE) | PASS |
| `wave4-attention-route-precedence.test.ts` | 2 | Track M3: explicit `route:"thought"` wins over `thought_observation` | PASS |
| `wave4-attention-dispatch.test.ts` | 12 | Track M full (M1/M2/M4/M5/M6) | PASS |
| `wave4-latent-gaps.test.ts` | 7 | Tracks R/C/P/F | PASS |
| `wave4-restart.test.ts` | 1 | scenario D: restart/persistence, A≡B preserved | PASS |
| `wave4-qualification.test.ts` | 1 | scenario E: `promotionEligible=true` while `observe`/`effective=false`, A≡B | PASS |
| `wave4-master-apply.test.ts` | 1 | scenario F: `masterMode=apply` + all `observe` ⇒ no activation, A≡B | PASS |
| `wave4-time-shift.test.ts` | 1 | provenance time-shift: artifacts stay `shadow`/`inert` under apply | PASS |
| `wave4-thread-isolation.test.ts` | 1 | thread isolation: no cross-thread Thought/replay leak, A≡B | PASS |
| `wave4-curiosity.test.ts` | (PASS) | curiosity/reading inert, `cur_items`/`cur_sources` unchanged | PASS |
| `wave4-learning-identity.test.ts` | 1 | shadow revision persists, never auto-applies, survives apply/qualify | PASS |
| `wave4-affect.test.ts` | 2 | affect state/events unchanged under shadow | PASS |
| `wave4-relationship.test.ts` | 1 | relationship rows inert under shadow | PASS |
| `wave4-proactive-boundary.test.ts` | 1 | shadow cannot cross proactive/own-time boundary | PASS |
| `wave4-failure-paths.test.ts` | (PASS) | analyze/Thought throws, missing mind state, fetch fail ⇒ no credit, A≡B | PASS (has 1 known `tsc` error, see §7) |

---

## 7. Current Verification

**Focused Wave 4 command (run just now):**
```
cd apps/agent-service && npx vitest run src/core/qualification
```
**Result:** `Test Files 19 passed (19)` · `Tests 51 passed (51)` · Duration ~19s. ✅ GREEN.

**`tsc --noEmit` (run just now):** ❌ NOT clean — **4 errors**, all in Wave 4 files:
```
src/core/qualification/fake-clock.ts(21,39): error TS2322: Type '"Date.now"' is not assignable to type 'FakeMethod'.
src/core/qualification/wave4-baseline.test.ts(47,41): error TS2339: Property 'inboundId' does not exist on type '{ message: string; }'.
src/core/qualification/wave4-baseline.test.ts(48,41): error TS2339: Property 'inboundId' does not exist on type '{ message: string; }'.
src/core/qualification/wave4-failure-paths.test.ts(106,26): error TS2345: Analyze signature mismatch on injected analyze fn.
```
These are harness/test bugs, not production defects. They must be fixed before `npx tsc --noEmit` is declared clean:
- `fake-clock.ts:21` → `toFake: ["Date"]` (remove `"Date.now"`; faking `"Date"` also fakes `Date.now`).
- `wave4-baseline.test.ts:47-48` → type the script literal as `Script[]` (import `Script` from `./counterfactual-harness.js`) or add `inboundId?: string` to the literal.
- `wave4-failure-paths.test.ts:106` → align the injected `analyze` function signature with `Analyze` (it currently provides too few params).

**Broader results (last known, NOT re-run since the final test additions):** The full `npx vitest run` and `npm run phase0:offline` have NOT been re-run after the latest test additions + the 4 `tsc` errors. Mark as **FULL SUITE NOT YET RE-RUN**. The plan baseline was `72 files, 674 passed / 1 skipped` at HEAD `aec4015`; current qualification additions are green but the broader suite + `tsc` need a clean re-run after fixing the 4 errors above.

---

## 8. Important Architectural Discoveries

- **Primary unpumped-executor A/B seam:** `Fixture(shadow=true)` pumps `processNextCognitiveJob` after each turn; `Fixture(shadow=false)` never runs the worker. Verified true toggle: in production `createEpisode` is invoked to write episodes ONLY from `cognition/worker.ts`, and the reactive runtime's only shadow-episode reader is the single `getLatestShadowAnalysis` call in `runtime.ts`. So "worker never runs" ⇔ "no shadow episode" ⇔ "no shadow Thought enqueued".
- **Wave 3 T-1 → T correlation semantics:** shadow Thought fires iff a `cognitive_runs` row with `kind='consolidate_thread'`, `status='completed'`, joined `episodes.provenance='shadow'`, **same `thread_id`**, and `episodes.source_end_message_id < currentUserMessageId(T)`. Nearest preceding eligible run is used (NOT "episode includes current inbound message").
- **Attention dispatch side-effect concern (Track M2):** the attention queue is DB-global across quota buckets; a fire-and-forget shadow-Thought request enqueued (in `runtime.ts`) after the live Expression request of turn N can, because it is older (`age_origin_at`), preempt/delay turn N+1's live Expression. Fix path: relabel the Thought observation `purpose:"thought_observation"` / `lane:"exchange_cognition"` while KEEPING explicit `route:"thought"` (M3 proved the router honors explicit route).
- **purpose/lane vs explicit route="thought" concern (Track M3):** `resolveRoute` has no `thought_observation` entry; a purpose-only call throws rather than silently rerouting to `utility_bulk`. Therefore an explicit `route:"thought"` is authoritative — the M-FIX is safe (Wave 3's 120B production-equivalent Thought model preserved).
- **Track C future-promotion watermark issue (PROVEN):** `listUnconsolidatedMessages` ignores provenance on `MAX(source_end_message_id)` ⇒ post-promotion silent loss of live recall coverage. First promotion NO-GO until fixed.
- **Track P cross-provenance dedupe issue (PROVEN):** `proposeRevision` existing-lookup ignores provenance ⇒ a later live proposal reuses the shadow row, live revision never created, never applies. First promotion NO-GO until fixed.
- **Track F admin/observability exception:** `/forget` receipt counts include shadow artifacts truthfully; this is allowed divergence for explicit owner diagnostic/admin output, provided it cannot feed normal cognition.
- **Track E provenance hardening:** `resolveEvidenceRefs` `case "episode"` now requires `provenance='live'` (applied to production).
- **identity_reviews authority classification:** CONTROL_PLANE; shadow-originated reviews are fail-closed (dual owner approval required); never reach live behavior.
- **Deterministic clock / quiescence / process-global-state constraints:**
  - `vi.useFakeTimers({ toFake: ["Date"] })` freezes wall-clock so time-derived motivation decay / `enqueueCognitiveJob` windows are deterministic; real timers/microtasks stay real so fire-and-forget `enqueueThoughtObservation` + mocked `completeChat` resolve.
  - `quiesce()` polls for the expected `live_shadow` `capability_events` row / asserts `inFlightThoughtObservations` empty before snapshotting (the shadow DB write races the snapshot otherwise).
  - Process-global module state keyed by per-DB autoincrement ids (`inFlightThoughtObservations` by `decisionId`, delivery abort registry by reservation id) — run fixtures sequentially, always `await quiesce()`, never two shadow-ON fixtures concurrently in one file. The A′ null test doubles as the cross-fixture collision check.

---

## 9. Harness Invariants

- **Fake clock strategy:** `installFakeClock()` → `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(BASE_TIME)`; `advanceTurn(deltaMs = 60000)` between scripted turns; `nowMs()` returns the frozen current. (BUG: current code passes `"Date.now"` in `toFake` which is invalid — must be fixed.)
- **Quiescence strategy:** after each pumped turn, `await quiesce()` lets the fire-and-forget shadow Thought observation (incl. `recordLiveShadowEvent`) land before snapshotting.
- **Shared module/global-state hazards:** `inFlightThoughtObservations` and delivery abort registry are process-global, keyed by per-DB ids → sequential fixtures + `quiesce()`. `clearCaptures()` in `afterEach`. `armGroqKey()`/`restoreGroqKey()` toggle a fake key so shadow Thought fires in ON but OFF still never fires (worker never runs).
- **Normalization rules (already implemented in `state-inventory.ts`):** `created_at`/`updated_at`/`occurred_at`/`retrieved_at`/`queued_at`/`finalized_at` and other ISO timestamps → `"<TS>"`; `entity_uuid` and `randomUUID()`-derived ids → `"<UUID>"`; `local:<uuid>` inbound ids and `sim:<res>:<n>` receipt ids → `"<LOCALID>"`; durations/ms fields → dropped; autoincrement ids of excluded (shadow/control-plane) tables → dropped.
- **What MUST NOT be normalized:** any text/summary/stance/value/reason/objective; fact/opinion/question content; state values (`focus`, `mood`, `availability`, `unfinished`); motivation `kind`/`score`/`summary`/`refType`/`refId`; `provenance`; `capability_releases.state` + promotion/failure fields; identity text/layer/kind; relationship text/status; full ContextComposer `systemPrompt`/`memoryBlock`/`decisionPrompt`/`hotMessages`; every `Decision` field; full Expression `messages[]`; delivery bubble text/ordinals/state; proactive angle/reason/material_key.
- **mistral-client mocking / test-safety hazard:** `mistral-client.completeChat` does `options.attentionDb ?? openNuclearDb()` — with no arg this opens the REAL `~/.composer-assistant/conversations/nuclear.db`. Every Wave 4 test that can reach shadow Thought MUST `vi.mock("../../mistral-client.js")`. Never let a Wave 4 test reach real `completeChat`.
- **No network/provider calls:** all model interaction goes through the mocked `completeChat`; `thought-observation` analysis is injected via `processNextCognitiveJob(db, mode, fakeAnalyze)`.
- **File-backed restart semantics / continuity-sidecar limitation:** restart = `db.close()` + `openNuclearDb(new DatabaseSync(samePath))` + fresh `AshleyCore`. The continuity sidecar is an in-process in-memory DB re-associated by path, so continuity state does NOT truly round-trip — only nuclear.db persistence is exercised (documented limitation).

---

## 10. Immediate Next Actions for OpenCode

1. **Read this handoff and inspect the existing working tree before editing anything** (`git status`, read `docs/handoffs/wave-4-counterfactual-noninterference-report.md`, skim the qualification test files). Preserve the uncommitted tree.
2. **Fix the 4 `tsc` errors** (§7) so `npx tsc --noEmit` is clean: `fake-clock.ts:21`, `wave4-baseline.test.ts:47-48`, `wave4-failure-paths.test.ts:106`.
3. **Re-run the broader verification** after the fix: `npx tsc --noEmit`, then `npx vitest run`, then `npm run phase0:offline`. Confirm green and record exact numbers.
4. **Implement the missing scenario: Phase 3-C multiple hard-turn cycles (artifact-creep)** — add a test (e.g. extend `wave4-hard-turn.test.ts` or new `wave4-multiple-hard-turns.test.ts`) asserting several hard turns in one script produce shadow artifacts that stay `shadow` and the LIVE projection stays A≡B (no artifact creep into live tables).
5. **Implement the secondary rollout-gate test (`wave4-rollout-gate.test.ts`, Fixture C):** `recordCriticalFailure(db,"recall",…,"deletion_integrity",…)` ⇒ recall `disabled` ⇒ `capabilityCanExecuteShadow(recall)` false ⇒ worker early-exit (no episode); assert natural seam == production rollout gate on the live projection (`capability_releases`/`capability_events` differences named/excluded).
6. **Implement the explicit promotion boundary test (`wave4-promotion-boundary.test.ts`, Phase 5):** qualify `recall` (`recordIsolatedEvaluation` seeds≥3 + ≥25 `live_shadow` events spanning ≥7d at fixed `occurredAt`), assert pre-promotion A≡B, then `promoteCapability(db,"recall",{authorizedBy:"doc"})` ⇒ `operator_promote` event, set master `apply`, continue a turn, and assert the LIVE projection now DIVERGES (legitimate — proves the gate is real; a live episode with `provenance='live'` is created). NOTE: this is an offline demonstration only; it does NOT promote production. Given Tracks C/P are PROVEN, real first promotion remains NO-GO until those are fixed — record that in the report.
7. **Finalize `docs/handoffs/wave-4-counterfactual-noninterference-report.md`:** fill in the scenario results table (all of A/B/C/D/E/F/time-shift/thread/curiosity/learning/affect/relationship/proactive/failure/promotion/rollout), the full Track M/R/E/C/P/F final outcomes, the exact allowed differences, limitations, and the final PASS verdict — including the critical caveat that **pre-promotion Wave 4 qualification PASSES, but FIRST REAL CAPABILITY PROMOTION = NO-GO** until Track C and Track P defects are fixed + regression-tested (and Track M2's M-FIX is applied/authorized).
8. **Do NOT apply the Track C / Track P production fixes or the Track M2 M-FIX** unless explicitly authorized — they are proposed, not applied. The current uncommitted working tree is intentionally NOT promoted.

---

## 11. Safety / Scope

Current state confirmed:
- ✅ No deployment performed.
- ✅ No commit/push during Wave 4 (working tree intentionally uncommitted).
- ✅ No production capability promotion.
- ✅ No production `masterMode` change (only fixture-local `env.cognitionMode` flips, restored in `afterEach`).
- ✅ No live provider calls (mocked `mistral-client` only).
- ✅ Routing unchanged in production (Track M2 M-FIX is proposed-but-deferred, NOT applied).
- ✅ Sandbox unchanged.
- ✅ Schema v21 (no schema v22).

---

## 12. Handoff Readiness

HANDOFF TO OPENCODE: READY
