import type { DatabaseSync } from "node:sqlite";
import { MIGRATION_24_OPEN_COGNITIVE_WAKE_CURSOR_DDL } from "./migration-24.js";

type TableInfoRow = {
  name?: string;
  notnull?: number;
  dflt_value?: string | null;
  pk?: number;
};

type IndexListRow = {
  name?: string;
  unique?: number;
  partial?: number;
};

type IndexInfoRow = {
  seqno?: number;
  cid?: number;
  name?: string | null;
};

type SqliteMasterRow = {
  type?: string;
  name?: string;
  sql?: string | null;
};

type ColumnSpec = {
  name: string;
  notNull?: boolean;
  defaultValue?: string | null;
  primaryKey?: boolean;
};

type IndexSpec = {
  table: string;
  name: string;
  columns: string[];
  unique?: boolean;
  partial?: boolean;
  sqlFragment?: string;
};

const V23_TABLES = [
  "open_cognitive_items",
  "open_cognitive_item_attention",
  "open_cognitive_item_transitions",
] as const;

const V24_TABLES = [
  "open_cognitive_item_review_cursor",
  "open_cognitive_item_wake_cursor",
] as const;

const V23_COLUMNS: Record<string, ColumnSpec[]> = {
  open_cognitive_items: [
    { name: "id", primaryKey: true },
    { name: "owner_id", notNull: true },
    { name: "entity_uuid", notNull: true },
    { name: "kind", notNull: true },
    { name: "status", notNull: true },
    { name: "semantic_summary", notNull: true },
    { name: "source_type", notNull: true },
    { name: "source_id", notNull: true },
    { name: "source_entity_uuid", notNull: true },
    { name: "semantic_key_hash", notNull: true },
    { name: "source_capability", notNull: true },
    { name: "contract_id", notNull: true },
    { name: "provenance", notNull: true },
    { name: "source_revision", notNull: true, defaultValue: "''" },
    { name: "origin", notNull: true },
    { name: "build_identity", notNull: true },
    { name: "model_epoch", notNull: true, defaultValue: "0" },
    { name: "data_classification", notNull: true, defaultValue: "'never_public'" },
    { name: "status_reason", notNull: true },
    { name: "redacted_at" },
    { name: "redaction_code" },
    { name: "created_at", notNull: true },
    { name: "updated_at", notNull: true },
    { name: "resolved_at" },
  ],
  open_cognitive_item_attention: [
    { name: "item_id", primaryKey: true },
    { name: "delay_class" },
    { name: "defer_until" },
    { name: "last_considered_at" },
    { name: "consideration_count", notNull: true, defaultValue: "0" },
    { name: "last_outcome_code" },
    { name: "review_requested_at" },
    { name: "updated_at", notNull: true },
  ],
  open_cognitive_item_transitions: [
    { name: "id", primaryKey: true },
    { name: "item_id", notNull: true },
    { name: "owner_id", notNull: true },
    { name: "from_status" },
    { name: "to_status", notNull: true },
    { name: "reason", notNull: true },
    { name: "created_at", notNull: true },
  ],
};

const V24_COLUMNS: Record<string, ColumnSpec[]> = {
  open_cognitive_items: [
    { name: "model_identity", notNull: true, defaultValue: "''" },
    { name: "semantic_identity_hash", notNull: true, defaultValue: "''" },
    { name: "continuity_generation", notNull: true, defaultValue: "''" },
  ],
  open_cognitive_item_attention: [
    { name: "review_attempt_count", notNull: true, defaultValue: "0" },
    { name: "review_last_disposition" },
  ],
  open_cognitive_item_review_cursor: [
    { name: "owner_id", notNull: true, primaryKey: true },
    { name: "before_item_id", notNull: true, defaultValue: "0" },
    { name: "updated_at", notNull: true },
  ],
  open_cognitive_item_wake_cursor: [
    { name: "owner_id", notNull: true, primaryKey: true },
    { name: "after_item_id", notNull: true, defaultValue: "0" },
    { name: "updated_at", notNull: true },
  ],
};

const V25_COLUMNS: Record<string, ColumnSpec[]> = {
  attention_requests: [
    { name: "accepted_contract_id" },
    { name: "accepted_build_identity" },
  ],
  open_cognitive_items: [
    { name: "generation_order", notNull: true, defaultValue: "0" },
  ],
};

const V26_TABLES = [
  "recall_qualification_epochs",
  "recall_qualification_events",
] as const;

