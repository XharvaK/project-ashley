# 02 — Implementation-Grade Specification

**Status:** Software contract for Cognitive Architecture v0.2.1. Types and names here are frozen for all phases. Architecture laws: [00_ARCHITECTURE_REFERENCE.md](00_ARCHITECTURE_REFERENCE.md). Source mapping: [01_SOURCE_BASELINE_AND_MIGRATION_MAP.md](01_SOURCE_BASELINE_AND_MIGRATION_MAP.md).

**Spec version:** `IMPLEMENTATION_SPEC_VERSION = "0.2.1.r3"` (packet R3). Luna must persist this string on sidecar meta and qualification artifacts. Complete sidecar DDL: [04_STORAGE_AND_DISPATCH_CONTRACT.md](04_STORAGE_AND_DISPATCH_CONTRACT.md) (must match §W.1).

**Module root:** `apps/agent-service/src/core/cognitive-v021/`

**Schema file:** `apps/agent-service/src/core/cognitive-v021/types.ts` must export every type in this document under the **exact identifier** given. Later phases import those identifiers; they must not invent aliases (`CycleID` vs `CycleId`, `surface_draft` vs `surfaceDraft`).

**Classification of every stored field:** each contract section labels fields as **semantic authority**, **evidence**, **executive**, or **derived**. Derived stores have no independent writer.

---

## Global constants

```ts
export const ARCHITECTURE_EPOCH = "v0.2.1" as const;
export const IMPLEMENTATION_SPEC_VERSION = "0.2.1.r3" as const;
export const THOUGHT_CONTRACT_VERSION = 1 as const;
export const COGNITIVE_SIDECAR_SCHEMA_VERSION = 1 as const;
export const SETTLEMENT_SCHEMA_VERSION = 1 as const;
export const OUTBOX_BRIDGE_VERSION = 1 as const;
export const LEGACY_IMPORT_TOOL_VERSION = 1 as const;
export const MAX_AUTHORITY_REVISIONS = 2 as const;
export const MAX_THOUGHT_PASSES = 6 as const; // accepted semantic passes of the current generation only
export const MAX_THOUGHT_MODEL_ATTEMPTS = 12 as const; // raw network invocations including cancelled compose attempts
export const PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR = 12 as const;
export const PRIVATE_THOUGHT_MAX_CONCURRENT = 1 as const;
export const PRIVATE_SUBSCRIPTION_ITEMS_PER_IDLE = 4 as const;
export const MAX_OBSERVATION_ROUNDS = 4 as const;
export const MAX_EFFECT_ROUNDS = 4 as const;
export const DEFAULT_LAST_N_TURNS = 12 as const; // matches getHotMessages limit
export const DEFAULT_OCCUPANCY_COMPACT_K = 8 as const; // matches OPEN_COGNITIVE_WAKE_MAX_ITEMS
export const DEFAULT_IDLE_TICK_MS = 60_000 as const;
export const DEFAULT_MAX_SUBSCRIPTIONS = 16 as const;
export const DEFAULT_MISS_ROUND_CAP = 1 as const;
export const DEFAULT_TOOL_CYCLE_LEASE_MS = 120_000 as const;
export const ORDINARY_THOUGHT_BUDGET_MS = 6_000 as const; // turn-deadline-plan initialThoughtMs
```

`ASHLEY_COGNITIVE_KERNEL` env (Phase 0, `env.ts`):

```ts
export type KernelMode = "legacy" | "shadow" | "v021";
// parse: unset / "" / "legacy" → "legacy"
// "shadow" → "shadow"
// "v021" → "v021"
// any other string → HARD fail at process boot (throw), do not silently legacy
```

Default production: `legacy`. Shadow and v021 never implied by `ASHLEY_COGNITION_MODE`.

**Schema version freeze:** `COGNITIVE_SIDECAR_SCHEMA_VERSION` is **1** for the entire implementation through candidate freeze. Phase 00 applies the complete v1 DDL in spec §W. Phase 01 does **not** bump to version 2. There is no production v0.2.1 schema yet; do not invent migration history for planning drafts.

---

## A. Cognitive Cycle

**File:** `cycle/types.ts` re-exported from `types.ts`.

```ts
export type CycleId = string;           // ulid or uuid; opaque
export type Generation = number;        // integer, starts at 1, monotonic per conversation
export type ConversationId = string;    // EXACTLY nuclear mem_threads.id / delivery_reservations.thread_id for the active DM thread. Not ownerId+channel concatenation.
export type AuthorityEpoch = number;    // monotonic; bump when mutable Authority packs change
export type OccupantId = string;        // resolved Thought route + model id snapshot
export type IdempotencyKey = string;
export type ReservationId = number;     // delivery_reservations.id
export type OutboxId = number;

export type CycleTriggerKind =
  | "owner_message"
  | "idle_opportunity"
  | "subscription_item"
  | "future_trigger_due"
  | "observation_or_receipt"
  | "recovery";

export type CycleState =
  | "admitted"
  | "assembling"
  | "thinking"
  | "awaiting_operation"
  | "authority_check"
  | "publishing"
  | "sending"
  | "silent"
  | "idle";

export type CycleRecord = {
  cycleId: CycleId;
  conversationId: ConversationId;
  generation: Generation;
  triggerKind: CycleTriggerKind;
  triggerRef: string;              // evidence log id(s) or trigger/subscription id
  state: CycleState;
  occupantId: OccupantId;
  authorityEpoch: AuthorityEpoch;
  architectureEpoch: typeof ARCHITECTURE_EPOCH;
  admittedAtMs: number;
  // executive
  composeLogIds: string[];         // evidence ids attached this generation
  preemptedGeneration: Generation | null;
};
```

**Lifecycle rules (must be tested):**

1. One **active publisher generation** per `conversationId`.
2. Owner inbound **always appends** to the evidence log first (inbox), even if a cycle is `thinking`.
3. **Compose** (default): no speech outbox **published** for this generation AND no irreversible effect `in_flight` → attach new log ids; Thought continues or restarts interpret; Workspace drafts discarded; generation unchanged.
4. **Preempt:** outbox published OR irreversible in_flight → `generation += 1`; suppress **undelivered** outbox of old generation; keep in_flight receipts for the new generation; do not unsend delivered Discord.
5. Result for wrong `generation` → ignore (no publish, no outbox send).
6. Cancellation: abort of Discord turn maps to: if unpublished, drop Workspace and mark cycle `idle` without settlement; if published, outbox still sends.
7. Late provider result: ignore if `generation` mismatch; if match and not yet published, Thought may integrate.

**ConversationId resolution:** ingress uses KEEP `resolveActiveThread(nuclear, ownerId, channel)` and sets sidecar `conversation_id` to that `threadId`. `/new` uses existing nuclear new-thread behavior; subsequent ingress binds the new `threadId`. Shadow **may READ** nuclear thread id to bind conversation id. Shadow **must not WRITE** nuclear thread rows or semantic stores. Utterance evidence projection (strategy A, §E.2) writes `mem_messages` only as classified evidence after cutover (or as specified idempotent owner/legacy-delivery mirrors).

**Idle admit:** Agency may enqueue `idle_opportunity`. Fence admits Thought **iff** `count(occupancy status in active|investigating|waiting_for_evidence) > 0` OR `newSubscriptionItems > 0` OR due `FutureTrigger` after revalidation. Else **zero Thought calls**. Private cognition is also bounded by `PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR` / `PRIVATE_THOUGHT_MAX_CONCURRENT` / `PRIVATE_SUBSCRIPTION_ITEMS_PER_IDLE` (executive budget; not interestingness). Owner messages are not subject to the private budget.

---

## B. Semantic publication transaction

**File:** `settlement/publish.ts` `publishSemanticTransaction`.

Single SQLite `BEGIN IMMEDIATE` on the sidecar. **All-or-none:**

| Write | Store class |
|---|---|
| Working Context upserts/supersedes/abandons | semantic |
| Concern lineage upserts/resolves | semantic |
| Mind occupancy rows | semantic |
| FutureTrigger create/cancel | executive |
| ObservationSubscription create/cancel | executive |
| DurableNomination enqueue | executive (not Memory yet) |
| Speech outbox row if `speech.mode === "draft"` | executive |
| Settlement row + causality ledger pointer | observe |

If any write fails: `ROLLBACK`. Callers see `PublishAborted`. No partial WC. No outbox. No occupancy. Tests in Phase 1 Task F inject a failing occupancy write and assert WC count unchanged.

