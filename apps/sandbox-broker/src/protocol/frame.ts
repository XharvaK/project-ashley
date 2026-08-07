import { FRAME_VERSION, MAX_FRAME_BYTES } from "../constants/limits.js";

export type MessageType =
  | "artifact.read"
  | "artifact.list"
  | "artifact.write.begin"
  | "artifact.write.chunk"
  | "artifact.write.commit"
  | "artifact.write.abort"
  | "artifact.delete"
  | "task.submit"
  | "task.cancel"
  | "task.receipt"
  | "task.result.fetch"
  | "forget.apply"
  | "sandbox.readiness"
  | "sandbox.authorizeDelegated"
  | "sandbox.session.create"
  | "sandbox.session.get"
  | "sandbox.session.activate"
  | "sandbox.session.transition"
  | "sandbox.session.resume"
  | "sandbox.session.issueCapability"
  | "sandbox.workspace.create"
  | "sandbox.workspace.revalidate"
  | "sandbox.workspace.cleanup"
  | "sandbox.recipe.execute"
  | "sandbox.ownerApproval.resume";

export interface BrokerFrame {
  frameVersion: number;
  requestId: string;
  messageType: MessageType;
  payload: unknown;
}

export interface BrokerErrorPayload {
  ok: false;
  errorCode: string;
  message: string;
}

export type BrokerResponse<T> = { ok: true; data: T } | BrokerErrorPayload;

export interface RequestContext {
  peerOwnerId: string;
  ownerId: string;
  nowMs: number;
}

export function encodeFrame(frame: BrokerFrame): Buffer {
  const body = Buffer.from(JSON.stringify(frame.payload), "utf8");
  const header = Buffer.from(
    JSON.stringify({
      frameVersion: frame.frameVersion,
      requestId: frame.requestId,
      messageType: frame.messageType,
      payloadLength: body.length,
    }),
    "utf8",
  );
  const total = header.length + 1 + body.length;
  if (total > MAX_FRAME_BYTES) {
    throw new Error("frame_too_large");
  }
  return Buffer.concat([header, Buffer.from("\n"), body]);
}

export function decodeFrame(buffer: Buffer): BrokerFrame {
  const newline = buffer.indexOf(10);
  if (newline < 0) {
    throw new Error("malformed_frame");
  }
  const header = JSON.parse(buffer.subarray(0, newline).toString("utf8")) as {
    frameVersion: number;
    requestId: string;
    messageType: MessageType;
    payloadLength: number;
  };
  if (header.frameVersion !== FRAME_VERSION) {
    throw new Error("invalid_frame_version");
  }
  if (typeof header.requestId !== "string" || header.requestId.length === 0) {
    throw new Error("invalid_request_id");
  }
  if (typeof header.messageType !== "string" || header.messageType.length === 0) {
    throw new Error("invalid_message_type");
  }
  if (
    typeof header.payloadLength !== "number" ||
    !Number.isInteger(header.payloadLength) ||
    header.payloadLength < 0
  ) {
    throw new Error("invalid_payload_length");
  }
  const body = buffer.subarray(newline + 1);
  if (body.length !== header.payloadLength) {
    throw new Error("payload_length_mismatch");
  }
  if (buffer.length > MAX_FRAME_BYTES) {
    throw new Error("frame_too_large");
  }
  return {
    frameVersion: header.frameVersion,
    requestId: header.requestId,
    messageType: header.messageType,
    payload: JSON.parse(body.toString("utf8")),
  };
}
