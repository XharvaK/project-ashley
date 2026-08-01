import type { DatabaseSync } from "node:sqlite";
import { getInterestNotebook } from "../curiosity/interest-notebook.js";
import { recentTakes } from "../curiosity/store.js";

const LOW_CONTENT_RE =
  /^(lol|lmao|haha|hey|hi|yo|naber|selam|evet|hayır|ok|kk|brb|gn|night|yeah|nice|cool|idk|hmm|sure|fair)[.!?~]*$/i;

const BALL_PASSED_RE =
  /\b(what's up|whats up|anything new|what are you up to|neler var|sen ne yapıyorsun|what else|tell me something|what have you been reading)\b/i;

export type PivotTrigger =
  | { kind: "consecutive_low_content" }
  | { kind: "ball_passed" }
  | null;

export function detectPivotTrigger(messages: Array<{ role: string; text: string }>): PivotTrigger {
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1]!;
  if (last.role === "user" && BALL_PASSED_RE.test(last.text.trim())) {
    return { kind: "ball_passed" };
  }

  // Check 2 consecutive user turns being low content
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length >= 2) {
    const u1 = userMessages[userMessages.length - 1]!.text.trim();
    const u2 = userMessages[userMessages.length - 2]!.text.trim();
    if (
      (LOW_CONTENT_RE.test(u1) || u1.length <= 8) &&
      (LOW_CONTENT_RE.test(u2) || u2.length <= 8)
    ) {
      return { kind: "consecutive_low_content" };
    }
  }

  return null;
}

export function selectPivotTopic(
  db: DatabaseSync,
  ownerId: string,
): { topic: string; material: string } | null {
  // Try top interest notebook note first
  const notebook = getInterestNotebook(db, ownerId);
  for (const thread of notebook) {
    if (thread.notes.length > 0) {
      return {
        topic: thread.title,
        material: thread.notes[0]!,
      };
    }
  }

  // Fallback to recent feed take
  const takes = recentTakes(db, 72, 5);
  if (takes.length > 0) {
    const t = takes[0]!;
    return {
      topic: t.title,
      material: t.take,
    };
  }

  return null;
}
