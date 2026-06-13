import type { DatabaseSync } from "node:sqlite";
import { getKv, setKv } from "./kv.js";
import { buildCorrectionGuard } from "./correction-guard.js";
import { forgetByTopic } from "./facts.js";
import { purgeDeniedTopics } from "./memory-veto.js";

const KV_PREFIX = "correction_denylist:";

/** Explicit forget only — no substring auto-delete on casual "unut". */
const EXPLICIT_FORGET =
  /^(?:unut|forget)\s*[:\-]\s*(.+)$/i;

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
