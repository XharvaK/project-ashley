# 02 — Implementation-Grade Specification

**Status:** Software contract for Cognitive Architecture v0.2.1. Types and names here are frozen for all phases. Architecture laws: [00_ARCHITECTURE_REFERENCE.md](00_ARCHITECTURE_REFERENCE.md). Source mapping: [01_SOURCE_BASELINE_AND_MIGRATION_MAP.md](01_SOURCE_BASELINE_AND_MIGRATION_MAP.md).

**Spec version:** `IMPLEMENTATION_SPEC_VERSION = "0.2.1.r2"` (packet R2). Luna must persist this string on sidecar meta and qualification artifacts.

**Module root:** `apps/agent-service/src/core/cognitive-v021/`

**Schema file:** `apps/agent-service/src/core/cognitive-v021/types.ts` must export every type in this document under the **exact identifier** given. Later phases import those identifiers; they must not invent aliases (`CycleID` vs `CycleId`, `surface_draft` vs `surfaceDraft`).

**Classification of every stored field:** each contract section labels fields as **semantic authority**, **evidence**, **executive**, or **derived**. Derived stores have no independent writer.

---

## Global constants

```ts
export const ARCHITECTURE_EPOCH = "v0.2.1" as const;
export const IMPLEMENTATION_SPEC_VERSION = "0.2.1.r2" as const;
export const THOUGHT_CONTRACT_VERSION = 1 as const;
export const COGNITIVE_SIDECAR_SCHEMA_VERSION = 1 as const;
export const SETTLEMENT_SCHEMA_VERSION = 1 as const;
export const OUTBOX_BRIDGE_VERSION = 1 as const;
export const LEGACY_IMPORT_TOOL_VERSION = 1 as const;
export const MAX_AUTHORITY_REVISIONS = 2 as const;
export const MAX_THOUGHT_PASSES = 6 as const;
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
export type ConversationId = string;    // ownerId + channel thread key; use nuclear threadId
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

**Idle admit:** Agency may enqueue `idle_opportunity`. Fence admits Thought **iff** `count(occupancy status in active|investigating|waiting_for_evidence) > 0` OR `newSubscriptionItems > 0` OR due `FutureTrigger` after revalidation. Else **zero Thought calls**.

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

## C. Cognitive Settlement

**File:** `settlement/schema.ts`. JSON stored as `settlement_json` plus generated columns for cycleId/generation.

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

export type CognitiveSettlement = {
  schemaVersion: SettlementSchemaVersion;
  cycleId: CycleId;
  generation: Generation;
  authorityEpoch: AuthorityEpoch;
  occupantId: OccupantId;
  architectureEpoch: typeof ARCHITECTURE_EPOCH;
  triggerRef: string;

  interpretation: {                // AUTHORITATIVE semantic
    discourseActs: DiscourseAct[];
    referentBindings: ReferentBinding[];
    corrections: CorrectionRecord[];
    unresolvedAmbiguities: string[];
    topics: string[];
  };

  commitments: {                   // AUTHORITATIVE semantic
    epistemic: EpistemicCommitment[];
    conversational: ConversationalCommitment[];
    stance: Stance;
  };

  speech: {                        // AUTHORITATIVE semantic
    mode: SpeechMode;
    mustSay: string[];
    mustNot: string[];
    surfaceDraft: string | null;   // Thought-authored wording; required non-empty if mode=draft
    finalLicensedText: string | null; // set at publication; not a Thought-model field
    acceptableRealizations: string[];
    presentationDirectives: string[]; // convenience; cannot contradict commitments
  };

  workingContextDelta: WorkingContextDelta[];
  concernDeltas: ConcernDelta[];
  occupancyDelta: OccupancyDelta[];
  futureTriggers: FutureTriggerDelta[];
  subscriptions: SubscriptionDelta[];
  durableNominations: DurableNomination[];

  operations: {
    observationsConsumed: string[];
    effectsCompleted: string[];      // claims ≤ receipts
    intentsStillInFlight: string[];
  };

  authority: {
    objectionsApplied: AuthorityCode[];
    revisionCount: number;
  };
};
```

