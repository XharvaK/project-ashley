import type { RetrievalHit } from "../types.js";

export type TieredCandidate = RetrievalHit & {
  tier: 1 | 2 | 3 | 4;
};

export const DEFENSE_FUSE_MAX_CANDIDATES = 64;
export const DEFENSE_FUSE_MAX_UTF8_BYTES = 32_000;

export function compareTieredCandidates(left: TieredCandidate, right: TieredCandidate): number {
  // 1. Primary: tier ordinal (1 < 2 < 3 < 4)
  if (left.tier !== right.tier) {
    return left.tier - right.tier;
  }
  // 2. Secondary: BM25 score/rank (ascending, more negative first)
  if (left.score !== right.score) {
    return left.score - right.score;
  }
  // 3. Tertiary: ref ASC (deterministic lexicographical tie-break)
  return left.ref.localeCompare(right.ref);
}

export type RankCandidatesInput = {
  exactKeyHits: RetrievalHit[];
  rawTriggerFtsHits: RetrievalHit[];
  concernFtsHits: RetrievalHit[];
  logHits: RetrievalHit[];
  defenseFuse?: {
    maxCandidates?: number;
    maxUtf8Bytes?: number;
  };
};

export function rankCandidates(input: RankCandidatesInput): RetrievalHit[] {
  const tiered: TieredCandidate[] = [
    ...input.exactKeyHits.map((h) => ({ ...h, tier: 1 as const })),
    ...input.rawTriggerFtsHits.map((h) => ({ ...h, tier: 2 as const })),
    ...input.concernFtsHits.map((h) => ({ ...h, tier: 3 as const })),
    ...input.logHits.map((h) => ({ ...h, tier: 4 as const })),
  ];

  tiered.sort(compareTieredCandidates);

  const maxCandidates = input.defenseFuse?.maxCandidates ?? DEFENSE_FUSE_MAX_CANDIDATES;
  const maxBytes = input.defenseFuse?.maxUtf8Bytes ?? DEFENSE_FUSE_MAX_UTF8_BYTES;

  const selected: RetrievalHit[] = [];
  let currentBytes = 2; // JSON array wrapper []

  for (const item of tiered) {
    const itemBytes = Buffer.byteLength(JSON.stringify(item), "utf8");
    const separator = selected.length > 0 ? 1 : 0;

    // Tier 1 exact-key hits bypass the defense fuse
    if (item.tier === 1) {
      selected.push(item);
      currentBytes += separator + itemBytes;
      continue;
    }

    // Defense-in-depth fuse for broad lexical items
    if (selected.length >= maxCandidates) {
      continue;
    }
    if (currentBytes + separator + itemBytes > maxBytes) {
      continue;
    }

    selected.push(item);
    currentBytes += separator + itemBytes;
  }

  return selected;
}
