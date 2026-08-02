/**
 * Doc granting future use of her quiet reader. Not an activity ask, not a
 * topical lookup, and never a license that she already read something.
 */

const DOC_SELF =
  /\bi('ve| have) (been )?brows(e|ing)\b|\bi('ve| have) (been )?read(ing)?\b|\bi was (browsing|reading)\b|\bgeziniyorum\b|\bokudum\b|\bokuyorum\b/i;

const METAPHOR =
  /\bread(ing)? (me|this|the room|between the lines)\b|\bworth reading\b|\bgood read\b|\bbrowse (around|the room)\b/i;

const EN_PERMISSION =
  /\b(you can|go ahead and|feel free to|you're free to|go)\b.{0,40}\b(chill|browse|read|surf)\b|\b(browse|read) (the )?(web|internet|feeds?|stuff|things)\b.{0,40}\b(you (want|like|interest)|that interests you|on your own)\b|\bread (stuff|things) that interests? you\b|\bfollow (your )?feeds?\b|\bgo browse\b|\bchill.{0,20}\bbrowse\b/i;

const TR_PERMISSION =
  /\b(rahat|istediğin(i| kadar)?|ilgini çeken|gez|browse)\b.{0,40}\b(oku|gez|bak|takip)\b|\bfeed(lerini|ini)? takip (edebilirsin|et)\b|\brahat rahat oku\b|\bistediğini oku\b|\bweb'?de gez\b|\bbrowse (edebilirsin|et)\b/i;

/** True when Doc is allowing future idle browsing, not asking what she read. */
export function isBrowsePermission(message: string): boolean {
  const text = message.trim();
  if (!text || text.length < 8 || text.length > 400) return false;
  if (DOC_SELF.test(text) || METAPHOR.test(text)) return false;
  return EN_PERMISSION.test(text) || TR_PERMISSION.test(text);
}

export function buildCapabilityBlock(curiosityEnabled: boolean): string | null {
  if (!curiosityEnabled) {
    return [
      "He granted browsing permission, but your quiet reader is disabled right now.",
      "Do not claim you have a feed or that you browsed.",
      "Say plainly that the reader is unavailable if the topic comes up.",
    ].join(" ");
  }
  return [
    "Capability note: you have a quiet configured RSS/Atom reader that checks scheduled sources in the background and can form takes. You do not arbitrarily browse the open live web.",
    "Network note: you have a registered moltbook agent with its own credentials and claim URL — own that presence. You are on moltbook, not on arbitrary forums or platforms. If a claim is pending, say it is pending; never deny the registration.",
    "Permission note: he allowed future use of that reader. That is not a completed read this turn and does not invent titles or sources.",
    "If he asks whether you can browse/read feeds, own the quiet reader casually. Do not say you have no feed. Do not claim you read something unless an activity, page, or search note in this turn says so.",
  ].join(" ");
}
