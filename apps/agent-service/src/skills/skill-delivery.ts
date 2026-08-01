/**
 * Doc-delivered skills: an https skill URL plus a clear verb.
 * Bare links alone are not an execute license.
 */

const SKILL_URL_RE =
  /https?:\/\/[^\s<>"'`]+(?:skill\.md|\/skills?\/[^\s<>"'`]+)/i;

const DELIVER_VERB_RE =
  /\b(read|follow|execute|run|use|join|register|do it|install|apply)\b/i;

export type SkillDelivery = {
  url: string;
  wantsExecute: boolean;
};

export function detectSkillDelivery(message: string): SkillDelivery | null {
  const urlMatch = SKILL_URL_RE.exec(message);
  if (!urlMatch?.[0]) return null;
  const url = urlMatch[0].replace(/[),.]+$/, "");
  const wantsExecute = DELIVER_VERB_RE.test(message);
  return { url, wantsExecute };
}

export function isExplicitDoIt(message: string): boolean {
  return (
    /\bdo it\b/i.test(message) ||
    /\bjust (join|do|register|try)\b/i.test(message) ||
    /\b(try|register|join|sign up)( anyway| now)?\b/i.test(message.trim()) ||
    /\byap\b/i.test(message.trim())
  );
}
