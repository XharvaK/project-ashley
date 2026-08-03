import type { DatabaseSync } from "node:sqlite";
import { listOpenQuestions } from "../state/questions.js";
import { listRecentTakes } from "../curiosity/feed.js";
import { listActiveFacts } from "../memory/facts.js";
import { getState } from "../state/store.js";
import { listOpinions } from "../identity/store.js";
import { listActiveMindStateItems } from "../state/mind-items.js";
import type {
  Motivation,
  MotivationKind,
  Opinion,
  Trigger,
} from "../types.js";
import { capabilityCanInfluence } from "../rollout/capabilities.js";

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

function addOpinions(
  db: DatabaseSync,
  ownerId: string,
  opinions: Opinion[],
): Motivation[] {
  return opinions
    .filter((opinion) => ageHours(opinion.updatedAt) <= 168)
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

export function collectMotivations(
  db: DatabaseSync,
  ownerId: string,
  trigger: Trigger,
  userMessage?: string,
): Motivation[] {
  const motivations: Motivation[] = [];
  const state = getState(db, ownerId);

  for (const question of listOpenQuestions(db, ownerId, 8)) {
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

  for (const fact of listActiveFacts(db, ownerId, 10)) {
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

  motivations.push(...addOpinions(db, ownerId, listOpinions(db, ownerId)));

  for (const take of listRecentTakes(db, 6)) {
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
    const kind: MotivationKind =
      item.kind === "unfinished" || item.kind === "commitment"
        ? "unfinished"
        : item.kind === "interest"
          ? "identity"
          : "callback";
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        kind,
        Math.max(
          20,
          Math.min(100, item.activation * 55 + item.urgency * 45),
        ),
        item.text,
        "mind_state",
        item.id,
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

  const message = userMessage?.trim() ?? "";
  if (trigger === "reactive" && message) {
    motivations.push(
      persistMotivation(
        db,
        ownerId,
        isSilenceRequest(message) ? "silence_signal" : "user_message",
        isSilenceRequest(message) ? 100 : userMessageScore(message),
        message,
        "user_message",
        null,
      ),
    );
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
