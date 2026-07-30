import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "../paths.js";
import { env } from "../env.js";

const SCHEMA_V1 = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mem_threads (
  id                      TEXT PRIMARY KEY,
  owner_id                TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'archived')),
  last_active_channel     TEXT,
  hot_cutoff_message_id   INTEGER,
  created_at              TEXT NOT NULL,
  last_active_at          TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mem_threads_owner_active
  ON mem_threads (owner_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS mem_messages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id         TEXT NOT NULL REFERENCES mem_threads(id),
  owner_id          TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  text              TEXT NOT NULL,
  channel           TEXT NOT NULL,
  token_estimate    INTEGER,
  audit_session_id  TEXT,
  ts                TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mem_messages_thread_id ON mem_messages (thread_id, id);
CREATE INDEX IF NOT EXISTS idx_mem_messages_owner_id ON mem_messages (owner_id, id);

CREATE TABLE IF NOT EXISTS mem_summaries (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id               TEXT NOT NULL REFERENCES mem_threads(id),
  text                    TEXT NOT NULL,
  covers_until_message_id INTEGER NOT NULL,
  is_active               INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at              TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mem_summaries_thread_active
  ON mem_summaries (thread_id) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS mem_facts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          TEXT NOT NULL,
  category          TEXT NOT NULL
                      CHECK (category IN ('project','preference','person','ongoing','pinned')),
  key               TEXT NOT NULL,
  value             TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.8,
  importance        INTEGER NOT NULL DEFAULT 50,
  sensitivity       TEXT NOT NULL DEFAULT 'none'
                      CHECK (sensitivity IN ('none','pharma','health','private')),
  valid_until       TEXT,
  source_message_id INTEGER,
  last_confirmed_at TEXT NOT NULL,
  superseded_by     INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mem_facts_owner_active
  ON mem_facts (owner_id, importance DESC) WHERE superseded_by IS NULL;

CREATE TABLE IF NOT EXISTS mem_chunks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id        TEXT NOT NULL,
  thread_id       TEXT NOT NULL REFERENCES mem_threads(id),
  message_id      INTEGER NOT NULL REFERENCES mem_messages(id),
  chunk_index     INTEGER NOT NULL DEFAULT 0,
  text            TEXT NOT NULL,
  channel         TEXT NOT NULL,
  embedding       BLOB NOT NULL,
  embed_model     TEXT NOT NULL DEFAULT 'mistral-embed',
  token_estimate  INTEGER,
  deleted_at      TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (message_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_mem_chunks_owner ON mem_chunks (owner_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS mem_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  owner_id        TEXT NOT NULL,
  job_type        TEXT NOT NULL
                    CHECK (job_type IN ('summary', 'facts', 'embed')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed')),
  payload_json    TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  lease_until     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_jobs_pending ON mem_jobs (status, created_at) WHERE status = 'pending';
`;

const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS mem_kv (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
`;

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS mem_initiative_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id            TEXT NOT NULL,
  thread_id           TEXT,
  angle               TEXT NOT NULL
                        CHECK (angle IN ('question', 'opinion', 'check_in')),
  reason              TEXT,
  message_text        TEXT NOT NULL,
  discord_message_id  TEXT,
  sent_at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_initiative_owner_day
  ON mem_initiative_log (owner_id, sent_at);
`;

let sharedDb: DatabaseSync | null = null;

export function getMemoryDb(existing?: DatabaseSync): DatabaseSync {
  if (existing) {
    sharedDb = existing;
    migrate(existing);
    return existing;
  }
  if (!sharedDb) {
    sharedDb = new DatabaseSync(DB_PATH);
    migrate(sharedDb);
  }
  return sharedDb;
}

export function migrate(db: DatabaseSync): void {
  let version = (
    db.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;
  if (version < 1) {
    db.exec(SCHEMA_V1);
    db.exec("PRAGMA user_version = 1");
    version = 1;
  }
  if (version < 2) {
    db.exec(SCHEMA_V2);
    db.exec("PRAGMA user_version = 2");
    version = 2;
  }
  if (version < 3) {
    db.exec(SCHEMA_V3);
    db.exec("PRAGMA user_version = 3");
    version = 3;
  }
  if (version < 4) {
    const cols = db
      .prepare(`PRAGMA table_info(mem_threads)`)
      .all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "facts_cutoff_message_id")) {
      db.exec(
        `ALTER TABLE mem_threads ADD COLUMN facts_cutoff_message_id INTEGER`,
      );
    }
    db.exec("PRAGMA user_version = 4");
    version = 4;
  }
  if (version < 5) {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));
    if (!tableNames.has("mem_initiative_log")) {
      db.exec(SCHEMA_V2);
    }
    const initCols = db
      .prepare(`PRAGMA table_info(mem_initiative_log)`)
      .all() as Array<{ name: string }>;
    if (!initCols.some((c) => c.name === "external_message_id")) {
      db.exec(
        `ALTER TABLE mem_initiative_log ADD COLUMN external_message_id TEXT`,
      );
      db.exec(
        `UPDATE mem_initiative_log
         SET external_message_id = discord_message_id
         WHERE external_message_id IS NULL
           AND discord_message_id IS NOT NULL`,
      );
    }
    db.exec(`
CREATE TABLE IF NOT EXISTS mem_reminders (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id             TEXT NOT NULL,
  text                 TEXT NOT NULL,
  due_at               TEXT NOT NULL,
  timezone             TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','sent','cancelled','done')),
  channel              TEXT NOT NULL DEFAULT 'telegram',
  external_message_id  TEXT,
  created_at           TEXT NOT NULL,
  fired_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_mem_reminders_due
  ON mem_reminders (status, due_at);

CREATE TABLE IF NOT EXISTS mem_habits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id        TEXT NOT NULL,
  name            TEXT NOT NULL,
  cron_expr       TEXT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  prompt_text     TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_fired_at   TEXT,
  streak_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_habits_owner
  ON mem_habits (owner_id, enabled);

CREATE TABLE IF NOT EXISTS mem_habit_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id       INTEGER NOT NULL REFERENCES mem_habits(id),
  owner_id       TEXT NOT NULL,
  fired_at       TEXT NOT NULL,
  response_text  TEXT,
  status         TEXT NOT NULL DEFAULT 'logged'
                   CHECK (status IN ('logged','skipped','missed','sent'))
);

CREATE TABLE IF NOT EXISTS mem_pending_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id        TEXT NOT NULL,
  action_type     TEXT NOT NULL
                    CHECK (action_type IN ('pin_fact','create_reminder','create_habit')),
  payload_json    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','expired')),
  channel         TEXT NOT NULL DEFAULT 'telegram',
  created_at      TEXT NOT NULL,
  resolved_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_mem_pending_owner
  ON mem_pending_actions (owner_id, status);
`);
    db.exec("PRAGMA user_version = 5");
  }
}

export function closeMemoryDb(): void {
  if (sharedDb) {
    sharedDb.close();
    sharedDb = null;
  }
}

const JOBS_PENDING_ALERT = env.memoryJobsPendingAlert;

export function incrementMemoryMetric(
  db: DatabaseSync,
  key: string,
  delta = 1,
): void {
  const fullKey = `memory_metric:${key}`;
  const row = db
    .prepare(`SELECT value FROM mem_kv WHERE key = ?`)
    .get(fullKey) as { value: string } | undefined;
  const current = row ? Number(row.value) || 0 : 0;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(fullKey, String(current + delta), now);
}

export function getMemoryMetrics(
  db: DatabaseSync,
): Record<string, number> {
  const rows = db
    .prepare(`SELECT key, value FROM mem_kv WHERE key LIKE 'memory_metric:%'`)
    .all() as Array<{ key: string; value: string }>;
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.key.replace("memory_metric:", "")] = Number(r.value) || 0;
  }
  return out;
}

export function pruneOldDoneJobs(db: DatabaseSync, days = 7): number {
  const result = db
    .prepare(
      `DELETE FROM mem_jobs
       WHERE status = 'done'
         AND updated_at < datetime('now', ?)`,
    )
    .run(`-${days} days`);
  return Number(result.changes);
}

export function getMemoryHealth(db: DatabaseSync): {
  ok: boolean;
  jobsPending: number;
  jobsPendingByType: Record<string, number>;
  jobsRunning: number;
  jobsStuck: number;
  jobsFailed: number;
  jobsDone: number;
  lastJobError: string | null;
  metrics: Record<string, number>;
  pendingAlertThreshold: number;
} {
  try {
    db.prepare("SELECT 1").get();
    const pending = db
      .prepare(
        `SELECT COUNT(*) AS c FROM mem_jobs WHERE status = 'pending'`,
      )
      .get() as { c: number };
    const pendingByType = db
      .prepare(
        `SELECT job_type, COUNT(*) AS c FROM mem_jobs
         WHERE status = 'pending' GROUP BY job_type`,
      )
      .all() as Array<{ job_type: string; c: number }>;
    const jobsPendingByType: Record<string, number> = {};
    for (const row of pendingByType) {
      jobsPendingByType[row.job_type] = row.c;
    }
    const running = db
      .prepare(`SELECT COUNT(*) AS c FROM mem_jobs WHERE status = 'running'`)
      .get() as { c: number };
    const stuck = db
      .prepare(
        `SELECT COUNT(*) AS c FROM mem_jobs
         WHERE status = 'running'
           AND lease_until IS NOT NULL
           AND lease_until < datetime('now')`,
      )
      .get() as { c: number };
    const failed = db
      .prepare(`SELECT COUNT(*) AS c FROM mem_jobs WHERE status = 'failed'`)
      .get() as { c: number };
    const done = db
      .prepare(`SELECT COUNT(*) AS c FROM mem_jobs WHERE status = 'done'`)
      .get() as { c: number };
    const lastErr = db
      .prepare(
        `SELECT last_error FROM mem_jobs
         WHERE last_error IS NOT NULL
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get() as { last_error: string } | undefined;
    const healthy =
      stuck.c === 0 &&
      failed.c === 0 &&
      pending.c <= JOBS_PENDING_ALERT;
    return {
      ok: healthy,
      jobsPending: pending.c,
      jobsPendingByType,
      jobsRunning: running.c,
      jobsStuck: stuck.c,
      jobsFailed: failed.c,
      jobsDone: done.c,
      lastJobError: lastErr?.last_error ?? null,
      metrics: getMemoryMetrics(db),
      pendingAlertThreshold: JOBS_PENDING_ALERT,
    };
  } catch {
    return {
      ok: false,
      jobsPending: 0,
      jobsPendingByType: {},
      jobsRunning: 0,
      jobsStuck: 0,
      jobsFailed: 0,
      jobsDone: 0,
      lastJobError: null,
      metrics: {},
      pendingAlertThreshold: JOBS_PENDING_ALERT,
    };
  }
}
