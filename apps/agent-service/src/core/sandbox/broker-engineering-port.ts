/**
 * Adapt a `SandboxBrokerClient` into the `EngineeringExecutionPort` consumed by
 * the operator/coordinator. The broker remains the final authority: every
 * structured action and the bounded agent-restart request are re-validated and
 * authorized over the socket. The envelope is fixed per engineering session.
 */

import type { DelegatedApprovalEnvelope } from "@composer-assistant/sandbox-broker";
import type { EngineeringAction } from "@composer-assistant/sandbox-policy";
import type {
  EngineeringExecutionPort,
  EngineeringToolResult,
} from "./engineering-types.js";
import type { SandboxBrokerClient } from "./broker-client.js";

export type BrokerEngineeringPortConfig = {
  client: SandboxBrokerClient;
  nowMs: () => number;
  /**
   * Envelope provider used for the bounded agent-restart request (which is not
   * an `EngineeringAction` and so cannot carry its own envelope). When absent,
   * restart requests fail closed — the broker refuses unsigned requests.
   */
  restartEnvelopeProvider?: () => DelegatedApprovalEnvelope;
};

export function createBrokerEngineeringPort(
  config: BrokerEngineeringPortConfig,
): EngineeringExecutionPort {
  return {
    async executeAction(
      action: EngineeringAction,
      envelope: DelegatedApprovalEnvelope,
    ): Promise<EngineeringToolResult> {
      // The envelope is produced per action by the operator's
      // OperatorEnvelopeProvider and supplied here; the broker re-validates it.
      return config.client.engineeringAction({
        envelope,
        nowMs: config.nowMs(),
        action,
      });
    },
    async agentRestart(ctx: {
      unit: string;
      incidentId: string;
      health: { healthy: boolean; deterministic: boolean };
      restartState: {
        incidentId: string;
        lastAttemptAtMs: number | null;
        attemptsForIncident: number;
        cooldownMs: number;
      };
    }): Promise<EngineeringToolResult> {
      if (!config.restartEnvelopeProvider) {
        return {
          ok: false,
          errorCode: "engineering_restart_envelope_unavailable",
          reason: "restart envelope provider not configured; failing closed",
        };
      }
      return config.client.agentRestart({
        envelope: config.restartEnvelopeProvider(),
        nowMs: config.nowMs(),
        ...ctx,
      });
    },
  };
}
