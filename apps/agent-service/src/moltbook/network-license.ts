/**
 * This-turn network/action authority for Moltbook (and similar).
 * Boolean "join succeeded" is not enough — only exact allowed URLs and action flags.
 */

export type NetworkActionLicense = {
  allowedUrls: string[];
  joinOk: boolean;
  postOk: boolean;
  browseOk: boolean;
  note: string;
};

export type NetworkLicenseInput = {
  /** Join tool ran successfully this turn (includes idempotent already-registered). */
  joinOk?: boolean;
  /** Create-post tool succeeded this turn. */
  postOk?: boolean;
  /** This-turn browse note (heartbeat inject or browse tool) — not Discord status. */
  browseOk?: boolean;
  /** Exact URLs licensed by tools this turn. */
  allowedUrls?: string[];
  /** Stored claim URL — only added when joinOk or Doc asked for claim link. */
  storedClaimUrl?: string | null;
  /** Doc explicitly asked for the claim / verify link. */
  claimLinkAsk?: boolean;
};

const MOLTBOOK_URL_RE = /https?:\/\/[^\s)*\]]+/gi;

const BROWSE_THEATER =
  /\balready on it\b|\bi('?m| am) on it\b|\b(go(ing)?|just) brows(e|ing)\b|\bbrowsing (submolts?|feeds?|moltbook)\b|\bi('?m| am| was) brows(e|ing)\b|\bon (the )?submolts?\b/i;

const POST_THEATER =
  /\bi (just )?(posted|published|introduced myself)\b|\bi('?ve| have) (just )?(posted|published)\b|\bleft a (post|intro)\b|\bgönderdim\b|\bpaylaştım\b/i;

const JOIN_THEATER =
  /\bi (just )?(registered|signed up|joined)\b|\bi('?m| am) (registered|on moltbook)\b|\bkaydoldum\b|\bkayıt oldum\b/i;

function normalizeUrl(url: string): string {
  return url.trim().replace(/[.,;:!?)]+$/g, "").toLowerCase();
}

export function extractUrls(text: string): string[] {
  const found = text.match(MOLTBOOK_URL_RE) ?? [];
  return found.map((u) => u.replace(/[.,;:!?)]+$/g, ""));
}

export function isMoltbookOrInfraUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("moltbook") ||
    /\/(claim|agent|post|p)\//i.test(u) ||
    u.includes("ngrok") ||
    u.includes("yourdomain.tld")
  );
}

export function isUrlAllowed(url: string, allowedUrls: string[]): boolean {
  const n = normalizeUrl(url);
  return allowedUrls.some((a) => normalizeUrl(a) === n);
}

/** Doc asking for the claim / verify link (not inventing a post URL). */
export function isClaimLinkAsk(message: string): boolean {
  const t = message.trim();
  if (!t || t.length > 400) return false;
  return (
    /\b(claim|verify|verification)\b.{0,40}\b(link|url)\b/i.test(t) ||
    /\b(send|give|share)\b.{0,40}\b(claim|verify)\b/i.test(t) ||
    /\bclaim link\b/i.test(t) ||
    /\bdoğrula(ma)? link/i.test(t)
  );
}

