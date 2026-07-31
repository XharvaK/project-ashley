import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TurnBuffer } from "./turn-buffer.js";

describe("TurnBuffer", () => {
  it("asks for a drain only for the first fragment", () => {
    const buffer = new TurnBuffer<string, string>();
    assert.equal(buffer.push("c1", "hey", "m1"), true);
    assert.equal(buffer.push("c1", "you around", "m2"), false);
  });

  it("keeps every fragment and the latest target", () => {
    const buffer = new TurnBuffer<string, string>();
    buffer.push("c1", "hey", "m1");
    buffer.push("c1", "you around", "m2");
    assert.deepEqual(buffer.take("c1"), {
      fragments: ["hey", "you around"],
      target: "m2",
    });
  });

  it("empties on take so the next fragment queues again", () => {
    const buffer = new TurnBuffer<string, string>();
    buffer.push("c1", "hey", "m1");
    buffer.take("c1");
    assert.equal(buffer.take("c1"), null);
    assert.equal(buffer.push("c1", "again", "m3"), true);
  });

  it("keeps channels apart", () => {
    const buffer = new TurnBuffer<string, string>();
    buffer.push("c1", "hey", "m1");
    assert.equal(buffer.push("c2", "yo", "m2"), true);
    assert.deepEqual(buffer.take("c1")?.fragments, ["hey"]);
    assert.deepEqual(buffer.take("c2")?.fragments, ["yo"]);
  });
});
