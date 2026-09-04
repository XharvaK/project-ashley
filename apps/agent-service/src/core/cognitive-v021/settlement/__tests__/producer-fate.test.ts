import { describe, expect, it } from "vitest";
import { isLegacyConsolidationProducerAllowed } from "../../../delivery/finalize.js";

describe("MAT-II legacy consolidation producer fate", () => {
  it.each([
    ["legacy", true],
    ["shadow", true],
    ["v021", false],
    ["", false],
    ["unexpected", false],
    [null, false],
    [undefined, false],
  ])("classifies %j as %s", (mode, expected) => {
    expect(isLegacyConsolidationProducerAllowed(mode)).toBe(expected);
  });
});
