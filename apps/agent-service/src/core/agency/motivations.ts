import type { DatabaseSync } from "node:sqlite";
import { listOpenQuestions } from "../state/questions.js";
import { listRecentTakes } from "../curiosity/feed.js";
import { listActiveFacts } from "../memory/facts.js";
import { getState } from "../state/store.js";
import { listIdentity, listOpinions } from "../identity/store.js";
import { listActiveMindStateItems } from "../state/mind-items.js";
import type {
  MindStateItem,
  MindStateItemKind,
  Motivation,
  MotivationKind,
  Opinion,
  Trigger,
} from "../types.js";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import { isBoundaryRelevant } from "./boundary-relevance.js";
import { relationshipCanInfluence } from "../relationship/influence.js";
import { listDueDocReminders } from "../relationship/store.js";
import { tryClaimRelationshipMotivation } from "../relationship/claims.js";
import { listRelationshipMotivationProjections } from "../relationship/projections.js";
import {
  listOpenCognitiveItems,
  openCognitiveItemEligibleForInfluence,
  type OpenCognitiveItemRecord,
} from "../cognition/open-items.js";

export type MindStateMotivationInput = {
  kind: MindStateItemKind;
  text: string;
  activation: number;
  urgency: number;
  id: number;
};

export type MotivationCollectionOptions = {
  /** Qualification-only ablation; the production default keeps OCI enabled. */
  includeOpenCognitiveItems?: boolean;
};

export function mindStateItemToMotivation(
  item: MindStateMotivationInput,
): { kind: MotivationKind; score: number; summary: string; refType: "mind_state"; refId: number } {
  const kind: MotivationKind =
    item.kind === "unfinished" || item.kind === "commitment"
      ? "unfinished"
      : item.kind === "interest"
        ? "identity"
        : "callback";
  const score = Math.max(20, Math.min(100, item.activation * 55 + item.urgency * 45));
  return {
    kind,
    score,
    summary: item.text.trim().slice(0, 1000),
    refType: "mind_state",
    refId: item.id,
  };
}

function ageHours(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed)
    ? Math.max(0, (Date.now() - parsed) / 3_600_000)
    : Number.POSITIVE_INFINITY;
}

function persistMotivation(
  db: DatabaseSync,
  ownerId: string,
  kind: MotivationKind,
  score: number,
  summary: string,
  refType: string | null = null,
  refId: string | number | null = null,
): Motivation {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO motivations
         (owner_id, kind, score, ref_type, ref_id, summary, created_at, consumed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      ownerId,
      kind,
      Math.max(0, score),
      refType,
      refId == null ? null : String(refId),
      summary.trim().slice(0, 1000),
      createdAt,
    );
  return {
    id: Number(result.lastInsertRowid),
    ownerId,
    kind,
    score: Math.max(0, score),
    refType,
    refId,
    summary: summary.trim().slice(0, 1000),
    createdAt,
  };
}

function userMessageScore(message: string): number {
  return /^(?:hi|hey|hello|ok|okay|k|lol|haha|nice|cool|thanks|ty|yeah|yep|nope|hm|hmm)[!.? ]*$/i.test(
    message.trim(),
  )
    ? 32
    : 100;
}

function isSilenceRequest(message: string): boolean {
  return /\b(?:stop(?: messaging| pinging)?|busy|later|not now|leave me alone|don't ping|do not ping)\b/i.test(
    message,
  );
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9à-ÿ]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4),
  );
}

