import { FRAME_VERSION, MAX_FRAME_BYTES } from "../constants/limits.js";
import { decodeFrame, type BrokerFrame } from "./frame.js";

const MAX_HEADER_BYTES = 8 * 1024;

/** Incremental decoder for the header-newline + length-prefixed body protocol. */
export class FrameStreamDecoder {
  private pending = Buffer.alloc(0);

  push(chunk: Buffer): BrokerFrame[] {
    if (chunk.length === 0) return [];
    this.pending = Buffer.concat([this.pending, chunk]);
    const frames: BrokerFrame[] = [];

    while (this.pending.length > 0) {
      const newline = this.pending.indexOf(10);
      if (newline < 0) {
        if (this.pending.length > MAX_HEADER_BYTES) {
          throw new Error("header_too_large");
        }
        break;
      }
      if (newline > MAX_HEADER_BYTES) {
        throw new Error("header_too_large");
      }

      let payloadLength: number;
      try {
        const header = JSON.parse(
          this.pending.subarray(0, newline).toString("utf8"),
        ) as { frameVersion?: unknown; payloadLength?: unknown };
        if (header.frameVersion !== FRAME_VERSION) {
          throw new Error("invalid_frame_version");
        }
        if (
          typeof header.payloadLength !== "number" ||
          !Number.isInteger(header.payloadLength) ||
          header.payloadLength < 0
        ) {
          throw new Error("invalid_payload_length");
        }
        payloadLength = header.payloadLength;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("invalid_")) {
          throw error;
        }
        throw new Error("malformed_header");
      }

      const frameLength = newline + 1 + payloadLength;
      if (frameLength > MAX_FRAME_BYTES) {
        throw new Error("frame_too_large");
      }
      if (this.pending.length < frameLength) {
        break;
      }

      const encoded = this.pending.subarray(0, frameLength);
      frames.push(decodeFrame(encoded));
      this.pending = this.pending.subarray(frameLength);
    }

    return frames;
  }

  get pendingBytes(): number {
    return this.pending.length;
  }
}
