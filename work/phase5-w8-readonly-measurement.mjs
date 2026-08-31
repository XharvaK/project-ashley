import { createHash } from "node:crypto";
import { DatabaseSync, constants as sqlite } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname, platform, release, tmpdir, totalmem, version as osVersion } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const DATA_ROOT = join(homedir(), ".composer-assistant");
const OUTPUT_ROOT = resolve(process.cwd(), "work", "phase5-w8-readonly-20260831");
const QUERY_BUNDLE_VERSION = "phase5-w8-r6-v1";
const WINDOW_DAY_MS = 86_400_000;

const knownStores = [
  { id: "nuclear", path: join(DATA_ROOT, "conversations", "nuclear.db"), class: "MIXED_AUTHORITATIVE_CURRENT_HISTORICAL_OBSERVABILITY", owner: "apps/agent-service/src/core/db.ts", rebuildSource: "GENERALLY_NOT_REBUILDABLE_AS_A_WHOLE" },
  { id: "continuity", path: join(DATA_ROOT, "continuity.db"), class: "AUTHORITATIVE_CURRENT_HISTORICAL", owner: "continuity source/schema", rebuildSource: "BACKUPS_LINEAGE_PROTOCOL_ONLY" },
  { id: "cognitive_sidecar", path: join(DATA_ROOT, "cognitive-v021.db"), class: "MIXED_AUTHORITATIVE_CURRENT_HISTORICAL_OPERATIONAL", owner: "apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts", rebuildSource: "TABLE_SPECIFIC" },
  { id: "derived_index", path: join(DATA_ROOT, "cognitive-v021-derived-index.db"), class: "DERIVED", owner: "apps/agent-service/src/core/cognitive-v021/retrieval/derived-store.ts", rebuildSource: "CANONICAL_SIDECAR_CONVERSATION_MEMORY_SOURCES" },
  { id: "observability", path: join(DATA_ROOT, "cognitive-v021-observability.db"), class: "OBSERVABILITY", owner: "apps/agent-service/src/core/cognitive-v021/thought/diagnostics.ts", rebuildSource: "SOURCE_EVENTS_WHERE_RETAINED" },
  { id: "legacy_index", path: join(DATA_ROOT, "conversations", "index.db"), class: "AUTHORITATIVE_HISTORICAL_CANDIDATE", owner: "apps/agent-service/src/conversation-logger.ts and current legacy readers/writers", rebuildSource: "UNKNOWN" },
];