**Forbidden:** separate commits for WC vs occupancy.

---

## C. Thought settlement draft vs published settlement

Thought JSON **must not** contain `finalLicensedText`, outbox id, nuclear reservation id, or delivery state. The parser **must not** inject those fields to satisfy a type.

```ts
export type ThoughtSpeechDraft = {
  mode: SpeechMode;
  mustSay: string[];
  mustNot: string[];
  surfaceDraft: string | null;
  acceptableRealizations: string[];
  presentationDirectives: string[];
};

export type ThoughtSettlementDraft = {
  schemaVersion: SettlementSchemaVersion;
  cycleId: CycleId;
  generation: Generation;
  authorityEpoch: AuthorityEpoch;
  occupantId: OccupantId;
  architectureEpoch: typeof ARCHITECTURE_EPOCH;
  triggerRef: string;
  interpretation: {
    discourseActs: DiscourseAct[];
    referentBindings: ReferentBinding[];
    corrections: CorrectionRecord[];
    unresolvedAmbiguities: string[];
    topics: string[];
  };
  commitments: {
    epistemic: EpistemicCommitment[];
    conversational: ConversationalCommitment[];
    stance: Stance;
  };
  speech: ThoughtSpeechDraft;
  workingContextDelta: WorkingContextDelta[];
  concernDeltas: ConcernDelta[];
  occupancyDelta: OccupancyDelta[];
  futureTriggers: FutureTriggerDelta[];
  subscriptions: SubscriptionDelta[];
  durableNominations: DurableNomination[];
  operations: {
    observationsConsumed: string[];
    effectsCompleted: string[];
    intentsStillInFlight: string[];
  };
  authority: {
    objectionsApplied: AuthorityCode[];
    revisionCount: number;
  };
};

export type PublishedSpeech = ThoughtSpeechDraft & {
  finalLicensedText: string | null;
};

export type PublishedCognitiveSettlement = ThoughtSettlementDraft & {
  speech: PublishedSpeech;
  settlementId: string;
};

/** Harness/publication alias. Never the Thought JSON type. */
export type CognitiveSettlement = PublishedCognitiveSettlement;
```

`ThoughtSettlementStep.settlement` is **`ThoughtSettlementDraft`**. Table `settlements.payload_json` stores **`PublishedCognitiveSettlement`**.

Kernel finalization (same generation, before publish):

```
surfaceDraft
  → optional starved Expression
  → fidelityCheck
  → renderForTransport (KEEP mechanical; non-semantic)
  → finalLicensedText
  → publishSemanticTransaction
```

**Audit property:** `outbox.licensedText === published.speech.finalLicensedText ===` the exact text passed into `planContentBubbles`.

## C.published field list (for DiscourseAct onward)

**File:** `settlement/schema.ts`.

```ts
export type SettlementSchemaVersion = 1;

export type DiscourseAct =
  | "inform"
  | "ask"
  | "correct"
  | "acknowledge"
  | "disagree"
  | "hold"
  | "silence"
  | "other";

export type ReferentBinding = {
  span: string;                    // surface form ("HY3", "the second one", "it")
  concernId?: ConcernId;
  entityKey?: string;
  sourceTurnIds: string[];         // evidence log ids
};

export type CorrectionRecord = {
  correctedTurnIds: string[];
  fromSpan: string;
  toSpan: string;
  concernId?: ConcernId;
};

export type EpistemicCommitment = {
  dimensions: EpistemicDimensions; // §Q
  statement: string;
};

export type ConversationalCommitment =
  | "answer"
  | "ask"
  | "acknowledge"
  | "disagree"
  | "hold"
  | "silence";

export type Stance = {
  warmth: "low" | "medium" | "high";
  humorAllowed: boolean;
  disagreement: boolean;
  uncertaintyDisplay: boolean;
};

export type SpeechMode = "none" | "draft";

// ThoughtSettlementDraft / PublishedCognitiveSettlement are defined in §C above.
// Do not re-export a third CognitiveSettlement shape here.
```

**Validation** (`settlement/validate.ts`): `validateThoughtSettlementDraft` for model JSON; `validatePublishedSettlement` after kernel finalization.

| Condition | Result |
|---|---|
| unknown extra required-path missing | `malformed` |
| `schemaVersion !== 1` | `malformed` |
| `mode === "draft"` and (`surfaceDraft` null/empty) | `malformed` |
| `mode === "none"` and `surfaceDraft` non-null | `malformed` (must be null) |
| Thought JSON includes `finalLicensedText` / outbox / reservation / delivery fields | `malformed` |
| envelope vs nested vs active `cycleId`/`generation` mismatch | `stale` / `malformed`; no dispatch; no publish |
| nested `settlement.occupantId` / `authorityEpoch` mismatch vs active snapshot (unless documented epoch bump this pass) | `malformed` |
| `revisionCount > MAX_AUTHORITY_REVISIONS` | `malformed` |
| `effectsCompleted` id not in consumed receipts | `malformed` |
| draft/commitment conflict (spec §C.1) | `conflict` not publish |
| valid `mode=none` with occupancy/triggers | **ok** (private success) |

Malformed Thought output: **do not speak in Ashley’s voice**. Emit `SystemNoticeOutbox` (spec §U). Do not run Expression. Do not call `decide()`.

### C.1 Draft / commitment precedence

Commitments own: epistemic tags; action/experience claims; identity claims; referent/correction obligations; mustSay/mustNot; speech.mode; substantive stance (disagree / acknowledge correction / do not mention X).

`surfaceDraft` owns wording inside that envelope.

**Conflict → do not deliver.** Return to Thought (counts as one Authority revision). Expression may not repair.

**Empty `commitments.epistemic` and empty `conversational` while `mode=draft` and draft length > 0** = causal failure (S21/S26).

**Implicature:** licensed by stance + conversational commitments. A joke that asserts a world fact needs that fact in epistemic commitments or `mustNot`.

**Escalation E2:** if one model call cannot produce both, **settle then draft** inside the same Thought role and same `(cycleId, generation)` as another **pass**. Still Thought. Not Expression-with-transcript.

### C.2 Speech transformation (frozen order)

Expression, if enabled, runs **before** semantic publication. It cannot change published speech after the outbox row exists.

```
Thought surfaceDraft
  → optional starved Expression adaptation
  → fidelityCheck (reject → Thought revision, not Expression invention)
  → renderForTransport (KEEP; typography + marker strip only)
  → kernel sets published.speech.finalLicensedText
  → publishSemanticTransaction writes SpeechOutboxRow.licensedText = finalLicensedText
  → OutboxDeliveryProjector copies that exact text to nuclear draft_text / bubbles
```

| Condition | `finalLicensedText` |
|---|---|
| `expressionEnabled === false` | `renderForTransport(surfaceDraft)` |
| Expression ran and fidelity passed | `renderForTransport(post-Expression text)` |
| `mode === "none"` | null; no speech outbox row |

Canonical published-speech field: **`finalLicensedText`** on `PublishedCognitiveSettlement`; **`licensedText`** on `SpeechOutboxRow`. They must be equal. Do not require `licensedText === surfaceDraft` when Expression or renderForTransport changed bytes.

---

---

## D. Thought input / output / workspace

**File:** `thought/input.ts`, `thought/run.ts`.

