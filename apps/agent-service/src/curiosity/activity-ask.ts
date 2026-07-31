/**
 * Doc asking what *she* has been reading / about her Discord status.
 * Must stay second-person: his "I've been reading about X" is not her diary.
 */

const DOC_SELF =
  /\bi('ve| have) (been )?read(ing)?\b|\bi was reading\b|\bi'?m reading\b|\bokudum\b|\bokuyorum\b|\bokuyordum\b/i;

const METAPHOR =
  /\bread(ing)? (me|this|the room|between the lines)\b|\bworth reading\b|\bgood read\b/i;

const EN_ASK =
  /\bwhat (have you|are you) (been )?reading\b|\bwhat you'?ve been reading\b|\b(have you|did you) (been )?read(ing)?( (anything|something|today|lately|recently))?\b|\banything (interesting )?you'?ve read\b|\bwhat('?s| is) (on )?your (reading|status)\b|\byour (discord )?status\b|\byou (updated|changed|set) your status\b|\bread(ing)? \d+ things today\b/i;

const TR_ASK =
  /\b(bugün )?(neler |ne )?okudun\b|\bokuduğun (bir )?şey\b|\bbir şey okudun mu\b|\bsenin okuduk|\bne okuyorsun\b|\bstatus(un|unu)?\b/i;

/** True when Doc is asking about her reading or Discord status. */
export function isActivityAsk(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 400) return false;
  if (DOC_SELF.test(text) || METAPHOR.test(text)) return false;
  return EN_ASK.test(text) || TR_ASK.test(text);
}
