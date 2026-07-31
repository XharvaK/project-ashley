import { describe, expect, it } from "vitest";
import {
  classifyQuery,
  isBroadDomainAsk,
  isRecallQuery,
  RECALL_PATTERNS,
} from "./recall.js";

describe("isRecallQuery", () => {
  it("matches Turkish and English meta-memory asks", () => {
    expect(isRecallQuery("neler hatırlıyorsun")).toBe(true);
    expect(isRecallQuery("hafızanda neler var")).toBe(true);
    expect(isRecallQuery("what do you remember about me?")).toBe(true);
    expect(isRecallQuery("ne biliyorsun benden?")).toBe(true);
  });

  it("does not match normal chat", () => {
    expect(isRecallQuery("merhaba")).toBe(false);
    expect(isRecallQuery("valorant oynuyor musun")).toBe(false);
  });

  it("exports pattern list", () => {
    expect(RECALL_PATTERNS.length).toBeGreaterThan(5);
  });
});

describe("classifyQuery: strict recall", () => {
  it("catches the Turkish meta-asks the old list missed", () => {
    for (const q of [
      "beni ne kadar tanıyorsun",
      "aklında ne kaldı",
      "benim hakkımda neler biliyorsun",
      "kayıtlı ne var",
      "hakkımda ne biliyorsun",
    ]) {
      expect(classifyQuery(q), q).toBe("recall");
    }
  });

  it("catches the English meta-asks the old list missed", () => {
    for (const q of [
      "do you remember me",
      "what's in your memory",
      "remind me what you know",
      "how much do you know about me",
    ]) {
      expect(classifyQuery(q), q).toBe("recall");
    }
  });

  it("treats a bare knowledge ask as about-me scope", () => {
    expect(classifyQuery("ne biliyorsun")).toBe("recall");
    expect(classifyQuery("what do you remember")).toBe("recall");
  });
});

describe("classifyQuery: domain questions are not memory audits", () => {
  it("does not fire on a topic qualifier", () => {
    for (const q of [
      "bu ilaç hakkında ne biliyorsun",
      "ketamin hakkında ne biliyorsun",
      "what do you remember about that bug",
      "what do you know about rust macros",
      "vitest ile ilgili ne biliyorsun",
    ]) {
      expect(classifyQuery(q), q).toBe("normal");
    }
  });

  it("still fires when the topic is Doc himself", () => {
    expect(classifyQuery("benim hakkımda ne hatırlıyorsun")).toBe("recall");
    expect(classifyQuery("what do you remember about me")).toBe("recall");
    expect(classifyQuery("what do you remember about us")).toBe("recall");
  });

  it("leaves ordinary chat alone", () => {
    for (const q of ["lol", "flat af today", "kanka ne yapıyorsun", ""]) {
      expect(classifyQuery(q), q).toBe("normal");
    }
  });
});

describe("classifyQuery: soft recall", () => {
  it("handles episodic asks without the strict clamp", () => {
    for (const q of [
      "geçen ne konuşmuştuk",
      "dün ne demiştim",
      "en son ne konuşuyorduk",
      "what did we talk about yesterday",
      "hatırlıyor musun",
      "do you remember what we said",
    ]) {
      expect(classifyQuery(q), q).toBe("soft_recall");
    }
  });

  it("never downgrades an uncertain memory ask to normal", () => {
    expect(classifyQuery("hatırlıyor musun o şeyi")).not.toBe("normal");
  });
});

describe("isBroadDomainAsk", () => {
  it("fires on open survey questions", () => {
    for (const q of [
      "ketamin hakkında ne biliyorsun",
      "what do you know about rust macros",
      "tell me about event sourcing",
      "explain wal mode",
    ]) {
      expect(isBroadDomainAsk(q), q).toBe(true);
    }
  });

  it("does not fire when the ask is concrete", () => {
    for (const q of [
      "rough timeline on 5-ht2a downregulation after repeated dosing?",
      "ketamin dozu ne kadar olmalı",
      "explain why this dose is risky with an maoi",
      "orm or raw sql for a project this size?",
    ]) {
      expect(isBroadDomainAsk(q), q).toBe(false);
    }
  });

  it("does not fire on memory asks or long pastes", () => {
    expect(isBroadDomainAsk("what do you know about me")).toBe(false);
    expect(isBroadDomainAsk(`explain this ${"x".repeat(240)}`)).toBe(false);
  });
});