```ts
export type ThoughtInput = {
  cycleId: CycleId;
  generation: Generation;
  occupantId: OccupantId;
  authorityEpoch: AuthorityEpoch;
  trigger: { kind: CycleTriggerKind; ref: string };
  rawConversation: ConversationEvidenceRecord[]; // last N + current trigger, unevicted
  workingContext: WorkingContextItem[];
  occupancy: MindOccupancy[];
  constitution: IdentitySlice;       // always-on constitutional + stable self
  learnedSelfSlice: LearnedSelfSlice;
  capabilityReality: CapabilityReality;
  observations: Observation[];       // perception + tools already returned this cycle

  retrieval: RetrievalResult;
  inFlight: InFlightRecord[];
  authorityObjections: AuthorityCode[];
  runtimeCondition: RuntimeCondition;
};

export type CapabilityReality = {
  vision: boolean;
  attachmentText: boolean;
  conversationalRead: boolean;
  webSearch: boolean;
  canOfferProjectInspection: boolean;
  canOfferWorkspace: boolean;
  canOfferVerification: boolean;
  canOfferAuthorship: boolean;
  canOfferBoundedOperation: boolean;
  canOfferPatchExport: boolean;
  approvedProjectIds: string[];
};

export type ThoughtStepKind =
  | "observation_request"
  | "effect_proposal"
  | "settlement"
  | "failure";

export type ThoughtPassIndex = number; // 1-based

export type ThoughtStepBase = {
  kind: ThoughtStepKind;
  cycleId: CycleId;
  generation: Generation;
  pass: ThoughtPassIndex;
  requestId: string;
  occupantId: OccupantId;
};

export type ThoughtObservationRequestStep = ThoughtStepBase & {
  kind: "observation_request";
  observationRequest: ObservationRequest;
  correlationId: string;
  expectedResultType: "observation";
  deadlineAtMs: number;
};

export type ThoughtEffectProposalStep = ThoughtStepBase & {
  kind: "effect_proposal";
  effectProposal: EffectProposal;
  correlationId: string;
  expectedResultType: "effect_receipt";
  deadlineAtMs: number;
};

export type ThoughtSettlementStep = ThoughtStepBase & {
  kind: "settlement";
  settlement: ThoughtSettlementDraft;
};

export type ThoughtFailureStep = ThoughtStepBase & {
  kind: "failure";
  reason:
    | "malformed"
    | "unavailable"
    | "revision_exhausted"
    | "pass_exhausted"
    | "cancelled";
};

export type ThoughtStepOutput =
  | ThoughtObservationRequestStep
  | ThoughtEffectProposalStep
  | ThoughtSettlementStep
  | ThoughtFailureStep;
```

Do **not** export a competing `ThoughtOutput = settlement | failure` union. Parse model JSON into `ThoughtStepOutput` only.

Thought **must** see: current trigger text, last N evidence turns, WC, constitution, capability reality, compact occupancy, LearnedSelf slice, retrieval candidates **including trigger terms**, perception Observations **before** the first Thought call of the generation, plus any intra-generation observations/receipts from prior passes.

Thought **must not** be called with `decide()` output as authoritative meaning. `base Decision` is not an input field.

**Cognitive Workspace:** in-memory only for the generation. Type:

```ts
export type CognitiveWorkspace = {
  notes: string;                     // free-form; NOT stored as belief
};
```

Workspace may carry forward across **passes of the same generation**. Discard on preempt/generation bump. Persisting Workspace into Memory is forbidden (S10). Do not persist hidden chain-of-thought. Durable continuity of the operation loop is `thought_steps` rows: kind, ids, observation/receipt payloads — not Workspace notes.

### D.1 Thought operation state machine

```
thinking
  → parse ThoughtStepOutput
  → observation_request | effect_proposal
       → Authority at proposal
       → awaiting_operation (in_flight / observation exec)
       → receipt or observation reinjected into ThoughtInput.observations / inFlight
       → thinking (next pass)
  → settlement
       → Authority at settlement
       → optional Expression + fidelity (spec C.2)
       → publishing
  → failure
       → infrastructure notice; no Ashley voice
```

Cancellation: abort `completeChat` `signal` when generation is preempted. **Identity freeze:** `ThoughtStepBase.cycleId === active cycleId`, `ThoughtStepBase.generation === active generation`. Nested `ObservationRequest` / `EffectProposal` / `ThoughtSettlementDraft` `cycleId`/`generation` must equal the envelope. Nested settlement `occupantId` and `authorityEpoch` must match the active Thought snapshot unless this pass documents an epoch bump already applied in-sidecar. Any mismatch: **STALE / MALFORMED** — no observation dispatch, no effect dispatch, no publication, no outbox. Tests: a nested EffectProposal with stale generation must not execute even if the outer envelope was rewritten.

**Pass accounting (separate counters, persisted in `thought_attempt_counters`):**

| Counter | Counts |
|---|---|
| `thoughtModelAttempts` | every network/model invocation |
| `acceptedThoughtPasses` | valid `ThoughtStepOutput` accepted for the **current** generation |
| `structuralRetries` | parser/schema retries of one attempted pass (max 2; not extra passes) |
| `composeCancelledAttempts` | abandoned because newer owner evidence composed/preempted |
| `authorityRevisions` | Authority send-backs |
| `observationRounds` / `effectRounds` | accepted operation loops |

`MAX_THOUGHT_PASSES` bounds **`acceptedThoughtPasses`**, not cancelled stale calls. `MAX_THOUGHT_MODEL_ATTEMPTS` bounds raw invocations. Rapid-message test: three owner messages may cancel/restart calls without exhausting the semantic operation budget. Only current generation publishes.

**Caps:** `acceptedThoughtPasses > MAX_THOUGHT_PASSES` → `failure.reason=pass_exhausted`. Observation/effect rounds as before. Authority revisions independent.

**What is re-sent on the next pass:** full original `ThoughtInput` evidence (log, WC, constitution, capability, occupancy, LearnedSelf, retrieval) plus appended observations/receipts plus compact `priorSteps[]` `{ kind, requestId, correlationId, observation|receipt }` without Workspace prose. Original evidence remains available; it is not replaced by the step summary.

**Malformed model result:** same pass, bounded structural retry; then `failure.reason=malformed`. No publish.

**Compose while thinking:** cancel in-flight model via `signal`; bump is **not** required if no published outbox and no irreversible in_flight — restart interpret as **new pass, same generation** with fuller log. Preempt if outbox published or irreversible in_flight — new generation; stale results ignored.

**Invariant:** only the current **accepted generation** may publish meaning/speech. Raw model call attempts may be > 1. Tests must not require `thoughtModelAttempts === 1` for rapid-message scenarios. Tests must require `acceptedSettlements === 1` and stale drafts not delivered.

### D.2 completeChat adapter (frozen)

Live source (`apps/agent-service/src/mistral-client.ts`):

```ts
export type CognitiveDispatchOptions = CompletionOptions & {
  attentionDb: DatabaseSync; // REQUIRED; throws DispatchDataPlaneMissingError if missing
  modelFabricControlDir?: string;
  modelFabricControlRootMode?: ControlRootMode;
  contextProjection?: ContextProjection;
  contextProjectionEvidenceRefs?: readonly CoreEvidenceRef[];
  contextPolicyId?: string;
  contextBudgetMode?: ContextBudgetMode;
  contextBudgetPolicyId?: string;
  contextBudgetMaxUtf8Bytes?: number;
  contextBudgetSectionBudgets?: Record<string, number>;
};

export async function completeChat(
  messages: ChatMessage[],
  options: CognitiveDispatchOptions,
): Promise<{ text: string; model: string; modelAlias: string; resolvedModelId: string | null; /* … */ }>;
```

`CompletionOptions` includes `route`, `responseFormat`, `signal`, `lane`, `purpose`, `logicalRole`, `deadlineAtMs`, `decisionId`, `deliveryReservationId`, `ownerId`, temperature, maxTokens.

v0.2.1 Thought adapter **must** call that function. Frozen wrapper:

```ts
export type ThoughtCompleteOptions = CognitiveDispatchOptions & {
  attentionDb: DatabaseSync;
  route: "thought";
  responseFormat: "json_object";
};

export async function invokeThoughtComplete(
  messages: ChatMessage[],
  options: ThoughtCompleteOptions,
): ReturnType<typeof completeChat>;
```

**`attentionDb` is retained.** It is the authorized open nuclear handle for `runAttentiveDispatch` (Wave 4). It is not a semantic author and not the sidecar handle. No phase in this packet removes it. Every Thought `completeChat` call in tests must receive the same `attentionDb` the kernel was constructed with. Optional Expression uses the same required `attentionDb` on `route: "ashley_expression"`.

KernelDeps must not use a reduced `{ route }` options type.

**Model call:** route `"thought"` (KEEP registry). Response format JSON object matching a `ThoughtStepOutput` envelope. **Decision rule:** accept `{ kind, ... }` at top level; if `kind` omitted and a `CognitiveSettlement` shape is present, treat as `kind: "settlement"` (one-call settlement+draft). Reject if `kind` and flat settlement fields conflict.

Temperature: keep current Thought `0.15` unless occupant swap experiment E6 says otherwise.

---

## E. Conversation Evidence Log / Inbox

**File:** `evidence/conversation-log.ts`, `cycle/inbox.ts`.