**Validation** (`settlement/validate.ts` `validateSettlement`):

| Condition | Result |
|---|---|
| unknown extra required-path missing | `malformed` |
| `schemaVersion !== 1` | `malformed` |
| `mode === "draft"` and (`surfaceDraft` null/empty) | `malformed` |
| `mode === "none"` and `surfaceDraft` non-null | `malformed` (must be null) |
| Thought JSON includes `finalLicensedText` | `malformed` (kernel writes this at publication only) |
| `revisionCount > MAX_AUTHORITY_REVISIONS` | `malformed` |
| `effectsCompleted` id not in consumed receipts | `malformed` |
| draft/commitment conflict (spec §C.1) | `conflict` not publish |
| valid `mode=none` with occupancy/triggers | **ok** (private success) |

Malformed Thought output: **do not speak in Ashley’s voice**. Emit `infrastructure_notice` (spec §U). Do not run Expression. Do not call `decide()`.

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
  → kernel sets speech.finalLicensedText
  → publishSemanticTransaction writes SpeechOutboxRow.licensedText = finalLicensedText
  → OutboxDeliveryProjector copies that exact text to nuclear delivery_reservations.draft_text / bubbles
```

| Condition | `finalLicensedText` |
|---|---|
| `expressionEnabled === false` | equals `surfaceDraft` |
| Expression ran and fidelity passed | post-Expression text |
| `mode === "none"` | null; no outbox row |

Canonical published-speech field: **`finalLicensedText`** on the published settlement; **`licensedText`** on `SpeechOutboxRow`. They must be equal. Do not require `outbox.licensedText === surfaceDraft` when Expression ran.

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
  settlement: CognitiveSettlement;
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

Cancellation: abort `completeChat` `signal` when generation is preempted. Stale step with `generation !== activeGeneration` is ignored; it must not publish, dispatch, or write outbox.

**Pass accounting:** `pass` increments for every model invocation attempt that the kernel accepts as a Thought step, including compose-triggered restarts and settle-then-draft (E2). Structural JSON retries inside `runBoundedCognition` (max 2) are **not** extra `pass` values; they are retries of the same pass.

**Caps:** `pass > MAX_THOUGHT_PASSES` → `failure.reason=pass_exhausted`. Observation rounds > `MAX_OBSERVATION_ROUNDS` or effect rounds > `MAX_EFFECT_ROUNDS` → fail closed (`pass_exhausted` or Authority). Authority `revisionCount` still capped at `MAX_AUTHORITY_REVISIONS` independently.

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

export type ConversationEvidenceRecord = {
  id: string;                        // entity uuid
  conversationId: ConversationId;
  role: "owner" | "ashley" | "system";
  text: string | null;               // null if redacted/unavailable
  createdAtMs: number;
  discordMessageIds: string[];
  reservationId: ReservationId | null;
  producingCycleId: CycleId | null;  // Ashley speech only
  architectureEpoch: typeof ARCHITECTURE_EPOCH | "legacy";
  contentHash: string;               // sha256 of role+text+ids
  sourceStatus: EvidenceSourceStatus;
  version: number;                   // edits append new version, same lineage id
};

export type InboxEvent =
  | { kind: "owner_message"; evidenceId: string; discordMessageIds: string[] }
  | { kind: "idle_opportunity"; atMs: number }
  | { kind: "subscription_item"; subscriptionId: string; observationId: string }
  | { kind: "future_trigger_due"; triggerId: string }
  | { kind: "receipt"; effectId: string; receiptId: string }
  | { kind: "recovery"; correlationId: string };
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

**Legacy/shadow:** after ingress ACK, if `cognitiveKernel` is `legacy` or `shadow`, enqueue **legacy** `chatText`+send on `channelQueue` so Doc still hears legacy Ashley. Ingress of message B must still complete while that legacy job runs. **v021:** do not call `chatText`; delivery pump claims nuclear reservations (existing `fulfillment-pump.ts` pattern, lane `reactive` or `cognitive_v021`).

**TurnBuffer KEEP** for fragment coalescing only (1500ms/5s). It is not a cognition mutex.

**`POST /chat/text` KEEP** until cutover for legacy/shadow live replies. New kernel must not depend on it for durable admit.

---

**Append rules:**

- Owner Discord text appends **immediately** in the inbox transaction (sidecar). Rapid messages: three owner rows for HY4 / I meant HY3 / it’s an LLM, never dropped.
- Edits: insert version+1; Thought sees latest available version; prior versions remain fetchable until retention.
- Redaction: `sourceStatus=redacted`, `text=null`. Thought must not invent the missing text (S3, S31).
- Ashley speech rows written **from outbox after publish**, not from Expression improvisation.
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
  | "resolved";

export type MindOccupancy = {
  conversationId: ConversationId;
  concernId: ConcernId;
  status: OccupancyStatus;
  priority: number;                  // orders her concerns; NOT a speech threshold
  updatedCycle: CycleId;
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
  idempotencyKey: IdempotencyKey;
  generation: Generation;
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
  | "DRAFT_COMMITMENT_CONFLICT"
  | "EMPTY_COMMITMENTS_WITH_DRAFT";

export type AuthorityStage = "proposal" | "settlement" | "dispatch";

export type AuthorityVerdict =
  | { ok: true }
  | { ok: false; codes: AuthorityCode[] };

export function checkAuthority(
  stage: AuthorityStage,
  input: {
    settlement?: CognitiveSettlement;
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
- **Dispatch:** recheck **mutable** packs only (withdrawal, capability, sandbox permission, `authorityEpoch`). Do not reinterpret intent. If blocked: do not dispatch; return `DISPATCH_EPOCH_CHANGED` or specific code to Thought/recovery.

Authority never authors `surfaceDraft`. `maxRevisions = 2` after first bound, then fail closed or publish largest fully licensed **droppable** subset (`mode=none` if speech cannot be licensed) — never livelock.

Currentness: Thought tags **and** draft-side detectors (reuse honesty claim regexes as **detectors only**, not surgery). Untagged “latest/current” without observation fails `CURRENTNESS_UNVERIFIED`.

Relational “never mention X”: stored constraint; Authority matches `mustNot` / draft.

---

## O. Speech outbox

```ts
export type OutboxSendStatus =
  | "pending"
  | "sending"
  | "delivered"
  | "send_failure"
  | "suppressed";

