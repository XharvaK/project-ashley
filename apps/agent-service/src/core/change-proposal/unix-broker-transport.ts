import net from "node:net";
import { randomUUID } from "node:crypto";
import { env } from "../../env.js";
import type {
  BrokerClientTransport,
  BrokerDispatchResult,
  BrokerRequestDelivery,
} from "./broker-client.js";

const FRAME_VERSION = 1;
const MAX_FRAME_BYTES = 1_024 * 1_024;
const MAX_HEADER_BYTES = 8 * 1_024;

type TransportFrame = {
  frameVersion: number;
  requestId: string;
  messageType: string;
  payload: unknown;
};

function encodeFrame(frame: TransportFrame): Buffer {
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
  if (header.length + 1 + body.length > MAX_FRAME_BYTES) {
    throw new Error("frame_too_large");
  }
  return Buffer.concat([header, Buffer.from("\n"), body]);
}

function decodeOne(buffer: Buffer): { frame: TransportFrame; consumed: number } | null {
  const newline = buffer.indexOf(10);
  if (newline < 0) {
    if (buffer.length > MAX_HEADER_BYTES) throw new Error("header_too_large");
    return null;
  }
  if (newline > MAX_HEADER_BYTES) throw new Error("header_too_large");
  let header: { frameVersion?: unknown; requestId?: unknown; messageType?: unknown; payloadLength?: unknown };
  try {
    header = JSON.parse(buffer.subarray(0, newline).toString("utf8")) as typeof header;
  } catch {
    throw new Error("malformed_header");
  }
  if (header.frameVersion !== FRAME_VERSION) throw new Error("invalid_frame_version");
  if (typeof header.requestId !== "string" || typeof header.messageType !== "string") {
    throw new Error("invalid_frame_header");
  }
  if (
    typeof header.payloadLength !== "number" ||
    !Number.isInteger(header.payloadLength) ||
    header.payloadLength < 0
  ) {
    throw new Error("invalid_payload_length");
  }
  const consumed = newline + 1 + header.payloadLength;
  if (consumed > MAX_FRAME_BYTES) throw new Error("frame_too_large");
  if (buffer.length < consumed) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(buffer.subarray(newline + 1, consumed).toString("utf8"));
  } catch {
    throw new Error("malformed_payload");
  }
  return {
    consumed,
    frame: {
      frameVersion: FRAME_VERSION,
      requestId: header.requestId,
      messageType: header.messageType,
      payload,
    },
  };
}

function protocolResult(
  payload: unknown,
  requestDelivery: BrokerRequestDelivery,
): BrokerDispatchResult {
  if (
    payload &&
    typeof payload === "object" &&
    (payload as { ok?: unknown }).ok === true &&
    "data" in payload
  ) {
    return payload as BrokerDispatchResult;
  }
  if (
    payload &&
    typeof payload === "object" &&
    (payload as { ok?: unknown }).ok === false &&
    typeof (payload as { errorCode?: unknown }).errorCode === "string" &&
    typeof (payload as { message?: unknown }).message === "string"
  ) {
    const error = payload as { errorCode: string; message: string };
    return {
      ok: false,
      errorCode: error.errorCode,
      message: error.message,
      requestDelivery,
    };
  }
  return {
    ok: false,
    errorCode: "broker_protocol_error",
    message: "broker returned an invalid response",
    requestDelivery,
  };
}

export type UnixBrokerTransportOptions = {
  socketPath: string;
  timeoutMs?: number;
};

/** One request per connection keeps the v1 protocol stateless and bounded. */
export class UnixBrokerClientTransport implements BrokerClientTransport {
  private readonly timeoutMs: number;

  constructor(private readonly options: UnixBrokerTransportOptions) {
    this.timeoutMs = Math.max(100, options.timeoutMs ?? 5_000);
  }

  dispatch(messageType: string, payload: unknown): Promise<BrokerDispatchResult> {
    const requestId = randomUUID();
    return new Promise((resolve) => {
      let settled = false;
      let pending = Buffer.alloc(0);
      let requestWriteStarted = false;
      const socket = net.createConnection({ path: this.options.socketPath });
      const deliveryStatus = (): BrokerRequestDelivery =>
        requestWriteStarted ? "sent_or_unknown" : "not_sent";
      const finish = (result: BrokerDispatchResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };
      const timer = setTimeout(() => {
        finish({
          ok: false,
          errorCode: "broker_timeout",
          message: "sandbox broker did not respond before the deadline",
          requestDelivery: deliveryStatus(),
        });
      }, this.timeoutMs);
      socket.once("connect", () => {
        try {
          const frame = encodeFrame({
            frameVersion: FRAME_VERSION,
            requestId,
            messageType,
            payload,
          });
          requestWriteStarted = true;
          socket.write(frame);
        } catch (error) {
          finish({
            ok: false,
            errorCode: "broker_protocol_error",
            message: error instanceof Error ? error.message : "frame encoding failed",
            requestDelivery: deliveryStatus(),
          });
        }
      });
      socket.on("data", (chunk: Buffer) => {
        try {
          pending = Buffer.concat([pending, chunk]);
          while (pending.length > 0) {
            const decoded = decodeOne(pending);
            if (!decoded) return;
            pending = pending.subarray(decoded.consumed);
            if (decoded.frame.requestId !== requestId) {
              finish({
                ok: false,
                errorCode: "broker_protocol_error",
                message: "response request id mismatch",
                requestDelivery: "sent_or_unknown",
              });
              return;
            }
            finish(protocolResult(decoded.frame.payload, "sent_or_unknown"));
            return;
          }
        } catch (error) {
          finish({
            ok: false,
            errorCode: "broker_protocol_error",
            message: error instanceof Error ? error.message : "invalid broker frame",
            requestDelivery: "sent_or_unknown",
          });
        }
      });
      socket.once("error", (error) => {
        finish({
          ok: false,
          errorCode: "broker_unavailable",
          message: error.message,
          requestDelivery: deliveryStatus(),
        });
      });
      socket.once("close", () => {
        finish({
          ok: false,
          errorCode: "broker_unavailable",
          message: "sandbox broker connection closed before a response",
          requestDelivery: deliveryStatus(),
        });
      });
    });
  }
}

export function createConfiguredUnixBrokerTransport(): UnixBrokerClientTransport | null {
  if (!env.sandboxBrokerEnabled) return null;
  const socketPath = env.sandboxBrokerSocket.trim();
  if (!socketPath) return null;
  return new UnixBrokerClientTransport({
    socketPath,
    timeoutMs: env.sandboxBrokerTimeoutMs,
  });
}
