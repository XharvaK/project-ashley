import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTestBroker } from "./test/fixtures/broker.js";

describe("isolation guards", () => {
  it("uses temp workspace roots under os.tmpdir", () => {
    const { workspaceRoot } = createTestBroker();
    expect(workspaceRoot.startsWith(tmpdir())).toBe(true);
    expect(workspaceRoot.includes("ashley-broker-")).toBe(true);
  });

  it("does not reference live checkout paths in broker config", () => {
    const { broker, workspaceRoot } = createTestBroker();
    expect(broker.config.workspaceRoot).toBe(workspaceRoot);
    expect(workspaceRoot.includes("composer-assistant")).toBe(false);
    expect(path.isAbsolute(workspaceRoot)).toBe(true);
  });
});
