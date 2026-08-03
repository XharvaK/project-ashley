import type { DatabaseSync } from "node:sqlite";
import { createQuestion } from "./state/questions.js";
import { upsertOpinion, recordIdentityEntry } from "./identity/store.js";
import { upsertFact } from "./memory/facts.js";

const PIN_RE =
  /^(?:bunu hatırla(?:\s+özel)?|remember(?:\s+this)?(?:\s+private)?)\s*[:：]\s*(.+)$/i;
const FORGET_RE = /^(?:unut|forget)\s*[:：]\s*(.+)$/i;
const OPEN_Q_RE =
  /\b(?:i(?:'m| am) (?:still )?(?:curious|wondering)|what do you think about|how do you feel about)\b/i;
const SLEEP_RE =
  /\b(?:gn|good ?night|going to (?:bed|sleep)|i(?:'ll| will) be sleeping|afk|brb)\b/i;

/**
 * Persist durable state from a user turn. Heuristic writers — Agency consumes
 * whatever lands in nuclear.db.
 */
export function writeFromUserTurn(
  db: DatabaseSync,
  ownerId: string,
  message: string,
): { pinned: boolean; forgotTopic: string | null; sleepSignal: boolean } {
  const trimmed = message.trim();
  const pin = trimmed.match(PIN_RE);
  if (pin?.[1]) {
    const value = pin[1].trim();
    upsertFact(db, {
      ownerId,
      category: "pinned",
      key: value.slice(0, 80).toLowerCase().replace(/\s+/g, "_"),
      value,
      confidence: 1,
      importance: 90,
    });
    return { pinned: true, forgotTopic: null, sleepSignal: false };
  }

  const forget = trimmed.match(FORGET_RE);
  if (forget?.[1]) {
    return {
      pinned: false,
      forgotTopic: forget[1].trim(),
      sleepSignal: false,
    };
  }

  if (OPEN_Q_RE.test(trimmed) || /\?\s*$/.test(trimmed)) {
    const q = trimmed.replace(/\s+/g, " ").slice(0, 280);
    if (q.length >= 12) {
      createQuestion(db, {
        ownerId,
        subject: "about_doc",
        text: q,
        priority: 0.55,
      });
    }
  }

  return {
    pinned: false,
    forgotTopic: null,
    sleepSignal: SLEEP_RE.test(trimmed),
  };
}

/** After Ashley speaks, capture organic identity/interest crumbs. */
export function writeFromAssistantTurn(
  db: DatabaseSync,
  ownerId: string,
  text: string,
): void {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 40) return;

  const interest = trimmed.match(
    /\bi(?:'ve| have)? (?:been )?(?:into|reading about|thinking about)\s+([^,.!?\n]{3,60})/i,
  );
  if (interest?.[1]) {
    recordIdentityEntry(db, {
      ownerId,
      layer: "dynamic",
      kind: "interest",
      text: interest[1].trim(),
      source: "organic",
    });
  }
}

/** Curiosity takes become opinions she actually holds. */
export function writeOpinionFromTake(
  db: DatabaseSync,
  ownerId: string,
  interest: string,
  take: string,
  title?: string,
): number {
  const topic = (interest || title || "feed").trim().slice(0, 120);
  const stance = take.trim().slice(0, 500);
  if (!topic || !stance) return 0;
  return upsertOpinion(db, {
    ownerId,
    topic,
    stance,
    confidence: 0.6,
  });
}