/** Bounded relevance: shared tokens or explicit mind-state text match. */
function isTextRelevant(message: string, candidate: string): boolean {
  const msg = message.trim();
  if (!msg) return false;
  const messageTokens = tokenize(msg);
  if (messageTokens.size === 0) return false;
  const candidateTokens = tokenize(candidate);
  let hits = 0;
  for (const token of candidateTokens) {
    if (messageTokens.has(token)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

function addOpinions(
  db: DatabaseSync,
  ownerId: string,
  opinions: Opinion[],
  message: string,
  requireRelevance: boolean,
): Motivation[] {
  return opinions
    .filter((opinion) => ageHours(opinion.updatedAt) <= 168)
    .filter((opinion) =>
      !requireRelevance ||
      isTextRelevant(message, `${opinion.topic} ${opinion.stance}`),
    )
    .slice(0, 4)
    .map((opinion) =>
      persistMotivation(
        db,
        ownerId,
        "opinion",
        Math.max(20, 60 - ageHours(opinion.updatedAt) * 2),
        `Current opinion on ${opinion.topic}: ${opinion.stance}`,
        "opinion",
        opinion.id,
      ),
    );
}

function openCognitiveItemMotivation(
  item: OpenCognitiveItemRecord,
): { kind: MotivationKind; score: number } {
  // These are mechanical candidate compatibility values, not care,
  // attachment, relationship, or emotional importance scores.
  switch (item.kind) {
    case "question":
      return { kind: "question", score: 58 };
    case "revisit":
      return { kind: "unfinished", score: 52 };
    case "concern":
      return { kind: "unfinished", score: 44 };
  }
}

function addOpenCognitiveItems(
  db: DatabaseSync,
  ownerId: string,
  trigger: Trigger,
  message: string,
): Motivation[] {
  const reactiveRelevant = trigger === "reactive";
  const now = Date.now();
  return listOpenCognitiveItems(db, ownerId, { status: "OPEN", limit: 8 })
    .filter((item) => openCognitiveItemEligibleForInfluence(db, item, now))
    .filter(
      (item) =>
        !reactiveRelevant ||
        !message ||
        isTextRelevant(message, item.semanticSummary),
    )
    .slice(0, 8)
    .map((item) => {
      const projection = openCognitiveItemMotivation(item);
      return persistMotivation(
        db,
        ownerId,
        projection.kind,
        projection.score,
        item.semanticSummary,
        "open_cognitive_item",
        item.entityUuid,
      );
    });
}

export function collectMotivations(
  db: DatabaseSync,
  ownerId: string,
  trigger: Trigger,
  userMessage?: string,
  userMessageId?: number,
  options: MotivationCollectionOptions = {},
): Motivation[] {
  const motivations: Motivation[] = [];
  const state = getState(db, ownerId);
  const message = userMessage?.trim() ?? "";
  const reactiveRelevant = trigger === "reactive";

  for (const question of listOpenQuestions(db, ownerId, 8)) {
    if (
      reactiveRelevant &&
      message &&
      !isTextRelevant(message, question.text)
    ) {
      continue;
    }
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        "question",
        Math.max(20, Math.min(100, question.priority * 2 + 30)),
        question.text,
        "question",
        question.id,
      ),
    );
  }

  for (const fact of listActiveFacts(db, ownerId, reactiveRelevant ? 24 : 10)) {
    if (
      reactiveRelevant &&
      message &&
      !isTextRelevant(message, `${fact.key} ${fact.value}`)
    ) {
      continue;
    }
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        "fact",
        Math.max(15, Math.min(80, fact.importance * 0.7)),
        `${fact.key}: ${fact.value}`,
        "fact",
        fact.id,
      ),
    );
  }

  motivations.push(
    ...addOpinions(
      db,
      ownerId,
      listOpinions(db, ownerId),
      message,
      reactiveRelevant && Boolean(message),
    ),
  );

  for (const take of capabilityCanInfluence(db, "reading") &&
    capabilityCanInfluence(db, "curiosity_consolidation")
    ? listRecentTakes(db, 12)
        .filter(
          (candidate) =>
            candidate.evidenceKind === "read_record" &&
            candidate.provenance === "live",
        )
        .slice(0, 6)
    : []) {
    if (
      reactiveRelevant &&
      message &&
      !isTextRelevant(message, `${take.title} ${take.take}`)
    ) {
      continue;
    }
    const score = Math.max(20, 55 - ageHours(take.createdAt) * 3);
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        "take",
        score,
        `${take.title}: ${take.take}`,
        "take",
        take.id,
      ),
    );
  }

  for (const unfinished of state.unfinished.slice(0, 4)) {
    if (
      reactiveRelevant &&
      message &&
      !isTextRelevant(message, unfinished)
    ) {
      continue;
    }
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        "unfinished",
        48,
        unfinished,
        "state",
        ownerId,
      ),
    );
  }

  for (const item of capabilityCanInfluence(db, "mind_state")
    ? listActiveMindStateItems(db, ownerId, 12)
    : []) {
    // Active Mind State may always candidate; relevance still preferred on reactive.
    if (
      reactiveRelevant &&
      message &&
      item.urgency < 0.75 &&
      !isTextRelevant(message, item.text)
    ) {
      continue;
    }
    const m = mindStateItemToMotivation({
      kind: item.kind,
      text: item.text,
      activation: item.activation,
      urgency: item.urgency,
      id: item.id,
    });
    motivations.push(
      persistMotivation(db, ownerId, m.kind, m.score, m.summary, m.refType, m.refId),
    );
  }

  if (options.includeOpenCognitiveItems !== false) {
    motivations.push(...addOpenCognitiveItems(db, ownerId, trigger, message));
  }

  for (const projection of listRelationshipMotivationProjections(
    db,
    ownerId,
    trigger,
    message,
  )) {
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        projection.kind,
        projection.score,
        projection.summary,
        projection.refType,
        projection.refId,
      ),
    );
  }

  if (state.availability !== "available") {
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        "availability",
        70,
        `Availability is ${state.availability}.`,
        "state",
        ownerId,
      ),
    );
  }

  if (trigger === "reactive" && message) {
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        isSilenceRequest(message) ? "silence_signal" : "user_message",
        isSilenceRequest(message) ? 100 : userMessageScore(message),
        message,
        "message",
        userMessageId ?? null,
      ),
    );
    // Boundaries enter the pool only when relevance-licensed.
    for (const boundary of listIdentity(db, ownerId)
      .filter((entry) =>
        entry.layer === "stable" &&
        (entry.kind === "boundary" || entry.kind.startsWith("boundary.")))
      .slice(0, 6)) {
      if (!isBoundaryRelevant(message, boundary.text)) continue;
      motivations.push(
        persistMotivation(
          db,
          ownerId,
          "boundary",
          55,
          boundary.text,
          "identity",
          boundary.id,
        ),
      );
    }
  }

  if (trigger === "proactive") {
    // Proactive may still see stable boundaries to suppress initiative, not refuse.
    for (const boundary of listIdentity(db, ownerId)
      .filter((entry) =>
        entry.layer === "stable" &&
        (entry.kind === "boundary" || entry.kind.startsWith("boundary.")))
      .slice(0, 6)) {
      motivations.push(
        persistMotivation(
          db,
          ownerId,
          "boundary",
          40,
          boundary.text,
          "identity",
          boundary.id,
        ),
      );
    }
  }

  if (
    trigger === "proactive" &&
    relationshipCanInfluence(db, "apply", "relational_initiative")
  ) {
    const nowIso = new Date().toISOString();
    for (const reminder of listDueDocReminders(db, ownerId, nowIso)) {
      const motivation = persistMotivation(
        db,
        ownerId,
        "reminder",
        72,
        reminder.text,
        "doc_reminder",
        reminder.entityUuid,
      );
      if (
        tryClaimRelationshipMotivation(db, {
          ownerId,
          relationshipEntityType: "doc_reminder",
          relationshipEntityUuid: reminder.entityUuid,
          motivationId: motivation.id!,
        })
      ) {
        motivations.push(motivation);
      }
    }
  }

  motivations.push(
    persistMotivation(
      db,
      ownerId,
      "silence_ok",
      trigger === "proactive" ? 8 : 2,
      "Silence is always available when nothing earns the interruption.",
    ),
  );

  return motivations.sort((a, b) => b.score - a.score);
}
