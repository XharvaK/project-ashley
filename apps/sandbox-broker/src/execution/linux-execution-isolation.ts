/**
 * Linux execution isolation provider (SANDBOX-ISOLATION-01).
 *
 * Extends the spawn-coupled `LinuxUnshareNetworkIsolation` with honest
 * per-property execution isolation evidence. The mechanism today is
 * `unshare --user --map-root-user --net` only: it provides network
 * isolation and nothing else physical. Every other property is reported
 * truthfully —
 *
 *   process_tree           unproven  — candidate A adds
 *                                     `--pid --fork --mount --mount-proc`
 *                                     for pid + mount namespace containment,
 *                                     but the flags are NOT wired into
 *                                     `prepare()` until qualified on the
 *                                     target host, and the systemd unit's
 *                                     `RestrictNamespaces=user net` must
 *                                     become `user net mount pid` first
 *                                     (inactive source change; qualifying
 *                                     that combination invalidates the
 *                                     current R5A/R5B evidence)
 *   filesystem_view        unproven  — mount namespace unqualified; no
 *                                     OS-level read-only bind policy
 *   control_plane_invisible absent    — KNOWN-visible: the child runs in
 *                                     the broker's uid and can read
 *                                     /var/lib/ashley-sandbox and
 *                                     /etc/ashley-sandbox
 *   broker_socket_invisible absent    — KNOWN-visible: the child can
 *                                     connect to /run/ashley/broker.sock
 *                                     (same uid, mode 0660)
 *   environment/resource/source_binding/workspace_binding — broker-service
 *                                     owned; the service merge replaces them
 *
 * The consequence is deliberate: with this evidence, `supportedLevel()`
 * stays 0 and the level-1 canary requirement is never met until the
 * process-tree containment is qualified. Nothing in this file changes what
 * executes: the child is still the child created by the verified unshare
 * mechanism, and a failed unshare still means the recipe never runs.
 */

import type { FakeRunRequest } from "../process/fake-runner.js";
import {
  LinuxUnshareNetworkIsolation,
  type LinuxUnshareIsolationOptions,
} from "./linux-network-isolation.js";
import {
  EXECUTION_ISOLATION_PROPERTIES,
  supportedLevelFromEvidence,
  type ExecutionIsolationEnforcement,
  type ExecutionIsolationLevel,
  type ExecutionIsolationProvider,
  type IsolationEvidence,
} from "./execution-isolation.js";

/**
 * Candidate A process/mount containment argv builder. Design and tests
 * only — deliberately NOT used by `prepare()`: wiring it in requires the
 * inactive systemd `RestrictNamespaces=user net mount pid` change and a
 * Mint qualification run first (see module header).
 */
export function buildUnshareProcessIsolationArgv(
  unsharePath: string,
  recipeArgv: readonly string[],
): string[] {
  return [
    unsharePath,
    "--user",
    "--map-root-user",
    "--net",
    "--pid",
    "--fork",
    "--mount",
    "--mount-proc",
    "--",
    ...recipeArgv,
  ];
}

export class LinuxExecutionIsolation
  extends LinuxUnshareNetworkIsolation
  implements ExecutionIsolationProvider
{
  constructor(options: LinuxUnshareIsolationOptions) {
    super(options);
  }

  /** Honest per-property evidence for the currently wired mechanism. */
  evidence(): IsolationEvidence {
    const properties = Object.fromEntries(
      EXECUTION_ISOLATION_PROPERTIES.map((property) => [
        property,
        {
          status: "absent",
          notes: ["broker-service owned; replaced by the service merge"],
        },
      ]),
    ) as unknown as IsolationEvidence;
    return {
      ...properties,
      network: {
        status: "provided",
        notes: ["unshare --user --map-root-user --net; fresh netns, no host interfaces"],
      },
      process_tree: {
        status: "unproven",
        notes: [
          "candidate A --pid --fork --mount --mount-proc designed but unqualified; systemd RestrictNamespaces change inactive",
        ],
      },
      filesystem_view: {
        status: "unproven",
        notes: ["mount namespace containment unqualified on target host"],
      },
      control_plane_invisible: {
        status: "absent",
        notes: ["known-visible: child uid equals broker uid; /var/lib and /etc/ashley-sandbox readable"],
      },
      broker_socket_invisible: {
        status: "absent",
        notes: ["known-visible: /run/ashley/broker.sock connectable by the child uid"],
      },
    };
  }

  supportedLevel(): ExecutionIsolationLevel {
    return supportedLevelFromEvidence(this.evidence());
  }

  override prepare(request: FakeRunRequest): ExecutionIsolationEnforcement {
    const base = super.prepare(request);
    if (!base.ok) return base;
    return {
      ok: true,
      request: base.request,
      isolation: this.evidence(),
    };
  }
}
