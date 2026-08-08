# Rollout Execution vs Influence — Read-Only Audit

Audit of Project Ashley's capability rollout architecture: separation of
EXECUTION from INFLUENCE, observe-mode write/read behavior, the "stepping on
toes" regression, and auto-promotion semantics.

- Head: `c90425380212e20d1e97d0de100095a318237972` (clean)
- Scope: `apps/agent-service/src` — read-only. No code, schema, or state changes.
- Proven facts cite `file:line`. "Hypothesis" means not yet verified (needs
  production data or a live repro, which were out of scope).

---

## 1. Executive diagnosis

| Question | Verdict | Evidence |
|---|---|---|
| Is execution separated from influence? | **PARTIALLY** — influence gates exist and hold (Thought/refusal/affect/takes/mind-items/revisions/facts/own-time report/external actions), but observe mode executes the full cognition pipeline and persists influence-laden state (episodes, revision proposals, takes, source candidates, reads). | worker.ts:311-351, consolidate.ts:147-210, reads.ts:225-261 |
| Is `dependenciesReady` an execution gate? | **NO** — it is an activation gate; a dependency counts as ready only when already `active` (capabilities.ts:184-192). Execution-readiness and activation are conflated. | capabilities.ts:184-192 |
| Is observe "record only"? | **NO** — observe executes everything (network reads, consolidation model calls) and writes state; it only blocks influence (claims/licensing/application). | reads.ts:225-261, consolidate.ts:114-156 |
| Is auto-promotion operator-authorized? | **NO** — promotion is fully autonomous once thresholds are met; it runs as a side effect of `capabilityCanInfluence`, status listing, and event recording. | capabilities.ts:235-302, 371, 393, 471, 547 |
| Was "stepping on toes" produced by a capability leak? | **NO evidence of a capability-path leak.** The only confirmed channel for the phrase into Expression is the hot-conversation window, which includes Ashley's own prior messages verbatim (threads.ts:146-164, assemble.ts:48-58) — an echo channel, not a capability gate. Source of the original phrase needs prod data. | grep over src + workspace: zero matches; threads.ts:146-164 |

---

## 2. Capability registry, dependency graph, release semantics

Registry: `core/rollout/capabilities.ts:30-52` (20 capabilities, V3 contract).
Dependency map: `capabilities.ts:55-69`.

```
recall                      → []
mind_state                  → [recall]
affect                      → [recall]
thought                     → [recall, mind_state]
learning                    → [recall]
refusal                     → [thought]
relational_initiative       → [mind_state, thought]
relationship_state          → [mind_state, thought]
reading                     → []
curiosity_consolidation     → [reading]
source_discovery            → [reading]
own_time_report             → [thought, curiosity_consolidation]
vision                      → [thought]            (perception registry)
attachment_text             → [thought]            (perception registry)
conversational_read         → [reading, thought]   (perception registry)
web_search                  → [thought]            (perception registry)
external_observe            → [thought]
external_prepare            → [external_observe]
external_private            → [external_prepare, thought]
external_public             → [external_prepare, thought]
```

Model-sensitive (epoch-guarded, demoted on provider model change):
`thought, learning, reading, curiosity_consolidation, source_discovery,
own_time_report, affect, relational_initiative, vision, conversational_read,
web_search` (contract-material.ts:50-55; demote at governor.ts:70-79).

Release state machine (`capability_releases.state`, db.ts MIGRATION_6:521-537):
`observe → active → rolled_back | disabled` (observe is both the initial state
and the state re-entered on demotion).

Effective gate (`listCapabilityStatuses`, capabilities.ts:508-512):

```
effective = !contractMismatch
         && masterMode === "apply"
         && state === "active"
         && dependenciesReady      // every dep must be "active"
```

