import type { DatabaseSync } from "node:sqlite";
import { canonicalize } from "./canonical-json.js";
import { allowlistedRows, pragmaUserVersion, tableColumns, tableExists } from "./sqlite.js";
import { fieldDayWindow } from "./field-day.js";
import type {
  EvidenceExtraction,
  EvidenceProjection,
  FieldDayWindow,
  Identity,
  IdentityExtraction,
  JsonObject,
  SurfaceReport,
  SurfaceTableStatus,
} from "./types.js";

const IDENTITY_TABLES = [
  "capability_contracts",
  "capability_releases",
  "memory_contract_state",
  "memory_evidence_qualification_epochs",
  "recall_qualification_epochs",
  "recall_live_cutovers",
  "continuity_meta",
  "lineage_state",
  "runtime_sessions",
] as const;

function emptySurface(): SurfaceReport {
  return { tables: {}, used: [], failed: [] };
}

function markTable(surface: SurfaceReport, db: DatabaseSync | null, table: string): void {
  if (!db) {
    surface.tables[table] = "schema_surface_absent";
    return;
  }
  surface.tables[table] = tableExists(db, table) ? "present" : "schema_surface_absent";
}

function markDb(surface: SurfaceReport, db: DatabaseSync | null, name: string): void {
  if (db) surface.used.push(name);
  else surface.failed.push({ name, error_class: "source_missing", state: "UNKNOWN" });
}

function mergeSurfaces(...reports: SurfaceReport[]): SurfaceReport {
  const merged = emptySurface();
  for (const report of reports) {
    for (const [table, status] of Object.entries(report.tables)) {
      if (merged.tables[table] === "present" || status === "present") merged.tables[table] = "present";
      else if (merged.tables[table] == null) merged.tables[table] = status;
    }
    merged.used.push(...report.used);
    merged.failed.push(...report.failed);
  }
  merged.used = [...new Set(merged.used)].sort();
  merged.failed.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return merged;
}

function stringValue(value: unknown): string | "UNKNOWN" {
  return typeof value === "string" && value.trim() !== "" ? value : "UNKNOWN";
}

function numberValue(value: unknown): number | "UNKNOWN" {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : "UNKNOWN";
}

function rowValue(row: Record<string, unknown> | undefined, key: string): unknown {
  return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
}

function cleanRow(row: Record<string, unknown>): JsonObject {
  const output = { ...row };
  delete output.data_classification;
  return output as JsonObject;
}

function readRows(
  db: DatabaseSync | null,
  surface: SurfaceReport,
  table: string,
  fields: string[],
  options: { orderBy?: string; limit?: number } = {},
): JsonObject[] {
  markTable(surface, db, table);
  if (!db || !tableExists(db, table)) return [];
  try {
    return allowlistedRows(db, table, fields, options)
      .filter((row) => row.data_classification !== "secret")
      .map(cleanRow)
      .sort((a, b) => {
        const left = canonicalize(a);
        const right = canonicalize(b);
        return left < right ? -1 : left > right ? 1 : 0;
      });
  } catch {
    surface.tables[table] = "query_failed";
    surface.failed.push({ name: table, error_class: "query_failed", state: "UNKNOWN" });
    return [];
  }
}

function inWindow(value: unknown, window: FieldDayWindow): boolean {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return !Number.isNaN(milliseconds) && milliseconds >= window.start.getTime() && milliseconds < window.end.getTime();
}

function rowsInWindow(
  db: DatabaseSync | null,
  surface: SurfaceReport,
  table: string,
  fields: string[],
  window: FieldDayWindow,
): JsonObject[] {
  const rows = readRows(db, surface, table, fields);
  return rows.filter((row) => inWindow(row.created_at ?? row.occurred_at ?? row.started_at, window));
}

function latestReleaseRows(db: DatabaseSync | null, surface: SurfaceReport): JsonObject[] {
  const rows = readRows(
    db,
    surface,
    "capability_releases",
    [
      "capability",
      "release_id",
      "state",
      "eval_seed_count",
      "qualified_at",
      "promoted_at",
      "rolled_back_at",
      "failure_kind",
      "updated_at",
      "contract_id",
      "build_identity",
      "model_epoch",
      "data_classification",
    ],
    { orderBy: "updated_at" },
  );
  return rows.sort((a, b) => {
    const left = String(a.updated_at ?? "");
    const right = String(b.updated_at ?? "");
    return right < left ? -1 : right > left ? 1 : 0;
  });
}

