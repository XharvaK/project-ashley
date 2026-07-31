/**
 * What gets read in full is a taste statement, so it is scored on her taste:
 * mechanism and numbers up, launch copy and listicles down.
 */
const DEPTH =
  /\b(mechanism|receptor|kinetics|benchmark|postmortem|why|proof|deterministic|sqlite|latency|dose[- ]response|replication|failure|internals|from scratch|teardown)\b/i;

export const HYPE =
  /\b(changes everything|revolutionary|game[- ]changer|you won'?t believe|top \d+|best \d+|ultimate guide|ai[- ]powered|supercharge|unlock)\b/i;

export function scoreItem(params: {
  weight: number;
  title: string;
  excerpt?: string;
  publishedAt: string | null;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  const published = params.publishedAt
    ? new Date(params.publishedAt).getTime()
    : now;
  const ageHours = Math.max(0, (now - published) / 3_600_000);
  // Halves roughly every day, so a good post from yesterday still competes.
  const recency = 1 / (1 + ageHours / 24);

  const text = `${params.title} ${params.excerpt ?? ""}`;
  let score = params.weight * (0.5 + recency);
  if (DEPTH.test(text)) score += 0.6;
  if (HYPE.test(text)) score -= 0.8;
  if (params.title.length < 15) score -= 0.2;
  return Math.round(score * 1000) / 1000;
}