`capabilityCanInfluence` (capabilities.ts:539-550) is the same gate and **calls
`refreshCapabilityPromotions` as a side effect** (line 547) — checking
influence can promote. The perception registry mirrors the same semantics with
`perceptionCapabilityCanInfluence` (perception/capability-self-model.ts:69-82),
and relationship with `relationshipCanInfluence`/`relationshipCanRecord`
(relationship/influence.ts).

### Rollout graph shape

The activation-ladder `dependenciesReady` forces a strict serialization:
recall → mind_state → thought → (refusal, relational_initiative,
relationship_state, own_time_report, vision, attachment_text, web_search,
external_*); reading → curiosity_consolidation → source_discovery;
conversational_read needs both chains. In an all-observe deployment nothing can
ever become `active`, and a partially active deployment forces every dependent
capability to be activated in lockstep regardless of its own evidence.

---

## 3. Execution vs influence separation — per subsystem

Legend: **E** = execution (side effects, model calls, network, writes),
**I** = influence (claims, licenses, motivation/context inclusion, applied state).
"gate" = `capabilityCanInfluence(cap)`.

| Subsystem | Observe-mode behavior | Gate type |
|---|---|---|
| Thought (`agency/thought.ts`) | `deliberateDecision` returns deterministic base; no model call. Reactive: `allowModelThought: thoughtCanInfluence` (runtime.ts:651-667); proactive: `allowModelThought: true` but internal `canInfluence(db)` gate still applies (thought.ts:118-133). | I (holds) |
| Refusal (`thought.ts:219-225`) | `canRefuse` = `capabilityCanInfluence("refusal")` — refusal path gated. | I (holds) |
| Thought shadow (`agency/thought-observation.ts`) | Runs only on hard turns when Thought not influential (runtime.ts:821-832); writes only `capability_events` (control plane). | E shadow, control-plane only |
| Cognition worker (`cognition/worker.ts`) | **E runs unconditionally**: episode creation (311), revision proposals (341-351), live-shadow events (321-340), `cognitive_runs` log (423). **I gated**: facts/mind items/affect/mutual commitments/revision application inside `mode === "apply"` (352-422) with per-capability `canInfluence` checks. | E uncond, I gated |
| Curiosity tick (`curiosity/tick.ts`) | **E uncond**: source scans + `performGroundedReads` (155) — network fetches with evidence excerpts. **I gated**: `processSourceProbation` (158). | E uncond, I gated |
| Curiosity consolidation (`curiosity/consolidate.ts`) | **E uncond**: model call (114-143), `insertTake` (147-156), source candidates (194-210). **I gated** (`allowInfluence`): revision proposals + `createQuestion` (157-193). | E uncond, I gated |
| Learning (`learning/revisions.ts`) | `proposeRevision` uncond (from worker). `applyEligibleRevisions` gated **only by mode** (line 235), not by the `learning` capability — also reachable from the owner-authorized identity-review flow (runtime.ts). | E uncond, apply mode-gated |
| Reading (`curiosity/reads.ts`) | **E uncond**: fetch up to 10+2/day, `cur_reads` with evidence excerpts (225-261). | E uncond, I gated |
| Motivations (`agency/motivations.ts`) | Uncond reads: questions (142), facts (163), opinions (185), unfinished (221), availability (276). Gated: takes (194-196: reading AND curiosity_consolidation), mind items (242), reminders (346: relationship_state+relational_initiative). | R mix |
| Context composer (`context-composer.ts`) | Uncond: focus/mood/availability/unfinished (70-75), stable identity (42-59), hot messages (assemble.ts:48-58). Gated: mind items (66), affect line (80-82). | R mix |
| Perception (`perception/index.ts`, `preflight.ts`) | **E uncond (metadata only)**: `createPendingArtifacts` (193), `createPendingRead` + authorization (211-229). **E gated (fetch)**: artifact fetch via preflight — requires vision/attachment_text influential AND master apply (preflight.ts:56-91); conversational fetch requires conversational_read influential AND apply (272-312). | E gated on I (!), I gated |
| External agency (`external-agency/policy.ts`) | `evaluateExternalActionPolicy` maps risk class → capability, gated by `capabilityCanInfluence`; `docDecisionAuthorizesExternalDispatch` returns false. | I (holds) |
| Own-time report (`agency/own-time-report.ts:394,439`, `decide.ts:226`) | `canInfluence` flag false in observe; `decide()` applies the constraint only when true; observe records only live-shadow events. | I (holds) |
| Reflection/initiative (`reflection/initiative.ts`) | Learning applied only when `mode === "apply"`. | mode gated |
| Proactive (`agency/proactive-eligibility.ts:59`) | Urgent relational waker gated on `relationshipCanInfluence`. | I (holds) |
| State (`state/store.ts`, `writers.ts`) | `internal_state` written only by user-driven flows (own-time, departure, availability patches at runtime.ts:744/883); never written by observe cognition. | user-flow |
| Decisions (`decision_log`, `logDecision` runtime.ts:683) | Unconditional audit writes. | audit plane |