export type SpeechOutboxRow = {
  outboxId: OutboxId;
  cycleId: CycleId;
  generation: Generation;
  reservationId: ReservationId;
  licensedText: string;
  sendStatus: OutboxSendStatus;
  discordMessageIds: string[];
  suppressed: boolean;
};
```

Publish txn inserts `pending` when `mode=draft`. Transport sends **`licensedText`** (equals `finalLicensedText`). Crash after publish: recovery sends the same row; **no new Thought**. Discord id persisted as soon as known; retry no-ops if set. Duplicate confirmation: recovery speech suppression (S27).

### O.1 Outbox → nuclear delivery projector (frozen; version 1)

SQLite does not provide atomic commits across `cognitive-v021.db` and `nuclear.db`. Do not claim cross-database atomicity.

**Bridge identity:** `OutboxDeliveryProjector` in `cognitive-v021/delivery/outbox-projector.ts`. `OUTBOX_BRIDGE_VERSION = 1`.

**Nuclear additive column** (Phase 05, before freeze):

```sql
ALTER TABLE delivery_reservations ADD COLUMN cognitive_v021_outbox_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_reservations_v021_outbox
  ON delivery_reservations(cognitive_v021_outbox_id)
  WHERE cognitive_v021_outbox_id IS NOT NULL;
