import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE_PATH } from "./paths.js";

export type PromptChannel = "discord" | "voice" | "proactive";

export function loadCorePrompt(): string {
  const path = join(WORKSPACE_PATH, "prompts", "core-ashley.md");
  return readFileSync(path, "utf-8");
}

export function loadSystemPrompt(channel: PromptChannel): string {
  const core = loadCorePrompt();
  const deltaFile =
    channel === "discord"
      ? "discord-companion.md"
      : channel === "voice"
        ? "voice-companion.md"
        : "proactive-companion.md";
  const delta = readFileSync(
    join(WORKSPACE_PATH, "prompts", deltaFile),
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
