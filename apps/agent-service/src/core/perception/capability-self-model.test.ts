import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import {
  composeSelfCapabilityContext,
  describeSandboxV2Availability,
} from "./capability-self-model.js";

function makeDb(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

describe("describeSandboxV2Availability", () => {
  it("describes available when lifecycle is enabled and substrate is available", () => {
    const line = describeSandboxV2Availability({
      lifecycleEnabled: true,
      substrateAvailable: true,
    });
    expect(line).toBe(
      "Sandbox V2 (file.roundtrip): available (bounded reactive workspace roundtrip enabled).",
    );
  });

  it("describes disabled when lifecycle is disabled", () => {
    const line = describeSandboxV2Availability({
      lifecycleEnabled: false,
      substrateAvailable: true,
    });
    expect(line).toBe(
      "Sandbox V2 (file.roundtrip): disabled (ASHLEY_SANDBOX_ENGINEERING_LIFECYCLE_ENABLED is not true).",
    );
  });

  it("describes substrate unavailable when substrate is missing", () => {
    const line = describeSandboxV2Availability({
      lifecycleEnabled: true,
      substrateAvailable: false,
    });
    expect(line).toBe(
      "Sandbox V2 (file.roundtrip): substrate unavailable (Linux bubblewrap required).",
    );
  });
});

describe("composeSelfCapabilityContext coexistence", () => {
  it("correctly includes both V2 available and V1 legacy broker disabled without conflation", () => {
    const db = makeDb();
    const context = composeSelfCapabilityContext(db);

    expect(context).toContain("Perception capabilities (honest self-model):");
    expect(context).toContain("Legacy sandbox broker (V1):");
    expect(context).toContain("Sandbox V2 (file.roundtrip):");
    expect(context).not.toMatch(/^Sandboxed execution: broker IPC disabled/m);
    db.close();
  });
});
