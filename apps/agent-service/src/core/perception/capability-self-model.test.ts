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
  it("describes available with approved projects when lifecycle, substrate, and capability are active", () => {
    const line = describeSandboxV2Availability({
      lifecycleEnabled: true,
      substrateAvailable: true,
      approvedProjects: ["project-ashley"],
      inspectionCanInfluence: true,
    });
    expect(line).toBe(
      "Sandbox V2: available (bounded read-only inspection of approved projects: project-ashley; workspace file roundtrip enabled).",
    );
  });

  it("describes observe/non-influencing when capability is not active in rollout", () => {
    const line = describeSandboxV2Availability({
      lifecycleEnabled: true,
      substrateAvailable: true,
      approvedProjects: ["project-ashley"],
      inspectionCanInfluence: false,
    });
    expect(line).toBe(
      "Sandbox V2: inspection capability not active in rollout (observe-only / non-influencing; cannot inspect repository; workspace file roundtrip enabled).",
    );
  });

  it("describes available with no approved projects configured when list is empty", () => {
    const line = describeSandboxV2Availability({
      lifecycleEnabled: true,
      substrateAvailable: true,
      approvedProjects: [],
    });
    expect(line).toBe(
      "Sandbox V2: substrate available (file.roundtrip enabled; no approved read-only projects configured).",
    );
  });

  it("describes disabled when lifecycle is disabled", () => {
    const line = describeSandboxV2Availability({
      lifecycleEnabled: false,
      substrateAvailable: true,
    });
    expect(line).toBe(
      "Sandbox V2: disabled (ASHLEY_SANDBOX_ENGINEERING_LIFECYCLE_ENABLED is not true).",
    );
  });

  it("describes substrate unavailable when substrate is missing", () => {
    const line = describeSandboxV2Availability({
      lifecycleEnabled: true,
      substrateAvailable: false,
    });
    expect(line).toBe(
      "Sandbox V2: substrate unavailable (Linux bubblewrap required).",
    );
  });
});

describe("composeSelfCapabilityContext coexistence", () => {
  it("correctly includes both V2 available and V1 legacy broker disabled without conflation", () => {
    const db = makeDb();
    const context = composeSelfCapabilityContext(db);

    expect(context).toContain("Perception capabilities (honest self-model):");
    expect(context).toContain("Legacy sandbox broker (V1):");
    expect(context).toContain("Sandbox V2:");
    expect(context).not.toMatch(/^Sandboxed execution: broker IPC disabled/m);
    db.close();
  });
});