const allowedPragmas = new Set([
  "database_list", "page_count", "page_size", "freelist_count", "schema_version", "user_version",
  "data_version", "query_only", "integrity_check", "table_info", "foreign_key_list", "index_list", "compile_options",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

function pathId(filePath) {
  return filePath.replace(DATA_ROOT, "<data-root>").replace(/\\/g, "/");
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

function fileFingerprint(filePath) {
  const companionPaths = [filePath, `${filePath}-wal`, `${filePath}-shm`].filter(existsSync);
  return companionPaths.map((candidate) => {
    const stat = statSync(candidate);
    const bytes = readFileSync(candidate);
    return {
      path: pathId(candidate),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: sha256(bytes),
    };
  });
}

function valueFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const values = Object.values(row);
  return values[0] ?? null;
}

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function redactedScalar(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return { type: typeof value, sha256: sha256(String(value)) };
}

function dataVersion(db) {
  return Number(valueFromRow(db.prepare("PRAGMA data_version").get()) ?? 0);
}

function rowCount(db, tableName) {
  try {
    return Number(valueFromRow(db.prepare(`SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(tableName)}`).get()) ?? 0);
  } catch {
    return null;
  }
}

function allocatedBytes(db, objectName) {
  try {
    const row = db.prepare("SELECT SUM(pgsize) AS allocated_bytes FROM dbstat WHERE name = ?").get(objectName);
    const value = valueFromRow(row);
    return value == null ? 0 : Number(value);
  } catch {
    return null;
  }
}

function pragmaValue(db, name) {
  try {
    return valueFromRow(db.prepare(`PRAGMA ${name}`).get());
  } catch {
    return null;
  }
}

function setReadOnlyGuard(db, guard) {
  db.setAuthorizer((actionCode, arg1, arg2) => {
    guard.actionCounts[actionCode] = (guard.actionCounts[actionCode] ?? 0) + 1;
    if (actionCode === sqlite.SQLITE_SELECT || actionCode === sqlite.SQLITE_READ || actionCode === sqlite.SQLITE_FUNCTION) return sqlite.SQLITE_OK;
    if (actionCode === sqlite.SQLITE_PRAGMA) {
      const name = String(arg1 ?? "").toLowerCase();
      const value = String(arg2 ?? "").toLowerCase();
      if (name === "query_only" && value === "on") return sqlite.SQLITE_OK;
      if (allowedPragmas.has(name)) return sqlite.SQLITE_OK;
    }
    guard.deniedActionCounts[actionCode] = (guard.deniedActionCounts[actionCode] ?? 0) + 1;
    return sqlite.SQLITE_DENY;
  });
  db.exec("PRAGMA query_only = ON");
  guard.queryOnly = Number(pragmaValue(db, "query_only")) === 1;
}

function runMeasuredQuery(db, guard, name, sql, params = [], parameterClass = "none", options = {}) {
  const repetitions = options.repetitions ?? 3;
  const warmup = options.warmup ?? 1;
  const query = {
    name,
    sql,
    sqlSha256: sha256(sql),
    repetitions,
    warmup,
    parameterClass,
    parameterHashes: params.map((param) => sha256(String(param))),
    rowsPerRepetition: [],
    elapsedMs: [],
    dataVersions: [],
    rowsVisited: "UNAVAILABLE",
    plan: [],
  };
  try {
    const planRows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
    query.plan = planRows.map((row) => ({ id: Number(row.id ?? 0), parent: Number(row.parent ?? 0), detail: String(row.detail ?? "") }));
    const statement = db.prepare(sql);
    for (let i = 0; i < warmup; i += 1) statement.all(...params);
    for (let i = 0; i < repetitions; i += 1) {
      const before = dataVersion(db);
      const start = performance.now();
      const rows = statement.all(...params);
      const elapsed = performance.now() - start;
      const after = dataVersion(db);
      query.rowsPerRepetition.push(rows.length);
      query.elapsedMs.push(Number(elapsed.toFixed(4)));
      query.dataVersions.push({ before, after });
    }
    return query;
  } catch (error) {
    query.error = error instanceof Error ? error.message : String(error);
    return query;
  }
}

function runAggregate(db, name, sql, params = []) {
  try {
    const row = db.prepare(sql).get(...params);
    return { name, sql, sqlSha256: sha256(sql), values: Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [key, typeof value === "number" ? value : value == null ? null : { type: typeof value, sha256: sha256(String(value)) }])) };
  } catch (error) {
    return { name, sql, sqlSha256: sha256(sql), error: error instanceof Error ? error.message : String(error) };
  }
}

function schemaColumns(db, tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => String(row.name ?? ""));
  } catch {
    return [];
  }
}

function foreignKeys(db, tableName) {
  try {
    return db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).all().map((row) => ({ table: String(row.table ?? ""), from: String(row.from ?? ""), to: String(row.to ?? "") }));
  } catch {
    return [];
  }
}

