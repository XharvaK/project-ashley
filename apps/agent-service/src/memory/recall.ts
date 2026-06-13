export type QueryMode = "normal" | "recall";

export const RECALL_PATTERNS: RegExp[] = [
  /what do you remember/i,
  /what do you know about me/i,
  /what('s| is) on file/i,
  /tell me what you (know|remember)/i,
  /ne (biliyorsun|hatırlıyorsun)/i,
  /neler\s+hatırlıyorsun/i,
  /ne\s+hatırlıyorsun/i,
  /bend(en|e) ne (biliyorsun|hatırlıyorsun)/i,
  /benim\s+hakkımda.*hatırl/i,
  /hafızanda\s+neler\s+var/i,
  /hafızanda\s+ne\s+var/i,
  /hafızan[aı]?\s+.*ne\s+var/i,
  /what have you (got|stored)/i,
];

export function isRecallQuery(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  return RECALL_PATTERNS.some((p) => p.test(t));
}
