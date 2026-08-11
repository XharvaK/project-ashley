/**
 * Execution isolation contract tests (SANDBOX-ISOLATION-01).
 *
 * Pins the fail-closed contract: the unavailable provider refuses with zero
 * spawn, the requirement gate ranks evidence statuses honestly, level
 * requirements are design constants, and the broker-owned evidence merge
 * never overclaims a fact the execution did not actually apply.
 */

import { describe, expect, it } from "vitest";
import type { FakeRunRequest } from "../process/fake-runner.js";
import {
  EXECUTION_ISOLATION_PROPERTIES,
  EXECUTION_ISOLATION_UNAVAILABLE,
  augmentBrokerOwnedEvidence,
  createUnavailableExecutionIsolation,
  formatIsolationEvidenceSummary,
  isolationLevelRequirement,
  meetsIsolationRequirement,
  supportedLevelFromEvidence,
  unavailableIsolationEvidence,
  type ExecutionIsolationEnforcement,
  type ExecutionIsolationProvider,
  type IsolationEvidence,
} from "../index.js";

const baseRequest: FakeRunRequest = {
  taskId: "t-1",
  argv: ["/usr/bin/true", "--smoke"],
  cwd: "/opt/ashley-sandbox",
  env: { PATH: "/usr/bin:/bin" },
  wallMs: 5_000,
  maxProcesses: 1,
  maxOutputBytes: 1_024,
};

function evidenceWith(
  overrides: Partial<Record<keyof IsolationEvidence, IsolationEvidence[keyof IsolationEvidence]>>,
): IsolationEvidence {
  return {
    ...unavailableIsolationEvidence("test base"),
    ...overrides,
  };
}

