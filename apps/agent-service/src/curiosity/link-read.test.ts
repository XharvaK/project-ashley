import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrate } from "../memory/db.js";
import { isActivityAsk } from "./activity-ask.js";
import { isBrowsePermission } from "./browse-permission.js";
import {
  buildPageContext,
  extractImmediateHttpsUrl,
  maybeReadLink,
} from "./link-read.js";
import { shouldLookup, shouldLookupAsideUrl } from "./lookup.js";
import { isBlockedFetchHost } from "./read.js";
import { countProvenance } from "./store.js";

function db(): DatabaseSync {
  const conn = new DatabaseSync(":memory:");
  migrate(conn);
  return conn;
}

describe("extractImmediateHttpsUrl", () => {
  it("accepts bare and primary article URLs plus EN/TR cues", () => {
    expect(
      extractImmediateHttpsUrl("https://sqlite.org/wal.html"),
    ).toEqual({ kind: "immediate", url: "https://sqlite.org/wal.html" });
    expect(
      extractImmediateHttpsUrl("check this https://sqlite.org/wal.html"),
    ).toMatchObject({ kind: "immediate" });
    expect(
      extractImmediateHttpsUrl("şuna bak https://sqlite.org/wal.html"),
    ).toMatchObject({ kind: "immediate" });
    expect(
      extractImmediateHttpsUrl("oku bunu https://example.com/post"),
    ).toMatchObject({ kind: "immediate" });
  });

  it("normalizes scheme-less blog URLs with check-my-blog cues", () => {
    expect(
      extractImmediateHttpsUrl("did you check my blog? spiralseekr.substack.com"),
    ).toEqual({
      kind: "immediate",
      url: "https://spiralseekr.substack.com",
    });
    expect(
      extractImmediateHttpsUrl(
        "hey did you get a chance to check my blog yet? https://spiralseekr.substack.com",
      ),
    ).toMatchObject({
      kind: "immediate",
      url: "https://spiralseekr.substack.com",
    });
  });

  it("rejects http, media, private hosts, quotes, and mere mentions", () => {
    expect(extractImmediateHttpsUrl("http://example.com/a")).toEqual({
      kind: "none",
    });
    expect(
      extractImmediateHttpsUrl("https://cdn.discordapp.com/attachments/1/x.png"),
    ).toEqual({ kind: "none" });
    expect(extractImmediateHttpsUrl("https://127.0.0.1/secret")).toEqual({
      kind: "none",
    });
    expect(
      extractImmediateHttpsUrl(
        "for example https://sqlite.org/wal.html is neat",
      ),
    ).toEqual({ kind: "none" });
    expect(
      extractImmediateHttpsUrl(
        "I liked this article https://sqlite.org/wal.html thoughts on writing?",
      ),
    ).toMatchObject({ kind: "mention" });
  });

  it("does not fetch from a broad permission sentence naming a feed", () => {
    const msg =
      "you can chill, browse web https://hnrss.org/frontpage and read stuff that interests you";
    expect(isBrowsePermission(msg)).toBe(true);
    expect(extractImmediateHttpsUrl(msg).kind).not.toBe("immediate");
  });

  it("stays separate from activity ask; URL wins over Tavily for the link", () => {
    const bare = "https://sqlite.org/wal.html";
    expect(isActivityAsk(bare)).toBe(false);
    expect(shouldLookup(bare)).toBeNull();
    expect(
      shouldLookupAsideUrl(
        "look this up: https://sqlite.org/wal.html",
        "https://sqlite.org/wal.html",
      ),
    ).toBeNull();
    expect(
      shouldLookupAsideUrl(
        "https://sqlite.org/wal.html what else is current about wal?",
        "https://sqlite.org/wal.html",
      ),
    ).toBeTruthy();
  });
});

describe("isBlockedFetchHost", () => {
  it("blocks loopback, private, and metadata hosts", () => {
    expect(isBlockedFetchHost("127.0.0.1")).toBe(true);
    expect(isBlockedFetchHost("10.0.0.5")).toBe(true);
    expect(isBlockedFetchHost("192.168.1.1")).toBe(true);
    expect(isBlockedFetchHost("169.254.169.254")).toBe(true);
    expect(isBlockedFetchHost("localhost")).toBe(true);
    expect(isBlockedFetchHost("sqlite.org")).toBe(false);
  });
});

describe("buildPageContext", () => {
  it("fences page text without putting it in system role language", () => {
    const block = buildPageContext("https://example.com/a", "hello article body");
    expect(block).toContain("<<<page");
    expect(block).toContain("page>>>");
    expect(block).toContain("https://example.com/a");
  });

  it("forbids narrating the open and treats his own work as authorship", () => {
    const block = buildPageContext("https://example.com/a", "body");
    expect(block).toMatch(/do not narrate the mechanics/i);
    expect(block).toMatch(/no 'i opened the link'/i);
    expect(block).toMatch(/he is the author/i);
  });
});

describe("maybeReadLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logs link provenance on success and leaves idle read budget alone", async () => {
    const html = `<html><article>${"word ".repeat(80)}</article></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const conn = db();
    const result = await maybeReadLink(
      conn,
      "read this https://example.com/long-enough-article",
      "normal",
    );
    expect(result.success).toBe(true);
    expect(result.pageContext).toContain("<<<page");
    expect(countProvenance(conn, "link", 24)).toBe(1);
    expect(countProvenance(conn, "read", 24)).toBe(0);
    expect(countProvenance(conn, "search", 24)).toBe(0);
  });

  it("fails honestly without inventing content or success provenance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    const conn = db();
    const result = await maybeReadLink(
      conn,
      "https://example.com/missing",
      "normal",
    );
    expect(result.success).toBe(false);
    expect(result.pageContext).toBeNull();
    expect(result.guard).toMatch(/could not open/i);
    expect(countProvenance(conn, "link", 24)).toBe(0);
  });
});
