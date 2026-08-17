import type { OperationalClaimLicense } from "./sandbox/engineering-types.js";
import type {
  SandboxV2InspectionEntry,
  SandboxV2SearchMatch,
} from "@composer-assistant/sandbox-v2";

export type CognitionInspectionRequest =
  | { operation: "project.read_file"; projectId: string; path: string }
  | { operation: "project.list_directory"; projectId: string; path: string }
  | {
      operation: "project.search_text";
      projectId: string;
      path?: string;
      pattern: string;
      maxMatches?: number;
    };

export type ProjectReadFileObservation = {
  projectId: string;
  operation: "project.read_file";
  path: string;
  verified: boolean;
  truncated: false;
  executedAtMs: number;
  contentUtf8: string;
  bytes: number;
  sha256: string;
};

export type ProjectListDirectoryObservation = {
  projectId: string;
  operation: "project.list_directory";
  path: string;
  verified: boolean;
  truncated: boolean;
  executedAtMs: number;
  entries: SandboxV2InspectionEntry[];
};

export type ProjectSearchTextObservation = {
  projectId: string;
  operation: "project.search_text";
  path: string;
  pattern: string;
  verified: boolean;
  truncated: boolean;
  executedAtMs: number;
  matches: SandboxV2SearchMatch[];
  filesScanned: number;
};

export type ProjectInspectionObservation =
  | ProjectReadFileObservation
  | ProjectListDirectoryObservation
  | ProjectSearchTextObservation;

export type DecisionKind =
  | "speak"
  | "silence"
  | "delay"
  | "ask"
  | "revisit"
  | "share"
  | "challenge"
  | "refuse";

export type DecisionDelayClass =
  | "brief"
  | "standard"
  | "long"
  | "reflection_review";

export type MotivationKind =
  | "user_message"
  | "question"
  | "fact"
  | "callback"
  | "opinion"
  | "take"
  | "unfinished"
  | "identity"
  | "availability"
  | "boundary"
  | "silence_signal"
  | "silence_ok"
  | "reminder"
  | "scheduled_proactive";

export type SilenceReasonCode =
  | "user_requested_space"
  | "withdrawal_turn"
  | "withdrawal_topic"
  | "withdrawal_pause"
  | "withdrawal_boundary_repair"
  | "constitutional_refusal"
  | "thought_hold"
  | "coercion_blocked";

export type HoldReasonCode =
  | "proactive_paused"
  | "daily_cap"
  | "relationship_observe"
  | "repair_backoff"
  | "delivery_in_progress"
  | "own_time";

export type Trigger = "reactive" | "proactive";

export type ReflectionMode = "observe" | "apply";
export type CognitionMode = "observe" | "apply";

/**
 * Write-time behavioral authority label on evidence artifacts.
 * `live` = written while the governing capability held influence authority;
 * `shadow` = recorded in observe without authority. Shadow artifacts are never
 * eligible for influence, even after the master mode later flips to apply
 * (time-shift isolation).
 */
export type EvidenceProvenance = "shadow" | "live";

export type EvidenceRef = {
  type:
    | "message"
    | "episode"
    | "fact"
    | "question"
    | "opinion"
    | "take"
    | "identity"
    | "mind_state"
    | "doc_reminder"
    | "ashley_self_commitment"
    | "mutual_commitment"
    | "scheduled_proactive"
    | "relational_tension"
    | "withdrawal"
    | "open_cognitive_item";
  id: string | number;
};

export type AffectLicense = {
  permitted: boolean;
  valence: number;
  activation: number;
  openness: number;
  tension: number;
  reason: string;
  source?: EvidenceRef;
};

export type LearningSnapshot = {
  subjectKind: MotivationKind;
  adjustment: number;
  throughEventId: number;
};

/** v1 payload: transient decisions already implied by Decision.kind. Not the definition of Thought. */
export type CognitiveAllocation = {
  shouldSpeak: boolean;
  effort: "low" | "medium" | "high";
  completion: "complete" | "hold";
};

/** Exact licensed reading claim material for Expression (untrusted data). */
export type AuthorizedReadingClaim = {
  takeId: number;
  readRecordId: number;
  title: string;
  /** Exact stored take text; do not summarize before Expression. */
  claim: string;
};

export type PerceptionLicenses = {
  imageIncluded: string[];
  textExcerptIncluded: string[];
  conversationalReadIncluded: string[];
};

/** Refs Conversation previously reconstructed from kind + feed takes. */
export type AuthorizedClaims = {
  readingRecordIds: number[];
  readingTitles: string[];
  readingClaims: AuthorizedReadingClaim[];
};

export type OwnTimeReportStatus =
  | "no_session"
  | "no_activity"
  | "no_reportable_take"
  | "reportable_takes";

export type OwnTimeReportReason =
  | "no_session"
  | "no_owner_reading_activity"
  | "no_grounded_take"
  | "already_reported"
  | "reportable_takes";