```ts
export type EvidenceSourceStatus =
  | "available"
  | "redacted"
  | "deleted"
  | "unavailable";

export type DataClassification = "never_public" | "secret" | "internal";

export type ConversationEvidenceRecord = {
  rowId: string;                     // primary key
  lineageId: string;                 // stable across edits
  version: number;                   // edits append version+1, same lineageId
  conversationId: ConversationId;
  role: "owner" | "ashley" | "system";
  text: string | null;               // null if redacted/unavailable; never raw credential-shaped text
  createdAtMs: number;
  discordMessageIds: string[];
  reservationId: ReservationId | null;
  producingCycleId: CycleId | null;
  architectureEpoch: typeof ARCHITECTURE_EPOCH | "legacy";
  contentHash: string;
  sourceStatus: EvidenceSourceStatus;
  dataClassification: DataClassification;
  secretOmitted: boolean;
  delivered: boolean;                // ashley-role rows: true only after Discord receipt of that text
};

export type InboxConsumerStatus =
  | "pending"
  | "claimed"
  | "consumed"
  | "failed_retryable";

export type InboxEvent = {
  id: string;
  conversationId: ConversationId;
  kind:
    | "owner_message"
    | "idle_opportunity"
    | "subscription_item"
    | "future_trigger_due"
    | "receipt"
    | "recovery";
  payload: Record<string, unknown>;
  createdAtMs: number;
  status: InboxConsumerStatus;
  claimToken: string | null;
  workerId: string | null;
  leaseExpiresAtMs: number | null;
  attemptCount: number;
  claimedAtMs: number | null;
  consumedAtMs: number | null;
};
```

### E.1 Durable Discord ingress (frozen)

Live source today (`handleMessage` → `TurnBuffer` → `drainTurn` inside `ChannelQueue` → `chatText` → `POST /chat/text` awaited through Thought and often `sendBubbles`) **serializes inbound cognition**. Message B cannot reach agent-service while Thought A runs. Removing `activeOwners` does not fix this.

**Required property:** a new Discord owner message is durably admitted to the server-side inbox/evidence log **without waiting** for the previous Thought cycle to finish. Delivery ordering may remain serialized.

Frozen shape:

```
Discord messageCreate (owner gate, kill-switch, TurnBuffer fragment merge KEEP)
    ↓
POST /chat/ingress   // NEW; ACK durable append; does NOT run Thought
    ↓
agent-service inbox + Conversation Evidence Log (sidecar)
    ↓
cycle compose/preempt
    ↓
later: outbox projector → nuclear reservation → ChannelQueue sendBubbles only
```

**Endpoint:** `POST /chat/ingress` in `apps/agent-service/src/server.ts`.

Request body (same inbound fields as current `/chat/text`): `message`, `userId`, `channel`, `threadId`, `inboundDiscordMessageIds`, `finalFragmentReceivedAtMs`, `attachments`, `discordPresence`.

Response: HTTP **202** `{ evidenceRecordId, inboxEventId, admittedAtMs, duplicate?: boolean }`. Must return after sidecar append + inbox enqueue commit. Must not await Thought.

**Bot:** `apps/discord-bot/src/agent-client.ts` adds `ingressChat` calling `/chat/ingress`. `handleMessage` / TurnBuffer `onReady` MUST call `ingressChat` **outside** `channelQueue.enqueue`. Extract `createMessageCreateHandler(deps)` so tests inject `ingressChat` and `channelQueue`. `ChannelQueue` is **delivery-only** (KEEP abort-on-new-message for bubble pacing).

**Legacy/shadow failure isolation:** after attempting sidecar ingress, if sidecar infrastructure throws, **log a shadow/legacy defect and still enqueue legacy `chatText`+send**. Shadow/legacy must not reduce production availability. **v021:** ingress is production-authoritative; durable ingress failure fails closed; do **not** silently fall back to legacy cognition.

**Bot tests:** sidecar 5xx/timeout during `shadow` still produces a legacy reply; during `v021` does not call `chatText`.

**TurnBuffer KEEP** for fragment coalescing only (1500ms/5s). It is not a cognition mutex.

**`POST /chat/text` KEEP** until cutover for legacy/shadow live replies. New kernel must not depend on it for durable admit.

**HTTP 202** means durable admission **and** a durable consumer will process the inbox row after restart. Phase 08 wires the consumer loop: atomic claim per conversation (lease), one active semantic generation, startup scan of `pending`/`claimed` with expired lease/`failed_retryable`. Crash after 202 before cycle: event still claimed later. Crash after publish before `consumed`: idempotent recovery (settlement unique on cycle+generation). Duplicate ingress: same discord id → `duplicate: true`, no second evidence lineage.

### E.1a Privacy on ingress (KEEP `detectCredentialShape`)

Owner text: `detectCredentialShape` (`apps/agent-service/src/core/privacy/secrets.ts`). On hit: persist `CREDENTIAL_OMITTED_PLACEHOLDER`, `dataClassification="secret"`, `secretOmitted=true`. Do not persist raw credential-shaped text in sidecar, causal ledger, qualification artifacts, or shadow replicator. Perception/Observation payloads and EffectReceipts must use the same omission. Thought may receive ephemeral request material only under existing privacy policy. Legacy import must not declassify protected nuclear rows.

### E.1b Delivery-truth for Ashley-role rows

`role=ashley` Conversation Evidence means **what Doc actually received**. Write it from delivered/receipted outbox text + Discord ids. If a published outbox is never delivered, conversation history must **not** claim Ashley said it. Semantic/causality history may record intended/drafted speech. “What did you just say?” uses delivered evidence only.

### E.1c Shadow conversation Doc experienced

Q5: legacy Ashley replies to Doc. Candidate Thought must see:

A. Owner inbound → sidecar evidence (from `/chat/ingress` only; **not** also from `shadow/replicator.ts`).
B. Legacy Ashley **delivered** reply → replicator mirrors actual delivered text into sidecar `role=ashley`, `architectureEpoch=legacy`, `delivered=true`, classified.
C. Candidate shadow draft → evaluation/ledger only. **Must not** enter Conversation Evidence as “what Ashley said.”

Idempotency: Discord message id / nuclear reservation id.

### E.2 Evidence compatibility (strategy A)

After **v021 cutover**, surviving slash/observer surfaces still read nuclear `mem_messages`. Freeze an idempotent **EvidenceCompatibilityProjector**: Conversation Evidence Log → `mem_messages` as **utterance evidence only** (not semantic interpretation). Preserve `dataClassification`. Distinguishes delivered Ashley speech from undelivered drafts (drafts are not projected). Not dual-write of production meaning.

Covered KEEP surfaces: `/remember`, `/memory`, `/new`, `/forget`, `/continuity`, `/identity`, `/commitments`, `/status`, `/proactive`, and field-observation readers that use current messages. `/remember` Discord wiring is **Phase 08** (flag-gated); helper exists in Phase 06 tests.

Shadow: do not project candidate drafts into `mem_messages`. Legacy path already writes owner+legacy Ashley via existing delivery.

---

**Append rules:**

- Owner Discord text appends **immediately** in the inbox transaction (sidecar). Rapid messages: three owner rows for HY4 / I meant HY3 / it’s an LLM, never dropped.
- Edits: insert version+1; Thought sees latest available version; prior versions remain fetchable until retention.
- Redaction: `sourceStatus=redacted`, `text=null`. Thought must not invent the missing text (S3, S31).
- Ashley speech rows written **from delivered outbox text after Discord receipt**, not from settlement publication and not from Expression improvisation.
- `architectureEpoch`: sidecar-native rows `v0.2.1`; replicated legacy `legacy`.

Retention: hook `retention.ts` `applyRetention(nowMs)` no-ops in Phase 1 (function exists, deletes nothing). Phase 6 may enable; default windows are open parameters, not architecture.

---

## F. Working Context

**File:** `evidence/working-context.ts`.

```ts
export type WorkingContextItemType =
  | "topic"
  | "referent"
  | "correction"
  | "owner_teaching"
  | "question"
  | "commitment_temp"
  | "repair";

export type WorkingContextItem = {
  id: string;
  conversationId: ConversationId;
  type: WorkingContextItemType;
  text: string;
  concernId: ConcernId | null;       // reference, not a second essay
  sourceTurnIds: string[];
  status: "active" | "superseded" | "abandoned";
  supersedesId: string | null;
  updatedGeneration: Generation;
};
```

**Writer:** settlement txn only. **Reader:** Thought. **Class:** semantic.

```ts
export type WorkingContextDelta =
  | { op: "upsert"; item: Omit<WorkingContextItem, "updatedGeneration"> }
  | { op: "supersede"; id: string; replacement: Omit<WorkingContextItem, "updatedGeneration"> }
  | { op: "abandon"; id: string };
```

