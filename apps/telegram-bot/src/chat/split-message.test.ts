import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitMessage } from "./split-message.js";

describe("splitMessage", () => {
  it("returns empty for blank", () => {
    assert.deepEqual(splitMessage(""), []);
    assert.deepEqual(splitMessage("   "), []);
  });

  it("keeps a single short paragraph as one bubble", () => {
    assert.deepEqual(splitMessage("hey there"), ["hey there"]);
  });

  it("splits on blank lines", () => {
    assert.deepEqual(splitMessage("a\n\nb"), ["a", "b"]);
  });

  it("splits three paragraphs into three bubbles", () => {
    assert.deepEqual(splitMessage("one\n\ntwo\n\nthree"), [
      "one",
      "two",
      "three",
    ]);
  });

  it("merges overflow into the third bubble when more than three paras", () => {
    assert.deepEqual(splitMessage("a\n\nb\n\nc\n\nd"), [
      "a",
      "b",
      "c\n\nd",
    ]);
  });

  it("hard-slices an overlong single paragraph at 900", () => {
    const long = "x".repeat(950);
    const parts = splitMessage(long);
    assert.equal(parts.length, 2);
    assert.equal(parts[0]!.length, 900);
    assert.equal(parts[1]!.length, 50);
  });
});