**Summary:** the influence layer is consistently gated (with two gaps: 
`applyEligibleRevisions` mode-only gating, and perception's fetch being gated
on *influence* instead of *execution*). The execution layer is almost entirely
ungated in observe mode.

---

## 4. Observe-mode write/read matrix

### Writes that occur in observe (shadow = "recorded but no live influence")

| Table | Writer | Uncond? | Notes |
|---|---|---|---|
| `episodes` + `episode_messages` | worker.ts:311 | YES | Full summaries/entities; salience, unresolved flags |
| `learning_revisions` (pending) | worker.ts:341-351; consolidate.ts:159-179 | YES | Applied later when master flips to apply |
| `cur_takes` + `evidence_links` | consolidate.ts:147-156 | YES | Model-formed takes from reads |
| `cur_source_candidates` | consolidate.ts:194-210 | YES | Proposed feeds (probation is gated) |
| `cur_reads` (evidence excerpts) | reads.ts:237-251 | YES | Up to 12/day network fetches |
| `cur_items` status/provenance | tick.ts:97-115, reads.ts:253-254 | YES | Feed scans |
| `cognitive_runs` (full analysis JSON) | worker.ts:212-229, 423 | YES | Retains full shadow content |
| `capability_events` (live_shadow) | worker.ts:321-340; reads.ts:261; worker.ts:277-280 | YES | The promotion qualification signal |
| `perception_artifacts`/`perception_reads` (pending/failed rows) | perception/index.ts:193-229, 264-270 | YES | Metadata only; no fetch in observe |
| `mem_messages`/`mem_threads` | writers.ts (user flows) | YES | Base conversation record |
| `decision_log` | runtime.ts:683 | YES | Audit plane |

### Writes that are suppressed in observe

| Table | Writer | Gate |
|---|---|---|
| `mem_facts` (explicit user facts) | worker.ts:366 | `learning` influence |
| `mind_state_items` | worker.ts:404 | `mind_state` influence |
| `affective_events`/`affective_state` | worker.ts:412 | `affect` influence |
| `mutual_commitments` | worker.ts:395 | `mind_state` + `relationshipCanRecord` |
| `questions` (from consolidation) | consolidate.ts:185 | `allowInfluence` |
| `identity_entries`/`opinions` (via revision application) | revisions.ts:235 | mode only |
| `cur_sources` activation (probation) | tick.ts:158 | `source_discovery` influence |
| `internal_state` | — | never written by cognition |
| external action vaults/broker | policy.ts | capability + owner |

### Reads that reach Expression in observe

Hot conversation (last 12 messages, assistant included) → system memory block
("## Hot conversation", last 8) + chat history (assemble.ts:56-58; expression.ts:114-119).
Stable identity entries (context-composer.ts:42-59). Focus/mood/availability/
unfinished (context-composer.ts:70-75). Deterministic decision metadata
(structuredDecisionPrompt context-composer.ts:102-116). Motivations from
questions/facts/opinions/unfinished/availability (motivations.ts — all uncond).