```

Legacy rows leave the column NULL. Legacy path ignores it.

| Piece | Value |
|---|---|
| Source | sidecar `speech_outbox` row (`outboxId`, `cycleId`, `generation`, `licensedText`, `sendStatus`) |
| Projector | `OutboxDeliveryProjector.project(outboxId)` |
| Correlation / idempotency | `cognitive_v021_outbox_id = str(outboxId)` unique on nuclear |
| Destination | `delivery_reservations` + bubbles via existing `attachDraftAndBubbles` / `planContentBubbles` |
| Final text | exactly `licensedText` (already `finalLicensedText`) |
| Destination lane | `delivery_lane = 'reactive'` (same Discord DM path as claimReactiveDelivery) |

**Protocol (idempotent reconciliation):**

1. Read sidecar outbox `pending` or `projecting`.
2. Sidecar: set `projecting` if `pending` (same DB txn).
3. INSERT nuclear reservation with `cognitive_v021_outbox_id`. On UNIQUE conflict: SELECT existing id; do not insert a second reservation.
4. Attach draft/bubbles from `licensedText` if reservation state is still `drafted` and draft_text is null. If destination already `sending`/`committed`/`cancelled`: skip attach.
5. Sidecar: store `nuclear_reservation_id`, set outbox `sending` (or keep `projecting` until first Discord id).
6. Existing Discord claim/send/receipt/finalize writes Discord ids onto nuclear.
7. Projector/reconcile: when nuclear `committed`, sidecar `delivered` + Discord ids copied. When nuclear `send_failure`, sidecar `send_failure`.

**Crashes:**

| Crash | Recovery |
|---|---|
| Before nuclear INSERT | sidecar still `pending`/`projecting`; retry INSERT |
| After nuclear INSERT, before sidecar map | UNIQUE hit on retry; bind nuclear id; continue |
| After destination committed, sidecar still projecting | mark sidecar `delivered`; do not send again |
| Duplicate projector tick | UNIQUE + state checks; no second Discord send |

**Superseded generation:** do not project; set sidecar `suppressed`. If nuclear reservation exists but Discord not sent, finalize/cancel via existing delivery finalize `cancel` — do not unsend delivered messages.

**Tests (required):** crash-before-dest, crash-after-dest, retry, duplicate tick, dest already committed, Discord id reconciliation, source completion, recovery suppression, shadow mode never calls Discord send.

This bridge is implemented and rehearsed **before candidate freeze** (Phase 05 + Phase 08 wiring).

Map to existing helpers: `attachDraftAndBubbles` **only** with outbox `licensedText`.

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
  dimensions: EpistemicDimensions;
  supersedesAssertionKey: AssertionKey | null;
  concernId: ConcernId | null;
};
```

Queued in publish txn. Admission is async, off speech path. Fence: before live Memory write, if a later **published** generation superseded/retracted that key → no-op, ledger `admission_skipped_superseded`.

---

## Q. Durable Memory + epistemic dimensions

```ts
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
  dimensions: EpistemicDimensions;
  lineageParentKey: AssertionKey | null;
  admittedGeneration: Generation;
  live: boolean;
};
```

No persistable `AshleyBelief` type at cutover (do not add the identifier). Evidence supports are additional rows, same `assertionKey`. Correction/retraction: supersede lineage; occupancy/triggers revalidate.

Reuse C1 `memory_assertions` **after cutover** or keep sidecar `memory_assertions` during shadow (**decision rule:** sidecar table `sidecar_memory_assertions` during shadow; cutover imports live rows — do not dual-write production C1 tables in shadow).

---

## R. Identity / LearnedSelf

```ts
export type IdentitySlice = {
  constitutional: string[];          // value/principle/constitution entries
  stableSelf: string[];              // protected
};

export type LearnedSelfSlice = {
  dispositions: string[];            // not world facts ("HY3 is an LLM" forbidden)
  interests: string[];
};
```

Constitution: no ordinary writer. LearnedSelf: accumulated from settled experience; compact always-on; never speaks; never fires subscriptions. Owner Model store remains **absent**.

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

