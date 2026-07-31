import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import {
  countProvenance,
  logProvenance,
  markTakesSurfaced,
  recentTakes,
  type TakeRow,
} from "./store.js";

const STOP =
  /^(the|a|an|and|or|but|for|with|that|this|what|when|why|how|you|your|i'?m|about|from|have|has|had|was|were|are|is|be|been|it|its|to|of|in|on|at|as|by|not|do|does|did|just|like|bir|bu|ne|ama|için|ile|çok|daha|gibi|var|yok|ben|sen)$/i;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.test(w));
}

export function overlapScore(take: TakeRow, message: string): number {
  const asked = new Set(words(message));
  if (asked.size === 0) return 0;
  const candidate = words(`${take.title} ${take.take} ${take.interest}`);
  const shared = new Set(candidate.filter((w) => asked.has(w)));
  return shared.size;
}

export type CuriosityInjection = { text: string; takeIds: number[] } | null;

/**
 * Her reading surfaces only when it actually touches what Doc is talking about,
 * and only a couple of times a day. Everything else stays unsaid, which is what
 * a person with an inner life looks like from the outside.
 */
export function selectCuriosityTakes(
  takes: TakeRow[],
  message: string,
  max = 3,
): TakeRow[] {
  return takes
    .map((take) => ({ take, score: overlapScore(take, message) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.take.surfaced_count - b.take.surfaced_count)
    .slice(0, max)
    .map((r) => r.take);
}

export function buildCuriosityBlock(takes: TakeRow[]): string | null {
  if (takes.length === 0) return null;
  const lines = takes.map((t) => `- ${t.take} (from: ${t.title})`);
  return [
    "Things you actually read since you last talked. Optional texture, not a briefing:",
    "",
    ...lines,
    "",
    "Bring one in only if it genuinely touches what he is saying, as one clause in your own words. Never open with it, never list them, never call it an article you found. If none of it fits, say nothing about your reading at all.",
  ].join("\n");
}

export function assembleCuriosity(
  db: DatabaseSync,
  message: string,
): CuriosityInjection {
  if (!env.curiosityEnabled) return null;
  // Surfacing caps, checked against the append-only log rather than memory:
  // at most one per hour and a couple a day, so it stays a side of her rather
  // than a feature she performs.
  if (countProvenance(db, "surface", 1) >= 1) return null;
  if (countProvenance(db, "surface", 24) >= env.curiositySurfacePerDay) {
    return null;
  }

  const takes = selectCuriosityTakes(recentTakes(db, 48), message);
  const text = buildCuriosityBlock(takes);
  if (!text) return null;

  return { text, takeIds: takes.map((t) => t.id) };
}

export function commitCuriosity(
  db: DatabaseSync,
  injection: CuriosityInjection,
): void {
  if (!injection) return;
  markTakesSurfaced(db, injection.takeIds);
  logProvenance(db, "surface", `offered ${injection.takeIds.length} take(s)`);
}
