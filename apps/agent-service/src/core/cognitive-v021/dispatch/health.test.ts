import { describe, expect, it } from "vitest";
import { openTestSidecar } from "../test-support.js";
import { getCognitiveHealthSnapshot } from "./health.js";

describe("cognitive health projection", () => {
  it("reports the kernel and schema while reducing the sidecar path to its basename", () => {
    const sidecar = openTestSidecar();
    const health = getCognitiveHealthSnapshot({
      mode: "shadow",
      sidecar,
      sidecarPath: "C:/Users/doc/.composer-assistant/cognitive-v021.db",
    });
    expect(health).toEqual({
      cognitiveKernel: "shadow",
      cognitiveSidecar: { open: true, schemaVersion: 1, path: "cognitive-v021.db" },
      cognitiveSidecarSchemaVersion: 1,
      cognitiveSidecarPath: "cognitive-v021.db",
    });
    expect(JSON.stringify(health)).not.toContain(".composer-assistant");
    sidecar.close();
  });

  it("does not claim an unopened sidecar", () => {
    expect(getCognitiveHealthSnapshot({ mode: "legacy" })).toMatchObject({
      cognitiveKernel: "legacy",
      cognitiveSidecar: { open: false, schemaVersion: null, path: null },
      cognitiveSidecarSchemaVersion: null,
      cognitiveSidecarPath: null,
    });
  });
});
