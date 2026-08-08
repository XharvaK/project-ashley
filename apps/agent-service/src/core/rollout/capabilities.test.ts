import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import {
  capabilityCanExecuteShadow,
  capabilityCanInfluence,
  capabilityInfluenceDependenciesReady,
  capabilityShadowDependenciesReady,
  listCapabilityStatuses,
  promoteCapability,
  promotionEligible,
  recordBehavioralBreach,
  recordCriticalFailure,
  recordIsolatedEvaluation,
  recordLiveShadowEvent,
} from "./capabilities.js";

const releaseId = "release-test";
const start = new Date("2026-07-01T00:00:00.000Z");
const operator = "owner-1";

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

function statusOf(
  db: DatabaseSync,
  capability: Parameters<typeof recordIsolatedEvaluation>[1],
  mode: "apply" | "observe",
) {
  return listCapabilityStatuses(db, mode, releaseId)
    .find((status) => status.capability === capability);
}

function operatorPromoteEvents(db: DatabaseSync, capability: string): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM capability_events
     WHERE capability = ? AND release_id = ? AND kind = 'operator_promote'`,
  ).get(capability, releaseId) as { c?: number };
  return Number(row.c ?? 0);
}

describe("capability rollout", () => {
  it("qualification never activates: observe stays observe with evidence recorded", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    recordIsolatedEvaluation(db, "recall", {
      seeds: 3,
      passed: true,
      sourceKey: "eval",
      releaseId,
      occurredAt: start.toISOString(),
    });
    expect(statusOf(db, "recall", "apply")).toMatchObject({
      state: "observe",
      promotionEligible: false,
      liveShadowEvents: 0,
    });

    qualify(db, "recall");

    expect(statusOf(db, "recall", "apply")).toMatchObject({
      state: "observe",
      promotionEligible: true,
      effective: false,
      evalSeedCount: 3,
      liveShadowEvents: 25,
      liveShadowSpanDays: 7,
      contractId: "ashley-capability-v3",
      contractMismatch: false,
    });
    expect(capabilityCanInfluence(db, "recall", "apply", releaseId)).toBe(false);
    expect(capabilityCanInfluence(db, "recall", "observe", releaseId)).toBe(false);
    expect(promotionEligible(db, "recall", releaseId)).toBe(true);
    db.close();
  });

  it("activates only through explicit authorized promotion", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "recall");

    const refused = promoteCapability(db, "recall", {
      releaseId,
      authorizedBy: "",
    });
    expect(refused).toEqual({ ok: false, reason: "authorization_required" });
    expect(statusOf(db, "recall", "apply")?.state).toBe("observe");
    expect(operatorPromoteEvents(db, "recall")).toBe(0);

    expect(promoteCapability(db, "recall", { releaseId, authorizedBy: operator }))
      .toEqual({ ok: true, state: "active" });
    expect(statusOf(db, "recall", "apply")).toMatchObject({
      state: "active",
      promotionEligible: false,
      effective: true,
    });
    expect(capabilityCanInfluence(db, "recall", "apply", releaseId)).toBe(true);

    const again = promoteCapability(db, "recall", { releaseId, authorizedBy: operator });
    expect(again).toEqual({ ok: true, alreadyActive: true, state: "active" });
    expect(operatorPromoteEvents(db, "recall")).toBe(1);

    const events = db.prepare(
      `SELECT detail_json FROM capability_events
       WHERE capability = 'recall' AND release_id = ? AND kind = 'operator_promote'`,
    ).all(releaseId) as Array<{ detail_json?: unknown }>;
    expect(JSON.parse(String(events[0]?.detail_json ?? "{}"))).toMatchObject({
      authorizedBy: operator,
    });
    db.close();
  });

  it("waits for dependencies before promotion", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "mind_state");
    expect(statusOf(db, "mind_state", "apply")).toMatchObject({
      state: "observe",
      dependenciesReady: false,
    });
    expect(promotionEligible(db, "mind_state", releaseId)).toBe(false);
    expect(promoteCapability(db, "mind_state", { releaseId, authorizedBy: operator }))
      .toEqual({ ok: false, reason: "not_eligible" });
    expect(operatorPromoteEvents(db, "mind_state")).toBe(0);

    qualify(db, "recall");
    expect(promoteCapability(db, "recall", { releaseId, authorizedBy: operator }))
      .toEqual({ ok: true, state: "active" });
    expect(promotionEligible(db, "mind_state", releaseId)).toBe(true);
    expect(promoteCapability(db, "mind_state", { releaseId, authorizedBy: operator }))
      .toEqual({ ok: true, state: "active" });
    expect(statusOf(db, "mind_state", "apply")).toMatchObject({
      state: "active",
      dependenciesReady: true,
      effective: true,
    });
    db.close();
  });

  it(
    "requires thought and curiosity_consolidation before own_time_report promotes",
    () => {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      qualify(db, "own_time_report");
      expect(statusOf(db, "own_time_report", "apply")).toMatchObject({
        state: "observe",
        dependencies: ["thought", "curiosity_consolidation"],
        dependenciesReady: false,
      });
      expect(promotionEligible(db, "own_time_report", releaseId)).toBe(false);

      qualify(db, "recall");
      qualify(db, "mind_state");
      qualify(db, "thought");
      qualify(db, "reading");
      qualify(db, "curiosity_consolidation");
      for (const capability of ["recall", "mind_state", "thought", "reading", "curiosity_consolidation"]) {
        expect(promoteCapability(db, capability as Parameters<typeof recordIsolatedEvaluation>[1], {
          releaseId,
          authorizedBy: operator,
        }).ok).toBe(true);
      }

      expect(promoteCapability(db, "own_time_report", { releaseId, authorizedBy: operator }))
        .toEqual({ ok: true, state: "active" });
      expect(statusOf(db, "own_time_report", "apply")).toMatchObject({
        state: "active",
        dependenciesReady: true,
        effective: true,
      });
      db.close();
    },
    30_000,
  );

  it("promotion is state-only: master observe never lets an active release influence", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "recall");
    expect(promoteCapability(db, "recall", { releaseId, authorizedBy: operator }))
      .toEqual({ ok: true, state: "active" });
    expect(statusOf(db, "recall", "observe")).toMatchObject({
      state: "active",
      effective: false,
    });
    expect(capabilityCanInfluence(db, "recall", "observe", releaseId)).toBe(false);
    expect(capabilityCanInfluence(db, "recall", "apply", releaseId)).toBe(true);
    db.close();
  });

  it("rolls back after two breaches, disables on critical failure, and neither re-promotes", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "reading");
    expect(promoteCapability(db, "reading", { releaseId, authorizedBy: operator }))
      .toEqual({ ok: true, state: "active" });
    recordBehavioralBreach(db, "reading", "breach-1", "unsupported claim", {
      releaseId,
      occurredAt: "2026-07-09T00:00:00.000Z",
    });
    expect(capabilityCanInfluence(db, "reading", "apply", releaseId)).toBe(true);
    recordBehavioralBreach(db, "reading", "breach-2", "unsupported claim", {
      releaseId,
      occurredAt: "2026-07-10T00:00:00.000Z",
    });
    expect(statusOf(db, "reading", "apply")).toMatchObject({
      state: "rolled_back",
      effective: false,
    });
    expect(promoteCapability(db, "reading", { releaseId, authorizedBy: operator }))
      .toEqual({ ok: false, reason: "rolled_back" });

    qualify(db, "recall");
    recordCriticalFailure(
      db,
      "recall",
      "critical-1",
      "deletion_integrity",
      "forgotten content resurfaced",
      { releaseId },
    );
    expect(statusOf(db, "recall", "apply")).toMatchObject({
      state: "disabled",
      effective: false,
      failureKind: "deletion_integrity",
    });
    expect(promoteCapability(db, "recall", { releaseId, authorizedBy: operator }))
      .toEqual({ ok: false, reason: "disabled" });
    db.close();
  });
});

describe("shadow execution predicates", () => {
  it("canExecuteShadow is true for observe, active, and rolled-back-disabled states", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    recordIsolatedEvaluation(db, "recall", {
      seeds: 3, passed: true, sourceKey: "eval",
      releaseId, occurredAt: start.toISOString(),
    });
    qualify(db, "recall");

    expect(capabilityCanExecuteShadow(db, "recall", releaseId)).toBe(true);

    promoteCapability(db, "recall", { releaseId, authorizedBy: operator });
    expect(capabilityCanExecuteShadow(db, "recall", releaseId)).toBe(true);

    recordBehavioralBreach(db, "recall", "b1", "x", { releaseId, occurredAt: "2026-07-09T00:00:00.000Z" });
    recordBehavioralBreach(db, "recall", "b2", "x", { releaseId, occurredAt: "2026-07-10T00:00:00.000Z" });
    expect(statusOf(db, "recall", "apply")?.state).toBe("rolled_back");
    expect(capabilityCanExecuteShadow(db, "recall", releaseId)).toBe(false);

    db.close();
  });

  it("shadow readiness is satisfied by observe dependencies without activation", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "mind_state");

    expect(capabilityShadowDependenciesReady(db, "mind_state", releaseId)).toBe(true);
    expect(capabilityInfluenceDependenciesReady(db, "mind_state", releaseId)).toBe(false);
    expect(promotionEligible(db, "mind_state", releaseId)).toBe(false);
    expect(capabilityCanInfluence(db, "mind_state", "apply", releaseId)).toBe(false);

    db.close();
  });

  it("promotionEligible is not equivalent to shadowExecutable (influence vs shadow)", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "mind_state");
    qualify(db, "recall");

    expect(capabilityCanExecuteShadow(db, "mind_state", releaseId)).toBe(true);
    expect(capabilityShadowDependenciesReady(db, "mind_state", releaseId)).toBe(true);
    expect(promotionEligible(db, "mind_state", releaseId)).toBe(false);
    promoteCapability(db, "recall", { releaseId, authorizedBy: operator });
    expect(promotionEligible(db, "mind_state", releaseId)).toBe(true);
    expect(capabilityCanExecuteShadow(db, "mind_state", releaseId)).toBe(true);
    promoteCapability(db, "mind_state", { releaseId, authorizedBy: operator });
    expect(capabilityInfluenceDependenciesReady(db, "mind_state", releaseId)).toBe(true);

    db.close();
  });

  it("status can expose shadow readiness without state transition", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "mind_state");
    const status = statusOf(db, "mind_state", "apply");
    expect(status).toMatchObject({
      state: "observe",
      shadowExecutable: true,
      shadowDependenciesReady: true,
      influenceDependenciesReady: false,
      promotionEligible: false,
      effective: false,
    });
    db.close();
  });

  it("disabled dependency blocks shadow execution too", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    qualify(db, "thought");
    qualify(db, "recall");
    qualify(db, "mind_state");

    recordCriticalFailure(db, "recall", "cf-1", "deletion_integrity", "x", { releaseId });
    expect(capabilityCanExecuteShadow(db, "recall", releaseId)).toBe(false);
    expect(capabilityShadowDependenciesReady(db, "thought", releaseId)).toBe(false);
    expect(capabilityCanExecuteShadow(db, "thought", releaseId)).toBe(true);

    db.close();
  });
});
