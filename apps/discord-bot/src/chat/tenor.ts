import { config } from "../config.js";

const lastGifAt = new Map<string, number>();

type TenorMedia = { url?: string };
type TenorResult = {
  media_formats?: {
    gif?: TenorMedia;
    tinygif?: TenorMedia;
    mediumgif?: TenorMedia;
  };
};

/**
 * Search Tenor v2 for one GIF URL. Fail soft when disabled/missing key/errors.
 * Rate-limited per channel (GIF_COOLDOWN_SEC).
 */
export async function searchTenorGif(
  query: string,
  channelId: string,
): Promise<string | null> {
  if (!config.gifEnabled || !config.tenorApiKey) return null;
  const q = query.trim();
  if (!q) return null;

  const cooldownMs = config.gifCooldownSec * 1000;
  const last = lastGifAt.get(channelId) ?? 0;
  if (Date.now() - last < cooldownMs) return null;

  const params = new URLSearchParams({
    key: config.tenorApiKey,
    q,
    limit: "1",
    media_filter: "gif,tinygif,mediumgif",
    client_key: "ashley_discord",
  });

  try {
    const res = await fetch(
      `https://tenor.googleapis.com/v2/search?${params.toString()}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: TenorResult[] };
    const hit = data.results?.[0];
    const formats = hit?.media_formats;
    const url =
      formats?.tinygif?.url ||
      formats?.mediumgif?.url ||
      formats?.gif?.url ||
      null;
    if (!url) return null;
    lastGifAt.set(channelId, Date.now());
    return url;
  } catch (err) {
    console.warn("[discord-bot] tenor search failed:", err);
    return null;
  }
}
