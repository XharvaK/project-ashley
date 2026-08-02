import type { DatabaseSync } from "node:sqlite";

export type MoodRow = {
  id: number;
  owner_id: string;
  mood: string;
  rapport: number;
  note: string | null;
  created_at: string;
};

const MAX_ROWS = 40;

/** Cheap signals from her own reply — not a second LLM call. */
const MOOD_PATTERNS: Array<{ re: RegExp; mood: string }> = [
  { re: /\b(tired|exhausted|drained|bitkin|yorgun)\b/i, mood: "tired" },
  { re: /\b(annoyed|irritated|irritable|sinir|gıcık)\b/i, mood: "irritated" },
  { re: /\b(soft|tender|warm|yumuşak|sevecen)\b/i, mood: "warm" },
  { re: /\b(playful|teasing|mischievous|muzip)\b/i, mood: "playful" },
  { re: /\b(flat|meh|low energy|havasız)\b/i, mood: "flat" },
  { re: /\b(curious|intrigued|merak)\b/i, mood: "curious" },
  { re: /\b(weird mood|garip bir havam)\b/i, mood: "weird" },
  { re: /\b(amused|entertained|that's? (actually )?funny)\b/i, mood: "amused" },
  { re: /\b(restless|antsy|can't sit still|huzursuz)\b/i, mood: "restless" },
  { re: /\b(nostalgic|miss(ing)?|reminds? me)\b/i, mood: "nostalgic" },
  { re: /\b(stubborn|not budging|diretiyorum)\b/i, mood: "stubborn" },
  { re: /\b(fond|affection|I (actually )?(like|care))\b/i, mood: "fond" },
  { re: /\b(skeptic|doubt|not (sure|buying))\b/i, mood: "skeptical" },
  { re: /\b(melan|sad|down|somber|hüzün)\b/i, mood: "melancholy" },
  { re: /\b(energi|fired up|hyped|excited|coşku)\b/i, mood: "energized" },
  { re: /\b(conflicted|torn|both|ikilem)\b/i, mood: "conflicted" },
  { re: /\b(smug|nailed it|told you)\b/i, mood: "smug" },
  { re: /\b(bored|nothing|sıkıldım)\b/i, mood: "bored" },
  { re: /\b(proud|impressed|not bad)\b/i, mood: "proud" },
  { re: /\b(worried|concern|endişe)\b/i, mood: "worried" },
];

export function detectMoodFromText(text: string): string | null {
  for (const { re, mood } of MOOD_PATTERNS) {
    if (re.test(text)) return mood;
  }
  return null;
}

export function recordMood(
  db: DatabaseSync,
  ownerId: string,
  mood: string,
  opts: { rapport?: number; note?: string | null; sourceMessageId?: number | null } = {},
): void {
  const now = new Date().toISOString();
  const last = latestMood(db, ownerId);
  if (last && last.mood === mood) {
    // Same mood: bump rapport slightly, don't spam rows.
    db.prepare(
      `UPDATE mem_mood SET rapport = MIN(1.0, rapport + 0.02), note = COALESCE(?, note)
       WHERE id = ?`,
    ).run(opts.note ?? null, last.id);
    return;
  }
  db.prepare(
    `INSERT INTO mem_mood (owner_id, mood, rapport, note, source_message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    mood,
    opts.rapport ?? last?.rapport ?? 0.5,
    opts.note ?? null,
    opts.sourceMessageId ?? null,
    now,
  );
  pruneMood(db, ownerId);
}

export function latestMood(
  db: DatabaseSync,
  ownerId: string,
): MoodRow | null {
  return (
    (db
      .prepare(
        `SELECT id, owner_id, mood, rapport, note, created_at
         FROM mem_mood WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(ownerId) as MoodRow | undefined) ?? null
  );
}

export function recentMoods(
  db: DatabaseSync,
  ownerId: string,
  limit = 8,
): MoodRow[] {
  return db
    .prepare(
      `SELECT id, owner_id, mood, rapport, note, created_at
       FROM mem_mood WHERE owner_id = ?
       ORDER BY id DESC LIMIT ?`,
    )
    .all(ownerId, limit) as MoodRow[];
}

const NEGATIVE_MOODS = new Set([
  "tired",
  "irritated",
  "flat",
  "melancholy",
  "bored",
  "worried",
  "restless",
  "conflicted",
]);

/** How many of her own recorded states in the last `hours` read negative. */
export function recentNegativeMoodCount(
  db: DatabaseSync,
  ownerId: string,
  hours: number,
  now = new Date(),
): number {
  const since = new Date(now.getTime() - hours * 3_600_000).toISOString();
  const rows = db
    .prepare(
      `SELECT mood FROM mem_mood
       WHERE owner_id = ? AND created_at >= ?
       ORDER BY id DESC LIMIT 40`,
    )
    .all(ownerId, since) as Array<{ mood: string }>;
  return rows.filter((r) => NEGATIVE_MOODS.has(r.mood)).length;
}

export function buildMoodBlock(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const rows = recentMoods(db, ownerId, 5);
  if (rows.length === 0) return null;
  const lines = rows.map((r) => {
    const when = r.created_at.slice(0, 16).replace("T", " ");
    return `- ${when}: ${r.mood}${r.note ? ` (${r.note})` : ""}`;
  });
  return [
    "Your recorded mood/rapport (past-tense claims need a row here):",
    ...lines,
  ].join("\n");
}

function pruneMood(db: DatabaseSync, ownerId: string): void {
  db.prepare(
    `DELETE FROM mem_mood WHERE owner_id = ? AND id NOT IN (
       SELECT id FROM mem_mood WHERE owner_id = ? ORDER BY id DESC LIMIT ?
     )`,
  ).run(ownerId, ownerId, MAX_ROWS);
}
