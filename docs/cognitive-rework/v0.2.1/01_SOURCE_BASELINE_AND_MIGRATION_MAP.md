# 01 — Source Baseline and Migration Map

**Status:** Planning evidence. Architecture-reference inspection SHA `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a`. Implementation baseline is **owner-selected** in [OWNER_BASELINE_GATE.md](OWNER_BASELINE_GATE.md). After selection, Luna diffs this map against that SHA before Phase 00 code.

**Inspected at packet R2:** detached HEAD `c7c81c4`; `origin/master` `9d50740` is a verified descendant (six observer/docs commits; `privacy/secrets.ts` changed). Untracked files exist; they are not source.

**Nuclear schema authority:** `NUCLEAR_SUPPORTED_VERSION = 41` in `apps/agent-service/src/core/db.ts`.

**If selected HEAD differs:** revalidate every named seam. STOP (HARD BLOCKER 4) if a delta invalidates a mapping below.

---

## 1. End-to-end production turn (current)

```
Discord MessageCreate
  apps/discord-bot/src/handlers/messageCreate.ts  handleMessage, drainTurn
  apps/discord-bot/src/chat/turn-buffer.ts         TurnBuffer (quiet 1500ms / hard 5s)
  apps/discord-bot/src/agent-client.ts             chatText → POST /chat/text
apps/agent-service/src/server.ts                   POST /chat/text (1733)
apps/agent-service/src/agent.ts                    AgentManager.handleTextChat
apps/agent-service/src/core/runtime.ts             AshleyCore.handleReactiveChat
  activeOwners mutex (throws chat_in_progress)
  claimReactiveDelivery
  writeFromUserTurn
  collectMotivations → decide() ALWAYS
  classifyTurnComplexity
  easy bypass: skip deliberateDecision unless hard OR sandbox offerable
  deliberateDecision (Thought) optional
  sandbox ops + deliberateThoughtContinuation
  runPerceptionTurn AFTER Thought
  composeTurnContext → expressSpeak → finalizeHonesty
  attachDraftAndBubbles → Discord sendBubbles → receipt → finalize
```

This path is the **legacy semantic inversion** v0.2.1 replaces. It stays live until configuration-only cutover of the frozen SHA (Phase 10). Compose/preempt cannot work until Discord ingress is split (Phase 01 + 08).

---

## 2. Component map

Legend: **KEEP** reuse as-is on new kernel; **REHOME** keep mechanism, new owner/call site; **REDESIGN** new contract, salvage parts; **RETIRE** must become unreachable on the new kernel (legacy may keep it until cutover).

**Phase that changes it** = first phase that creates the replacement or wrapper.  
**Unreachable** = phase after which the old semantic behavior cannot run on the *new* kernel. Legacy path remains until Phase 10.

### 2.1 Discord ingress and transport — REDESIGN ingress; KEEP delivery send

