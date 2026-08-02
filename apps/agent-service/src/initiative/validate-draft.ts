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
  if (/^skip\b/i.test(text)) {
    return { ok: false, reason: "thin_material_skip" };
  }

  if (!candidate) return { ok: true };

  if (candidate.kind === "check_in") {
    if (text.includes("?")) {
      return { ok: false, reason: "idle_pad_question" };
    }
    return { ok: true };
  }

  const FILLER = /^(same old|nothing much|neler yapıyorsun|ne haber|what's up)[.!?,\s]*$/i;
  if (FILLER.test(text.split("\n")[0]!)) {
    return { ok: false, reason: "generic_filler" };
  }

  if (
    candidate.kind === "watch_fired" ||
    candidate.kind === "curiosity_take"
  ) {
    const title = titleFromMaterial(candidate.material, candidate.title);
    if (title && !hasTitleToken(text, title)) {
      return { ok: false, reason: "title_tokens" };
    }

    // Require minimum substance (reject <25 char title dumps)
    if (text.length < 25) {
      return { ok: false, reason: "too_short_for_proactive" };
    }

    if (
      context.unanswered >= 1 &&
      /\?\s*$/.test(text) &&
      /\b(you|u)\s*\?/i.test(text)
    ) {
      return { ok: false, reason: "soft_hook_while_ignored" };
    }

    // The stake about her own tools must stay hers. Assigning a reader-side
    // struggle to Doc ("worth the switch if you're still wrestling with broken
    // feeds") is the exact failure that shipped on 2026-08-02. It is not advice
    // to him; it is her own migration.
    if (
      /\byou'?re\s+(?:still\s+)?(?:wrestling|struggling|fighting|dealing)\b/i.test(
        text,
      ) ||
      /\bworth the switch if you'?re\b|\bworth it if you'?re\b/i.test(text)
    ) {
      return { ok: false, reason: "second_person_struggle" };
    }
  }

  return { ok: true };
}
