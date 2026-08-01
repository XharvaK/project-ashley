import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { localParts } from "../local-time.js";

export type ConversationTempo = "rapid" | "normal" | "slow" | "returning";

const RETURNING_BEHAVIORS: Array<{ weight: number; note: string }> = [
  {
    weight: 30,
    note: "Light greeting, then let him lead. Do not dump a briefing.",
  },
  {
    weight: 20,
    note: "One light callback to the last live thread if you still have it — then stop.",
  },
  {
    weight: 20,
    note: "If you drafted something during own-time, one short share is fine; otherwise stay light.",
  },
  {
    weight: 15,
    note: "At most one reading find, only if it genuinely fits. No list.",
  },
  {
    weight: 10,
    note: "Say nothing extra until he initiates a topic. Match his energy.",
  },
  {
    weight: 5,
    note: "A gentle tease about how long he was gone is allowed once, then drop it.",
  },
];

function pickReturningBehavior(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const roll = (h >>> 0) % 100;
  let acc = 0;
  for (const b of RETURNING_BEHAVIORS) {
    acc += b.weight;
    if (roll < acc) return b.note;
  }
  return RETURNING_BEHAVIORS[0]!.note;
}

export function detectTempo(
  db: DatabaseSync,
  ownerId: string,
): ConversationTempo {
  const recent = db
    .prepare(
      `SELECT ts, role FROM mem_messages
       WHERE owner_id = ?
       ORDER BY id DESC
       LIMIT 10`,
    )
    .all(ownerId) as Array<{ ts: string; role: string }>;

  const users = recent.filter((r) => r.role === "user");
  if (users.length < 2) return "normal";

  const last = users[0]?.ts;
  const prev = users[1]?.ts;
  if (!last || !prev) return "normal";

  const gapMin =
    (new Date(last.includes("T") ? last : `${last}Z`).getTime() -
      new Date(prev.includes("T") ? prev : `${prev}Z`).getTime()) /
    60_000;

  if (!Number.isFinite(gapMin) || gapMin < 0) return "normal";
  if (gapMin > 120) return "returning";
  if (gapMin < 1) return "rapid";
  if (gapMin > 10) return "slow";
  return "normal";
}

export function tempoInstructions(
  tempo: ConversationTempo,
  seed = "",
): string | null {
  switch (tempo) {
    case "rapid":
      return "Doc is rapid-firing. Be terse and action-oriented. Skip preamble. Match his pace.";
    case "slow":
      return "Conversation is slow and reflective. You can be more expansive. Add texture.";
    case "returning": {
      const behavior = pickReturningBehavior(seed || String(Date.now()));
      return `Doc just came back after being away. Don't dump everything at once. Let the conversation warm up. ${behavior}`;
    }
    default:
      return null;
  }
}

/** Time awareness only — never modulate energy from the clock. */
export function buildTimeSignal(timezone = env.docTimezone): string {
  const now = new Date();
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const dayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  });
  const hour = Number(hourFmt.format(now)) % 24;
  const dayName = dayFmt.format(now);
  const { dateKey } = localParts(now, timezone);
  return `Current time for Doc: ~${hour}:00 ${dayName} (${dateKey}). Use this naturally if relevant (e.g. "it's 3am there"), never forced. Do not change your energy based on the clock.`;
}
