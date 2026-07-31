import { words } from "../curiosity/inject.js";
import type { Candidate } from "./queue.js";

export type DraftValidation =
  | { ok: true }
  | { ok: false; reason: string };

function titleFromMaterial(material: string, title?: string): string {
  if (title?.trim()) return title;
  const m = /^Piece:\s*(.+?)\s*\nTake:/is.exec(material);
  if (m?.[1]) return m[1].trim();
  const from = /\(from:\s*(.+?)\)\s*$/i.exec(material);
  return from?.[1]?.trim() ?? "";
}

function hasTitleToken(draft: string, title: string): boolean {
  const titleTokens = words(title);
  if (titleTokens.length === 0) return false;
  const draftTokens = new Set(words(draft));
  return titleTokens.some((t) => draftTokens.has(t));
}

/**
 * Thin post-model guards. Language is handled separately (force-EN path).
 */
export function validateInitiativeDraft(
  draft: string,
  candidate: Candidate | undefined,
  context: { unanswered: number },
): DraftValidation {
  const text = draft.trim();
  if (!text) return { ok: false, reason: "empty_draft" };

  if (!candidate) return { ok: true };

  if (candidate.kind === "check_in") {
    if (text.includes("?")) {
      return { ok: false, reason: "idle_pad_question" };
    }
    return { ok: true };
  }

  if (
    candidate.kind === "watch_fired" ||
    candidate.kind === "curiosity_take"
  ) {
    const title = titleFromMaterial(candidate.material, candidate.title);
    if (title && !hasTitleToken(text, title)) {
      return { ok: false, reason: "title_tokens" };
    }
    if (
      context.unanswered >= 1 &&
      /\?\s*$/.test(text) &&
      /\b(you|u)\s*\?/i.test(text)
    ) {
      return { ok: false, reason: "soft_hook_while_ignored" };
    }
  }

  return { ok: true };
}
