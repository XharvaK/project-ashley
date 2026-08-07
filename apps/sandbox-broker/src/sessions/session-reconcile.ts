/**
 * Broker state reconciliation (Sandbox Wave 4, Commit 12).
 *
 * `reconcileBrokerState` compares broker-owned execution facts against the
 * agent's declared active policy identity and the workspace filesystem, and
 * surfaces drift without forcing decisions:
 *
 *  - policy supersede: a non-terminal session authorized under a policy hash
 *    that is no longer the agent's active policy. Such sessions already fail
 *    closed at reservation time (policy_mismatch); reconciliation records the
 *    condition so operations can see and retire them.
 *  - missing workspace: a non-terminal session bound to a workspace the
 *    broker can no longer locate below the configured disposable roots
 *    (tree or manifest gone). Reconciliation records the condition; it does
 *    not terminate the session.
 *
 * Recording is idempotent: a condition is recorded as a session event only
 * once per marker (active policy hash / workspace id), so repeated reconcile
 * passes never duplicate events.
 */

import type { BrokerRootConfig } from "../policy/root-config.js";
import { locateDisposableWorkspace } from "../workspace/workspace-revalidate.js";
import { BrokerSessionLedger } from "./session-ledger.js";

const TERMINAL_SESSION_STATES: ReadonlySet<string> = new Set<string>([
  "completed",
  "aborted",
  "expired",
]);

export type ReconcileActivePolicy = {
  policyId: string;
  policyVersion: number;
  policyHash: string;
};

export type ReconcileBrokerStateInput = {
  ledger: BrokerSessionLedger;
  activePolicy: ReconcileActivePolicy;
  nowMs: number;
  /** When provided, enables workspace-intactness checks. */
  workspaceRootConfig?: BrokerRootConfig;
};

export type ReconcileBrokerStateResult = {
  activeSessions: number;
  policySuperseded: Array<{
    sessionUuid: string;
    sessionPolicyHash: string;
    activePolicyHash: string;
  }>;
  missingWorkspace: Array<{
    sessionUuid: string;
    workspaceId: string;
  }>;
};

export function reconcileBrokerState(
  input: ReconcileBrokerStateInput,
): ReconcileBrokerStateResult {
  const result: ReconcileBrokerStateResult = {
    activeSessions: 0,
    policySuperseded: [],
    missingWorkspace: [],
  };
  for (const session of input.ledger.listSessions()) {
    if (TERMINAL_SESSION_STATES.has(session.state)) {
      continue;
    }
    result.activeSessions += 1;
    if (session.policyHash !== input.activePolicy.policyHash) {
      result.policySuperseded.push({
        sessionUuid: session.sessionUuid,
        sessionPolicyHash: session.policyHash,
        activePolicyHash: input.activePolicy.policyHash,
      });
      recordIdempotent(
        input.ledger,
        session.sessionUuid,
        "session_policy_superseded",
        input.activePolicy.policyHash,
        {
          policyHash: input.activePolicy.policyHash,
          policyVersion: input.activePolicy.policyVersion,
          sessionPolicyHash: session.policyHash,
        },
        input.nowMs,
      );
    }
    if (session.workspaceId && input.workspaceRootConfig) {
      const located = locateDisposableWorkspace(
        session.workspaceId,
        input.workspaceRootConfig,
      );
      if (!located.ok) {
        result.missingWorkspace.push({
          sessionUuid: session.sessionUuid,
          workspaceId: session.workspaceId,
        });
        recordIdempotent(
          input.ledger,
          session.sessionUuid,
          "session_workspace_missing",
          session.workspaceId,
          { workspaceId: session.workspaceId },
          input.nowMs,
        );
      }
    }
  }
  return result;
}

function recordIdempotent(
  ledger: BrokerSessionLedger,
  sessionUuid: string,
  eventType: "session_policy_superseded" | "session_workspace_missing",
  marker: string,
  metadata: Record<string, string | number | boolean>,
  nowMs: number,
): void {
  const seen = ledger.listEvents(sessionUuid).some(
    (event) => event.eventType === eventType && event.metadata.marker === marker,
  );
  if (seen) {
    return;
  }
  ledger.recordEvent({
    sessionUuid,
    eventType,
    atMs: nowMs,
    metadata: { ...metadata, marker },
  });
}
