import type { DatabaseSync } from "node:sqlite";
import { getKv, setKv } from "./memory/kv.js";

const KEY = "signal:reaction";
const FRESH_MINUTES = 30;

const POSITIVE = new Set([
  "😂",
  "🤣",
  "😭",
  "❤️",
  "🔥",
  "💯",
  "👍",
  "😍",
  "🙌",
  "😅",
]);
const NEGATIVE = new Set(["👎", "🙄", "😐", "💀", "🤨", "😬"]);

export type ReactionFeedback = "positive" | "negative" | "neutral";

export function classifyReaction(emoji: string): ReactionFeedback {
  const bare = emoji.replace(/\uFE0F/g, "");
  if (POSITIVE.has(emoji) || POSITIVE.has(bare)) return "positive";
  if (NEGATIVE.has(emoji) || NEGATIVE.has(bare)) return "negative";
  return "neutral";
}

/**
 * A reaction on her own message is a real conversational signal, and the cheapest
 * feedback loop there is: on a proactive DM it also tells the queue whether that
 * kind of material was welcome.
 */
export function recordReaction(
  db: DatabaseSync,
  ownerId: string,
  input: { messageId: string; emoji: string },
): { feedback: ReactionFeedback; matchedInitiative: boolean } {
  const feedback = classifyReaction(input.emoji);

  const updated = db
    .prepare(
      `UPDATE mem_initiative_log
       SET feedback = ?
       WHERE owner_id = ? AND discord_message_id = ?`,
    )
    .run(feedback, ownerId, input.messageId);

  setKv(
    db,
    KEY,
    JSON.stringify({
      emoji: input.emoji,
      feedback,
      at: new Date().toISOString(),
      consumed: false,
    }),
  );

  return { feedback, matchedInitiative: Number(updated.changes) > 0 };
}

/**
 * Surfaced once, then marked consumed: she notices the laugh, she does not bring
 * it up in three consecutive replies.
 */
export function takeReactionLine(
  db: DatabaseSync,
): string | null {
  const raw = getKv(db, KEY);
  if (!raw) return null;
  let parsed: { emoji?: string; at?: string; consumed?: boolean };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return null;
  }
  if (parsed.consumed || !parsed.emoji || !parsed.at) return null;

  const ageMin = (Date.now() - new Date(parsed.at).getTime()) / 60_000;
  if (ageMin > FRESH_MINUTES) return null;

  setKv(db, KEY, JSON.stringify({ ...parsed, consumed: true }));
  return `He put ${parsed.emoji} on your last message. You noticed. Do not thank him for it and do not make it the subject.`;
}

/**
 * How a candidate kind has landed so far. Used as a multiplier, so a kind he
 * keeps ignoring quietly loses ground instead of needing an env edit.
 */
export function kindFeedbackMultiplier(
  db: DatabaseSync,
  ownerId: string,
  kind: string,
): number {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN feedback = 'positive' THEN 1 ELSE 0 END) AS pos,
         SUM(CASE WHEN feedback = 'negative' THEN 1 ELSE 0 END) AS neg
       FROM mem_initiative_log
       WHERE owner_id = ? AND candidate_kind = ?`,
    )
    .get(ownerId, kind) as { pos: number | null; neg: number | null };
  const pos = row.pos ?? 0;
  const neg = row.neg ?? 0;
  if (pos + neg === 0) return 1;
  return Math.min(1.25, Math.max(0.5, 1 + (pos - neg) * 0.1));
}
