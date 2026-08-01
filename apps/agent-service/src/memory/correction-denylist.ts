import type { DatabaseSync } from "node:sqlite";
import { completeChat } from "../mistral-client.js";
import { env } from "../env.js";
import { getKv, setKv } from "./kv.js";
import { buildCorrectionGuard } from "./correction-guard.js";
import { forgetByTopic } from "./facts.js";
import { purgeDeniedTopics } from "./memory-veto.js";
import { parseJsonObject } from "./extract-json.js";
import type { FactInput } from "./types.js";

const KV_PREFIX = "correction_denylist:";

/** Explicit forget only — no substring auto-delete on casual "unut". */
const EXPLICIT_FORGET =
  /^(?:unut|forget)\s*[:\-]\s*(.+)$/i;

const CORRECTION_PATTERNS = [
  /(?:no|actually|wrong|incorrect),?\s+(?:it'?s?|i|he|she|they)\s+(.{10,120})/i,
  /(?:hayır|yanlış|aslında),?\s+(.{10,120})/i,
];

export function denylistKey(ownerId: string): string {
  return `${KV_PREFIX}${ownerId}`;
}

export function getDenylist(db: DatabaseSync, ownerId: string): string[] {
  const raw = getKv(db, denylistKey(ownerId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function addToDenylist(
  db: DatabaseSync,
  ownerId: string,
  topics: string[],
): void {
  const normalized = topics
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (normalized.length === 0) return;
  const current = new Set(getDenylist(db, ownerId));
  for (const t of normalized) current.add(t);
  setKv(db, denylistKey(ownerId), JSON.stringify([...current]));
  purgeDeniedTopics(db, ownerId, normalized);
}

export function syncDenylistFromThread(
  db: DatabaseSync,
  ownerId: string,
  threadId: string,
): void {
  const guard = buildCorrectionGuard(db, threadId);
  if (!guard) return;
  const match = guard.match(
    /do not mention again unless Doc reintroduces them: ([^.]+)\./,
  );
  if (!match?.[1]) return;
  const topics = match[1].split(",").map((s) => s.trim());
  addToDenylist(db, ownerId, topics);
}

export function isTextDenied(text: string, denylist: string[]): boolean {
  if (denylist.length === 0) return false;
  const lower = text.toLowerCase();
  return denylist.some((topic) => {
    const t = topic.toLowerCase().trim();
    if (t.length < 2) return false;
    return lower.includes(t);
  });
}

export function handleForgetRequest(
  db: DatabaseSync,
  ownerId: string,
  text: string,
): { handled: boolean; preview: string[] } {
  const match = text.trim().match(EXPLICIT_FORGET);
  if (!match?.[1]) return { handled: false, preview: [] };

  const topic = match[1].trim();
  if (topic.length < 2) return { handled: false, preview: [] };

  const { preview } = forgetByTopic(db, ownerId, topic, true);
  addToDenylist(db, ownerId, [topic]);
  return { handled: true, preview };
}

/**
 * When Doc corrects something, extract the *right* fact (denylist only blocks the wrong one).
 * Uses dynamic import of mergeFacts to avoid a circular module edge with facts.ts.
 */
export async function extractCorrectedFact(
  db: DatabaseSync,
  ownerId: string,
  userMessage: string,
  threadId: string,
): Promise<boolean> {
  if (!env.mistralApiKey) return false;
  if (!CORRECTION_PATTERNS.some((p) => p.test(userMessage))) return false;

  const prior = db
    .prepare(
      `SELECT role, text FROM mem_messages
       WHERE thread_id = ? AND role IN ('user', 'assistant')
       ORDER BY id DESC LIMIT 4`,
    )
    .all(threadId) as Array<{ role: string; text: string }>;

  const context = prior
    .reverse()
    .map((r) => `${r.role}: ${r.text.slice(0, 300)}`)
    .join("\n");

  try {
    const { text } = await completeChat(
      [
        {
          role: "system",
          content: `Doc just corrected something. Extract the correct fact as JSON only:
{"category":"preference"|"person"|"ongoing"|"project"|"identity"|"event"|"pattern","key":"short_key","value":"corrected fact"}
If nothing durable to store, reply {"skip":true}.`,
        },
        {
          role: "user",
          content: `CORRECTION:\n${userMessage}\n\nCONTEXT:\n${context}`,
        },
      ],
      {
        model: env.mistralConsolidationModel,
        maxTokens: 120,
        temperature: 0.1,
        reasoningEffort: "low",
        lane: "background",
      },
    );

    const parsed = parseJsonObject(text) as {
      skip?: boolean;
      category?: FactInput["category"];
      key?: string;
      value?: string;
    } | null;
    if (!parsed || parsed.skip || !parsed.key || !parsed.value) return false;
    const category = parsed.category ?? "ongoing";
    if (category === "pinned") return false;

    const { mergeFacts } = await import("./facts.js");
    mergeFacts(
      db,
      ownerId,
      [
        {
          category,
          key: parsed.key.slice(0, 80),
          value: parsed.value.slice(0, 400),
          confidence: 0.95,
        },
      ],
      null,
    );
    return true;
  } catch (err) {
    console.warn("[memory] correction extract failed:", err);
    return false;
  }
}
