/**
 * Adapt a `SandboxBrokerClient` into the `EngineeringExecutionPort` consumed by
 * the operator/coordinator. The broker remains the final authority: every
 * structured action is re-validated and authorized over the socket. The
 * envelope is produced per action by the operator's OperatorEnvelopeProvider.
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
  };
}
