import { config } from "../config.js";

const lastGifAt = new Map<string, number>();

type GiphyImage = { url?: string };
type GiphyItem = {
  images?: {
    fixed_height?: GiphyImage;
    downsized?: GiphyImage;
    original?: GiphyImage;
  };
  _score?: number;
};

type TenorMedia = { url?: string };
type TenorResult = {
  media_formats?: {
    gif?: TenorMedia;
    tinygif?: TenorMedia;
    mediumgif?: TenorMedia;
  };
};

function giphyUrl(item: GiphyItem | undefined): string | null {
  const images = item?.images;
  return (
    images?.fixed_height?.url ||
    images?.downsized?.url ||
    images?.original?.url ||
    null
  );
}

function tenorUrl(item: TenorResult | undefined): string | null {
  const formats = item?.media_formats;
  return (
    formats?.tinygif?.url ||
    formats?.mediumgif?.url ||
    formats?.gif?.url ||
    null
  );
}

/** Prefer higher Giphy relevance score among the top results. */
function pickBestGiphy(items: GiphyItem[]): string | null {
  if (!items.length) return null;
  const ranked = [...items].sort(
    (a, b) => (b._score ?? 0) - (a._score ?? 0),
  );
  for (const item of ranked) {
    const url = giphyUrl(item);
    if (url) return url;
  }
  return null;
}

async function searchGiphy(query: string): Promise<string | null> {
  if (!config.giphyApiKey) return null;
  const params = new URLSearchParams({
    api_key: config.giphyApiKey,
    q: query,
    limit: "5",
    rating: "pg-13",
    lang: "en",
  });
  const res = await fetch(
    `https://api.giphy.com/v1/gifs/search?${params.toString()}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: GiphyItem[] };
  return pickBestGiphy(data.data ?? []);
}

async function searchTenor(query: string): Promise<string | null> {
  if (!config.tenorApiKey) return null;
  const params = new URLSearchParams({
    key: config.tenorApiKey,
    q: query,
    limit: "5",
    media_filter: "gif,tinygif,mediumgif",
    client_key: "ashley_discord",
  });
  const res = await fetch(
    `https://tenor.googleapis.com/v2/search?${params.toString()}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: TenorResult[] };
  const results = data.results ?? [];
  // Tenor ranks by relevance; take the first with a usable URL among top 5.
  for (const item of results) {
    const url = tenorUrl(item);
    if (url) return url;
  }
  return null;
}

/**
 * Search Giphy (preferred) then Tenor. Fail soft when disabled/missing keys/errors.
 * Rate-limited per channel (GIF_COOLDOWN_SEC). Fetches top 5, picks best.
 */
export async function searchGif(
  query: string,
  channelId: string,
): Promise<string | null> {
  if (!config.gifEnabled) return null;
  const q = query.trim();
  if (!q) return null;
  if (!config.giphyApiKey && !config.tenorApiKey) return null;

  const cooldownMs = config.gifCooldownSec * 1000;
  const last = lastGifAt.get(channelId) ?? 0;
  if (Date.now() - last < cooldownMs) return null;

  try {
    const url = (await searchGiphy(q)) ?? (await searchTenor(q));
    if (!url) return null;
    lastGifAt.set(channelId, Date.now());
    return url;
  } catch (err) {
    console.warn("[discord-bot] gif search failed:", err);
    return null;
  }
}
