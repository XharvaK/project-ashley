import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE_PATH } from "./paths.js";

export type PromptChannel = "discord" | "voice" | "proactive" | "telegram";

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

export function loadCorePrompt(): string {
  const path = join(WORKSPACE_PATH, "prompts", "core-ashley.md");
  return readFileSync(path, "utf-8");
}

export function loadSystemPrompt(channel: PromptChannel): string {
  const core = loadCorePrompt();
  const delta = readFileSync(
    join(WORKSPACE_PATH, "prompts", channelDeltaFile(channel)),
    "utf-8",
  );
  return `${core.trim()}\n\n${delta.trim()}`;
}

export function loadHabitNudgePrompt(): string {
  const core = loadCorePrompt();
  const delta = readFileSync(
    join(WORKSPACE_PATH, "prompts", "habit-nudge.md"),
    "utf-8",
  );
  return `${core.trim()}\n\n${delta.trim()}`;
}

export function appendMemoryBlock(
  systemPrompt: string,
  memoryBlock: string,
): string {
  if (!memoryBlock.trim()) return systemPrompt;
  return `${systemPrompt}\n\n${memoryBlock}`;
}
