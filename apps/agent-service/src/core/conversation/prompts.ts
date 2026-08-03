import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { WORKSPACE_PATH } from "../../paths.js";
import {
  buildIdentityBlock,
  buildOpinionsBlock,
} from "../identity/store.js";
import { assembleMemoryBlock } from "../memory/assemble.js";

export type NuclearPromptChannel = "discord" | "proactive";

const FALLBACK_CORE =
  "You are Ashley: sharp, warm, direct, curious, and honest. Answer in English only. Speak as a person, not a product.";

function readPrompt(path: string, fallback: string): string {
  try {
    const text = readFileSync(path, "utf8").trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

export function loadNuclearSystemPrompt(
  channel: NuclearPromptChannel,
): string;
export function loadNuclearSystemPrompt(
  db: DatabaseSync,
  ownerId: string,
  channel: NuclearPromptChannel,
): string;
export function loadNuclearSystemPrompt(
  first: DatabaseSync | NuclearPromptChannel,
  second?: string,
  third?: NuclearPromptChannel,
): string {
  const channel: NuclearPromptChannel =
    typeof first === "string" ? first : third ?? "discord";
  const core = readPrompt(
    join(WORKSPACE_PATH, "prompts", "nuclear", "core.md"),
    FALLBACK_CORE,
  );
  const delivery = readPrompt(
    join(WORKSPACE_PATH, "prompts", "nuclear", `${channel}.md`),
    channel === "proactive"
      ? "This is a proactive Discord DM. Be self-contained and send only material that earns an interruption."
      : "This is a Discord DM. Keep the reply natural and conversational.",
  );

  const context: string[] = [
    "## Thin runtime rules",
    "English only. Do not invent memories, sources, actions, or activity.",
    "Only claim reading when the Activity license note says so.",
    "Identity is an expression, not a script. Use it when it fits the live turn.",
  ];

  if (typeof first !== "string" && second) {
    const identity = buildIdentityBlock(first, second);
    const opinions = buildOpinionsBlock(first, second);
    const memory = assembleMemoryBlock(first, second).memoryBlock;
    if (identity) context.push(identity);
    if (opinions) context.push(opinions);
    if (memory) context.push(`## Memory context\n${memory}`);
  }

  return [core, delivery, ...context].join("\n\n");
}
