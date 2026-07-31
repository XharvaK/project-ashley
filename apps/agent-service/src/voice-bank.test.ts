import { describe, expect, it } from "vitest";
import {
  buildVoiceBlock,
  detectLanguage,
  loadVoiceBank,
  looksLikeParrot,
  messageTags,
  selectVoiceExamples,
  type VoiceExample,
} from "./voice-bank.js";

describe("loadVoiceBank", () => {
  it("carries at least 48 usable exchanges in both languages", () => {
    const bank = loadVoiceBank();
    expect(bank.length).toBeGreaterThanOrEqual(48);
    expect(bank.filter((e) => e.lang === "tr").length).toBeGreaterThanOrEqual(
      12,
    );
    expect(bank.filter((e) => e.lang === "en").length).toBeGreaterThanOrEqual(
      24,
    );
    for (const e of bank) {
      expect(e.id).toBeTruthy();
      expect(e.tags.length).toBeGreaterThan(0);
      expect(e.ashley).not.toContain("—");
    }
  });

  it("has unique ids", () => {
    const ids = loadVoiceBank().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("detectLanguage", () => {
  it("reads Turkish from diacritics", () => {
    expect(detectLanguage("bugün çok yorgunum")).toBe("tr");
    expect(detectLanguage("hatırlıyor musun")).toBe("tr");
  });

  it("reads Turkish from common words without diacritics", () => {
    expect(detectLanguage("kanka bu ne")).toBe("tr");
  });

  it("reads English by default", () => {
    expect(detectLanguage("the queue retries forever")).toBe("en");
    expect(detectLanguage("hey")).toBe("en");
  });
});

describe("messageTags", () => {
  it("tags short messages as low content banter", () => {
    expect(messageTags("hey")).toContain("low_content");
  });

  it("tags pharmacology and code", () => {
    expect(messageTags("5-ht2a tolerance question")).toContain(
      "substance_pharma",
    );
    expect(messageTags("the async handler throws")).toContain("substance_code");
  });
});

describe("selectVoiceExamples", () => {
  it("never mixes languages into the sample set", () => {
    const en = selectVoiceExamples({ message: "which one should i pick", seed: "t1" });
    expect(en.every((e) => e.lang === "en")).toBe(true);

    const tr = selectVoiceExamples({ message: "hangisini seçsem", seed: "t1" });
    expect(tr.every((e) => e.lang === "tr")).toBe(true);
  });

  it("is stable for the same thread and message", () => {
    const a = selectVoiceExamples({ message: "the build is broken", seed: "t1" });
    const b = selectVoiceExamples({ message: "the build is broken", seed: "t1" });
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });

  it("varies across different messages", () => {
    const a = selectVoiceExamples({ message: "the build is broken", seed: "t1" });
    const b = selectVoiceExamples({ message: "i'm going to bed", seed: "t1" });
    expect(a.map((e) => e.id)).not.toEqual(b.map((e) => e.id));
  });

  it("prefers examples matching the message tags", () => {
    const picked = selectVoiceExamples({
      message: "5-ht2a tolerance after a week of daily dosing",
      seed: "t1",
      max: 4,
    });
    expect(picked.some((e) => e.tags.includes("substance_pharma"))).toBe(true);
  });

  it("respects the max", () => {
    expect(
      selectVoiceExamples({ message: "hey", seed: "t1", max: 2 }),
    ).toHaveLength(2);
  });
});

describe("buildVoiceBlock", () => {
  it("returns null with nothing to show", () => {
    expect(buildVoiceBlock([])).toBeNull();
  });

  it("labels the samples as register, not history", () => {
    const block = buildVoiceBlock(
      selectVoiceExamples({ message: "hey", seed: "t1", max: 2 }),
    );
    expect(block).toContain("not things that were actually said");
    expect(block).toContain("the language Doc just used");
    expect(block).toContain("Doc:");
    expect(block).toContain("You:");
  });
});

describe("looksLikeParrot", () => {
  const sample: VoiceExample = {
    id: "x",
    lang: "en",
    tags: ["opinion"],
    doc: "typescript or python",
    ashley: "typescript. python's fine but you'll be fighting argparse by tuesday.",
  };

  it("catches a verbatim copy", () => {
    expect(looksLikeParrot(sample.ashley, [sample])).toBe(true);
  });

  it("catches a copy with punctuation and case noise", () => {
    expect(
      looksLikeParrot(
        "TypeScript, python's fine but you'll be fighting argparse by Tuesday!",
        [sample],
      ),
    ).toBe(true);
  });

  it("allows a genuine paraphrase", () => {
    expect(
      looksLikeParrot("go typescript, you'll regret the python tooling", [
        sample,
      ]),
    ).toBe(false);
  });

  it("ignores short samples that would false positive", () => {
    expect(
      looksLikeParrot("no idea", [{ ...sample, ashley: "no idea." }]),
    ).toBe(false);
  });

  it("ignores media markers", () => {
    expect(looksLikeParrot("[[react:👍]]", [sample])).toBe(false);
  });
});
