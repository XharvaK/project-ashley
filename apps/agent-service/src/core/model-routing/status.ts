import type { DatabaseSync } from "node:sqlite";
import { loadRouteRecords, quotaContractFor } from "./router.js";
import type { QuotaContract, RouteRecord } from "./router.js";
import { quotaBucketFor } from "./types.js";
import { currentTpmUsage } from "../attention/ledger.js";
import { realClock } from "../attention/types.js";
import type {
  ProviderId,
  QuotaBucket,
} from "./types.js";

export type RoutingHealth = "ok" | "degraded" | "disabled" | "unused";

export type RoutingRouteStatus = {
  route: string;
  provider: ProviderId;
  configuredModelId: string;
  enabled: boolean;
  quotaBucket: QuotaBucket;
  routeAlias: string;
  health: RoutingHealth;
  quota: {
    rps: number;
    tpmLimit: number;
    tpmUsed: number;
    tpmRemaining: number;
  };
  lastSuccessAt: string | null;
  lastErrorClass: string | null;
  lastErrorAt: string | null;
  resolvedModelId: string | null;
};

type SuccessRow = {
  quota_bucket: string;
  ended_at: string;
  resolved_model_id: string | null;
};
type ErrorRow = {
  quota_bucket: string;
  ended_at: string;
  error_class: string;
};

export function routingStatus(db: DatabaseSync): RoutingRouteStatus[] {
  const records = loadRouteRecords();

  const lastSuccessByBucket = new Map<string, { at: string; resolved: string | null }>();
  const lastErrorByBucket = new Map<string, { at: string; cls: string }>();

  const successRows = db
    .prepare(
      `SELECT quota_bucket, ended_at, resolved_model_id
       FROM attention_requests
       WHERE outcome = 'completed'
         AND quota_bucket IS NOT NULL
         AND ended_at IS NOT NULL
       ORDER BY ended_at DESC`,
    )
    .all() as SuccessRow[];
  for (const r of successRows) {
    if (r.quota_bucket && !lastSuccessByBucket.has(r.quota_bucket)) {
      lastSuccessByBucket.set(r.quota_bucket, {
        at: r.ended_at,
        resolved: r.resolved_model_id,
      });
    }
  }

  const errorRows = db
    .prepare(
      `SELECT quota_bucket, ended_at, error_class
       FROM attention_requests
       WHERE outcome IS NOT NULL
         AND outcome != 'completed'
         AND quota_bucket IS NOT NULL
         AND ended_at IS NOT NULL
       ORDER BY ended_at DESC`,
    )
    .all() as ErrorRow[];
  for (const r of errorRows) {
    if (
      r.quota_bucket &&
      !lastErrorByBucket.has(r.quota_bucket) &&
      r.error_class
    ) {
      lastErrorByBucket.set(r.quota_bucket, { at: r.ended_at, cls: r.error_class });
    }
  }

  return records.map((r): RoutingRouteStatus => {
    const bucket = quotaBucketFor(
      r.provider as ProviderId,
      r.configuredModelId,
    ) as QuotaBucket;
    const contract: QuotaContract =
      typeof r.quotaContract === "object"
        ? r.quotaContract
        : quotaContractFor(bucket);
    const tpmUsed = currentTpmUsage(db, realClock, bucket);
    const lastSuccess = lastSuccessByBucket.get(bucket);
    const lastError = lastErrorByBucket.get(bucket);
    let health: RoutingHealth;
    if (!r.enabled) {
      health = "disabled";
    } else if (!lastSuccess && !lastError) {
      health = "unused";
    } else if (lastError && (!lastSuccess || lastError.at > lastSuccess.at)) {
      health = "degraded";
    } else {
      health = "ok";
    }
    return {
      route: r.route,
      provider: r.provider as ProviderId,
      configuredModelId: r.configuredModelId,
      enabled: r.enabled,
      quotaBucket: bucket,
      routeAlias: r.route,
      health,
      quota: {
        rps: contract.rps,
        tpmLimit: contract.tpm,
        tpmUsed,
        tpmRemaining: Math.max(0, contract.tpm - tpmUsed),
      },
      lastSuccessAt: lastSuccess ? lastSuccess.at : null,
      lastErrorClass: lastError ? lastError.cls : null,
      lastErrorAt: lastError ? lastError.at : null,
      resolvedModelId: lastSuccess ? lastSuccess.resolved : null,
    };
  });
}