/** Doc says she is verified / claimed — refresh status. */
export function isMoltbookVerifySignal(message: string): boolean {
  const t = message.trim();
  if (!t || t.length > 500) return false;
  return (
    /\b(you are|you're|u are)\b.{0,20}\b(verified|claimed|active)\b/i.test(t) ||
    /\b(verified|claimed)\b.{0,20}\b(now|you)\b/i.test(t) ||
    /\bi (verified|claimed) you\b/i.test(t) ||
    /\bdoğruladım\b|\bverify (oldu|ettim)\b/i.test(t)
  );
}

/** Doc asks about moltbook/claim status — refresh KV from API. */
export function isMoltbookStatusAsk(message: string): boolean {
  const t = message.trim();
  if (!t || t.length > 400) return false;
  return (
    /\b(moltbook|claim)\b.{0,30}\bstatus\b/i.test(t) ||
    /\bstatus\b.{0,30}\b(moltbook|claim|verified|pending)\b/i.test(t) ||
    /\bare you (verified|claimed|pending)\b/i.test(t)
  );
}

/** Parse /m/{submolt} from a Moltbook URL in Doc's message. */
export function parseSubmoltFromMessage(message: string): string | null {
  const m = message.match(
    /moltbook\.com\/m\/([a-z0-9_-]+)/i,
  );
  return m?.[1]?.toLowerCase() ?? null;
}

function emptyNote(): string {
  return [
    "Network license: none this turn.",
    "Do not claim you browsed submolts, posted, introduced yourself, or paste moltbook post/profile links.",
    "Having credentials is not the same as posting. Disposition only unless a tool note licenses an action or URL.",
  ].join(" ");
}

function licensedNote(lic: NetworkActionLicense): string {
  const parts: string[] = ["Network license this turn:"];
  if (lic.joinOk) parts.push("join/register ok.");
  if (lic.postOk) parts.push("post ok.");
  if (lic.browseOk) parts.push("browse ok.");
  if (lic.allowedUrls.length > 0) {
    parts.push(`You may paste only these exact URLs: ${lic.allowedUrls.join(" ")}.`);
  } else {
    parts.push("No browser URLs licensed — do not invent /p/… or claim links.");
  }
  parts.push("Never invent moltbook post URLs.");
  return parts.join(" ");
}

export function computeNetworkActionLicense(
  input: NetworkLicenseInput,
): NetworkActionLicense {
  const allowed = new Set<string>();
  for (const u of input.allowedUrls ?? []) {
    if (u?.trim()) allowed.add(u.trim());
  }

  const joinOk = input.joinOk === true;
  const postOk = input.postOk === true;
  const browseOk = input.browseOk === true;
  const claimAsk = input.claimLinkAsk === true;
  const stored = input.storedClaimUrl?.trim() || null;

  if (stored && (joinOk || claimAsk)) {
    allowed.add(stored);
  }

  const lic: NetworkActionLicense = {
    allowedUrls: [...allowed],
    joinOk,
    postOk,
    browseOk,
    note: "",
  };
  lic.note =
    joinOk || postOk || browseOk || lic.allowedUrls.length > 0
      ? licensedNote(lic)
      : emptyNote();
  return lic;
}

export function claimsBrowseTheater(text: string): boolean {
  return BROWSE_THEATER.test(text);
}

export function claimsPostTheater(text: string): boolean {
  return POST_THEATER.test(text);
}

export function claimsJoinTheater(text: string): boolean {
  return JOIN_THEATER.test(text);
}

/**
 * True when the reply asserts network actions or URLs not covered by the license.
 */
export function claimsUnlicensedNetworkAction(
  text: string,
  license: NetworkActionLicense,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  for (const url of extractUrls(trimmed)) {
    if (isMoltbookOrInfraUrl(url) && !isUrlAllowed(url, license.allowedUrls)) {
      return true;
    }
  }

  // Bare "claim url" theater without an allowed URL in the reply
  if (
    /\bclaim url\b|\bed25519\b|\bngrok\b|\byourdomain\.tld\b/i.test(trimmed) &&
    license.allowedUrls.length === 0
  ) {
    return true;
  }

  if (!license.browseOk && claimsBrowseTheater(trimmed)) return true;
  if (!license.postOk && claimsPostTheater(trimmed)) return true;
  if (!license.joinOk && claimsJoinTheater(trimmed)) return true;

  return false;
}

/** Strip chunks that violate the network license; empty → null (caller floors). */
export function stripUnlicensedNetworkClaims(
  text: string,
  license: NetworkActionLicense,
): string {
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !claimsUnlicensedNetworkAction(p, license));
  return parts.join(" ").trim();
}

export const NETWORK_HARD_FLOOR =
  "i'd be bullshitting you if i said that went through. on my side there's no post or browse result to point at — only what a tool actually returned.";

export function applyNetworkHardFloor(
  text: string,
  license: NetworkActionLicense,
): string {
  if (!claimsUnlicensedNetworkAction(text, license)) return text;
  const stripped = stripUnlicensedNetworkClaims(text, license);
  if (!stripped.trim() || claimsUnlicensedNetworkAction(stripped, license)) {
    return NETWORK_HARD_FLOOR;
  }
  return stripped;
}
