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
  mistralReasoningDefault: (process.env.MISTRAL_REASONING_DEFAULT ??
    "medium") as "low" | "medium" | "high",
  // Mistral documents 0.0-0.7; above that a bilingual bot starts switching
  // language mid-sentence, so the ceiling is enforced here rather than trusted.
  mistralChatTemperature: Math.min(
    Number(process.env.MISTRAL_CHAT_TEMPERATURE ?? 0.7),
    0.7,
  ),
  mistralChatPresencePenalty: Number(
    process.env.MISTRAL_CHAT_PRESENCE_PENALTY ?? 0.15,
  ),
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
  memoryHotMaxMessages: Number(process.env.MEMORY_HOT_MAX_MESSAGES ?? 48),
  memoryHotMaxTokens: Number(process.env.MEMORY_HOT_MAX_TOKENS ?? 12000),
  memoryVoiceHotMessages: Number(process.env.MEMORY_VOICE_HOT_MESSAGES ?? 8),
  memorySummaryBatch: Number(process.env.MEMORY_SUMMARY_BATCH ?? 16),
  memorySummaryResidualFloor: Number(
    process.env.MEMORY_SUMMARY_RESIDUAL_FLOOR ?? 24,
  ),
  memoryFactEveryN: Number(process.env.MEMORY_FACT_EVERY_N ?? 4),
  personaFewshotEnabled: process.env.PERSONA_FEWSHOT_ENABLED !== "false",
  personaFewshotCount: Number(process.env.PERSONA_FEWSHOT_COUNT ?? 4),
  stanceLedgerEnabled: process.env.STANCE_LEDGER_ENABLED !== "false",
  stanceEveryN: Number(process.env.STANCE_EVERY_N ?? 6),
  friction: (process.env.ASHLEY_FRICTION ?? "high") as
    | "off"
    | "normal"
    | "high",
  sharpEnabled: process.env.ASHLEY_SHARP_ENABLED !== "false",
  /** Rolling hours after a fire before another sharp turn may arm. */
  sharpMaxPer24hHours: Number(process.env.ASHLEY_SHARP_MAX_HOURS ?? 24),
  sharpMinGapHours: Number(process.env.ASHLEY_SHARP_MIN_GAP_HOURS ?? 6),
  sharpForce: (process.env.ASHLEY_SHARP_FORCE ?? "auto") as
    | "on"
    | "off"
    | "auto",
  /** Daily real-voice activity caps on moltbook (heartbeat, deterministic). */
  moltbookMaxPostsPerDay: Number(
    process.env.MOLTBOOK_MAX_POSTS_PER_DAY ?? 3,
  ),
  moltbookMaxCommentsPerDay: Number(
    process.env.MOLTBOOK_MAX_COMMENTS_PER_DAY ?? 12,
  ),
  autoRememberEnabled: process.env.AUTO_REMEMBER_ENABLED !== "false",
  memoryJobsPendingAlert: Number(
    process.env.MEMORY_JOBS_PENDING_ALERT ?? 50,
  ),
  memoryRetrievalTopK: Number(process.env.MEMORY_RETRIEVAL_TOP_K ?? 6),
  memoryRetrievalMinScore: Number(
    process.env.MEMORY_RETRIEVAL_MIN_SCORE ?? 0.35,
  ),
  proactiveEnabled: process.env.PROACTIVE_ENABLED !== "false",
  proactiveMaxPerDay: Number(process.env.PROACTIVE_MAX_PER_DAY ?? 10),
  proactiveMinIdleHours: Number(process.env.PROACTIVE_MIN_IDLE_HOURS ?? 2),
  // Material queue: nothing goes out under the floor, and there is no filler.
  proactiveMinScore: Number(process.env.PROACTIVE_MIN_SCORE ?? 20),
  proactiveCheckInIdleHours: Number(
    process.env.PROACTIVE_CHECKIN_IDLE_HOURS ?? 20,
  ),
  // Burst, not metronome: a few close together, then a long quiet stretch.
  proactiveBurstMax: Number(process.env.PROACTIVE_BURST_MAX ?? 3),
  proactiveBurstWindowMinutes: Number(
    process.env.PROACTIVE_BURST_WINDOW_MINUTES ?? 90,
  ),
  proactiveBurstGapMinutes: Number(
    process.env.PROACTIVE_BURST_GAP_MINUTES ?? 12,
  ),
  proactiveBurstRestMinutes: Number(
    process.env.PROACTIVE_BURST_REST_MINUTES ?? 150,
  ),
  // Doc: more angles before quiet (2026-08-02). 4 unanswered proactive DMs,
  // then a 4h wait, then the queue tries fresh angles again.
  proactiveMaxUnanswered: Number(process.env.PROACTIVE_MAX_UNANSWERED ?? 4),
  proactiveSleepSuppressHours: Number(
    process.env.PROACTIVE_SLEEP_SUPPRESS_HOURS ?? 8,
  ),
  proactiveOrphanMaxPerDay: Number(process.env.PROACTIVE_ORPHAN_MAX_PER_DAY ?? 2),
  proactiveAffinityMinTokens: Number(
    process.env.PROACTIVE_AFFINITY_MIN_TOKENS ?? 3,
  ),
  proactiveBackoffStepHours: Number(
    process.env.PROACTIVE_BACKOFF_STEP_HOURS ?? 1,
  ),
  /** Hours to wait after the unanswered proactive DM ceiling is hit. */
  proactiveNudgeCapBackoffHours: Number(
    process.env.PROACTIVE_NUDGE_CAP_BACKOFF_HOURS ?? 4,
  ),
  /** Minutes an unanswered proactive DM must sit before the next nudge. */
  proactiveNudgeTimeoutMinutes: Number(
    process.env.PROACTIVE_NUDGE_TIMEOUT_MINUTES ?? 60,
  ),
  proactiveSessionWindowHours: Number(
    process.env.PROACTIVE_SESSION_WINDOW_HOURS ?? 3,
  ),
  proactiveNudgeIdleMinutes: Number(
    process.env.PROACTIVE_NUDGE_IDLE_MINUTES ?? 25,
  ),
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
  curiosityEnabled: process.env.CURIOSITY_ENABLED !== "false",
  curiosityTickMinutes: Number(process.env.CURIOSITY_TICK_MINUTES ?? 45),
  curiositySourcesPerTick: Number(process.env.CURIOSITY_SOURCES_PER_TICK ?? 2),
  curiositySourceIntervalHours: Number(
    process.env.CURIOSITY_SOURCE_INTERVAL_HOURS ?? 6,
  ),
  curiosityItemsPerSource: Number(process.env.CURIOSITY_ITEMS_PER_SOURCE ?? 12),
  // The reading is fuel for initiative. Budget was 3/day, she formed one take
  // and Doc felt the gap. Now: note wider, read a handful well, surface 4.
  curiosityNotePerDay: Number(process.env.CURIOSITY_NOTE_PER_DAY ?? 24),
  curiosityReadPerDay: Number(process.env.CURIOSITY_READ_PER_DAY ?? 8),
  curiositySurfacePerDay: Number(process.env.CURIOSITY_SURFACE_PER_DAY ?? 4),
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  // Shared Tavily ledger: 1000/month across chat lookups + watches.
  curiosityLookupEnabled: process.env.CURIOSITY_LOOKUP_ENABLED !== "false",
  curiosityTavilyMonthlyCredits: Number(
    process.env.CURIOSITY_TAVILY_MONTHLY_CREDITS ?? 1000,
  ),
  // Optional daily burst smoother; monthly ceiling stays authoritative.
  curiosityLookupPerDay: Number(process.env.CURIOSITY_LOOKUP_PER_DAY ?? 40),
  // Doc-supplied page reads (direct fetch, not Tavily).
  curiosityLinkReadPerDay: Number(process.env.CURIOSITY_LINK_READ_PER_DAY ?? 8),
  curiosityWatchMax: Number(process.env.CURIOSITY_WATCH_MAX ?? 3),
  curiosityWatchCadenceHours: Number(
    process.env.CURIOSITY_WATCH_CADENCE_HOURS ?? 24,
  ),
  docTimezone: process.env.DOC_TIMEZONE ?? "Europe/Istanbul",
  quietHoursStart: process.env.QUIET_HOURS_START ?? "23:30",
  quietHoursEnd: process.env.QUIET_HOURS_END ?? "07:30",
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
