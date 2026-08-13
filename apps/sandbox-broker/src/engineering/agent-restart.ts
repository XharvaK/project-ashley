/**
 * Narrow Ashley-agent service restart lane (Autonomous Engineering Workstation
 * wave).
 *
 * This is the ONLY service Ashley may restart autonomously, and only under
 * strict prerequisites:
 *  - a deterministic unhealthy/non-recoverable health check
 *  - no restart already attempted for the current incident
 *  - a per-incident cooldown
 *  - at most ONE automatic restart attempt
 *  - a post-restart health re-verification
 *
 * The broker restart unit is NOT reachable through this lane. All actual
 * `systemctl` execution is host-gated and networkless. Decision logic here is
 * pure and fully unit-testable.
 */

export const ASHLEY_AGENT_UNIT = "ashley-agent.service";

import type { NetworkIsolationProvider } from "../execution/network-isolation.js";
import type { ProcessRunner } from "../process/fake-runner.js";

export type AgentRestartState = {
  incidentId: string;
  lastAttemptAtMs: number | null;
  attemptsForIncident: number;
  cooldownMs: number;
};

export const MAX_AGENT_RESTART_ATTEMPTS = 1;

/**
 * Broker-owned restart incident state. The agent may never assert attempt
 * counts, cooldowns, or incident identity: those are maintained by the broker
 * and are the sole input to `decideAgentRestart`. A compromised or mistaken
 * agent therefore cannot forge "attemptsForIncident: 0" to bypass the
 * once-per-incident limit or fabricate the clock.
 */
export class AgentRestartIncidentStore {
  private readonly incidents = new Map<
    string,
    { lastAttemptAtMs: number | null; attemptsForIncident: number; cooldownMs: number }
  >();

  get(incidentId: string): AgentRestartState | null {
    const entry = this.incidents.get(incidentId);
    if (!entry) return null;
    return {
      incidentId,
      lastAttemptAtMs: entry.lastAttemptAtMs,
      attemptsForIncident: entry.attemptsForIncident,
      cooldownMs: entry.cooldownMs,
    };
  }

  /** Record a single restart attempt for the incident under the broker clock. */
  recordAttempt(incidentId: string, nowMs: number, cooldownMs: number): void {
    const entry = this.incidents.get(incidentId);
    if (entry) {
      entry.lastAttemptAtMs = nowMs;
      entry.attemptsForIncident += 1;
      entry.cooldownMs = cooldownMs;
    } else {
      this.incidents.set(incidentId, {
        lastAttemptAtMs: nowMs,
        attemptsForIncident: 1,
        cooldownMs,
      });
    }
  }
}

let singleton: AgentRestartIncidentStore | null = null;
export function getAgentRestartIncidentStore(): AgentRestartIncidentStore {
  if (singleton === null) singleton = new AgentRestartIncidentStore();
  return singleton;
}

export type AgentRestartDecision =
  | { ok: true; allowed: true; reason: "prerequisites_met" }
  | { ok: true; allowed: false; reason: AgentRestartDenialReason }
  | { ok: false; errorCode: string; reason: string };

export type AgentRestartDenialReason =
  | "unit_not_ashley_agent"
  | "health_not_unhealthy"
  | "already_attempted_this_incident"
  | "cooldown_active"
  | "unknown_incident";

function isDeterministicUnhealthy(health: { healthy: boolean; deterministic: boolean }): boolean {
  return health.deterministic === true && health.healthy === false;
}

/**
 * Pure decision: may Ashley restart exactly `unit` for `incidentId` given the
 * current health and restart state? No side effects.
 */
export function decideAgentRestart(params: {
  unit: string;
  incidentId: string;
  nowMs: number;
  health: { healthy: boolean; deterministic: boolean };
  state: AgentRestartState | null;
}): AgentRestartDecision {
  if (params.unit !== ASHLEY_AGENT_UNIT) {
    return { ok: true, allowed: false, reason: "unit_not_ashley_agent" };
  }
  if (!isDeterministicUnhealthy(params.health)) {
    return { ok: true, allowed: false, reason: "health_not_unhealthy" };
  }
  const state = params.state;
  if (!state || state.incidentId !== params.incidentId) {
    return { ok: true, allowed: false, reason: "unknown_incident" };
  }
  if (state.attemptsForIncident >= MAX_AGENT_RESTART_ATTEMPTS) {
    return { ok: true, allowed: false, reason: "already_attempted_this_incident" };
  }
  if (state.lastAttemptAtMs !== null && params.nowMs - state.lastAttemptAtMs < state.cooldownMs) {
    return { ok: true, allowed: false, reason: "cooldown_active" };
  }
  return { ok: true, allowed: true, reason: "prerequisites_met" };
}

export type AgentRestartExecutionDeps = {
  executableMappings: Record<string, string>;
  processRunner: ProcessRunner;
  networkIsolation: NetworkIsolationProvider;
  envAllowlist: Set<string>;
};

/**
 * Host-gated execution of the single allowed restart. Returns a typed refusal
 * unless the unit is exactly the Ashley agent unit. Network isolation is
 * mandatory; the command is fixed and never built from model input.
 */
export async function executeAgentRestart(deps: AgentRestartExecutionDeps, unit: string): Promise<
  | { ok: true; exitCode: number; stdout: string; stderr: string }
  | { ok: false; errorCode: string; reason: string }
> {
  if (unit !== ASHLEY_AGENT_UNIT) {
    return { ok: false, errorCode: "unit_forbidden", reason: "only ashley-agent.service may be restarted" };
  }
  const bin = deps.executableMappings["systemctl"];
  if (!bin) {
    return { ok: false, errorCode: "executable_unresolved", reason: "systemctl not mapped" };
  }
  const plan = await deps.networkIsolation.prepare({
    taskId: "agent-restart",
    argv: [bin, "restart", unit],
    cwd: "/",
    env: {},
    wallMs: 30_000,
    maxProcesses: 1,
    maxOutputBytes: 32_768,
  });
  if (!plan.ok) {
    return { ok: false, errorCode: plan.errorCode, reason: plan.reason };
  }
  const result = await deps.processRunner.run(plan.request);
  return { ok: true, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}
