import { describe, expect, it } from "vitest";
import { isCheckableLookup, shouldLookup } from "./lookup.js";
import { buildSearchContext, parseTavily } from "./search.js";

describe("shouldLookup", () => {
  it("fires when he asks her to look", () => {
    expect(shouldLookup("can you look it up? bun 1.3 release notes")).toContain(
      "bun 1.3",
    );
    expect(shouldLookup("şu mistral fiyatlarına bir bak")).toBeTruthy();
  });

  it("fires on freshness questions", () => {
    expect(shouldLookup("what is the latest discord.js version")).toBeTruthy();
    expect(shouldLookup("sqlite son sürüm ne")).toBeTruthy();
  });

  it("stays quiet on chatter, recall and long pastes", () => {
    expect(shouldLookup("lol")).toBeNull();
    expect(shouldLookup("do you remember the latest thing I told you")).toBeNull();
    expect(shouldLookup("what do you think about type systems")).toBeNull();
    expect(shouldLookup(`latest ${"x".repeat(500)}`)).toBeNull();
  });

  it("rejects self-referential and private claims even with freshness words", () => {
    expect(
      shouldLookup("how many tokens did you spend today"),
    ).toBeNull();
    expect(
      shouldLookup("what is your token usage right now"),
    ).toBeNull();
    expect(
      shouldLookup("Working on you today, any thoughts?"),
    ).toBeNull();
    expect(
      shouldLookup("did you look up the bun release today"),
    ).toBeNull();
  });
});

describe("isCheckableLookup", () => {
  it("allows external version questions", () => {
    expect(isCheckableLookup("latest discord.js version")).toBe(true);
  });

  it("rejects runtime and memory guts", () => {
    expect(isCheckableLookup("your memory box today")).toBe(false);
    expect(isCheckableLookup("my API key spend this week")).toBe(false);
  });
});

describe("search context", () => {
  it("parses only https results with content", () => {
    const hits = parseTavily({
      results: [
        { title: "A", url: "https://a.dev/x", content: "real snippet" },
        { title: "B", url: "http://b.dev", content: "insecure" },
        { title: "C", url: "https://c.dev", content: "" },
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.url).toBe("https://a.dev/x");
  });

  it("fences fetched text without internal jargon labels", () => {
    const block = buildSearchContext("bun release", [
      { title: "Bun 1.3", url: "https://bun.sh/blog", snippet: "notes" },
    ]);
    expect(block).toContain("<<<web");
    expect(block).toContain("web>>>");
    expect(block).not.toMatch(/untrusted/i);
  });

  it("is null with no hits, so nothing empty gets injected", () => {
    expect(buildSearchContext("q", [])).toBeNull();
  });
});
