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

export function validateNuclearSchemaContent(
  db: DatabaseSync,
  version: 22 | 23 | 24,
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