/** Transient Agency marker for gated own-time return reports. */
export type OwnTimeReportMarker = {
  status: OwnTimeReportStatus;
  reason: OwnTimeReportReason;
  sessionId: number | null;
  selectedTakeIds: number[];
};

export type Decision = {
  id?: number;
  trigger: Trigger;
  kind: DecisionKind;
  /** Host-mapped semantic delay. Never an arbitrary model timestamp. */
  delayClass?: DecisionDelayClass;
  motivationIds: number[];
  score: number;
  reason: string;
  objective?: string;
  evidenceRefs: EvidenceRef[];
  uncertainty: number;
  urgency: number;
  thoughtSource: "deterministic" | "model" | "fallback";
  thoughtError: string | null;
  affectLicense: AffectLicense;
  learning?: LearningSnapshot;
  cognitiveAllocation: CognitiveAllocation;
  authorizedClaims: AuthorizedClaims;
  perceptionLicenses?: PerceptionLicenses;
  ownTimeReport?: OwnTimeReportMarker;
  operationalLicense?: OperationalClaimLicense;
  inspectionRequest?: CognitionInspectionRequest | null;
  inspectionObservation?: ProjectInspectionObservation | null;
  inspectionCognitiveResult?: string | null;
  holdReasonCode?: HoldReasonCode | null;
  silenceReasonCode?: SilenceReasonCode | null;
};

/**
 * Agency effect-purpose: the durable classification of why an effect is
 * intended, bounded to a fixed vocabulary. A purpose is only ever asserted
 * after it has been deterministically verified against a current, live,
 * owner-bound open cognitive item (OCI) recorded as decision evidence.
 * Zero-authority: purpose derivation alone never admits, schedules, or
 * executes anything.
 */
export type AgencyEffectPurpose =
  | "sandbox_verify_build_health"
  | "sandbox_test_quality"
  | "sandbox_lint_verification"
  | "sandbox_codebase_patch_verification"
  | "unsupported";

/**
 * Agency effect-intent: the deterministic, evidence-grounded expression of
 * what Ashley internally intends to do, derived only from the verified
 * purposes of an Agency decision's open-cognitive-item evidence. This is a
 * pure derivation output — it carries no execution authority. Broker
 * readiness, runtime state, sandbox state, and capability gates are all
 * checked separately (observe-only integration: nothing is admitted,
 * scheduled, or executed from an intent alone).
 */
export type AgencyEffectIntent = {
  purposes: AgencyEffectPurpose[];
  groundedRefs: EvidenceRef[];
  intentId: string;
  deterministic: true;
};

export type Motivation = {
  id?: number;
  ownerId?: string;
  kind: MotivationKind;
  score: number;
  baseScore?: number;
  learningAdjustment?: number;
  learningThroughEventId?: number;
  refType?: string | null;
  refId?: string | number | null;
  summary: string;
  createdAt?: string;
};

export type IdentityLayer = "stable" | "dynamic";

export type QuestionStatus = "open" | "pursuing" | "resolved" | "forgotten";

export type EpistemicLevel =
  | "known"
  | "remembered"
  | "inferred"
  | "unknown";

export type QuestionSubject = "about_doc" | "about_self" | "about_world";

export type IdentitySource = "seeded" | "organic" | "manual";

export type IdentityEntry = {
  id: number;
  ownerId: string;
  layer: IdentityLayer;
  kind: string;
  text: string;
  source: IdentitySource;
  revisedFrom: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Opinion = {
  id: number;
  ownerId: string;
  topic: string;
  stance: string;
  confidence: number;
  revisedFrom: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Question = {
  id: number;
  ownerId: string;
  subject: QuestionSubject;
  text: string;
  status: QuestionStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type MindState = {
  ownerId: string;
  focus: string | null;
  mood: string | null;
  unfinished: string[];
  unfinishedJson: string;
  availability: string;
  lastDecisionId: number | null;
  updatedAt: string;
};

export type MindStateItemKind =
  | "goal"
  | "concern"
  | "commitment"
  | "interest"
  | "unfinished";

export type MindStateItem = {
  id: number;
  ownerId: string;
  kind: MindStateItemKind;
  text: string;
  sourceType: string;
  sourceId: string;
  activation: number;
  urgency: number;
  status: "active" | "resolved" | "forgotten";
  dueAt: string | null;
  wakeState: "pending" | "claimed" | "consumed";
  wakeAttempts: number;
  nextWakeAt: string | null;
  claimedAt: string | null;
  surfacedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AffectiveState = {
  ownerId: string;
  valence: number;
  activation: number;
  openness: number;
  tension: number;
  reason: string;
  sourceType: string | null;
  sourceId: string | null;
  updatedAt: string;
};

/** @deprecated Use MindState — same type, retained name for gradual call-site clarity. */
export type InternalState = MindState;
