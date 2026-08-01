import type { DatabaseSync } from "node:sqlite";
import { addToDenylist } from "./correction-denylist.js";
import { forgetByTopic } from "./facts.js";

/** Natural-language catch phrases Doc uses when calling out confabulation. */
export const LIE_CATCH_RE =
  /\b(you'?re lying|you are lying|bullshit|you didn'?t|that never happened|made that up|you made that up|yalan|uydurma|yok öyle bir şey|uyduruyorsun)\b/i;

const TOPIC_HINTS: Array<{ re: RegExp; topic: string }> = [
  { re: /moltbook|claim|register|ngrok|endpoint/i, topic: "moltbook" },
  { re: /post|comment|upvote/i, topic: "moltbook posting" },
];

/**
 * When Doc calls out a lie, tombstone related topics so they stop licensing
 * future claims. Returns true if a catch fired.
 */
export function handleLieCatch(
  db: DatabaseSync,
  ownerId: string,
  userMessage: string,
): boolean {
  if (!LIE_CATCH_RE.test(userMessage)) return false;

  const topics = new Set<string>(["fabricated claims"]);
  for (const { re, topic } of TOPIC_HINTS) {
    if (re.test(userMessage)) topics.add(topic);
  }
  // Always scrub moltbook project fiction when any lie-catch fires in that arc.
  if (/molt|claim|register|ngrok|endpoint|server is live/i.test(userMessage)) {
    topics.add("moltbook");
    topics.add("moltbook_account");
    topics.add("moltbook_api");
    topics.add("moltbook_platform");
    topics.add("moltbook_registration");
  }

  for (const topic of topics) {
    forgetByTopic(db, ownerId, topic, true);
  }
  addToDenylist(db, ownerId, [...topics]);
  return true;
}
