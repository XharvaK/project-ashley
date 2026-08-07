import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  CAPABILITY_SIGNING_KEY_ID,
  DELEGATED_RUNTIME_KEY_ID,
} from "@composer-assistant/sandbox-broker";
import { SANDBOX_AUTONOMY_LIFECYCLE_VALUES } from "./core/sandbox/lifecycle.js";

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

/**
 * Boot errors are fatal: malformed security configuration must never be
 * coerced into a permissive value. `ok: false` from validateBoot() sends the
 * agent offline instead of running with a guessed setting.
 */
const bootErrors: string[] = [];
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

function strictBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (raw.trim() === "true") return true;
  if (raw.trim() === "false") return false;
  bootErrors.push(`${name} must be "true" or "false"`);
  return fallback;
}

function strictEnum<T extends readonly string[]>(
  name: string,
  values: T,
  fallback: T[number],
): T[number] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if ((values as readonly string[]).includes(raw.trim())) {
    return raw.trim() as T[number];
  }
  bootErrors.push(`${name} must be one of: ${values.join(", ")}`);
  return fallback;
}

function strictTrimmed(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === "") {
    bootErrors.push(`${name} must not be empty`);
    return fallback;
  }
  return trimmed;
}

const sandboxKeysDir = strictTrimmed(
  "ASHLEY_SANDBOX_KEYS_DIR",
  join(homedir(), ".composer-assistant", "keys"),
);
const sandboxOwnerKeyId = strictTrimmed(
  "ASHLEY_SANDBOX_OWNER_KEY_ID",
  "owner-ed25519-v1",
);
const sandboxContinuityKeyId = strictTrimmed(
  "ASHLEY_SANDBOX_CONTINUITY_KEY_ID",
  "continuity-tombstone-ed25519-v1",
);

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
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqBaseUrl:
    process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
  groqDefaultModel: process.env.GROQ_DEFAULT_MODEL ?? "openai/gpt-oss-20b",
  // NVIDIA NIM: represented in config/models.json but never routed. These
  // keys are optional and unused at boot.
  nimApiKey: process.env.NIM_API_KEY ?? "",
  nimBaseUrl:
    process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
  // Visible Expression fallback (Wave 3): when the primary Mistral dispatch
  // fails on an eligible turn, retry once over the minimal profile via the
  // ashley_expression_fallback (Groq) route. Evaluation-gated off by default;
  // activate only after owner approval.
  expressionFallbackEnabled:
    process.env.ASHLEY_EXPRESSION_FALLBACK === "true",
  expressionFallbackRecentTurns: numericEnv(
    "ASHLEY_EXPRESSION_FALLBACK_RECENT_TURNS",
    6,
    4,
    8,
    true,
  ),
  // Owner-marked Decision kinds that must never leave the Mistral lane.
  mistralOnlyKinds: (process.env.ASHLEY_EXPRESSION_MISTRAL_ONLY_KINDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
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
  sandboxBrokerEnabled: strictBoolean(
    "ASHLEY_SANDBOX_BROKER_ENABLED",
    false,
  ),
  // Opt-in flag for the delegated `sandbox.*` IPC surface. The agent wires a
  // production Unix-socket broker client only when this is true AND the broker
  // host has started the delegated runtime; otherwise it stays on the in-process
  // fake. Not release-qualified (Wave 07c, see Sandbox_Design.md).
  sandboxDelegatedEnabled: strictBoolean(
    "ASHLEY_SANDBOX_DELEGATED_ENABLED",
    false,
  ),
  sandboxBrokerSocket: strictTrimmed(
    "ASHLEY_SANDBOX_BROKER_SOCKET",
    "/run/ashley/broker.sock",
  ),
  sandboxBrokerTimeoutMs: numericEnv(
    "ASHLEY_SANDBOX_BROKER_TIMEOUT_MS",
    5_000,
    100,
    30_000,
    true,
  ),
  sandboxKeysDir,
  sandboxKeyPassphrasePath:
    process.env.ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH ??
    join(homedir(), ".composer-assistant", "keys", "master.pass"),
  sandboxOwnerApprovalKeyEncPath:
    process.env.ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH ??
    join(homedir(), ".composer-assistant", "keys", "owner-approval.key.enc"),
  sandboxContinuityKeyEncPath:
    process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH ??
    join(homedir(), ".composer-assistant", "keys", "continuity-tombstone.key.enc"),
  sandboxOwnerKeyId,
  sandboxContinuityKeyId,
  // Sandbox autonomy lifecycle. Mirrors SANDBOX_AUTONOMY_LIFECYCLE_VALUES;
  // the runtime loop stays constructor-injected and defaults to disabled, so
  // this value is configuration surface and readiness gating only.
  sandboxLifecycle: strictEnum(
    "ASHLEY_SANDBOX_LIFECYCLE",
    SANDBOX_AUTONOMY_LIFECYCLE_VALUES,
    "disabled",
  ),
  // Network isolation provider for fixed-recipe execution. `unavailable`
  // (default) is the fail-closed provider: no provider, no execution. `none`
  // is the Mint network-namespace enforcement the broker injects.
  sandboxNetworkProvider: strictEnum(
    "ASHLEY_SANDBOX_NETWORK_PROVIDER",
    ["unavailable", "none"],
    "unavailable",
  ),
  // Broker trust anchors and policy artifacts (paths only; never keys).
  sandboxPolicyArtifactPath: strictTrimmed(
    "ASHLEY_SANDBOX_POLICY_ARTIFACT",
    "",
  ),
  sandboxPolicySignaturePath: strictTrimmed(
    "ASHLEY_SANDBOX_POLICY_SIGNATURE",
    "",
  ),
  sandboxOwnerPublicKeyPath: strictTrimmed(
    "ASHLEY_SANDBOX_OWNER_PUBLIC_KEY",
    join(sandboxKeysDir, `${sandboxOwnerKeyId}.pub`),
  ),
  sandboxContinuityPublicKeyPath: strictTrimmed(
    "ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY",
    join(sandboxKeysDir, `${sandboxContinuityKeyId}.pub`),
  ),
  // Delegated runtime signing key custody material; the signer is injected
  // with material, never reading these paths itself.
  sandboxDelegatedKeyEncPath: strictTrimmed(
    "ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH",
    join(sandboxKeysDir, "delegated-runtime.key.enc"),
  ),
  sandboxDelegatedKeyId: strictTrimmed(
    "ASHLEY_SANDBOX_DELEGATED_KEY_ID",
    DELEGATED_RUNTIME_KEY_ID,
  ),
  // Broker-side session capability signing key. The broker owns generation;
  // the agent only pins the expected key id and custody location.
  sandboxCapabilityKeyEncPath: strictTrimmed(
    "ASHLEY_SANDBOX_CAPABILITY_KEY_ENC_PATH",
    join(sandboxKeysDir, "broker-session-capability.key.enc"),
  ),
  sandboxCapabilityKeyId: strictTrimmed(
    "ASHLEY_SANDBOX_CAPABILITY_KEY_ID",
    CAPABILITY_SIGNING_KEY_ID,
  ),
  sandboxStateRoot: strictTrimmed(
    "ASHLEY_SANDBOX_STATE_ROOT",
    join(homedir(), ".composer-assistant", "sandbox", "state"),
  ),
  sandboxWorkspaceRoot: strictTrimmed(
    "ASHLEY_SANDBOX_WORKSPACE_ROOT",
    join(homedir(), ".composer-assistant", "sandbox", "workspace"),
  ),
  sandboxMaxConcurrentTasks: numericEnv(
    "ASHLEY_SANDBOX_MAX_CONCURRENT_TASKS",
    1,
    1,
    16,
    true,
  ),
};

