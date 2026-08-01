/**
 * Doc asking what *she* has been up to / reading / about her Discord status.
 * Must stay second-person: his "I've been reading about X" is not her diary.
 *
 * Reading detection is structural (lexicon + ask/about-her shape), not a growing
 * list of exact phrases — those miss "any interesting reads you've stumbled upon".
 */

const DOC_SELF =
  /\bi('ve| have) (been )?read(ing)?\b|\bi was reading\b|\bi'?m reading\b|\bokudum\b|\bokuyorum\b|\bokuyordum\b/i;

const METAPHOR =
  /\bread(ing)? (me|this|the room|between the lines)\b|\bworth reading\b|\bgood read\b/i;

/** English/Turkish reading lexicon (verbs + noun "reads"). */
const READING_LEX =
  /\b(read|reads|reading|okud\w*|okuyor\w*)\b/i;

/** Turkish 2nd-person reading is often in the verb alone (okudun). */
const TR_READING_ASK =
  /\b(neler |ne )?okudun\b|\bokuduğun\b|\bokuyorsun\b|\bokuduğun (bir )?şey\b|\bbir şey okudun mu\b|\bsenin okuduk/i;

const ABOUT_HER =
  /\b(you|your|u|ya|sen|senin)\b/i;

/** Capability grants that mention reading are not "what did you read?" */
const CAPABILITY_GRANT =
  /\b(you can|feel free|go ahead|allowed to)\b.{0,80}\b(read|browse|web)\b|\bbrowse\b.{0,40}\bread\b/i;

const EN_GENERAL =
  /\bwhat (have you|are you|you'?ve|youve|you) been (up to|doing)\b|\bwhat('?d| did) you do (while|overnight|last night|today|lately|this (morning|afternoon|evening))\b|\bwhat were you (doing|up to)\b|\bwhile i (slept|was asleep|was sleeping)\b|\bhow('?s| is) your night\b|\banything (happen|interesting) (while|overnight)\b/i;

const TR_GENERAL =
  /\b(ne yaptın|neler yaptın|ne işle meşguldün|ne ile uğraştın)\b|\b(ben uyurken|uyurken|gece boyunca|bu gece)\b|\b(ne işler çevirdin|nelerle uğraştın)\b/i;

/** Profile / custom-status pointing — inject presence note, not take substitute. */
const PRESENCE_ASK =
  /\bwhat('?s| is) your (discord )?status\b|\byour (discord )?status\b|\b(discord )?status (say|says|saying)\b|\byou (updated|changed|set) your status\b|\b(discord )?profile (card|pic|picture|photo)?\b|\bstatus(un|unu|una)?\b/i;

const INTEREST_ASK =
  /\b(interest|interests|likes|what do you like|nelerden hoşlan)\b/i;

export type ActivityAskKind = "reading" | "general";

function hasReadingLexicon(text: string): boolean {
  return READING_LEX.test(text);
}

function hasAskOrAboutHerShape(text: string): boolean {
  if (text.includes("?")) return true;
  if (ABOUT_HER.test(text)) return true;
  return false;
}

/** True when Doc is pointing at her Discord status / profile. */
export function isPresenceAsk(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 400) return false;
  return PRESENCE_ASK.test(text);
}

/** True when the message also asks what she likes / her interests. */
export function asksInterests(message: string): boolean {
  return INTEREST_ASK.test(message.trim());
}

/** Kind of solicited activity ask, or null if not an activity ask. */
export function activityAskKind(message: string): ActivityAskKind | null {
  const text = message.trim();
  if (!text || text.length > 400) return null;
  if (DOC_SELF.test(text) || METAPHOR.test(text)) return null;
  if (CAPABILITY_GRANT.test(text)) return null;

  // Status-only asks are presence, not reading (unless reading lexicon also present).
  if (isPresenceAsk(text) && !hasReadingLexicon(text)) {
    return null;
  }

  if (TR_READING_ASK.test(text)) return "reading";

  if (hasReadingLexicon(text) && hasAskOrAboutHerShape(text)) {
    return "reading";
  }

  // Provenance challenge: "is that a book you've been reading?"
  if (
    /\b(is|was) that (an? |the )?(book|article|piece|post|essay|paper).{0,40}(you'?ve |you )?(been )?read/i.test(
      text,
    )
  ) {
    return "reading";
  }

  if (EN_GENERAL.test(text) || TR_GENERAL.test(text)) return "general";
  return null;
}

/** True when Doc is asking about her reading or overnight activity. */
export function isActivityAsk(message: string): boolean {
  return activityAskKind(message) !== null;
}
