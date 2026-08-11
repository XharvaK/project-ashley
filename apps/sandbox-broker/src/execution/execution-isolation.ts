/**
 * Execution isolation contract (SANDBOX-ISOLATION-01).
 *
 * R5A bounds the network isolation provider to the network namespace only:
 * the spawn specification it returns protects the broker from network
 * exfiltration, but the recipe child still runs in the broker's uid with
 * the broker's filesystem, environment, process-tree and control-plane
 * context. The execution isolation contract extends the same
 * spawn-coupled discipline to the full physical isolation picture: a
 * fixed recipe may declare an isolation requirement (`requiredIsolation`),
 * and it never runs unless the merged evidence satisfies that requirement.
 *
 * Evidence honesty — the governing rule of this module. A provider
 * reports the properties its mechanism PHYSICALLY enforces, never
 * aspirations, configuration intent, or unqualified plans:
 *
 *   provided  — the mechanism is in effect and the property holds
 *   partial   — the mechanism is in effect with documented gaps
 *   unproven  — the mechanism may exist but has not been qualified
 *   absent    — the property is KNOWN to be missing (never "unproven" for
 *               a documented-visible surface, e.g. an unshare --net child
 *               CAN read the broker control plane — that is `absent`)
 *
 * Isolation properties are owned either by a provider (the OS-level
 * mechanism) or by the broker service (its own execution policies). The
 * service merges the provider's honest claim with its own broker-owned
 * facts via `augmentBrokerOwnedEvidence` before the gate runs; a property
 * is only as strong as its owner's evidence.
 *
 * Levels (0 disabled / 1 canary / 2 static / 3 arbitrary test exec) are
 * design constants. In this spike only level 1 is implemented: the
 * `verify:broker-smoke` canary is the single registry recipe that declares
 * `requiredIsolation`. Levels 2 and 3 exist so future qualification can
 * unlock them without redesigning the contract; nothing else is wired.
 *
 * The gate is fail-closed: requirement unmet → refusal before reservation,
 * no spawn, no budget.
 */

import type { FakeRunRequest } from "../process/fake-runner.js";
import type {
  NetworkIsolationProvider,
  NetworkIsolationStatus,
} from "./network-isolation.js";

/**
 * Physical isolation properties of an execution. `network`,
 * `process_tree`, `filesystem_view`, `control_plane_invisible` and
 * `broker_socket_invisible` are owned by the provider; `environment`,
 * `resource`, `source_binding` and `workspace_binding` are owned by the
 * broker service.
 */
export type IsolationProperty =
  | "process_tree"
  | "network"
  | "filesystem_view"
  | "control_plane_invisible"
  | "broker_socket_invisible"
  | "environment"
  | "resource"
  | "source_binding"
  | "workspace_binding";

/** Stable iteration order for summaries, readiness and audit output. */
export const EXECUTION_ISOLATION_PROPERTIES: readonly IsolationProperty[] = [
  "process_tree",
  "network",
  "filesystem_view",
  "control_plane_invisible",
  "broker_socket_invisible",
  "environment",
  "resource",
  "source_binding",
  "workspace_binding",
];

export type IsolationPropertyStatus =
  | "provided"
  | "partial"
  | "unproven"
  | "absent";

export type IsolationPropertyEvidence = {
  status: IsolationPropertyStatus;
  notes: readonly string[];
};

/** Every property with its per-property evidence. Never partial records. */
export type IsolationEvidence = Readonly<
  Record<IsolationProperty, IsolationPropertyEvidence>
>;

/**
 * The minimum status a recipe requires per property. A requirement of
 * `provided` is met only by provided; `partial` is met by provided or
 * partial; `unproven` is met by anything but absent.
 */
export type IsolationRequirement = Readonly<
  Partial<Record<IsolationProperty, "provided" | "partial" | "unproven">>
>;

/** 0 disabled / 1 canary / 2 static / 3 arbitrary test exec. */
export type ExecutionIsolationLevel = 0 | 1 | 2 | 3;

