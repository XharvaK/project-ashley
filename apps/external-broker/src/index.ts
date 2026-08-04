import { ExternalBroker, type ExternalBrokerConfig } from "./broker.js";
import {
  decodeFrame,
  encodeFrame,
  type BrokerFrame,
  type RequestContext,
} from "./protocol/frame.js";

export function createBroker(config: ExternalBrokerConfig): ExternalBroker {
  return new ExternalBroker(config);
}

export class MemoryTransport {
  constructor(private readonly broker: ExternalBroker) {}

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
export * from "./crypto/dispatch.js";
export * from "./crypto/forget.js";
export * from "./crypto/policy.js";
export * from "./crypto/types.js";
export * from "./adapters/fake-local-v1.js";
export * from "./adapters/registry.js";
export * from "./dispatch/fsm.js";
export * from "./policy/evaluator.js";
export * from "./protocol/frame.js";
export * from "./store/broker-store.js";
export * from "./vault/store.js";
