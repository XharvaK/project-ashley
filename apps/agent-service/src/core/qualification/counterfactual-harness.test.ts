import { afterEach, describe, expect, it } from "vitest";
import { dirname } from "node:path";
import { Fixture } from "./counterfactual-harness.js";

const fixtures: Fixture[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    fixtures.pop()?.close();
  }
});

describe("counterfactual fixture data-plane isolation", () => {
  it("allocates each file-backed fixture in its own data-plane directory", () => {
    const first = new Fixture(false);
    const second = new Fixture(false);
    fixtures.push(first, second);

    expect(dirname(first.dbPath)).not.toBe(dirname(second.dbPath));
  });
});