| Component | File / symbol | Current responsibility | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| Gateway + owner gate | `apps/discord-bot/src/client.ts` `createClient`; `security/gate.ts` `isAllowedMessage` | Owner-only DM/channel gate | Same | KEEP | 8 (wire) | never |
| Message handler | `handlers/messageCreate.ts` `handleMessage`, `drainTurn` | TurnBuffer → enqueue ChannelQueue job that awaits `/chat/text` through Thought and `sendBubbles` | Durable `POST /chat/ingress` **outside** the queue; queue is delivery-only | **REDESIGN** | 1, 8 | cognition-behind-queue: 8 (source), 10 (live) |
| TurnBuffer | `chat/turn-buffer.ts` `TurnBuffer` | Merge fragments 1500ms/5s; latency clock at last fragment | Mechanical merge KEEP; not a cognition mutex | KEEP merge | 1, 8 | never as mutex |
| Agent HTTP client | `agent-client.ts` `chatText`, receipts, finalize; `AGENT_TRANSPORT_HARD_MS = 120_000` | POST `/chat/text`; poll 202 | ADD `ingressChat` → `/chat/ingress`; KEEP `chatText` for legacy/shadow | REDESIGN | 1, 8 | `/chat/text` as durable admit: 10 |
| Send bubbles | `chat/send-bubbles.ts` `sendBubbles` | Sequential Discord send + receipt callback | After projector | KEEP | 5, 8 | never |
| Channel queue / pacing | `chat/channel-queue.ts`, `chat/pacing.ts` | Serial cognition+send; abort does not cancel `chatText` | Serial **send only**; abort KEEP for pacing | REDESIGN | 1, 8 | inbound wait on Thought: 8/10 |
| Fulfillment pump | `initiative/fulfillment-pump.ts` | Claims operational/weekly_review and sends | Pattern for v021 reactive outbox | REHOME | 5, 8 | never |
| Slash commands | `handlers/interactionCreate.ts`, `commands/*.ts` | `/remember` `/memory` `/new` `/forget` `/proactive` `/identity` `/commitments` `/continuity` `/status` | `/remember` = OwnerSuppliedClaim; others KEEP | REHOME remember/forget | 6, 8 | `/remember` bypassing conversational teaching: 10 |
| Presence payload | `agent-client.ts` sends `discordPresence`; `server.ts` types it `string` and ignores | Unused | Out of scope | KEEP unused | none | never |
| Preflight | `POST /chat/preflight` always `{ lookup: false }` | Dead | Unused | RETIRE on new path | 8 | 10 |

### 2.2 Agent HTTP and boot — KEEP / thin wire

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| Server | `apps/agent-service/src/server.ts` `createServer`, `POST /chat/text` | Owner gate, delivery envelope, `manager.handleTextChat` | ADD `POST /chat/ingress`; KEEP `/chat/text` for legacy/shadow; flag-gated dispatch exists **before freeze** | REDESIGN | 1, 8 | `/chat/text` as admit: 10 |
| AgentManager | `agent.ts` `handleTextChat` | Channel must be discord; calls `handleReactiveChat` | Ingress handler + live dispatcher both exist before freeze; enabled by flag | REDESIGN dispatch | 1, 8 | 10 |
| Serve loops | `serve.ts` curiosity, cognition, durable runner | Background | Idle opportunity is new; curiosity becomes Observations | REHOME idle; KEEP loops as executive | 7, 8 | curiosity→speech via motivations: 10 |
| Env | `env.ts` `cognitionMode` (`ASHLEY_COGNITION_MODE===apply` else observe) | Master ceiling | New `ASHLEY_COGNITIVE_KERNEL` = `legacy`\|`shadow`\|`v021`, default `legacy` | KEEP cognitionMode; ADD kernel flag | 0 | never |
| Health | `runtime.ts` `getHealth` / `getHealthSnapshot` | nuclear schema, cognitionMode | ADD `cognitiveKernel`, sidecar schema/path, shadow flag — **in Phase 08 source**, disabled by default | REDESIGN report | 8 | never |

### 2.3 Runtime turn lifecycle — REDESIGN (legacy frozen until 10)

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| AshleyCore | `runtime.ts` `handleReactiveChat` (756–2237) | Full inverted pipeline | Legacy only until cutover | REDESIGN replacement = `cognitive-v021/kernel.ts` `runCognitiveCycle` | 2–10 | 10 |
| `activeOwners` | `runtime.ts` line 611, add/throw 756–764, finally 2234 | One owner; `chat_in_progress` | Inbox compose/preempt; one active generation | REDESIGN | 1, 10 | `chat_in_progress` drop of owner text: 10 |
| `isExpressionQuiesced` | `runtime.ts` 3091 | `!activeOwners.has` | C1 cutover helper; not kernel speech | KEEP on legacy | none | never |
| Durable M6 ack | `runtime.ts` 1018–1101 | Canned ack, may skip Thought | Infrastructure notice, not Ashley voice | REHOME | 5, 10 | canned-as-Ashley-voice: 10 |

