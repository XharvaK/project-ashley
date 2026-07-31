import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../memory/db.js";
import {
  deriveWatchTopics,
  hitMatchesWatch,
  syncWatchesFromFacts,
} from "./watches.js";

describe("deriveWatchTopics", () => {
  const facts = [
    {
      category: "project",
      key: "website-factory",
      value: "runs a site pipeline called Website Factory",
    },
    {
      category: "ongoing",
      key: "mint-server",
      value: "moved Ashley onto a Linux Mint laptop server",
    },
    { category: "preference", key: "coffee", value: "drinks filter coffee" },
    { category: "project", key: "tiny", value: "cs2" },
  ];

  it("only watches projects and ongoing threads", () => {
    const topics = deriveWatchTopics(facts, 5);
    expect(topics.map((t) => t.topic)).toEqual([
      "website-factory",
      "mint-server",
    ]);
  });

  it("respects the max so search credits stay bounded", () => {
    expect(deriveWatchTopics(facts, 1)).toHaveLength(1);
  });

  it("rejects ephemeral worked-on / duration facts", () => {
    expect(
      deriveWatchTopics(
        [
          {
            category: "project",
            key: "user_worked_on_assistant_for_10_hours",
            value: "worked ~10 hours on you",
          },
        ],
        5,
      ),
    ).toEqual([]);
  });

  it("rejects clock / stopped / mood facts", () => {
    expect(
      deriveWatchTopics(
        [
          {
            category: "ongoing",
            key: "current_time_gmt_plus_3",
            value: "current time is GMT+3 in Izmir",
          },
          {
            category: "ongoing",
            key: "stopped_gaming_last_month",
            value: "stopped gaming last month after burnout",
          },
        ],
        5,
      ),
    ).toEqual([]);
  });

  it("rejects facts with valid_until (temporary)", () => {
    expect(
      deriveWatchTopics(
        [
          {
            category: "ongoing",
            key: "website-factory",
            value: "runs a site pipeline called Website Factory",
            valid_until: "2099-01-01T00:00:00.000Z",
          },
        ],
        5,
      ),
    ).toEqual([]);
  });
});

describe("hitMatchesWatch", () => {
  it("rejects hours-saved hits that do not overlap the watch topic", () => {
    expect(
      hitMatchesWatch(
        {
          title: "How I Work With My Assistant To Save 80 Hours Per Month",
          snippet: "spreadsheet theater and productivity framing",
        },
        {
          topic: "website-factory",
          query: "runs a site pipeline called Website Factory",
        },
      ),
    ).toBe(false);
  });

  it("accepts hits that share durable topic tokens", () => {
    expect(
      hitMatchesWatch(
        {
          title: "Website Factory pipeline notes for static sites",
          snippet: "Website Factory deploy and redesign pipeline",
        },
        {
          topic: "website-factory",
          query: "runs a site pipeline called Website Factory",
        },
      ),
    ).toBe(true);
  });
});

describe("syncWatchesFromFacts", () => {
  let db: DatabaseSync;
  const OWNER = "doc";

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrate(db);
  });

  afterEach(() => db.close());

  it("disables watches whose topics are no longer eligible", () => {
    syncWatchesFromFacts(
      db,
      OWNER,
      [
        {
          category: "project",
          key: "website-factory",
          value: "runs a site pipeline called Website Factory",
        },
        {
          category: "project",
          key: "user_worked_on_assistant_for_10_hours",
          value: "worked ~10 hours on you",
        },
      ],
      5,
    );
    const enabled = db
      .prepare(
        `SELECT topic, enabled FROM cur_watches WHERE owner_id = ? ORDER BY topic`,
      )
      .all(OWNER) as Array<{ topic: string; enabled: number }>;
    expect(enabled).toEqual([{ topic: "website-factory", enabled: 1 }]);

    // Simulate leftover junk watch from before the filter.
    db.prepare(
      `INSERT INTO cur_watches (owner_id, topic, query, cadence_hours, enabled, created_at)
       VALUES (?, 'user_worked_on_assistant_for_10_hours', 'worked hours', 24, 1, datetime('now'))`,
    ).run(OWNER);

    syncWatchesFromFacts(
      db,
      OWNER,
      [
        {
          category: "project",
          key: "website-factory",
          value: "runs a site pipeline called Website Factory",
        },
      ],
      5,
    );
    const junk = db
      .prepare(
        `SELECT enabled FROM cur_watches WHERE owner_id = ? AND topic = ?`,
      )
      .get(OWNER, "user_worked_on_assistant_for_10_hours") as {
      enabled: number;
    };
    expect(junk.enabled).toBe(0);
  });
});
