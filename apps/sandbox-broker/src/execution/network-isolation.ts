/**
 * Network isolation provider (Sandbox Wave 4, Commit 9; R5A spawn-coupled).
 *
 * Every fixed recipe runs with `networkMode: "none"`. The provider is the
 * broker's OS-level enforcement seam: production is Linux Mint and the real
 * provider rewrites the spawn specification so the recipe child is created
 * inside a fresh unprivileged network namespace before exec.
 *
 * R5A contract — isolation and spawn are inseparable:
 *
 *   NO ISOLATION → NO SPAWN
 *
 * `prepare()` does not merely report "ok". It returns the complete, immutable
 * spawn specification (`request`) that the process runner must execute. The
 * fixed-recipe execution service has exactly one spawn path and it executes
 * only a prepared specification, so a provider can never return isolation
 * PASS independently of the process being launched. `prepare()` failing
 * (unavailable provider, non-Linux host, missing isolation executable, probe
 * failure) refuses the execution before any reservation or spawn.
 *
 * The Linux mechanism uses `unshare(CLONE_NEWUSER|CLONE_NEWNET)` via the
 * util-linux `unshare` binary: the spawned child IS the isolation setup
 * process and execs the recipe in the same process inside the fresh network
 * namespace — the exact child that executes the fixed recipe is the child
 * created inside the verified isolation mechanism. No shell, no fallback to
 * an ordinary spawn: a failed unshare means the recipe never runs.
 *
 * The interface is injected so tests stay deterministic and so an
 * unconfigured broker fails closed — there is no silent environment-only
 * downgrade, and a request is never executed because "the env looked fine".
 */

import type { FakeRunRequest } from "../process/fake-runner.js";

/**
 * Result of preparing a spawn for isolation.
 *
 * - ok:true — the caller MUST execute exactly `request`; it is the complete
 *   isolated spawn specification.
 * - ok:false — no process may be spawned; the request is refused with a typed
 *   error code.
 */
export type NetworkIsolationEnforcement =
  | { ok: true; request: FakeRunRequest }
  | { ok: false; errorCode: string; reason: string };

/**
 * Truthful readiness label for the network isolation seam.
 *
 * - `operational`: the provider is configured AND an active boot-time probe
 *   actually exercised the isolation mechanism through the process runner
 *   and succeeded. Static prerequisites alone never qualify (R5B).
 * - `unavailable`: no provider, static prerequisites cannot be satisfied,
 *   or no successful active probe is cached.
 *
 * Readiness must never report usable isolation merely because code exists.
 */
export type NetworkIsolationStatus = "operational" | "unavailable";

/**
 * Result of an active isolation probe (R5B). The probe spawns a bounded,
 * trusted no-op process through the provider's own prepared specification so
 * the real mechanism (e.g. `unshare --user --map-root-user --net`) is
 * exercised under the exact host security context the broker runs in.
 *
 * - `operational`: the prepared probe process ran to completion with exit
 *   code 0 — the isolation mechanism is usable right now.
 * - `not_operational`: the mechanism could not be exercised; `reason` is a
 *   short diagnostic string (error code, terminal reason, exit code).
 */
export type NetworkIsolationActiveProbeResult =
  | { kind: "operational" }
  | { kind: "not_operational"; reason: string };

export interface NetworkIsolationProvider {
  /**
   * Called before reservation. Returns the complete isolated spawn
   * specification, or a typed refusal. A refusal must never be followed by
   * any process spawn.
   */
  prepare(request: FakeRunRequest): Promise<NetworkIsolationEnforcement> | NetworkIsolationEnforcement;

  /**
   * Truthful readiness label for `sandbox.readiness`. Operational may be
   * reported only after a successful active probe (see `probeActive`).
   */
  status(): NetworkIsolationStatus;

  /**
   * Optional active isolation probe (R5B). Runs a bounded no-op process
   * through the provider's own prepared specification and caches the
   * result; `status()` reflects the cached probe. Providers without a probe
   * can never report operational and must be treated as fail-closed by the
   * boot path.
   */
  probeActive?(): Promise<NetworkIsolationActiveProbeResult>;

  /** Optional cancellation passthrough for in-flight isolated runs. */
  cancel?(taskId: string): boolean;
}

/** Fail-closed default: no provider, no execution. */
export const NETWORK_ISOLATION_UNAVAILABLE: NetworkIsolationEnforcement = {
  ok: false,
  errorCode: "network_isolation_unavailable",
  reason: "no network isolation provider configured",
};

export function createUnavailableNetworkIsolation(): NetworkIsolationProvider {
  return {
    prepare() {
      return NETWORK_ISOLATION_UNAVAILABLE;
    },
    status() {
      return "unavailable";
    },
  };
}
