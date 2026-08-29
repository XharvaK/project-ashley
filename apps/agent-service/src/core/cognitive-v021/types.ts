import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage, CompletionOptions } from "../model-routing/types.js";
import type {
  CognitiveDispatchOptions,
  completeChat,
} from "../../mistral-client.js";
import type { DataClassification } from "../privacy/classification.js";

export type { DataClassification } from "../privacy/classification.js";

export const ARCHITECTURE_EPOCH = "v0.2.1" as const;
export const IMPLEMENTATION_SPEC_VERSION = "0.2.1.r5" as const;
export const THOUGHT_CONTRACT_VERSION = 1 as const;
export const COGNITIVE_SIDECAR_SCHEMA_VERSION = 1 as const;
export const SETTLEMENT_SCHEMA_VERSION = 1 as const;
export const OUTBOX_BRIDGE_VERSION = 1 as const;
export const LEGACY_IMPORT_TOOL_VERSION = 1 as const;
export const MAX_AUTHORITY_REVISIONS = 2 as const;
export const MAX_THOUGHT_PASSES = 6 as const;
export const MAX_THOUGHT_MODEL_ATTEMPTS = 12 as const;
export const PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR = 12 as const;
export const PRIVATE_THOUGHT_MAX_CONCURRENT = 1 as const;
export const PRIVATE_SUBSCRIPTION_ITEMS_PER_IDLE = 4 as const;
export const MAX_OBSERVATION_ROUNDS = 4 as const;
export const MAX_EFFECT_ROUNDS = 4 as const;
export const DEFAULT_LAST_N_TURNS = 12 as const;
export const DEFAULT_OCCUPANCY_COMPACT_K = 8 as const;
export const DEFAULT_IDLE_TICK_MS = 60_000 as const;
export const DEFAULT_MAX_SUBSCRIPTIONS = 16 as const;
export const DEFAULT_MISS_ROUND_CAP = 1 as const;
export const DEFAULT_TOOL_CYCLE_LEASE_MS = 120_000 as const;
export const ORDINARY_THOUGHT_BUDGET_MS = 6_000 as const;
export const THOUGHT_UNAVAILABLE_NOTICE =
  "[system] Thought did not complete. Please send the message again." as const;

export type KernelMode = "legacy" | "shadow" | "v021";
export type CycleId = string;
export type ConversationId = string;
export type Generation = number;
export type AuthorityEpoch = number;
export type OccupantId = string;
export type IdempotencyKey = string;
export type ReservationId = number;
export type OutboxId = number;
export type NoticeId = number;
export type DeliveryProjectionKey = string;
export type ConcernId = string;
export type AssertionKey = string;
export type finalLicensedText = string | null;

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
  triggerRef: string;
  state: CycleState;
  occupantId: OccupantId;
  authorityEpoch: AuthorityEpoch;
  architectureEpoch: typeof ARCHITECTURE_EPOCH;
  admittedAtMs: number;
  composeLogIds: string[];
  preemptedGeneration: Generation | null;
};

export type SettlementSchemaVersion = typeof SETTLEMENT_SCHEMA_VERSION;
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
  span: string;
  concernId?: ConcernId;
  entityKey?: string;
  sourceTurnIds: string[];
};

export type CorrectionRecord = {
  correctedTurnIds: string[];
  fromSpan: string;
  toSpan: string;
  concernId?: ConcernId;
};

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

export type EpistemicCommitment = {
  dimensions: EpistemicDimensions;
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

export type ThoughtSpeechDraft = {
  mode: SpeechMode;
  mustSay: string[];
  mustNot: string[];
  surfaceDraft: string | null;
  acceptableRealizations: string[];
  presentationDirectives: string[];
};

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
  concernId: ConcernId | null;
  sourceTurnIds: string[];
  status: "active" | "superseded" | "abandoned";
  supersedesId: string | null;
  updatedGeneration: Generation;
};

export type WorkingContextDelta =
  | {
      op: "upsert";
      item: Omit<WorkingContextItem, "updatedGeneration">;
    }
  | {
      op: "supersede";
      id: string;
      replacement: Omit<WorkingContextItem, "updatedGeneration">;
    }
  | { op: "abandon"; id: string };