### 2.4 Agency / Thought / decide — RETIRE as meaning

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| `decide()` | `agency/decide.ts` `decide` (338) | Deterministic Decision; reactive almost always speak; proactive `score < 25` silence | No score-speech; Thought authors settlement | RETIRE as meaning | 2, 10 | 10 on new kernel |
| Fluff / high-stakes regex | `decide.ts` `isFluff`, `HIGH_STAKES_RE` | Mechanical kind/effort | High-stakes may feed Authority pack, not Decision | REHOME detectors into Authority | 4 | score→kind mapping: 10 |
| `classifyTurnComplexity` | `agency/turn-complexity.ts` | easy/hard/terminal; easy skips Thought unless sandbox offerable | No easy Expression answer; ordinary turns always Thought | RETIRE as meaning | 2, 5, 10 | easy bypass: 10 |
| `shouldRunProactiveModelThought` | `agency/proactive-thought-gate.ts` | Proactive Thought only if hard | Idle-if-grounded / trigger / subscription wakes Thought | RETIRE gate | 7, 10 | 10 |
| Thought compose | `agency/thought.ts` `composeInitialThoughtMessages` (1490) | JSON `{ trigger, base, candidates }`; no perception, no constitution dump, no surfaceDraft | New `ThoughtInput` (spec §D) | REDESIGN | 2 | old `{trigger,base,candidates}` as sole input: 10 |
| `ThoughtProposal` | `thought.ts` 1105 | kind/shouldSpeak/objective/operationalRequest | Replaced by `CognitiveSettlement` | REDESIGN | 2 | 10 |
| `deliberateDecision` | `thought.ts` 1995 | Merge proposal into Decision; returns `base` if gated | Kernel Thought runner | REDESIGN | 2 | returning decide() as meaning: 10 |
| `deliberateThoughtContinuation` | `thought.ts` 2454 | Pass-2 after ops | Intra-cycle observe/effect then settle (same role) | REDESIGN | 2, 4 | 10 |
| `runBoundedCognition` | `thought.ts` 1247 | Max 2 structural retries | KEEP mechanism for Thought JSON parse retries | REHOME | 2 | never |
| `logDecision` | `agency/log.ts` | Persist Decision | Causality ledger, not Decision | REDESIGN | 1, 2 | Decision-as-speech-authority: 10 |
| Motivations collect | `agency/motivations.ts` `collectMotivations` (373), `tokenize` length≥4, `isTextRelevant` 2-hit | Candidate pool for decide/Thought | Retrieval candidates only; not interestingness | REDESIGN tokenize; RETIRE as speech gate | 3, 7 | tokenize-miss of HY3: 3 (sidecar), 10 (live) |
| Candidate selection | `agency/candidate-selection.ts` `selectMotivationCandidates` | Currentness filter | Retrieval, not motivation-as-care | REHOME | 3 | 10 |
| `writers.ts` `writeFromUserTurn` | pin/forget regex, questions, departure | Pre-Thought side writes | Teaching/correction authored by Thought; `/remember` remains explicit admission | REDESIGN conversational writes | 3, 6 | PIN_RE as silent memory: 10 |

### 2.5 Expression / honesty / prompts — REDESIGN / RETIRE

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| `composeTurnContext` | `context-composer.ts` `composeTurnContext` (813), `TurnContext` | Identity + memory + mind + decisionPrompt | Thought assembly, not Expression transcript | REHOME into Thought input builder | 2, 3 | Expression receiving hotMessages as Q&A: 5, 10 |
| `assembleMemoryBlock` | `memory/assemble.ts` | Hot window + evidenceRefs; `facts` always `[]` | Retrieval result, not dump | REHOME | 3 | 10 |
| `expressSpeak` | `conversation/expression.ts` `expressSpeak` (119) | Full transcript + capability self-model + perception images; route `ashley_expression` | Optional starved adapter: licensed draft + commitments + profile + medium only | REDESIGN starve | 5 | transcript privilege: 5 (new kernel), 10 (live) |
| `perceptionThoughtParts` option | `expression.ts` declared, unread | Dead | Perception is upstream of Thought | RETIRE param | 5 | never (already unused) |
| `finalizeHonesty` | `honesty/finalize.ts` `finalizeHonesty` (210) | Strip/floor unlicensed claims; locked operational truth replaces text | RETIRE surgery; fidelity reject → Thought | RETIRE | 5, 10 | 10 |
| Operational truth lock | `finalizeHonesty` when `truth.locked` | Deterministic operational sentence | Receipt claims in commitments; Thought draft; Authority `RECEIPT_*` | REHOME | 4, 5 | Expression override of ops truth: 10 |
| `core.md` currentness paragraph | `workspace/prompts/nuclear/core.md` lines 7–8 | Prompt-level latest/current rule | Authority currentness + Thought tags + draft detectors | RETIRE prompt-as-authority | 4, 5, 10 | 10 |
| Expression fallback | `conversation/expression-fallback.ts` | Groq minimal identity on Mistral fail | Failure → infrastructure notice, not second mind | RETIRE as meaning | 5, 10 | fallback-answers-question: 10 |
| Rendering | `conversation/rendering.ts` `renderForTransport` | Typography, marker strip | KEEP presentation | KEEP | 5 | never |
| Nuclear prompts | `workspace/prompts/nuclear/core.md`, `discord.md`, `proactive.md` | Expression system | Thought occupant prompt is new; Expression prompt starved | REDESIGN | 2, 5 | 10 |