Correction: `op: "supersede"` plus new item `type=correction`. Abandon: `op: "abandon"`. Persistence: sidecar table `working_context_items`.

Owner teaching (“it’s an LLM”) becomes `owner_teaching` **at publication**, available to the next Thought call in this conversation without waiting for Memory admission.

---

## G. Concern lineage + Mind occupancy

```ts
export type ConcernId = string;

export type ConcernRecord = {
  concernId: ConcernId;
  conversationId: ConversationId;
  statement: string;
  sourceTurnIds: string[];
  dimensions: EpistemicDimensions;
  assertionKey: AssertionKey | null; // if later admitted
  status: OccupancyStatus;           // denormalized latest; occupancy is authority for occurrent status
  snapshotHash: string;              // hash(statement + dimensions + assertionKey)
};

export type OccupancyStatus =
  | "active"
  | "investigating"
  | "waiting_for_evidence"
  | "dormant_but_revisitable"
  | "resolved"
  | "quarantined";

export type MindOccupancy = {
  conversationId: ConversationId;
  concernId: ConcernId;
  status: OccupancyStatus;
  priority: number;
  updatedCycle: CycleId;
  updatedGeneration: Generation;
};

export type ConcernDelta =
  | { op: "upsert"; record: Omit<ConcernRecord, "snapshotHash"> }
  | { op: "resolve"; concernId: ConcernId };

export type OccupancyDelta =
  | { op: "set"; occupancy: Omit<MindOccupancy, "updatedCycle"> };

export type FutureTriggerDelta =
  | { op: "create"; trigger: Omit<FutureTrigger, "status"> }
  | { op: "cancel"; triggerId: string };

export type SubscriptionDelta =
  | { op: "create"; subscription: Omit<ObservationSubscription, "status"> }
  | { op: "cancel"; subscriptionId: string };

```

**One lineage per concern.** Occupancy points; it does not copy `statement`.

**Priority:** compact always-on uses top `DEFAULT_OCCUPANCY_COMPACT_K` by priority then recency. Never a proactive score.

**Resolve:** settlement sets occupancy `resolved` and concern status `resolved`. **Dormant:** idle no-ops N times (default 3 — open parameter `IDLE_NOOP_BEFORE_DORMANT`) → Thought should drop or occupancy `dormant_but_revisitable`.

**Stale wake:** FutureTrigger/Subscription fire with `snapshotHash` mismatch OR occupancy `resolved` → **do not** start a stale-meaning cycle. Record suppress on ledger. Optional recovery cycle that sees **current** occupancy only.

---

## H. FutureTriggers

```ts
export type FutureTrigger = {
  triggerId: string;
  conversationId: ConversationId;
  concernId: ConcernId;
  snapshotHash: string;
  dueAtMs: number;
  status: "scheduled" | "fired" | "cancelled" | "suppressed_stale";
};
```

**Writer:** settlement. **On fire:** revalidate occupancy + hash. Payload is **not** a copy of the concern essay.

Duplicate due trigger: idempotent fire (same triggerId).

---

## I. ObservationSubscriptions

```ts
export type ObservationSubscription = {
  subscriptionId: string;
  conversationId: ConversationId;
  concernId: ConcernId | null;
  source: string;                    // e.g. "curiosity.cur_items", "owner_authorized"
  scope: string;
  topicKeys: string[];               // exact/structured keys Thought named
  match: "equality" | "substring";
  expiresAtMs: number | null;
  status: "active" | "cancelled";
};
```

Originate from **published settlement** or **explicit owner authorization** (slash or natural language settled by Thought). Matching is mechanical. Items become `Observation` with provenance `subscriptionId + source`. Thought decides relevance. LearnedSelf may bias Thought, not matching.

Max `DEFAULT_MAX_SUBSCRIPTIONS` active per conversation; excess create is Authority `REVISION`/`malformed` at settlement validate — **decision rule:** reject the new subscription, keep existing; do not silently drop old ones.

---

## J. Retrieval

```ts
export type RetrievalRequest = {
  triggerTerms: string[];            // ALWAYS includes current owner text tokens; short tokens kept
  workingContextTopics: string[];    // hints, never exclusive query
  assertionKeys: string[];
  timeRangeMs?: { from: number; to: number };
  includeLogSearch: true;            // constant true on ordinary turns
};

export type RetrievalHitKind = "lexical" | "key" | "time" | "log" | "vector";

export type RetrievalHit = {
  kind: RetrievalHitKind;
  ref: string;
  snippet: string;
  score: number;                     // rank only; S5: not relevance
};

export type RetrievalResult = {
  request: RetrievalRequest;
  hits: RetrievalHit[];
  miss: boolean;
};
```

**Tokenizer for discovery (replaces length≥4 filter for the new kernel):**

```ts
export function tokenizeForDiscovery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1);
}
```

Keep a **separate** `tokenizeForOverlap` if needed for ranking, but **HY3, LLM, API, GPT, it** must remain in `triggerTerms`. Tests use HY3 and a perturbed entity `Qwen` / `M2`.

**Miss:** `miss=true` → Thought may issue in-cycle `ConversationHistoryRequest` (counts toward `DEFAULT_MISS_ROUND_CAP`). Vector hits optional; if unimplemented, `kind:"vector"` is absent — allowed. Keys never disable lexical/time/log.

History-miss protocol: Thought may speak that she does not have that stretch of log (`sourceStatus` or miss), without inventing.

---

## K. Perception Observation

```ts
export type Observation = {
  observationId: string;
  cycleId: CycleId;
  generation: Generation;
  derived: boolean;
  replaySafe: boolean;
  modality: "text" | "image" | "page" | "tool" | "subscription" | "receipt";
  payload: unknown;                  // bounded; no secrets
  provenance: string;
  rawOutranksDerivedOf?: string;
};
```

Perception runs **before** Thought in `assembling`. Derived observations set `derived=true`. Raw outranks derived (S3).

---

## L. Observation vs Effect

**Rule:** replay-safe as pure read → `ObservationRequest`. Else `EffectProposal`.

| Example | Class |
|---|---|
| Sandbox `project.read_file` / list / search | Observation if executor is read-only |
| HTTP GET public curiosity fetch (existing network.ts bounds) | Observation |
| Sandbox write/edit/delete, M6 operate, patch_export, Discord send, POST | Effect |
| Mark-as-read, paid API, browser click | Effect |

Ambiguous → Effect (fail closed).

```ts
export type ObservationRequest = {
  requestId: string;
  cycleId: CycleId;
  generation: Generation;
  kind: string;
  request: unknown;
  replaySafe: true;
};
```

---

## M. EffectProposal / in_flight / EffectReceipt

```ts
export type EffectProposal = {
  effectId: string;
  cycleId: CycleId;
  generation: Generation;
  idempotencyKey: IdempotencyKey;
  kind: string;                      // sandbox operationalRequest.kind values KEEP
  request: unknown;
  authorityEpoch: AuthorityEpoch;
};

export type InFlightRecord = {
  effectId: string;
  cycleId: CycleId;
  generation: Generation;
  idempotencyKey: IdempotencyKey;
  dispatchedAtMs: number;
  status: "in_flight" | "receipted" | "unknown";
};

export type EffectReceipt = {
  receiptId: string;
  effectId: string;
  idempotencyKey: IdempotencyKey;
  outcome: "succeeded" | "failed" | "unknown";
  claims: Record<string, unknown>;
  atMs: number;
};
```

Persist `in_flight` **before** dispatch. Duplicate `idempotencyKey` returns existing receipt; do not re-execute if executor honors the key. Timeout → `unknown`, not non-occurrence (S12).

Reuse `operational_jobs` as the durable in_flight table where the effect is a sandbox job. Sidecar stores a pointer `origin_job_id`.

---

## N. Authority

**File:** `authority/codes.ts`, `authority/check.ts`.

