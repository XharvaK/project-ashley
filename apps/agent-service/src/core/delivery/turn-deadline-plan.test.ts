import { describe, expect, it } from "vitest";
import {
  createTurnDeadlinePlan,
  selectTurnDeadlineBranch,
  type TurnDeadlinePolicy,
} from "./turn-deadline-plan.js";

const admittedAtMs = 1_000_000;

const testPolicy: TurnDeadlinePolicy = {
  version: "phase-budget-test-v1",
  qualification: "test_only",
  softResponsivenessTargetMs: 50,
  initialThoughtMs: 100,
  externalTransportMs: 1_000,
  firstBubbleReceiptReserveMs: 100,
  finalDeliveryReserveMs: 900,
  ordinary: {
    perceptionMs: 100,
    expressionMs: 100,
    generationSettlementMs: 20,
  },
  sandboxM1: {
    childExecutionMs: 200,
    acquisitionSettlementMs: 50,
    cleanupReserveMs: 20,
    perceptionMs: 100,
    expressionMs: 100,
    generationSettlementMs: 20,
  },
  projectInspection: {
    projectInspectionPreparationMs: 80,
    childExecutionMs: {
      "project.read_file": 200,
      "project.list_directory": 220,
      "project.search_text": 240,
    },
    acquisitionSettlementMs: 50,
    cleanupReserveMs: 20,
    continuationMs: 100,
    perceptionMs: 100,
    expressionMs: 100,
    generationSettlementMs: 20,
  },
  candidateWorkspaceExperiment: {
    available: false,
    unavailableReason: "candidate_workspace_closed",
  },
};

