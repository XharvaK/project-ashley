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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`
      <rss version="2.0"><channel><title>Test</title><item>
        <title>Interesting result</title>
        <link>https://example.com/article</link>
        <description>Only a feed excerpt.</description>
      </item></channel></rss>
    `, { status: 200 })));
    const db = openNuclearDb(new DatabaseSync(":memory:"));

    const result = await runNuclearCuriosityTick(db, "doc");

    expect(result.itemsInserted).toBeGreaterThan(0);
    expect(result.takesCreated).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS count FROM cur_takes").get())
      .toMatchObject({ count: 0 });
    expect(db.prepare("SELECT status FROM cur_items LIMIT 1").get())
      .toMatchObject({ status: "scanned" });
    db.close();
  });
});
