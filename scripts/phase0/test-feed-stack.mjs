#!/usr/bin/env node
/**
 * Feed-stack live-sweep integration (no real network): a local fixture HTTP
 * server serves one Atom, one RSS, and one down (503) feed; a scratch memory DB
 * is seeded against those URLs; verifyFeedStack sweeps it and we assert the
 * report reflects what actually served, the ledger (cur_sources) and scan
 * provenance were written, and a second sweep is a no-op for items (dedupe).
 *
 * This is the "is the old feed actually gone" proof: the report's atom feed is
 * real (parsed from the fixture), the down feed says it is down, and nothing
 * can claim "still on the old feed" from this run.
 */
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

// Must be "true" before env.js is imported.
process.env.CURIOSITY_ENABLED = "true";

const { verifyFeedStack, buildFeedStackDigest, buildFeedStackNote } = await import(
  pathToFileURL(join(root, "apps/agent-service/dist/curiosity/feed-stack.js")).href
);
const { migrate } = await import(
  pathToFileURL(join(root, "apps/agent-service/dist/memory/db.js")).href
);
const { upsertSource, countProvenance } = await import(
  pathToFileURL(join(root, "apps/agent-service/dist/curiosity/store.js")).href
);

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Fixture Atom</title><id>urn:fixture:atom</id>
  <entry>
    <title>atom one</title>
    <id>https://fixture.invalid/p/atom-one</id>
    <link href="https://fixture.invalid/p/atom-one"/>
    <updated>2026-01-01T00:00:00Z</updated>
  </entry>
  <entry>
    <title>atom two</title>
    <id>https://fixture.invalid/p/atom-two</id>
    <link href="https://fixture.invalid/p/atom-two"/>
    <updated>2026-01-02T00:00:00Z</updated>
  </entry>
</feed>`;

const RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <title>Fixture RSS</title>
  <item><title>rss one</title><link>https://fixture.invalid/p/rss-one</link><guid>https://fixture.invalid/p/rss-one</guid></item>
  <item><title>rss two</title><link>https://fixture.invalid/p/rss-two</link><guid>https://fixture.invalid/p/rss-two</guid></item>
</channel></rss>`;

const server = createServer((req, res) => {
  if (req.url === "/atom.xml") {
    res.writeHead(200, { "Content-Type": "application/atom+xml; charset=utf-8" });
    res.end(ATOM);
  } else if (req.url === "/rss.xml") {
    res.writeHead(200, { "Content-Type": "application/rss+xml; charset=utf-8" });
    res.end(RSS);
  } else {
    res.writeHead(503);
    res.end("down");
  }
});

let port = 0;
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
port = server.address().port;

const base = `http://127.0.0.1:${port}`;
const db = new DatabaseSync(":memory:");
migrate(db);
upsertSource(db, {
  slug: "fixture-atom",
  title: "Fixture Atom",
  kind: "atom",
  url: `${base}/atom.xml`,
  interest: "dev",
});
upsertSource(db, {
  slug: "fixture-rss",
  title: "Fixture RSS",
  kind: "rss",
  url: `${base}/rss.xml`,
  interest: "dev",
});
upsertSource(db, {
  slug: "fixture-down",
  title: "Fixture Down",
  kind: "rss",
  url: `${base}/down.xml`,
  interest: "dev",
});

const one = (sql, ...params) => db.prepare(sql).get(...params);

try {
  const report = await verifyFeedStack(db);
  if (!report) throw new Error("verify returned null (CURIOSITY_ENABLED?)");
  if (report.total !== 3) throw new Error(`report.total=${report.total}, want 3`);
  if (report.ok !== 2) throw new Error(`report.ok=${report.ok}, want 2`);
  if (report.failed !== 1) throw new Error(`report.failed=${report.failed}, want 1`);

  const bySlug = Object.fromEntries(report.sources.map((s) => [s.slug, s]));
  const atom = bySlug["fixture-atom"];
  const rss = bySlug["fixture-rss"];
  const down = bySlug["fixture-down"];

  if (!atom || atom.live !== "atom" || !atom.ok || atom.items !== 2) {
    throw new Error(`bad atom row: ${JSON.stringify(atom)}`);
  }
  if (!rss || rss.live !== "rss" || !rss.ok || rss.items !== 2) {
    throw new Error(`bad rss row: ${JSON.stringify(rss)}`);
  }
  if (!down || down.ok || !/http_503/.test(down.error ?? "")) {
    throw new Error(`bad down row: ${JSON.stringify(down)}`);
  }

  const note = buildFeedStackNote(report);
  if (!/Fixture Atom: atom, 2 items/.test(note)) throw new Error(`note missing atom verdict:\n${note}`);
  if (!/Fixture Down: not answering/.test(note)) throw new Error(`note missing down verdict:\n${note}`);

  const digest = buildFeedStackDigest(report);
  if (!/2 of 3 sources live/.test(digest)) throw new Error(`digest wrong: ${digest}`);

  // cur_feed ledger: both live scans stamped, down feed recorded its failure.
  const liveStamps = db
    .prepare(`SELECT slug FROM cur_sources WHERE last_fetched_at IS NOT NULL`)
    .all()
    .map((r) => r.slug)
    .sort();
  if (JSON.stringify(liveStamps) !== JSON.stringify(["fixture-atom", "fixture-down", "fixture-rss"])) {
    throw new Error(`stamps wrong: ${liveStamps}`);
  }
  const downFail = one(`SELECT fail_count AS c FROM cur_sources WHERE slug='fixture-down'`);
  if (downFail.c !== 1) throw new Error(`down fail_count=${downFail.c}, want 1`);
  const atomFail = one(`SELECT fail_count AS c FROM cur_sources WHERE slug='fixture-atom'`);
  if (atomFail.c !== 0) throw new Error(`atom fail_count=${atomFail.c}, want 0`);

  // One scan provenance row per live sweep source.
  const scanRowsBefore = countProvenance(db, "scan", 24);
  if (scanRowsBefore !== 2) throw new Error(`scan provenance=${scanRowsBefore}, want 2`);

  // Items actually stored from the sweep.
  const itemsBefore = one(`SELECT COUNT(*) AS c FROM cur_items`).c;
  if (itemsBefore !== 4) throw new Error(`items=${itemsBefore}, want 4`);

  // Second sweep: no duplicate items, one more scan row per live source.
  const report2 = await verifyFeedStack(db);
  if (!report2 || report2.total !== 3) throw new Error("second sweep failed");
  if (report2.ok !== 2 || report2.failed !== 1) throw new Error("second sweep verdicts drifted");
  const itemsAfter = one(`SELECT COUNT(*) AS c FROM cur_items`).c;
  if (itemsAfter !== 4) throw new Error(`items after dedupe=${itemsAfter}, want 4`);
  const scanRowsAfter = countProvenance(db, "scan", 24);
  if (scanRowsAfter !== 4) throw new Error(`scan provenance after=${scanRowsAfter}, want 4`);

  console.log("OK feed-stack fixture sweep");
  console.log("  digest:", digest);
  console.log("  note:");
  note.split("\n").forEach((l) => console.log("    " + l));
  process.exitCode = 0;
} catch (err) {
  console.error("FAIL feed-stack:", err.message);
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  server.close();
}