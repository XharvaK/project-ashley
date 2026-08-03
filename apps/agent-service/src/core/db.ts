import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, CONVERSATIONS_DIR, NUCLEAR_DB_PATH } from "../paths.js";

export { NUCLEAR_DB_PATH };

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS identity_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    TEXT NOT NULL,
  layer       TEXT NOT NULL CHECK (layer IN ('stable', 'dynamic')),
  kind        TEXT NOT NULL,
  text        TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('seeded', 'organic', 'manual')),
  revised_from INTEGER,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuclear_identity_owner
  ON identity_entries (owner_id, layer, updated_at DESC);

CREATE TABLE IF NOT EXISTS opinions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     TEXT NOT NULL,
  topic        TEXT NOT NULL,
  stance       TEXT NOT NULL,
  confidence   REAL NOT NULL DEFAULT 0.5,
  revised_from INTEGER,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuclear_opinions_owner
  ON opinions (owner_id, topic, id DESC);

CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    TEXT NOT NULL,
  subject     TEXT NOT NULL CHECK (subject IN ('about_doc', 'about_self', 'about_world')),
  text        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('open', 'pursuing', 'resolved', 'forgotten')),
  priority    REAL NOT NULL DEFAULT 0.5,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_nuclear_questions_open
  ON questions (owner_id, status, priority DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS internal_state (
  owner_id          TEXT PRIMARY KEY,
  focus             TEXT,
  mood              TEXT,
  unfinished_json   TEXT NOT NULL DEFAULT '[]',
  availability      TEXT NOT NULL DEFAULT 'available',
  last_decision_id  INTEGER,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mem_threads (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'archived')),
  channel             TEXT NOT NULL DEFAULT 'discord',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nuclear_threads_active
  ON mem_threads (owner_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS mem_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   TEXT NOT NULL REFERENCES mem_threads(id),
  owner_id    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  text        TEXT NOT NULL,
  channel     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuclear_messages_hot
  ON mem_messages (thread_id, id DESC);

CREATE TABLE IF NOT EXISTS mem_facts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          TEXT NOT NULL,
  category          TEXT NOT NULL
                      CHECK (category IN ('project', 'preference', 'person', 'ongoing', 'pinned')),
  key               TEXT NOT NULL,
  value             TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.8,
  importance        INTEGER NOT NULL DEFAULT 50,
  source_message_id INTEGER,
  superseded_by     INTEGER,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuclear_facts_active
  ON mem_facts (owner_id, importance DESC, id DESC)
  WHERE superseded_by IS NULL;

CREATE TABLE IF NOT EXISTS cur_sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('rss', 'atom', 'json', 'search')),
  url             TEXT NOT NULL,
  interest        TEXT NOT NULL,
  weight          REAL NOT NULL DEFAULT 1,
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_fetched_at TEXT,
  last_error      TEXT
);

CREATE TABLE IF NOT EXISTS cur_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id    INTEGER NOT NULL REFERENCES cur_sources(id),
  url          TEXT NOT NULL,
  url_key      TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  excerpt      TEXT,
  interest     TEXT NOT NULL,
  published_at TEXT,
  seen_at      TEXT NOT NULL,
  score        REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'scanned'
                 CHECK (status IN ('scanned', 'noted', 'read', 'skipped'))
);
CREATE INDEX IF NOT EXISTS idx_nuclear_items_seen
  ON cur_items (seen_at DESC, score DESC);

CREATE TABLE IF NOT EXISTS cur_takes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id      INTEGER NOT NULL REFERENCES cur_items(id),
  interest     TEXT NOT NULL,
  take         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  surfaced_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_nuclear_takes_recent
  ON cur_takes (created_at DESC);

