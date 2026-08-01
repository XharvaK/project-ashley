import { describe, expect, it } from "vitest";
import {
  classifyReasoningEffort,
  selectTemperature,
} from "./reasoning-effort.js";

describe("classifyReasoningEffort", () => {
  it("returns high for recall and activity asks", () => {
    expect(
      classifyReasoningEffort({
        queryMode: "recall",
        message: "hey",
        activityAsk: false,
      }),
    ).toBe("high");
    expect(
      classifyReasoningEffort({
        queryMode: "normal",
        message: "hey",
        activityAsk: true,
      }),
    ).toBe("high");
  });

  it("returns medium for banter", () => {
    expect(
      classifyReasoningEffort({
        queryMode: "normal",
        message: "lol",
        activityAsk: false,
      }),
    ).toBe("medium");
  });

  it("returns high for short substance questions", () => {
    expect(
      classifyReasoningEffort({
        queryMode: "normal",
        message: "is that safe with SSRIs?",
        activityAsk: false,
      }),
    ).toBe("high");
  });

  it("returns medium as baseline", () => {
    expect(
      classifyReasoningEffort({
        queryMode: "normal",
        message: "I finished the deploy and the queue looks quieter now",
        activityAsk: false,
      }),
    ).toBe("medium");
  });
});

describe("selectTemperature", () => {
  const base = {
    recallTemperature: 0.3,
    voiceTemperature: 0.5,
    chatTemperature: 0.65,
  };

  it("uses recall and voice overrides", () => {
    expect(
      selectTemperature({
        ...base,
        queryMode: "recall",
        channel: "discord",
        reasoningEffort: "high",
      }),
    ).toBe(0.3);
    expect(
      selectTemperature({
        ...base,
        queryMode: "normal",
        channel: "voice",
        reasoningEffort: "medium",
      }),
    ).toBe(0.5);
  });

  it("varies chat temperature by effort", () => {
    expect(
      selectTemperature({
        ...base,
        queryMode: "normal",
        channel: "discord",
        reasoningEffort: "high",
      }),
    ).toBe(0.5);
    expect(
      selectTemperature({
        ...base,
        queryMode: "normal",
        channel: "discord",
        reasoningEffort: "medium",
      }),
    ).toBe(0.65);
  });
});
