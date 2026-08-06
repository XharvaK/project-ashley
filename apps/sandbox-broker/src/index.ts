import { SandboxBroker, type BrokerConfig } from "./broker.js";
import {
  decodeFrame,
  encodeFrame,
  type BrokerFrame,
  type RequestContext,
} from "./protocol/frame.js";

export function createBroker(config: BrokerConfig): SandboxBroker {
  return new SandboxBroker(config);
}

export class MemoryTransport {
  constructor(private readonly broker: SandboxBroker) {}

  send(frame: BrokerFrame, ctx: RequestContext) {
    const response = this.broker.dispatch(frame.messageType, frame.payload, ctx);
    return {
      frameVersion: frame.frameVersion,
      requestId: frame.requestId,
      messageType: frame.messageType,
      payload: response,
    };
  }

  sendEncoded(buffer: Buffer, ctx: RequestContext): Buffer {
    const frame = decodeFrame(buffer);
    const response = this.send(frame, ctx);
    return encodeFrame(response);
  }
}

export * from "./broker.js";
export * from "./constants/limits.js";
export * from "./crypto/approval.js";
export * from "./crypto/delegated-approval.js";
export * from "./crypto/delegated-policy.js";
export * from "./crypto/key-custody.js";
export * from "./crypto/owner-approval.js";
export * from "./crypto/tombstone.js";
export * from "./crypto/types.js";
export * from "./execution/execution-limits.js";
export * from "./execution/execution-types.js";
export * from "./execution/network-isolation.js";
export * from "./execution/executable-resolver.js";
export * from "./execution/bounded-output.js";
export * from "./execution/receipt.js";
export * from "./execution/fixed-recipe-execution-service.js";
export * from "./handlers/source-prepare.js";
export * from "./protocol/frame.js";
export * from "./protocol/stream.js";
export * from "./server.js";
export * from "./peer-credentials.js";
export * from "./store/broker-store.js";
export * from "./sessions/session-types.js";
export * from "./sessions/session-limits.js";
export * from "./sessions/session-transitions.js";
export * from "./sessions/session-migration.js";
export * from "./sessions/capability-custody.js";
export * from "./sessions/session-capability.js";
export * from "./sessions/session-ledger.js";
export * from "./sessions/session-service.js";
export * from "./process/fake-runner.js";
export * from "./process/real-runner.js";
export * from "./policy/delegated-authorization.js";
export * from "./policy/path.js";
export * from "./policy/recipe-registry.js";
export * from "./policy/recipe-resolver.js";
export * from "./policy/recipes.js";
export * from "./policy/root-config.js";
export * from "./workspace/workspace-cleanup.js";
export * from "./workspace/workspace-config.js";
export * from "./workspace/workspace-copy.js";
export * from "./workspace/workspace-create.js";
export * from "./workspace/workspace-exclusions.js";
export * from "./workspace/workspace-id.js";
export * from "./workspace/workspace-limits.js";
export * from "./workspace/workspace-manifest.js";
export * from "./workspace/workspace-revalidate.js";
