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

const MIGRATION_3 = `
ALTER TABLE decision_log ADD COLUMN objective TEXT;
ALTER TABLE decision_log ADD COLUMN evidence_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE decision_log ADD COLUMN effort TEXT NOT NULL DEFAULT 'low';
ALTER TABLE decision_log ADD COLUMN completion TEXT NOT NULL DEFAULT 'complete';
ALTER TABLE decision_log ADD COLUMN uncertainty REAL NOT NULL DEFAULT 0;
ALTER TABLE decision_log ADD COLUMN urgency REAL NOT NULL DEFAULT 0;
ALTER TABLE decision_log ADD COLUMN affect_license_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE episodes (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id                TEXT NOT NULL,
  thread_id               TEXT NOT NULL REFERENCES mem_threads(id),
  summary                 TEXT NOT NULL,
  entities                TEXT NOT NULL DEFAULT '',
  source_start_message_id INTEGER NOT NULL REFERENCES mem_messages(id),
  source_end_message_id   INTEGER NOT NULL REFERENCES mem_messages(id),
  salience                REAL NOT NULL DEFAULT 0.5,
  unresolved              INTEGER NOT NULL DEFAULT 0 CHECK (unresolved IN (0, 1)),
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'forgotten')),
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  UNIQUE(owner_id, thread_id, source_start_message_id, source_end_message_id)
);
CREATE INDEX idx_episodes_owner
  ON episodes (owner_id, status, unresolved DESC, salience DESC, updated_at DESC);

CREATE TABLE episode_messages (
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES mem_messages(id),
  PRIMARY KEY (episode_id, message_id)
);

CREATE VIRTUAL TABLE episodes_fts USING fts5(summary, entities);

CREATE TABLE mind_state_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN (
                'goal', 'concern', 'commitment', 'interest', 'unfinished'
              )),
  text        TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  activation  REAL NOT NULL DEFAULT 0.5,
  urgency     REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'resolved', 'forgotten')),
  due_at      TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE(owner_id, kind, source_type, source_id)
);
CREATE INDEX idx_mind_state_active
  ON mind_state_items (owner_id, status, urgency DESC, activation DESC, updated_at DESC);

CREATE TABLE affective_state (
  owner_id    TEXT PRIMARY KEY,
  valence     REAL NOT NULL DEFAULT 0,
  activation  REAL NOT NULL DEFAULT 0.5,
  openness    REAL NOT NULL DEFAULT 0.5,
  tension     REAL NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL DEFAULT 'neutral baseline',
  source_type TEXT,
  source_id   TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE affective_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id         TEXT NOT NULL,
  source_type      TEXT NOT NULL,
  source_id        TEXT NOT NULL,
  valence_delta    REAL NOT NULL,
  activation_delta REAL NOT NULL,
  openness_delta   REAL NOT NULL,
  tension_delta    REAL NOT NULL,
  reason           TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  UNIQUE(owner_id, source_type, source_id)
);
CREATE INDEX idx_affective_events_owner
  ON affective_events (owner_id, created_at DESC);

CREATE TABLE cognitive_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind = 'consolidate_thread'),
  source_key    TEXT NOT NULL UNIQUE,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  available_at  TEXT NOT NULL,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_cognitive_jobs_due
  ON cognitive_jobs (status, available_at, id);

CREATE TABLE cognitive_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      INTEGER NOT NULL REFERENCES cognitive_jobs(id),
  owner_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  model       TEXT,
  input_json  TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  error       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_cognitive_runs_owner
  ON cognitive_runs (owner_id, created_at DESC);

CREATE TABLE evidence_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE(owner_id, target_type, target_id, source_type, source_id)
);

CREATE TABLE learning_revisions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id       TEXT NOT NULL,
  target_layer   TEXT NOT NULL CHECK (target_layer IN (
                   'dynamic_identity', 'stable_identity', 'opinion'
                 )),
  target_key     TEXT NOT NULL,
  previous_value TEXT,
  proposed_value TEXT NOT NULL,
  rationale      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed', 'applied', 'reverted', 'rejected')),
  apply_after    TEXT NOT NULL,
  applied_at     TEXT,
  reverted_at    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_learning_revisions_owner
  ON learning_revisions (owner_id, status, target_layer, target_key, created_at DESC);
`;

