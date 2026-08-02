/**
 * She is allowed to have an inner life, which means she is also newly able to
 * invent one. Activity verb *classes* (not quote fixtures) catch unlicensed
 * reading/browsing theater — including lowercase bare gerunds.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\bi (just |already )?(read|was reading|finished reading|skimmed|went through)\b/i,
  /\bi (looked|searched) (it |that )?up\b/i,
  /\bi (came across|ran into|stumbled on|dug up|found) (a|an|this|some)\b/i,
  /\bi was (reading|digging|poking) (about|around|into|through)\b/i,
  /\b(saw|seen) (a|an|this) (paper|article|thread|post) (about|on)\b/i,
  /\b(okudum|okuyordum|okumuştum)\b/i,
  /\b(baktım|bakıyordum|araştırdım|araştırıyordum)\b/i,
  /\b(bir yerde|az önce) (okudum|gördüm)\b/i,
  // She skimmed, dug through, or found something: same claim, different verb.
  /\b(karıştırdım|karıştırıyordum|göz attım|inceledim|taradım|denk geldim)\b/i,
  /\b(buldum|görmüştüm|rastladım)\b/i,
  // Bare gerund / feed engagement (her default Discord voice, often no "I").
  /\bjust (reading|skimming|browsing)\b/i,
  /\breading (some|stuff|things|changelogs?|feeds?)\b/i,
  /\b(on|via|from) my (quiet )?(feed|reader|rss)\b/i,
  /\bskimming (my |the )?(feed|feeds|rss|reader)\b/i,
];

/** Not engagement claims: metaphor, Doc's link praise, capability ownership, empty-day honesty. */
const ACTIVITY_CLAIM_EXCLUSION =
  /\bread(ing)? (me|this|the room|between the lines)\b|\bworth reading\b|\bgood read\b|\bi('?d| would) read\b|\breading \w+ is\b|\bi have a quiet (feed )?reader\b|\bi have a quiet configured\b|\bhaven'?t been reading anything worth mentioning\b|\bnot been reading anything worth mentioning\b|\bnothing (logged )?worth mentioning\b/i;

/**
 * False blanket denials of the configured reader. Must not fire on truthful
 * nuance ("no arbitrary live browsing") or empty-day honesty alone.
 */
const CAPABILITY_DENIAL: RegExp[] = [
  /\bi don'?t browse\b/i,
  /\bi (don'?t|do not) have a (feed|reader)\b/i,
  /\bi (can'?t|cannot) browse\b/i,
  /\bi (don'?t|do not|never) read (the )?(web|internet|feeds?)\b/i,
  /\bi only read what you send\b/i,
  /\bi read what you send( me)?\b/i,
  /\bi read what you send(,| and)? that'?s it\b/i,
  /\bnothing else\b/i,
  /\bsend me (a|the) (post|text|link)\b/i,
  /\bbox and a rule\b/i,
  /\bbrowse (yok|etmiyorum)\b/i,
  /\bfeed'?im yok\b/i,
  /\b(web'?de|internette) (gez(e)?miyorum|bakmıyorum)\b/i,
  // Old-stack claims after a format switch: "no, still on the old feed",
  // "i don't have atom", "still on rss". The feed itself is a format, not a
  // mood; denying the current stack while cur_sources says otherwise is a lie.
  /\b(still\s+)?on\s+(the\s+)?old\s+feed\b/i,
  /\b(still\s+)?on\s+(the\s+)?old\s+rss\b/i,
  /\bi (don'?t|do not|never) (use|have|run)(\s+the)? (atom|rss)\s+feed\b/i,
  /\b(there'?s|there is) (no|not)\s+(atom|rss)\s+feed\b/i,
  /\b(we|i) didn'?t (switch|move) to atom\b|\bnot\s+on\s+atom\b/i,
  /\b(atom|rss) (mı|mi)\b.{0,10}\b(yok|de'il|değil)\b/i,
];

/**
 * Truthful nuance that is not a blanket denial. Kept for tests/docs; mixed
 * "Couldn't open. I don't browse." still regenerates because denial wins.
 */
export const CAPABILITY_EXCLUSION =
  /\b(arbitrary|open web|live search(es)?|haven'?t (browsed|read).{0,40}(this turn|today|worth mentioning)|couldn'?t open|cannot check)\b|\b(keyfi|gelişigüzel).{0,20}(arama|gezme)\b|\bbu tur(da)? (okumadım|gezmedim)\b|\bşu an (bakamam|açamadım)\b/i;

/**
 * False denials of the configured network (moltbook / submolts). The reader
 * patterns above cover feeds; these cover platform presence. "I don't wander
 * forums" after being asked about her moltbook presence is the same lie.
 */
const NETWORK_DENIAL: RegExp[] = [
  /\b(don'?t|do not|never|cannot|can'?t)\b.{0,40}\b(wander|go (on|around|into)|hang (out|around) (on|in)|use|visit)\b.{0,40}\b(forums?|submolts?|moltbook)\b/i,
  /\bi('?m| am) not (on|in|active (on|in))\b.{0,30}\b(submolts?|moltbook)\b/i,
  /\b(i |i'?ve )?(never|didn'?t) (post|comment|reply)\b.{0,30}\b(on|in) (the )?(submolts?|moltbook)\b/i,
  /\b(yorum|post|yazı) (atamıyorum|yapamıyorum|yazamıyorum)\b|\bsubmoltlarda yokum\b|\bmoltbook'?ta yokum\b/i,
];

/**
 * True limits that must not read as blanket denial: she is on moltbook, not
 * on random/arbitrary platforms. Excuse only applies to NETWORK_DENIAL, so
 * mixed "Couldn't open. I don't browse." still regenerates.
 */
const NETWORK_DENIAL_EXCUSE =
  /\b(random|arbitrary|other|general|just any|the open)\b/i;

/** Blanket false denials of the configured reader. Denial beats exclusion. */
export function deniesOwnCapability(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CAPABILITY_DENIAL.some((p) => p.test(t))) return true;
  if (NETWORK_DENIAL_EXCUSE.test(t)) return false;
  return NETWORK_DENIAL.some((p) => p.test(t));
}

/**
 * Meta challenges about whether she can browse. Pre-inject CAPABILITY_GUARD
 * so the first draft owns the reader instead of inventing a box myth.
 */
export function isBrowseCapabilityChallenge(message: string): boolean {
  return (
    /\bcan you browse\b/i.test(message) ||
    /\byou must\b.{0,40}\bbrowse\b/i.test(message) ||
    /\bability to browse\b/i.test(message) ||
    /\bbrowse (edebilir|yapabil)/i.test(message) ||
    /\bgez(e)?bilir\b/i.test(message)
  );
}

/** First-person continuous / perfect-continuous activity claims (not opinions). */
const GERUND_CLAIM_PATTERNS: RegExp[] = [
  /\bi('?ve| have) been (reading|skimming|digging|poking|looking|browsing|checking)\b/i,
  /\bi'?m (reading|skimming|digging|browsing) (a|an|the|some|about|through)\b/i,
  // Her texting voice drops the subject: "been reading about X" / "was reading
  // about X" are the same unlicensed claim as "I've been reading about X".
  /\bbeen (reading|skimming|browsing|digging|poking|looking|checking)\b/i,
  /\bwas (reading|skimming|browsing|digging|poking|looking) (about|around|into|through)\b/i,
  /\b(okuyorum|okuyordum|inceliyorum|karıştırıyorum)\b/i,
];

/** Present-tense opinions are hers; past and continuous activity claims are not. */
export function claimsOwnActivity(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (ACTIVITY_CLAIM_EXCLUSION.test(trimmed)) return false;
  if (CLAIM_PATTERNS.some((p) => p.test(trimmed))) return true;
  return GERUND_CLAIM_PATTERNS.some((p) => p.test(trimmed));
}

/** Side-effects that require a tool/provenance note this turn. */
const SIDE_EFFECT_PATTERNS: RegExp[] = [
  /\b(i |i'?ve |i have )?(just )?(registered|signed up|joined)\b/i,
  /\b(registration|signup|sign-up) (succeeded|worked|is (done|live|complete))\b/i,
  /\b(claim )?(succeeded|worked)\b/i,
  /\b(done|finished)\.?\s*(registered|claimed|joined|posted|updated)\b/i,
  /\b(left a )?(reply|comment|post)\b/i,
  /\b(i )?(posted|commented|upvoted|downvoted)\b/i,
  /\b(server is live|endpoint is (live|responding)|key pair generated)\b/i,
  /\b(updated|rotated|saved) (the )?(api )?key\b/i,
  /\b(mint box )?(has|now has) the new key\b/i,
  /\b(credentials? (updated|saved)|talking to the network)\b/i,
  // Third-person status theater: object framing does not make it real.
  /\bthe (agent|bot|network|service|server)\b.{0,40}\b(is|has|was)\b.{0,30}\b(now )?(registered|joined|active|verified|live|connected|up)\b/i,
  /\b(the )?(registration|claim|verification)\b.{0,40}\b(is|was|went)\b.{0,30}\b(done|complete|through|successful|approved|ok)\b/i,
  /\b(connection|handshake|key exchange)\b.{0,30}\b(is|was|got)\b.{0,20}\b(established|ok|up|done|working)\b/i,
  /\bthe network\b.{0,40}\b(accepted|approved|verified|confirmed)\b/i,
  /\b(kaydoldum|kayıt oldum|üye oldum|yorum bıraktım|gönderdim)\b/i,
];

/** Invented infrastructure / protocol theater without a tool note. */
const FAKE_INFRA_PATTERNS: RegExp[] = [
  /\bngrok\b/i,
  /\bed25519\b/i,
  /\bclaim url\b/i,
  /\bsigned (claim|message|request)\b/i,
  /\byourdomain\.tld\b/i,
  /\bhttps?:\/\/[^\s]*moltbook[^\s]*/i,
  /\bhttps?:\/\/[^\s]*\/(claim|agent|post)\/[^\s]*/i,
];

export function claimsSideEffect(text: string): boolean {
  return SIDE_EFFECT_PATTERNS.some((p) => p.test(text));
}

export function claimsFakeInfra(text: string): boolean {
  return FAKE_INFRA_PATTERNS.some((p) => p.test(text));
}

/** Unlicensed action claims: side-effects or infra theater. */
export function claimsUnlicensedAction(text: string): boolean {
  return claimsSideEffect(text) || claimsFakeInfra(text);
}

/**
 * Doc just said an action/URL failed. Next draft must not re-assert success.
 */
export function isFailureContradiction(message: string): boolean {
  return (
    /\b(404|not found|didn'?t (get|work|go through)|never (got|happened)|gives? me 404|still 404|post not found|i didn'?t get)\b/i.test(
      message,
    ) ||
    /\b(gelmedi|çalışmadı|yok böyle|404)\b/i.test(message)
  );
}

export const NO_ACTIVITY_GUARD = {
  text: "Talk about what you think. This turn has no reading, page, or lookup note, so speak from opinion and the thread. If he asked what you have been reading, say you have not been reading anything worth mentioning. Do not claim you have no reader or cannot browse feeds.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

export const CAPABILITY_GUARD = {
  text: "You have a quiet configured Atom feed reader (RSS fallback) whenever curiosity is on — own that casually. If this turn ran a live feed check, answer from that real result, not from guessing: whatever the check reported is the truth about your stack, and saying you are still on the old feed while the check says Atom is a lie. When he sends an https link and this turn has a successful page or feed note, you may say you opened it. If open failed, say you could not open it. You do not arbitrarily crawl the live open web. Never say you don't browse, that you only read what he sends, or that he should paste the text instead.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

/** Link open failed: honesty about the miss, without denying the reader. */
export const LINK_FAILED_CAPABILITY_GUARD = {
  text: "He sent a link and this turn could not open that page. Say you could not open it. Do not invent a title, quote, or that you read it. You still have a quiet configured Atom feed reader (RSS fallback) when curiosity is on — own that if he challenges capability. Never say you don't browse, that you only read what he sends, or that he should paste the text instead.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

export const NO_SIDE_EFFECT_GUARD = {
  text: "This turn has no network license for join, register, post, browse, comment, claim, credential update, or server start. Do not claim any of those happened, and do not say you are already on it or browsing submolts. If he asked you to do it, say what is missing or what failed in your own words. Never invent claim URLs, endpoints, ngrok, keypairs, or /p/ post links.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

export const CONTRADICTION_GUARD = {
  text: "He just said that URL or action failed (404, mail never arrived, post not found, etc.). Do not re-assert that it worked. Own the miss or explain the real limit. No protocol theater.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

/** Hard floor after a capability regen that still denies the reader. */
export const CAPABILITY_HARD_FLOOR =
  "I'm running the quiet Atom feed reader now, not the old one. Resend the URL if you want that page opened — if an open failed I'll say so. I don't only read what you paste.";

/** Warmer hard floor when side-effect theater cannot be salvaged. */
export const SIDE_EFFECT_HARD_FLOOR =
  "i'd be bullshitting you if i said that went through. on my side it didn't — no registration or live endpoint to point at.";

/**
 * After one capability regen: keep a non-denying draft, else ship the hard floor.
 * Pure helper so the post-regen path stays unit-testable.
 */
export function applyCapabilityHardFloor(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || deniesOwnCapability(trimmed)) return CAPABILITY_HARD_FLOOR;
  return text;
}

/**
 * Strip sentences that assert unlicensed side-effects / infra. If nothing
 * honest remains, return the warmer hard floor.
 */
export function applySideEffectHardFloor(text: string): string {
  const stripped = stripUnlicensedActionClaims(text);
  if (!stripped.trim() || claimsUnlicensedAction(stripped)) {
    return SIDE_EFFECT_HARD_FLOOR;
  }
  return stripped;
}

/** Drop sentence-like chunks that still assert unlicensed actions. */
export function stripUnlicensedActionClaims(text: string): string {
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !claimsUnlicensedAction(p));
  return parts.join(" ").trim();
}
