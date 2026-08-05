import type {
  ProviderId,
  QuotaBucket,
  RouteBinding,
  RouteId,
} from "./types.js";
import { quotaBucketFor } from "./types.js";
import { AppError } from "../../errors.js";

/**
 * Static route registry (Wave 1). Model IDs and lifecycle values will be
 * loaded from the versioned config in Wave 1 commit 3; this table is the
 * fallback source of truth until then and must stay in sync with
 * config/models.json.
 */
export const ROUTE_BINDINGS: readonly RouteBinding[] = [
  {
    route: "ashley_expression",
    provider: "mistral",
    configuredModelId: "mistral-medium-latest",
    contextProfile: "full_expression",
    enabled: true,
  },
  {
    route: "ashley_expression_fallback",
    provider: "groq",
    configuredModelId: "llama-3.3-70b-versatile",
    contextProfile: "minimal_expression_identity",
    enabled: true,
  },
  {
    route: "thought",
    provider: "groq",
    configuredModelId: "openai/gpt-oss-120b",
    contextProfile: "thought_summary",
    enabled: true,
  },
  {
    route: "utility_bulk",
    provider: "groq",
    configuredModelId: "openai/gpt-oss-20b",
    contextProfile: "utility_redacted",
    enabled: true,
  },
  {
     route: "sandbox_operator_light",
     provider: "groq",
     configuredModelId: "openai/gpt-oss-20b",
     contextProfile: "sandbox_project_only",
     enabled: false,
  },
  {
     route: "sandbox_operator_deep",
     provider: "groq",
     configuredModelId: "openai/gpt-oss-120b",
     contextProfile: "sandbox_project_only",
     enabled: false,
  },
  {
    route: "sandbox_reviewer",
    provider: "nim",
    configuredModelId: "nvidia/nemotron-3-ultra-550b-a55b",
    contextProfile: "experimental_internal_project",
    enabled: false,
  },
  {
    route: "experimental_auditor",
    provider: "nim",
    configuredModelId: "nvidia/nemotron-3-ultra-550b-a55b",
    contextProfile: "experimental_internal_project",
    enabled: false,
  },
  {
    route: "experimental_multimodal",
    provider: "nim",
    configuredModelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    contextProfile: "experimental_public",
    enabled: false,
  },
];

const BY_ROUTE = new Map<RouteId, RouteBinding>(
  ROUTE_BINDINGS.map((binding) => [binding.route, binding]),
);

export function routeBinding(route: RouteId): RouteBinding {
  const binding = BY_ROUTE.get(route);
  if (!binding) {
    throw new AppError("route_disabled", `unknown_route:${route}`, 404);
  }
  return binding;
}

export function bucketForRoute(route: RouteId): QuotaBucket {
  const binding = routeBinding(route);
  return quotaBucketFor(binding.provider, binding.configuredModelId);
}

export function providersInUse(): ProviderId[] {
  return Array.from(new Set(ROUTE_BINDINGS.map((binding) => binding.provider)));
}