When Thought is unavailable or settlement malformed:

```ts
export const THOUGHT_UNAVAILABLE_NOTICE =
  "I couldn't finish thinking just now. Give me a moment and say that again." as const;
```

This is **not** `surfaceDraft`, not Expression, not `decide()`. Delivery may send it as `role=system` auxiliary (`recordAuxiliaryMessage` KEEP) or a dedicated outbox `suppressed` Ashley voice with `speech.mode=none` plus auxiliary. **Decision rule:** use existing `recordAuxiliaryMessage` kind `delivery_error` / progress — **not** `attachDraftAndBubbles` with Ashley persona. Test: ledger `thoughtUnavailable=true`; no CognitiveSettlement speech; no Expression call.

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

Copy `openContinuityDb` reserved-path guard. Schema version **always 1** at open after applying `sidecar/schema-v1.sql`. Shadow kernel **reads** replicated evidence; **writes only sidecar**. Production nuclear semantic writers stay live until configuration-only cutover of the frozen SHA. Additive nuclear column `cognitive_v021_outbox_id` is allowed before freeze (not a semantic writer).

Replicator (`shadow/replicator.ts`): copy new inbound Discord text + ids into sidecar evidence log with `architectureEpoch: "legacy"` **without waiting for Thought**. Never write WC/Memory to nuclear in shadow. Candidate must never send Discord.

### W.1 Initial schema (version 1 only)

File: `apps/agent-service/src/core/cognitive-v021/sidecar/schema-v1.sql`. Applied on open. No version-2 migration in this packet.

```sql
CREATE TABLE IF NOT EXISTS cognitive_sidecar_meta (
  schema_version INTEGER NOT NULL,
  architecture_epoch TEXT NOT NULL,
  implementation_spec_version TEXT NOT NULL,
  thought_contract_version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_evidence_log (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT,
  created_at_ms INTEGER NOT NULL,
  discord_message_ids_json TEXT NOT NULL,
  reservation_id INTEGER,
  producing_cycle_id TEXT,
  architecture_epoch TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_status TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inbox_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cycle_records (
  cycle_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  state TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  occupant_id TEXT,
  authority_epoch INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS thought_steps (
  request_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  pass INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS working_context_items (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  superseded INTEGER NOT NULL DEFAULT 0,
  updated_cycle TEXT,
  updated_generation INTEGER
);
CREATE TABLE IF NOT EXISTS concerns (
  concern_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  assertion_key TEXT,
  updated_cycle TEXT
);
CREATE TABLE IF NOT EXISTS mind_occupancy (
  concern_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  updated_cycle TEXT NOT NULL,
  updated_generation INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS future_triggers (
  trigger_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  due_at_ms INTEGER NOT NULL,
  occupancy_hash TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observation_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS observations (
  observation_id TEXT PRIMARY KEY,
  cycle_id TEXT,
  generation INTEGER,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS speech_outbox (
  outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  licensed_text TEXT NOT NULL,
  send_status TEXT NOT NULL,
  nuclear_reservation_id INTEGER,
  discord_message_ids_json TEXT NOT NULL DEFAULT '[]',
  suppressed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS in_flight_effects (
  effect_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  replay_safe INTEGER NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS durable_nominations (
  nomination_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  assertion_key TEXT NOT NULL,
  statement TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  admitted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sidecar_memory_assertions (
  assertion_key TEXT PRIMARY KEY,
  statement TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  lineage_parent_key TEXT,
  admitted_generation INTEGER NOT NULL,
  live INTEGER NOT NULL,
  content_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settlements (
  settlement_id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS causal_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
```

Meta insert on first open: `schema_version=1`, `architecture_epoch='v0.2.1'`, `implementation_spec_version='0.2.1.r2'`, `thought_contract_version=1`.

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
    commitments: CognitiveSettlement["commitments"];
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

`KernelRunResult.thoughtModelAttempts` counts raw model invocations (including compose restarts). `acceptedSettlements` is 0 or 1 for the generation that published.

