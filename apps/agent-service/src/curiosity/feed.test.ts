import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText, parseFeed, urlKey } from "./feed.js";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Feed</title>
  <item>
    <title>SQLite 3.50 adds a real thing</title>
    <link>https://sqlite.org/news.html#a1</link>
    <description><![CDATA[<p>Some <b>html</b> &amp; entities</p>]]></description>
    <pubDate>Tue, 28 Jul 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Second post</title>
    <guid isPermaLink="true">https://example.com/2</guid>
    <description>plain text</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Mechanism of something</title>
    <link rel="self" href="https://arxiv.org/self"/>
    <link rel="alternate" href="https://arxiv.org/abs/2607.00001"/>
    <summary>A summary with &lt;i&gt;markup&lt;/i&gt;</summary>
    <published>2026-07-30T08:00:00Z</published>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS items with CDATA and dates", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "SQLite 3.50 adds a real thing",
      url: "https://sqlite.org/news.html#a1",
    });
    expect(items[0]!.excerpt).toBe("Some html & entities");
    expect(items[0]!.publishedAt).toBe("2026-07-28T10:00:00.000Z");
  });

  it("falls back to a permalink guid", () => {
    expect(parseFeed(RSS)[1]!.url).toBe("https://example.com/2");
  });

  it("prefers the alternate link in Atom", () => {
    const items = parseFeed(ATOM);
    expect(items[0]!.url).toBe("https://arxiv.org/abs/2607.00001");
    expect(items[0]!.excerpt).toBe("A summary with markup");
  });

  it("respects the limit", () => {
    expect(parseFeed(RSS, 1)).toHaveLength(1);
  });

  it("returns nothing for junk instead of throwing", () => {
    expect(parseFeed("<html>not a feed</html>")).toEqual([]);
    expect(parseFeed("")).toEqual([]);
  });

  it("skips entries with no usable link", () => {
    const broken = `<rss><channel><item><title>No link</title></item></channel></rss>`;
    expect(parseFeed(broken)).toEqual([]);
  });
});

describe("htmlToText", () => {
  it("drops scripts and collapses whitespace", () => {
    expect(htmlToText("<p>a</p><script>evil()</script><p>b</p>")).toBe("a\nb");
  });
});

describe("decodeEntities", () => {
  it("handles named and numeric entities", () => {
    expect(decodeEntities("a &amp; b &#39;c&#39; &#x27;d&#x27;")).toBe(
      "a & b 'c' 'd'",
    );
  });
});

describe("urlKey", () => {
  it("treats tracking noise as the same article", () => {
    expect(urlKey("https://www.example.com/a/?utm_source=x#top")).toBe(
      urlKey("https://example.com/a"),
    );
  });

  it("keeps meaningful query strings", () => {
    expect(urlKey("https://example.com/p?id=2")).not.toBe(
      urlKey("https://example.com/p?id=3"),
    );
  });
});
