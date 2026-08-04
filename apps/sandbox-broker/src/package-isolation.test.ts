import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTestBroker } from "./test/fixtures/broker.js";

describe("package isolation", () => {
  it("has its own package manifest and does not require agent-service node_modules", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgRoot = path.resolve(here, "..");
    expect(existsSync(path.join(pkgRoot, "package.json"))).toBe(true);
    const brokerNodeModules = path.join(pkgRoot, "node_modules");
    expect(existsSync(brokerNodeModules)).toBe(true);
    const brokerVitest = path.join(brokerNodeModules, "vitest");
    const agentVitest = path.resolve(pkgRoot, "../agent-service/node_modules/vitest");
    expect(existsSync(brokerVitest)).toBe(true);
    if (existsSync(agentVitest)) {
      expect(brokerVitest).not.toBe(agentVitest);
    }
  });

  it("uses temporary workspace roots only", () => {
    const { workspaceRoot } = createTestBroker();
    expect(workspaceRoot.includes("ashley-broker-")).toBe(true);
  });
});
