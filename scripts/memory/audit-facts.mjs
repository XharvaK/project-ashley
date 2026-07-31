#!/usr/bin/env node
/**
 * Read-only audit of suspect standing facts. Opt-in purge with --purge after review.
 *
 *   node scripts/memory/audit-facts.mjs
 *   node scripts/memory/audit-facts.mjs --db path\to\index.db
 *   node scripts/memory/audit-facts.mjs --purge
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const purge = args.includes("--purge");
const dbIdx = args.indexOf("--db");
const dbPath =
  dbIdx >= 0 && args[dbIdx + 1]
    ? args[dbIdx + 1]
    : join(homedir(), ".composer-assistant", "conversations", "index.db");

if (!existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}

const PRONOUN_ONLY =
  /^(you|me|i|we|they|he|she|it|sen|ben|biz|siz|o|bu|şu)$/i;
const BANTER =
  /\b(şapşik|aptal|salak|lol|haha|lmao|idiot|dummy|sensin)\b/i;
const MULTI_CLAUSE = /[.!?…].*[.!?…]|,.*,|;/;

/** @param {{ id: number, category: string, key: string, value: string, confidence: number }} f */
function reasons(f) {
  const out = [];
  const v = String(f.value).trim();
  if (PRONOUN_ONLY.test(v)) out.push("pronoun-only");
  if (v.length < 3) out.push("too-short");
  if (v.length > 120) out.push("too-long");
  if (BANTER.test(v)) out.push("banter-shaped");
  if (MULTI_CLAUSE.test(v)) out.push("multi-clause");
  if (/\b(you|sen)\b/i.test(v) && f.category === "project") {
    out.push("second-person-project");
  }
  if (f.key === "current_project" && /^(you|me|it|this)$/i.test(v)) {
    out.push("bogus-project-name");
  }
  return out;
}

const db = new DatabaseSync(dbPath, { readOnly: !purge });
const facts = db
  .prepare(
    `SELECT id, owner_id, category, key, value, confidence, superseded_by
     FROM mem_facts
     WHERE superseded_by IS NULL
     ORDER BY id ASC`,
  )
  .all();

const suspects = [];
for (const f of facts) {
  const why = reasons(f);
  if (why.length) suspects.push({ ...f, why });
}

console.log(`DB: ${dbPath}`);
console.log(`Active facts: ${facts.length}`);
console.log(`Suspect: ${suspects.length}`);
console.log("");

for (const s of suspects) {
  console.log(
    `#${s.id} [${s.category}/${s.key}] conf=${s.confidence} :: ${s.value}`,
  );
  console.log(`  reasons: ${s.why.join(", ")}`);
}

if (!purge) {
  console.log("");
  console.log("Read-only. Re-run with --purge to soft-supersede listed facts.");
  db.close();
  process.exit(0);
}

if (suspects.length === 0) {
  console.log("Nothing to purge.");
  db.close();
  process.exit(0);
}

const now = new Date().toISOString();
const upd = db.prepare(
  `UPDATE mem_facts SET superseded_by = id, last_confirmed_at = ? WHERE id = ?`,
);
db.exec("BEGIN");
try {
  for (const s of suspects) {
    upd.run(now, s.id);
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}
console.log(`Purged (superseded) ${suspects.length} fact(s).`);
db.close();
