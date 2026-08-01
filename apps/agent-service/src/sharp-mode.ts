import type { DatabaseSync } from "node:sqlite";
import { env } from "./env.js";
import { isSignOff } from "./initiative/sleep.js";
import { getKv, setKv } from "./memory/kv.js";
import { isPremiseCheck } from "./premise-guard.js";
import { messageTags } from "./voice-bank.js";

export type SharpShape = "peak" | "banter" | "ineligible";

const WAKE_RE =
  /\b(good\s*morning|morning|i'?m\s+up|awake|just woke|woke up)\b|\bgünaydın\b|\buyan(dım|ıyorum)?\b/i;

const HARD_BLOCK_TAGS = new Set([
  "substance_code",
  "substance_pharma",
  "low_energy",
  "quiet",
]);

const SOFT_ALLOW_TAGS = new Set([
  "signoff",
  "tease",
  "hang",
  "low_content",
  "banter",
]);

export function sharpLastAtKey(ownerId: string): string {
  return `sharp_last_at:${ownerId}`;
}

export function sharpLicenseNote(): string {
  return [
    "Sharp mode this turn: one cutting, specific competence-edge jab is allowed.",
    "The jab must use material already in this turn's memory block, standing facts, or the hot thread — invent nothing (no hour-counts, sleep myths, or 'you said' quotes).",
    "Still one move. Still yield-gate first. No softener after it. No apology.",
  ].join(" ");
}

export function sharpShape(message: string): SharpShape {
  const text = message.trim();
  if (!text || text.length > 100) return "ineligible";
  if (isPremiseCheck(text)) return "ineligible";

  const tags = messageTags(text);
  if (tags.some((t) => HARD_BLOCK_TAGS.has(t))) return "ineligible";

  const peak =
    isSignOff(text) ||
    WAKE_RE.test(text) ||
    tags.includes("signoff") ||
    tags.includes("tease");
  if (peak) return "peak";

  if (tags.some((t) => SOFT_ALLOW_TAGS.has(t))) return "banter";
  return "ineligible";
}

export type DecideSharpParams = {
  channel: string;
  queryMode: string;
  message: string;
  lastAt: string | null;
  /** Block when link-immediate, night ask, etc. */
  blocked?: boolean;
  now?: Date;
  rand?: () => number;
  force?: "on" | "off" | "auto";
  chanceBanter?: number;
  chancePeak?: number;
  maxPer24hHours?: number;
  minGapHours?: number;
};

export function decideSharpMode(p: DecideSharpParams): {
  armed: boolean;
  reason: string;
} {
  const force = p.force ?? env.sharpForce;
  if (force === "off" || !env.sharpEnabled) {
    return { armed: false, reason: "disabled" };
  }
  if (force === "on") {
    return { armed: true, reason: "force" };
  }

  if (p.channel !== "discord" && p.channel !== "telegram") {
    return { armed: false, reason: "channel" };
  }
  if (p.queryMode !== "normal") {
    return { armed: false, reason: "queryMode" };
  }
  if (p.blocked) {
    return { armed: false, reason: "blocked" };
  }

  const shape = sharpShape(p.message);
  if (shape === "ineligible") {
    return { armed: false, reason: "shape" };
  }

  const now = p.now ?? new Date();
  const maxHours = p.maxPer24hHours ?? env.sharpMaxPer24hHours;
  const minGap = p.minGapHours ?? env.sharpMinGapHours;
  if (p.lastAt) {
    const lastMs = new Date(p.lastAt).getTime();
    if (Number.isFinite(lastMs)) {
      const hours = (now.getTime() - lastMs) / 3_600_000;
      if (hours < maxHours) {
        return { armed: false, reason: "budget24h" };
      }
      if (hours < minGap) {
        return { armed: false, reason: "minGap" };
      }
    }
  }

  const chance =
    shape === "peak"
      ? (p.chancePeak ?? env.sharpChancePeak)
      : (p.chanceBanter ?? env.sharpChanceBanter);
  const rand = p.rand ?? Math.random;
  if (rand() >= chance) {
    return { armed: false, reason: "roll" };
  }
  return { armed: true, reason: shape };
}

export function readSharpLastAt(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  return getKv(db, sharpLastAtKey(ownerId));
}

export function commitSharpArmed(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): void {
  setKv(db, sharpLastAtKey(ownerId), now.toISOString());
}
