import type { DatabaseSync } from "node:sqlite";
import type { ProjectionInspection } from "./types.js";

function parseArray(value: unknown): unknown[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "{}"));
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object" && parsed !== null && "items" in parsed) {
      const items = (parsed as { items?: unknown }).items;
      return Array.isArray(items) ? items : [];
    }
  } catch {
    /* A malformed diagnostic row is reported as empty, never as prompt text. */
  }
  return [];
}

function parseObject(value: unknown): unknown[] {
  return parseArray(value);
}

/** Owner-diagnostic projection of an allocation receipt; never returns prompt bodies. */
export function inspectAllocation(
  db: DatabaseSync,
  receiptId: string,
): ProjectionInspection {
  const row = db.prepare(
    `SELECT receipt_id, request_id, owner_id, purpose,
            route_policy_snapshot_id, route_id, profile_id, profile_version,
            profile_fingerprint, provider_adapter_class, egress_approval_ref,
            route_class, policy_id, policy_version, projection_id, content_binding,
            included_json, omitted_json, truncated_json, compressed_json,
            degradation_json, same_snapshot_id, capability_mode, created_at
     FROM context_allocation_receipts WHERE receipt_id = ?`,
  ).get(receiptId) as Record<string, unknown> | undefined;
  if (!row) throw new Error("context_allocation_receipt_not_found");
  return {
    receiptId: String(row.receipt_id),
    requestId: String(row.request_id),
    ownerId: String(row.owner_id),
    purpose: String(row.purpose),
    route: {
      routePolicySnapshotId: String(row.route_policy_snapshot_id),
      routeId: String(row.route_id) as ProjectionInspection["route"]["routeId"],
      routeClass: String(row.route_class) as ProjectionInspection["route"]["routeClass"],
      provider: String(row.provider_adapter_class).replace(/-adapter$/, ""),
      adapterClass: String(row.provider_adapter_class),
      profileId: String(row.profile_id),
      profileVersion: Number(row.profile_version),
      profileFingerprint: String(row.profile_fingerprint),
    },
    policyId: String(row.policy_id),
    policyVersion: Number(row.policy_version),
    projectionId: String(row.projection_id),
    contentBinding: String(row.content_binding),
    included: parseObject(row.included_json),
    omitted: parseObject(row.omitted_json),
    truncated: parseObject(row.truncated_json),
    compressed: parseObject(row.compressed_json),
    degradation: parseArray(row.degradation_json).map(String),
    sameSnapshotId: typeof row.same_snapshot_id === "string" ? row.same_snapshot_id : null,
    capabilityMode: String(row.capability_mode) as ProjectionInspection["capabilityMode"],
    createdAt: String(row.created_at),
  };
}

export const getContextAllocationInspection = inspectAllocation;
