import type { DatabaseSync } from "node:sqlite";
import { completeChat } from "../mistral-client.js";
import { env } from "../env.js";
import {
  buildDailyEmotionalArc,
  buildWeeklyEmotionalArc,
} from "./emotional-arc.js";
import { listActiveFacts, markStaleFacts } from "./facts.js";
import { evaluateTasteDrift } from "./taste-drift.js";
import type { MemReflection, ReflectionTier } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MICRO_ASSISTANT_EVERY = 20;

export function getLatestReflection(
  db: DatabaseSync,
  ownerId: string,
  tier?: ReflectionTier,
): MemReflection | null {
  if (tier) {
    return (
      (db
        .prepare(
          `SELECT * FROM mem_reflections
           WHERE owner_id = ? AND COALESCE(tier, 'daily') = ?
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(ownerId, tier) as MemReflection | undefined) ?? null
    );
  }
  return (
    (db
      .prepare(
        `SELECT * FROM mem_reflections
         WHERE owner_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(ownerId) as MemReflection | undefined) ?? null
  );
}

export function hoursSinceLastReflection(
  db: DatabaseSync,
  ownerId: string,
  tier: ReflectionTier = "daily",
): number {
  const latest = getLatestReflection(db, ownerId, tier);
  if (!latest) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(latest.created_at).getTime()) / 3_600_000;
}

export function reflectionDue(
  db: DatabaseSync,
  ownerId: string,
  tier: ReflectionTier = "daily",
): boolean {
  if (tier === "micro") {
    return hoursSinceLastReflection(db, ownerId, "micro") >= 4;
  }
  if (tier === "daily") {
    return hoursSinceLastReflection(db, ownerId, "daily") >= 24;
  }
  if (tier === "weekly") {
    return hoursSinceLastReflection(db, ownerId, "weekly") >= 24 * 7;
  }
  return hoursSinceLastReflection(db, ownerId, "monthly") >= 24 * 30;
}

function gatherTranscript(
  db: DatabaseSync,
  ownerId: string,
  windowMs: number,
  limit: number,
): { periodStart: string; periodEnd: string; transcript: string } {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - windowMs);
  const rows = db
    .prepare(
      `SELECT role, text, ts FROM mem_messages
       WHERE owner_id = ?
         AND ts >= ?
         AND ts <= ?
         AND role IN ('user', 'assistant')
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(
      ownerId,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      limit,
    ) as Array<{ role: string; text: string; ts: string }>;

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    transcript: rows.map((r) => `${r.role}: ${r.text.slice(0, 400)}`).join("\n"),
  };
}

function listTierBodies(
  db: DatabaseSync,
  ownerId: string,
  tier: ReflectionTier,
  limit: number,
): string {
  const rows = db
    .prepare(
      `SELECT body, created_at FROM mem_reflections
       WHERE owner_id = ? AND COALESCE(tier, 'daily') = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(ownerId, tier, limit) as Array<{ body: string; created_at: string }>;
  if (rows.length === 0) return "(none)";
  return rows
    .reverse()
    .map((r) => `[${r.created_at.slice(0, 10)}] ${r.body}`)
    .join("\n\n");
}

function promptForTier(tier: ReflectionTier): {
  system: string;
  maxTokens: number;
  minChars: number;
} {
  if (tier === "micro") {
    return {
      system: `You are Ashley writing a quick internal note. What just happened emotionally in the last few hours of chat? Any stance shifts? 2-3 sentences, plain text.`,
      maxTokens: 120,
      minChars: 20,
    };
  }
  if (tier === "weekly") {
    return {
      system: `You are Ashley writing a weekly private journal entry in first person.
Synthesize the daily reflections and standing facts into 200-400 words.
Cover interest trends, relationship evolution, recurring patterns, and "I've been thinking about..." material.
No bullet lists. No markdown headers. Plain text only.`,
      maxTokens: 700,
      minChars: 80,
    };
  }
  if (tier === "monthly") {
    return {
      system: `You are Ashley writing a monthly first-person self-narrative (400-800 words).
Synthesize weekly reflections, taste drift, and stance revision history into a sense of who you have been becoming.
Cover identity evolution, taste changes, emotional arc, and what you learned.
No bullet lists. No markdown headers. Plain text only.`,
      maxTokens: 1200,
      minChars: 120,
    };
  }
  return {
    system: `You are Ashley writing a private diary note about Doc after reviewing the last day of chat.
Write 1 short paragraph (80-160 words) in first person as Ashley.
Cover: new facts, project status shifts, emotional signals, behavioral patterns, stance changes.
Cross-reference standing facts when something repeats ("third time this week").
Be caring and specific, not creepy or clinical. No bullet lists. No markdown headers.
Output plain text only.`,
    maxTokens: 400,
    minChars: 40,
  };
}

export async function runReflectionJob(
  db: DatabaseSync,
  ownerId: string,
  options: { force?: boolean; tier?: ReflectionTier } = {},
): Promise<{ wrote: boolean; reason?: string }> {
  if (!env.mistralApiKey) return { wrote: false, reason: "no_api_key" };
  const tier: ReflectionTier = options.tier ?? "daily";
  if (!options.force && !reflectionDue(db, ownerId, tier)) {
    return { wrote: false, reason: "not_due" };
  }

  const windowMs =
    tier === "micro"
      ? 6 * 60 * 60 * 1000
      : tier === "weekly"
        ? 7 * DAY_MS
        : tier === "monthly"
          ? 30 * DAY_MS
          : DAY_MS;

  const { periodStart, periodEnd, transcript } = gatherTranscript(
    db,
    ownerId,
    windowMs,
    tier === "micro" ? 40 : 120,
  );

  const facts = listActiveFacts(db, ownerId, 30, false);
  const factBlock = facts.length
    ? facts.map((f) => `- ${f.category}/${f.key}: ${f.value}`).join("\n")
    : "(none)";

  const { system, maxTokens, minChars } = promptForTier(tier);
  let userContent = `STANDING_FACTS:\n${factBlock}\n\n`;

  if (tier === "daily") {
    const micros = listTierBodies(db, ownerId, "micro", 8);
    userContent += `MICRO_NOTES:\n${micros}\n\nTRANSCRIPT:\n${transcript || "(none)"}`;
  } else if (tier === "weekly") {
    userContent += `DAILY_REFLECTIONS:\n${listTierBodies(db, ownerId, "daily", 7)}`;
    try {
      const taste = evaluateTasteDrift(db);
      if (taste.updated.length || taste.signalsConsidered > 0) {
        userContent += `\n\nTASTE_DRIFT:\n${JSON.stringify(taste)}`;
      }
    } catch (err) {
      console.warn("[memory] taste drift during weekly failed:", err);
    }
  } else if (tier === "monthly") {
    userContent += `WEEKLY_REFLECTIONS:\n${listTierBodies(db, ownerId, "weekly", 5)}`;
    try {
      const taste = evaluateTasteDrift(db);
      userContent += `\n\nTASTE_DRIFT:\n${JSON.stringify(taste)}`;
    } catch {
      /* ignore */
    }
  } else {
    if (!transcript.trim()) return { wrote: false, reason: "no_messages" };
    userContent += `TRANSCRIPT:\n${transcript}`;
  }

  if (tier === "micro" && !transcript.trim()) {
    return { wrote: false, reason: "no_messages" };
  }
  if (
    tier === "daily" &&
    !transcript.trim() &&
    listTierBodies(db, ownerId, "micro", 1) === "(none)"
  ) {
    return { wrote: false, reason: "no_messages" };
  }

  const { text, model } = await completeChat(
    [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    {
      model: env.mistralModel,
      maxTokens,
      temperature: 0.4,
      reasoningEffort: "medium",
      lane: "background",
    },
  );

  const body = text.trim();
  if (body.length < minChars) return { wrote: false, reason: "empty" };

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_reflections (owner_id, period_start, period_end, body, model, created_at, tier)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(ownerId, periodStart, periodEnd, body, model, now, tier);

  console.info(
    `[memory] reflection wrote owner=${ownerId} tier=${tier} chars=${body.length}`,
  );

  if (tier === "daily") {
    try {
      markStaleFacts(db, ownerId);
    } catch (err) {
      console.warn("[memory] markStaleFacts failed:", err);
    }
    try {
      buildDailyEmotionalArc(db, ownerId);
    } catch (err) {
      console.warn("[memory] daily emotional arc failed:", err);
    }
    void buildWeeklyEmotionalArc(db, ownerId).catch((err) =>
      console.warn("[memory] weekly emotional arc failed:", err),
    );
    // Cascade: after a daily, try weekly/monthly if due.
    void runReflectionJob(db, ownerId, { tier: "weekly" }).catch(() => undefined);
    void runReflectionJob(db, ownerId, { tier: "monthly" }).catch(() => undefined);
  }

  return { wrote: true };
}

/** Activity-based micro reflection: every ~20 assistant messages. */
export function maybeEnqueueMicroReflection(
  db: DatabaseSync,
  ownerId: string,
  assistantCount: number,
): void {
  if (assistantCount <= 0 || assistantCount % MICRO_ASSISTANT_EVERY !== 0) {
    return;
  }
  void runReflectionJob(db, ownerId, { tier: "micro", force: true }).catch(
    (err) => console.warn("[memory] micro reflection failed:", err),
  );
}

export function buildReflectionBlock(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const daily = getLatestReflection(db, ownerId, "daily");
  const weekly = getLatestReflection(db, ownerId, "weekly");
  // Fallback for pre-tier rows.
  const latest = daily ?? getLatestReflection(db, ownerId);
  if (!latest?.body?.trim() && !weekly?.body?.trim()) return null;

  const parts = ["## Your recent reflection (internal; may surface naturally)"];
  if (latest?.body?.trim()) {
    const ageH = (
      (Date.now() - new Date(latest.created_at).getTime()) /
      3_600_000
    ).toFixed(0);
    parts.push(`### Daily (${ageH}h ago)`, latest.body.trim());
  }
  if (weekly?.body?.trim() && weekly.id !== latest?.id) {
    const ageD = (
      (Date.now() - new Date(weekly.created_at).getTime()) /
      DAY_MS
    ).toFixed(0);
    parts.push(`### Weekly (${ageD}d ago)`, weekly.body.trim());
  }
  return parts.join("\n");
}

let reflectTimer: ReturnType<typeof setInterval> | null = null;

export function startReflectionLoop(
  db: DatabaseSync,
  ownerId: string,
): void {
  const run = () => {
    void runReflectionJob(db, ownerId, { tier: "daily" }).catch((err) =>
      console.warn("[memory] reflection tick failed:", err),
    );
  };
  reflectTimer = setInterval(run, 60 * 60 * 1000);
  console.log("[memory] reflection loop every 60m (tiered job cadence)");
}

export function stopReflectionLoop(): void {
  if (reflectTimer) {
    clearInterval(reflectTimer);
    reflectTimer = null;
  }
}
