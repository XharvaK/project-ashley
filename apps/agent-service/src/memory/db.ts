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

/**
 * Durable positions Ashley has taken. Separate from mem_facts on purpose: facts
 * are about Doc and must never be invented, stances are hers and exist so she
 * has something to defend when he pushes back.
 */
const SCHEMA_V6_STANCES = `
CREATE TABLE IF NOT EXISTS mem_stances (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          TEXT NOT NULL,
  topic             TEXT NOT NULL,
  stance            TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.7,
  times_reinforced  INTEGER NOT NULL DEFAULT 1,
  source_message_id INTEGER,
  created_at        TEXT NOT NULL,
  last_defended_at  TEXT,
  revised_at        TEXT,
  superseded_by     INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mem_stances_owner_topic
  ON mem_stances (owner_id, topic) WHERE superseded_by IS NULL;
`;

const SCHEMA_V6_JOBS = `
CREATE TABLE mem_jobs_v6 (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  owner_id        TEXT NOT NULL,
  job_type        TEXT NOT NULL
                    CHECK (job_type IN ('summary', 'facts', 'embed', 'stances')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed')),
  payload_json    TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  lease_until     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
INSERT INTO mem_jobs_v6
  (id, idempotency_key, owner_id, job_type, status, payload_json, attempts,
   last_error, lease_until, created_at, updated_at)
  SELECT id, idempotency_key, owner_id, job_type, status, payload_json, attempts,
         last_error, lease_until, created_at, updated_at
  FROM mem_jobs;
DROP TABLE mem_jobs;
ALTER TABLE mem_jobs_v6 RENAME TO mem_jobs;
CREATE INDEX IF NOT EXISTS idx_mem_jobs_pending
  ON mem_jobs (status, created_at) WHERE status = 'pending';
`;

/**
 * Her reading, deliberately not in mem_facts or mem_chunks: retrieval is scored
 * per owner, so anything living there could come back later as a fact about Doc.
 * cur_provenance is append-only and is the only thing that licenses her to say
 * she read something.
 */
const SCHEMA_V7_CURIOSITY = `
CREATE TABLE IF NOT EXISTS cur_sources (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('rss','atom','json','search')),
  url              TEXT NOT NULL,
  interest         TEXT NOT NULL,
  weight           REAL NOT NULL DEFAULT 1,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  last_fetched_at  TEXT,
  last_error       TEXT,
  fail_count       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cur_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES cur_sources(id),
  url           TEXT NOT NULL,
  url_key       TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  excerpt       TEXT,
  interest      TEXT NOT NULL,
  published_at  TEXT,
  seen_at       TEXT NOT NULL,
  score         REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'scanned'
                  CHECK (status IN ('scanned','noted','read','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_cur_items_status
  ON cur_items (status, seen_at);

CREATE TABLE IF NOT EXISTS cur_takes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id           INTEGER NOT NULL REFERENCES cur_items(id),
  interest          TEXT NOT NULL,
  take              TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  surfaced_count    INTEGER NOT NULL DEFAULT 0,
  last_surfaced_at  TEXT,
  stance_id         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cur_takes_created
  ON cur_takes (created_at);

CREATE TABLE IF NOT EXISTS cur_watches (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id         TEXT NOT NULL,
  topic            TEXT NOT NULL,
  query            TEXT NOT NULL,
  cadence_hours    INTEGER NOT NULL DEFAULT 24,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  last_checked_at  TEXT,
  created_at       TEXT NOT NULL,
  UNIQUE (owner_id, topic)
);

CREATE TABLE IF NOT EXISTS cur_provenance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL
                CHECK (kind IN ('scan','read','take','search','surface','mention')),
  item_id     INTEGER,
  detail      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cur_provenance_kind
  ON cur_provenance (kind, created_at);
`;

/**
 * Unfinished business, so a follow-up can be about something real. Nothing here
 * is a fact about Doc: an open thread is a pointer at a message, and it closes
 * as soon as either of them comes back to it.
 */
const SCHEMA_V8_OPEN_THREADS = `
CREATE TABLE IF NOT EXISTS mem_open_threads (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          TEXT NOT NULL,
  kind              TEXT NOT NULL
                      CHECK (kind IN ('she_owes','he_never_answered','time_anchored')),
  topic             TEXT NOT NULL,
  detail            TEXT NOT NULL,
  source_message_id INTEGER,
  due_at            TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','closed','dropped')),
  created_at        TEXT NOT NULL,
  closed_at         TEXT,
  UNIQUE (owner_id, kind, topic)
);
CREATE INDEX IF NOT EXISTS idx_mem_open_threads_owner
  ON mem_open_threads (owner_id, status, created_at);
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
    version = 5;
  }
  if (version < 6) {
    db.exec(SCHEMA_V6_STANCES);
    // The job_type CHECK constraint has to be rebuilt to admit 'stances';
    // SQLite cannot alter a constraint in place.
    const hasJobs = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='mem_jobs'`,
      )
      .get() as { name: string } | undefined;
    if (hasJobs) {
      db.exec(SCHEMA_V6_JOBS);
    }
    db.exec("PRAGMA user_version = 6");
    version = 6;
  }
  if (version < 7) {
    db.exec(SCHEMA_V7_CURIOSITY);
    db.exec("PRAGMA user_version = 7");
    version = 7;
  }
  if (version < 8) {
    db.exec(SCHEMA_V8_OPEN_THREADS);
    const cols = db
      .prepare(`PRAGMA table_info(mem_initiative_log)`)
      .all() as Array<{ name: string }>;
    const has = (name: string) => cols.some((c) => c.name === name);
    // material_key is what stops the same open thread or take going out twice.
    if (!has("material_key")) {
      db.exec(`ALTER TABLE mem_initiative_log ADD COLUMN material_key TEXT`);
    }
    if (!has("candidate_kind")) {
      db.exec(`ALTER TABLE mem_initiative_log ADD COLUMN candidate_kind TEXT`);
    }
    if (!has("feedback")) {
      db.exec(`ALTER TABLE mem_initiative_log ADD COLUMN feedback TEXT`);
    }
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_mem_initiative_material
         ON mem_initiative_log (owner_id, material_key)`,
    );
    db.exec("PRAGMA user_version = 8");
    version = 8;
  }
  if (version < 9) {
    db.exec(`
CREATE TABLE IF NOT EXISTS mem_mood (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          TEXT NOT NULL,
  mood              TEXT NOT NULL,
  rapport           REAL NOT NULL DEFAULT 0.5,
  note              TEXT,
  source_message_id INTEGER,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_mood_owner
  ON mem_mood (owner_id, id DESC);
`);
    db.exec("PRAGMA user_version = 9");
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
