import { describe, expect, it } from "vitest";
import {
  collapseWithinTurnRepeat,
  looksLikeRepeat,
  looksLikeWithinTurnRepeat,
} from "./repetition-guard.js";

describe("looksLikeRepeat", () => {
  it("flags the same opener", () => {
    expect(
      looksLikeRepeat(
        "Şu an seninle ilgili uzun vadeli bir şey saklamıyorum. Ne var?",
        [
          "Şu an seninle ilgili uzun vadeli bir şey saklamıyorum. Başka bir şey?",
        ],
      ),
    ).toBe(true);
  });

  it("allows a fresh opener", () => {
    expect(
      looksLikeRepeat("nah, nothing on that. what's up?", [
        "Şu an seninle ilgili uzun vadeli bir şey saklamıyorum.",
      ]),
    ).toBe(false);
  });

  it("ignores short crumbs", () => {
    expect(looksLikeRepeat("ok", ["ok then"])).toBe(false);
  });
});

describe("looksLikeWithinTurnRepeat", () => {
  it("flags Doc changelog lexical double", () => {
    const reply = [
      "The ones worth reading. SQLite release notes, small tool updates, the kind with actual signal. Not the marketing fluff.",
      "The SQLite release notes, mostly. They're the only ones where every line feels like a gift instead of a chore. Last one had a VACUUM INTO optimization that made me grin. You'd like it.",
    ].join("\n\n");
    const hit = looksLikeWithinTurnRepeat(reply);
    expect(hit?.kind).toBe("lexical");
  });

  it("flags Doc soft-pad after an answer", () => {
    const reply = [
      "Reading changelogs, judging Doc's life choices. The usual.",
      "Same as always. Waiting for you to stop overcomplicating things.",
    ].join("\n\n");
    const hit = looksLikeWithinTurnRepeat(reply);
    expect(hit?.kind).toBe("soft_pad");
  });

  it("flags soft pad as the third bubble after a jab", () => {
    const reply = [
      "Reading changelogs, judging Doc's life choices. The usual.",
      "You? Besides almost roping Eren into Silkroad again.",
      "Same as always. Waiting for you to stop overcomplicating things.",
    ].join("\n\n");
    const hit = looksLikeWithinTurnRepeat(reply);
    expect(hit).not.toBeNull();
    expect(hit?.kind).toBe("soft_pad");
  });

  it("allows answer plus distinct jab", () => {
    const reply = [
      "Reading changelogs and poking at the queue retry loop.",
      "You still trying to rope Eren into Silkroad?",
    ].join("\n\n");
    expect(looksLikeWithinTurnRepeat(reply)).toBeNull();
  });

  it("allows answer plus a question beat", () => {
    const reply = [
      "SQLite WAL is the right call for that writer.",
      "Want the migration sketch?",
    ].join("\n\n");
    expect(looksLikeWithinTurnRepeat(reply)).toBeNull();
  });

  it("ignores a single paragraph", () => {
    expect(
      looksLikeWithinTurnRepeat("Reading changelogs. The usual."),
    ).toBeNull();
  });

  it("flags truncated opener restates including fake questions", () => {
    const idleShape = [
      "Same old. You still awake or just procrastinating sleep again?",
      "Same old. You?",
    ].join("\n\n");
    expect(looksLikeWithinTurnRepeat(idleShape)?.kind).toBe("truncated");

    const nonIdleShape = [
      "Still debugging the queue retry.",
      "Still debugging?",
    ].join("\n\n");
    expect(looksLikeWithinTurnRepeat(nonIdleShape)?.kind).toBe("truncated");
  });

  it("allows short playful riffs", () => {
    expect(looksLikeWithinTurnRepeat("heh\n\nhejaa")).toBeNull();
    expect(looksLikeWithinTurnRepeat("lol\n\nlmao")).toBeNull();
  });

  it("allows a second bubble with novel content", () => {
    const reply = [
      "Same old. Still awake?",
      "Or are you actually shipping the queue fix?",
    ].join("\n\n");
    expect(looksLikeWithinTurnRepeat(reply)).toBeNull();
  });
});

describe("collapseWithinTurnRepeat", () => {
  it("keeps first on soft pad", () => {
    const reply = [
      "Reading changelogs, judging Doc's life choices. The usual.",
      "Same as always. Waiting for you to stop overcomplicating things.",
    ].join("\n\n");
    expect(collapseWithinTurnRepeat(reply)).toBe(
      "Reading changelogs, judging Doc's life choices. The usual.",
    );
  });

  it("keeps second when it is a content-superset with novel concrete", () => {
    const reply = [
      "SQLite release notes are worth reading.",
      "SQLite release notes are worth reading. Last one had a VACUUM INTO optimization that made me grin.",
    ].join("\n\n");
    const out = collapseWithinTurnRepeat(reply);
    expect(out.toLowerCase()).toContain("vacuum");
    expect(out.includes("\n\n")).toBe(false);
  });

  it("drops the soft-pad third bubble and keeps the jab", () => {
    const reply = [
      "Reading changelogs, judging Doc's life choices. The usual.",
      "You? Besides almost roping Eren into Silkroad again.",
      "Same as always. Waiting for you to stop overcomplicating things.",
    ].join("\n\n");
    const out = collapseWithinTurnRepeat(reply);
    expect(out).toContain("Silkroad");
    expect(out.toLowerCase()).not.toContain("same as always");
  });

  it("reattaches markers from a dropped paragraph", () => {
    const reply = [
      "Reading changelogs. The usual.",
      "Same as always. Waiting for you.\n[[react:😂]]",
    ].join("\n\n");
    const out = collapseWithinTurnRepeat(reply);
    expect(out).toContain("[[react:😂]]");
    expect(out.toLowerCase()).toContain("reading changelogs");
  });

  it("keeps the richer first bubble on truncated restatement", () => {
    const reply = [
      "Same old. You still awake or just procrastinating sleep again?",
      "Same old. You?",
    ].join("\n\n");
    expect(collapseWithinTurnRepeat(reply)).toBe(
      "Same old. You still awake or just procrastinating sleep again?",
    );
  });

  it("keeps short playful riffs intact", () => {
    expect(collapseWithinTurnRepeat("heh\n\nhejaa")).toBe("heh\n\nhejaa");
  });
});
