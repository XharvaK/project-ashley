import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import type { ActivityAskKind } from "./activity-ask.js";
import {
  countProvenance,
  logProvenance,
  markTakesSurfaced,
  recentTakes,
  takeHasFullRead,
  type ProvenanceKind,
  type TakeRow,
} from "./store.js";

const STOP =
  /^(the|a|an|and|or|but|for|with|that|this|what|when|why|how|you|your|i'?m|about|from|have|has|had|was|were|are|is|be|been|it|its|to|of|in|on|at|as|by|not|do|does|did|just|like|bir|bu|ne|ama|için|ile|çok|daha|gibi|var|yok|ben|sen)$/i;

/** Content tokens shared by curiosity overlap and watch/affinity gates. */
export function words(text: string): string[] {
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

export type CuriosityMode = "organic" | "solicited";

export type CuriosityInjection = {
  text: string;
  takeIds: number[];
  provenance: ProvenanceKind;
} | null;

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

/** Least-surfaced recent takes, no topic filter — for when he asked directly. */
export function selectSolicitedTakes(takes: TakeRow[], max = 2): TakeRow[] {
  return [...takes]
    .sort((a, b) => a.surfaced_count - b.surfaced_count || b.id - a.id)
    .slice(0, max);
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

export function buildSolicitedCuriosityBlock(
  takes: TakeRow[],
  kind: ActivityAskKind = "reading",
  opts?: {
    alsoInterests?: boolean;
    /** item_id → full article fetch logged */
    fullReadByItemId?: Map<number, boolean>;
  },
): string {
  const interestLine = opts?.alsoInterests
    ? " He also asked your interests — after the reading half, one short line from your own likes (core taste), not a list."
    : "";

  if (kind === "general") {
    if (takes.length === 0) {
      return [
        "He asked what you were doing / what you have been up to.",
        "You have no takes logged for this stretch.",
        "Nothing logged worth mentioning. One honest disposition is fine (flat, meh, irritated, quiet).",
        "Do not invent titles, waiting-as-plot, counting seconds, or that you don't feel.",
      ].join(" ");
    }
    const lines = takes.map((t) => `- ${t.take} (from: ${t.title})`);
    return [
      "He asked what you were doing. These are your real takes — answer from them, or say the stretch was quiet if none fit. Do not invent waiting-as-plot:",
      "",
      ...lines,
      "",
      "One or two clauses. Never list them as a briefing. Do not invent titles beyond these.",
    ].join("\n");
  }

  if (takes.length === 0) {
    return [
      "He asked what you have been reading.",
      "You have no takes logged today.",
      "Say you have not been reading anything worth mentioning.",
      "Do not invent titles or sources.",
      "Do not invent waiting-as-plot or that you don't feel.",
      "A Discord status count or 'I read' alone is not an answer.",
      interestLine.trim(),
    ]
      .filter(Boolean)
      .join(" ");
  }
  const lines = takes.map((t) => {
    const full = opts?.fullReadByItemId?.get(t.item_id);
    const depth =
      full === false ? " [skim/excerpt — do not claim a full read]" : "";
    return `- ${t.take} (from: ${t.title})${depth}`;
  });
  return [
    "He asked what you have been reading. These are your real takes — answer from them, briefly, in your own words:",
    "",
    ...lines,
    "",
    "Name one piece (title or clear paraphrase) and your take. A status string, a count, or 'I read' alone is not an answer. Do not recite Discord status. Do not pivot to him until you answered the reading ask." +
      interestLine,
    "Never list them as a briefing. Do not invent titles or sources beyond these.",
  ].join("\n");
}

function assembleOrganic(
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

  return {
    text,
    takeIds: takes.map((t) => t.id),
    provenance: "surface",
  };
}

function assembleSolicited(
  db: DatabaseSync,
  kind: ActivityAskKind,
  opts?: { alsoInterests?: boolean },
): CuriosityInjection {
  // Always license an answer: empty honesty when curiosity is off or no takes,
  // so we never leave hasReadActivity with a null inject on a direct ask.
  const alsoInterests = opts?.alsoInterests === true;
  if (!env.curiosityEnabled) {
    return {
      text: buildSolicitedCuriosityBlock([], kind, { alsoInterests }),
      takeIds: [],
      provenance: "mention",
    };
  }

  const takes = selectSolicitedTakes(recentTakes(db, 48), 2);
  const fullReadByItemId = new Map(
    takes.map((t) => [t.item_id, takeHasFullRead(db, t.item_id)] as const),
  );
  return {
    text: buildSolicitedCuriosityBlock(takes, kind, {
      alsoInterests,
      fullReadByItemId,
    }),
    takeIds: takes.map((t) => t.id),
    provenance: "mention",
  };
}

export function assembleCuriosity(
  db: DatabaseSync,
  message: string,
  opts?: {
    mode?: CuriosityMode;
    askKind?: ActivityAskKind;
    alsoInterests?: boolean;
  },
): CuriosityInjection {
  const mode = opts?.mode ?? "organic";
  if (mode === "solicited") {
    return assembleSolicited(db, opts?.askKind ?? "reading", {
      alsoInterests: opts?.alsoInterests,
    });
  }
  return assembleOrganic(db, message);
}

export function commitCuriosity(
  db: DatabaseSync,
  injection: CuriosityInjection,
): void {
  if (!injection) return;
  markTakesSurfaced(db, injection.takeIds);
  const kind = injection.provenance;
  const detail =
    injection.takeIds.length > 0
      ? `offered ${injection.takeIds.length} take(s)`
      : "empty honesty";
  logProvenance(db, kind, detail);
}