const V26_COLUMNS: Record<string, ColumnSpec[]> = {
  recall_qualification_epochs: [
    { name: "epoch_id", notNull: true, primaryKey: true },
    { name: "status", notNull: true },
    { name: "start_request_key", notNull: true },
    { name: "predecessor_epoch_id" },
    { name: "contract_id", notNull: true },
    { name: "started_build_identity", notNull: true },
    { name: "created_by", notNull: true },
    { name: "started_at", notNull: true },
    { name: "retired_at" },
    { name: "eval_seed_count", notNull: true, defaultValue: "0" },
    { name: "qualified_at" },
    { name: "model_epoch", notNull: true, defaultValue: "0" },
  ],
  recall_qualification_events: [
    { name: "id", primaryKey: true },
    { name: "epoch_id", notNull: true },
    { name: "kind", notNull: true },
    { name: "source_key", notNull: true },
    { name: "detail_json", notNull: true, defaultValue: "'{}'" },
    { name: "occurred_at", notNull: true },
    { name: "build_identity", notNull: true },
    { name: "model_epoch", notNull: true, defaultValue: "0" },
  ],
};

const V26_INDEXES: IndexSpec[] = [
  {
    table: "recall_qualification_epochs",
    name: "idx_recall_qualification_epochs_single_current",
    columns: ["status"],
    unique: true,
    partial: true,
    sqlFragment: "where status='current'",
  },
  {
    table: "recall_qualification_events",
    name: "idx_recall_qualification_events_epoch",
    columns: ["epoch_id", "kind", "occurred_at"],
  },
];

const V26_TABLE_FRAGMENTS: Record<string, string[]> = {
  recall_qualification_epochs: [
    "check(status in('current','retired'))",
    "check(eval_seed_count>=0)",
  ],
  recall_qualification_events: [
    "references recall_qualification_epochs(epoch_id)",
    "check(kind in('isolated_eval','live_shadow'))",
  ],
};

const V23_INDEXES: IndexSpec[] = [
  {
    table: "open_cognitive_items",
    name: "idx_open_cognitive_items_owner_status",
    columns: ["owner_id", "status", "updated_at", "id"],
  },
  {
    table: "open_cognitive_items",
    name: "idx_open_cognitive_items_source",
    columns: ["owner_id", "source_type", "source_entity_uuid", "updated_at"],
  },
  {
    table: "open_cognitive_items",
    name: "idx_open_cognitive_items_provenance",
    columns: ["owner_id", "provenance", "status", "updated_at"],
  },
  {
    table: "open_cognitive_item_attention",
    name: "idx_open_cognitive_item_attention_due",
    columns: ["defer_until", "item_id"],
  },
  {
    table: "open_cognitive_item_transitions",
    name: "idx_open_cognitive_item_transitions_item",
    columns: ["item_id", "created_at", "id"],
  },
  {
    table: "open_cognitive_item_transitions",
    name: "idx_open_cognitive_item_transitions_owner",
    columns: ["owner_id", "created_at", "id"],
  },
];

const V24_INDEXES: IndexSpec[] = [
  {
    table: "open_cognitive_items",
    name: "idx_open_cognitive_items_semantic_generation",
    columns: ["owner_id", "semantic_identity_hash", "continuity_generation"],
    unique: true,
    partial: true,
    sqlFragment: "where semantic_identity_hash<>'' and continuity_generation<>''",
  },
  {
    table: "open_cognitive_items",
    name: "idx_open_cognitive_items_owner_status_id",
    columns: ["owner_id", "status", "id"],
  },
  {
    table: "open_cognitive_item_attention",
    name: "idx_open_cognitive_item_attention_review_due",
    columns: ["review_requested_at", "item_id"],
  },
];

const V23_TABLE_FRAGMENTS: Record<string, string[]> = {
  open_cognitive_items: [
    "check(kind in('question','revisit','concern'))",
    "check(status in('open','resolved','withdrawn','superseded'))",
    "check(length(semantic_summary)between 1 and 512)",
    "unique(owner_id,semantic_key_hash)",
  ],
  open_cognitive_item_attention: [
    "references open_cognitive_items(id)on delete cascade",
    "check(consideration_count>=0)",
  ],
  open_cognitive_item_transitions: [
    "references open_cognitive_items(id)on delete cascade",
    "check(to_status in('open','resolved','withdrawn','superseded'))",
  ],
};

const V24_TABLE_FRAGMENTS: Record<string, string[]> = {
  open_cognitive_item_review_cursor: ["check(before_item_id>=0)"],
  open_cognitive_item_wake_cursor: ["check(after_item_id>=0)"],
};

const V24_ONLY_OBJECTS = [
  ...V24_TABLES,
  "idx_open_cognitive_items_semantic_generation",
  "idx_open_cognitive_items_owner_status_id",
  "idx_open_cognitive_item_attention_review_due",
] as const;

const V26_ONLY_OBJECTS = [
  ...V26_TABLES,
  "idx_recall_qualification_epochs_single_current",
  "idx_recall_qualification_events_epoch",
] as const;

const V27_TABLES = ["sandbox_task_admissions"] as const;