export type ConcernRecord = {
  concernId: ConcernId;
  conversationId: ConversationId;
  statement: string;
  sourceTurnIds: string[];
  dimensions: EpistemicDimensions;
  assertionKey: AssertionKey | null;
  status: OccupancyStatus;
  snapshotHash: string;
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
export type OccupancyDelta = {
  op: "set";
  occupancy: Omit<MindOccupancy, "updatedCycle">;
};

export type FutureTrigger = {
  triggerId: string;
  conversationId: ConversationId;
  concernId: ConcernId;
  snapshotHash: string;
  dueAtMs: number;
  status: "scheduled" | "fired" | "cancelled" | "suppressed_stale";
  payload?: Record<string, unknown>;
};
export type FutureTriggerDelta =
  | { op: "create"; trigger: Omit<FutureTrigger, "status"> }
  | { op: "cancel"; triggerId: string };

export type ObservationSubscription = {
  subscriptionId: string;
  conversationId: ConversationId;
  concernId: ConcernId | null;
  source: string;
  scope: string;
  topicKeys: string[];
  match: "equality" | "substring";
  expiresAtMs: number | null;
  status: "active" | "cancelled";
};
export type SubscriptionDelta =
  | {
      op: "create";
      subscription: Omit<ObservationSubscription, "status">;
    }
  | { op: "cancel"; subscriptionId: string };

export type ConversationEvidenceRecord = {
  rowId: string;
  lineageId: string;
  version: number;
  conversationId: ConversationId;
  role: "owner" | "ashley" | "system";
  text: string | null;
  createdAtMs: number;
  discordMessageIds: string[];
  reservationId: ReservationId | null;
  producingCycleId: CycleId | null;
  architectureEpoch: string;
  contentHash: string;
  sourceStatus: string;
  dataClassification: DataClassification;
  secretOmitted: boolean;
  delivered: boolean;
};
export type ConversationEvidenceDiscordId = {
  discordMessageId: string;
  conversationId: ConversationId;
  lineageId: string;
  ordinal: number;
};

export type InboxConsumerStatus =
  | "pending"
  | "claimed"
  | "consumed"
  | "failed_retryable"
  | "failed_terminal";
export type InboxEvent = {
  id: string;
  conversationId: ConversationId;
  kind: string;
  payload: unknown;
  createdAtMs: number;
  status: InboxConsumerStatus;
  claimToken: string | null;
  workerId: string | null;
  leaseExpiresAtMs: number | null;
  attemptCount: number;
  claimedAtMs: number | null;
  consumedAtMs: number | null;
  lastError: string | null;
};

export type RetrievalRequest = {
  triggerTerms: string[];
  workingContextTopics: string[];
  assertionKeys: string[];
  timeRangeMs?: { from: number; to: number };
  includeLogSearch: true;
};
export type RetrievalEvidenceSource =
  | "conversation_log"
  | "live_memory"
  | "quarantined_memory";
export type RetrievalHitKind = "lexical" | "key" | "time" | "log" | "vector";
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
export type RetrievalHit = {
  kind: RetrievalHitKind;
  sourceStore: RetrievalEvidenceSource;
  ref: string;
  snippet: string;
  score: number;
  assertionKey: AssertionKey | null;
  memoryKind: MemoryKind | null;
  dimensions: EpistemicDimensions | null;
  dataClassification: DataClassification;
  live: boolean | null;
  supportRefs: string[];
};
export type RetrievalResult = {
  request: RetrievalRequest;
  hits: RetrievalHit[];
  miss: boolean;
};

export type Observation = {
  observationId: string;
  cycleId: CycleId;
  generation: Generation;
  derived: boolean;
  replaySafe: boolean;
  modality: "text" | "image" | "page" | "tool" | "subscription" | "receipt";
  payload: unknown;
  provenance: string;
  rawOutranksDerivedOf?: string;
  dataClassification: DataClassification;
  secretOmitted: boolean;
};
export type ObservationRequest = {
  requestId: string;
  cycleId: CycleId;
  generation: Generation;
  kind: string;
  request: unknown;
  replaySafe: true;
};

export type EffectProposal = {
  effectId: string;
  cycleId: CycleId;
  generation: Generation;
  idempotencyKey: IdempotencyKey;
  kind: string;
  request: unknown;
  authorityEpoch: AuthorityEpoch;
};
export type InFlightRecord = {
  effectId: string;
  cycleId: CycleId;
  generation: Generation;
  correlationId: string;
  idempotencyKey: IdempotencyKey;
  status: "in_flight" | "receipted" | "unknown";
  dispatchedAtMs: number;
  originJobId: string | null;
};
export type EffectReceipt = {
  receiptId: string;
  effectId: string;
  idempotencyKey: IdempotencyKey;
  outcome: "succeeded" | "failed" | "unknown";
  claims: Record<string, unknown>;
  atMs: number;
  dataClassification: DataClassification;
  secretOmitted: boolean;
};

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
export type AuthorityPacks = {
  epistemic: { allowInferredWorldClaims: boolean };
  currentness: { requireObservationForLatest: boolean; observedObservationIds?: string[] };
  receipt: { receiptsByEffectId: Record<string, EffectReceipt> };
  capability: CapabilityReality;
  operational: { sandboxAvailable: boolean };
  relational: { withdrawalActive: boolean; neverMention: string[] };
  stateEpoch: { authorityEpoch: AuthorityEpoch };
};
export type AuthorityVerdict =
  | { ok: true }
  | { ok: false; codes: AuthorityCode[] };

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
export type CognitiveSettlement = PublishedCognitiveSettlement;

export type ThoughtStepKind =
  | "observation_request"
  | "effect_proposal"
  | "settlement"
  | "failure";
export type ThoughtPassIndex = number;
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

export type CognitiveWorkspace = { notes: string };
export type IdentitySlice = {
  constitutional: string[];
  stableSelf: string[];
};
export type LearnedSelfSlice = {
  dispositions: string[];
  interests: string[];
};
export type RuntimeCondition = {
  fallback: boolean;
  compression: boolean;
  lookupFailed: boolean;
  thoughtUnavailable: boolean;
};
export type OccupantCalibration = {
  occupantId: OccupantId;
  notes: string[];
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
export type ThoughtInput = {
  cycleId: CycleId;
  generation: Generation;
  occupantId: OccupantId;
  authorityEpoch: AuthorityEpoch;
  trigger: { kind: CycleTriggerKind; ref: string };
  rawConversation: ConversationEvidenceRecord[];
  workingContext: WorkingContextItem[];
  occupancy: MindOccupancy[];
  constitution: IdentitySlice;
  learnedSelfSlice: LearnedSelfSlice;
  capabilityReality: CapabilityReality;
  observations: Observation[];
  retrieval: RetrievalResult;
  inFlight: InFlightRecord[];
  authorityObjections: AuthorityCode[];
  runtimeCondition: RuntimeCondition;
  rememberDirective: RememberDirective | null;
};
export type ThoughtCompleteOptions = CognitiveDispatchOptions & {
  attentionDb: DatabaseSync;
  route: "thought";
  responseFormat: "json_object";
};

export type DurableNomination = {
  nominationId: string;
  cycleId: CycleId;
  generation: Generation;
  assertionKey: AssertionKey;
  statement: string;
  memoryKind: MemoryKind;
  dimensions: EpistemicDimensions;
  dataClassification: DataClassification;
  supersedesAssertionKey: AssertionKey | null;
  concernId: ConcernId | null;
};
export type MemorySupportProvenance = "native" | "legacy_import";
export type MemoryAssertion = {
  assertionKey: AssertionKey;
  statement: string;
  memoryKind: MemoryKind;
  dimensions: EpistemicDimensions;
  dataClassification: DataClassification;
  lineageParentKey: AssertionKey | null;
  admittedGeneration: Generation | null;
  live: boolean;
};
export type MemorySupport = {
  supportId: string;
  assertionKey: AssertionKey;
  source: EpistemicSource;
  provenance: MemorySupportProvenance;
  sourceArchitectureEpoch: typeof ARCHITECTURE_EPOCH | "legacy";
  sourceRef: string | null;
  settlementId: string | null;
  evidenceLineageId: string | null;
  observationId: string | null;
  receiptId: string | null;
  dimensions: EpistemicDimensions;
  dataClassification: DataClassification;
  createdAtMs: number;
};
export type RememberDirective = {
  rememberRequested: true;
  evidenceLineageId: string;
  evidenceRowId: string;
  dataClassification: DataClassification;
};

export type V021ForgetDisposition =
  | "REDACT"
  | "DELETE"
  | "DETACH"
  | "CANCEL"
  | "KEEP_METADATA_ONLY"
  | "NO_CONTENT"
  | "NO_ACTION";
export type V021ForgetEntityType =
  | "v021_conversation_evidence"
  | "v021_thought_step"
  | "v021_working_context"
  | "v021_concern"
  | "v021_occupancy"
  | "v021_future_trigger"
  | "v021_subscription"
  | "v021_observation"
  | "v021_effect_receipt"
  | "v021_nomination"
  | "v021_memory_assertion"
  | "v021_memory_support"
  | "v021_settlement"
  | "v021_speech_outbox"
  | "v021_system_notice"
  | "v021_causal_ledger"
  | "v021_inbox_event"
  | "v021_in_flight";
export type V021ForgetTarget = {
  entityType: V021ForgetEntityType | string;
  entityUuid: string;
  action: "redact" | "delete" | "detach" | "cancel" | "keep_metadata_only";
};

export type DeliveryIntent = {
  ownerId: string;
  channel: string;
  threadId: string;
  conversationId: ConversationId;
  trigger:
    | "owner_message_reactive"
    | "idle"
    | "future_trigger"
    | "subscription"
    | "recovery"
    | "operation_completion";
  deliveryLane: "reactive" | "proactive";
  purpose: "licensed_speech" | "system_notice";
};
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
export type SpeechOutboxRow = {
  outboxId: OutboxId;
  settlementId: string;
  projectionKey: DeliveryProjectionKey;
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
export type SystemNoticeOutbox = {
  noticeId: NoticeId;
  noticeKey: string;
  projectionKey: DeliveryProjectionKey;
  cycleId: CycleId | null;
  conversationId: ConversationId;
  deliveryIntent: DeliveryIntent;
  noticeText: string;
  sendStatus: OutboxSendStatus;
  nuclearReservationId: ReservationId | null;
  discordMessageId: string | null;
  origin: OutboxOrigin;
};
export interface OutboxDeliveryProjector {
  project(outboxId: OutboxId): Promise<void>;
  projectSystem(noticeId: NoticeId): Promise<void>;
}
export type ExternalizationGateReason =
  | "ok"
  | "proactive_disabled"
  | "proactive_paused"
  | "daily_cap"
  | "chat_in_progress"
  | "unavailable"
  | "idle_floor"
  | "private_compute_budget";

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
  thoughtUnavailable: boolean;
  architectureEpoch: typeof ARCHITECTURE_EPOCH;
};
export type CausalBundle = {
  evidenceShownToThought: ConversationEvidenceRecord[];
  thoughtInputHash: string;
  settlement: PublishedCognitiveSettlement | null;
  workingContext: WorkingContextItem[];
  occupancy: MindOccupancy[];
  authorityCodes: AuthorityCode[];
  nominations: DurableNomination[];
  expressionInput: string | null;
  outboxText: string | null;
  deliveredText: string | null;
  thoughtModelAttempts: number;
  acceptedSettlements: number;
  acceptedGeneration: Generation | null;
  triggerKind?: CycleTriggerKind;
  outboxGeneration?: Generation | null;
};

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
  checkAuthority: CheckAuthority;
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

export type CheckAuthority = (
  stage: AuthorityStage,
  input: {
    settlement?: ThoughtSettlementDraft | PublishedCognitiveSettlement;
    proposal?: EffectProposal | ObservationRequest;
    packs: AuthorityPacks;
    authorityEpoch: AuthorityEpoch;
  },
) => AuthorityVerdict;
export type InvokeThoughtComplete = (
  messages: ChatMessage[],
  options: ThoughtCompleteOptions,
) => ReturnType<typeof completeChat>;
export type PublishSemanticTransaction = (...args: unknown[]) => unknown;
export type CompletionOptionsForCognitive = CompletionOptions;
