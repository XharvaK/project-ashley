/**
 * Engineering autonomy activation + rollback (Autonomous Engineering
 * Workstation wave).
 *
 * Historical observe-only sandbox admissions must NOT execute suddenly. A
 * durable activation epoch gates execution: only work admitted under the new
 * production-autonomy regime may run. Activation is a sequence of verified
 * steps; rollback disables autonomous scheduling while preserving all evidence.
 *
 * This module is pure orchestration state; the actual host steps (qualification
 * promotion, broker restart, canary, clone init) are performed by scripts/mint
 * and the broker. The agent records the durable epoch and verifies the
 * expected final markers.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const ENGINEERING_ACTIVATION_ENV = "ASHLEY_SANDBOX_LIFECYCLE";

/**
 * Default host-owned activation marker path. The owner's activation runbook
 * writes this file (with a broker-verifiable `epochMs`) as the final cutover
 * step; the agent ingests it into the durable epoch on startup. Tampering or
 * absence fails closed: no epoch => the supervisor never dispatches.
 */
export const DEFAULT_ACTIVATION_MARKER_PATH = join(
  homedir(),
  ".composer-assistant",
  "engineering-activation.json",
);

/** Read the activation epoch from the host marker; null means not activated. */
export function readActivationMarkerEpoch(markerPath: string): number | null {
  try {
    if (!existsSync(markerPath)) return null;
    const raw = JSON.parse(readFileSync(markerPath, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null) return null;
    const epochMs = Number((raw as { epochMs?: unknown }).epochMs);
    return Number.isFinite(epochMs) && epochMs > 0 ? epochMs : null;
  } catch {
    return null;
  }
}

export type ActivationStep =
  | "verify_source"
  | "verify_qualification_evidence"
  | "verify_policy"
  | "verify_protected_live_checkout"
  | "verify_installed_artifacts"
  | "restart_broker_if_required"
  | "verify_broker_readiness"
  | "run_canary"
  | "verify_canary_receipt"
  | "init_project_registry"
  | "init_self_improvement_clone"
  | "init_activation_epoch"
  | "enable_agent_lifecycle"
  | "restart_reload_agent"
  | "verify_agent_health"
  | "verify_worker_health"
  | "verify_historical_admissions_untouched";

export type ActivationMarkers = {
  qualification: "qualified" | "unqualified";
  brokerExecutionIsolation: "ready" | "not_ready";
  canary: "PASS" | "FAIL";
  selfImprovementClone: "ready" | "not_ready";
  engineeringWorker: "ready" | "not_ready";
  historicalAdmissionsExecuted: number;
  sandboxAutonomy: "ENABLED" | "DISABLED";
};

export type ActivationState = {
  epochMs: number;
  activated: boolean;
  completedSteps: ActivationStep[];
  markers: Partial<ActivationMarkers>;
  rollbackAvailable: boolean;
};

export function initActivationState(epochMs: number): ActivationState {
  return {
    epochMs,
    activated: false,
    completedSteps: [],
    markers: {},
    rollbackAvailable: true,
  };
}

/** Record a completed step. Returns false if the step already completed. */
export function recordStep(state: ActivationState, step: ActivationStep): boolean {
  if (state.completedSteps.includes(step)) return false;
  state.completedSteps.push(step);
  return true;
}

export function setMarkers(state: ActivationState, markers: Partial<ActivationMarkers>): void {
  state.markers = { ...state.markers, ...markers };
}

export function isActivationComplete(state: ActivationState): boolean {
  const required: ActivationStep[] = [
    "verify_source",
    "verify_qualification_evidence",
    "verify_policy",
    "verify_installed_artifacts",
    "run_canary",
    "verify_canary_receipt",
    "init_activation_epoch",
    "enable_agent_lifecycle",
    "verify_agent_health",
    "verify_historical_admissions_untouched",
  ];
  const allSteps = required.every((s) => state.completedSteps.includes(s));
  const markersOk =
    state.markers.qualification === "qualified" &&
    state.markers.brokerExecutionIsolation === "ready" &&
    state.markers.canary === "PASS" &&
    state.markers.sandboxAutonomy === "ENABLED";
  return allSteps && markersOk;
}

/** Rollback: disable autonomy; preserve evidence and clone. Idempotent. */
export function rollback(state: ActivationState): ActivationState {
  state.activated = false;
  state.markers = { ...state.markers, sandboxAutonomy: "DISABLED" };
  state.rollbackAvailable = true;
  return state;
}

export function expectedActivationOutput(state: ActivationState): ActivationMarkers {
  return {
    qualification: state.markers.qualification ?? "unqualified",
    brokerExecutionIsolation: state.markers.brokerExecutionIsolation ?? "not_ready",
    canary: state.markers.canary ?? "FAIL",
    selfImprovementClone: state.markers.selfImprovementClone ?? "not_ready",
    engineeringWorker: state.markers.engineeringWorker ?? "not_ready",
    historicalAdmissionsExecuted: state.markers.historicalAdmissionsExecuted ?? 0,
    sandboxAutonomy: state.markers.sandboxAutonomy ?? "DISABLED",
  };
}