### 2.6 Perception / capability — REHOME upstream

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| `runPerceptionTurn` | `perception/index.ts` (181) called from runtime **after** Thought (1846) | Artifacts; thoughtParts unused | Before Thought; Observations | REHOME timing | 2, 4, 10 | perception-after-Thought: 10 |
| Ingest / conversational-read | `perception/ingest.ts`, `conversational-read.ts` | Fetch bounded | ObservationRequest vs Effect by replay-safety | REHOME | 4 | 10 |
| Capability self-model | `perception/capability-self-model.ts` `composeSelfCapabilityContext` (313) | Expression-only paragraph | Always-on Thought input | REHOME | 2 | Expression-only capability view: 10 |
| Perception gates | `perceptionCapabilityCanInfluence` | apply + active + deps | Authority capability pack | REHOME | 4 | 10 |

### 2.7 Memory / recall / C1 — KEEP lineage, REDESIGN retrieval

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| Threads/messages | `memory/threads.ts` `insertMessage`, `getHotMessages` (limit 12) | mem_threads, mem_messages | Evidence log + last N; N default 12 | KEEP/REHOME | 1, 3 | never |
| Facts | `memory/facts.ts` `upsertFact`, `listActiveFacts` | mem_facts / assertion projection | Durable Memory via admission only | REHOME writers behind fence | 6 | cognition worker inventing facts as live influence without nomination: 10 |
| Episodes | `memory/episodes.ts` `retrieveEpisodes` FTS | Diagnostic/consolidator | SharedEpisode evidence, not world belief | REHOME | 6 | 10 |
| Tokenize filter | `motivations.ts` `tokenize` ≥4, 2 shared tokens | Drops HY3/LLM/API | Lexical fallback must include short tokens | REDESIGN | 3 | HY3 miss: 3 |
| C1 assertions | `memory/assertions.ts`, `eligibility.ts`, `corrections.ts`, `cutover.ts`, `context-role.ts` | Lineage, currentness, sticky cutover | KEEP lineage; dimensional tags; retire prompt currentness | KEEP/REHOME | 6 | prompt currentness as authority: 10 |
| C1 contract state | `memory/contract-state.ts` `currentnessAuthority` | mem_facts \| memory_assertions | Sidecar Memory is assertion-native | REHOME | 6 | never |
| Forget | `memory/forget.ts` + continuity tombstones | Preview/tombstone | Same mechanical forget; settlement cancels occupancy/triggers | KEEP | 6 | never |
| Cognition worker | `cognition/worker.ts` `processNextCognitiveJob` | consolidate_thread → facts/episodes/mind/revisions | Must not write live Memory without fenced nomination | REDESIGN | 6, 10 | auto-fact as owner-explicit: 10 |