const V27_COLUMNS: Record<string, ColumnSpec[]> = {
  sandbox_task_admissions: [
    { name: "id", primaryKey: true },
    { name: "owner_id", notNull: true },
    { name: "intent_id", notNull: true },
    { name: "status", notNull: true },
    { name: "derived_from", notNull: true },
    { name: "decision_id", notNull: true },
    { name: "purposes_json", notNull: true },
    { name: "profile_key", notNull: true },
    { name: "profile_recipe_ids_json", notNull: true },
    { name: "evidence_refs_json", notNull: true },
    { name: "refusal_code" },
    { name: "refusal_reason" },
    { name: "build_identity", notNull: true },
    { name: "model_epoch", notNull: true, defaultValue: "0" },
    { name: "recorded_at", notNull: true },
  ],
};

const V27_INDEXES: IndexSpec[] = [
  {
    table: "sandbox_task_admissions",
    name: "idx_sandbox_task_admissions_owner_status",
    columns: ["owner_id", "status", "recorded_at"],
  },
  {
    table: "sandbox_task_admissions",
    name: "idx_sandbox_task_admissions_decision",
    columns: ["decision_id"],
  },
];

const V27_TABLE_FRAGMENTS: Record<string, string[]> = {
  sandbox_task_admissions: [
    "check(status in('recorded','refused'))",
    "check(derived_from in('reactive','proactive'))",
    "unique(owner_id,intent_id)",
  ],
};

const V27_ONLY_OBJECTS = [
  ...V27_TABLES,
  "idx_sandbox_task_admissions_owner_status",
  "idx_sandbox_task_admissions_decision",
] as const;

const V28_COLUMNS: Record<string, ColumnSpec[]> = {
  decision_log: [{ name: "thought_validation_json" }],
};

const V29_COLUMNS: Record<string, ColumnSpec[]> = {
  delivery_reservations: [{ name: "phase_lifecycle_json" }],
};

const V30_TABLES = ["candidate_changesets", "candidate_changeset_events"] as const;

const V30_COLUMNS: Record<string, ColumnSpec[]> = {
  candidate_changesets: [
    { name: "id", primaryKey: true },
    { name: "entity_uuid", notNull: true },
    { name: "data_classification", notNull: true, defaultValue: "'never_public'" },
    { name: "owner_id", notNull: true },
    { name: "changeset_id", notNull: true },
    { name: "changeset_version", notNull: true, defaultValue: "1" },
    { name: "project_id", notNull: true },
    { name: "workspace_id", notNull: true },
    { name: "source_snapshot_id", notNull: true },
    { name: "objective", notNull: true },
    { name: "rationale", notNull: true },
    { name: "risk_class", notNull: true },
    { name: "status", notNull: true },
    { name: "created_at", notNull: true },
    { name: "updated_at", notNull: true },
  ],
  candidate_changeset_events: [
    { name: "id", primaryKey: true },
    { name: "entity_uuid", notNull: true },
    { name: "data_classification", notNull: true, defaultValue: "'never_public'" },
    { name: "owner_id", notNull: true },
    { name: "changeset_id", notNull: true },
    { name: "event_type", notNull: true },
    { name: "metadata_json", notNull: true, defaultValue: "'{}'" },
    { name: "recorded_at", notNull: true },
  ],
};

const V30_INDEXES: IndexSpec[] = [
  {
    table: "candidate_changesets",
    name: "idx_candidate_changesets_owner_status",
    columns: ["owner_id", "status", "created_at"],
  },
  {
    table: "candidate_changesets",
    name: "idx_candidate_changesets_entity_uuid",
    columns: ["entity_uuid"],
    unique: true,
  },
  {
    table: "candidate_changeset_events",
    name: "idx_candidate_changeset_events_changeset",
    columns: ["changeset_id", "recorded_at"],
  },
  {
    table: "candidate_changeset_events",
    name: "idx_candidate_changeset_events_entity_uuid",
    columns: ["entity_uuid"],
    unique: true,
  },
];

const V30_TABLE_FRAGMENTS: Record<string, string[]> = {
  candidate_changesets: [
    "check(status in('proposed','quarantined','stale_base','superseded','abandoned'))",
    "check(review_status is null or review_status='submitted')",
    "check(risk_class in('low','medium','high','consultation'))",
    "unique(changeset_id)",
  ],
  candidate_changeset_events: [
    "check(event_type in('created','sealed','proposed','secret_quarantined'))",
  ],
};

const V30_ONLY_OBJECTS = [
  ...V30_TABLES,
  "idx_candidate_changesets_owner_status",
  "idx_candidate_changesets_entity_uuid",
  "idx_candidate_changeset_events_changeset",
  "idx_candidate_changeset_events_entity_uuid",
] as const;

const V31_TABLES = ["bounded_operation_tasks", "bounded_operation_steps"] as const;

