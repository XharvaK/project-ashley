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
    (process.env.MISTRAL_REASONING_EFFORT as "none" | "high" | undefined) ??
    "none",
  mistralChatTemperature: Number(process.env.MISTRAL_CHAT_TEMPERATURE ?? 0.55),
  mistralVoiceTemperature: Number(process.env.MISTRAL_VOICE_TEMPERATURE ?? 0.5),
  mistralRecallTemperature: Number(
    process.env.MISTRAL_RECALL_TEMPERATURE ?? 0.3,
  ),
  mistralConsolidationModel:
    process.env.MEMORY_CONSOLIDATION_MODEL ?? "mistral-small-latest",
  mistralEmbedModel: process.env.MEMORY_EMBED_MODEL ?? "mistral-embed",
  discordOwnerId: process.env.DISCORD_OWNER_ID ?? "",
  memoryOwnerId:
    process.env.MEMORY_OWNER_ID ?? process.env.DISCORD_OWNER_ID ?? "",
  agentPort: Number(process.env.AGENT_PORT ?? 3710),
  agentBindHost: process.env.AGENT_BIND_HOST ?? "127.0.0.1",
  nodeEnv: process.env.NODE_ENV ?? "development",
  memoryHotMaxMessages: Number(process.env.MEMORY_HOT_MAX_MESSAGES ?? 40),
  memoryHotMaxTokens: Number(process.env.MEMORY_HOT_MAX_TOKENS ?? 10000),
  memoryVoiceHotMessages: Number(process.env.MEMORY_VOICE_HOT_MESSAGES ?? 8),
  memorySummaryBatch: Number(process.env.MEMORY_SUMMARY_BATCH ?? 20),
  memoryFactEveryN: Number(process.env.MEMORY_FACT_EVERY_N ?? 4),
  autoRememberEnabled: process.env.AUTO_REMEMBER_ENABLED !== "false",
  memoryJobsPendingAlert: Number(
    process.env.MEMORY_JOBS_PENDING_ALERT ?? 50,
  ),
  memoryRetrievalTopK: Number(process.env.MEMORY_RETRIEVAL_TOP_K ?? 6),
  memoryRetrievalMinScore: Number(
    process.env.MEMORY_RETRIEVAL_MIN_SCORE ?? 0.35,
  ),
  proactiveEnabled: process.env.PROACTIVE_ENABLED !== "false",
  proactiveMaxPerDay: Number(process.env.PROACTIVE_MAX_PER_DAY ?? 4),
  proactiveMinIdleHours: Number(process.env.PROACTIVE_MIN_IDLE_HOURS ?? 2),
  proactiveCheckIntervalMin: Number(
    process.env.PROACTIVE_CHECK_INTERVAL_MIN ?? 20,
  ),
  proactiveColdStartHours: Number(
    process.env.PROACTIVE_COLD_START_HOURS ?? 24,
  ),
  proactiveChannel: (process.env.PROACTIVE_CHANNEL ?? "discord") as
    | "discord"
    | "telegram",
  telegramOwnerId: process.env.TELEGRAM_OWNER_ID ?? "",
  docTimezone: process.env.DOC_TIMEZONE ?? "Europe/Istanbul",
  quietHoursStart: process.env.QUIET_HOURS_START ?? "",
  quietHoursEnd: process.env.QUIET_HOURS_END ?? "",
};

export function validateBoot(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!env.mistralApiKey) {
    warnings.push("MISTRAL_API_KEY missing — agent will run offline");
  }
  if (!env.memoryOwnerId) {
    warnings.push(
      "MEMORY_OWNER_ID / DISCORD_OWNER_ID missing — memory owner fallback required for voice",
    );
  }
  return { ok: true, warnings };
}
