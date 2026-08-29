export type KernelMode = "legacy" | "shadow" | "v021";

export const ARCHITECTURE_EPOCH = "v0.2.1" as const;
export const IMPLEMENTATION_SPEC_VERSION = "0.2.1.r5" as const;
export const THOUGHT_CONTRACT_VERSION = 1 as const;
export const COGNITIVE_SIDECAR_SCHEMA_VERSION = 1 as const;
export const SETTLEMENT_SCHEMA_VERSION = 1 as const;
export const OUTBOX_BRIDGE_VERSION = 1 as const;
export const LEGACY_IMPORT_TOOL_VERSION = 1 as const;
export const MAX_AUTHORITY_REVISIONS = 2 as const;
export const MAX_THOUGHT_PASSES = 6 as const;
export const MAX_THOUGHT_MODEL_ATTEMPTS = 12 as const;
export const PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR = 12 as const;
export const PRIVATE_THOUGHT_MAX_CONCURRENT = 1 as const;
export const PRIVATE_SUBSCRIPTION_ITEMS_PER_IDLE = 4 as const;
export const MAX_OBSERVATION_ROUNDS = 4 as const;
export const MAX_EFFECT_ROUNDS = 4 as const;
export const DEFAULT_LAST_N_TURNS = 12 as const;
export const DEFAULT_OCCUPANCY_COMPACT_K = 8 as const;
export const DEFAULT_IDLE_TICK_MS = 60_000 as const;
export const DEFAULT_MAX_SUBSCRIPTIONS = 16 as const;
export const DEFAULT_MISS_ROUND_CAP = 1 as const;
export const DEFAULT_TOOL_CYCLE_LEASE_MS = 120_000 as const;
export const ORDINARY_THOUGHT_BUDGET_MS = 6_000 as const;

export const THOUGHT_UNAVAILABLE_NOTICE =
  "[system] Thought did not complete. Please send the message again." as const;