### 2.8 Identity / mind / relationship / C2–C5

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| Identity store | `identity/store.ts` `listIdentity`, `recordIdentityEntry`, `seedIdentity` SEED_VERSION 5 | identity_entries | Constitutional always-on; LearnedSelf separate | KEEP constitution; REDESIGN LearnedSelf | 2, 6 | never |
| Identity reviews | `learning/revisions.ts` `proposeRevision`, `listIdentityReviews` | Foundational review | Protected admission | KEEP | 6 | never |
| internal_state | `state/store.ts` `getState`, `patchState` | focus/mood/unfinished | Occupancy index, not duplicate prose | REDESIGN | 3 | mood-as-selfhood: 10 |
| mind_state_items | `state/mind-items.ts` `upsertMindStateItem`, `hasUrgentMindState` | Items + urgent wake | Concern lineage + occupancy | REDESIGN | 3, 7 | 10 |
| Affect | `state/affect.ts` | affective_state | Research-only | RETIRE as selfhood | 10 | 10 |
| Own-time | `state/own-time.ts`, `agency/own-time-report.ts` | Sessions + gated report | Idle/private cognition; report is speech commitment | REHOME | 7 | 10 |
| Questions | `state/questions.ts` | Open questions | Concerns | REHOME | 3 | 10 |
| C2 context budget | `context-budget/plan.ts` DEFAULT 12_000 bytes; `contextBudgetCanInfluence` dark_apply only | Section budgets | Resource Governor; never evict always-on 1–5 | REHOME | 3 | evict last N: 3 tests |
| C3 learned autonomy | `learned-autonomy/admit.ts`, `motivations-learned` | dark_apply interests; overlap 0.75 | LearnedSelf slice; **no** score→speech/trigger | REDESIGN | 6, 7 | learned_interest creating proactive speech: 10 |
| C4 graduation | `cognitive-graduation/calibration.ts` | Future-only adjustments | Occupant calibration + RuntimeCondition | REHOME | 6 | personality-from-calibration: 10 |
| C5 relationship | `relationship/*` v14 tables + C5 projections | Commitments, tensions, consent, repair | WC repair; Memory commitments; Authority constraints; no narrator | REHOME | 4, 6 | relationship scores as speech: 10 |
| Reflection | `reflection/initiative.ts` emoji → score delta | Initiative learning | Calibration notes, not current-turn meaning | REHOME | 6, 7 | reflection rewriting this turn: 10 |
| OCI | `cognition/open-items.ts`, `wake-selection.ts` `OPEN_COGNITIVE_WAKE_MAX_ITEMS = 8` | Wake items | Concern + occupancy + FutureTrigger | REHOME | 3, 7 | 10 |

### 2.9 Initiative / curiosity

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| Discord scheduler | `discord-bot/src/initiative/scheduler.ts` `startProactiveScheduler` | Jittered interval → POST `/initiative/tick` | May emit idle_opportunity executive tick | REHOME | 7, 10 | tick forcing Thought on empty house: 7 |
| `tickProactive` | `runtime.ts` 2381 | Eligibility → decide → optional Thought → reserve/send | Idle-if-grounded / due trigger / new sub item | REDESIGN | 7, 10 | score<25 silence as interestingness: 10 |
| Eligibility | `agency/proactive-eligibility.ts` | Pause, cap, idle hours, chat-in-progress | Resource/consent, not interestingness | KEEP mechanical caps | 7 | never |
| Curiosity tick | `curiosity/tick.ts` `runNuclearCuriosityTick` | scan→fetch→take | Takes are Observations; Thought judges | REDESIGN motivate path | 4, 7 | take→collectMotivations→speak: 10 |
| Network fetch | `curiosity/network.ts` | Public HTTP, 5 redirects, 20s, 2MB | Observation vs Effect | KEEP bounds | 4 | never |

