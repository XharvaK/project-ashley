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
export * from "./crypto/tombstone.js";
export * from "./crypto/types.js";
export * from "./handlers/source-prepare.js";
export * from "./protocol/frame.js";
export * from "./protocol/stream.js";
export * from "./server.js";
export * from "./peer-credentials.js";
export * from "./store/broker-store.js";
export * from "./process/fake-runner.js";
export * from "./process/real-runner.js";
export * from "./policy/recipes.js";