**Blocked from Expression in observe:** takes, mind-state items, affect
license, reading claims, own-time report, reminders, episode summaries
(retrieveEpisodes is observability-only, server.ts:109; `assembleMemoryBlock`
returns `episodes: []` at assemble.ts:75), perception content (fetch blocked).

---

## 5. Non-interference findings (ranked)

1. **HIGH — `dependenciesReady` conflates activation with execution-readiness**
   (capabilities.ts:184-192). A dependency counts as ready only when `active`,
   so a shadow chain cannot execute under its own terms in observe; activation
   of a capability silently requires activation of all deps. This is the core
   structural conflation the audit was asked to separate.
2. **HIGH — auto-promotion is fully autonomous** (capabilities.ts:235-302).
   Thresholds are seeds ≥ 3, live_shadow ≥ 25 spanning ≥ 7 days, deps ready,
   model epoch match. Promotion runs implicitly from `capabilityCanInfluence`
   (547), `recordLiveShadowEvent` (393), `recordIsolatedEvaluation` (371), and
   status listing (471) — including a passive `GET /nuclear/capabilities`
   (server.ts:133-142). No operator authorization, no dry-run, no separate
   "promote" action. Qualification (`eval_seed_count`/`qualified_at`, set by
   `POST /nuclear/capabilities/evaluation`, server.ts:201-230) is coupled to
   activation.
3. **HIGH — observe executes the read pipeline and writes full evidence**
   (reads.ts:225-261; tick.ts:155). `reading` gates only claims, not the read.
   The live-shadow events that qualify `reading` are generated by the very
   pre-qualification activity the capability is supposed to gate — circular
   qualification signal.
4. **HIGH — observe persists delayed-influence state** (worker.ts:311-351;
   consolidate.ts:147-210). Episodes, pending revisions, takes, source
   candidates, and full `cognitive_runs` content all land in observe. Flipping
   the master to apply later applies pending revisions and makes this state
   eligible — influence by time-shift, without any per-item authorization.
    **FIXED by Wave 2 (schema v21, `docs/handoffs/wave-2-provenance-gate-packet.md`):**
    write-time `provenance` labels (`shadow`/`live`) on `cur_takes`, `cur_reads`,
    `episodes`, `learning_revisions`, and `cur_source_candidates`; every
    influence materializer requires `live` — including `processSourceProbation`
    (candidates created in observe can never enter probation). Pre-v21 backfill
    to `shadow` is a conservative classification, not proof of historical
    observe generation. The only shadow-permitting path is owner-authorized
    identity review, exact-item only (see finding 5). Pending Doc acceptance of
    Wave 2.
5. **MEDIUM — `applyEligibleRevisions` is mode-gated, not capability-gated**
    (revisions.ts:235). In apply mode with `learning` still observing, the
    owner-authorized identity-review flow applies pending revisions.
    **RESOLVED by Wave 2** as a documented exact-item exception: review flows
    pass `{ allowShadow: true, revisionIds: [<reviewed revision id>] }` — the
    id always comes from the reviewed `identity_revisions` row, so the shadow
    permission is exact-item only; a broad `allowShadow` scan throws
    `allowShadow_requires_exact_revision_ids`. The worker auto-apply path never
    passes `allowShadow`.
6. **MEDIUM — consolidation LLM calls run in observe** (consolidate.ts:114-143).
   Unlicensed model-formed takes are persisted pre-qualification; only their
   presentation is gated.
7. **LOW — perception fetches are gated on *influence* instead of execution**
   (preflight.ts:56-91). In observe, attachments are recorded as pending/failed
   metadata with `reasonCode: perception_capabilities_observe` — harmless but
   semantically the wrong gate; under the target model, fetch should be an
   execution gate.
