import { describe, expect, it } from "vitest";
import { deriveWatchTopics } from "./watches.js";

describe("deriveWatchTopics", () => {
  const facts = [
    { category: "project", key: "website-factory", value: "runs a site pipeline called Website Factory" },
    { category: "ongoing", key: "mint-server", value: "moved Ashley onto a Linux Mint laptop server" },
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
});
