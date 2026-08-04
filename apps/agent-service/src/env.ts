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

const numericWarnings: string[] = [];

function numericEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (
    !Number.isFinite(parsed) ||
    parsed < min ||
    parsed > max ||
    (integer && !Number.isInteger(parsed))
  ) {
    numericWarnings.push(`${name} invalid; using ${fallback}`);
    return fallback;
  }
  return parsed;
}

export const env = {
  ashleyReleaseId: process.env.ASHLEY_RELEASE_ID ?? "",
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
  mistralChatTemperature: numericEnv(
    "MISTRAL_CHAT_TEMPERATURE",
    0.7,
    0,
    0.7,
  ),
  discordOwnerId: process.env.DISCORD_OWNER_ID ?? "",
  memoryOwnerId:
    process.env.MEMORY_OWNER_ID ?? process.env.DISCORD_OWNER_ID ?? "",
  agentPort: numericEnv("AGENT_PORT", 3710, 1, 65_535, true),
  agentBindHost: process.env.AGENT_BIND_HOST ?? "127.0.0.1",
  nodeEnv: process.env.NODE_ENV ?? "development",
  personaEvalMode: process.env.PERSONA_EVAL_MODE === "true",
  proactiveEnabled: process.env.PROACTIVE_ENABLED !== "false",
  proactiveMaxPerDay: numericEnv("PROACTIVE_MAX_PER_DAY", 10, 0, 100, true),
  proactiveMinIdleHours: numericEnv("PROACTIVE_MIN_IDLE_HOURS", 2, 0, 168),
  reflectionMode:
    process.env.ASHLEY_REFLECTION_MODE === "apply"
      ? ("apply" as const)
      : ("observe" as const),
  cognitionMode:
    process.env.ASHLEY_COGNITION_MODE === "apply"
      ? ("apply" as const)
      : ("observe" as const),
  cognitionDispatchIntervalSec: numericEnv(
    "COGNITION_DISPATCH_INTERVAL_SEC",
    30,
    5,
    3600,
  ),
  mistralRequestsPerSecond: numericEnv(
    "MISTRAL_REQUESTS_PER_SECOND",
    1,
    1,
    100,
    true,
  ),
  mistralTokensPerMinute: numericEnv(
    "MISTRAL_TOKENS_PER_MINUTE",
    25_000,
    1_000,
    10_000_000,
    true,
  ),
  thoughtExpressionGuardMs: numericEnv(
    "THOUGHT_EXPRESSION_GUARD_MS",
    4_000,
    1,
    9_999,
    true,
  ),
  perceptionDispatchSafetyMs: numericEnv(
    "PERCEPTION_DISPATCH_SAFETY_MS",
    300,
    0,
    9_999,
    true,
  ),
  repairCoolingHours: numericEnv("ASHLEY_REPAIR_COOLING_HOURS", 24, 1, 168),
  reminderMissedGraceHours: numericEnv(
    "ASHLEY_REMINDER_MISSED_GRACE_HOURS",
    1,
    0,
    72,
  ),
  cognitionIdleConsolidationMin: numericEnv(
    "COGNITION_IDLE_CONSOLIDATION_MIN",
    10,
    0,
    1440,
  ),
  curiosityEnabled: process.env.CURIOSITY_ENABLED !== "false",
  curiosityTickMinutes: numericEnv("CURIOSITY_TICK_MINUTES", 45, 1, 1440),
  curiosityItemsPerSource: numericEnv(
    "CURIOSITY_ITEMS_PER_SOURCE",
    12,
    1,
    100,
    true,
  ),
  sandboxBrokerEnabled: process.env.ASHLEY_SANDBOX_BROKER_ENABLED === "true",
  sandboxBrokerSocket:
    process.env.ASHLEY_SANDBOX_BROKER_SOCKET ?? "/run/ashley/broker.sock",
  sandboxBrokerTimeoutMs: numericEnv(
    "ASHLEY_SANDBOX_BROKER_TIMEOUT_MS",
    5_000,
    100,
    30_000,
    true,
  ),
  sandboxKeysDir:
    process.env.ASHLEY_SANDBOX_KEYS_DIR ??
    join(homedir(), ".composer-assistant", "keys"),
  sandboxKeyPassphrasePath:
    process.env.ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH ??
    join(homedir(), ".composer-assistant", "keys", "master.pass"),
  sandboxOwnerApprovalKeyEncPath:
    process.env.ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH ??
    join(homedir(), ".composer-assistant", "keys", "owner-approval.key.enc"),
  sandboxContinuityKeyEncPath:
    process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH ??
    join(homedir(), ".composer-assistant", "keys", "continuity-tombstone.key.enc"),
  sandboxOwnerKeyId: process.env.ASHLEY_SANDBOX_OWNER_KEY_ID ?? "owner-ed25519-v1",
  sandboxContinuityKeyId:
    process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ID ?? "continuity-tombstone-ed25519-v1",
};

export function validateBoot(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  warnings.push(...numericWarnings);
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
