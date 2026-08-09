/** Nuclear schema v24 — host-owned model continuity for cognition OCI rows. */
export const MIGRATION_24_OPEN_COGNITIVE_ITEMS_DDL = `
ALTER TABLE open_cognitive_items
  ADD COLUMN model_identity TEXT NOT NULL DEFAULT '';
`;