function selectCurrent(rows: JsonObject[], capability?: string): JsonObject | undefined {
  return rows.find((row) => capability == null || row.capability === capability);
}

function continuityLineage(
  continuity: DatabaseSync | null,
  surface: SurfaceReport,
): { row: JsonObject | null | "UNKNOWN"; build: string | "UNKNOWN"; lineage: string | "UNKNOWN"; sourceSha: string | "UNKNOWN" } {
  const rows = readRows(
    continuity,
    surface,
    "lineage_state",
    ["lineage_id", "nuclear_schema_version", "build_identity", "updated_at", "runtime_source_sha", "source_sha", "cognition_mode", "data_classification"],
    { orderBy: "updated_at", limit: 1 },
  );
  let row = rows[0];
  if (!row && continuity && tableExists(continuity, "runtime_sessions")) {
    const sessionRows = readRows(
      continuity,
      surface,
      "runtime_sessions",
      ["lineage_id", "build_identity", "last_seen_at", "runtime_source_sha", "source_sha", "cognition_mode", "data_classification"],
      { orderBy: "last_seen_at", limit: 1 },
    );
    row = sessionRows[0];
  }
  return {
    row: row ?? (continuity && tableExists(continuity, "lineage_state") ? null : "UNKNOWN"),
    build: stringValue(rowValue(row, "build_identity")),
    lineage: stringValue(rowValue(row, "lineage_id")),
    sourceSha: stringValue(rowValue(row, "runtime_source_sha") ?? rowValue(row, "source_sha")),
  };
}

function activeContractId(nuclear: DatabaseSync | null, surface: SurfaceReport, releases: JsonObject[]): string | "UNKNOWN" {
  const rows = readRows(
    nuclear,
    surface,
    "capability_contracts",
    ["contract_id", "active", "created_at", "data_classification"],
    { orderBy: "created_at" },
  );
  const active = rows.find((row) => row.active === 1 || row.active === true);
  if (typeof active?.contract_id === "string" && active.contract_id !== "") return active.contract_id;
  const releaseContract = releases.find((row) => typeof row.contract_id === "string" && row.contract_id !== "");
  return typeof releaseContract?.contract_id === "string" ? releaseContract.contract_id : "UNKNOWN";
}

function currentEpoch(
  db: DatabaseSync | null,
  surface: SurfaceReport,
  table: string,
  fields: string[],
): { id: string | "UNKNOWN"; rows: JsonObject[] } {
  const rows = readRows(db, surface, table, fields, { orderBy: "started_at" });
  if (!db || !tableExists(db, table)) return { id: "UNKNOWN", rows };
  const current = rows.find((row) => row.status === "current");
  return {
    id: typeof current?.epoch_id === "string" ? current.epoch_id : "no_current_epoch",
    rows,
  };
}

function readMemoryContract(
  nuclear: DatabaseSync | null,
  surface: SurfaceReport,
): { row: JsonObject | null | "UNKNOWN"; currentness: string | "UNKNOWN"; c1Version: number | "UNKNOWN"; cutover: string | null | "UNKNOWN" } {
  const rows = readRows(
    nuclear,
    surface,
    "memory_contract_state",
    ["id", "c1_contract_version", "currentness_authority", "cutover_at", "applied_c1_authority_exists", "correction_seq", "data_classification"],
    { limit: 1 },
  );
  if (!nuclear || !tableExists(nuclear, "memory_contract_state")) {
    return { row: "UNKNOWN", currentness: "UNKNOWN", c1Version: "UNKNOWN", cutover: "UNKNOWN" };
  }
  const row = rows[0] ?? null;
  return {
    row,
    currentness: stringValue(rowValue(row, "currentness_authority")),
    c1Version: numberValue(rowValue(row, "c1_contract_version")),
    cutover: row && row.cutover_at != null ? stringValue(row.cutover_at) : null,
  };
}

