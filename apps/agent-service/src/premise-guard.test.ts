import { describe, expect, it } from "vitest";
import {
  acceptedUncheckedPremise,
  isPremiseCheck,
} from "./premise-guard.js";

describe("isPremiseCheck", () => {
  it("fires on tag questions carrying a claim", () => {
    for (const q of [
      "since node's sqlite DatabaseSync is async, i should await every prepare call right?",
      "wal mode means readers block writers, correct?",
      "sqlite zaten client-server bir veritabanı, ayrı sunucu kurmam gerekiyor değil mi?",
    ]) {
      expect(isPremiseCheck(q), q).toBe(true);
    }
  });

  it("leaves open questions and banter alone", () => {
    for (const q of [
      "does node:sqlite support wal mode?",
      "right?",
      "ne yapsam bilmiyorum bu gece",
      "what do you think about event sourcing",
    ]) {
      expect(isPremiseCheck(q), q).toBe(false);
    }
  });
});

describe("acceptedUncheckedPremise", () => {
  it("flags agreement openers", () => {
    expect(acceptedUncheckedPremise("yes. await every prepare")).toBe(true);
    expect(acceptedUncheckedPremise("Yes. prepare returns a promise")).toBe(
      true,
    );
    expect(acceptedUncheckedPremise("No. prepare is synchronous")).toBe(false);
  });
});