const MIGRATION_4 = `
ALTER TABLE decision_log ADD COLUMN thought_source TEXT NOT NULL DEFAULT 'deterministic'
  CHECK (thought_source IN ('deterministic', 'model', 'fallback'));
ALTER TABLE decision_log ADD COLUMN thought_error TEXT;

ALTER TABLE mind_state_items ADD COLUMN wake_state TEXT NOT NULL DEFAULT 'consumed'
  CHECK (wake_state IN ('pending', 'claimed', 'consumed'));
ALTER TABLE mind_state_items ADD COLUMN wake_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mind_state_items ADD COLUMN next_wake_at TEXT;
ALTER TABLE mind_state_items ADD COLUMN claimed_at TEXT;
ALTER TABLE mind_state_items ADD COLUMN surfaced_at TEXT;
UPDATE mind_state_items
SET wake_state = 'pending', next_wake_at = updated_at
WHERE status = 'active' AND urgency >= 0.85
  AND kind IN ('commitment', 'concern');
CREATE INDEX idx_mind_state_wake
  ON mind_state_items (owner_id, status, wake_state, next_wake_at, urgency DESC);

ALTER TABLE mem_facts ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy'
  CHECK (origin IN ('legacy', 'manual', 'explicit_user'));
ALTER TABLE mem_facts ADD COLUMN source_quote TEXT;

ALTER TABLE cognitive_runs ADD COLUMN episode_id INTEGER REFERENCES episodes(id);
CREATE INDEX idx_cognitive_runs_episode ON cognitive_runs (episode_id);

ALTER TABLE learning_revisions ADD COLUMN applied_target_id INTEGER;

CREATE INDEX idx_episodes_thread_end
  ON episodes (owner_id, thread_id, source_end_message_id DESC);
`;

const MIGRATION_5 = `
CREATE TABLE forget_receipts (
  id                    TEXT PRIMARY KEY,
  owner_id              TEXT NOT NULL,
  messages_redacted     INTEGER NOT NULL DEFAULT 0,
  episodes_forgotten    INTEGER NOT NULL DEFAULT 0,
  facts_reconciled      INTEGER NOT NULL DEFAULT 0,
  revisions_reconciled  INTEGER NOT NULL DEFAULT 0,
  state_reconciled      INTEGER NOT NULL DEFAULT 0,
  evidence_removed      INTEGER NOT NULL DEFAULT 0,
  runs_redacted         INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL
);
CREATE INDEX idx_forget_receipts_owner
  ON forget_receipts (owner_id, created_at DESC);

ALTER TABLE mem_messages ADD COLUMN redacted_at TEXT;
ALTER TABLE mem_messages ADD COLUMN redaction_receipt_id TEXT
  REFERENCES forget_receipts(id);
CREATE INDEX idx_nuclear_messages_visible
  ON mem_messages (thread_id, redacted_at, id DESC);

CREATE TABLE cur_reads (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id                INTEGER NOT NULL UNIQUE REFERENCES cur_items(id),
  final_url              TEXT NOT NULL,
  content_hash           TEXT NOT NULL,
  retrieved_at           TEXT NOT NULL,
  model                  TEXT NOT NULL,
  model_metadata_json    TEXT NOT NULL DEFAULT '{}',
  evidence_excerpts_json TEXT NOT NULL DEFAULT '[]',
  cleaned_chars          INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL
);
CREATE INDEX idx_cur_reads_recent ON cur_reads (retrieved_at DESC, id DESC);

ALTER TABLE cur_takes ADD COLUMN evidence_kind TEXT NOT NULL DEFAULT 'scan_excerpt'
  CHECK (evidence_kind IN ('scan_excerpt', 'read_record'));
ALTER TABLE cur_takes ADD COLUMN read_id INTEGER REFERENCES cur_reads(id);
CREATE INDEX idx_cur_takes_evidence ON cur_takes (evidence_kind, read_id, created_at DESC);
`;

const MIGRATION_6 = `
CREATE TABLE capability_releases (
  capability       TEXT NOT NULL,
  release_id       TEXT NOT NULL,
  state            TEXT NOT NULL DEFAULT 'observe'
                     CHECK (state IN ('observe', 'active', 'rolled_back', 'disabled')),
  eval_seed_count  INTEGER NOT NULL DEFAULT 0,
  qualified_at     TEXT,
  promoted_at      TEXT,
  rolled_back_at   TEXT,
  failure_kind     TEXT,
  failure_reason   TEXT,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (capability, release_id)
);
CREATE INDEX idx_capability_releases_state
  ON capability_releases (release_id, state, capability);

CREATE TABLE capability_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  capability  TEXT NOT NULL,
  release_id  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN (
                'isolated_eval', 'live_shadow', 'behavioral_breach',
                'critical_failure'
              )),
  source_key  TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  UNIQUE(capability, release_id, kind, source_key),
  FOREIGN KEY (capability, release_id)
    REFERENCES capability_releases(capability, release_id)
);
CREATE INDEX idx_capability_events_window
  ON capability_events (capability, release_id, kind, occurred_at DESC);
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
  if (userVersion(db) < 3) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_3);
      db.exec("PRAGMA user_version = 3");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  if (userVersion(db) < 4) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_4);
      db.exec("PRAGMA user_version = 4");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  if (userVersion(db) < 5) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_5);
      db.exec("PRAGMA user_version = 5");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  if (userVersion(db) < 6) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_6);
      db.exec("PRAGMA user_version = 6");
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
