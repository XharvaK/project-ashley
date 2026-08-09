/** Nuclear schema v24 — host-owned model continuity for cognition OCI rows. */
export const MIGRATION_24_OPEN_COGNITIVE_ITEMS_DDL = `
ALTER TABLE open_cognitive_items
  ADD COLUMN model_identity TEXT NOT NULL DEFAULT '';
`;

export const MIGRATION_24_OPEN_COGNITIVE_WAKE_CURSOR_DDL = `
CREATE TABLE IF NOT EXISTS open_cognitive_item_wake_cursor (
  owner_id       TEXT PRIMARY KEY,
  after_item_id  INTEGER NOT NULL DEFAULT 0 CHECK (after_item_id >= 0),
  updated_at     TEXT NOT NULL
);
`;
