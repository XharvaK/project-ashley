# Wave 4 — Counterfactual Non-Interference Qualification (Plan)

**Repo:** `project-ashley` · **Base HEAD:** `aec4015` (clean, `master`) · **Schema:** v21 (must stay v21)
**Baseline verified at HEAD:** `npx tsc --noEmit` clean · `npx vitest run` = **72 files, 674 passed / 1 skipped**
**Type:** Offline source qualification. Tests + test helpers + one report doc. Production logic changes only on a *proven* defect.

**Status (2026-08-08):** PLAN APPROVED by owner. Five corrections applied — see §0.1. Implement incrementally; **write the Wave 4 report as work progresses** so context compaction cannot erase discoveries; run focused `vitest` after each phase.

### 0.1 Approved corrections (owner review)

1. **Wave 3 correlation wording fixed.** Shadow Thought fires on `same thread` + `consolidate_thread` completed run + `shadow` provenance + `source_end_message_id < currentUserMessageId(T)` + nearest preceding eligible run. Do **not** require "prior episode includes current inbound message" (would change Wave 3).
2. **Track M route-precedence gate.** Before any M-FIX, prove explicit `route:"thought"` stays authoritative when `attentionPurpose="thought_observation"` — router must not silently recompute to `utility_bulk`/20B (Wave 3 regression). If it overrides, choose an alternative minimal fix.
3. **Tracks C/P gravity raised.** If proven, pre-promotion Wave 4 may still PASS, but mark **FIRST REAL CAPABILITY PROMOTION = NO-GO** until fixed + regression-tested. Not a casual Wave 5 deferral.
4. **Invariant refined for admin outputs.** Normal behavioral outputs equivalent; explicit owner diagnostic/admin outputs truthfully reporting `SHADOW_ARTIFACT`/`CONTROL_PLANE` state (e.g. `/forget` counts) may differ as a documented observability exception, provided proven unable to feed normal cognition.
5. **Track E hardening approved.** Add `AND provenance='live'` to the episode evidence branch + fail-closed regression (inject an episode ref; shadow fails closed). Wave 2 consistency / defense-in-depth, exempt from the defect-proven template.

---

## 0. Scope lock (hard constraints)

Do NOT: deploy · promote production capabilities · change production `masterMode` · call live Mistral/Groq/NIM · touch provider routing tables · enable NIM/sandbox · run R5B · read secrets · perform real network fetches · introduce schema v22 · commit/push.

**Test-safety hazard (must be respected by every new test):**
`mistral-client.completeChat` does `options.attentionDb ?? openNuclearDb()` — with no arg this opens the **real** `~/.composer-assistant/conversations/nuclear.db`. `enqueueThoughtObservation` → `runThoughtModel` does **not** pass `attentionDb`. Therefore **every Wave 4 test file that can reach shadow Thought MUST `vi.mock("<path>/mistral-client.js")`** (or always inject `complete`). Never let a Wave 4 test reach real `completeChat`.

---

## 1. Formal invariant under test

For any execution prefix `P` of scripted owner inputs occurring strictly before an explicit authorized `promoteCapability` boundary:

```
LiveProjection(run(P, shadow=ON)) == LiveProjection(run(P, shadow=OFF))
```

`LiveProjection` = full nuclear DB row-set + ContextComposer output + Agency/Decision + model-visible Expression input, **minus** an explicitly enumerated, source-justified exclusion map covering only `SHADOW_ARTIFACT`, `CONTROL_PLANE`, `TELEMETRY`, `EPHEMERAL_SHADOW_EXECUTION_STATE`.

