/**
 * Network isolation provider (Sandbox Wave 4, Commit 9).
 *
 * Every fixed recipe runs with `networkMode: "none"`. The provider is the
 * broker's OS-level enforcement seam: production is Linux Mint and the real
 * provider will place the spawned process in an isolated network namespace
 * before exec. The interface is injected so tests stay deterministic and so
 * an unconfigured broker fails closed — there is no silent environment-only
 * downgrade, and a request is never executed because "the env looked fine".
 */

export type NetworkIsolationEnforcement =
  | { ok: true }
  | { ok: false; errorCode: string; reason: string };

export interface NetworkIsolationProvider {
  /**
   * Called immediately before spawn. Returns ok only when the child's
   * network namespace is actively isolated from the host.
   */
  enforce(): Promise<NetworkIsolationEnforcement> | NetworkIsolationEnforcement;
}

/** Fail-closed default: no provider, no execution. */
export const NETWORK_ISOLATION_UNAVAILABLE: NetworkIsolationEnforcement = {
  ok: false,
  errorCode: "network_isolation_unavailable",
  reason: "no network isolation provider configured",
};

export function createUnavailableNetworkIsolation(): NetworkIsolationProvider {
  return {
    enforce() {
      return NETWORK_ISOLATION_UNAVAILABLE;
    },
  };
}
