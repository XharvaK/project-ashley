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

export type Decision = {
  id?: number;
  trigger: Trigger;
  kind: DecisionKind;
  motivationIds: number[];
  score: number;
  reason: string;
};

export type Motivation = {
  id?: number;
  ownerId?: string;
  kind: MotivationKind;
  score: number;
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

export type InternalState = {
  ownerId: string;
  focus: string | null;
  mood: string | null;
  unfinished: string[];
  unfinishedJson: string;
  availability: string;
  lastDecisionId: number | null;
  updatedAt: string;
};
