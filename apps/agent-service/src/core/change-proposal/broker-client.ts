export type BrokerDispatchResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; errorCode: string; message: string };

export interface BrokerClientTransport {
  dispatch(messageType: string, payload: unknown):
    | BrokerDispatchResult
    | Promise<BrokerDispatchResult>;
}

export type ApprovalEnvelopeLike = {
  taskId: string;
  ownerId: string;
  scope: string;
  recipeId?: string;
  proposalId?: string;
  baseCommit?: string;
  baseTreeHash?: string;
  sourceCleanliness?: string;
  archiveManifestRef?: string;
  archiveAggregateHash?: string;
  excludeRules?: string[];
  destinationNamespace?: string;
  signature?: string;
};

/**
 * Bounded broker readiness snapshot mirrored from the sandbox broker's
 * `broker.status` message. Read-only aggregate facts only.
 */
export type BrokerStatusSnapshot = {
  ready: boolean;
  persistence: "ok" | "degraded";
  schemaVersion: number;
  ownerId: string;
  sessions: { active: number; total: number };
  audits: number;
  workspaceBytesUsed: number;
};

export async function fetchBrokerStatus(
  transport: BrokerClientTransport,
): Promise<BrokerDispatchResult<BrokerStatusSnapshot>> {
  return (await transport.dispatch("broker.status", {})) as BrokerDispatchResult<BrokerStatusSnapshot>;
}

export async function readArtifact(
  transport: BrokerClientTransport,
  ownerId: string,
  artifactRef: string,
): Promise<BrokerDispatchResult<{ artifactRef: string; entityUuid: string; dataBase64: string }>> {
  return (await transport.dispatch("artifact.read", { ownerId, artifactRef })) as BrokerDispatchResult<{
    artifactRef: string;
    entityUuid: string;
    dataBase64: string;
  }>;
}

export async function submitTask(
  transport: BrokerClientTransport,
  approval: ApprovalEnvelopeLike,
): Promise<BrokerDispatchResult<{ taskId: string; state: string }>> {
  return (await transport.dispatch("task.submit", { approval })) as BrokerDispatchResult<{
    taskId: string;
    state: string;
  }>;
}

export async function fetchTaskReceipt(
  transport: BrokerClientTransport,
  taskId: string,
): Promise<BrokerDispatchResult<{
  taskId: string;
  state: string;
  exitCode?: number;
  truncated: boolean;
  terminalReason?: string;
}>> {
  return (await transport.dispatch("task.receipt", { taskId })) as BrokerDispatchResult<{
    taskId: string;
    state: string;
    exitCode?: number;
    truncated: boolean;
    terminalReason?: string;
  }>;
}

export async function fetchTaskResult(
  transport: BrokerClientTransport,
  taskId: string,
): Promise<BrokerDispatchResult<{ stdout: string; stderr: string; truncated: boolean }>> {
  return (await transport.dispatch("task.result.fetch", { taskId })) as BrokerDispatchResult<{
    stdout: string;
    stderr: string;
    truncated: boolean;
  }>;
}

export async function submitSourcePrepare(
  transport: BrokerClientTransport,
  approval: ApprovalEnvelopeLike,
): Promise<BrokerDispatchResult<{ taskId: string; state: string }>> {
  if (approval.scope !== "source_prepare") {
    return { ok: false, errorCode: "invalid_scope", message: "source_prepare required" };
  }
  return submitTask(transport, approval);
}

export async function submitSourceVerify(
  transport: BrokerClientTransport,
  approval: ApprovalEnvelopeLike,
): Promise<BrokerDispatchResult<{ taskId: string; state: string }>> {
  if (approval.scope !== "source_verify") {
    return { ok: false, errorCode: "invalid_scope", message: "source_verify required" };
  }
  return submitTask(transport, approval);
}

export async function submitSourceDiff(
  transport: BrokerClientTransport,
  approval: ApprovalEnvelopeLike,
): Promise<BrokerDispatchResult<{ taskId: string; state: string }>> {
  if (approval.scope !== "source_diff") {
    return { ok: false, errorCode: "invalid_scope", message: "source_diff required" };
  }
  return submitTask(transport, approval);
}
