import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../memory/db.js";
import {
  assembleCuriosity,
  buildRadarBlock,
  commitCuriosity,
} from "./inject.js";
import {
  countProvenance,
  insertItem,
  insertTake,
  radarItems,
  upsertSource,
} from "./store.js";

function db(): DatabaseSync {
  const conn = new DatabaseSync(":memory:");
  migrate(conn);
  return conn;
}

function seed(conn: DatabaseSync): void {
  upsertSource(conn, {
    slug: "s1",
    title: "Source",
    kind: "rss",
    url: "https://example.com/feed",
    interest: "dev",
  });
  insertItem(conn, {
    sourceId: 1,
    url: "https://fixture.invalid/p/radar-one",
    title: "Radar One",
    excerpt: "a real gist about receptor kinetics",
    interest: "dev",
    publishedAt: null,
    score: 3,
  });
  insertItem(conn, {
    sourceId: 1,
    url: "https://fixture.invalid/p/radar-two",
    title: "Radar Two",
    excerpt: "another real gist, lower score",
    interest: "dev",
    publishedAt: null,
    score: 1,
  });
}

describe("radarItems", () => {
  let conn: DatabaseSync;
  beforeEach(() => {
    conn = db();
    seed(conn);
  });

  it("returns untouched scanned items with excerpts, score-first", () => {
    const rows = radarItems(conn, 24, 2);
    expect(rows.map((r) => r.title)).toEqual(["Radar One", "Radar Two"]);
  });

  it("excludes items already turned into takes", () => {
    insertTake(conn, { itemId: 1, interest: "dev", take: "formed take" });
    const rows = radarItems(conn, 24, 2);
    expect(rows.map((r) => r.title)).toEqual(["Radar Two"]);
  });

  it("excludes items without an excerpt", () => {
    insertItem(conn, {
      sourceId: 1,
      url: "https://fixture.invalid/p/no-excerpt",
      title: "No Excerpt",
      excerpt: "",
      interest: "dev",
      publishedAt: null,
      score: 9,
    });
    const rows = radarItems(conn, 24, 2);
    expect(rows.map((r) => r.title)).not.toContain("No Excerpt");
    expect(rows.map((r) => r.title)).toEqual(["Radar One", "Radar Two"]);
  });
});

describe("radar solicited path", () => {
  let conn: DatabaseSync;
  beforeEach(() => {
    conn = db();
    seed(conn);
  });

  it("offers radar on a general ask when no take exists", async () => {
    const injection = await assembleCuriosity(conn, "what's up", {
      mode: "solicited",
      askKind: "general",
    });
    expect(injection?.provenance).toBe("radar");
    expect(injection?.takeIds).toEqual([]);
    expect(injection?.text).toContain("Radar One");
  });

  it("keeps takes first: a formed take wins over radar", async () => {
    insertTake(conn, { itemId: 1, interest: "dev", take: "a real take" });
    const injection = await assembleCuriosity(conn, "what's up", {
      mode: "solicited",
      askKind: "general",
    });
    expect(injection?.provenance).toBe("mention");
    expect(injection?.takeIds).toEqual([1]);
  });

  it("caps radar to once an hour via provenance", async () => {
    const first = await assembleCuriosity(conn, "what's up", {
      mode: "solicited",
      askKind: "general",
    });
    expect(first?.provenance).toBe("radar");
    commitCuriosity(conn, first);
    expect(countProvenance(conn, "radar", 1)).toBe(1);

    const second = await assembleCuriosity(conn, "what's up", {
      mode: "solicited",
      askKind: "general",
    });
    expect(second?.provenance).toBe("mention");
  });

  it("falls back to honest disposition when nothing is on the radar", async () => {
    const empty = db();
    const injection = await assembleCuriosity(empty, "what's up", {
      mode: "solicited",
      askKind: "general",
    });
    expect(injection?.provenance).toBe("mention");
    expect(injection?.text).toContain("present-tense");
  });

  it("reading asks do not pull radar", async () => {
    const injection = await assembleCuriosity(conn, "what have you been reading?", {
      mode: "solicited",
      askKind: "reading",
    });
    expect(injection?.provenance).toBe("mention");
  });
});

describe("buildRadar", () => {
  it("returns null for empty input and lists real titles otherwise", () => {
    expect(buildRadarBlock([])).toBeNull();
    const text = buildRadarBlock([
      { id: 1, title: "T1", excerpt: "gist", interest: "dev" },
    ]);
    expect(text).toContain("T1");
    expect(text).toContain("gist");
    expect(text).toMatch(/never claim you read/i);
  });
});