---

## Y. Causal acceptance harness

**File:** `acceptance/causal-harness.ts`

```ts
export type CausalBundle = {
  evidenceShownToThought: ConversationEvidenceRecord[];
  thoughtInputHash: string;
  settlement: CognitiveSettlement | null;
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
- Expression skipped AND `outboxText !== settlement.speech.surfaceDraft`
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

**Imported semantic classes:** conversation evidence (from `mem_messages` + inbound discord ids), C1 assertions (quarantined), identity constitutional entries (read-only copy into `IdentitySlice` source, not LearnedSelf), open mind_state_items as concerns+occupancy **quarantined** (`status=background` until Thought re-admits).

**Quarantine classes:** `cur_takes`, episodes, learning_revisions without exact owner-reviewed ids, relationship scores, affect, decide() rows, Expression transcripts as meaning.

**Ignored:** V1 sandbox broker tables, capability observe/apply flags (remain nuclear), delivery_reservations (operational; not semantic import).

**Report:** `docs/cognitive-rework/v0.2.1/artifacts/LEGACY_IMPORT_REPORT.json` with `toolVersion`, counts expected/actual, hashes, `rejectedCount`, `quarantinedCount`, `duplicateCount`, `provenanceOk`. Count or hash mismatch is HARD BLOCKER 15.

Cutover runbook invokes `--mode apply` on isolated copies first, then `--mode verify` on the cutover sidecar.

---

## Qualification vs inhabit (pointer)

Software contracts in this file are proven exhaustively in **Q1** with stubs, programmed `ThoughtStepOutput`, and recorded fixtures. Live `completeChat` on `route=thought` is **Q3 bounded witness** plus Q5/Phase 11 real traffic — see [`QUALIFICATION_PROTOCOL.md`](QUALIFICATION_PROTOCOL.md). This spec does not authorize sending the architecture suite to the API.

---

## Interface name freeze (import these)

`ARCHITECTURE_EPOCH`, `IMPLEMENTATION_SPEC_VERSION`, `THOUGHT_CONTRACT_VERSION`, `COGNITIVE_SIDECAR_SCHEMA_VERSION`, `OUTBOX_BRIDGE_VERSION`, `LEGACY_IMPORT_TOOL_VERSION`, `MAX_THOUGHT_PASSES`, `KernelMode`, `CycleId`, `Generation`, `CycleState`, `CycleTriggerKind`, `CycleRecord`, `CognitiveSettlement`, `ThoughtInput`, `ThoughtStepOutput`, `ThoughtCompleteOptions`, `invokeThoughtComplete`, `CognitiveWorkspace`, `ConversationEvidenceRecord`, `InboxEvent`, `WorkingContextItem`, `ConcernRecord`, `MindOccupancy`, `OccupancyStatus`, `FutureTrigger`, `ObservationSubscription`, `RetrievalRequest`, `RetrievalResult`, `Observation`, `EffectProposal`, `InFlightRecord`, `EffectReceipt`, `AuthorityCode`, `AuthorityStage`, `checkAuthority`, `SpeechOutboxRow`, `OutboxDeliveryProjector`, `DurableNomination`, `EpistemicDimensions`, `MemoryAssertion`, `IdentitySlice`, `LearnedSelfSlice`, `RuntimeCondition`, `CausalLedgerEntry`, `CausalBundle`, `assertCausalInvariants`, `runCognitiveCycle`, `publishSemanticTransaction`, `validateSettlement`, `openCognitiveSidecarDb`, `reservedProductionCognitiveSidecarDbPath`, `tokenizeForDiscovery`, `THOUGHT_UNAVAILABLE_NOTICE`, `WorkingContextDelta`, `ConcernDelta`, `OccupancyDelta`, `FutureTriggerDelta`, `SubscriptionDelta`, `ObservationRequest`, `CapabilityReality`, `AuthorityPacks`, `KernelDeps`, `KernelRunResult`, `finalLicensedText`.