```ts
export type AuthorityCode =
  | "CURRENTNESS_UNVERIFIED"
  | "RECEIPT_REQUIRED"
  | "RECEIPT_CONTRADICTS_CLAIM"
  | "IN_FLIGHT_UNKNOWN"
  | "CAPABILITY_UNAVAILABLE"
  | "EFFECT_NOT_AUTHORIZED"
  | "RELATIONAL_BOUNDARY"
  | "RELATIONAL_WITHDRAWAL"
  | "SOURCE_CLASS_INSUFFICIENT"
  | "STALE_STATE"
  | "IDENTITY_MUTATION_FORBIDDEN"
  | "SECRET_OR_CREDENTIAL"
  | "REVISION_BUDGET_EXHAUSTED"
  | "DISPATCH_EPOCH_CHANGED"
  | "STALE_GENERATION"
  | "DRAFT_COMMITMENT_CONFLICT"
  | "EMPTY_COMMITMENTS_WITH_DRAFT";

export type AuthorityStage = "proposal" | "settlement" | "dispatch";

export type AuthorityVerdict =
  | { ok: true }
  | { ok: false; codes: AuthorityCode[] };

export function checkAuthority(
  stage: AuthorityStage,
  input: {
    settlement?: ThoughtSettlementDraft | PublishedCognitiveSettlement;
    proposal?: EffectProposal | ObservationRequest;
    packs: AuthorityPacks;
    authorityEpoch: AuthorityEpoch;
  },
): AuthorityVerdict;
```

```ts
export type AuthorityPacks = {
  epistemic: { allowInferredWorldClaims: boolean };
  currentness: { requireObservationForLatest: boolean };
  receipt: { receiptsByEffectId: Record<string, EffectReceipt> };
  capability: CapabilityReality;
  operational: { sandboxAvailable: boolean };
  relational: { withdrawalActive: boolean; neverMention: string[] };
  stateEpoch: { authorityEpoch: AuthorityEpoch };
};
```

Packs (deterministic, no model): `epistemic`, `currentness`, `receipt`, `capability`, `operational`, `relational`, `stateEpoch`.

- **Proposal:** gate intents.
- **Settlement:** gate publish + draft detectors vs commitments (currentness untagged evasive draft fails).
- **Dispatch:** immediately before executor run, recheck **mutable** packs (withdrawal, capability, sandbox permission, `authorityEpoch`) **and** `proposal.cycleId`/`generation` === current active dispatchable generation. If preempted: do **not** dispatch; `STALE_GENERATION`. Already-dispatched effects remain receipt/recovery. Do not reinterpret intent.

Authority never authors `surfaceDraft`. `maxRevisions = 2` after first bound, then fail closed or publish largest fully licensed **droppable** subset (`mode=none` if speech cannot be licensed) — never livelock.

Currentness: Thought tags **and** draft-side detectors (reuse honesty claim regexes as **detectors only**, not surgery). Untagged “latest/current” without observation fails `CURRENTNESS_UNVERIFIED`.

Relational “never mention X”: stored constraint; Authority matches `mustNot` / draft.

---

## O. Speech outbox

```ts
export type OutboxSendStatus =
  | "pending"
  | "projecting"
  | "projected"
  | "sending"
  | "delivered"
  | "partially_delivered"
  | "send_failure"
  | "suppressed"
  | "suppressed_shadow";

export type OutboxOrigin = "live" | "shadow";

export type DeliveryIntent = {
  ownerId: string;
  channel: string;
  threadId: string;                 // = ConversationId
  conversationId: ConversationId;
  trigger: "owner_message_reactive" | "idle" | "future_trigger" | "subscription";
  deliveryLane: "reactive" | "proactive";
  purpose: "licensed_speech";
};

export type SpeechOutboxRow = {
  outboxId: OutboxId;
  cycleId: CycleId;
  generation: Generation;
  conversationId: ConversationId;
  nuclearReservationId: ReservationId | null;
  licensedText: string;
  sendStatus: OutboxSendStatus;
  discordMessageIds: string[];
  suppressed: boolean;
  origin: OutboxOrigin;
  deliveryIntent: DeliveryIntent;
  nuclearFinalizationReason: string | null;
};
```

**Legal transitions:** `pending → projecting → projected → sending → delivered | partially_delivered | send_failure`; `pending|projecting|projected|sending → suppressed` (preempt undelivered); shadow publish **inserts `suppressed_shadow`**, never `pending`. Terminal: `delivered`, `partially_delivered`, `send_failure`, `suppressed`, `suppressed_shadow`. Restart: resume from stored status; never invent a reservation.

`mode=draft` + kernel `legacy` is impossible on this outbox. `mode=draft` + `shadow` → `origin=shadow`, `sendStatus=suppressed_shadow`. `mode=draft` + `v021` → `pending` then projector.

**Cutover precondition:** zero **sendable** rows (`pending|projecting|projected|sending`) with `origin=shadow`. Do not rely only on “projector was off.”

### O.1 ExternalizationGate (executive; not interestingness)

Source KEEP: `evaluateProactiveEligibility` mechanical checks in `agency/proactive-eligibility.ts`.

```ts
export type ExternalizationGateReason =
  | "ok"
  | "proactive_disabled"
  | "proactive_paused"
  | "daily_cap"
  | "chat_in_progress"
  | "unavailable"
  | "idle_floor"
  | "private_compute_budget";

export function evaluateExternalizationGate(input: {
  deliveryIntent: DeliveryIntent;
  paused: boolean;
  enabled: boolean;
  sentToday: number;
  maxPerDay: number;
  chatInProgress: boolean;
  availabilityOk: boolean;
  idleFloorRemainingSec: number;
  privateBudgetRemaining: number;
}): { ok: true } | { ok: false; reason: ExternalizationGateReason };
```

Applies only when `deliveryLane === "proactive"` (idle / FutureTrigger / subscription speech). Owner-message reactive speech is not gated by pause/daily cap/idle floor.

KEEP: `paused`, `enabled`, `daily_cap`, `chat_in_progress`, `unavailable` (own_time / availability), ordinary `idle_floor`.

RETIRE as **semantic shortcut:** `urgent_grounded` must **not** skip pause, daily cap, or availability. It must not decide interestingness. Thought already set `speech.mode=draft`.

If gate fails: semantic settlement **remains recorded**; outbox `suppressed` or stays unprojected per reason (`daily_cap` → defer until next eligible tick if still sendable and not shadow; `paused` → `suppressed` until owner unpauses then only **new** generations, not a backlog dump — **decision rule:** paused proactive outbox is `suppressed`, not delivered later automatically).

Proactive `threadId` = current `ConversationId` (active nuclear thread). Delivered speech becomes Conversation Evidence on that lineage.

### O.2 Outbox → nuclear delivery projector (frozen; version 1)

SQLite does not provide atomic commits across databases. **Bridge:** `OutboxDeliveryProjector`. Nuclear column via **versioned migration** (04; Phase 05), not unversioned ALTER in prose only.

Lane: `DeliveryIntent.deliveryLane` maps to nuclear `delivery_lane` / `trigger` (`reactive` vs `proactive`). **Do not** hardcode `delivery_lane = reactive` for every v0.2.1 speech.

Nuclear `DeliveryState` translation (nuclear has **no** `send_failure` state; that is `DeliveryFinalizationReason`):

| Nuclear state | Sidecar sendStatus |
|---|---|
| drafted / reserved | projecting or projected |
| sending | sending |
| committed | delivered |
| partially_delivered | partially_delivered |
| aborted / cancelled / expired | suppressed or send_failure using `finalizationReason` (`send_failure` / `send_failure_after_partial` → `send_failure` or `partially_delivered`) |

Projector tests must not assume a nuclear state named `send_failure`.

**Protocol:** pending → projecting → INSERT reservation (UNIQUE `cognitive_v021_outbox_id`) → store `nuclearReservationId` → projected → sending when Discord send starts → terminal as table above.

Shadow: projector **off**; rows are `suppressed_shadow`.

### O.3 SystemNoticeOutbox

Not Ashley speech. Not Memory. Independent of CognitiveSettlement.

```ts
export const THOUGHT_UNAVAILABLE_NOTICE =
  "[system] Thought did not complete. Please send the message again." as const;
```

Do **not** use first-person Ashley voice. Do **not** treat `recordAuxiliaryMessage` as a send function: it only records after a Discord send and requires an existing reservation. Frozen path: insert `system_notice_outbox` `pending` → projector creates a nuclear reservation (transport may use `trigger=reactive` / lane `reactive` for DM mechanics) → send the notice text → persist Discord id → `recordAuxiliaryMessage` **after** send if a reservation exists. Conversation Evidence `role=system`. Cannot answer the owner’s question.

---

## P. DurableNomination

```ts
export type AssertionKey = string;

export type DurableNomination = {
  nominationId: string;
  cycleId: CycleId;
  generation: Generation;
  assertionKey: AssertionKey;
  statement: string;
  memoryKind: MemoryKind;
  dimensions: EpistemicDimensions;
  supersedesAssertionKey: AssertionKey | null;
  concernId: ConcernId | null;
};
```

