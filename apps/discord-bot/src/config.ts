import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

/** Windows User env — Cursor shells may not inherit tokens saved via setup-api-key.ps1 */
function loadWindowsUserEnvFallback(): void {
  if (process.platform !== "win32") return;
  for (const key of [
    "DISCORD_BOT_TOKEN",
    "DISCORD_OWNER_ID",
    "DISCORD_GUILD_ID",
    "DISCORD_ALLOWED_CHANNELS",
  ]) {
    if (process.env[key]) continue;
    try {
      const value = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `[Environment]::GetEnvironmentVariable('${key}', 'User')`,
        ],
        { encoding: "utf-8", timeout: 5000 },
      ).trim();
      if (value) process.env[key] = value;
    } catch {
      // ignore — validateConfig will surface missing required keys
    }
  }
}

loadWindowsUserEnvFallback();

export const config = {
  token: process.env.DISCORD_BOT_TOKEN ?? "",
  ownerId: process.env.DISCORD_OWNER_ID ?? "",
  allowedChannels: (process.env.DISCORD_ALLOWED_CHANNELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  guildId: process.env.DISCORD_GUILD_ID ?? "",
  agentUrl: process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:3710",
  proactiveEnabled: process.env.PROACTIVE_ENABLED !== "false",
  proactiveCheckIntervalMin: Number(
    process.env.PROACTIVE_CHECK_INTERVAL_MIN ?? 20,
  ),
  giphyApiKey: process.env.GIPHY_API_KEY ?? "",
  tenorApiKey: process.env.TENOR_API_KEY ?? "",
  gifEnabled: process.env.GIF_ENABLED !== "false",
  gifCooldownSec: Number(process.env.GIF_COOLDOWN_SEC ?? 120),
};

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.token) missing.push("DISCORD_BOT_TOKEN");
  if (!config.ownerId) missing.push("DISCORD_OWNER_ID");
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}
