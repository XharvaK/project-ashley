import type { DatabaseSync } from "node:sqlite";
import { detectLanguage, messageTags, type VoiceExample } from "./voice-bank.js";

const POSITIVE_REACTION =
  /^(😂|🤣|😭|🔥|💀|💯|❤️|😍|😅)$|^(lmao|lol|haha|hahaha|that was good|that'?s good|good one)\b/i;

export function isCaptureWorthyReaction(
  docMessage: string,
  reaction?: string | null,
): boolean {
  if (reaction && POSITIVE_REACTION.test(reaction.trim())) return true;
  return POSITIVE_REACTION.test(docMessage.trim());
}

/**
 * When Doc laughs / fires a positive reaction soon after her line, keep the
 * exchange as a candidate voice sample. Capture only short ashley lines.
 */
export function maybeCaptureExample(
  db: DatabaseSync,
  docMessage: string,
  ashleyMessage: string,
  opts?: {
    reaction?: string | null;
    sourceMessageId?: number | null;
    force?: boolean;
  },
): boolean {
  if (ashleyMessage.length === 0 || ashleyMessage.length > 200) return false;
  if (!opts?.force && !isCaptureWorthyReaction(docMessage, opts?.reaction)) {
    return false;
  }

  const tags = messageTags(`${docMessage}\n${ashleyMessage}`);
  const lang = detectLanguage(ashleyMessage);
  db.prepare(
    `INSERT INTO ashley_captured_examples
       (lang, doc_text, ashley_text, reaction, tags, status, source_message_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'candidate', ?, datetime('now'))`,
  ).run(
    lang,
    docMessage.slice(0, 200),
    ashleyMessage.slice(0, 200),
    opts?.reaction ?? null,
    JSON.stringify(tags),
    opts?.sourceMessageId ?? null,
  );
  return true;
}

export function loadCapturedExamples(
  db: DatabaseSync,
  opts?: { max?: number; tags?: string[]; lang?: "en" | "tr" },
): VoiceExample[] {
  const max = opts?.max ?? 1;
  const lang = opts?.lang;
  const rows = db
    .prepare(
      `SELECT id, lang, doc_text, ashley_text, tags, times_sampled
       FROM ashley_captured_examples
       WHERE status IN ('candidate', 'active')
         AND (? IS NULL OR lang = ?)
       ORDER BY score DESC, times_sampled ASC, id DESC
       LIMIT 20`,
    )
    .all(lang ?? null, lang ?? null) as Array<{
    id: number;
    lang: string;
    doc_text: string;
    ashley_text: string;
    tags: string | null;
    times_sampled: number;
  }>;

  const wanted = new Set(opts?.tags ?? []);
  const scored = rows
    .map((r) => {
      let tags: string[] = [];
      try {
        tags = r.tags ? (JSON.parse(r.tags) as string[]) : [];
      } catch {
        tags = [];
      }
      const overlap =
        wanted.size === 0
          ? 1
          : tags.filter((t) => wanted.has(t)).length;
      return { r, tags, overlap };
    })
    .filter((x) => wanted.size === 0 || x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.r.times_sampled - b.r.times_sampled);

  const picked = scored.slice(0, max);
  const bump = db.prepare(
    `UPDATE ashley_captured_examples
     SET times_sampled = times_sampled + 1, status = 'active'
     WHERE id = ?`,
  );
  for (const p of picked) bump.run(p.r.id);

  return picked.map((p) => ({
    id: `captured:${p.r.id}`,
    lang: p.r.lang === "tr" ? "tr" : "en",
    tags: p.tags,
    doc: p.r.doc_text,
    ashley: p.r.ashley_text,
  }));
}