### 2.10 Delivery / sandbox / jobs — KEEP as executive

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| `claimReactiveDelivery` | `delivery/store.ts` (149) BEGIN IMMEDIATE; inbound ids; mem_messages | Idempotent reservation | Speech outbox + inbox correlation | KEEP/REHOME | 1, 5 | never |
| Deadline plan | `delivery/turn-deadline-plan.ts` `initialThoughtMs = 6_000`, transport 120_000 | Phase budgets | Ordinary 1 Thought call; tool cycles get wider lease (default 120_000) | KEEP; ADD tool lease | 4, 5 | 6s forcing semantic bypass: 4 |
| Bubble plan | `delivery/bubble-plan.ts` `planContentBubbles` | Split draft | After outbox licensed text | KEEP | 5 | never |
| Finalize | `delivery/finalize.ts` | commit/cancel | Outbox sendStatus | KEEP | 5 | never |
| Sandbox V2 | `apps/sandbox-v2/**`, `core/sandbox/v2-execution.ts` | Direct bwrap | Effect/Observation executors | KEEP | 4 | never |
| Admissions | `sandbox/reactive-operational-admission.ts` `evaluateReactiveOperationalAdmission` | Trusted admit | Authority + Thought EffectProposal | KEEP admit as capability | 4 | model-claimed basis without admit: never (keep fail-closed) |
| Durable jobs | `sandbox/operational-job-store.ts`, `durable-cognition.ts` `DURABLE_COGNITION_LIFETIME_MS = 15min` | in_flight M6 | in_flight + recovery | KEEP | 1, 4 | never |
| Durable ack text | `DURABLE_COGNITION_ACK_TEXT` | Canned | Infrastructure notice | REHOME | 5 | 10 |
| V1 broker | `sandbox/loop.ts`, `unix-broker-client.ts` | Historical, default disabled | Do not resurrect | KEEP disabled | none | never |

### 2.11 Model routing — KEEP

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| Routes | `model-routing/registry.ts` `ROUTE_BINDINGS` | `thought` = nim `openai/gpt-oss-20b`; `ashley_expression` = mistral-medium-latest | Occupant replaceable; default Thought route KEEP | KEEP | 2 (new Thought prompt/schema) | never |
| `completeChat` | `mistral-client.ts` `completeChat(messages, CognitiveDispatchOptions)` | Fabric + governor + adapter; **`attentionDb` required** | Thought + optional Expression; adapter `invokeThoughtComplete` passes `attentionDb` | KEEP | 2, 5 | never — do not drop attentionDb |
| Attention | `attention/governor.ts` `runAttentiveDispatch` | Admit/wait | KEEP | KEEP | none | never |
| Model Fabric | `core/model-fabric/**` | Dispatch policy | KEEP | KEEP | none | never |

### 2.12 Schema / continuity / data plane — KEEP + sidecar

| Component | File / symbol | Current | v0.2.1 | Verdict | Change | Unreachable |
|---|---|---|---|---|---|---|
| Nuclear DB | `db.ts` `openNuclearDb`, `migrate`, v41 | Production semantic+ops | Legacy writers remain until cutover config; additive `cognitive_v021_outbox_id` before freeze | KEEP + additive column | 5, 8 | never freeze writers during shadow |
| Continuity | `continuity/db.ts` `openContinuityDb`, `CONTINUITY_SCHEMA_VERSION = 1` | Lineage, forget, sessions | Pattern for sidecar open/reserved path | KEEP pattern | 0 | never |
| Data plane | `data-plane.ts` `reservedProductionNuclearDbPath`, `reservedProductionContinuityDbPath` | Production vs isolated | Add `reservedProductionCognitiveSidecarDbPath` → `~/.composer-assistant/cognitive-v021.db` | KEEP pattern | 0 | sidecar on production path without production dataPlane: 0 |
| BEGIN IMMEDIATE | `db.ts` and delivery/jobs | SQLite writer lock | Atomic semantic txn uses same | KEEP | 1 | never |

### 2.13 Qualification / deploy — KEEP commands, new gates

