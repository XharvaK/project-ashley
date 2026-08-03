import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import {
  capabilityCanInfluence,
  listCapabilityStatuses,
  recordBehavioralBreach,
  recordCriticalFailure,
  recordIsolatedEvaluation,
  recordLiveShadowEvent,
} from "./capabilities.js";

const releaseId = "release-test";
const start = new Date("2026-07-01T00:00:00.000Z");

function qualify(
  db: DatabaseSync,
  capability: Parameters<typeof recordIsolatedEvaluation>[1],
): void {
  recordIsolatedEvaluation(db, capability, {
    seeds: 3,
    passed: true,
    sourceKey: `${capability}:eval`,
    releaseId,
    occurredAt: start.toISOString(),
  });
  for (let index = 0; index < 25; index++) {
    const at = new Date(start.getTime() + index * (7 * 86_400_000 / 24));
    recordLiveShadowEvent(db, capability, `${capability}:${index}`, {
      releaseId,
      occurredAt: at.toISOString(),
    });
  }
}

describe("capability rollout", () => {
  it("promotes only after three-seed qualification and 25 live events over seven days", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    recordIsolatedEvaluation(db, "recall", {
      seeds: 3,
      passed: true,
      sourceKey: "eval",
      releaseId,
      occurredAt: start.toISOString(),
    });
    expect(listCapabilityStatuses(db, "apply", releaseId, start)
      .find((status) => status.capability === "recall")).toMatchObject({
        state: "observe",
        liveShadowEvents: 0,
      });

    qualify(db, "recall");

    expect(listCapabilityStatuses(
      db,
      "apply",
      releaseId,
      new Date(start.getTime() + 8 * 86_400_000),
    ).find((status) => status.capability === "recall")).toMatchObject({
      state: "active",
      effective: true,
      evalSeedCount: 3,
      liveShadowEvents: 25,
      liveShadowSpanDays: 7,
    });
    expect(capabilityCanInfluence(db, "recall", "observe", releaseId)).toBe(false);
    db.close();
  });

  it("waits for dependencies before promotion", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "mind_state");
    expect(listCapabilityStatuses(db, "apply", releaseId)
      .find((status) => status.capability === "mind_state")).toMatchObject({
        state: "observe",
        dependenciesReady: false,
      });

    qualify(db, "recall");

    expect(listCapabilityStatuses(db, "apply", releaseId)
      .find((status) => status.capability === "mind_state")).toMatchObject({
        state: "active",
        dependenciesReady: true,
      });
    db.close();
  });

  it("rolls back after two breaches and disables immediately on a critical failure", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "reading");
    recordBehavioralBreach(db, "reading", "breach-1", "unsupported claim", {
      releaseId,
      occurredAt: "2026-07-09T00:00:00.000Z",
    });
    expect(capabilityCanInfluence(db, "reading", "apply", releaseId)).toBe(true);
    recordBehavioralBreach(db, "reading", "breach-2", "unsupported claim", {
      releaseId,
      occurredAt: "2026-07-10T00:00:00.000Z",
    });
    expect(listCapabilityStatuses(db, "apply", releaseId)
      .find((status) => status.capability === "reading")).toMatchObject({
        state: "rolled_back",
        effective: false,
      });

    qualify(db, "recall");
    recordCriticalFailure(
      db,
      "recall",
      "critical-1",
      "deletion_integrity",
      "forgotten content resurfaced",
      { releaseId },
    );
    expect(listCapabilityStatuses(db, "apply", releaseId)
      .find((status) => status.capability === "recall")).toMatchObject({
        state: "disabled",
        effective: false,
        failureKind: "deletion_integrity",
      });
    db.close();
  });
});