function sandboxIsActive(): boolean {
  return env.sandboxBrokerEnabled || env.sandboxLifecycle !== "disabled";
}

function sandboxReadinessErrors(): string[] {
  const errors: string[] = [];
  if (env.sandboxBrokerSocket.length === 0) {
    errors.push("ASHLEY_SANDBOX_BROKER_SOCKET must be set when the sandbox is enabled");
  }
  const missingKeys: string[] = [];
  const owner = env.sandboxOwnerApprovalKeyEncPath;
  const continuity = env.sandboxContinuityKeyEncPath;
  const passphrase = env.sandboxKeyPassphrasePath;
  if (!existsSync(owner)) missingKeys.push(`owner approval key (${owner})`);
  if (!existsSync(join(sandboxKeysDir, `${sandboxOwnerKeyId}.pub`))) {
    missingKeys.push(
      `owner approval public key (${join(sandboxKeysDir, `${sandboxOwnerKeyId}.pub`)})`,
    );
  }
  if (!existsSync(continuity)) {
    missingKeys.push(`continuity tombstone key (${continuity})`);
  }
  if (!existsSync(join(sandboxKeysDir, `${sandboxContinuityKeyId}.pub`))) {
    missingKeys.push(
      `continuity tombstone public key (${join(sandboxKeysDir, `${sandboxContinuityKeyId}.pub`)})`,
    );
  }
  if (!existsSync(passphrase)) missingKeys.push(`master passphrase (${passphrase})`);
  if (missingKeys.length > 0) {
    errors.push(`sandbox signing keys incomplete: ${missingKeys.join(", ")}`);
  }
  if (env.sandboxPolicyArtifactPath === "") {
    errors.push("ASHLEY_SANDBOX_POLICY_ARTIFACT must be set when the sandbox is enabled");
  } else if (!existsSync(env.sandboxPolicyArtifactPath)) {
    errors.push(`sandbox policy artifact not found (${env.sandboxPolicyArtifactPath})`);
  }
  if (env.sandboxPolicySignaturePath === "") {
    errors.push("ASHLEY_SANDBOX_POLICY_SIGNATURE must be set when the sandbox is enabled");
  } else if (!existsSync(env.sandboxPolicySignaturePath)) {
    errors.push(`sandbox policy signature not found (${env.sandboxPolicySignaturePath})`);
  }
  if (!existsSync(env.sandboxOwnerPublicKeyPath)) {
    errors.push(`sandbox owner public key not found (${env.sandboxOwnerPublicKeyPath})`);
  }
  if (!existsSync(env.sandboxContinuityPublicKeyPath)) {
    errors.push(
      `sandbox continuity public key not found (${env.sandboxContinuityPublicKeyPath})`,
    );
  }
  if (!existsSync(env.sandboxDelegatedKeyEncPath)) {
    errors.push(
      `delegated runtime key not found (${env.sandboxDelegatedKeyEncPath})`,
    );
  }
  return errors;
}

export function validateBoot(): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors = [...bootErrors];
  const warnings = [...numericWarnings];
  if (sandboxIsActive()) {
    errors.push(...sandboxReadinessErrors());
  }
  if (env.sandboxDelegatedEnabled && env.sandboxBrokerSocket.trim().length === 0) {
    errors.push(
      "ASHLEY_SANDBOX_BROKER_SOCKET must be set when ASHLEY_SANDBOX_DELEGATED_ENABLED is true",
    );
  }
  if (
    env.sandboxLifecycle !== "disabled" &&
    !env.sandboxBrokerEnabled
  ) {
    warnings.push(
      `ASHLEY_SANDBOX_LIFECYCLE is ${env.sandboxLifecycle} but ASHLEY_SANDBOX_BROKER_ENABLED is not true — broker IPC stays off`,
    );
  }
  if (!env.mistralApiKey) {
    warnings.push("MISTRAL_API_KEY missing — agent will run offline");
  }
  if (!env.memoryOwnerId) {
    warnings.push(
      "MEMORY_OWNER_ID / DISCORD_OWNER_ID missing — set owner for nuclear memory",
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}