8. **LOW — `cognitive_runs` retains full shadow analysis** (worker.ts:423).
   Retention surface for content that never influenced anything.
9. **INFO — audit plane is unconditional and correct**: `decision_log`,
   `capability_events`, delivery ledger. `internal_state` is never written by
   cognition (user flows only).

---

## 6. "Stepping on toes" analysis

**Phrase provenance:** grep of `apps/agent-service/src` and `workspace/` for
`toes|toe|step on|overstep|step` finds **zero matches** in code or prompts.
The phrase is not generated by any prompt or template in the repo.

**Confirmed channel (hypothesis A — PROVEN mechanically):**
`getHotMessages(db, threadId, 12)` (threads.ts:146-164) returns the last 12
messages with **no role filter** — Ashley's own assistant messages are included.
`assembleMemoryBlock` puts the last 8 into the system-side memory block as
`role: text` lines (assemble.ts:56-64) and returns the full 12 as chat history;
`expressSpeak` feeds them as prior turns (expression.ts:114-119). Any phrasing
Ashley (or Doc) produced once therefore sits in the context window of many
subsequent turns. This is a positive-feedback echo channel: the model sees its
own prior wording and tends to repeat it — a known LLM echo/self-anchoring
behavior. If "stepping on toes" was uttered once, it had a strong structural
path to reoccurrence.

**Capability-path influence (hypothesis B — no evidence found):** every
observe-written artifact is either non-retrieved (episodes → observability
only; `assemble` returns `episodes: []`), gated (takes, mind items, affect,
revisions application), or absent (no questions/facts/opinions created by
cognition in observe). No path carries shadow content into Expression in
observe mode.

**Residual risk:** the echo channel is capability-independent — it will
reproduce any phrase regardless of rollout state, and it feeds both the
system block and the chat history. If the phrase appeared in a user message or
an early assistant reply, the hot window sustains it for 12 messages and
"## Hot conversation" for 8. This is the only non-interference leak found, and
it is a *conversation-context* channel, not a *capability* channel. Whether the
specific phrase originated with Ashley or Doc is unverifiable without
production data (out of scope).

---

## 7. Auto-promotion audit

Mechanism (capabilities.ts:235-302):

```
promote(cap) ⟺ state == observe
          ∧ eval_seed_count ≥ 3
          ∧ qualified_at set
          ∧ (model-sensitive ⇒ release.model_epoch == current epoch)
          ∧ live_shadow ≥ 25 events, span ≥ 7 days (epoch-filtered)
          ∧ dependenciesReady (every dep active)
```

- **Qualification and activation are one step.** `recordIsolatedEvaluation`
  (338-372) sets seeds + `qualified_at`; `recordLiveShadowEvent` (374-394)
  adds shadow events; both call `refreshCapabilityPromotions` which flips
  state to `active` immediately when thresholds are met.
- **No authorization concept exists** in the schema or flow. There is no
  `operator`/`doc` approval event kind, no promote action, no dry-run
  endpoint. `capability_events.kind` allows only
  `isolated_eval | live_shadow | behavioral_breach | critical_failure`
  (db.ts:543-546).
- **Trigger surface is broad:** every `capabilityCanInfluence` check (i.e.,
  every runtime turn, both reactive and proactive), every status listing
  (GET /nuclear/capabilities, GET /nuclear/status, /nuclear/health), every
  evaluation POST, and every live-shadow record.
- **Demotion exists and is prompt:** model-change demotes model-sensitive
  capabilities (governor.ts:70-79); 2 behavioral breaches/7 days → rolled_back
  (capabilities.ts:396-429); critical failure → disabled (431-462). Rollback
  is sticky (only observe states are promoted).
- **What would need to change:** separate *qualification* (evidence
  accumulation — seeds, shadow events, epochs) from *activation* (state
  `observe → active`) with an explicit authorization step (e.g., a new
  `operator_promote`/`operator_deny` event kind or a `promotion_authorized`
  column), and remove `refreshCapabilityPromotions` from read-side paths
  (`capabilityCanInfluence`, `listCapabilityStatuses`).

