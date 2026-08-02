import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import type { ConsolidationWorker } from "./consolidator.js";
import { pinFact } from "./facts.js";
import { setFactsCutoff } from "./threads.js";
import type { FactInput } from "./types.js";

const REMEMBER_IMPERATIVE =
  /(?:^|\s)(?:bunu hatırla|remember this|not et)(?:\s*[:\-]\s*|\s+)(.+)/i;
const REMEMBER_PRIVATE =
  /(?:^|\s)(?:bunu hatırla|remember this)\s*(?:özel|private)\s*[:\-]\s*(.+)/i;
const REMEMBER_BARE = /^(?:bunu hatırla|remember this|not et)\.?$/i;

const HAS_URL = /https?:\/\/[^\s<>"'`]+/i;

/**
 * Doc pointing at his own work with a link: "You should read my blog post:
 * <url>". A defined high-signal event class, not a fact-value pattern — the
 * extractor (runFacts) still decides what the fact is; this only decides that
 * extraction should run now instead of waiting the N-turn cadence.
 */
const SELF_ATTRIBUTION =
  /\bmy\s+(blog|blog post|article|post|substack|site|website|web site|essay|piece|writeup)\b|\b(blogum|bloğum|sitem|yazım)(?:um|un|ün|ım|ın|a|e|da|de|u|ü|ı|i|nu|nü|na|ne|dan|den)?\b/i;

export function isSelfDisclosedLink(text: string): boolean {
  return HAS_URL.test(text) && SELF_ATTRIBUTION.test(text);
}

export type AutoRememberResult = {
  action: "pin" | "enqueue";
  facts: Array<{ key: string; value: string; category: string }>;
};

function slugKey(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

/**
 * Explicit pins only. Conversational "working on X" / preference patterns used
 * to store banter as standing facts; the consolidator already extracts those
 * with confidence floors and supersession.
 */
export function detectAutoRemember(
  text: string,
):
  | { action: "pin"; fact: FactInput; private: boolean }
  | { action: "enqueue" }
  | null {
  if (!env.autoRememberEnabled) return null;

  const privateMatch = text.match(REMEMBER_PRIVATE);
  if (privateMatch?.[1]) {
    const value = privateMatch[1].trim();
    if (value.length >= 2) {
      return {
        action: "pin",
        private: true,
        fact: {
          category: "pinned",
          key: slugKey("pinned"),
          value,
          confidence: 1,
          sensitivity: "private",
        },
      };
    }
  }

  const imperative = text.match(REMEMBER_IMPERATIVE);
  if (imperative?.[1]) {
    const value = imperative[1].trim();
    if (value.length >= 2) {
      return {
        action: "pin",
        private: false,
        fact: {
          category: "pinned",
          key: slugKey("pinned"),
          value,
          confidence: 1,
          sensitivity: "none",
        },
      };
    }
  }
  if (REMEMBER_BARE.test(text.trim())) {
    return { action: "enqueue" };
  }

  return null;
}

export function applyAutoRemember(
  db: DatabaseSync,
  ownerId: string,
  threadId: string,
  messageId: number,
  text: string,
  consolidator: ConsolidationWorker,
): AutoRememberResult | null {
  const detected = detectAutoRemember(text);
  if (!detected) return null;

  if (detected.action === "pin") {
    const pinned = pinFact(
      db,
      ownerId,
      detected.fact.value,
      detected.private ? "private" : "none",
    );
    if (!pinned) return null;
    setFactsCutoff(db, threadId, messageId);
    return {
      action: "pin",
      facts: [
        {
          key: pinned.key,
          value: pinned.value,
          category: "pinned",
        },
      ],
    };
  }

  consolidator.enqueuePriorityFacts(ownerId, threadId, messageId);
  return { action: "enqueue", facts: [] };
}