| Component | File / symbol | Current | v0.2.1 packet |
|---|---|---|---|
| Offline tests | `apps/agent-service/package.json` `test:offline`; `vitest.offline.config.ts` + `offline-network-guard.ts` | Corpus minus host scripts | Phase gates + qualification A |
| Full vitest | `npm test` / `npm test --prefix apps/agent-service` | Default include `src/**/*.test.ts` | New tests colocated under `cognitive-v021/**/*.test.ts` auto-included |
| Phase0 scripts | `scripts/phase0/*` | Recall/initiative smokes | Not causal owner proofs; keep as non-hard notes |
| Mint deploy | `scripts/mint/remote-update.ps1` → SSH `mint` `git pull --ff-only` → `deploy/linux-mint/update.sh` | stop units, build, start agent then discord, `/health` | Cutover runbook |
| Units | `ashley-agent.service`, `ashley-discord.service` user systemd | ExecStart node dist | Same |
| Windows stop | `npm run stop:ashley` | Local pids only | Does not stop Mint |
| Capability promote | `server.ts` POST `/nuclear/capabilities/promote` | Observe→active | Not this packet’s promotion of C1–C5; kernel cutover is flag+path, not a capability name |

---

## 3. Source mismatches vs earlier architecture review

These are **confirmed at `c7c81c4`**. Plan around them; do not invent architecture to paper over them.

| Claim | Live source | Packet consequence |
|---|---|---|
| Perception after Thought | CONFIRMED `runtime.ts` 1846 after Thought | Phase 2/4: new kernel orders perception first. Legacy untouched until 10. |
| `thoughtParts` unused | CONFIRMED dead option on `expressSpeak` | Do not “fix” legacy; new kernel feeds Observations to Thought. |
| Easy-turn skip | CONFIRMED unless `inspectionOffered` | RETIRE as meaning. Sandbox-offerable currently *forces* Thought on easy turns — still not settlement authorship of speech. |
| Reactive score&lt;25 | NOT present; only proactive `decide.ts` 495 and `evaluateProactive` 2886 | RETIRE both score-speech paths. |
| `discordPresence` ignored | CONFIRMED type mismatch | Out of scope. |
| `/chat/preflight` false | CONFIRMED | Out of scope. |
| C1–C5 live influence | Source has modules; `capabilityCanInfluence` needs master apply + active release. Promotion state is **UNKNOWN** without production observation. | Rehome mechanisms. Do not assume they currently influence production speech. |
| Tests asserting schema 35 as **current** | See §7 inventory. Live `NUCLEAR_SUPPORTED_VERSION = 41`. | Phase 00: update **current-pin** assertions to 41 (or `toBe(NUCLEAR_SUPPORTED_VERSION)`). Keep v35 **waypoint** assertions in `migration-35.test.ts` (`pending?.to === 35`). |
| Expression fallback second mind | CONFIRMED Groq path | RETIRE as meaning on new kernel. |
| Durable ack without Thought | CONFIRMED | Infrastructure notice, not `surfaceDraft`. |
| Discord ChannelQueue waits on `/chat/text` | CONFIRMED `drainTurn` enqueues cognition+send; `chatText` not aborted by `channelQueue.abort` | Packet R1 KEEP was **wrong**. REDESIGN ingress (spec §E.1). |
| `completeChat` requires `attentionDb` | CONFIRMED `CognitiveDispatchOptions.attentionDb` | Retain in Thought adapter. |
| HEAD drift / detached vs origin/master | DETACHED `c7c81c4`; origin/master `9d50740` descendant | Owner Gate A. Do not implement from detached SHA. |

---

## 4. Salvage summary (C1–C5 and organs)

Matches architecture §21–22, bound to files:

| Organ | Verdict | Target in new kernel |
|---|---|---|
| C1 assertion lineage, corrections, sticky currentness, deny barriers | KEEP/REHOME | Durable Memory + Authority currentness pack |
| C1 prompt/hot-message role tags as the currentness enforcer | RETIRE | Thought commitments + Authority detectors |
| C2 byte budgets / receipts | REHOME | Resource Governor; cannot evict always-on set |
| C3 learned_interest → motivations → proactive speech | RETIRE as meaning | LearnedSelf slice into Thought only |
| C4 prediction/calibration tables | REHOME | Occupant calibration; not identity |
| C5 records, consent, withdrawal | REHOME | Memory + Authority `RELATIONAL_*` |
| Delivery reservations | KEEP | Speech outbox correlation |
| Durable operational_jobs | KEEP | in_flight / recovery |
| Sandbox V2 | KEEP | Effect/Observation execution |
| Model Fabric + `completeChat` | KEEP | Thought occupant |
| `activeOwners` throw | REDESIGN | Inbox + generation |
| `decide()` / easy bypass / finalizeHonesty / Expression transcript | RETIRE as meaning | Unreachable after Phase 10 on live path |

