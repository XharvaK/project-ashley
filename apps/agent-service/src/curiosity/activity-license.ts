/**
 * This-turn reading authority. Capability (having a quiet reader) is separate.
 * Ambient hasReadActivity / Discord status never license engagement claims.
 */

export type ActivityLicenseSource = "takes" | "page" | "lookup";

export type ActivityLicense = {
  readingLicensed: boolean;
  sources: ActivityLicenseSource[];
  /** Titles/snippets she may name when licensed (Wave 1b grounding). */
  allowedRefs: string[];
  /** Short code-authored note for the system prompt. */
  note: string;
};

export type ActivityLicenseInput = {
  /** Curiosity inject with real takes this turn (not empty solicited honesty). */
  takeIds?: number[];
  takeTitles?: string[];
  /** Successful page/link note body this turn. */
  pageContext?: string | null;
  /** Search/lookup context this turn. */
  searchContext?: string | null;
  /** Presence note injected (status ask) — never licenses reading diary. */
  presenceNote?: string | null;
};

const EMPTY_NOTE =
  "This turn has no reading activity note. Having a quiet reader is not the same as reading right now — do not claim you are reading, just reading, skimming feeds, or name titles. Disposition and opinions are free. Discord status is not a diary unless a presence note was injected and he asked about status.";

function licensedNote(sources: ActivityLicenseSource[], refs: string[]): string {
  const src = sources.join("|");
  const refHint =
    refs.length > 0
      ? ` Prefer these refs only: ${refs.slice(0, 4).join("; ")}.`
      : "";
  return `This turn has a reading activity note (${src}). Answer from those notes only; do not invent titles beyond them.${refHint}`;
}

/** Pull list titles / URL lines from page or feed context notes. */
export function extractPageRefs(pageContext: string): string[] {
  const refs: string[] = [];
  for (const line of pageContext.split("\n")) {
    const bullet = line.match(/^\s*-\s+(.+?)(?::\s|$)/);
    if (bullet?.[1]?.trim()) {
      refs.push(bullet[1].trim().slice(0, 120));
      continue;
    }
    const url = line.match(/^\s*URL:\s+(\S+)/i);
    if (url?.[1]) refs.push(url[1].slice(0, 120));
  }
  return refs;
}

/** Lightweight refs from a search/lookup block (URLs / titled lines). */
export function extractLookupRefs(searchContext: string): string[] {
  const refs: string[] = [];
  for (const line of searchContext.split("\n")) {
    const m =
      line.match(/^\s*-\s+\[?([^\]\n]+)\]?\s*\(/) ||
      line.match(/^\s*-\s+(.+?)\s+[—-]\s+/) ||
      line.match(/https?:\/\/\S+/);
    if (m?.[1]) refs.push(m[1].trim().slice(0, 120));
    else if (m?.[0]?.startsWith("http")) refs.push(m[0].slice(0, 120));
  }
  return refs;
}

/**
 * Compute this-turn ActivityLicense. Presence and ambient reads are ignored.
 */
export function computeActivityLicense(
  input: ActivityLicenseInput,
): ActivityLicense {
  const sources: ActivityLicenseSource[] = [];
  const allowedRefs: string[] = [];

  const takeIds = input.takeIds ?? [];
  const takeTitles = (input.takeTitles ?? []).map((t) => t.trim()).filter(Boolean);
  if (takeIds.length > 0) {
    sources.push("takes");
    allowedRefs.push(...takeTitles);
  }

  const page = input.pageContext?.trim() ?? "";
  if (page) {
    sources.push("page");
    allowedRefs.push(...extractPageRefs(page));
  }

  const search = input.searchContext?.trim() ?? "";
  if (search) {
    sources.push("lookup");
    allowedRefs.push(...extractLookupRefs(search));
  }

  // Dedupe refs, keep order
  const seen = new Set<string>();
  const uniqueRefs = allowedRefs.filter((r) => {
    const key = r.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const readingLicensed = sources.length > 0;
  return {
    readingLicensed,
    sources,
    allowedRefs: uniqueRefs,
    note: readingLicensed ? licensedNote(sources, uniqueRefs) : EMPTY_NOTE,
  };
}

/** Empty license note for initiative / thin proactive briefs. */
export function emptyActivityLicenseNote(): string {
  return EMPTY_NOTE;
}

/**
 * True when candidate material already carries a reading beat (title/take).
 * Thin ambient/check_in material should get the empty license note instead.
 */
export function materialHasReadingBeat(material: string | undefined | null): boolean {
  const text = material?.trim() ?? "";
  if (!text) return false;
  if (/\b(from:|title\b|Depth:\s*(full|excerpt)|feed find|surfaced)\b/i.test(text)) {
    return true;
  }
  // curiosity_take material often embeds a quoted title line
  if (/\bhttps?:\/\//i.test(text) && text.length > 40) return true;
  return false;
}
