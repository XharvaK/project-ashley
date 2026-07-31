import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env.js";
import { WORKSPACE_PATH } from "./paths.js";

export type PromptChannel = "discord" | "voice" | "proactive" | "telegram";

/**
 * `prefix` is who she is and how this channel works. `suffix` lands after the
 * memory block, which is the last thing the model reads and therefore the part
 * that most shapes style. Without a coda, the tier listing gets the final word
 * and she answers like an index.
 */
export type SystemPromptParts = { prefix: string; suffix: string };

const VOICE_CODA = `Everything above is reference, not a script. You are Ashley talking to Doc: concrete, one bubble unless a second earns it, an opinion when you have one, and honest when you have nothing stored. No facilitator lines, no em dash.`;

function channelDeltaFile(channel: PromptChannel): string {
  switch (channel) {
    case "discord":
      return "discord-companion.md";
    case "voice":
      return "voice-companion.md";
    case "proactive":
      return "proactive-companion.md";
    case "telegram":
      return "telegram-companion.md";
    default: {
      const _exhaustive: never = channel;
      return _exhaustive;
    }
  }
}

/** Friction is instruction, not sampling noise, so the dial is a prompt line. */
function frictionLine(): string | null {
  switch (env.friction) {
    case "high":
      return null;
    case "normal":
      return "Friction dial: normal. Tease and push back about half as often as described above. Still never fold on a position you hold.";
    case "off":
      return "Friction dial: off for now. No teasing, no disagreement for sport. Still never pretend to agree when you do not.";
    default: {
      const _exhaustive: never = env.friction;
      return _exhaustive;
    }
  }
}

export function loadCorePrompt(): string {
  const path = join(WORKSPACE_PATH, "prompts", "core-ashley.md");
  return readFileSync(path, "utf-8");
}

function readPrompt(file: string): string {
  return readFileSync(join(WORKSPACE_PATH, "prompts", file), "utf-8").trim();
}

function assemble(delta: string): SystemPromptParts {
  const friction = frictionLine();
  const prefix = [loadCorePrompt().trim(), delta, friction]
    .filter(Boolean)
    .join("\n\n");
  return { prefix, suffix: VOICE_CODA };
}

export function loadSystemPrompt(channel: PromptChannel): SystemPromptParts {
  return assemble(readPrompt(channelDeltaFile(channel)));
}

export function loadHabitNudgePrompt(): SystemPromptParts {
  return assemble(readPrompt("habit-nudge.md"));
}

export function buildDiscordPresenceNote(
  presence: { status: "online" | "idle"; label: string } | undefined,
): string | null {
  if (!presence?.label?.trim()) return null;
  const label = presence.label.trim().slice(0, 80);
  return [
    `Your Discord custom status right now: "${label}".`,
    "Own it if he points at it or your profile; do not volunteer it.",
  ].join(" ");
}

export function appendMemoryBlock(
  parts: SystemPromptParts,
  memoryBlock: string,
  extras: {
    curiosity?: string | null;
    voice?: string | null;
    guard?: string | null;
    presence?: string | null;
    capability?: string | null;
    sharp?: string | null;
  } = {},
): string {
  return [
    parts.prefix,
    memoryBlock.trim(),
    extras.presence,
    extras.capability,
    extras.curiosity,
    extras.sharp,
    extras.voice,
    extras.guard,
    parts.suffix,
  ]
    .filter(Boolean)
    .join("\n\n");
}
