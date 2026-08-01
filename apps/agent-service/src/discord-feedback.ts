import type { DatabaseSync } from "node:sqlite";

/** Successful GIF queries Doc reacted to — bias future searches toward them. */
export function recordGifFeedback(
  db: DatabaseSync,
  ownerId: string,
  input: { query: string; gifUrl: string; reaction?: string | null },
): void {
  db.prepare(
    `INSERT INTO discord_gif_feedback
       (owner_id, query, gif_url, reaction, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(
    ownerId,
    input.query.slice(0, 200),
    input.gifUrl.slice(0, 500),
    input.reaction?.slice(0, 32) ?? null,
  );
}

export function listSuccessfulGifQueries(
  db: DatabaseSync,
  ownerId: string,
  limit = 10,
): string[] {
  const rows = db
    .prepare(
      `SELECT query FROM discord_gif_feedback
       WHERE owner_id = ? AND reaction IS NOT NULL AND reaction != ''
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(ownerId, limit) as Array<{ query: string }>;
  return rows.map((r) => r.query);
}

export function recordEmojiUse(
  db: DatabaseSync,
  emoji: string,
  context: string,
  positive = false,
): void {
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT weight, uses, positive FROM discord_emoji_weights
       WHERE emoji = ? AND context = ?`,
    )
    .get(emoji, context) as
    | { weight: number; uses: number; positive: number }
    | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO discord_emoji_weights
         (emoji, context, weight, uses, positive, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    ).run(emoji, context, positive ? 1.1 : 1.0, positive ? 1 : 0, now);
    return;
  }

  const uses = existing.uses + 1;
  const pos = existing.positive + (positive ? 1 : 0);
  const weight = Math.min(1.5, Math.max(0.5, 1 + (pos - (uses - pos)) * 0.05));
  db.prepare(
    `UPDATE discord_emoji_weights
     SET weight = ?, uses = ?, positive = ?, updated_at = ?
     WHERE emoji = ? AND context = ?`,
  ).run(weight, uses, pos, now, emoji, context);
}

export function emojiWeight(
  db: DatabaseSync,
  emoji: string,
  context: string,
): number {
  const row = db
    .prepare(
      `SELECT weight FROM discord_emoji_weights
       WHERE emoji = ? AND context = ?`,
    )
    .get(emoji, context) as { weight: number } | undefined;
  return row?.weight ?? 1;
}

export function listEmojiWeights(
  db: DatabaseSync,
  context?: string,
): Array<{ emoji: string; context: string; weight: number }> {
  if (context) {
    return db
      .prepare(
        `SELECT emoji, context, weight FROM discord_emoji_weights
         WHERE context = ?
         ORDER BY weight DESC`,
      )
      .all(context) as Array<{ emoji: string; context: string; weight: number }>;
  }
  return db
    .prepare(
      `SELECT emoji, context, weight FROM discord_emoji_weights
       ORDER BY weight DESC`,
    )
    .all() as Array<{ emoji: string; context: string; weight: number }>;
}
