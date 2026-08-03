export type DecisionKind =
  | "speak"
  | "silence"
  | "delay"
  | "ask"
  | "revisit"
  | "share"
  | "challenge";

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
  | "silence_signal"
  | "silence_ok";

export type Trigger = "reactive" | "proactive";

export type ReflectionMode = "observe" | "apply";
export type CognitionMode = "observe" | "apply";

export type EvidenceRef = {
  type:
    | "message"
    | "episode"
    | "fact"
    | "question"
    | "opinion"
    | "take"
    | "mind_state";
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

/** Refs Conversation previously reconstructed from kind + feed takes. */
export type AuthorizedClaims = {
  readingRecordIds: number[];
  readingTitles: string[];
};

export type Decision = {
  id?: number;
  trigger: Trigger;
  kind: DecisionKind;
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
