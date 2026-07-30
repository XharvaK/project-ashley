import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ENV_PATH =
  process.env.COMPOSER_ENV_FILE ??
  join(homedir(), ".composer-assistant", ".env");

function loadDotEnv(): void {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, "utf-8").split(/\r?\n/)) {
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  token: process.env.TELEGRAM_BOT_TOKEN ?? "",
  /** Telegram numeric user id allowed to talk to Ashley */
  telegramOwnerId: process.env.TELEGRAM_OWNER_ID ?? "",
  /** Canonical memory owner shared with Discord */
  memoryOwnerId:
    process.env.MEMORY_OWNER_ID ??
    process.env.DISCORD_OWNER_ID ??
    process.env.TELEGRAM_OWNER_ID ??
    "",
  agentUrl: process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:3710",
  proactiveEnabled: process.env.PROACTIVE_ENABLED !== "false",
  proactiveChannel: process.env.PROACTIVE_CHANNEL ?? "discord",
  proactiveCheckIntervalMin: Number(
    process.env.PROACTIVE_CHECK_INTERVAL_MIN ?? 20,
  ),
};

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.token) missing.push("TELEGRAM_BOT_TOKEN");
  if (!config.telegramOwnerId) missing.push("TELEGRAM_OWNER_ID");
  if (!config.memoryOwnerId) missing.push("MEMORY_OWNER_ID");
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}