**Refined contract (correction #4 — approved):** the strict equality above holds for **normal behavioral interaction outputs** (anything that feeds ContextComposer, Agency, Decision, Expression, delivery, proactive eligibility, or normal cognition). It does **not** claim that *every* owner-facing string is identical. **Explicit owner diagnostic/administrative outputs that directly and truthfully report allowed `SHADOW_ARTIFACT` / `CONTROL_PLANE` state** (e.g. `/forget` deletion counts that include shadow episodes/runs) **may differ**, provided (a) the difference is documented as an observability exception, and (b) it is proven unable to feed normal cognition or behavior. `/forget` is therefore a documented observability exception, not an ignored counterexample — do NOT omit it and still claim "any execution prefix."

---

## 2. Harness design

### 2.1 Fixtures (PRIMARY — unpumped executor)

Both fixtures: same `AshleyCore`, same file-backed DB seeded identically, same scripted inputs, same fake models, same clock discipline.

| | Fixture A (shadow ON) | Fixture B (shadow OFF) |
|---|---|---|
| Cognition executor | `await pumpCognition(db)` → `processNextCognitiveJob(db, mode, fakeAnalyze)` drained after each scripted exchange | never invoked |
| env vars | untouched | untouched |
| capability state | untouched (all `observe`) | untouched (all `observe`) |
| Shadow Thought | fires (correlated shadow analysis exists) | never fires (`getLatestShadowAnalysis` [in `cognition/worker.ts`] → `null` ⇒ no `shadowContext` ⇒ `enqueueThoughtObservation` unreached) |

A/B variable = **execution of shadow cognition only**. `enqueueCognitiveJob` still runs identically in both (it is live scheduling, called from `delivery/finalize.ts`).

**Shadow-correlation precondition (must hold for the A fixture to actually exercise shadow Thought).** `getLatestShadowAnalysis` (in `cognition/worker.ts`) returns a shadow episode when **all** of: a `cognitive_runs` row with `kind='consolidate_thread'` and `status='completed'`; the joined `episodes` row has `provenance='shadow'`; **same `thread_id`** as the current turn; and `episodes.source_end_message_id < currentUserMessageId(T)` — i.e. the shadow episode is from a **completed exchange strictly preceding** the current inbound message. It returns the **nearest preceding eligible** such run (`ORDER BY source_end_message_id DESC LIMIT 1`). **Correction #1 (approved):** this is the exact Wave 3 correlation — it is **`source_end_message_id < currentUserMessageId(T)` on the same thread**, NOT a requirement that the prior episode's `message_ids` "include" the current inbound message. Do **not** implement or assert an "includes current inbound message" condition; that would subtly change Wave 3.

Therefore the harness must (a) preserve per-turn `message_id`s deterministically across the pump, and (b) for B1/B2, run the worker on the prior exchange (creating a shadow episode whose `source_end_message_id` is below the hard turn's inbound message id) **before** the hard turn's `handleReactiveChat`, so `getLatestShadowAnalysis` returns non-null and `enqueueThoughtObservation` actually fires. The harness asserts `thoughtCapture.length > 0` for the A fixture on B1/B2 as a precondition of the A≡B assertion — if Thought did not fire, the test is invalid, not a PASS. (Fixture B never runs the worker, so no shadow episode exists and Thought never fires; this is the intended suppression, not a vacuous pass.)

**Suppression soundness (verified).** In production, `createEpisode` is invoked to write episodes **only from `cognition/worker.ts`** (confirmed by repo-wide search; test files call it directly but are not in the live path). The reactive runtime's only shadow-episode reader is the single `getLatestShadowAnalysis` call in `runtime.ts`. Therefore "worker never runs" ⇔ "no shadow episode exists" ⇔ "no shadow Thought is enqueued" — the primary counterfactual is a true toggle, not a leaky approximation. Model the injected `analyze` after the existing `src/core/agency/shadow-chain.test.ts` correlation contract (analyze binds to the correct `threadId`/`messageId`, stale runs do not leak across turns/threads).

### 2.2 Fixture C (SECONDARY — real rollout gate, one scenario only)

`recordCriticalFailure(db, "recall", …, "deletion_integrity", …)` ⇒ `recall` `disabled` ⇒ `capabilityCanExecuteShadow(recall)` false ⇒ worker takes the `!recallCanInfluence && !recallShadowReady` early-exit (no episode). Purpose: prove **natural test seam result == production rollout gate result** on the live projection. Its `capability_releases.state` / `capability_events` differences are excluded and named explicitly; it is NOT the primary counterfactual.

### 2.3 Model injection (no network, exact input capture)

Single `vi.mock` of `src/mistral-client.js` per Wave 4 test file, exporting a deterministic `completeChat` that dispatches on `options.route` / `options.purpose`:

- `route: "ashley_expression"` → records `{messages, options}` into an `expressionCapture[]` and returns fixed text.
- `route: "thought"` → records into `thoughtCapture[]`, returns fixed valid Thought JSON.
- `route: "utility_bulk"` → worker path (only if a test lets `analyzeWithMistral` run; scenarios inject `analyze` directly instead).
- Anything else → throw (fail loud on unexpected provider use).

This captures the **exact model-visible Expression input** (system prompt incl. `## Capability self-model`, `## Activity license`, `## Affect license`; full history array; user content incl. `decisionPrompt`) with zero network and zero attention-ledger writes. Prefer this over `vi.mock("./conversation/expression.js")` (used by `runtime.test.ts`) because the latter hides the real prompt assembly.

Worker analysis is injected via the existing `analyze` parameter of `processNextCognitiveJob` (deterministic `CognitionAnalysis` fixtures with `SENTINEL_*` markers so leakage is greppable in any captured string).

### 2.4 Restart

File-backed DB in `tmpdir()` (pattern already used in `runtime.test.ts`). Restart = `db.close()`, then `openNuclearDb(new DatabaseSync(samePath))` + fresh `AshleyCore`. **Limitation to document:** the continuity sidecar is an in-process in-memory DB re-associated by path via `continuityByNuclearPath`, so continuity state does not truly round-trip; only nuclear.db persistence is exercised.

### 2.5 Determinism — the harness must be proven deterministic before it can prove A≡B

A counterfactual harness that is itself nondeterministic produces false PASS/FAIL. Lock the following:

- **Clock discipline.** Many live fields are time-derived: `internal_state` timestamps, `decision_log`/`motivations.created_at`, and critically **`opinions`-derived motivation `ageHours()` decay** feeds `collectMotivations`/`decide`/`listOpinions` ranking. Two A/B fixtures separated by wall-clock milliseconds will score differently → false divergence. Use **`vi.useFakeTimers({ toFake: ["Date"] })`** so `Date.now()` / `new Date()` are fixed (real `setTimeout`/promises/microtasks stay real — needed because `enqueueThoughtObservation` is fire-and-forget async and the mocked `mistral-client` resolves via microtasks). Advance the fake clock by a fixed `TURN_GAP_MS` (e.g. 60_000) **between scripted turns** so time-windowed dedup in `delivery/finalize.ts` (`claimReactiveDelivery`) does not collapse distinct turns into one. Verify no code path under test reads `performance.now()` for a behavior we compare.
- **Quiescence between turns.** `enqueueThoughtObservation` returns immediately; the `recordLiveShadowEvent` write lands later. After a scripted exchange, `await harness.quiesce()` that polls `capability_events` for the expected `live_shadow` event row (with timeout) — or asserts `inFlightThoughtObservations` is empty — before snapshotting. Without this the shadow DB write races the snapshot and is flaky.
- **Process-global module state is shared across fixtures in one file.** `capability_events` dedupe is per-DB (safe). But these live module-globally and are keyed by **per-DB autoincrement ids** that collide across fixtures: `inFlightThoughtObservations` (keyed by `decisionId`), the delivery abort registry (keyed by reservation id), and any in-memory `lastDecision`/`seenIds` caches. **Mitigation:** run fixtures sequentially within a file and always `await quiesce()` so the `inFlight` Set drains (it clears on `then`/`catch`); never run two shadow-ON fixtures concurrently in the same file. Document this as a harness invariant. The B-vs-B′ null test (§2.6) doubles as the cross-fixture collision check.
- **Seeding must be bit-for-bit identical** and not call any real async that lands a write after the seed completes. Seed, then `quiesce`, then snapshot the seed baseline so A and B have the same starting root.

### 2.6 Self-check: A′ (B run twice)

Run Fixture B (shadow OFF) twice with identical seed + script + fixed clock. Assert their **live projections are byte-identical**. This proves the harness has no hidden source of nondeterminism (clock, ordering, process-global state, RNG) before any A-vs-B conclusion is trusted. If A′ fails, the harness is invalid — fix it before interpreting A vs B.

---

## 3. Snapshot strategy — allowlist-by-exclusion, not include-list

`snapshotLiveBehavioralState(db)` must **enumerate every table from `sqlite_master`** and diff every row. A per-table / per-column **exclusion map** is the only way a value escapes comparison. Any table added later that is not in the map fails comparison by default. Separate helpers for diagnostics: `snapshotShadowArtifacts`, `snapshotControlPlane`, `snapshotTelemetry` — kept distinct, never merged into the live comparison.

Assertion helper reports the **first differing table / row / column** with values, so unexpected differences are investigable rather than silently ignorable.

---

## 4. Authoritative state classification (from traced downstream readers)

| Store | Behavioral reader (traced) | Class | Comparison rule |
|---|---|---|---|
| `internal_state` | `getState` → `mindStateBlock` (ContextComposer), `collectMotivations`, `decide` | LIVE | exact |
| `mem_messages` | `getHotMessages` → Expression history; `resolveEvidenceRefs` | LIVE | exact except `created_at`, `entity_uuid` |
| `mem_threads` | `resolveActiveThread` | LIVE | exact except timestamps |
| `mem_facts` | `listActiveFacts` (motivations), `resolveEvidenceRefs` | LIVE | exact |
| `opinions` | `listOpinions` (motivations), `resolveEvidenceRefs` | LIVE | exact |
| `questions` | `listOpenQuestions` (motivations, read ranking), `resolveEvidenceRefs` | LIVE | exact |
| `mind_state_items` | `listActiveMindStateItems` (gated) , `claimUrgentMindState`, `classifyInitiativeClass` | LIVE | exact |
| `affective_state` / `affective_events` | `getAffectiveState` → `mindStateBlock` (gated), `attachAffectLicense` | LIVE | exact |
| `identity_entries` | `stableIdentityBlock`, boundary motivations, `resolveEvidenceRefs` | LIVE | exact |
| `motivations` | `decide`, `logDecision`, reflection | LIVE | exact except `created_at` |
| `decision_log` | `setLastDecision`, reflection, delivery | LIVE | exact except timestamps + JSON timestamp fields |
| `delivery_*`, `initiative_reservations` | delivery/proactive machinery | LIVE | exact except ids-derived timestamps, `entity_uuid`, `sim:` receipt ids |
| `own_time_sessions` | `hasOpenOwnTimeSession`, own-time report | LIVE | exact |
| `reflection_events`, `initiative_learning` | `attachLearningSnapshot` → Decision | LIVE | exact |
| relationship tables (`doc_reminders`, `mutual_commitments`, `withdrawal_records`, …), `relationship_motivation_claims` | `listDueDocReminders`, `resolveEvidenceRefs`, repair/withdrawal gates | LIVE | exact |
| `perception_artifacts`, `conversational_reads` | `runPerceptionTurn` → licenses → Expression | LIVE | exact except ids/timestamps |
| `capability_releases.state / promoted_at / rolled_back_at / failure_*` | `capabilityCanInfluence`, `composeSelfCapabilityContext` (**reaches Expression system prompt**) | LIVE | exact (Fixture C excepted, named) |
| `capability_releases.eval_seed_count / qualified_at / model_epoch` | `promotionEligible` only (→ `promoteCapability`, status endpoints) | CONTROL_PLANE | may differ; assert coherence |
| `capability_events` | `eventWindow` → `promotionEligible` / status | CONTROL_PLANE | may differ; assert no failure path earns `live_shadow` |
| `episodes` (`provenance='shadow'`), `episodes_fts`, `episode_messages` | none pre-promotion (see Track E, Track C) | SHADOW_ARTIFACT | shadow subset may differ; `provenance='live'` subset exact |
| `learning_revisions` (`provenance='shadow'`) | `applyEligibleRevisions` requires `provenance='live'` | SHADOW_ARTIFACT | shadow subset may differ; assert `status='proposed'`, never `applied`; live subset exact |
| `identity_reviews` | Track R | CONTROL_PLANE (pending proof) | may differ; assert all rows point at shadow revisions and have `ashley_position/doc_decision/applied_at = NULL` |
| `evidence_links` | `evidenceStats` (live-provenance filtered) | mixed | links whose source is a live artifact: exact; shadow-sourced links may differ |
| `cur_reads/cur_takes/cur_source_candidates` (`provenance='shadow'`) | all materializers require `live` (Wave 2) | SHADOW_ARTIFACT | shadow subset may differ; live subset exact |
| `cur_items.status`, `cur_sources.last_fetched_*` | read-selection budget in `performGroundedReads` | LIVE-adjacent shared state | exact — curiosity ticks must be driven identically in A and B |
| `cognitive_jobs` (`status`) | `claimNextJob`, `pruneCognitiveHistory`, `getCognitionOverview` (owner endpoint), `getHealthSnapshot` pending count (health endpoint) | CONTROL_PLANE — **requires written proof** | `status`/`attempts`/`updated_at`/`last_error` excluded with justification; row identity (`owner_id,kind,source_key,payload_json,available_at`) compared exactly |
| `cognitive_runs` | `getLatestShadowAnalysis` (shadow-only), `getCognitionOverview`, forget receipts (Track F) | SHADOW_ARTIFACT | may differ |
| `attention_requests`, `attention_daily_usage`, `attention_dispatch_counter` | **Track M** | TBD | TBD |
| `model_continuity_state` / `_events` | `currentModelEpoch`, `demoteActiveSensitive` | **Track M** | TBD |
| `kv`, `cur_provenance`, sandbox/external/change-proposal tables | not written by shadow | LIVE (default) | exact |
| `forget_receipts` | written only by `/forget` (correction #4 observability exception) | OBSERVABILITY_EXCEPTION | exact in main A/B scripts; under explicit `/forget` the receipt count may differ (truthfully includes shadow artifacts) and is documented, not a behavioral divergence |

**`cognitive_jobs` justification to write into the report (do not hand-wave):** the only status readers are (a) the executor itself, (b) `pruneCognitiveHistory` (deletion of already-terminal rows), (c) `runtime.getCognitionOverview` — an owner-only `/nuclear/cognition` diagnostic endpoint, (d) `runtime.getHealthSnapshot` pending count — `/nuclear/health` diagnostic. None of (b)–(d) feed ContextComposer, Agency, Decision, Expression, delivery, or proactive eligibility. Task 4 must add a **guard test** asserting this reader set (grep-based or explicit call-site enumeration) so future readers break the classification loudly.

---

## 5. Normalization (documented, minimal)

Normalized (justification = value is generated per-run and carries no behavioral semantics):
`created_at` / `updated_at` / `occurred_at` / `retrieved_at` / `queued_at` / `finalized_at` and other ISO timestamps → `"<TS>"`; `entity_uuid` and any `randomUUID()`-derived id → stable per-fixture ordinal; `local:<uuid>` inbound ids and `sim:<res>:<n>` receipt ids → ordinal; durations/ms fields → dropped; autoincrement ids of excluded (shadow/control-plane) tables → dropped.

**Never normalized:** any text/summary/stance/value/reason/objective field · fact/opinion/question content · state values (`focus`, `mood`, `availability`, `unfinished`) · motivation `kind`/`score`/`summary`/`refType`/`refId` · `provenance` · `capability_releases.state` and promotion/failure fields · identity text/layer/kind · relationship text/status · full ContextComposer `systemPrompt`/`memoryBlock`/`decisionPrompt`/`hotMessages` · every `Decision` field · full Expression `messages[]` array · delivery bubble text/ordinals/state · proactive angle/reason/material_key.

Rule for implementation: **an unexpected diff is a finding, not an ignore-list entry.** Each exclusion entry in the map must carry an inline `reason:` string that is copied verbatim into the report.

---

## 6. Investigation tracks (run BEFORE declaring PASS)

Each track ends in one of: `NO DEFECT (documented)` / `DEFECT PROVEN (fix proposed via template)`.

### Track M — model-dispatch side effects (highest priority)

Traced facts at HEAD:
- `enqueueThoughtObservation` → `runThoughtModel` hard-codes `purpose: "thought"`, `lane: "interactive"`, `route: "thought"`, and passes **no `attentionDb`**.
- `completeChat` → `runAttentiveDispatch` → `insertQueuedRequest` (writes `attention_requests`), `tryAdmitRequest`, `completeRequest`, `applyModelContinuity`.
- `selectNextEligibleRequestId` is a **DB-global** queue across all quota buckets; `tryAdmitRequest` returns `preempted` unless the request is globally highest-priority. `compareAttentionPriority` tier 0 = `lane === "interactive"`.
- `attention/types.ts` already defines purpose `thought_observation` → lane `exchange_cognition` (tier 3), and `router.ts` maps it to `utility_bulk`. The worker correctly uses `exchange_cognition`; only the Thought observation does not.
- TPM/RPS are scoped per `quota_bucket` (`earliestLegalDispatchMs(..., bucket)`), so groq-thought vs mistral-expression do **not** share token budget.
- `attention_dispatch_counter.next_seq` is global; `applyModelContinuity` is per-alias, but a `resolved_change` calls `demoteActiveSensitive(db)` which demotes **all** model-sensitive active capabilities.

Tasks:
1. **M1 (wiring proof, no network):** inject a `Complete` into `enqueueThoughtObservation` that records `options`; assert `purpose === "thought"`, `lane === "interactive"`, `route === "thought"`, `attentionDb === undefined`.
2. **M2 (ledger A/B, no network):** deterministic `createFakeClock`. Control DB: enqueue one live-Expression request (`lane:"interactive"`, `purpose:"expression"`, mistral bucket) and admit. Variant DB: first enqueue a shadow-Thought request (`lane:"interactive"`, `purpose:"thought"`, groq bucket, earlier `age_origin_at`), then the identical live request. Compare `tryAdmitRequest` outcome + `dispatch_sequence` + `attention_requests` state for the live request. If the live request is `preempted`/delayed in the variant and not in the control ⇒ **defect proven**.
3. **M3 (route-precedence proof, correction #2 — approved):** repeat M2 with the shadow request re-labelled `purpose:"thought_observation"`, `lane:"exchange_cognition"`, **keeping explicit `route:"thought"`**. Assert (a) the live request is unaffected (validates the fix) AND (b) — critically — that `runAttentiveDispatch` / `router.ts` honors the **explicit `route:"thought"`** and does **NOT** silently recompute the route to `utility_bulk`/`20B` (which would regress Wave 3's production-equivalent 120B Thought model). Inspect `router.ts` precedence: if it derives route from `purpose` only when `route` is absent/undefined, explicit `route` wins and the M-FIX is safe; if it overrides an explicit `route` from `purpose`, the M-FIX is **unsafe** and an alternative minimal solution is required (e.g. keep `purpose:"thought"` and instead only lower the `lane`/`age` priority, or add an explicit `route` passthrough that the router must respect). This precedence proof is a **hard gate** before any M-FIX ships.
4. **M4:** confirm quota buckets differ (no shared TPM/RPS) and record it as NO DEFECT.
5. **M5:** `applyModelContinuity` + `demoteActiveSensitive`: assert that pre-promotion (nothing active) a shadow-driven `resolved_change` demotes nothing; document the post-promotion conservative-demotion coupling as an architectural note, not a defect.
6. **M6:** document the `openNuclearDb()` default-path attention DB as a correctness/robustness note (production same-file; test hazard) — no fix proposed unless M2 forces one.

### Track R — `identity_reviews` authority

Traced: `proposeRevision` inserts an `identity_reviews` row for foundational keys (`value.*` / `boundary.*` on `stable_identity`) **regardless of provenance**; `revision_id` is `UNIQUE` + FK, so no cross-talk with a live revision. `applyEligibleRevisions` reads the review and requires `ashley_position='affirm' && doc_decision='approve'` — an unapproved row **blocks** (fail-closed). Readers: `listIdentityReviews` → owner-only `/nuclear/identity/reviews`, `/identity` slash command.
Task: prove by test that a shadow-originated `identity_reviews` row (a) never reaches ContextComposer/Agency/Decision/Expression, (b) cannot be applied without both owner-side fields, (c) does not alter the live snapshot. Expected outcome: **CONTROL_PLANE / REVIEW_STATE, NO DEFECT.**

### Track E — `resolve-evidence.ts` `case "episode"` provenance (APPROVED hardening, correction #5)

Traced: the episode branch selects on `id/owner_id/status='active'` with **no `provenance` filter**, unlike `case "take"` (which requires `provenance='live'`). Reachability: `decision.evidenceRefs` come only from motivations (`decide.ts`) or own-time takes; **no code path creates a motivation with `refType:"episode"`**; `composeTurnContext(input.evidenceRefs)` is never populated by `runtime.ts`. `attachAffectLicense` does build `{type:"episode"}` but writes it to `affectLicense.source`, which is not consumed by `resolveEvidenceRefs`; and `affect` active ⇒ `recall` active (dependency chain) ⇒ that episode is `live`.
**Approved (correction #5):** apply the one-line `AND provenance = 'live'` hardening to the episode branch regardless of current reachability — this is Wave 2 consistency / defense-in-depth, making the architectural invariant locally true ("behavioral materializers reject shadow provenance") rather than relying on "nobody points at it today." Add (a) a reachability guard test, and (b) a fail-closed regression that **manually supplies an episode evidence ref** and proves a shadow episode is NOT materialized while a live episode is. Frame in the report as consistency hardening, **not** evidence of a currently reachable exploit. This is the smallest safe expression of the Wave 2 invariant and is exempt from the "defect proven" template (it is hardening, applied under approval).

### Track C — episode consolidation watermark (PROVEN ⇒ promotion NO-GO, correction #3)

Traced: `listUnconsolidatedMessages` uses `MAX(source_end_message_id) FROM episodes WHERE owner_id AND thread_id` with **no provenance filter**. Pre-promotion this is shadow-internal (invariant holds). Post-promotion, messages already covered by a shadow episode can **never** be consolidated into a live episode ⇒ silent, permanent loss of live recall coverage caused purely by pre-promotion shadow execution.
Task: A/B test proving pre-promotion equivalence, plus an explicit post-promotion test demonstrating the watermark effect. **If proven (correction #3):** Wave 4's pre-promotion invariant may still PASS, but mark **FIRST REAL CAPABILITY PROMOTION = NO-GO** until this defect is fixed and regression-tested. Do **not** casually defer beyond rollout — this is exactly the provenance time-shift class Waves 1–4 exist to eliminate. Report a proposed minimal fix under the template.

### Track P — `proposeRevision` dedupe across provenance (PROVEN ⇒ promotion NO-GO, correction #3)

Traced: the `existing` lookup matches on `(owner, layer, key, lower(value), status='proposed')` with **no provenance filter**, so a later live proposal reuses the shadow row and never creates a `provenance='live'` row ⇒ the legitimate live revision can never apply.
Task: prove/disprove by test (pre-promotion equivalence + post-promotion asymmetry). **If proven (correction #3):** Wave 4's pre-promotion invariant may still PASS, but mark **FIRST REAL CAPABILITY PROMOTION = NO-GO** until fixed and regression-tested. Do **not** casually defer beyond rollout — provenance time-shift on learning authority is exactly the class Waves 1–4 exist to eliminate. Report a proposed minimal fix under the template.

### Track F — forget receipts count shadow artifacts (OBSERVABILITY EXCEPTION, correction #4)

Traced: `memory/forget.ts` integrity checks and receipts count `episodes` and `cognitive_runs` with no provenance filter ⇒ a `/forget` receipt reports different numbers under shadow ON.
**Refined (correction #4):** this does **not** contradict the invariant — it is a **documented observability exception**. Normal behavioral outputs remain equivalent. An explicit `/forget` receipt that truthfully reports "deleted N internal artifacts" (including shadow artifacts) is an administrative output directly reporting allowed `SHADOW_ARTIFACT` state, which may differ provided it cannot feed normal cognition. Task: **include** a dedicated `/forget` boundary test (do NOT merely omit it) asserting (a) the receipt-count difference occurs, (b) it is confined to the receipt string and the underlying `forget_receipts`/`episodes`/`cognitive_runs` counts (no live behavioral state diverges), and (c) the difference is documented in the report as an intentional observability exception — not hidden.

### Production-change template (mandatory for every proposed prod edit)

```
DEFECT PROVEN:            <exact path + observed divergence>
FAILING TEST:             <file::test name, added first, red before fix>
MINIMAL FIX:              <smallest diff>
WHY TEST-ONLY IS INSUFFICIENT: <why the harness cannot bound it>
```

Pre-registered candidate (do **not** apply unless M2 goes red AND M3 precedence proof passes):
- *Candidate M-FIX:* add optional `attentionPurpose` / `attentionLane` to `ThoughtModelOptions`, defaulting to today's `"thought"` / `"interactive"`; `enqueueThoughtObservation` passes `"thought_observation"` / `"exchange_cognition"` while **explicitly passing `route:"thought"`**. Route stays `"thought"`, prompt/serialization/parser/model function unchanged ⇒ Wave 3 production-equivalence preserved; only the attention-governance label changes. Not a routing redesign. **Hard gate (correction #2):** ship only after M3 proves an explicit `route:"thought"` is authoritative over the `thought_observation`→`utility_bulk` router mapping. If it is not, do NOT apply this candidate; choose the alternative minimal solution from M3.

---

## 7. Ordered task list

**Phase 1 — inventory & helpers**
1. `src/core/qualification/state-inventory.ts` (test helper): table enumeration from `sqlite_master`, exclusion map with `reason:` per entry, normalizers.
2. `snapshotLiveBehavioralState` / `snapshotShadowArtifacts` / `snapshotControlPlane` / `snapshotTelemetry` + `expectLiveEquivalent(a,b)` with first-difference reporting.
3. `cognitive_jobs` reader-guard test (section 4 justification).
4. `src/core/qualification/fake-clock.ts`: `vi.useFakeTimers({ toFake:["Date"] })` wrapper + `advanceTurn()` advancing by `TURN_GAP_MS`; document that real timers/microtasks stay real. Used by every Wave 4 file's `beforeEach`/`afterEach`.

**Phase 2 — harness**
5. `src/core/qualification/counterfactual-harness.ts`: `createFixture({ shadow: "on"|"off", dbPath })`, scripted-turn driver over `AshleyCore.handleReactiveChat` (advances fake clock between turns), `pumpCognition`, `expressionCapture`/`thoughtCapture`, `captureContextComposer`, `captureDecision`, deterministic `CognitionAnalysis` fixtures with `SENTINEL_*` markers, `quiesce()` (poll `capability_events` for pending `live_shadow` event / assert `inFlightThoughtObservations` empty), `seedRoot()` (identical bit-for-bit seed + quiesce), `runCounterfactual(script)` returning both projections, and `runControlTwice(script)` for the §2.6 self-check.
6. `mistral-client` mock module shared by all Wave 4 files.

**Phase 3 — scenarios** (`src/core/qualification/wave4-*.test.ts`)
6. **A** easy baseline (multi-turn, complexity `easy` ⇒ no shadow Thought) — validates harness correctness.
7. **B1** prior-exchange cognition → hard turn via a **boundary-relevant** message (`isBoundaryRelevant` lexical/ CUE match on the seeded `seed.ts` boundary) → exercises `applicable_refusal_candidate` + `effort:"high"` (`allocateEffort` `relevantRefusal` branch). Asserts shadow Thought fired (capture present) yet live projection ≡ B.
8. **B2** hard turn via a **high-stakes** message (e.g. contains `password`/`api key` matching `HIGH_STAKES_RE`) → exercises `high_stakes_safety` + `effort:"high"` (`allocateEffort` `HIGH_STAKES_RE` branch), no boundary needed. Asserts live projection ≡ B.
9. **C** multiple hard-turn cycles (artifact-creep detection), mixing B1/B2 seeds.
10. **D** restart/persistence (file DB close + reopen + continue).
11. **E** qualification accumulation to `promotionEligible=true` while `state='observe'`, `effective=false`; continue turns; assert live equivalence + status coherence (`shadowExecutable`, `shadowDependenciesReady`, `influenceDependenciesReady`, `promotionEligible`, `effective`) and that no status read mutates (snapshot before/after `listCapabilityStatuses`, accounting for `ensureRelease` row creation which must be identical in both fixtures).
12. **F** `masterMode='apply'` (fixture-local `env.cognitionMode`, restored in `finally`) with all capabilities `observe`; no promotion; live equivalence.
13. **Time-shift** scenario (§11 of brief): create shadow episode + revision + read + take + source candidate, accumulate qualification, `apply` master, keep observe, continue turns; assert every artifact still `provenance='shadow'` and inert.
14. **Thread isolation**: same owner, threads A/B with distinct `R_A/M_A`, `R_B/M_B`; assert `Thought(A)` never sees B sentinels in the captured Thought input and vice-versa; plus no cross-thread live-state change.
15. **Curiosity/reading**: injected deterministic `fetcher`/`resolve` only; shadow reads/takes/candidates; assert live motivations, authorized claims, probation, and active-source state unchanged; drive ticks identically in A and B so `cur_items.status` matches.
16. **Learning/identity**: shadow revision persists, never auto-applies, survives restart / master `apply` / `promotionEligible` without gaining authority; owner exact-item exception **not** invoked here.
17. **Affect**: multiple shadow cycles with affect output; `affective_state` identical.
18. **Relationship/identity governance**: Track R assertions.
19. **Proactive/own-time boundary**: focused deterministic tests that shadow cognition cannot newly trigger proactive delivery, urgent relational wake, or own-time claim while capabilities are `observe` (no scheduler redesign).
20. **Failure paths**: worker/Recall analyze throws · missing Mind State shadow result · Thought fake throws (assert no `live_shadow` credit, in-flight dedup cleared, live Decision unchanged, retry semantics intact) · curiosity fake fetch fails. Each asserts live equivalence + no false qualification credit.
21. **Secondary rollout-gate scenario** (Fixture C) — natural seam vs production gate agreement.
22. **Self-check A′** (`runControlTwice`): Fixture B run twice → live projections byte-identical. Gate all A-vs-B conclusions on this passing.

**Phase 4 — investigation tracks**
23. Track M (M1–M6), Track R, Track E, Track C, Track P, Track F.

**Phase 5 — explicit promotion boundary (isolated)**
24. Smallest deterministic capability: qualify `recall` (`recordIsolatedEvaluation` seeds≥3 + 25 `live_shadow` events spanning ≥7d at fixed `occurredAt`) ⇒ verify pre-promotion equivalence ⇒ `promoteCapability(db,"recall",{authorizedBy:"doc"})` ⇒ assert `operator_promote` event with `authorizedBy` ⇒ set master `apply` ⇒ next `consolidate_thread` creates `provenance='live'` episode ⇒ demonstrate legitimate divergence. **Stronger variant (if `mind_state` qualifies without model-epoch coupling):** also promote `mind_state` (deps `recall` already active) ⇒ `composeSelfCapabilityContext` + `stableIdentityBlock` + `mindStateBlock` now reach the Expression system prompt ⇒ assert the `## Mind state` block is present in the promoted fixture's captured Expression system prompt and absent in the control — the decisive "the gate is real" proof. Isolated fixture; no live provider; no production state.

**Phase 6 — report & verification**
25. `docs/handoffs/wave-4-counterfactual-noninterference-report.md` in the Wave 2 gate-packet style: invariant · classification table · harness · normalization (every exclusion + reason) · every scenario result · exact allowed differences · findings/fixes · test counts · limitations. Title it offline/source qualification, never production qualification.
24. Verify: focused `npx vitest run src/core/qualification` → then `npx tsc --noEmit` → `npx vitest run` → `npm run phase0:offline`.

---

## 8. Expected files

**New (tests/helpers):**
`src/core/qualification/state-inventory.ts`, `fake-clock.ts`, `counterfactual-harness.ts`, `fake-models.ts`,
`wave4-baseline.test.ts`, `wave4-hard-turn.test.ts`, `wave4-restart.test.ts`, `wave4-qualification.test.ts`, `wave4-master-apply.test.ts`, `wave4-time-shift.test.ts`, `wave4-thread-isolation.test.ts`, `wave4-curiosity.test.ts`, `wave4-learning-identity.test.ts`, `wave4-affect.test.ts`, `wave4-relationship.test.ts`, `wave4-proactive-boundary.test.ts`, `wave4-failure-paths.test.ts`, `wave4-attention-dispatch.test.ts` (Track M), `wave4-latent-gaps.test.ts` (Tracks C/E/P/F), `wave4-promotion-boundary.test.ts`, `wave4-rollout-gate.test.ts`.

**New (docs):** `docs/handoffs/wave-4-counterfactual-noninterference-report.md`.

**Production (only if a track goes red, each under the template):** `src/core/agency/thought.ts` + `src/core/agency/thought-observation.ts` (M-FIX) · `src/core/agency/resolve-evidence.ts` (Track E) · `src/core/memory/episodes.ts` (Track C) · `src/core/learning/revisions.ts` (Track P). `AGENTS.md` note only if production behavior changes.

---

## 9. Decision gates for the implementer (do not decide silently)

1. **M2 red?** → apply M-FIX under the template and re-run M3 as the regression. **M2 green?** → record NO DEFECT with the ledger evidence.
2. **Track E** hardening (`AND provenance='live'` on the episode branch) is **APPROVED (correction #5)** as Wave 2 consistency / defense-in-depth. Apply it with a passing fail-closed regression (manually inject an episode evidence ref; prove shadow episode fails closed). Frame as hardening, not a reachable-exploit fix. Exempt from the defect-proven template.
3. **Tracks C and P (correction #3):** if either is **proven**, Wave 4's PRE-PROMOTION invariant may still PASS, but mark **FIRST REAL CAPABILITY PROMOTION = NO-GO** until the defect is fixed and regression-tested. These are provenance time-shift defects of exactly the class Waves 1–4 exist to eliminate — do **not** casually defer beyond rollout. Report proposed minimal fixes under the template.
4. **Track F** receipt-count difference: report, do not suppress.
5. If any track requires a schema change: **STOP and report** (v21 must not move).

---

## 10. PASS criteria

PASS only if, for every pre-promotion scenario: full live DB projection · ContextComposer output · Agency/Decision · model-visible Expression input · live motivations · live affect · learning/identity · relationship/commitments are all equivalent; thread isolation, restart, qualification-without-activation, master-apply-without-activation, and all four failure paths hold; Waves 1/2/3 regressions green; and every difference is confined to the documented `SHADOW_ARTIFACT` / `CONTROL_PLANE` / `TELEMETRY` / `EPHEMERAL_SHADOW_EXECUTION_STATE` exclusion entries with a stated reason. Otherwise FAIL.

---

## 11. Known limitations to state in the report

- Continuity sidecar does not truly persist across the simulated restart (in-process path registry).
- With `mistral-client` mocked, the E2E harness never exercises `runAttentiveDispatch`; attention interference is covered only by the Track M ledger-level tests.
- Shadow analysis content is injected, not model-generated — the qualification covers the *plumbing* of non-interference, not model output distribution.
- `recordIsolatedEvaluation` / `recordLiveShadowEvent` with synthetic `occurredAt` compress the 7-day span requirement; real-time accrual is not exercised.
- `ensureRelease` lazily inserts `capability_releases` rows on read; both fixtures must call the same predicates or that row-set will legitimately differ.
- Offline source qualification only. Not production qualification. No deployment, promotion, or activation is performed or recommended by this plan.