/**
 * Design constant: the isolation requirement each level demands. Levels 2
 * and 3 are not implemented in this spike; they exist so future
 * qualification can unlock them without redesigning the contract.
 *
 * Level 1 (canary) requires a probed network mechanism, at least partial
 * process-tree containment, and provided control-plane and broker-socket
 * invisibility. The canary is trusted (`/usr/bin/true`) but must exercise the
 * same mechanism chain that will guard hostile recipes, so it cannot run
 * until those visibility and process-tree properties are qualified. Level 2
 * (static, broker-owned recipes) adds the file/environment/resource
 * mechanisms. Level 3 (arbitrary test exec) requires those mechanisms as
 * provided rather than partial.
 */
export function isolationLevelRequirement(
  level: ExecutionIsolationLevel,
): IsolationRequirement {
  switch (level) {
    case 0:
      return {};
    case 1:
      return {
        network: "provided",
        process_tree: "partial",
        control_plane_invisible: "provided",
        broker_socket_invisible: "provided",
      };
    case 2:
      return {
        network: "provided",
        process_tree: "partial",
        filesystem_view: "partial",
        environment: "partial",
        resource: "partial",
        control_plane_invisible: "provided",
        broker_socket_invisible: "provided",
      };
    case 3:
      return {
        network: "provided",
        process_tree: "partial",
        filesystem_view: "provided",
        environment: "provided",
        resource: "provided",
        control_plane_invisible: "provided",
        broker_socket_invisible: "provided",
      };
  }
}

const REQUIREMENT_RANK: Record<IsolationPropertyStatus, number> = {
  provided: 3,
  partial: 2,
  unproven: 1,
  absent: 0,
};

export type IsolationRequirementCheck =
  | { ok: true }
  | { ok: false; unmet: readonly string[] };

/**
 * The isolation gate: does the evidence satisfy the requirement? Each
 * unmet property is listed as `property:required_but_actual`.
 */
export function meetsIsolationRequirement(
  evidence: IsolationEvidence,
  requirement: IsolationRequirement,
): IsolationRequirementCheck {
  const unmet: string[] = [];
  for (const [property, required] of Object.entries(requirement) as [
    IsolationProperty,
    "provided" | "partial" | "unproven",
  ][]) {
    const actual = evidence[property]?.status ?? "absent";
    if (REQUIREMENT_RANK[actual] < REQUIREMENT_RANK[required]) {
      unmet.push(`${property}:${required}_but_${actual}`);
    }
  }
  return unmet.length > 0 ? { ok: false, unmet } : { ok: true };
}

/** Highest level whose requirement the evidence satisfies; 0 if none. */
export function supportedLevelFromEvidence(
  evidence: IsolationEvidence,
): ExecutionIsolationLevel {
  for (const level of [3, 2, 1] as const) {
    if (meetsIsolationRequirement(evidence, isolationLevelRequirement(level)).ok) {
      return level;
    }
  }
  return 0;
}

/**
 * Result of preparing a spawn for execution isolation. `ok:true` carries
 * the complete immutable spawn specification plus the provider's evidence
 * for this execution; the caller MUST execute exactly `request`. A refusal
 * never spawns.
 *
 * The subtype relationship to `NetworkIsolationEnforcement` is deliberate:
 * an `ok:true` execution enforcement is assignable to the network
 * enforcement shape (extra evidence field), and refusals share the shape,
 * so existing network-isolation consumers and frozen fixture providers
 * (which implement only the base interface) keep working unchanged.
 */
export type ExecutionIsolationEnforcement =
  | { ok: true; request: FakeRunRequest; isolation: IsolationEvidence }
  | { ok: false; errorCode: string; reason: string };

/**
 * The execution isolation provider seam. Extends the network isolation
 * provider (so it remains the single spawn-coupled prepare path) and adds
 * honest per-property evidence plus the level the mechanism can currently
 * sustain. A provider must never claim a property its mechanism does not
 * physically enforce.
 */
export interface ExecutionIsolationProvider extends NetworkIsolationProvider {
  prepare(
    request: FakeRunRequest,
  ): Promise<ExecutionIsolationEnforcement> | ExecutionIsolationEnforcement;
  /** Honest per-property evidence for the mechanism as currently qualified. */
  evidence(): IsolationEvidence;
  /** Highest isolatable level supported by this provider's current evidence. */
  supportedLevel(): ExecutionIsolationLevel;
}