Queued in publish txn. Admission is async, off speech path. Fence: before live Memory write, if a later **published** generation superseded/retracted that key → no-op, ledger `admission_skipped_superseded`.

---

## Q. Durable Memory + epistemic dimensions + semantic kind

Dimensional epistemology answers **how we know**. `MemoryKind` answers **what kind of assertion**.

```ts
export type MemoryKind =
  | "owner_preference"
  | "owner_self_description"
  | "owner_goal"
  | "owner_world_claim"
  | "project_knowledge"
  | "commitment"
  | "relational_boundary"
  | "shared_episode"
  | "open_question"
  | "ashley_interpretation"
  | "learned_self_evidence";

export type EpistemicSource =
  | "owner_utterance"
  | "ashley_interpretation"
  | "tool"
  | "perception"
  | "receipt"
  | "prior_settlement";

export type EpistemicStatus =
  | "asserted"
  | "interpreted"
  | "unverified"
  | "contradicted"
  | "superseded"
  | "unresolved";

export type EpistemicTime = "current" | "historical" | "unknown_freshness";

export type EpistemicReliability =
  | "owner_supplied"
  | "fallible_observation"
  | "receipt_backed"
  | "inferred"
  | "unavailable_source";

export type EpistemicDimensions = {
  source: EpistemicSource;
  status: EpistemicStatus;
  time: EpistemicTime;
  reliability: EpistemicReliability;
};

export type MemoryAssertion = {
  assertionKey: AssertionKey;
  statement: string;
  memoryKind: MemoryKind;
  dimensions: EpistemicDimensions;
  lineageParentKey: AssertionKey | null;
  admittedGeneration: Generation;
  live: boolean;
};

export type MemorySupport = {
  supportId: string;
  assertionKey: AssertionKey;
  source: EpistemicSource;
  settlementId: string | null;
  evidenceLineageId: string | null;
  observationId: string | null;
  receiptId: string | null;
  dimensions: EpistemicDimensions;
  createdAtMs: number;
};
```

One `assertionKey` accumulates multiple `MemorySupport` rows (owner said X + tool later observes X). Do **not** overwrite a single EpistemicDimensions blob and lose source history.

**Views (deterministic; no LLM):** `OwnerKnowledgeView` = live assertions whose `memoryKind` is `owner_preference` | `owner_self_description` | `owner_goal` | `owner_world_claim`. `RelationalConstraintView` = live `relational_boundary`. No prose reinterpretation.

Reuse C1 `memory_assertions` **after cutover** or keep sidecar tables during shadow (**decision rule:** sidecar only in shadow; no dual-write of production C1).

---

## R. Identity / LearnedSelf (Option B)

```ts
export type IdentitySlice = {
  constitutional: string[];
  stableSelf: string[];
};

export type LearnedSelfSlice = {
  dispositions: string[];
  interests: string[];
};
```

Constitution: no ordinary writer. **This reconstruction does not implement automatic LearnedSelf accumulation.** There is no `LearnedSelfCandidate` admission writer, no v1 LearnedSelf write table, and Phase 06 must not invent one. Compact `LearnedSelfSlice` may be **empty** or **injected in tests** from already-admitted/quarantined nuclear rows as **read-only**. Cutover may **read** quarantined historical LearnedSelf; new automatic accumulation is **POST-CUTOVER MATURATION**. Architecture remains designed; the implementation packet does not say “implement accumulation” without a contract. World claims still must not be stuffed into the slice (test). Owner Model store remains **absent**.

---

## S. Calibration / occupant

```ts
export type RuntimeCondition = {
  fallback: boolean;
  compression: boolean;
  lookupFailed: boolean;
  thoughtUnavailable: boolean;
};

export type OccupantCalibration = {
  occupantId: OccupantId;
  notes: string[];                   // operational, not "Ashley is anxious"
};
```

Survives occupant swap: constitution, log, WC, concerns, Memory, non-styled LearnedSelf, relational constraints. Resets: occupant calibration, ExpressionProfile habits.

---

## T. Semantic Causality Ledger

```ts
export type CausalLedgerEntry = {
  cycleId: CycleId;
  generation: Generation;
  triggerKind: CycleTriggerKind;
  occupantId: OccupantId;
  authorityEpoch: AuthorityEpoch;
  settlementId: string | null;
  observationIds: string[];
  effectIds: string[];
  authorityCodes: AuthorityCode[];
  nominationIds: string[];
  outboxId: OutboxId | null;
  fidelity: "passed" | "rejected" | "skipped";
  architectureEpoch: typeof ARCHITECTURE_EPOCH;
};
```

**Observe only.** Not world evidence (S31). “Why did you say X?” → settlement + outbox + receipts.

---

## U. Infrastructure notice

See §O.3. `THOUGHT_UNAVAILABLE_NOTICE` is system text. Test: ledger `thoughtUnavailable=true`; no PublishedCognitiveSettlement speech; no Expression; Conversation Evidence `role=system` if delivered.

---

## V. Model routing

KEEP `completeChat`, route `thought` for Thought, optional `ashley_expression` for starved Expression. Thought JSON must validate as settlement. Do not pass `Decision` as Expression `decisionPrompt` on the new kernel.

Expression optional inputs: licensed draft, commitments, stance, directives, ExpressionProfile, MediumContext. **Forbidden evidence hash:** Expression prompt bytes must not contain owner transcript, memory dumps, perception payloads, or Workspace notes. Test hashes the Expression user/system strings.

---

## W. Sidecar isolation and initial DDL

```ts
export function reservedProductionCognitiveSidecarDbPath(): string {
  return join(reservedProductionDataDir(), "cognitive-v021.db");
}

export function openCognitiveSidecarDb(
  existing: DatabaseSync,
  options: { dataPlane: { kind: "production" | "isolated" }; migrate?: boolean },
): DatabaseSync;
```

Copy `openContinuityDb` reserved-path guard. Schema version **always 1** at open after applying complete v1 DDL. Shadow kernel **reads** replicated **legacy delivered** assistant text (replicator) and owner evidence (**ingress only**). **Writes only sidecar.** Production nuclear semantic writers stay live until configuration-only cutover. Additive nuclear outbox column is a versioned nuclear migration (04).

`shadow/replicator.ts`: mirror **legacy Ashley delivered Discord text** into sidecar Conversation Evidence (`role=ashley`, `architectureEpoch=legacy`, `delivered=true`). **Do not** copy owner inbound (ingress already did). Never write WC/Memory to nuclear in shadow. Candidate must never send Discord. Candidate outbox is `suppressed_shadow`.

### W.1 Initial schema (version 1 only)

**The SQL in [04_STORAGE_AND_DISPATCH_CONTRACT.md](04_STORAGE_AND_DISPATCH_CONTRACT.md) is the complete v1 DDL.** Phase 00 applies that file (`sidecar/schema-v1.sql`). Do not apply a meta-only subset. Do not bump to version 2. Meta insert: `implementation_spec_version='0.2.1.r3'`, `authority_epoch=1`.

If §W.1 and 04 diverge, HARD BLOCKER.

---

## X. Kernel entry

```ts
export type KernelRunResult = {
  cycleId: CycleId;
  generation: Generation;
  published: boolean;
  outboxId: OutboxId | null;
  infrastructureNotice: string | null;
  thoughtModelAttempts: number;
  acceptedThoughtPasses: number;
  composeCancelledAttempts: number;
  acceptedSettlements: number;
};

export function runCognitiveCycle(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  event: InboxEvent,
  deps: KernelDeps,
): Promise<KernelRunResult>;

export type KernelDeps = {
  nowMs: () => number;
  attentionDb: DatabaseSync;
  completeChat: typeof completeChat;
  runPerception: (input: {
    cycleId: CycleId;
    generation: Generation;
    ownerMessage: string;
  }) => Promise<Observation[]>;
  executeObservation: (req: ObservationRequest) => Promise<Observation>;
  executeEffect: (proposal: EffectProposal) => Promise<EffectReceipt>;
  checkAuthority: typeof checkAuthority;
  loadAuthorityPacks: () => AuthorityPacks;
  expressionEnabled: boolean;
  adaptExpression?: (input: {
    draft: string;
    commitments: ThoughtSettlementDraft["commitments"];
    stance: Stance;
    directives: string[];
    profile: string;
    medium: "discord";
  }) => Promise<string>;
  projectOutbox: (outboxId: OutboxId) => Promise<void>;
  constitution: IdentitySlice;
  capabilityReality: CapabilityReality;
};
```

