import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import type { ConsolidationWorker } from "./consolidator.js";
import { mergeFacts, pinFact } from "./facts.js";
import { setFactsCutoff } from "./threads.js";
import type { FactInput } from "./types.js";

const REMEMBER_IMPERATIVE =
  /(?:^|\s)(?:bunu hatırla|remember this|not et)(?:\s*[:\-]\s*|\s+)(.+)/i;
const REMEMBER_PRIVATE =
  /(?:^|\s)(?:bunu hatırla|remember this)\s*(?:özel|private)\s*[:\-]\s*(.+)/i;
const REMEMBER_BARE = /^(?:bunu hatırla|remember this|not et)\.?$/i;

const PROJECT_PATTERNS: Array<{ re: RegExp; key: string }> = [
  {
    re: /([\w][\w\s\-]{2,48}?)\s+üzerinde çalışıyorum/i,
    key: "current_project",
  },
  {
    re: /(.+?)(?:'de|’de)\s+çalışıyorum/i,
    key: "current_project",
  },
  {
    re: /([\w][\w\s\-]{2,48}?)\s+de\s+çalışıyorum/i,
    key: "current_project",
  },
  {
    re: /(?:projem|project (?:is|called))\s+([^.!?…\n]{3,48}?)(?=[.!?…\n]|$)/i,
    key: "current_project",
  },
  {
    re: /\b(?:working on|focused on)\s+([\w][\w\s\-]{2,48})/i,
    key: "current_project",
  },
];

const IDENTITY_PATTERNS: Array<{ re: RegExp; key: string }> = [
  { re: /(?:benim adım|my name is|i'm called)\s+(\S+)/i, key: "name" },
  { re: /(?:yaşıyorum|i live in)\s+(.{2,40})/i, key: "location" },
];

const PREFERENCE_PATTERNS: Array<{ re: RegExp; key: string }> = [
  {
    re: /(?:seviyorum|i (?:really )?like|i prefer)\s+(.{3,60})/i,
    key: "preference",
  },
];

export type AutoRememberResult = {
  action: "pin" | "merge" | "enqueue";
  facts: Array<{ key: string; value: string; category: string }>;
};

function slugKey(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

/** Reject banter / multi-clause text mistaken for a standing fact */
const MERGE_FILLER =
  /\b(sensin|şapşik|aptal|salak|yeterli|sanırım|evet|hayır|bira|yeter|artık|bugünlük|bugün|kadar)\b/i;

function isPlausibleMergeValue(value: string): boolean {
  const v = value.trim().replace(/[.!?]+$/, "");
  if (v.length < 3 || v.length > 48) return false;
  if (/[.!?…,;:]/.test(v)) return false;
  if (MERGE_FILLER.test(v)) return false;
  if (/\b(sen|sana|sensin|siz)\b/i.test(v)) return false;
  if (v.split(/\s+/).length > 5) return false;
  return true;
}

/** Cursor'da Ashley / composer-assistant üzerinde çalışma — şaka dili olsa da gerçek proje */
function detectAshleySelfProject(text: string): FactInput | null {
  if (!/\bprojem\b/i.test(text) && !/\bproject\b/i.test(text)) return null;
  const refersToAshley =
    /\b(?:sensin|sen\b|ashley)\b/i.test(text) ||
    /\bcomposer-assistant\b/i.test(text);
  if (!refersToAshley) return null;

  return {
    category: "project",
    key: "current_project",
    value: "composer-assistant (Ashley)",
    confidence: 0.95,
    sensitivity: "none",
  };
}

function tryPatterns(
  text: string,
  patterns: Array<{ re: RegExp; key: string }>,
  category: FactInput["category"],
): FactInput | null {
  for (const { re, key } of patterns) {
    const m = text.match(re);
    const value = m?.[1]?.trim().replace(/[.!?]+$/, "");
    if (value && value.length >= 3 && isPlausibleMergeValue(value)) {
      return {
        category,
        key: key === "preference" ? slugKey("pref") : key,
        value,
        confidence: 0.95,
        sensitivity: "none",
      };
    }
  }
  return null;
}

export function detectAutoRemember(
  text: string,
):
  | { action: "pin"; fact: FactInput; private: boolean }
  | { action: "merge"; fact: FactInput }
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

  const ashleyProject = detectAshleySelfProject(text);
  if (ashleyProject) {
    return { action: "merge", fact: ashleyProject };
  }

  const candidates = [
    tryPatterns(text, PROJECT_PATTERNS, "project"),
    tryPatterns(text, IDENTITY_PATTERNS, "person"),
    tryPatterns(text, PREFERENCE_PATTERNS, "preference"),
  ].filter((f): f is FactInput => f !== null);

  if (candidates.length) {
    return { action: "merge", fact: candidates[0]! };
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

  if (detected.action === "merge") {
    mergeFacts(db, ownerId, [detected.fact], messageId);
    setFactsCutoff(db, threadId, messageId);
    return {
      action: "merge",
      facts: [
        {
          key: detected.fact.key,
          value: detected.fact.value,
          category: detected.fact.category,
        },
      ],
    };
  }

  consolidator.enqueuePriorityFacts(ownerId, threadId, messageId);
  return { action: "enqueue", facts: [] };
}
