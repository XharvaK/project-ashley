import { execFileSync } from "node:child_process";

const SYSTEMD_PROPERTIES = [
  "ActiveState",
  "SubState",
  "MainPID",
  "ControlGroup",
  "Result",
  "NRestarts",
] as const;

export type QualificationServiceState = {
  activeState: string;
  subState: string;
  mainPid: number;
  controlGroup: string;
  result: string;
  nRestarts: number;
};

export type QualificationServiceStabilityReason =
  | "service_start_failed"
  | "service_restart_loop"
  | "service_process_died"
  | "service_cgroup_changed"
  | "service_state_unreadable"
  | "service_stability_timeout";

export type QualificationServiceStabilityResult =
  | {
      status: "waiting";
      samples: number;
      state: QualificationServiceState;
    }
  | {
      status: "stable";
      samples: number;
      state: QualificationServiceState;
    }
  | {
      status: "blocked";
      reason: QualificationServiceStabilityReason;
      state?: QualificationServiceState;
    };

export type SystemctlRunner = (args: readonly string[]) => string;

function defaultSystemctlRunner(args: readonly string[]): string {
  return execFileSync("systemctl", [...args], {
    encoding: "utf8",
    timeout: 2_000,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

export function readSystemdServiceState(
  unit: string,
  runSystemctl: SystemctlRunner = defaultSystemctlRunner,
): QualificationServiceState {
  const raw = runSystemctl([
    "show",
    unit,
    ...SYSTEMD_PROPERTIES.flatMap((property) => ["-p", property]),
  ]);
  const values = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const mainPid = Number(values.get("MainPID"));
  const nRestarts = Number(values.get("NRestarts"));
  if (
    !Number.isInteger(mainPid) ||
    mainPid < 0 ||
    !Number.isInteger(nRestarts) ||
    nRestarts < 0 ||
    values.get("ActiveState") === undefined ||
    values.get("SubState") === undefined ||
    values.get("ControlGroup") === undefined ||
    values.get("Result") === undefined
  ) {
    throw new Error("systemd_service_state_invalid");
  }
  return {
    activeState: values.get("ActiveState")!,
    subState: values.get("SubState")!,
    mainPid,
    controlGroup: values.get("ControlGroup")!,
    result: values.get("Result")!,
    nRestarts,
  };
}

export class StableServiceTracker {
  private readonly requiredSamples: number;
  private lastPid: number | null = null;
  private lastRestarts: number | null = null;
  private stableSamples = 0;
  private observedProcess = false;

  constructor(requiredSamples: number) {
    if (!Number.isInteger(requiredSamples) || requiredSamples < 1) {
      throw new Error("stable_service_sample_count_invalid");
    }
    this.requiredSamples = requiredSamples;
  }

  observe(
    state: QualificationServiceState,
    expectedCgroupPath: string,
  ): QualificationServiceStabilityResult {
    if (state.subState === "auto-restart") {
      return { status: "blocked", reason: "service_restart_loop", state };
    }
    if (this.observedProcess && (state.activeState !== "active" || state.mainPid === 0)) {
      return { status: "blocked", reason: "service_process_died", state };
    }
    if (state.activeState === "failed" || state.result !== "success") {
      return { status: "blocked", reason: "service_start_failed", state };
    }
    if (state.activeState !== "active" || state.subState !== "running") {
      return { status: "waiting", samples: 0, state };
    }
    if (state.mainPid === 0 || state.controlGroup.length === 0) {
      return { status: "waiting", samples: 0, state };
    }
    if (state.controlGroup !== expectedCgroupPath) {
      return { status: "blocked", reason: "service_cgroup_changed", state };
    }
    if (
      this.lastPid !== null &&
      (state.mainPid !== this.lastPid || state.nRestarts !== this.lastRestarts)
    ) {
      return { status: "blocked", reason: "service_restart_loop", state };
    }
    this.observedProcess = true;
    this.lastPid = state.mainPid;
    this.lastRestarts = state.nRestarts;
    this.stableSamples += 1;
    if (this.stableSamples >= this.requiredSamples) {
      return { status: "stable", samples: this.stableSamples, state };
    }
    return { status: "waiting", samples: this.stableSamples, state };
  }
}

export type WaitForStableServiceOptions = {
  unit: string;
  expectedCgroupPath: string;
  timeoutMs?: number;
  intervalMs?: number;
  stableSamples?: number;
  readState?: () => QualificationServiceState;
  nowMs?: () => number;
  sleep?: (intervalMs: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_INTERVAL_MS = 200;
const DEFAULT_STABLE_SAMPLES = 3;

export async function waitForStableService(
  options: WaitForStableServiceOptions,
): Promise<QualificationServiceStabilityResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const sleep =
    options.sleep ??
    ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(intervalMs) || intervalMs < 1) {
    return { status: "blocked", reason: "service_stability_timeout" };
  }
  const readState =
    options.readState ?? (() => readSystemdServiceState(options.unit));
  const tracker = new StableServiceTracker(options.stableSamples ?? DEFAULT_STABLE_SAMPLES);
  const deadline = nowMs() + timeoutMs;
  let lastState: QualificationServiceState | undefined;
  while (nowMs() < deadline) {
    try {
      lastState = readState();
    } catch {
      return { status: "blocked", reason: "service_state_unreadable", state: lastState };
    }
    const decision = tracker.observe(lastState, options.expectedCgroupPath);
    if (decision.status === "stable" || decision.status === "blocked") return decision;
    await sleep(intervalMs);
  }
  return { status: "blocked", reason: "service_stability_timeout", state: lastState };
}
