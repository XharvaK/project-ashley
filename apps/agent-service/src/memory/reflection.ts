import type { DatabaseSync } from "node:sqlite";
import { completeChat } from "../mistral-client.js";
import { env } from "../env.js";
import { listActiveFacts } from "./facts.js";
import type { MemReflection } from "./types.js";

const REFLECT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function getLatestReflection(
  db: DatabaseSync,
  ownerId: string,
): MemReflection | null {
  const row = db
    .prepare(
      `SELECT * FROM mem_reflections
       WHERE owner_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(ownerId) as MemReflection | undefined;
  return row ?? null;
}

export function hoursSinceLastReflection(
  db: DatabaseSync,
  ownerId: string,
): number {
  const latest = getLatestReflection(db, ownerId);
  if (!latest) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(latest.created_at).getTime()) / 3_600_000;
}

export function reflectionDue(db: DatabaseSync, ownerId: string): boolean {
  return hoursSinceLastReflection(db, ownerId) >= 24;
}

function gatherDayTranscript(db: DatabaseSync, ownerId: string): {
  periodStart: string;
  periodEnd: string;
  transcript: string;
} {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - REFLECT_INTERVAL_MS);
  const rows = db
    .prepare(
      `SELECT role, text, ts FROM mem_messages
       WHERE owner_id = ?
         AND ts >= ?
         AND ts <= ?
         AND role IN ('user', 'assistant')
       ORDER BY id ASC
       LIMIT 120`,
    )
    .all(ownerId, periodStart.toISOString(), periodEnd.toISOString()) as Array<{
    role: string;
    text: string;
    ts: string;
  }>;

  const transcript = rows
    .map((r) => `${r.role}: ${r.text.slice(0, 400)}`)
    .join("\n");

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    transcript,
  };
}

export async function runReflectionJob(
  db: DatabaseSync,
  ownerId: string,
  options: { force?: boolean } = {},
): Promise<{ wrote: boolean; reason?: string }> {
  if (!env.mistralApiKey) return { wrote: false, reason: "no_api_key" };
  if (!options.force && !reflectionDue(db, ownerId)) {
    return { wrote: false, reason: "not_due" };
  }

  const { periodStart, periodEnd, transcript } = gatherDayTranscript(
    db,
    ownerId,
  );
  if (!transcript.trim()) {
    return { wrote: false, reason: "no_messages" };
  }

  const facts = listActiveFacts(db, ownerId, 30, false);
  const factBlock = facts.length
    ? facts.map((f) => `- ${f.category}/${f.key}: ${f.value}`).join("\n")
    : "(none)";

  const { text, model } = await completeChat(
    [
      {
        role: "system",
        content: `You are Ashley writing a private diary note about Doc after reviewing the last day of chat.
Write 1 short paragraph (80-160 words) in first person as Ashley.
Cover: new facts, project status shifts, emotional signals, behavioral patterns, stance changes.
Cross-reference standing facts when something repeats ("third time this week").
Be caring and specific, not creepy or clinical. No bullet lists. No markdown headers.
Output plain text only.`,
      },
      {
        role: "user",
        content: `STANDING_FACTS:\n${factBlock}\n\nTRANSCRIPT:\n${transcript}`,
      },
    ],
    {
      model: env.mistralModel,
      maxTokens: 400,
      temperature: 0.4,
      reasoningEffort: "none",
      lane: "background",
    },
  );

  const body = text.trim();
  if (body.length < 40) return { wrote: false, reason: "empty" };

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_reflections (owner_id, period_start, period_end, body, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(ownerId, periodStart, periodEnd, body, model, now);

  console.info(`[memory] reflection wrote owner=${ownerId} chars=${body.length}`);
  return { wrote: true };
}

/** Build a short context block for the assembler. */
export function buildReflectionBlock(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const latest = getLatestReflection(db, ownerId);
  if (!latest?.body?.trim()) return null;
  const ageH = (
    (Date.now() - new Date(latest.created_at).getTime()) /
    3_600_000
  ).toFixed(0);
  return [
    "## Your recent reflection (internal; may surface naturally)",
    `(${ageH}h ago)`,
    latest.body.trim(),
  ].join("\n");
}

let reflectTimer: ReturnType<typeof setInterval> | null = null;

export function startReflectionLoop(
  db: DatabaseSync,
  ownerId: string,
): void {
  const run = () => {
    void runReflectionJob(db, ownerId).catch((err) =>
      console.warn("[memory] reflection tick failed:", err),
    );
  };
  // Hourly check; job itself enforces 24h cadence.
  reflectTimer = setInterval(run, 60 * 60 * 1000);
  console.log("[memory] reflection loop every 60m (24h job cadence)");
}

export function stopReflectionLoop(): void {
  if (reflectTimer) {
    clearInterval(reflectTimer);
    reflectTimer = null;
  }
}
