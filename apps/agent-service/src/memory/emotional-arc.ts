import type { DatabaseSync } from "node:sqlite";
import { completeChat } from "../mistral-client.js";
import { env } from "../env.js";

type MoodCountRow = { mood: string; c: number };

export type EmotionalArcRow = {
  id: number;
  owner_id: string;
  period: "daily" | "weekly";
  period_start: string;
  period_end: string;
  summary: string;
  dominant_mood: string | null;
  mood_counts: string | null;
  trend: "improving" | "declining" | "stable" | "mixed" | null;
  created_at: string;
};

const POSITIVE = new Set([
  "warm",
  "playful",
  "curious",
  "amused",
  "fond",
  "energized",
  "proud",
  "smug",
]);
const NEGATIVE = new Set([
  "tired",
  "irritated",
  "flat",
  "melancholy",
  "bored",
  "worried",
  "restless",
  "conflicted",
]);

function countMoods(
  db: DatabaseSync,
  ownerId: string,
  sinceIso: string,
): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT mood, COUNT(*) AS c FROM mem_mood
       WHERE owner_id = ? AND created_at >= ?
       GROUP BY mood`,
    )
    .all(ownerId, sinceIso) as MoodCountRow[];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.mood] = r.c;
  return counts;
}

function dominantOf(counts: Record<string, number>): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [mood, c] of Object.entries(counts)) {
    if (c > n) {
      best = mood;
      n = c;
    }
  }
  return best;
}

function classifyTrend(counts: Record<string, number>): "improving" | "declining" | "stable" | "mixed" {
  let pos = 0;
  let neg = 0;
  for (const [mood, c] of Object.entries(counts)) {
    if (POSITIVE.has(mood)) pos += c;
    else if (NEGATIVE.has(mood)) neg += c;
  }
  if (pos === 0 && neg === 0) return "stable";
  if (pos > neg * 1.5) return "improving";
  if (neg > pos * 1.5) return "declining";
  if (Math.abs(pos - neg) <= 1) return "stable";
  return "mixed";
}

function latestArc(
  db: DatabaseSync,
  ownerId: string,
  period: "daily" | "weekly",
): EmotionalArcRow | null {
  return (
    (db
      .prepare(
        `SELECT * FROM mem_emotional_arcs
         WHERE owner_id = ? AND period = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(ownerId, period) as EmotionalArcRow | undefined) ?? null
  );
}

export async function buildWeeklyEmotionalArc(
  db: DatabaseSync,
  ownerId: string,
): Promise<{ wrote: boolean; reason?: string }> {
  if (!env.mistralApiKey) return { wrote: false, reason: "no_api_key" };

  const last = latestArc(db, ownerId, "weekly");
  if (last) {
    const ageDays =
      (Date.now() - new Date(last.created_at).getTime()) / 86_400_000;
    if (ageDays < 7) return { wrote: false, reason: "not_due" };
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 86_400_000);
  const counts = countMoods(db, ownerId, periodStart.toISOString());
  if (Object.keys(counts).length === 0) {
    return { wrote: false, reason: "no_moods" };
  }

  const dominant = dominantOf(counts);
  const trend = classifyTrend(counts);
  const moodCountsJson = JSON.stringify(counts);

  const { text } = await completeChat(
    [
      {
        role: "system",
        content: `You are Ashley writing a private note about Doc's emotional pattern this week.
Given these mood counts: ${moodCountsJson}
Dominant mood: ${dominant}
Trend: ${trend}

Write 1-2 sentences noting the pattern. Be specific about what you noticed.
Example: "He's been flat most of the week but perked up when the deploy went clean."
No bullet lists. No headers. Plain text only.`,
      },
      { role: "user", content: "Write the note." },
    ],
    {
      model: env.mistralModel,
      maxTokens: 120,
      temperature: 0.4,
      reasoningEffort: "medium",
      lane: "background",
    },
  );

  const summary = text.trim();
  if (summary.length < 10) return { wrote: false, reason: "empty" };

  db.prepare(
    `INSERT INTO mem_emotional_arcs
      (owner_id, period, period_start, period_end, summary, dominant_mood, mood_counts, trend, created_at)
     VALUES (?, 'weekly', ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    ownerId,
    periodStart.toISOString(),
    periodEnd.toISOString(),
    summary,
    dominant,
    moodCountsJson,
    trend,
  );

  return { wrote: true };
}

/** Lightweight daily rollup from mood rows (no LLM). */
export function buildDailyEmotionalArc(
  db: DatabaseSync,
  ownerId: string,
): { wrote: boolean; reason?: string } {
  const last = latestArc(db, ownerId, "daily");
  if (last) {
    const ageH =
      (Date.now() - new Date(last.created_at).getTime()) / 3_600_000;
    if (ageH < 20) return { wrote: false, reason: "not_due" };
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
  const counts = countMoods(db, ownerId, periodStart.toISOString());
  if (Object.keys(counts).length === 0) {
    return { wrote: false, reason: "no_moods" };
  }

  const dominant = dominantOf(counts);
  const trend = classifyTrend(counts);
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([m, c]) => `${m}×${c}`);
  const summary = `Today: ${parts.join(", ")}. Dominant ${dominant ?? "unclear"}, trend ${trend}.`;

  db.prepare(
    `INSERT INTO mem_emotional_arcs
      (owner_id, period, period_start, period_end, summary, dominant_mood, mood_counts, trend, created_at)
     VALUES (?, 'daily', ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    ownerId,
    periodStart.toISOString(),
    periodEnd.toISOString(),
    summary,
    dominant,
    JSON.stringify(counts),
    trend,
  );

  return { wrote: true };
}

export function buildEmotionalArcBlock(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const weekly = latestArc(db, ownerId, "weekly");
  const daily = latestArc(db, ownerId, "daily");
  if (!weekly && !daily) return null;
  const lines = ["## Emotional patterns (internal)"];
  if (weekly?.summary) lines.push(`This week: ${weekly.summary}`);
  if (daily?.summary) lines.push(`Today: ${daily.summary}`);
  return lines.join("\n");
}