---

## 8. Target architecture (5-concept model)

Replace the single `active` bit with two independent gates per capability:

| Concept | Meaning | Gate input |
|---|---|---|
| `canExecute` | Capability's **live** action chain may run (model call, network, state writes) | state `live` + `executionDependenciesReady` + master apply |
| `canExecuteShadow` | Capability's **shadow** chain may run and record evidence (control plane + labeled pending state) | shadow unlocked (seeds ≥ 3, live_shadow ≥ 25/7d, model epoch) + `shadowDependenciesReady` |
| `canInfluence` | Capability's outputs may enter decisions/prompts/state | `canExecuteShadow` + **operator authorization** + master apply + `influenceDependenciesReady` |
| `shadowDependenciesReady` | All deps have executed at least in shadow | dep shadow unlocked (NOT dep `active`) |
| `influenceDependenciesReady` | All deps are influence-active | dep `canInfluence` |

Design points:

- **Release row gains shadow/execution columns** (additive migration; contract
  material V3 unchanged — behavior, not contract). Suggested:
  `shadow_qualified_at`, `shadow_promoted_at`, `execution_state`
  (`blocked|shadow|live`), `influence_authorized_at`, `influence_denied_at`.
  Keep `state` (observe/active/rolled_back/disabled) as the influence-side
  mirror or fold it into the new columns — do not overload it for both.
- **Shadow chain is explicitly labeled.** Shadow execution writes remain
  evidence-valid but carry provenance (`shadow` flags on episodes/takes/
  revisions, or a `shadow_source` column), and are never eligible for
  application or retrieval into Expression until influence is authorized.
- **Writes classified A–E:**
  - A control plane (`capability_events`, `cognitive_runs`) — always allowed;
  - B shadow state (`episodes`, `cur_reads`, `cur_items`, takes, pending
    revisions, source candidates) — allowed only under `canExecuteShadow`;
  - C candidate state (revisions pending) — allowed under `canExecuteShadow`,
    applied only under `canInfluence("learning")`;
  - D live state (facts, mind items, affective events, applied revisions,
    mutual commitments, internal_state) — only under `canInfluence`;
  - E user-flow state (writers.ts) — always.
- **Perception fetch moves to an execution gate** (`canExecuteShadow("vision")`
  etc.) instead of the influence gate (preflight.ts:56-91), so shadow
  attachments are fetched and licensed-later instead of recorded-as-failed.
- **`applyEligibleRevisions` becomes capability-gated** (`canInfluence(
  "learning")`) with a documented explicit-owner-action exception for the
  identity-review flow.
- **Auto-promotion split:** qualification (seeds + shadow evidence) unlocks
  shadow execution; activation requires explicit authorization recorded in a
  new event kind or column. Remove `refreshCapabilityPromotions` from
  `capabilityCanInfluence` and `listCapabilityStatuses` (read paths never
  mutate release state).

---

## 9. Implementation plan (design only — no code written in this audit)

Ordered, each step independently testable:

1. **Schema migration (additive):** new columns on `capability_releases`
   (`shadow_qualified_at`, `shadow_promoted_at`, `execution_state`,
   `influence_authorized_at`, `influence_denied_at`); new
   `capability_events.kind` values `operator_promote`, `operator_deny`
   (or a separate authorization table). No contract-material change.
2. **`capabilities.ts` refactor:** introduce the five functions;
   `dependenciesReady` splits into shadow/influence variants; promotion
   loop only qualifies shadow execution; new exported
   `authorizeCapabilityPromotion(db, capability, decision)`; strip
   promotion side effects from `capabilityCanInfluence` and
   `listCapabilityStatuses`.
