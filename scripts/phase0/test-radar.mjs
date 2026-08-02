#!/usr/bin/env node
/**
 * Open-turn radar integration (no live agent): builds scratch memory DBs seeded
 * with a source, two untouched items, and a formed take; drives
 * assembleCuriosity(mode=solicited) directly against the built dist.
 *
 * Proves the "more alive" wiring: takes win when there is a take, radar shows a
 * real untouched title on an open ask when there is none, the hourly cap holds,
 * and an empty reader falls back to an honest disposition, never a void "not
 * much, just here".
 */
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

// Must be "true" before env.js is imported.
process.env.CURIOSITY_ENABLED = "true";

const { assembleCuriosity, commitCuriosity } = await import(
  pathToFileURL(join(root, "apps/agent-service/dist/curiosity/inject.js")).href
);
const { migrate } = await import(
  pathToFileURL(join(root, "apps/agent-service/dist/memory/db.js")).href
);
const {
  upsertSource,
  insertItem,
  insertTake,
  countProvenance,
} = await import(
  pathToFileURL(join(root, "apps/agent-service/dist/curiosity/store.js")).href
);

function makeDb() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  upsertSource(db, {
    slug: "fixture",
    title: "Fixture",
    kind: "rss",
    url: "http://fixture.invalid/feed",
    interest: "dev",
  });
  insertItem(db, {
    sourceId: 1,
    url: "https://fixture.invalid/p/radar-one",
    title: "Radar One",
    excerpt: "a real gist about receptor kinetics",
    interest: "dev",
    publishedAt: null,
    score: 3,
  });
  insertItem(db, {
    sourceId: 1,
    url: "https://fixture.invalid/p/radar-two",
    title: "Radar Two",
    excerpt: "another real gist, lower score",
    interest: "dev",
    publishedAt: null,
    score: 1,
  });
  return db;
}

try {
  // 1. A formed take must win: takes first, radar only when none.
  const withTakeDb = makeDb();
  insertTake(withTakeDb, {
    itemId: 1,
    interest: "dev",
    take: "a real formed take",
  });
  const withTake = await assembleCuriosity(withTakeDb, "what's up", {
    mode: "solicited",
    askKind: "general",
  });
  if (!withTake || withTake.provenance !== "mention") {
    throw new Error(`takes-first broken: ${withTake?.provenance}`);
  }
  if (!/formed take/.test(withTake.text)) {
    throw new Error(`formed take not offered:\n${withTake.text}`);
  }

  // 2. No take, radar material exists: real tag offered, guarded as radar.
  const radarDb = makeDb();
  const radar = await assembleCuriosity(radarDb, "what's up", {
    mode: "solicited",
    askKind: "general",
  });
  if (!radar) throw new Error("no radar injection on null-take general ask");
  if (radar.provenance !== "radar") throw new Error(`provenance=${radar.provenance}, want radar`);
  if (!/Radar One/.test(radar.text) || !/never claim you read/i.test(radar.text)) {
    throw new Error(`radar text lost the title or the honesty guard:\n${radar.text}`);
  }

  // 2b. Committing stamps the cap, so a second general ask goes quiet.
  commitCuriosity(radarDb, radar);
  if (countProvenance(radarDb, "radar", 24) !== 1) {
    throw new Error("radar provenance was not committed");
  }
  const after = await assembleCuriosity(radarDb, "what's up", {
    mode: "solicited",
    askKind: "general",
  });
  if (!after || after.provenance === "radar") {
    throw new Error("hourly radar cap not respected");
  }

  // 3. Empty reader: honest disposition fallback, never a void answer.
  const empty = new DatabaseSync(":memory:");
  migrate(empty);
  const fallback = await assembleCuriosity(empty, "what's up", {
    mode: "solicited",
    askKind: "general",
  });
  if (!fallback || !/present-tense/.test(fallback.text)) {
    throw new Error(`no disposition fallback on an empty reader:\n${fallback?.text}`);
  }

  console.log("OK open-turn radar fixture sweep");
  console.log("  takes win :", withTake.text.split(".")[0]);
  console.log("  radar     :", radar.text.split("\n")[0]);
  console.log("  capped    :", after.provenance);
  console.log("  fallback  :", fallback.text.split(".")[0]);
} catch (err) {
  console.error("FAIL radar:", err.message);
  process.exitCode = 1;
}