import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { env } from "../env.js";
import { migrate } from "../memory/db.js";
import {
  reserveTavilyCredit,
  tavilyBudgetAvailable,
  tavilyCreditsUsed,
  tavilyDayUsed,
} from "./tavily-budget.js";

function db(): DatabaseSync {
  const conn = new DatabaseSync(":memory:");
  migrate(conn);
  return conn;
}

describe("tavily monthly ledger", () => {
  it("reserves against the daily burst smoother", () => {
    const conn = db();
    const now = new Date("2026-07-15T12:00:00Z");
    const daily = env.curiosityLookupPerDay;
    for (let i = 0; i < daily; i++) {
      expect(reserveTavilyCredit(conn, now)).toBe(true);
    }
    expect(tavilyDayUsed(conn, now)).toBe(daily);
    expect(reserveTavilyCredit(conn, now)).toBe(false);
  });

  it("stops when the monthly ledger is already full", () => {
    const conn = db();
    const now = new Date("2026-07-15T12:00:00Z");
    conn
      .prepare(
        `INSERT INTO mem_kv (key, value, updated_at)
         VALUES (?, ?, datetime('now'))`,
      )
      .run("tavily:month:2026-07", String(env.curiosityTavilyMonthlyCredits));
    expect(tavilyCreditsUsed(conn, now)).toBe(env.curiosityTavilyMonthlyCredits);
    expect(tavilyBudgetAvailable(conn, now)).toBe(false);
    expect(reserveTavilyCredit(conn, now)).toBe(false);
  });

  it("starts a new month with a fresh budget", () => {
    const conn = db();
    const july = new Date("2026-07-31T23:00:00Z");
    expect(reserveTavilyCredit(conn, july)).toBe(true);
    const august = new Date("2026-08-01T01:00:00Z");
    expect(tavilyCreditsUsed(conn, august)).toBe(0);
    expect(tavilyBudgetAvailable(conn, august)).toBe(true);
  });
});
