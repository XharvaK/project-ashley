export type BrokerDispatchResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; errorCode: string; message: string };

export interface BrokerClientTransport {
  dispatch(messageType: string, payload: unknown): BrokerDispatchResult;
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

export function readArtifact(
  transport: BrokerClientTransport,
  ownerId: string,
  artifactRef: string,
): BrokerDispatchResult<{ artifactRef: string; entityUuid: string; dataBase64: string }> {
  return transport.dispatch("artifact.read", { ownerId, artifactRef }) as BrokerDispatchResult<{
    artifactRef: string;
    entityUuid: string;
    dataBase64: string;
  }>;
}

export function submitTask(
  transport: BrokerClientTransport,
  approval: ApprovalEnvelopeLike,
): BrokerDispatchResult<{ taskId: string; state: string }> {
  return transport.dispatch("task.submit", { approval }) as BrokerDispatchResult<{
    taskId: string;
    state: string;
  }>;
}

export function fetchTaskReceipt(
  transport: BrokerClientTransport,
  taskId: string,
): BrokerDispatchResult<{
  taskId: string;
  state: string;
  exitCode?: number;
  truncated: boolean;
  terminalReason?: string;
}> {
  return transport.dispatch("task.receipt", { taskId }) as BrokerDispatchResult<{
    taskId: string;
    state: string;
    exitCode?: number;
    truncated: boolean;
    terminalReason?: string;
  }>;
}

export function fetchTaskResult(
  transport: BrokerClientTransport,
  taskId: string,
): BrokerDispatchResult<{ stdout: string; stderr: string; truncated: boolean }> {
  return transport.dispatch("task.result.fetch", { taskId }) as BrokerDispatchResult<{
    stdout: string;
    stderr: string;
    truncated: boolean;
  }>;
}

export function submitSourcePrepare(
  transport: BrokerClientTransport,
  approval: ApprovalEnvelopeLike,
): BrokerDispatchResult<{ taskId: string; state: string }> {
  if (approval.scope !== "source_prepare") {
    return { ok: false, errorCode: "invalid_scope", message: "source_prepare required" };
  }
  return submitTask(transport, approval);
}

export function submitSourceVerify(
  transport: BrokerClientTransport,
  approval: ApprovalEnvelopeLike,
): BrokerDispatchResult<{ taskId: string; state: string }> {
  if (approval.scope !== "source_verify") {
    return { ok: false, errorCode: "invalid_scope", message: "source_verify required" };
  }
  return submitTask(transport, approval);
}

export function submitSourceDiff(
  transport: BrokerClientTransport,
  approval: ApprovalEnvelopeLike,
): BrokerDispatchResult<{ taskId: string; state: string }> {
  if (approval.scope !== "source_diff") {
    return { ok: false, errorCode: "invalid_scope", message: "source_diff required" };
  }
  return submitTask(transport, approval);
}