CREATE TABLE IF NOT EXISTS cur_provenance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL
                CHECK (kind IN ('scan', 'read', 'take', 'search', 'surface',
                                'mention', 'link', 'radar')),
  item_id     INTEGER,
  detail      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuclear_provenance_recent
  ON cur_provenance (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS motivations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN (
                 'user_message', 'question', 'fact', 'callback', 'opinion',
                 'take', 'unfinished', 'identity', 'availability', 'silence_signal',
                 'silence_ok'
               )),
  score        REAL NOT NULL,
  ref_type     TEXT,
  ref_id       TEXT,
  summary      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  consumed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_nuclear_motivations_owner
  ON motivations (owner_id, created_at DESC, score DESC);

CREATE TABLE IF NOT EXISTS decision_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id            TEXT NOT NULL,
  channel             TEXT NOT NULL,
  trigger             TEXT NOT NULL CHECK (trigger IN ('reactive', 'proactive')),
  decision_kind       TEXT NOT NULL CHECK (decision_kind IN (
                         'speak', 'silence', 'delay', 'ask', 'revisit',
                         'share', 'challenge'
                       )),
  motivation_ids_json TEXT NOT NULL,
  reason              TEXT NOT NULL,
  outcome_text        TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuclear_decisions_owner
  ON decision_log (owner_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS initiative_reservations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id           TEXT NOT NULL,
  decision_id        INTEGER NOT NULL REFERENCES decision_log(id),
  text               TEXT NOT NULL,
  thread_id          TEXT NOT NULL,
  angle              TEXT NOT NULL,
  reason             TEXT NOT NULL,
  material_key       TEXT,
  discord_message_id TEXT,
  created_at         TEXT NOT NULL,
  committed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_nuclear_reservations_owner
  ON initiative_reservations (owner_id, created_at DESC);
`;

const MIGRATION_2 = `
ALTER TABLE decision_log
  ADD COLUMN learning_subject_kind TEXT;
ALTER TABLE decision_log
  ADD COLUMN learning_adjustment REAL NOT NULL DEFAULT 0;
ALTER TABLE decision_log
  ADD COLUMN learning_through_event_id INTEGER;

CREATE TABLE reflection_events (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id              TEXT NOT NULL,
  kind                  TEXT NOT NULL CHECK (kind IN ('initiative_reaction')),
  source_key            TEXT NOT NULL UNIQUE,
  decision_id           INTEGER,
  reservation_id        INTEGER,
  discord_message_id    TEXT NOT NULL,
  subject_kind          TEXT,
  raw_signal            TEXT NOT NULL,
  classified_signal     TEXT NOT NULL
                            CHECK (classified_signal IN ('positive', 'negative', 'neutral')),
  classifier_version    INTEGER NOT NULL,
  status                TEXT NOT NULL
                            CHECK (status IN ('pending', 'applied', 'ignored')),
  reason                TEXT NOT NULL,
  detail_json           TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL,
  processed_at          TEXT
);
CREATE INDEX idx_reflection_events_owner
  ON reflection_events (owner_id, id DESC);
CREATE INDEX idx_reflection_events_pending
  ON reflection_events (status, owner_id, subject_kind, id);

CREATE TABLE initiative_learning (
  owner_id        TEXT NOT NULL,
  motivation_kind TEXT NOT NULL,
  positive_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  adjustment     REAL NOT NULL DEFAULT 0,
  window_size    INTEGER NOT NULL DEFAULT 0,
  last_event_id  INTEGER,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (owner_id, motivation_kind)
);
`;

function userVersion(db: DatabaseSync): number {
  const row: unknown = db.prepare("PRAGMA user_version").get();
  if (typeof row !== "object" || row === null || !("user_version" in row)) {
    return 0;
  }
  const value = row.user_version;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function migrate(db: DatabaseSync): void {
  db.exec("PRAGMA foreign_keys = ON");
  if (userVersion(db) < 1) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(SCHEMA);
      db.exec("PRAGMA user_version = 1");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  if (userVersion(db) < 2) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_2);
      db.exec("PRAGMA user_version = 2");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function openNuclearDb(existing?: DatabaseSync): DatabaseSync {
  if (existing) {
    migrate(existing);
    return existing;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(CONVERSATIONS_DIR, { recursive: true });
  const db = new DatabaseSync(NUCLEAR_DB_PATH);
  migrate(db);
  return db;
}