describe("execution isolation", () => {
  it("1. the unavailable provider fails closed with zero spawn", async () => {
    const provider = createUnavailableExecutionIsolation();
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("execution_isolation_unavailable");
    }
  });

  it("2. the unavailable constant is stable", () => {
    expect(EXECUTION_ISOLATION_UNAVAILABLE).toEqual({
      ok: false,
      errorCode: "execution_isolation_unavailable",
      reason: "no execution isolation provider configured",
    });
  });

  it("3. the unavailable provider reports every property absent", () => {
    const provider = createUnavailableExecutionIsolation();
    expect(provider.status()).toBe("unavailable");
    for (const property of EXECUTION_ISOLATION_PROPERTIES) {
      expect(provider.evidence()[property].status).toBe("absent");
    }
    expect(provider.supportedLevel()).toBe(0);
  });

  it("4. the requirement gate ranks statuses honestly", () => {
    const provided = evidenceWith({ network: { status: "provided", notes: [] } });
    expect(meetsIsolationRequirement(provided, { network: "provided" }).ok).toBe(true);
    expect(meetsIsolationRequirement(provided, { network: "partial" }).ok).toBe(true);
    expect(meetsIsolationRequirement(provided, { network: "unproven" }).ok).toBe(true);

    const partial = evidenceWith({ network: { status: "partial", notes: [] } });
    expect(meetsIsolationRequirement(partial, { network: "provided" }).ok).toBe(false);
    expect(meetsIsolationRequirement(partial, { network: "partial" }).ok).toBe(true);
    expect(meetsIsolationRequirement(partial, { network: "unproven" }).ok).toBe(true);

    const unproven = evidenceWith({ network: { status: "unproven", notes: [] } });
    expect(meetsIsolationRequirement(unproven, { network: "provided" }).ok).toBe(false);
    expect(meetsIsolationRequirement(unproven, { network: "partial" }).ok).toBe(false);
    expect(meetsIsolationRequirement(unproven, { network: "unproven" }).ok).toBe(true);

    const absent = evidenceWith({ network: { status: "absent", notes: [] } });
    expect(meetsIsolationRequirement(absent, { network: "provided" }).ok).toBe(false);
    expect(meetsIsolationRequirement(absent, { network: "partial" }).ok).toBe(false);
    expect(meetsIsolationRequirement(absent, { network: "unproven" }).ok).toBe(false);
  });

  it("5. unmet requirements list property:required_but_actual", () => {
    const evidence = evidenceWith({
      network: { status: "provided", notes: [] },
      process_tree: { status: "unproven", notes: [] },
      control_plane_invisible: { status: "provided", notes: [] },
      broker_socket_invisible: { status: "provided", notes: [] },
    });
    const check = meetsIsolationRequirement(evidence, isolationLevelRequirement(1));
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.unmet).toEqual(["process_tree:partial_but_unproven"]);
    }
  });

  it("6. level requirements are design constants", () => {
    expect(isolationLevelRequirement(0)).toEqual({});
    expect(isolationLevelRequirement(1)).toEqual({
      network: "provided",
      process_tree: "partial",
      control_plane_invisible: "provided",
      broker_socket_invisible: "provided",
    });
    expect(isolationLevelRequirement(2)).toEqual({
      network: "provided",
      process_tree: "partial",
      filesystem_view: "partial",
      environment: "partial",
      resource: "partial",
      control_plane_invisible: "provided",
      broker_socket_invisible: "provided",
    });
    expect(isolationLevelRequirement(3)).toEqual({
      network: "provided",
      process_tree: "partial",
      filesystem_view: "provided",
      environment: "provided",
      resource: "provided",
      control_plane_invisible: "provided",
      broker_socket_invisible: "provided",
    });
  });

  it("7. supportedLevel is the highest satisfied level", () => {
    const l1 = evidenceWith({
      network: { status: "provided", notes: [] },
      process_tree: { status: "partial", notes: [] },
      control_plane_invisible: { status: "provided", notes: [] },
      broker_socket_invisible: { status: "provided", notes: [] },
    });
    expect(supportedLevelFromEvidence(l1)).toBe(1);

    const l2 = evidenceWith({
      network: { status: "provided", notes: [] },
      process_tree: { status: "partial", notes: [] },
      filesystem_view: { status: "partial", notes: [] },
      environment: { status: "partial", notes: [] },
      resource: { status: "partial", notes: [] },
      control_plane_invisible: { status: "provided", notes: [] },
      broker_socket_invisible: { status: "provided", notes: [] },
    });
    expect(supportedLevelFromEvidence(l2)).toBe(2);

    const l3 = evidenceWith({
      network: { status: "provided", notes: [] },
      process_tree: { status: "provided", notes: [] },
      filesystem_view: { status: "provided", notes: [] },
      environment: { status: "provided", notes: [] },
      resource: { status: "provided", notes: [] },
      control_plane_invisible: { status: "provided", notes: [] },
      broker_socket_invisible: { status: "provided", notes: [] },
    });
    expect(supportedLevelFromEvidence(l3)).toBe(3);
  });

  it("8. the merge keeps provider-owned evidence untouched", () => {
    const provider = evidenceWith({
      network: { status: "provided", notes: ["unshare --net"] },
      process_tree: { status: "unproven", notes: ["candidate A flags unqualified"] },
    });
    const merged = augmentBrokerOwnedEvidence(provider, {
      workspaceBound: true,
      sourceIdentityBound: true,
      environmentHardened: true,
      resourceLimitsEnforced: true,
    });
    expect(merged.network.status).toBe("provided");
    expect(merged.process_tree.status).toBe("unproven");
  });

  it("9. the merge never overclaims broker-owned facts", () => {
    const provider = evidenceWith({});
    const bare = augmentBrokerOwnedEvidence(provider, {
      workspaceBound: false,
      sourceIdentityBound: false,
      environmentHardened: false,
      resourceLimitsEnforced: false,
    });
    expect(bare.environment.status).toBe("absent");
    expect(bare.resource.status).toBe("absent");
    expect(bare.source_binding.status).toBe("absent");
    expect(bare.workspace_binding.status).toBe("absent");

    const full = augmentBrokerOwnedEvidence(provider, {
      workspaceBound: true,
      sourceIdentityBound: true,
      environmentHardened: true,
      resourceLimitsEnforced: true,
    });
    expect(full.environment.status).toBe("partial");
    expect(full.resource.status).toBe("partial");
    expect(full.source_binding.status).toBe("provided");
    expect(full.workspace_binding.status).toBe("provided");

    const fallback = augmentBrokerOwnedEvidence(provider, {
      workspaceBound: true,
      sourceIdentityBound: false,
      environmentHardened: true,
      resourceLimitsEnforced: true,
    });
    expect(fallback.source_binding.status).toBe("partial");
  });

  it("10. the summary is deterministic and bounded", () => {
    const evidence = evidenceWith({
      network: { status: "provided", notes: [] },
    });
    expect(formatIsolationEvidenceSummary(evidence)).toBe(
      "process_tree=absent,network=provided,filesystem_view=absent,control_plane_invisible=absent,broker_socket_invisible=absent,environment=absent,resource=absent,source_binding=absent,workspace_binding=absent",
    );
  });

  it("11. an enforcement is assignable to the network enforcement shape", async () => {
    const provider: ExecutionIsolationProvider = {
      async prepare(
        request: FakeRunRequest,
      ): Promise<ExecutionIsolationEnforcement> {
        return {
          ok: true,
          request,
          isolation: unavailableIsolationEvidence("test"),
        };
      },
      status: () => "unavailable",
      evidence: () => unavailableIsolationEvidence("test"),
      supportedLevel: () => 0,
    };
    const enforcement = await provider.prepare(baseRequest);
    expect(enforcement.ok).toBe(true);
    if (enforcement.ok) {
      expect(enforcement.isolation.network.status).toBe("absent");
    }
  });
});
