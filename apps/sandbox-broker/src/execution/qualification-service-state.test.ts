import { describe, expect, it } from "vitest";
import {
  StableServiceTracker,
  waitForStableService,
  type QualificationServiceState,
} from "./qualification-service-state.js";

const EXPECTED_CGROUP = "/system.slice/ashley-exec-broker.service";

function runningState(
  overrides: Partial<QualificationServiceState> = {},
): QualificationServiceState {
  return {
    activeState: "active",
    subState: "running",
    mainPid: 1234,
    controlGroup: EXPECTED_CGROUP,
    result: "success",
    nRestarts: 0,
    ...overrides,
  };
}

describe("StableServiceTracker", () => {
  it("requires consecutive active and running samples before passing", () => {
    const tracker = new StableServiceTracker(3);

    expect(tracker.observe(runningState(), EXPECTED_CGROUP).status).toBe("waiting");
    expect(tracker.observe(runningState(), EXPECTED_CGROUP).status).toBe("waiting");
    expect(tracker.observe(runningState(), EXPECTED_CGROUP)).toMatchObject({
      status: "stable",
      samples: 3,
    });
  });

  it("requires the exact broker cgroup path", () => {
    const tracker = new StableServiceTracker(1);
    const result = tracker.observe(
      runningState({ controlGroup: "/system.slice/other.service" }),
      EXPECTED_CGROUP,
    );

    expect(result).toMatchObject({ status: "blocked", reason: "service_cgroup_changed" });
  });

  it("classifies auto-restart as a restart failure", () => {
    const tracker = new StableServiceTracker(3);
    const result = tracker.observe(
      runningState({ activeState: "activating", subState: "auto-restart", mainPid: 0 }),
      EXPECTED_CGROUP,
    );

    expect(result).toMatchObject({ status: "blocked", reason: "service_restart_loop" });
  });

  it("rejects a PID or restart-count change before stability", () => {
    const tracker = new StableServiceTracker(3);
    tracker.observe(runningState(), EXPECTED_CGROUP);
    const result = tracker.observe(
      runningState({ mainPid: 1235, nRestarts: 1 }),
      EXPECTED_CGROUP,
    );

    expect(result).toMatchObject({ status: "blocked", reason: "service_restart_loop" });
  });

  it("classifies a fresh process death explicitly", () => {
    const tracker = new StableServiceTracker(3);
    tracker.observe(runningState(), EXPECTED_CGROUP);
    const result = tracker.observe(
      runningState({ activeState: "inactive", subState: "dead", mainPid: 0 }),
      EXPECTED_CGROUP,
    );

    expect(result).toMatchObject({ status: "blocked", reason: "service_process_died" });
  });

  it("reports startup Result failure instead of cgroup_changed", () => {
    const tracker = new StableServiceTracker(3);
    const result = tracker.observe(
      runningState({ activeState: "failed", subState: "failed", mainPid: 0, result: "exit-code" }),
      EXPECTED_CGROUP,
    );

    expect(result).toMatchObject({ status: "blocked", reason: "service_start_failed" });
  });
});

describe("waitForStableService", () => {
  it("fails closed after the bounded stability timeout", async () => {
    let nowMs = 0;
    const result = await waitForStableService({
      unit: "ashley-exec-broker.service",
      expectedCgroupPath: EXPECTED_CGROUP,
      timeoutMs: 100,
      intervalMs: 50,
      nowMs: () => nowMs,
      sleep: async (intervalMs) => {
        nowMs += intervalMs;
      },
      readState: () =>
        runningState({ activeState: "activating", subState: "start", mainPid: 0, controlGroup: "" }),
    });

    expect(result).toMatchObject({ status: "blocked", reason: "service_stability_timeout" });
  });
});