---

## 5. Files that must not change until named phase

**Phases 00–07 must not modify** the live inverted order of `handleReactiveChat` (perception after Thought, decide, express, honesty). Phase 08 **may** add flag-gated live dispatcher, health fields, shadow hook, and ingress wiring that default to legacy behavior.

- `apps/agent-service/src/core/agency/decide.ts` — no semantic resurrection
- `apps/agent-service/src/core/honesty/finalize.ts` — no surgery on new kernel; leave legacy until cutover config
- Production systemd units, `deploy/linux-mint/update.sh` — Phase 08 may add **non-behavior** hooks/docs; prefer env flag only
- Discord `ChannelQueue` occupancy **must** change in Phase 01/08 as specified (this is required, not a freeze)

**Never modify in this packet:** V1 sandbox broker topology, `index.db` as semantic memory, capability promotion SQL as a substitute for kernel cutover.

---

## 6. Isolated test pattern Luna must reuse

Existing: `openNuclearDb(new DatabaseSync(":memory:"))` in many `*.test.ts`. Continuity/production path: `data-plane.ts` reserved-path guards.

Sidecar tests:

```ts
import { DatabaseSync } from "node:sqlite";
import { openCognitiveSidecarDb } from "../sidecar/db.js";

function openSidecar() {
  return openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
}
```

Exact `openCognitiveSidecarDb` signature is specified in [02_IMPLEMENTATION_SPECIFICATION.md](02_IMPLEMENTATION_SPECIFICATION.md) §W. Production reserved file `~/.composer-assistant/cognitive-v021.db` must throw without `dataPlane.kind === "production"` — copy the continuity guard in `continuity/db.ts` `openContinuityDb`.

---

## 7. Nuclear schema-v35 test inventory (at inspection SHA)

Live source: `NUCLEAR_SUPPORTED_VERSION = 41`. These tests still pin **35**. They are not “one stale test.”

### 7.1 Current-version pins — UPDATE REQUIRED (Phase 00)

Exactly **20** files contain `expect(NUCLEAR_SUPPORTED_VERSION).toBe(35)`:

`sandbox/migration-35.test.ts`, `migration-33.test.ts`, `migration-32.test.ts`, `migration-31.test.ts`, `migration-30.test.ts`, `migration-27.test.ts`, `migration-19.test.ts`, `rollout/migration-26.test.ts`, `rollout/migration-20.test.ts`, `provenance/migration-21.test.ts`, `perception/migration-18.test.ts`, `delivery/migration-29.test.ts`, `data-plane-authority.test.ts`, `continuity/wave06-migration.test.ts`, `continuity/wave05-migration.test.ts`, `cognition/migration-25.test.ts`, `cognition/migration-24.test.ts`, `cognition/migration-23.test.ts`, `attention/buckets.test.ts`, `agency/migration-28.test.ts`.

Additional **post-migrate current pins** `schemaVersion(...).toBe(35)` / `getHealth().schemaVersion).toBe(35)` / `user_version` / `nuclear_schema_version` appear in the same files plus:

- `external-agency/wave09b.test.ts`
- `change-proposal/wave08b.test.ts`
- `cognition/schema-content-recovery.test.ts`

**Classification:** expected stale fixtures of the **current** schema integer. Update to `41` or `toBe(NUCLEAR_SUPPORTED_VERSION)`. This is test hygiene, not architecture.

### 7.2 Historical waypoint — KEEP

`sandbox/migration-35.test.ts` `pending?.to === 35` tests the v35 migration target as a step. Keep that waypoint. Do not keep `NUCLEAR_SUPPORTED_VERSION.toBe(35)` in the same file.

Do not treat historical migration tests as permission to leave current-pins at 35.