const V31_COLUMNS: Record<string, ColumnSpec[]> = {
  bounded_operation_tasks: [
    { name: "id", primaryKey: true },
    { name: "entity_uuid", notNull: true },
    { name: "data_classification", notNull: true, defaultValue: "'never_public'" },
    { name: "owner_id", notNull: true },
    { name: "task_id", notNull: true },
    { name: "project_id", notNull: true },
    { name: "workspace_id", notNull: true },
    { name: "origin", notNull: true },
    { name: "objective", notNull: true },
    { name: "status", notNull: true },
    { name: "max_steps", notNull: true },
    { name: "deadline_at_ms", notNull: true },
    { name: "created_at", notNull: true },
    { name: "updated_at", notNull: true },
  ],
  bounded_operation_steps: [
    { name: "id", primaryKey: true },
    { name: "entity_uuid", notNull: true },
    { name: "data_classification", notNull: true, defaultValue: "'never_public'" },
    { name: "owner_id", notNull: true },
    { name: "task_id", notNull: true },
    { name: "step_index", notNull: true },
    { name: "step_kind", notNull: true },
    { name: "outcome", notNull: true },
    { name: "recorded_at", notNull: true },
  ],
};

const V31_INDEXES: IndexSpec[] = [
  {
    table: "bounded_operation_tasks",
    name: "idx_bounded_operation_tasks_owner_status",
    columns: ["owner_id", "status", "created_at"],
  },
  {
    table: "bounded_operation_tasks",
    name: "idx_bounded_operation_tasks_entity_uuid",
    columns: ["entity_uuid"],
    unique: true,
  },
  {
    table: "bounded_operation_steps",
    name: "idx_bounded_operation_steps_task",
    columns: ["task_id", "step_index"],
  },
  {
    table: "bounded_operation_steps",
    name: "idx_bounded_operation_steps_entity_uuid",
    columns: ["entity_uuid"],
    unique: true,
  },
];

const V31_TABLE_FRAGMENTS: Record<string, string[]> = {
  bounded_operation_tasks: [
    "check(origin in('owner_request','ashley_private_interest'))",
    "check(border_state='none')",
    "unique(task_id)",
  ],
  bounded_operation_steps: [
    "check(outcome in('succeeded','failed','skipped'))",
  ],
};

const V31_ONLY_OBJECTS = [
  ...V31_TABLES,
  "idx_bounded_operation_tasks_owner_status",
  "idx_bounded_operation_tasks_entity_uuid",
  "idx_bounded_operation_steps_task",
  "idx_bounded_operation_steps_entity_uuid",
] as const;

function requireNoV31Objects(db: DatabaseSync, version: number): void {
  for (const name of V31_ONLY_OBJECTS) {
    const type = V31_TABLES.includes(name as (typeof V31_TABLES)[number])
      ? "table"
      : "index";
    if (masterRow(db, type, name)) fail(version, `unexpected_v31_object:${name}`);
  }
}

const V32_TABLES = ["patch_export_records"] as const;

const V32_COLUMNS: Record<string, ColumnSpec[]> = {
  patch_export_records: [
    { name: "id", primaryKey: true },
    { name: "entity_uuid", notNull: true },
    { name: "data_classification", notNull: true, defaultValue: "'never_public'" },
    { name: "owner_id", notNull: true },
    { name: "task_id", notNull: true },
    { name: "project_id", notNull: true },
    { name: "changeset_id", notNull: true },
    { name: "artifact_ref", notNull: true },
    { name: "destination_path", notNull: true },
    { name: "expected_sha256", notNull: true },
    { name: "status", notNull: true },
    { name: "created_at", notNull: true },
  ],
};

const V32_INDEXES: IndexSpec[] = [
  {
    table: "patch_export_records",
    name: "idx_patch_export_records_owner_status",
    columns: ["owner_id", "status", "created_at"],
  },
  {
    table: "patch_export_records",
    name: "idx_patch_export_records_entity_uuid",
    columns: ["entity_uuid"],
    unique: true,
  },
  {
    table: "patch_export_records",
    name: "idx_patch_export_records_changeset",
    columns: ["changeset_id", "created_at"],
  },
];

const V32_TABLE_FRAGMENTS: Record<string, string[]> = {
  patch_export_records: [
    "check(status in('succeeded','failed','outcome_unknown'))",
    "check(applied=0)",
    "check(live_unwritten=1)",
    "check(git_unwritten=1)",
    "unique(task_id)",
  ],
};

const V32_ONLY_OBJECTS = [
  ...V32_TABLES,
  "idx_patch_export_records_owner_status",
  "idx_patch_export_records_entity_uuid",
  "idx_patch_export_records_changeset",
] as const;

