/** Nuclear schema v24 — host-owned model continuity for cognition OCI rows. */
export const MIGRATION_24_OPEN_COGNITIVE_ITEMS_DDL = `
ALTER TABLE open_cognitive_items
  ADD COLUMN model_identity TEXT NOT NULL DEFAULT '';
ALTER TABLE open_cognitive_items
  ADD COLUMN semantic_identity_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE open_cognitive_items
  ADD COLUMN continuity_generation TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_open_cognitive_items_semantic_generation
  ON open_cognitive_items (owner_id, semantic_identity_hash, continuity_generation);
`;

export const MIGRATION_24_OPEN_COGNITIVE_WAKE_CURSOR_DDL = `
CREATE TABLE IF NOT EXISTS open_cognitive_item_wake_cursor (
  owner_id       TEXT PRIMARY KEY,
  after_item_id  INTEGER NOT NULL DEFAULT 0 CHECK (after_item_id >= 0),
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_open_cognitive_items_owner_status_id
  ON open_cognitive_items (owner_id, status, id);
CREATE INDEX IF NOT EXISTS idx_open_cognitive_item_attention_review_due
  ON open_cognitive_item_attention (review_requested_at, item_id);
`;