function readRecallCutover(
  nuclear: DatabaseSync | null,
  surface: SurfaceReport,
  releaseId: string | "UNKNOWN",
): { present: true | "recall_cutoff_missing" | "UNKNOWN"; messageId: number | string | null | "UNKNOWN"; rows: JsonObject[] } {
  const rows = readRows(
    nuclear,
    surface,
    "recall_live_cutovers",
    ["owner_id", "capability", "release_id", "cutoff_message_id", "authorized_by", "contract_id", "build_identity", "created_at", "data_classification"],
    { orderBy: "created_at" },
  );
  if (!nuclear || !tableExists(nuclear, "recall_live_cutovers")) {
    return { present: "UNKNOWN", messageId: "UNKNOWN", rows };
  }
  const matches = rows
    .filter((row) => row.capability === "recall" && (releaseId === "UNKNOWN" || row.release_id === releaseId))
    .sort((a, b) => {
      const left = String(a.created_at ?? "");
      const right = String(b.created_at ?? "");
      return left < right ? -1 : left > right ? 1 : 0;
    });
  const row = matches[matches.length - 1];
  if (!row) return { present: "recall_cutoff_missing", messageId: null, rows: [] };
  const id = row.cutoff_message_id;
  return {
    present: true,
    messageId: typeof id === "number" || typeof id === "string" ? id : "UNKNOWN",
    rows: [row],
  };
}

function cognitionMode(continuity: DatabaseSync | null, surface: SurfaceReport): string | "UNKNOWN" {
  const rows = readRows(continuity, surface, "runtime_sessions", ["cognition_mode", "last_seen_at", "data_classification"], { orderBy: "last_seen_at", limit: 1 });
  return stringValue(rowValue(rows[0], "cognition_mode"));
}

export function extractIdentity(input: {
  nuclear: DatabaseSync | null;
  continuity: DatabaseSync | null;
  checkoutSha: string | "UNKNOWN";
  fieldDay: string;
}): IdentityExtraction {
  const surfaces = emptySurface();
  markDb(surfaces, input.nuclear, "nuclear_snapshot");
  markDb(surfaces, input.continuity, "continuity_snapshot");
  for (const table of IDENTITY_TABLES) {
    markTable(surfaces, input.nuclear, table);
  }
  const nuclearSchemaVersion = input.nuclear ? pragmaUserVersion(input.nuclear) : "UNKNOWN";
  const continuitySchemaVersion = input.continuity ? pragmaUserVersion(input.continuity) : "UNKNOWN";
  const releases = latestReleaseRows(input.nuclear, surfaces);
  const lineage = continuityLineage(input.continuity, surfaces);
  const contractId = activeContractId(input.nuclear, surfaces, releases);
  const memoryContract = readMemoryContract(input.nuclear, surfaces);
  const c1 = currentEpoch(input.nuclear, surfaces, "memory_evidence_qualification_epochs", ["epoch_id", "status", "contract_id", "started_build_identity", "started_at", "retired_at", "eval_seed_count", "qualified_at", "sealed_at", "blocked_at", "block_code", "data_classification"]);
  const recall = currentEpoch(input.nuclear, surfaces, "recall_qualification_epochs", ["epoch_id", "status", "contract_id", "started_build_identity", "started_at", "retired_at", "eval_seed_count", "qualified_at", "model_epoch", "data_classification"]);
  const recallRelease = selectCurrent(releases, "recall");
  const cutoff = readRecallCutover(input.nuclear, surfaces, stringValue(rowValue(recallRelease, "release_id")));
  const identity: Identity = {
    checkoutSha: input.checkoutSha,
    runtimeBuildIdentity: lineage.build,
    runtimeSourceSha: lineage.sourceSha,
    buildIdentity: lineage.build,
    contractId,
    nuclearSchemaVersion,
    continuitySchemaVersion,
    lineageId: lineage.lineage,
    memoryEvidenceState: stringValue(rowValue(selectCurrent(releases, "memory_evidence"), "state")),
    recallState: stringValue(rowValue(recallRelease, "state")),
    currentnessAuthority: memoryContract.currentness,
    c1ContractVersion: memoryContract.c1Version,
    cutoverAt: memoryContract.cutover,
    c1EpochId: c1.id,
    recallEpochId: recall.id,
    recallCutoffPresent: cutoff.present,
    recallCutoffMessageId: cutoff.messageId,
    cognitionMode: cognitionMode(input.continuity, surfaces),
    fieldDay: input.fieldDay,
  };
  return { identity, surfaces };
}

function asWindow(input: FieldDayWindow | string): FieldDayWindow {
  return typeof input === "string" ? fieldDayWindow(input) : input;
}

