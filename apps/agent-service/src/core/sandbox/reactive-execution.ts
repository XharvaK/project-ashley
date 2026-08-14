/**
 * Reactive sandbox task execution runner (First Reactive Slice).
 *
 * Executes an admitted reactive task through the existing Sandbox
 * coordinator and broker port, producing structured effect evidence.
 */

import type { DatabaseSync } from "node:sqlite";
import { AGENT_AVAILABLE_DIAGNOSTICS } from "./diagnostics.js";
import {
  createEngineeringEnvelopeProvider,
  loadEngineeringTrustAnchors,
  REQUIRED_ENGINEERING_POLICY_IDENTITY,
  verifyEngineeringReadiness,
} from "./engineering-envelope.js";
import { createEngineeringThinkingModel } from "./engineering-model-adapter.js";
import { createBrokerEngineeringPort } from "./broker-engineering-port.js";
import {
  DEFAULT_ENGINEERING_BUDGETS,
  type EngineeringRoots,
  isVerifiedRoundtripEffectEvidence,
  type OperationalClaimLicense,
  type RoundtripEffectEvidence,
  type SandboxTaskProfile,
  type SandboxTaskStatus,
} from "./engineering-types.js";
import {
  loadCoordinatorTasks,
  markAdmissionDispatched,
  persistCoordinatorTasks,
} from "./engineering-runs.js";
import { SandboxEngineeringCoordinator } from "./coordinator.js";
import type { SandboxBrokerClient } from "./broker-client.js";
import { createConfiguredUnixSandboxClient } from "./unix-broker-client.js";
import { buildResolveRoots } from "./engineering-runtime.js";

export type ExecuteReactiveSandboxTaskInput = {
  ownerId: string;
  admissionId: string;
  messageEntityUuid: string;
  brokerClient?: SandboxBrokerClient | null;
  rootsResolver?: (projectId: string | null) => EngineeringRoots;
  nowMs?: () => number;
};

export type ExecuteReactiveSandboxTaskResult = {
  ok: boolean;
  status: SandboxTaskStatus;
  evidence: RoundtripEffectEvidence | null;
  error: string | null;
  taskId: string;
};

export function reactiveSandboxRunResultToOperationalLicense(
  result: ExecuteReactiveSandboxTaskResult,
  profile: SandboxTaskProfile,
  sourceMessageEntityUuid?: string,
): OperationalClaimLicense {
  const base = {
    taskId: result.taskId,
    profile,
    ...(sourceMessageEntityUuid ? { sourceMessageEntityUuid } : {}),
  };

  if (result.ok && isVerifiedRoundtripEffectEvidence(result.evidence)) {
    return {
      ...base,
      state: "succeeded",
      effectEvidence: result.evidence,
    };
  }
  if (result.status === "completed") {
    return {
      ...base,
      state: "none",
      error: result.error ?? "missing_effect_evidence",
    };
  }
  if (result.status === "failed" || result.status === "aborted") {
    return {
      ...base,
      state: "failed",
      error: result.error ?? "roundtrip_failed",
    };
  }
  return { ...base, state: "admitted" };
}

export async function executeReactiveSandboxTask(
  db: DatabaseSync,
  input: ExecuteReactiveSandboxTaskInput,
): Promise<ExecuteReactiveSandboxTaskResult> {
  const nowMs = input.nowMs ?? (() => Date.now());
  const brokerClient = input.brokerClient ?? createConfiguredUnixSandboxClient();
  if (!brokerClient) {
    return {
      ok: false,
      status: "failed",
      evidence: null,
      error: "no_broker_client",
      taskId: `reactive-${input.admissionId}`,
    };
  }

  const readiness = verifyEngineeringReadiness({
    ownerId: input.ownerId,
    nowMs: nowMs(),
  });
  if (!readiness.ok) {
    return {
      ok: false,
      status: "failed",
      evidence: null,
      error: `readiness_failed:${readiness.reason}`,
      taskId: `reactive-${input.admissionId}`,
    };
  }

  const resolveRoots = input.rootsResolver ?? buildResolveRoots();
  const roots = resolveRoots(null);

  const anchors = loadEngineeringTrustAnchors({
    ownerId: input.ownerId,
    requirePolicyIdentity: REQUIRED_ENGINEERING_POLICY_IDENTITY,
    nowMs: nowMs(),
  });

  const envelopes = createEngineeringEnvelopeProvider({
    ownerId: input.ownerId,
    policy: anchors.policy,
    policyHash: anchors.policyHash,
    delegatedKey: anchors.delegatedKey,
    roots,
  });

  const port = createBrokerEngineeringPort({ client: brokerClient, nowMs });
  const model = createEngineeringThinkingModel();

  const coordinator = new SandboxEngineeringCoordinator(model, port, {
    owner: input.ownerId,
    budgets: { ...DEFAULT_ENGINEERING_BUDGETS },
    availableDiagnostics: [...AGENT_AVAILABLE_DIAGNOSTICS],
    nowMs,
    persist: (tasks) => persistCoordinatorTasks(db, tasks),
  });
  coordinator.recover(loadCoordinatorTasks(db));

  const task = coordinator.admit({
    objective:
      "Verify sandbox workspace file roundtrip (create, write, read, verify, delete)",
    projectId: null,
    admissionCause: "user_request",
    profile: "sandbox_workspace_file_roundtrip",
    groundingRefs: [input.messageEntityUuid],
  });

  markAdmissionDispatched(db, input.admissionId);
  const result = await coordinator.run(task.taskId, envelopes);

  const evidence: RoundtripEffectEvidence | null =
    result.status === "completed" && isVerifiedRoundtripEffectEvidence(result.effectEvidence)
      ? result.effectEvidence
      : null;

  return {
    ok: result.status === "completed" && evidence !== null,
    status: result.status,
    evidence,
    error: result.status === "completed" ? (evidence ? null : "missing_effect_evidence") : result.summary,
    taskId: result.taskId,
  };
}
