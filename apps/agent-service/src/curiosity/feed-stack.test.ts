import { describe, expect, it } from "vitest";
import {
  buildFeedStackNote,
  decideCheckIntent,
  isFeedStackAsk,
  sniffFeedKind,
} from "./feed-stack.js";

const ATOM_XML =
  '<?xml version="1.0"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <entry><title>T1</title><link href="https://x.example/a"/></entry>\n</feed>';
const RSS_XML =
  '<?xml version="1.0"?>\n<rss version="2.0"><channel><item><title>T1</title><link>https://x.example/a</link></item></channel></rss>';
const RDF_XML =
  '<?xml version="1.0"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><item><title>T1</title></item></rdf:RDF>';
const HTML = "<html><head><title>site</title></head><body>no feed</body></html>";

describe("sniffFeedKind", () => {
  it("reads the root feed element even with a declaration", () => {
    expect(sniffFeedKind(ATOM_XML)).toBe("atom");
    expect(sniffFeedKind(RSS_XML)).toBe("rss");
    expect(sniffFeedKind(RDF_XML)).toBe("rss");
  });

  it("falls back to content-type for unknown roots", () => {
    expect(sniffFeedKind("<unknown />", "application/atom+xml")).toBe("atom");
    expect(sniffFeedKind("<unknown />", "application/rss+xml")).toBe("rss");
  });

  it("returns unknown for html/non-feeds", () => {
    expect(sniffFeedKind(HTML, "text/html")).toBe("unknown");
    expect(sniffFeedKind("", null)).toBe("unknown");
  });
});

describe("isFeedStackAsk", () => {
  it("recognizes the class across english shapes", () => {
    expect(isFeedStackAsk("do you have the atom now?")).toBe(true);
    expect(isFeedStackAsk("are you still on the old feed?")).toBe(true);
    expect(isFeedStackAsk("did the feeds switch to atom yet?")).toBe(true);
    expect(isFeedStackAsk("check your feeds again")).toBe(true);
    expect(isFeedStackAsk("verify the atom feed")).toBe(true);
    expect(isFeedStackAsk("are you on rss now?")).toBe(true);
  });

  it("recognizes turkish shapes", () => {
    expect(isFeedStackAsk("hangi feed'i kullanıyorsun?")).toBe(true);
    expect(isFeedStackAsk("atom'a geçtin mi?")).toBe(true);
    expect(isFeedStackAsk("hala eski feed mi?")).toBe(true);
  });

  it("does not fire on unrelated feed talk", () => {
    expect(isFeedStackAsk("atom feed bağlantısı çalışıyor")).toBe(false);
    expect(isFeedStackAsk("feed oscillator")).toBe(false);
    expect(isFeedStackAsk("rss")).toBe(false);
    expect(isFeedStackAsk("")).toBe(false);
  });
});

describe("decideCheckIntent", () => {
  it("bare check again after a stack question sweeps the stack", () => {
    expect(
      decideCheckIntent("check again please", [
        "do you have the atom now?",
      ]),
    ).toBe("stack");
    expect(decideCheckIntent("again", ["still on the old feed?"])).toBe(
      "stack",
    );
  });

  it("bare check again after a url re-reads", () => {
    expect(
      decideCheckIntent("check again", ["https://example.com/essay"]),
    ).toBe("read");
    expect(
      decideCheckIntent("check again please", [
        "read this https://example.com/x",
      ]),
    ).toBe("read");
  });

  it("an immediate url in the same turn is always a read", () => {
    expect(
      decideCheckIntent("atom now? https://example.com/x", []),
    ).toBe("read");
  });

  it("returns none for unrelated messages", () => {
    expect(decideCheckIntent("what's up?", [])).toBe("none");
    expect(decideCheckIntent("", [])).toBe("none");
  });
});

describe("buildFeedStackNote", () => {
  it("surfaces the live verdicts and forbids old-feed claims", () => {
    const note = buildFeedStackNote({
      checkedAt: "2026-08-03T00:00:00.000Z",
      total: 2,
      ok: 1,
      failed: 1,
      sources: [
        {
          slug: "github-blog",
          title: "GitHub Blog",
          configured: "atom",
          live: "atom",
          ok: true,
          items: 4,
          error: null,
        },
        {
          slug: "boomkat",
          title: "Boomkat",
          configured: "atom",
          live: "unknown",
          ok: false,
          items: 0,
          error: "timeout",
        },
      ],
    });
    expect(note).toContain("GitHub Blog: atom, 4 items");
    expect(note).toContain("Boomkat: not answering (timeout)");
    expect(note).toContain("1 of 2 sources reachable");
    expect(note).toMatch(/old feed/i);
  });
});