export function extractEvidence(input: {
  nuclear: DatabaseSync | null;
  continuity: DatabaseSync | null;
  window: FieldDayWindow | string;
}): EvidenceExtraction {
  const window = asWindow(input.window);
  const surfaces = emptySurface();
  markDb(surfaces, input.nuclear, "nuclear_snapshot");
  markDb(surfaces, input.continuity, "continuity_snapshot");
  const releases = latestReleaseRows(input.nuclear, surfaces);
  const contract = readMemoryContract(input.nuclear, surfaces);
  const c1Epochs = readRows(input.nuclear, surfaces, "memory_evidence_qualification_epochs", ["epoch_id", "status", "predecessor_epoch_id", "contract_id", "started_build_identity", "started_at", "retired_at", "eval_seed_count", "qualified_at", "sealed_at", "sealed_release_id", "blocked_at", "block_code", "block_source_key", "data_classification"]);
  const recallEpochs = readRows(input.nuclear, surfaces, "recall_qualification_epochs", ["epoch_id", "status", "predecessor_epoch_id", "contract_id", "started_build_identity", "started_at", "retired_at", "eval_seed_count", "qualified_at", "model_epoch", "data_classification"]);
  const recallRelease = selectCurrent(releases, "recall");
  const cutoff = readRecallCutover(input.nuclear, surfaces, stringValue(rowValue(recallRelease, "release_id")));
  const evidence: EvidenceProjection = {
    decision_log: rowsInWindow(input.nuclear, surfaces, "decision_log", ["id", "channel", "trigger", "decision_kind", "created_at", "completion", "uncertainty", "urgency", "thought_source", "data_classification"], window),
    capability_releases: releases,
    capability_events: rowsInWindow(input.nuclear, surfaces, "capability_events", ["id", "capability", "release_id", "kind", "source_key", "occurred_at", "contract_id", "build_identity", "model_epoch", "data_classification"], window),
    memory_contract_state: contract.row,
    memory_corrections: rowsInWindow(input.nuclear, surfaces, "memory_corrections", ["correction_id", "owner_id", "lifecycle_status", "created_at", "updated_at", "data_classification"], window),
    memory_correction_targets: rowsInWindow(input.nuclear, surfaces, "memory_correction_targets", ["correction_id", "target_type", "target_id", "action", "created_at", "data_classification"], window),
    memory_deny_barriers: rowsInWindow(input.nuclear, surfaces, "memory_deny_barriers", ["barrier_id", "correction_id", "lifecycle_status", "created_at", "released_at", "data_classification"], window),
    memory_deny_barrier_members: rowsInWindow(input.nuclear, surfaces, "memory_deny_barrier_members", ["barrier_id", "entity_type", "entity_id", "created_at", "data_classification"], window),
    memory_correction_receipts: rowsInWindow(input.nuclear, surfaces, "memory_correction_receipts", ["receipt_id", "correction_id", "lifecycle_status", "created_at", "data_classification"], window),
    memory_correction_outcomes: rowsInWindow(input.nuclear, surfaces, "memory_correction_outcomes", ["outcome_id", "correction_id", "lifecycle_status", "created_at", "data_classification"], window),
    memory_reconciliation_requests: rowsInWindow(input.nuclear, surfaces, "memory_reconciliation_requests", ["request_id", "correction_id", "lifecycle_status", "created_at", "data_classification"], window),
    memory_evidence_qualification_epochs: c1Epochs,
    memory_evidence_qualification_events: rowsInWindow(input.nuclear, surfaces, "memory_evidence_qualification_events", ["epoch_id", "kind", "source_key", "decision_class", "qualifies", "trigger", "source_count", "occurred_at", "contract_id", "build_identity", "data_classification"], window),
    recall_qualification_epochs: recallEpochs,
    recall_qualification_events: rowsInWindow(input.nuclear, surfaces, "recall_qualification_events", ["id", "epoch_id", "kind", "source_key", "occurred_at", "build_identity", "model_epoch", "data_classification"], window),
    recall_live_cutovers: cutoff.rows,
    continuity_lineage: continuityLineage(input.continuity, surfaces).row,
    continuity_sessions: rowsInWindow(input.continuity, surfaces, "runtime_sessions", ["session_id", "started_at", "last_seen_at", "clean_shutdown_at", "build_identity", "nuclear_schema_version", "lineage_id", "data_classification"], window),
  };
  return { evidence, surfaces };
}

export function mergeEvidenceSurfaces(...reports: SurfaceReport[]): SurfaceReport {
  return mergeSurfaces(...reports);
}

export function surfaceStatusForTable(status: SurfaceTableStatus | undefined): SurfaceTableStatus | "schema_surface_absent" {
  return status ?? "schema_surface_absent";
}
