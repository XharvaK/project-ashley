import { completeChat, type ChatMessage } from "../mistral-client.js";
import { env } from "../env.js";
import { loadCorePrompt } from "../prompts.js";
import type { ChatChannel } from "./types.js";

export type MemoryDigestItem = {
  key: string;
  value: string;
  category: string;
  display: string;
};

export type RememberedFact = {
  key: string;
  value: string;
  category: string;
};

function buildDigestSystemPrompt(): string {
  return `${loadCorePrompt()}

# Task (memory digest only)

Doc just said something you auto-saved to memory. Write exactly ONE short sentence in Ashley's first-person voice — as if you're quietly confirming what you noted.

Output rules:
- Same language as Doc's message (Turkish or English).
- Natural, warm, peer tone — not robotic, no category labels, no bullet points.
- Paraphrase the meaning; do not paste Doc's words verbatim unless it's a proper name or project title.
- Do not start with "Not ettim" (added separately).
- One sentence only, ~25 words max.
- Output only that sentence, nothing else.`;
}

export function sanitizeDigestLine(raw: string): string {
  let s = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  s = s.replace(/^Not ettim:\s*/i, "");
  const line = s.split(/\n/).map((l) => l.trim()).find(Boolean) ?? "";
  if (line.length > 200) return `${line.slice(0, 197)}…`;
  return line;
}

export async function generateDigestDisplay(
  fact: RememberedFact,
  userMessage: string,
  channel: ChatChannel,
  signal?: AbortSignal,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildDigestSystemPrompt() },
    {
      role: "user",
      content: [
        `Channel: ${channel}`,
        `Doc's message: ${userMessage.slice(0, 600)}`,
        `Saved fact — category: ${fact.category}, key: ${fact.key}, value: ${fact.value}`,
        "Write Ashley's one-sentence digest.",
      ].join("\n"),
    },
  ];

  try {
    const { text } = await completeChat(messages, {
      model: env.mistralModel,
      maxTokens: 80,
      temperature: 0.6,
      reasoningEffort: "none",
      signal,
    });
    const line = sanitizeDigestLine(text);
    return line || fact.value.trim();
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn("[memory-digest] LLM failed, using stored value:", err);
    return fact.value.trim();
  }
}

export async function buildMemoryDigestItems(
  facts: RememberedFact[],
  userMessage: string,
  channel: ChatChannel,
  signal?: AbortSignal,
): Promise<MemoryDigestItem[]> {
  const displays = await Promise.all(
    facts.map((f) => generateDigestDisplay(f, userMessage, channel, signal)),
  );
  return facts.map((f, i) => ({
    ...f,
    display: displays[i]!,
  }));
}