function indexes(db, tableName) {
  try {
    return db.prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`).all().map((row) => ({ name: String(row.name ?? ""), unique: Number(row.unique ?? 0) === 1, partial: Number(row.partial ?? 0) === 1 }));
  } catch {
    return [];
  }
}

function timeStatistics(db, tableName, columns) {
  const result = [];
  for (const column of columns.filter((item) => /(^|_)(created|updated|at|due|expires|started|finished|claimed|consumed|dispatched|reconciled|first_attempt|last_served|policy_now|time)(_|$)/i.test(item))) {
    const quoted = quoteIdentifier(column);
    try {
      const row = db.prepare(`SELECT COUNT(*) AS total, MIN(${quoted}) AS oldest, MAX(${quoted}) AS newest FROM ${quoteIdentifier(tableName)}`).get();
      const oldest = redactedScalar(row?.oldest);
      const newest = redactedScalar(row?.newest);
      const item = { column, total: Number(row?.total ?? 0), oldest, newest, utcBuckets: "UNMEASURABLE_FROM_CURRENT_SCHEMA" };
      if (numeric(row?.oldest) !== null && numeric(row?.newest) !== null && (/_ms$|time/i.test(column))) {
        const bucketRows = db.prepare(`SELECT CAST(${quoted} / ${WINDOW_DAY_MS} AS INTEGER) AS utc_day, COUNT(*) AS count FROM ${quoteIdentifier(tableName)} WHERE ${quoted} IS NOT NULL GROUP BY utc_day ORDER BY utc_day`).all();
        item.utcBuckets = bucketRows.map((bucket) => ({ utcDay: Number(bucket.utc_day), count: Number(bucket.count) }));
      }
      result.push(item);
    } catch {
      result.push({ column, status: "UNKNOWN" });
    }
  }
  return result;
}

function statusStatistics(db, tableName, columns) {
  const result = [];
  for (const column of columns.filter((item) => /^(status|state|outcome|kind|live|cancelled|superseded|scope_state)$/i.test(item))) {
    try {
      const rows = db.prepare(`SELECT ${quoteIdentifier(column)} AS value, COUNT(*) AS count FROM ${quoteIdentifier(tableName)} GROUP BY ${quoteIdentifier(column)} ORDER BY ${quoteIdentifier(column)}`).all();
      result.push({ column, values: rows.map((row) => ({ value: row.value == null ? null : String(row.value), count: Number(row.count) })) });
    } catch {
      result.push({ column, status: "UNKNOWN" });
    }
  }
  return result;
}

function jsonReferenceStatistics(db, tableName, columns, json1Available) {
  if (!json1Available) return [];
  const result = [];
  for (const column of columns.filter((item) => /json|payload|claims|detail/i.test(item))) {
    const sql = `SELECT COUNT(*) AS reference_tokens FROM ${quoteIdentifier(tableName)} t, json_each(t.${quoteIdentifier(column)}) WHERE json_valid(t.${quoteIdentifier(column)})`;
    try {
      const row = db.prepare(sql).get();
      result.push({ tableName, column, referenceTokens: Number(row?.reference_tokens ?? 0), sqlSha256: sha256(sql) });
    } catch {
      result.push({ tableName, column, referenceTokens: "UNKNOWN", sqlSha256: sha256(sql) });
    }
  }
  return result;
}

function hotQueryDefinitions() {
  return [
    { name: "duplicate_ingress_discord_id", table: "conversation_evidence_discord_ids", sql: "SELECT conversation_id, lineage_id, ordinal FROM conversation_evidence_discord_ids WHERE discord_message_id = ?;", params: ["w8:absent-discord-message"], parameterClass: "absent_discord_message_sentinel" },
    { name: "duplicate_ingress_cycle_trigger", table: "cycle_records", sql: "SELECT cycle_id FROM cycle_records WHERE conversation_id = ? AND trigger_ref = ? ORDER BY generation ASC LIMIT 1;", params: ["w8:absent-conversation", "w8:absent-trigger"], parameterClass: "absent_conversation_trigger_sentinels" },
    { name: "latest_cycle", table: "cycle_records", sql: "SELECT * FROM cycle_records WHERE conversation_id = ? ORDER BY generation DESC LIMIT 1;", params: ["w8:absent-conversation"], parameterClass: "absent_conversation_sentinel" },
    { name: "maximum_generation", table: "cycle_records", sql: "SELECT MAX(generation) AS generation FROM cycle_records WHERE conversation_id = ?;", params: ["w8:absent-conversation"], parameterClass: "absent_conversation_sentinel" },
    { name: "due_triggers", table: "future_triggers", sql: "SELECT * FROM future_triggers WHERE status = 'scheduled' AND due_at_ms <= ? ORDER BY due_at_ms ASC, trigger_id ASC LIMIT ?;", params: [0, 100], parameterClass: "fixed_now_zero_and_limit_100" },
    { name: "global_inbox_claim_selection", table: "inbox_events", requiredTables: ["inbox_events", "retry_lane_fairness"], sql: "SELECT e.id, e.lane, e.conversation_id, e.state, e.next_eligible_at_ms, e.created_at_ms, COALESCE(f.last_served_at_ms, 0) AS last_served_at_ms FROM inbox_events e LEFT JOIN retry_lane_fairness f ON f.lane = e.lane AND f.conversation_id = e.conversation_id WHERE e.state IN ('pending', 'leased') ORDER BY e.created_at_ms ASC, e.id ASC;", params: [], parameterClass: "none" },
    { name: "observation_subscription_list", table: "observation_subscriptions", sql: "SELECT * FROM observation_subscriptions WHERE conversation_id = ? AND cancelled = 0 ORDER BY subscription_id ASC;", params: ["w8:absent-conversation"], parameterClass: "absent_conversation_sentinel" },
    { name: "observation_subscription_count", table: "observation_subscriptions", sql: "SELECT COUNT(*) AS count FROM observation_subscriptions WHERE conversation_id = ? AND cancelled = 0;", params: ["w8:absent-conversation"], parameterClass: "absent_conversation_sentinel" },
    { name: "working_context_current", table: "working_context_items", sql: "SELECT * FROM working_context_items WHERE conversation_id = ? AND superseded = 0;", params: ["w8:absent-conversation"], parameterClass: "absent_conversation_sentinel" },
    { name: "authority_receipt_count_and_bytes", table: "effect_receipts", sql: "SELECT COUNT(*) AS count, SUM(length(claims_json)) AS claims_bytes FROM effect_receipts;", params: [], parameterClass: "none" },
    { name: "authority_receipt_hydration", table: "effect_receipts", sql: "SELECT * FROM effect_receipts ORDER BY at_ms ASC;", params: [], parameterClass: "none" },
    { name: "authority_receipt_projection_bounded", table: "effect_receipts", sql: "SELECT * FROM effect_receipts ORDER BY at_ms DESC, effect_id DESC LIMIT ?;", params: [512], parameterClass: "w4_receipt_limit_512" },
    { name: "authority_receipt_projection_by_effect_ids", table: "effect_receipts", sql: "SELECT * FROM effect_receipts WHERE effect_id IN (?) ORDER BY at_ms DESC", params: ["w8:absent-effect"], parameterClass: "w4_effect_id_sentinel" },
    { name: "effect_by_id_or_idempotency", table: "in_flight_effects", sql: "SELECT * FROM in_flight_effects WHERE effect_id = ? OR idempotency_key = ? LIMIT 1;", params: ["w8:absent-effect", "w8:absent-idempotency"], parameterClass: "absent_effect_and_idempotency_sentinels" },
    { name: "effects_by_cycle", table: "in_flight_effects", sql: "SELECT * FROM in_flight_effects WHERE cycle_id = ? ORDER BY dispatched_at_ms ASC;", params: ["w8:absent-cycle"], parameterClass: "absent_cycle_sentinel" },
    { name: "receipt_by_effect", table: "effect_receipts", sql: "SELECT * FROM effect_receipts WHERE effect_id = ?;", params: ["w8:absent-effect"], parameterClass: "absent_effect_sentinel" },
    { name: "receipt_by_idempotency", table: "effect_receipts", sql: "SELECT * FROM effect_receipts WHERE idempotency_key = ?;", params: ["w8:absent-idempotency"], parameterClass: "absent_idempotency_sentinel" },
  ].map((query) => ({ ...query, requiredTables: query.requiredTables ?? [query.table], expectedStore: "cognitive_sidecar" }));
}

function notApplicableHotQuery(query, status = "NOT_APPLICABLE_TABLE_MISSING") {
  return {
    name: query.name,
    expectedStore: query.expectedStore,
    requiredTables: query.requiredTables,
    status,
    sql: query.sql,
    sqlSha256: sha256(query.sql),
    repetitions: 3,
    warmup: 1,
    parameterClass: query.parameterClass,
    parameterHashes: query.params.map((param) => sha256(String(param))),
    rowsPerRepetition: [],
    elapsedMs: [],
    dataVersions: [],
    rowsVisited: "UNAVAILABLE",
    plan: [],
  };
}

function hotQueriesForStore(storeId, tableNames, db, guard) {
  if (storeId !== "cognitive_sidecar") return [];
  return hotQueryDefinitions().map((query) => query.requiredTables.every((table) => tableNames.has(table))
    ? { ...runMeasuredQuery(db, guard, query.name, query.sql, query.params, query.parameterClass), expectedStore: query.expectedStore, requiredTables: query.requiredTables }
    : notApplicableHotQuery(query));
}

function referenceEvidence(db, tableNames) {
  const evidence = [];
  const add = (name, sql) => evidence.push(tableNames.has(name.table ?? name) ? runAggregate(db, name.id, sql) : { name: name.id, status: "NOT_APPLICABLE_TABLE_MISSING" });
  if (tableNames.has("sidecar_memory_supports") && tableNames.has("sidecar_memory_assertions")) {
    add({ table: "sidecar_memory_supports", id: "memory_support_group_frequency" }, "SELECT COUNT(*) AS groups, COALESCE(SUM(support_count), 0) AS references FROM (SELECT assertion_key, COUNT(*) AS support_count FROM sidecar_memory_supports GROUP BY assertion_key);");
    add({ table: "sidecar_memory_supports", id: "orphan_memory_supports" }, "SELECT COUNT(*) AS orphan_supports FROM sidecar_memory_supports s LEFT JOIN sidecar_memory_assertions a ON a.assertion_key=s.assertion_key WHERE a.assertion_key IS NULL;");
  } else {
    evidence.push({ name: "memory_support_group_frequency", status: "NOT_APPLICABLE_TABLE_MISSING" }, { name: "orphan_memory_supports", status: "NOT_APPLICABLE_TABLE_MISSING" });
  }
  const fixed = [
    ["working_context_items", "working_context_superseded", "SELECT superseded, COUNT(*) AS count FROM working_context_items GROUP BY superseded;"],
    ["concerns", "concern_status", "SELECT status, COUNT(*) AS count FROM concerns GROUP BY status ORDER BY status;"],
    ["future_triggers", "future_trigger_status", "SELECT status, COUNT(*) AS count FROM future_triggers GROUP BY status ORDER BY status;"],
    ["observation_subscriptions", "subscription_cancelled", "SELECT cancelled, COUNT(*) AS count FROM observation_subscriptions GROUP BY cancelled;"],
    ["in_flight_effects", "in_flight_state", "SELECT state, COUNT(*) AS count FROM in_flight_effects GROUP BY state ORDER BY state;"],
    ["effect_receipts", "orphan_effect_receipts", "SELECT COUNT(*) AS orphan_receipts FROM effect_receipts r LEFT JOIN in_flight_effects e ON e.effect_id=r.effect_id WHERE e.effect_id IS NULL;"],
  ];
  for (const [table, name, sql] of fixed) evidence.push(tableNames.has(table) ? runAggregate(db, name, sql) : { name, status: "NOT_APPLICABLE_TABLE_MISSING" });
  return evidence;
}

function classifyRebuild(storeId, sidecarPresent) {
  if (storeId !== "derived_index") return storeId === "cognitive_sidecar" ? "TABLE_SPECIFIC" : "NOT_APPLICABLE";
  return sidecarPresent ? "SOURCE_PRESENT_NOT_REBUILD_VERIFIED" : "SOURCE_MISSING";
}

function walkDbFiles(root) {
  const result = [];
  const visit = (directory) => {
    let entries = [];
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (["keys", "keys-bak"].includes(entry.name)) continue;
        visit(full);
      } else if (/\.(db|sqlite|sqlite3)$/i.test(entry.name)) {
        try {
          const stat = statSync(full);
          result.push({ path: pathId(full), pathSha256: sha256(full.replace(/\\/g, "/").toLowerCase()), size: stat.size, mtimeMs: stat.mtimeMs, category: full.includes(`${join(DATA_ROOT, "backups")}`) ? "backup" : full.includes(`${join(DATA_ROOT, "migration-backups")}`) ? "migration_backup" : full.includes(`${join(DATA_ROOT, "persona-eval-data")}`) ? "isolated_evaluation" : "other" });
        } catch { /* retain only resolvable metadata */ }
      }
    }
  };
  visit(root);
  return result;
}

function inspectStore(store, sidecarPresent) {
  const startedAt = new Date().toISOString();
  const beforeFiles = existsSync(store.path) ? fileFingerprint(store.path) : [];
  const guard = { actionCounts: {}, deniedActionCounts: {}, queryOnly: false };
  const result = {
    storeId: store.id,
    path: pathId(store.path),
    class: store.class,
    owner: store.owner,
    liveReaders: "SOURCE_INSPECTION_REQUIRED_PER_TABLE",
    liveWriters: "SOURCE_INSPECTION_REQUIRED_PER_TABLE",
    exists: existsSync(store.path),
    fileBefore: beforeFiles,
    fileAfter: [],
    database: null,
    tables: [],
    referenceEvidence: [],
    hotPathQueries: [],
    readOnlyGuard: guard,
    rebuildSource: store.rebuildSource,
    rebuildVerification: classifyRebuild(store.id, sidecarPresent),
    notes: [],
  };
  if (!result.exists) {
    result.database = { status: "MISSING", schema: "UNKNOWN", userVersion: "UNKNOWN", dataVersion: "UNKNOWN" };
    result.hotPathQueries = hotQueriesForStore(store.id, new Set());
    result.notes.push("No file was created. This store remains UNKNOWN/NOT_APPLICABLE for live occupancy.");
    return result;
  }

  const immutableLegacyRead = store.id === "legacy_index"
    && (!existsSync(`${store.path}-wal`) || statSync(`${store.path}-wal`).size === 0);
  const uri = `file:${resolve(store.path).replaceAll("\\", "/")}?mode=ro${immutableLegacyRead ? "&immutable=1" : ""}`;
  let db;
  try {
    db = new DatabaseSync(uri, { uri: true });
    setReadOnlyGuard(db, guard);
    if (immutableLegacyRead) {
      result.notes.push("Opened the existing legacy index with SQLite immutable read-only mode because its WAL companion was mechanically zero bytes; no WAL state was applied or written.");
    }
    const schemaRows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE type IN ('table','index','view','trigger') ORDER BY type, name").all();
    const tableRows = schemaRows.filter((row) => row.type === "table" && !String(row.name ?? "").startsWith("sqlite_"));
    const tableNames = new Set(tableRows.map((row) => String(row.name ?? "")));
    const integrity = pragmaValue(db, "integrity_check");
    const compileOptions = db.prepare("PRAGMA compile_options").all().map((row) => String(valueFromRow(row) ?? ""));
    const json1 = (() => {
      try { return Number(valueFromRow(db.prepare("SELECT json_valid('{}')").get()) ?? 0) === 1; } catch { return false; }
    })();
    const dbstatAvailable = allocatedBytes(db, "sqlite_schema") !== null;
    result.database = {
      sqliteVersion: valueFromRow(db.prepare("SELECT sqlite_version()").get()),
      schemaVersion: pragmaValue(db, "schema_version"),
      userVersion: pragmaValue(db, "user_version"),
      dataVersionBefore: dataVersion(db),
      pageCount: pragmaValue(db, "page_count"),
      pageSize: pragmaValue(db, "page_size"),
      freelistCount: pragmaValue(db, "freelist_count"),
      integrityCheck: String(integrity ?? "UNKNOWN"),
      json1Available: json1,
      fts5CompileOption: compileOptions.some((item) => /fts5/i.test(item)),
      dbstatAvailable,
      schemaObjectCount: schemaRows.length,
      schemaObjectSqlHashes: schemaRows.map((row) => ({ type: String(row.type), name: String(row.name), sqlSha256: row.sql == null ? null : sha256(String(row.sql)) })),
    };
    for (const tableRow of tableRows) {
      const tableName = String(tableRow.name);
      const columns = schemaColumns(db, tableName);
      const foreignKeyRows = foreignKeys(db, tableName);
      const table = {
        store: store.id,
        table: tableName,
        class: store.id === "derived_index" ? "DERIVED" : store.id === "observability" ? "OBSERVABILITY" : store.id === "legacy_index" ? "AUTHORITATIVE_HISTORICAL_CANDIDATE" : store.class,
        owner: store.owner,
        rowCount: rowCount(db, tableName),
        allocatedBytes: allocatedBytes(db, tableName),
        growthInterval: timeStatistics(db, tableName, columns),
        currentnessFields: columns.filter((item) => /generation|epoch|status|state|current|live|valid|supersed|source_hash|data_version/i.test(item)),
        ownerConversationFields: columns.filter((item) => /owner|conversation|thread|user/i.test(item)),
        referenceFields: columns.filter((item) => /ref|id|lineage|cycle|wake|effect|settlement|assertion|nomination/i.test(item)),
        columns,
        foreignKeys: foreignKeyRows,
        indexCount: indexes(db, tableName).length,
        indexDefinitions: indexes(db, tableName),
        statusCounts: statusStatistics(db, tableName, columns),
        referenceInDegree: foreignKeyRows.length,
        orphanCandidates: "UNKNOWN",
        readFrequencyEvidence: "UNKNOWN",
        rebuildSource: store.rebuildSource,
        rebuildVerification: classifyRebuild(store.id, sidecarPresent),
        redactionEligibility: "UNKNOWN",
        backupWatermarkCoverage: "UNKNOWN",
        preservationRule: "PRESERVE_DURING_W8",
        uncertainty: "Table authority and readers/writers are source-derived; no row content was serialized.",
      };
      table.jsonReferenceTokens = jsonReferenceStatistics(db, tableName, columns, json1);
      result.tables.push(table);
    }
    result.referenceEvidence = referenceEvidence(db, tableNames);
    result.hotPathQueries = hotQueriesForStore(store.id, tableNames, db, guard);
    if (tableNames.has("derived_index_meta") || tableNames.has("fts_index_state")) {
      result.derivedState = {
        stateTables: [...tableNames].filter((name) => /derived|fts/i.test(name)),
        canonicalSource: sidecarPresent ? "SOURCE_PRESENT_NOT_REBUILD_VERIFIED" : "SOURCE_MISSING",
        rowsDiscardedWithoutSerialization: true,
      };
    }
    result.database.dataVersionAfter = dataVersion(db);
    result.database.dataVersionChangedDuringCapture = result.database.dataVersionBefore !== result.database.dataVersionAfter;
  } catch (error) {
    result.database = { status: "INCOMPLETE", error: error instanceof Error ? error.message : String(error) };
    result.notes.push("The store could not be fully measured under the read-only guard.");
  } finally {
    try { db?.close(); } catch { /* preserve measurement result */ }
  }
  result.fileAfter = fileFingerprint(store.path);
  result.fileMetadataChanged = canonical(result.fileBefore) !== canonical(result.fileAfter);
  result.captureStart = startedAt;
  result.captureEnd = new Date().toISOString();
  result.queryOnlyProven = guard.queryOnly;
  result.authorizerDeniedMutationCount = Object.values(guard.deniedActionCounts).reduce((total, count) => total + count, 0);
  return result;
}

const captureStartedAt = new Date().toISOString();
const sidecarStore = knownStores.find((store) => store.id === "cognitive_sidecar");
const sidecarPresent = Boolean(sidecarStore && existsSync(sidecarStore.path));
const stores = knownStores.map((store) => inspectStore(store, sidecarPresent));
const auxiliaryDbInventory = walkDbFiles(DATA_ROOT);
const manifest = {
  queryBundleVersion: QUERY_BUNDLE_VERSION,
  hostClass: "passive_local",
  productionObserved: false,
  sourceReleaseIdentity: {
    candidateHead: "573393c3fdb2392a45137d4625635658eb4b5d88",
    w1Evidence: "docs/audits/ashley-mri-phase5-573393c/W1_IMPLEMENTATION_EVIDENCE.md",
    w2Evidence: "docs/audits/ashley-mri-phase5-573393c/W2_IMPLEMENTATION_EVIDENCE.md",
    w3Evidence: "docs/audits/ashley-mri-phase5-573393c/W3_IMPLEMENTATION_EVIDENCE.md",
  },
  environment: {
    hostname: sha256(hostname()),
    platform: platform(),
    osRelease: release(),
    osVersion: osVersion(),
    node: process.version,
    arch: process.arch,
    pid: process.pid,
    processStartIdentity: `${process.pid}:${captureStartedAt}`,
    totalMemoryBytes: totalmem(),
    temporaryDirectoryClass: sha256(tmpdir()),
  },
  normalizedStorePaths: knownStores.map((store) => ({ storeId: store.id, path: pathId(store.path) })),
  stores,
  auxiliaryDbInventory,
  inclusions: ["known data stores", "existing backup/migration/evaluation DB metadata", "schema and aggregate evidence", "read-only hot-path plans and timings"],
  exclusions: [".env", "keys", "keys-bak", "raw messages", "raw statements", "raw payloads", "claims", "credentials", "provider secrets", "production/Mint capture"],
  concurrentWriteNotes: stores.filter((store) => store.database?.dataVersionChangedDuringCapture || store.fileMetadataChanged).map((store) => ({ storeId: store.storeId, dataVersionChanged: Boolean(store.database?.dataVersionChangedDuringCapture), fileMetadataChanged: Boolean(store.fileMetadataChanged) })),
  captureStartedAt,
  captureEndedAt: new Date().toISOString(),
  clockSource: "UTC ISO capture timestamps plus SQLite data_version",
};
const snapshotId = `sha256:${sha256(canonical(manifest))}`;
const evidence = {
  snapshotId,
  measurementState: stores.some((store) => store.database?.status === "INCOMPLETE") ? "incomplete" : stores.some((store) => store.fileMetadataChanged && !store.database?.dataVersionChangedDuringCapture) ? "invalid" : "complete",
  zeroMutation: {
    sourceMutationAuthorized: false,
    databaseMutationAuthorized: false,
    queryOnlyProvenForExistingStores: stores.filter((store) => store.exists).every((store) => store.queryOnlyProven),
    authorizerInstalledForExistingStores: stores.filter((store) => store.exists).every((store) => Object.keys(store.readOnlyGuard.actionCounts).length > 0),
    deniedMutationActionCount: stores.reduce((total, store) => total + (store.authorizerDeniedMutationCount ?? 0), 0),
    beforeAfterFileProof: stores.map((store) => ({ storeId: store.storeId, unchanged: !store.fileMetadataChanged, before: store.fileBefore, after: store.fileAfter })),
    databaseDataVersions: stores.map((store) => ({ storeId: store.storeId, before: store.database?.dataVersionBefore ?? "UNKNOWN", after: store.database?.dataVersionAfter ?? "UNKNOWN", changed: store.database?.dataVersionChangedDuringCapture ?? "UNKNOWN" })),
  },
  manifest,
};
mkdirSync(OUTPUT_ROOT, { recursive: true });
const outputPath = join(OUTPUT_ROOT, `${snapshotId.replace("sha256:", "")}.json`);
writeFileSync(outputPath, JSON.stringify(evidence, null, 2), { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ outputPath, snapshotId, measurementState: evidence.measurementState, stores: stores.map((store) => ({ storeId: store.storeId, exists: store.exists, tableCount: store.tables.length, queryOnlyProven: store.queryOnlyProven, fileMetadataChanged: store.fileMetadataChanged })), auxiliaryDbCount: auxiliaryDbInventory.length, deniedMutationActionCount: evidence.zeroMutation.deniedMutationActionCount }, null, 2));