3. **Worker gating:** `processNextCognitiveJob` uses
   `canExecuteShadow("recall"|"mind_state"|"affect"|"learning"|
   "relational_initiative")` for the shadow writes (still unconditional only
   in the sense that shadow execution is the observe default), and keeps
   `canInfluence` for the apply block; revisions application moves under
   `canInfluence("learning")`.
4. **Curiosity gating:** `performGroundedReads` gated on
   `canExecuteShadow("reading")`; consolidation gated on
   `canExecuteShadow("curiosity_consolidation")`; probation on
   `canExecuteShadow("source_discovery")` (then influence for activation).
5. **Perception:** preflight fetch uses execution gates; pending rows remain
   metadata-only until then.
6. **Server/routes:** `POST /nuclear/capabilities/promote` +
   `.../deny` (owner-only) recording authorization events; evaluation
   endpoint unchanged (now only unlocks shadow execution).
7. **Documentation:** update `AGENTS.md` rollout note + `Wave_Acceptance
   Protocol` if the wave ladder references activation semantics.

---

## 10. Test plan (counterfactual + regression)

- **Unit (`capabilities.test.ts`):** seeds+shadow events do NOT activate
  without `authorizeCapabilityPromotion`; with authorization → `active`;
  model epoch change demotes; `capabilityCanInfluence` and status listing
  never mutate release state (counterfactual: today they do — assert the
  old behavior is gone).
- **Shadow chain:** with `recall` observe and `thought` observe, `thought`
  shadow execution is unlocked when its own seeds/shadow evidence qualifies —
  without requiring `recall`/`mind_state` active (counterfactual to the
  current activation ladder).
- **Worker (`worker.test.ts`):** observe run → episodes/takes/pending
  revisions recorded with shadow provenance, facts/mind items/affective
  events/mutual commitments NOT written; apply-mode run with `learning`
  inactive → revisions still not applied.
- **Reading (`reads.test.ts`):** without shadow unlock, `fetchValidatedResource`
  is never called (inject fetcher); after unlock, reads recorded.
- **Runtime (`runtime.test.ts`):** counterfactual — all capabilities observe:
  Expression prompt contains no takes, mind items, affect, or reading claims;
  then with `reading`+`curiosity_consolidation` influential, takes appear.
- **Echo-channel regression:** assert hot window contents (assistant messages
  included) — document as intended conversation context, or filter assistant
  messages if Doc decides the echo channel should be closed.
- **Migration tests:** v3 → new schema preserves releases/events, backfill
  defaults to `execution_state=blocked` for existing observe releases.
- **Offline harness:** `npm test`, `npm run phase0:offline`, and
  `npm run eval:full -- -Baseline baseline-w0 -Label wave5` remain green.

---

## 11. GO/NO-GO

- **Audit itself: GO** — read-only, no changes made, nothing deployed.
- **Implementing the 5-concept model: GO to design, NOT to ship until**
  regression + counterfactual tests land and offline harness + eval pass.
- **Anything touching production (Mint) rollout semantics: NO-GO until the
  execution/influence separation and explicit promotion authorization are in
  place and the tests in §10 are green.**

---

### Digest (for quick reference)

- Influence gates work; execution is ungated. Observe = "execute everything,
  influence nothing".
- `dependenciesReady` = activation-ladder, not execution-readiness.
- Auto-promotion: autonomous, threshold-only, no operator authorization; runs
  as side effect of read paths.
- Observe persists episodes, pending revisions, takes, source candidates,
  reads, and full analysis logs — all eligible for influence if master flips
  to apply.
- "Stepping on toes": no capability leak found; the confirmed channel is the
  hot-conversation window (assistant messages included verbatim) — an echo
  channel. Source phrase unverifiable without prod data.
- Reading/consolidation qualification is circular (pre-gated activity
  generates the qualifying live-shadow events).
- Fix shape: split execution vs influence gates, add explicit promotion
  authorization, gate perception fetch on execution, gate revision
  application on the learning capability, remove promotion from read paths.
