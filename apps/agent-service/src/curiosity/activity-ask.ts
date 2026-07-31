/**
 * Doc asking what *she* has been up to / reading / about her Discord status.
 * Must stay second-person: his "I've been reading about X" is not her diary.
 */

const DOC_SELF =
  /\bi('ve| have) (been )?read(ing)?\b|\bi was reading\b|\bi'?m reading\b|\bokudum\b|\bokuyorum\b|\bokuyordum\b/i;

const METAPHOR =
  /\bread(ing)? (me|this|the room|between the lines)\b|\bworth reading\b|\bgood read\b/i;

const EN_READING =
  /\bwhat (have you|are you) (been )?reading\b|\bwhat you'?ve been reading\b|\b(have you|did you) (been )?read(ing)?( (anything|something|today|lately|recently))?\b|\banything (interesting )?you'?ve read\b|\bwhat('?s| is) (on )?your (reading|status)\b|\byour (discord )?status\b|\byou (updated|changed|set) your status\b|\bread(ing)? \d+ things today\b|\b(is|was) that (an? |the )?(book|article|piece|post|essay|paper).{0,40}(you'?ve |you )?(been )?read/i;

const TR_READING =
  /\b(bugün )?(neler |ne )?okudun\b|\bokuduğun (bir )?şey\b|\bbir şey okudun mu\b|\bsenin okuduk|\bne okuyorsun\b|\bstatus(un|unu)?\b/i;

const EN_GENERAL =
  /\bwhat (have you|are you|you'?ve|youve|you) been (up to|doing)\b|\bwhat('?d| did) you do (while|overnight|last night|today|lately|this (morning|afternoon|evening))\b|\bwhat were you (doing|up to)\b|\bwhile i (slept|was asleep|was sleeping)\b|\bhow('?s| is) your night\b|\banything (happen|interesting) (while|overnight)\b/i;

const TR_GENERAL =
  /\b(ne yaptın|neler yaptın|ne işle meşguldün|ne ile uğraştın)\b|\b(ben uyurken|uyurken|gece boyunca|bu gece)\b|\b(ne işler çevirdin|nelerle uğraştın)\b/i;

export type ActivityAskKind = "reading" | "general";

/** Kind of solicited activity ask, or null if not an activity ask. */
export function activityAskKind(message: string): ActivityAskKind | null {
  const text = message.trim();
  if (!text || text.length > 400) return null;
  if (DOC_SELF.test(text) || METAPHOR.test(text)) return null;
  if (EN_READING.test(text) || TR_READING.test(text)) return "reading";
  if (EN_GENERAL.test(text) || TR_GENERAL.test(text)) return "general";
  return null;
}

/** True when Doc is asking about her reading, status, or overnight activity. */
export function isActivityAsk(message: string): boolean {
  return activityAskKind(message) !== null;
}
