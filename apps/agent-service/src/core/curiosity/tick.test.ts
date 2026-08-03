import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { runNuclearCuriosityTick } from "./tick.js";

const originalEnabled = env.curiosityEnabled;
const originalLimit = env.curiosityItemsPerSource;

afterEach(() => {
  env.curiosityEnabled = originalEnabled;
  env.curiosityItemsPerSource = originalLimit;
  vi.unstubAllGlobals();
});

describe("curiosity scan", () => {
  it("stores feed items without manufacturing a take", async () => {
    env.curiosityEnabled = true;
    env.curiosityItemsPerSource = 1;
    const feed = `<rss version="2.0"><channel><title>Test</title><item>
      <title>Interesting result</title><link>https://example.com/article</link>
      <description>Only a feed excerpt.</description></item></channel></rss>`;
    const article = `<html><body><p>${"Grounded article evidence. ".repeat(30)}</p></body></html>`;
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      new Response(String(input).includes("/article") ? article : feed, {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    const resolve = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
    const db = openNuclearDb(new DatabaseSync(":memory:"));

    const result = await runNuclearCuriosityTick(db, "doc", { fetcher, resolve });

    expect(result.itemsInserted).toBeGreaterThan(0);
    expect(result.takesCreated).toBe(0);
    expect(result.readsCreated).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM cur_takes").get())
      .toMatchObject({ count: 0 });
    expect(db.prepare("SELECT status FROM cur_items LIMIT 1").get())
      .toMatchObject({ status: "read" });
    expect(db.prepare("SELECT kind FROM cognitive_jobs LIMIT 1").get())
      .toMatchObject({ kind: "consolidate_curiosity" });
    db.close();
  });
});