describe("TurnDeadlinePlan", () => {
  it("precomputes and freezes one common prefix and every branch suffix", () => {
    const plan = createTurnDeadlinePlan(admittedAtMs, testPolicy);

    expect(plan.version).toBe("phase-budget-test-v1");
    expect(plan.qualification).toBe("test_only");
    expect(plan.common).toEqual({
      softResponsivenessTargetAtMs: admittedAtMs + 50,
      initialThoughtDeadlineAtMs: admittedAtMs + 100,
      externalTransportHardDeadlineAtMs: admittedAtMs + 1_000,
      firstBubbleReceiptDeadlineAtMs: admittedAtMs + 1_100,
      reservationHardDeadlineAtMs: admittedAtMs + 2_000,
    });
    expect(plan.branches.project_inspection.available).toBe(true);
    expect(plan.branches.candidate_workspace_experiment).toEqual({
      kind: "candidate_workspace_experiment",
      available: false,
      unavailableReason: "candidate_workspace_closed",
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.common)).toBe(true);
    expect(Object.isFrozen(plan.branches)).toBe(true);
    expect(Object.isFrozen(plan.branches.project_inspection)).toBe(true);
    expect(Object.isFrozen(plan.branches.project_inspection.childExecutionDeadlineAtMs)).toBe(true);
    expect(plan.branches.sandbox_m1.childTerminationDeadlineAtMs).toBe(
      admittedAtMs + 330,
    );
    expect(plan.branches.project_inspection.projectInspectionPreparationDeadlineAtMs).toBe(
      admittedAtMs + 180,
    );
    expect(plan.branches.project_inspection.childTerminationDeadlineAtMs).toBe(
      admittedAtMs + 450,
    );
  });

  it("keeps branch deadlines unchanged when Pass 1 selects by reference", () => {
    const plan = createTurnDeadlinePlan(admittedAtMs, testPolicy);
    const before = JSON.stringify(plan);
    const selected = selectTurnDeadlineBranch(plan, "project_inspection");

    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error("expected selected branch");
    expect(selected.branch).toBe(plan.branches.project_inspection);
    expect(selected.branch.continuationDeadlineAtMs).toBe(admittedAtMs + 570);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("rejects unavailable and unknown branch selection without recomputing deadlines", () => {
    const plan = createTurnDeadlinePlan(admittedAtMs, testPolicy);

    expect(selectTurnDeadlineBranch(plan, "candidate_workspace_experiment")).toEqual({
      ok: false,
      reason: "candidate_workspace_closed",
    });
    expect(selectTurnDeadlineBranch(plan, "not-a-branch" as never)).toEqual({
      ok: false,
      reason: "deadline_branch_unknown",
    });
  });

  it("orders M2 preparation, child execution, termination, settlement, continuation, expression, generation, transport, receipt, and final delivery", () => {
    const plan = createTurnDeadlinePlan(admittedAtMs, testPolicy);
    const branch = plan.branches.project_inspection;
    if (!branch.available) throw new Error("project inspection unavailable");

    expect(plan.common.initialThoughtDeadlineAtMs).toBeLessThan(
      branch.projectInspectionPreparationDeadlineAtMs,
    );
    for (const childDeadline of Object.values(branch.childExecutionDeadlineAtMs)) {
      expect(branch.projectInspectionPreparationDeadlineAtMs).toBeLessThan(childDeadline);
      expect(childDeadline).toBeLessThan(branch.childTerminationDeadlineAtMs);
    }
    expect(branch.childTerminationDeadlineAtMs).toBeLessThan(
      branch.acquisitionSettlementDeadlineAtMs,
    );
    expect(branch.acquisitionSettlementDeadlineAtMs).toBeLessThan(
      branch.continuationDeadlineAtMs,
    );
    expect(branch.continuationDeadlineAtMs).toBeLessThan(branch.perceptionDeadlineAtMs);
    expect(branch.perceptionDeadlineAtMs).toBeLessThan(branch.expressionDeadlineAtMs);
    expect(branch.expressionDeadlineAtMs).toBeLessThan(branch.generationDeadlineAtMs);
    expect(branch.generationDeadlineAtMs).toBeLessThan(
      plan.common.externalTransportHardDeadlineAtMs,
    );
    expect(plan.common.externalTransportHardDeadlineAtMs).toBeLessThan(
      plan.common.firstBubbleReceiptDeadlineAtMs,
    );
    expect(plan.common.firstBubbleReceiptDeadlineAtMs).toBeLessThan(
      plan.common.reservationHardDeadlineAtMs,
    );
  });

  it.each([0, -1])("rejects cleanupReserveMs=%s", (cleanupReserveMs) => {
    expect(() =>
      createTurnDeadlinePlan(admittedAtMs, {
        ...testPolicy,
        projectInspection: {
          ...testPolicy.projectInspection,
          cleanupReserveMs,
        },
      }),
    ).toThrow("turn_deadline_policy_invalid:projectInspection.cleanupReserveMs");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects projectInspectionPreparationMs=%s",
    (projectInspectionPreparationMs) => {
      expect(() =>
        createTurnDeadlinePlan(admittedAtMs, {
          ...testPolicy,
          projectInspection: {
            ...testPolicy.projectInspection,
            projectInspectionPreparationMs,
          },
        }),
      ).toThrow(
        "turn_deadline_policy_invalid:projectInspection.projectInspectionPreparationMs",
      );
    },
  );

  it("anchors every M2 child deadline strictly after the preparation boundary", () => {
    const plan = createTurnDeadlinePlan(admittedAtMs, testPolicy);
    const branch = plan.branches.project_inspection;
    if (!branch.available) throw new Error("project inspection unavailable");
    for (const childDeadline of Object.values(branch.childExecutionDeadlineAtMs)) {
      expect(childDeadline).toBeGreaterThan(
        branch.projectInspectionPreparationDeadlineAtMs,
      );
    }
  });

  it("rejects a cleanup reserve that leaves no termination grace after the maximum child deadline", () => {
    expect(() =>
      createTurnDeadlinePlan(admittedAtMs, {
        ...testPolicy,
        projectInspection: {
          ...testPolicy.projectInspection,
          cleanupReserveMs: 50,
        },
      }),
    ).toThrow("turn_deadline_policy_invalid:projectInspection.termination_order");
  });

  it("uses the inbound transport cutoff as the real Discord authority while keeping receipt and final delivery distinct", () => {
    const externalTransportHardDeadlineAtMs = admittedAtMs + 1_500;
    const plan = createTurnDeadlinePlan(admittedAtMs, testPolicy, {
      externalTransportHardDeadlineAtMs,
    });

    expect(plan.common.externalTransportHardDeadlineAtMs).toBe(
      externalTransportHardDeadlineAtMs,
    );
    expect(plan.common.firstBubbleReceiptDeadlineAtMs).toBe(
      externalTransportHardDeadlineAtMs + 100,
    );
    expect(plan.common.reservationHardDeadlineAtMs).toBe(
      externalTransportHardDeadlineAtMs + 1_000,
    );
    expect(plan.branches.ordinary.generationDeadlineAtMs).toBe(
      admittedAtMs + 320,
    );
  });
});