Tests may fake `completeChat` but the fake must still accept `CognitiveDispatchOptions` including `attentionDb`. Production `sendDiscord` is **not** a KernelDeps function; Discord send is the existing bot pump after nuclear reservation projection.

`KernelRunResult.thoughtModelAttempts` counts raw model invocations (including compose restarts). `acceptedThoughtPasses` counts accepted semantic steps of the current generation. `acceptedSettlements` is 0 or 1 for the generation that published. Cancelled compose attempts must not exhaust `MAX_THOUGHT_PASSES`.

---

## Y. Causal acceptance harness

**File:** `acceptance/causal-harness.ts`

```ts
export type CausalBundle = {
  evidenceShownToThought: ConversationEvidenceRecord[];
  thoughtInputHash: string;
  settlement: PublishedCognitiveSettlement | null;
  workingContext: WorkingContextItem[];
  occupancy: MindOccupancy[];
  authorityCodes: AuthorityCode[];
  nominations: DurableNomination[];
  expressionInput: string | null;    // null if skipped
  outboxText: string | null;         // licensedText / finalLicensedText
  deliveredText: string | null;
  thoughtModelAttempts: number;
  acceptedSettlements: number;
  acceptedGeneration: Generation | null;
};

export function assertCausalInvariants(bundle: CausalBundle): void;
```

Hard fails if:

- `deliveredText` set AND `settlement` null (unless infrastructure notice path, which forbids Ashley voice)
- `expressionInput` contains transcript/memory/perception markers
- `mode=draft` AND commitments empty
- Expression skipped AND `outboxText !== renderForTransport(settlement.speech.surfaceDraft)` (when mode=draft)
- Expression ran AND `outboxText !== settlement.speech.finalLicensedText`
- Expression ran AND `outboxText` introduces mustNot violation
- `acceptedSettlements === 0` on owner_message ordinary turn that should speak or privately settle
- empty-house idle `thoughtModelAttempts !== 0`
- stale generation outbox delivered

---

## Z. Legacy import tool (frozen)

**Path:** library `apps/agent-service/src/core/cognitive-v021/migration/import-legacy.ts`; CLI `scripts/cognitive-v021/import-legacy-semantic-state.mjs`.

**Invocation:**

```
node scripts/cognitive-v021/import-legacy-semantic-state.mjs
  --nuclear <path>
  --continuity <path>
  --sidecar <path>
  --mode dry-run|apply|verify
```

| Item | Contract |
|---|---|
| Input | production-shaped `nuclear.db` + `continuity.db` copies (never live paths in rehearsal) |
| Output | sidecar `cognitive-v021.db` |
| Architecture metadata | written to `cognitive_sidecar_meta` + report JSON |
| Assertion lineage | C1 `memory_assertions` / eligible facts → `sidecar_memory_assertions` with `architectureEpoch` provenance `legacy-import`; `live=false` until Thought-era admission after cutover unless row already C1-live **and** owner gate says import-as-live (default: import as **quarantine** `live=false`) |
| Duplicate | same `content_hash`+`assertion_key` → no-op increment `duplicateCount` |
| Rerun | idempotent; second apply is no-op for already-imported hashes |
| Dry-run | no writes; report proposed counts |
| Verify | compare expected vs actual counts and hashes; nonzero mismatch exits nonzero |
| Rollback | delete sidecar file or restore sidecar snapshot; never write nuclear |
| Failure codes | `INPUT_UNREADABLE`, `SCHEMA_UNSUPPORTED`, `COUNT_MISMATCH`, `HASH_MISMATCH`, `PROVENANCE_MISMATCH`, `RESERVED_PATH_REFUSED` |

**Imported semantic classes:** conversation evidence (from `mem_messages` + inbound discord ids, preserving classification/secret omission), C1 assertions (quarantined), identity constitutional entries (read-only copy into `IdentitySlice` source, not LearnedSelf), open mind_state_items as concerns+occupancy **quarantined** (`status=quarantined` until Thought re-admits).

**Shadow vs import:** candidate semantic state from Q5 is **discarded/quarantined** at cutover (not live). Conversation Evidence of owner + **delivered** legacy Ashley **may survive**. Then initialize clean live semantic projections; then `import --apply` once into that clean sidecar. Do not apply import twice into a sidecar still holding shadow Memory/concerns.

**Cutover command order:** (1) `dispose-shadow-semantic-state` (verify zero sendable shadow outbox; drop/quarantine WC, concerns, occupancy, nominations, triggers, subscriptions, candidate outbox); (2) preserve/copy conversation evidence of delivered reality; (3) import-legacy apply+verify; (4) start `v021`.

**Quarantine classes:** `cur_takes`, episodes, learning_revisions without exact owner-reviewed ids, relationship scores, affect, decide() rows, Expression transcripts as meaning.

**Ignored:** V1 sandbox broker tables, capability observe/apply flags (remain nuclear), delivery_reservations (operational; not semantic import).

**Report:** `docs/cognitive-rework/v0.2.1/artifacts/runtime/LEGACY_IMPORT_REPORT.json` with `toolVersion`, counts expected/actual, hashes, `rejectedCount`, `quarantinedCount`, `duplicateCount`, `provenanceOk`. Count or hash mismatch is HARD BLOCKER 15.

Cutover runbook invokes `--mode apply` on isolated copies first, then `--mode verify` on the cutover sidecar.

---

## Qualification vs inhabit (pointer)

Software contracts in this file are proven exhaustively in **Q1** with stubs, programmed `ThoughtStepOutput`, and recorded fixtures. Live `completeChat` on `route=thought` is **Q3 bounded witness** plus Q5/Phase 11 real traffic — see [`QUALIFICATION_PROTOCOL.md`](QUALIFICATION_PROTOCOL.md). This spec does not authorize sending the architecture suite to the API.

---

## Interface name freeze (import these)

`ARCHITECTURE_EPOCH`, `IMPLEMENTATION_SPEC_VERSION`, `THOUGHT_CONTRACT_VERSION`, `COGNITIVE_SIDECAR_SCHEMA_VERSION`, `OUTBOX_BRIDGE_VERSION`, `LEGACY_IMPORT_TOOL_VERSION`, `MAX_THOUGHT_PASSES`, `MAX_THOUGHT_MODEL_ATTEMPTS`, `KernelMode`, `CycleId`, `Generation`, `CycleState`, `CycleTriggerKind`, `CycleRecord`, `ThoughtSettlementDraft`, `PublishedCognitiveSettlement`, `CognitiveSettlement`, `ThoughtInput`, `ThoughtStepOutput`, `ThoughtCompleteOptions`, `invokeThoughtComplete`, `CognitiveWorkspace`, `ConversationEvidenceRecord`, `InboxEvent`, `InboxConsumerStatus`, `WorkingContextItem`, `ConcernRecord`, `MindOccupancy`, `OccupancyStatus`, `FutureTrigger`, `ObservationSubscription`, `RetrievalRequest`, `RetrievalResult`, `Observation`, `EffectProposal`, `InFlightRecord`, `EffectReceipt`, `AuthorityCode`, `AuthorityStage`, `checkAuthority`, `SpeechOutboxRow`, `OutboxSendStatus`, `DeliveryIntent`, `OutboxDeliveryProjector`, `ExternalizationGateReason`, `evaluateExternalizationGate`, `DurableNomination`, `MemoryKind`, `EpistemicDimensions`, `MemoryAssertion`, `MemorySupport`, `IdentitySlice`, `LearnedSelfSlice`, `RuntimeCondition`, `CausalLedgerEntry`, `CausalBundle`, `assertCausalInvariants`, `runCognitiveCycle`, `publishSemanticTransaction`, `validateThoughtSettlementDraft`, `openCognitiveSidecarDb`, `reservedProductionCognitiveSidecarDbPath`, `tokenizeForDiscovery`, `THOUGHT_UNAVAILABLE_NOTICE`, `WorkingContextDelta`, `ConcernDelta`, `OccupancyDelta`, `FutureTriggerDelta`, `SubscriptionDelta`, `ObservationRequest`, `CapabilityReality`, `AuthorityPacks`, `KernelDeps`, `KernelRunResult`, `finalLicensedText`, `SystemNoticeOutbox`.