/** Fail-closed default: no provider, no execution. */
export const EXECUTION_ISOLATION_UNAVAILABLE: ExecutionIsolationEnforcement = {
  ok: false,
  errorCode: "execution_isolation_unavailable",
  reason: "no execution isolation provider configured",
};

export function unavailableIsolationEvidence(
  reason: string,
): IsolationEvidence {
  return Object.fromEntries(
    EXECUTION_ISOLATION_PROPERTIES.map((property) => [
      property,
      { status: "absent", notes: [reason] },
    ]),
  ) as unknown as IsolationEvidence;
}

export function createUnavailableExecutionIsolation(): ExecutionIsolationProvider {
  return {
    prepare() {
      return EXECUTION_ISOLATION_UNAVAILABLE;
    },
    status(): NetworkIsolationStatus {
      return "unavailable";
    },
    evidence() {
      return unavailableIsolationEvidence(
        "no execution isolation provider configured",
      );
    },
    supportedLevel() {
      return 0;
    },
  };
}

/** Broker-owned execution facts the service feeds into the merged evidence. */
export type BrokerOwnedIsolationFacts = {
  /** The session workspace is bound for broker-authorized cwd and write paths. */
  workspaceBound: boolean;
  /** The bound workspace was created from an identity-resolved source root. */
  sourceIdentityBound: boolean;
  /** The strict environment builder (denylist, synthetic HOME) was in effect. */
  environmentHardened: boolean;
  /** The runner enforced wall/process/output limits on this execution. */
  resourceLimitsEnforced: boolean;
};

/**
 * Merges the provider's honest mechanism evidence with the broker-owned
 * facts. Provider-owned properties pass through untouched; broker-owned
 * properties reflect exactly what this execution did. Never overclaims: a
 * missing fact yields `absent`, never `provided`.
 */
export function augmentBrokerOwnedEvidence(
  providerEvidence: IsolationEvidence,
  facts: BrokerOwnedIsolationFacts,
): IsolationEvidence {
  const { workspaceBound, sourceIdentityBound } = facts;
  return {
    ...providerEvidence,
    environment: facts.environmentHardened
      ? {
          status: "partial",
          notes: [
            "denylist + synthetic HOME + fixed PATH default in effect; allowlisted passthrough remains",
          ],
        }
      : {
          status: "absent",
          notes: ["strict environment builder not in effect"],
        },
    resource: facts.resourceLimitsEnforced
      ? {
          status: "partial",
          notes: [
            "wallMs/maxProcesses/maxOutputBytes enforced by runner; no cgroup cpu/mem ceiling",
          ],
        }
      : {
          status: "absent",
          notes: ["runner limits not enforced for this execution"],
        },
    source_binding: sourceIdentityBound
      ? {
          status: "provided",
          notes: ["workspace tree created from identity-resolved source root"],
        }
      : workspaceBound
        ? {
            status: "partial",
            notes: [
              "single-root fallback in effect; no task source identity bound",
            ],
          }
        : {
            status: "absent",
            notes: ["no workspace bound to this execution"],
          },
    workspace_binding: workspaceBound
      ? {
          status: "provided",
          notes: ["broker-authorized cwd + read/write paths constrained to disposable tree; not a kernel filesystem boundary"],
        }
      : {
          status: "absent",
          notes: ["no workspace bound to this execution"],
        },
  };
}

/** Bounded, deterministic one-line summary of the merged evidence. */
export function formatIsolationEvidenceSummary(
  evidence: IsolationEvidence,
): string {
  return EXECUTION_ISOLATION_PROPERTIES.map(
    (property) => `${property}=${evidence[property].status}`,
  ).join(",");
}

/**
 * Readiness composite for `sandbox.readiness`-style reporting. The
 * per-property evidence is the source of truth; the aggregate labels are
 * derived, and they must never be stronger than the evidence supports.
 */
export type ExecutionIsolationReadiness = {
  providerAvailable: boolean;
  mechanicallyOperational: boolean;
  properties: IsolationEvidence;
  probesPassed: boolean;
  supportedLevel: ExecutionIsolationLevel;
};
