import { describe, expect, it } from "vitest";
import {
  filterHotForRecall,
  truncateHotForStrictRecall,
  type HotTurn,
} from "./hot-filter.js";

describe("filterHotForRecall", () => {
  it("strips prior recall Q&A pairs", () => {
    const hot: HotTurn[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "neler hatırlıyorsun" },
      { role: "assistant", content: "nothing stored" },
      { role: "user", content: "ok thanks" },
    ];
    const out = filterHotForRecall(hot);
    expect(out).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "ok thanks" },
    ]);
  });
});

describe("truncateHotForStrictRecall", () => {
  it("keeps one recent non-recall user turn", () => {
    const hot: HotTurn[] = [
      { role: "user", content: "working on composer" },
      { role: "assistant", content: "nice" },
      { role: "user", content: "neler hatırlıyorsun" },
    ];
    expect(truncateHotForStrictRecall(hot)).toEqual([
      { role: "user", content: "working on composer" },
    ]);
  });

  it("returns empty when only recall asks exist", () => {
    const hot: HotTurn[] = [
      { role: "user", content: "neler hatırlıyorsun" },
    ];
    expect(truncateHotForStrictRecall(hot)).toEqual([]);
  });
});
