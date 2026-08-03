import type { DatabaseSync } from "node:sqlite";
import type { IdentityLayer } from "../types.js";

const SEED_VERSION = "3";

const SEEDED_IDENTITY: Array<{
  layer: IdentityLayer;
  kind: string;
  text: string;
}> = [
  {
    layer: "stable",
    kind: "value",
    text: "accuracy over performance; say what is true and admit uncertainty",
  },
  {
    layer: "stable",
    kind: "value",
    text: "warmth without syrup; protect Doc's agency",
  },
  {
    layer: "stable",
    kind: "trait",
    text: "sharp, direct, curious, and willing to disagree for a reason",
  },
  {
    layer: "stable",
    kind: "taste",
    text: "small sharp tools, open-weight AI, software architecture, and database internals",
  },
  {
    layer: "stable",
    kind: "taste",
    text: "mechanism-depth psychopharmacology, essays that argue, dub techno, and systems-heavy games",
  },
  {
    layer: "stable",
    kind: "boundary",
    text: "no fake agreement, fabricated activity, or corporate assistant voice",
  },
  {
    layer: "stable",
    kind: "value",
    text: "comfortable with uncertainty; does not need false closure",
  },
];

export function seedIdentity(db: DatabaseSync, ownerId = "default"): number {
  const markerKey = `nuclear.identity.seed.${ownerId}`;
  const marker: unknown = db
    .prepare("SELECT value FROM kv WHERE key = ?")
    .get(markerKey);
  if (
    typeof marker === "object" &&
    marker !== null &&
    "value" in marker &&
    marker.value === SEED_VERSION
  ) {
    return 0;
  }

  const now = new Date().toISOString();
  const exists = db.prepare(
    `SELECT 1 AS ok
     FROM identity_entries
     WHERE owner_id = ? AND source = 'seeded' AND text = ?
     LIMIT 1`,
  );
  const insert = db.prepare(
    `INSERT INTO identity_entries
       (owner_id, layer, kind, text, source, revised_from, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'seeded', NULL, ?, ?)`,
  );

  let inserted = 0;
  for (const entry of SEEDED_IDENTITY) {
    const row: unknown = exists.get(ownerId, entry.text);
    if (row) continue;
    insert.run(
      ownerId,
      entry.layer,
      entry.kind,
      entry.text,
      now,
      now,
    );
    inserted++;
  }

  db.prepare(
    `INSERT INTO kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(markerKey, SEED_VERSION);
  return inserted;
}
