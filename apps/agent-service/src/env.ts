import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ENV_PATH =
  process.env.COMPOSER_ENV_FILE ??
  join(homedir(), ".composer-assistant", ".env");

function loadDotEnv(): void {
  if (!existsSync(ENV_PATH)) return;
  const content = readFileSync(ENV_PATH, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

export const env = {
  mistralApiKey: process.env.MISTRAL_API_KEY ?? "",
  mistralModel: process.env.MISTRAL_MODEL ?? "mistral-medium-latest",
  mistralReasoningEffort:
    (process.env.MISTRAL_REASONING_EFFORT as
      | "low"
      | "medium"
      | "high"
      | undefined) ??
    ((process.env.MISTRAL_REASONING_DEFAULT as
      | "low"
      | "medium"
      | "high"
      | undefined) ?? "medium"),
  // Mistral documents 0.0-0.7; above that a bilingual bot starts switching
  // language mid-sentence, so the ceiling is enforced here rather than trusted.
  mistralChatTemperature: Math.min(
    Number(process.env.MISTRAL_CHAT_TEMPERATURE ?? 0.7),
    0.7,
  ),
  discordOwnerId: process.env.DISCORD_OWNER_ID ?? "",
  memoryOwnerId:
    process.env.MEMORY_OWNER_ID ?? process.env.DISCORD_OWNER_ID ?? "",
  agentPort: Number(process.env.AGENT_PORT ?? 3710),
  agentBindHost: process.env.AGENT_BIND_HOST ?? "127.0.0.1",
  nodeEnv: process.env.NODE_ENV ?? "development",
  proactiveEnabled: process.env.PROACTIVE_ENABLED !== "false",
  proactiveMaxPerDay: Number(process.env.PROACTIVE_MAX_PER_DAY ?? 10),
  proactiveMinIdleHours: Number(process.env.PROACTIVE_MIN_IDLE_HOURS ?? 2),
  curiosityEnabled: process.env.CURIOSITY_ENABLED !== "false",
  curiosityTickMinutes: Number(process.env.CURIOSITY_TICK_MINUTES ?? 45),
  curiosityItemsPerSource: Number(process.env.CURIOSITY_ITEMS_PER_SOURCE ?? 12),
};

export function validateBoot(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!env.mistralApiKey) {
    warnings.push("MISTRAL_API_KEY missing — agent will run offline");
  }
  if (!env.memoryOwnerId) {
    warnings.push(
      "MEMORY_OWNER_ID / DISCORD_OWNER_ID missing — set owner for nuclear memory",
    );
  }
  return { ok: true, warnings };
}
