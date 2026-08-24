import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../../env.js";
import { AppError } from "../../errors.js";
import { ROUTE_BINDINGS, routeBinding } from "./registry.js";
import type {
  ContextProfile,
  ProviderId,
  QuotaBucket,
  RouteBinding,
  RouteId,
} from "./types.js";

export type QuotaContract = {
  rps: number;
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number;
};

export type RouteRecord = {
  route: RouteId;
  provider: ProviderId;
  configuredModelId: string;
  contextProfile: ContextProfile;
  enabled: boolean;
  quotaContract: QuotaContract | "env";
};

const DEFAULT_MODELS_PATH = join(process.cwd(), "config", "models.json");

/** @internal Exported for tests. */
export function loadRouteRecords(): RouteRecord[] {
  const configured = loadConfiguredRoutes();
  if (configured) return configured;
  return ROUTE_BINDINGS.map((b) => ({
    route: b.route,
    provider: b.provider,
    configuredModelId: b.configuredModelId,
    contextProfile: b.contextProfile,
    enabled: b.enabled,
    quotaContract: contractForProvider(b.provider),
  }));
}

function contractForProvider(provider: ProviderId): QuotaContract | "env" {
  switch (provider) {
    case "mistral":
      return "env";
    case "groq":
      return { rps: 40, rpm: 3600, rpd: 3600, tpm: 8000, tpd: 80000 };
    case "nim":
      return { rps: 30, rpm: 600, rpd: 600, tpm: 16000, tpd: 120000 };
    default:
      return "env";
  }
}

type RawRoute = {
  provider?: string;
  configured_model_id?: string;
  context_profile?: string;
  enabled?: boolean;
  quota_contract?: QuotaContract | "env";
};

type RawConfig = {
  version?: number;
  purpose_routes?: Record<string, string>;
  routes?: Record<string, RawRoute>;
};

function loadConfiguredRoutes(): RouteRecord[] | undefined {
  const file =
    process.env.ASHLEY_MODELS_CONFIG ?? DEFAULT_MODELS_PATH;
  if (!existsSync(file)) return undefined;
  try {
    const raw = JSON.parse(
      readFileSync(file, "utf-8"),
    ) as RawConfig;
    if (!raw.routes) return undefined;
    const records: RouteRecord[] = [];
    for (const [route, rawRoute] of Object.entries(raw.routes)) {
      const provider = rawRoute.provider as ProviderId | undefined;
      if (!provider) continue;
      records.push({
        route: route as RouteId,
        provider,
        configuredModelId:
          rawRoute.configured_model_id ?? defaultModelId(provider),
        contextProfile:
          (rawRoute.context_profile as ContextProfile | undefined) ??
          defaultContextProfile(provider),
        enabled: rawRoute.enabled ?? true,
        quotaContract:
          rawRoute.quota_contract === "env"
            ? "env"
            : rawRoute.quota_contract ?? contractForProvider(provider),
      });
    }
    return records;
  } catch {
    return undefined;
  }
}

function defaultModelId(provider: ProviderId): string {
  switch (provider) {
    case "mistral":
      return env.mistralModel;
    case "groq":
      return "openai/gpt-oss-20b";
    case "nim":
      return "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
    default:
      return "";
  }
}

function defaultContextProfile(provider: ProviderId): ContextProfile {
  if (provider === "mistral") return "full_expression";
  if (provider === "groq") return "utility_redacted";
  return "experimental_internal_project";
}

const PURPOSE_TO_ROUTE: Partial<Record<string, RouteId>> = {
  expression: "ashley_expression",
  thought: "thought",
  thought_observation: "utility_bulk",
  exchange_cognition: "utility_bulk",
  curiosity_consolidation: "utility_bulk",
  maintenance: "utility_bulk",
};

export function resolveRoute(
  purpose: string,
  opts: { modelAlias?: string } = {},
): RouteBinding {
  const routeId = PURPOSE_TO_ROUTE[purpose as keyof typeof PURPOSE_TO_ROUTE];
  if (!routeId) {
    throw new Error(`unknown_purpose_for_route:${purpose}`);
  }
  // Enforce route lifecycle before adapter selection / quota reservation.
  return requireRouteEnabled(routeId);
}

export function disabledRouteError(route: RouteId): AppError {
  if (route.startsWith("sandbox_") || route.startsWith("experimental_")) {
    return new AppError("operator_disabled", `route disabled: ${route}`, 503);
  }
  return new AppError("route_disabled", `route disabled: ${route}`, 404);
}

export function requireRouteEnabled(route: RouteId): RouteBinding {
  const binding = routeBinding(route);
  const records = loadRouteRecords();
  const matched = records.find((r) => r.route === route);
  const enabled = matched ? matched.enabled : binding.enabled;
  if (!enabled) {
    throw disabledRouteError(route);
  }
  return binding;
}

function providerKeyPresent(provider: ProviderId): boolean {
  switch (provider) {
    case "mistral":
      return Boolean(env.mistralApiKey);
    case "groq":
      return Boolean(env.groqApiKey);
    case "nim":
      return Boolean(env.nimApiKey);
    default:
      return false;
  }
}

/**
 * Canonical non-throwing route readiness check. A route is ready when it is
 * enabled (configured record, else static binding) AND the provider actually
 * bound to that route has its credential present. Cognition phases request a
 * semantic route ("thought") and defer provider-specific readiness to the
 * routing layer instead of hardcoding a provider.
 */
export function routeReady(route: RouteId): boolean {
  try {
    const binding = routeBinding(route);
    const records = loadRouteRecords();
    const matched = records.find((r) => r.route === route);
    const enabled = matched ? matched.enabled : binding.enabled;
    if (!enabled) return false;
    const provider = matched ? matched.provider : binding.provider;
    if (providerKeyPresent(provider)) return true;
    if (route === "thought" && provider === "nim" && providerKeyPresent("groq")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function routeForBucket(bucket: QuotaBucket): RouteRecord | undefined {
  const parts = bucket.split(":");
  const provider = parts[0] as ProviderId | undefined;
  const model = parts[1];
  if (!provider) return undefined;
  const records = loadRouteRecords();
  return records.find(
    (r) => r.provider === provider && r.configuredModelId === model,
  );
}

export function quotaContractFor(bucket: QuotaBucket): QuotaContract {
  const record = routeForBucket(bucket);
  if (record && record.quotaContract !== "env") {
    return record.quotaContract;
  }
  // Mistral (and any env-driven bucket) derive limits from env.
  const rps = env.mistralRequestsPerSecond;
  return {
    rps,
    rpm: rps * 60,
    rpd: rps * 3600,
    tpm: env.mistralTokensPerMinute,
    tpd: env.mistralTokensPerMinute * 60,
  };
}