function requireNoV32Objects(db: DatabaseSync, version: number): void {
  for (const name of V32_ONLY_OBJECTS) {
    const type = V32_TABLES.includes(name as (typeof V32_TABLES)[number])
      ? "table"
      : "index";
    if (masterRow(db, type, name)) fail(version, `unexpected_v32_object:${name}`);
  }
}

function normalizeSql(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .replace(/\s*([<>!=])\s*/g, "$1")
    .trim();
}

function fail(version: number, detail: string): never {
  throw new Error(`nuclear_schema_content_invalid:v${version}:${detail}`);
}

function tableInfo(db: DatabaseSync, table: string): TableInfoRow[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];
}

function masterRow(
  db: DatabaseSync,
  type: "table" | "index",
  name: string,
): SqliteMasterRow | undefined {
  return db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master WHERE type = ? AND name = ?`,
    )
    .get(type, name) as SqliteMasterRow | undefined;
}

function requireTable(db: DatabaseSync, version: number, table: string): void {
  if (!masterRow(db, "table", table)) fail(version, `missing_table:${table}`);
}

function requireColumns(
  db: DatabaseSync,
  version: number,
  table: string,
  specs: ColumnSpec[],
): void {
  const rows = tableInfo(db, table);
  const byName = new Map(rows.map((row) => [row.name, row]));
  for (const spec of specs) {
    const row = byName.get(spec.name);
    if (!row) fail(version, `missing_column:${table}.${spec.name}`);
    if (spec.notNull !== undefined && row.notnull !== (spec.notNull ? 1 : 0)) {
      fail(version, `column_nullability:${table}.${spec.name}`);
    }
    if (spec.primaryKey !== undefined && Boolean(row.pk) !== spec.primaryKey) {
      fail(version, `column_primary_key:${table}.${spec.name}`);
    }
    if (spec.defaultValue !== undefined) {
      const actual = row.dflt_value == null ? null : normalizeSql(row.dflt_value);
      const expected = spec.defaultValue == null
        ? null
        : normalizeSql(spec.defaultValue);
      if (actual !== expected) fail(version, `column_default:${table}.${spec.name}`);
    }
  }
}

function requireFragments(
  db: DatabaseSync,
  version: number,
  table: string,
  fragments: string[],
): void {
  const sql = masterRow(db, "table", table)?.sql;
  if (typeof sql !== "string") fail(version, `missing_table_sql:${table}`);
  const normalized = normalizeSql(sql);
  for (const fragment of fragments) {
    if (!normalized.includes(fragment)) {
      fail(version, `missing_constraint:${table}:${fragment}`);
    }
  }
}

function requireIndex(
  db: DatabaseSync,
  version: number,
  spec: IndexSpec,
): void {
  const row = masterRow(db, "index", spec.name);
  if (!row) fail(version, `missing_index:${spec.name}`);
  const indexRows = db
    .prepare(`PRAGMA index_list(${spec.table})`)
    .all() as IndexListRow[];
  const listed = indexRows.find((index) => index.name === spec.name);
  if (!listed) fail(version, `index_not_attached:${spec.name}`);
  if (spec.unique !== undefined && Boolean(listed.unique) !== spec.unique) {
    fail(version, `index_uniqueness:${spec.name}`);
  }
  if (spec.partial !== undefined && Boolean(listed.partial) !== spec.partial) {
    fail(version, `index_partial:${spec.name}`);
  }
  const columns = db
    .prepare(`PRAGMA index_info(${spec.name})`)
    .all() as IndexInfoRow[];
  const actualColumns = columns
    .sort((a, b) => Number(a.seqno ?? 0) - Number(b.seqno ?? 0))
    .map((column) => column.name ?? "");
  if (
    actualColumns.length !== spec.columns.length ||
    actualColumns.some((column, index) => column !== spec.columns[index])
  ) {
    fail(version, `index_columns:${spec.name}`);
  }
  if (spec.sqlFragment) {
    const sql = typeof row.sql === "string" ? normalizeSql(row.sql) : "";
    if (!sql.includes(spec.sqlFragment)) fail(version, `index_definition:${spec.name}`);
  }
}

function requireNoV24Objects(db: DatabaseSync, version: number): void {
  for (const [table, columns] of Object.entries(V24_COLUMNS)) {
    if (!masterRow(db, "table", table)) continue;
    const names = new Set(tableInfo(db, table).map((row) => row.name));
    for (const column of columns) {
      if (names.has(column.name)) {
        fail(version, `unexpected_v24_column:${table}.${column.name}`);
      }
    }
  }
  for (const name of V24_ONLY_OBJECTS) {
    const type = V24_TABLES.includes(name as (typeof V24_TABLES)[number])
      ? "table"
      : "index";
    if (masterRow(db, type, name)) fail(version, `unexpected_v24_object:${name}`);
  }
}

function requireNoV25Columns(db: DatabaseSync, version: number): void {
  for (const [table, columns] of Object.entries(V25_COLUMNS)) {
    if (!masterRow(db, "table", table)) continue;
    const names = new Set(tableInfo(db, table).map((row) => row.name));
    for (const column of columns) {
      if (names.has(column.name)) {
        fail(version, `unexpected_v25_column:${table}.${column.name}`);
      }
    }
  }
}

function requireNoV26Objects(db: DatabaseSync, version: number): void {
  for (const name of V26_ONLY_OBJECTS) {
    const type = V26_TABLES.includes(name as (typeof V26_TABLES)[number])
      ? "table"
      : "index";
    if (masterRow(db, type, name)) fail(version, `unexpected_v26_object:${name}`);
  }
}

function requireNoV27Objects(db: DatabaseSync, version: number): void {
  for (const name of V27_ONLY_OBJECTS) {
    const type = V27_TABLES.includes(name as (typeof V27_TABLES)[number])
      ? "table"
      : "index";
    if (masterRow(db, type, name)) fail(version, `unexpected_v27_object:${name}`);
  }
}

function requireNoV28Columns(db: DatabaseSync, version: number): void {
  for (const [table, columns] of Object.entries(V28_COLUMNS)) {
    if (!masterRow(db, "table", table)) continue;
    const names = new Set(tableInfo(db, table).map((row) => row.name));
    for (const column of columns) {
      if (names.has(column.name)) {
        fail(version, `unexpected_v28_column:${table}.${column.name}`);
      }
    }
  }
}

function requireNoV29Columns(db: DatabaseSync, version: number): void {
  for (const [table, columns] of Object.entries(V29_COLUMNS)) {
    if (!masterRow(db, "table", table)) continue;
    const names = new Set(tableInfo(db, table).map((row) => row.name));
    for (const column of columns) {
      if (names.has(column.name)) {
        fail(version, `unexpected_v29_column:${table}.${column.name}`);
      }
    }
  }
}

function validateV22Source(db: DatabaseSync): void {
  const version = 22;
  requireTable(db, version, "episodes");
  requireTable(db, version, "capability_events");
  requireTable(db, version, "recall_live_cutovers");
  requireColumns(db, version, "episodes", [
    { name: "provenance", notNull: true },
  ]);
  requireColumns(db, version, "capability_events", [
    { name: "kind", notNull: true },
    { name: "contract_id" },
    { name: "build_identity" },
    { name: "model_epoch", notNull: true, defaultValue: "0" },
  ]);
  requireColumns(db, version, "recall_live_cutovers", [
    { name: "owner_id", notNull: true },
    { name: "release_id", notNull: true },
    { name: "cutoff_message_id", notNull: true },
    { name: "authorized_by", notNull: true },
  ]);
  const capabilitySql = masterRow(db, "table", "capability_events")?.sql ?? "";
  if (!normalizeSql(capabilitySql).includes("operator_rollback")) {
    fail(version, "missing_capability_event_contract");
  }
  if (masterRow(db, "table", "open_cognitive_items")) {
    fail(version, "unexpected_v23_object:open_cognitive_items");
  }
}

function requireNoV30Objects(db: DatabaseSync, version: number): void {
  for (const name of V30_ONLY_OBJECTS) {
    const type = V30_TABLES.includes(name as (typeof V30_TABLES)[number])
      ? "table"
      : "index";
    if (masterRow(db, type, name)) fail(version, `unexpected_v30_object:${name}`);
  }
}

const V33_TABLES = [
  "operational_jobs",
  "operational_job_deliveries",
  "verification_receipts",
] as const;

const V33_COLUMNS: Record<string, ColumnSpec[]> = {
  operational_jobs: [
    { name: "id", primaryKey: true },
    { name: "entity_uuid", notNull: true },
    { name: "data_classification", notNull: true, defaultValue: "'never_public'" },
    { name: "job_id", notNull: true },
    { name: "owner_id", notNull: true },
    { name: "source_message_entity_uuid", notNull: true },
    { name: "admission_reservation_id", notNull: true },
    { name: "status", notNull: true },
    { name: "created_at", notNull: true },
    { name: "updated_at", notNull: true },
  ],
  operational_job_deliveries: [
    { name: "id", primaryKey: true },
    { name: "entity_uuid", notNull: true },
    { name: "job_id", notNull: true },
    { name: "delivery_kind", notNull: true },
    { name: "delivery_reservation_id", notNull: true },
    { name: "created_at", notNull: true },
  ],
  verification_receipts: [
    { name: "id", primaryKey: true },
    { name: "entity_uuid", notNull: true },
    { name: "owner_id", notNull: true },
    { name: "task_id", notNull: true },
    { name: "workspace_id", notNull: true },
    { name: "recipe_id", notNull: true },
    { name: "outcome", notNull: true },
    { name: "settled_at", notNull: true },
  ],
  bounded_operation_tasks: [{ name: "origin_job_id" }],
  bounded_operation_steps: [
    { name: "child_task_id" },
    { name: "causation_key" },
    { name: "step_run_status" },
  ],
  candidate_changesets: [{ name: "origin_child_task_id" }],
};

const V33_INDEXES: IndexSpec[] = [
  {
    table: "operational_jobs",
    name: "idx_operational_jobs_entity_uuid",
    columns: ["entity_uuid"],
    unique: true,
  },
  {
    table: "operational_job_deliveries",
    name: "idx_operational_job_deliveries_kind",
    columns: ["job_id", "delivery_kind"],
    unique: true,
  },
  {
    table: "verification_receipts",
    name: "idx_verification_receipts_task",
    columns: ["task_id"],
    unique: true,
  },
];

const V33_ONLY_OBJECTS = [
  ...V33_TABLES,
  "idx_operational_jobs_entity_uuid",
  "idx_operational_job_deliveries_kind",
  "idx_verification_receipts_task",
] as const;

function requireNoV33Objects(db: DatabaseSync, version: number): void {
  for (const name of V33_ONLY_OBJECTS) {
    const type = V33_TABLES.includes(name as (typeof V33_TABLES)[number])
      ? "table"
      : "index";
    if (masterRow(db, type, name)) fail(version, `unexpected_v33_object:${name}`);
  }
}

const V34_COLUMNS: Record<string, ColumnSpec[]> = {
  operational_jobs: [
    { name: "job_phase", notNull: true, defaultValue: "'execution_admitted'" },
    { name: "cognition_state", notNull: true, defaultValue: "'not_required'" },
    { name: "thought_attempt_count", notNull: true, defaultValue: "0" },
    { name: "next_thought_attempt_at_ms" },
    { name: "last_thought_error_class" },
    { name: "cognition_expires_at_ms" },
    { name: "normalized_thought_json" },
    { name: "normalized_thought_schema_version" },
    { name: "thought_attention_request_id" },
    { name: "thought_attention_attempt_ids_json" },
  ],
};

function requireNoV34Columns(db: DatabaseSync, version: number): void {
  for (const column of V34_COLUMNS.operational_jobs ?? []) {
    if (tableInfo(db, "operational_jobs").some((row) => row.name === column.name)) {
      fail(version, `unexpected_v34_column:${column.name}`);
    }
  }
}

export function validateNuclearSchemaContent(
  db: DatabaseSync,
  version: 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34,
  options: { rejectNewerContent?: boolean } = {},
): void {
  if (version === 22) {
    validateV22Source(db);
    return;
  }
  for (const table of V23_TABLES) requireTable(db, version, table);
  for (const [table, columns] of Object.entries(V23_COLUMNS)) {
    requireColumns(db, version, table, columns);
    requireFragments(db, version, table, V23_TABLE_FRAGMENTS[table] ?? []);
  }
  for (const index of V23_INDEXES) requireIndex(db, version, index);
  if (version === 23 && options.rejectNewerContent === true) {
    requireNoV24Objects(db, version);
    return;
  }
  if (version === 23) return;
  for (const table of V24_TABLES) requireTable(db, version, table);
  for (const [table, columns] of Object.entries(V24_COLUMNS)) {
    requireColumns(db, version, table, columns);
    requireFragments(db, version, table, V24_TABLE_FRAGMENTS[table] ?? []);
  }
  for (const index of V24_INDEXES) requireIndex(db, version, index);
  if (version === 24 && options.rejectNewerContent === true) {
    requireNoV25Columns(db, version);
    return;
  }
  if (version === 24) return;
  for (const [table, columns] of Object.entries(V25_COLUMNS)) {
    requireColumns(db, version, table, columns);
  }
  if (version === 25 && options.rejectNewerContent === true) {
    requireNoV26Objects(db, version);
    return;
  }
  if (version === 25) return;
  for (const table of V26_TABLES) requireTable(db, version, table);
  for (const [table, columns] of Object.entries(V26_COLUMNS)) {
    requireColumns(db, version, table, columns);
    requireFragments(db, version, table, V26_TABLE_FRAGMENTS[table] ?? []);
  }
  for (const index of V26_INDEXES) requireIndex(db, version, index);
  if (version === 26 && options.rejectNewerContent === true) {
    requireNoV27Objects(db, version);
    return;
  }
  if (version === 26) return;
  for (const table of V27_TABLES) requireTable(db, version, table);
  for (const [table, columns] of Object.entries(V27_COLUMNS)) {
    requireColumns(db, version, table, columns);
    requireFragments(db, version, table, V27_TABLE_FRAGMENTS[table] ?? []);
  }
  for (const index of V27_INDEXES) requireIndex(db, version, index);
  if (version === 27 && options.rejectNewerContent === true) {
    requireNoV28Columns(db, version);
    return;
  }
  if (version === 27) return;
  for (const [table, columns] of Object.entries(V28_COLUMNS)) {
    requireColumns(db, version, table, columns);
  }
  if (version === 28 && options.rejectNewerContent === true) {
    requireNoV29Columns(db, version);
    return;
  }
  if (version === 28) return;
  for (const [table, columns] of Object.entries(V29_COLUMNS)) {
    requireColumns(db, version, table, columns);
  }
  if (version === 29 && options.rejectNewerContent === true) {
    requireNoV30Objects(db, version);
    return;
  }
  if (version === 29) return;
  for (const table of V30_TABLES) requireTable(db, version, table);
  for (const [table, columns] of Object.entries(V30_COLUMNS)) {
    requireColumns(db, version, table, columns);
    requireFragments(db, version, table, V30_TABLE_FRAGMENTS[table] ?? []);
  }
  for (const index of V30_INDEXES) requireIndex(db, version, index);
  if (version === 30 && options.rejectNewerContent === true) {
    requireNoV31Objects(db, version);
    return;
  }
  if (version === 30) return;
  for (const table of V31_TABLES) requireTable(db, version, table);
  for (const [table, columns] of Object.entries(V31_COLUMNS)) {
    requireColumns(db, version, table, columns);
    requireFragments(db, version, table, V31_TABLE_FRAGMENTS[table] ?? []);
  }
  for (const index of V31_INDEXES) requireIndex(db, version, index);
  if (version === 31 && options.rejectNewerContent === true) {
    requireNoV32Objects(db, version);
    return;
  }
  if (version === 31) return;
  for (const table of V32_TABLES) requireTable(db, version, table);
  for (const [table, columns] of Object.entries(V32_COLUMNS)) {
    requireColumns(db, version, table, columns);
    requireFragments(db, version, table, V32_TABLE_FRAGMENTS[table] ?? []);
  }
  for (const index of V32_INDEXES) requireIndex(db, version, index);
  if (version === 32 && options.rejectNewerContent === true) {
    requireNoV33Objects(db, version);
    return;
  }
  if (version === 32) return;
  for (const table of V33_TABLES) requireTable(db, version, table);
  for (const [table, columns] of Object.entries(V33_COLUMNS)) {
    requireColumns(db, version, table, columns);
  }
  for (const index of V33_INDEXES) requireIndex(db, version, index);
  if (version === 33 && options.rejectNewerContent === true) {
    requireNoV34Columns(db, version);
    return;
  }
  if (version === 33) return;
  for (const [table, columns] of Object.entries(V34_COLUMNS)) {
    requireColumns(db, version, table, columns);
  }
}

function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  const present = tableInfo(db, table).some((row) => row.name === column);
  if (!present) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** Apply the complete additive v24 contract before the version is advanced. */
export function ensureOpenCognitiveV24Schema(db: DatabaseSync): void {
  addColumnIfMissing(db, "open_cognitive_items", "model_identity", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(
    db,
    "open_cognitive_items",
    "semantic_identity_hash",
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(
    db,
    "open_cognitive_items",
    "continuity_generation",
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(
    db,
    "open_cognitive_item_attention",
    "review_attempt_count",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "open_cognitive_item_attention",
    "review_last_disposition",
    "TEXT",
  );
  db.exec(`
    CREATE TABLE IF NOT EXISTS open_cognitive_item_review_cursor (
      owner_id        TEXT PRIMARY KEY NOT NULL,
      before_item_id  INTEGER NOT NULL DEFAULT 0 CHECK (before_item_id >= 0),
      updated_at      TEXT NOT NULL
    );
  `);
  db.exec(MIGRATION_24_OPEN_COGNITIVE_WAKE_CURSOR_DDL);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_open_cognitive_items_semantic_generation
      ON open_cognitive_items (owner_id, semantic_identity_hash, continuity_generation)
      WHERE semantic_identity_hash <> '' AND continuity_generation <> '';
  `);
}

/** Apply the complete additive v25 contract before the version is advanced. */
export function ensureOpenCognitiveV25Schema(db: DatabaseSync): void {
  addColumnIfMissing(
    db,
    "attention_requests",
    "accepted_contract_id",
    "TEXT",
  );
  addColumnIfMissing(
    db,
    "attention_requests",
    "accepted_build_identity",
    "TEXT",
  );
  addColumnIfMissing(
    db,
    "open_cognitive_items",
    "generation_order",
    "INTEGER NOT NULL DEFAULT 0 CHECK (generation_order >= 0)",
  );
}

/** Apply the complete additive v28 contract before the version is advanced. */
export function ensureNuclearV28Schema(db: DatabaseSync): void {
  addColumnIfMissing(db, "decision_log", "thought_validation_json", "TEXT");
}
