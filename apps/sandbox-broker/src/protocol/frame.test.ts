import { describe, expect, it } from "vitest";
import { encodeFrame, decodeFrame } from "../protocol/frame.js";
import { FRAME_VERSION, MAX_FRAME_BYTES } from "../constants/limits.js";

describe("frame protocol", () => {
  it("round-trips valid frames", () => {
    const frame = {
      frameVersion: FRAME_VERSION,
      requestId: "req-1",
      messageType: "artifact.list" as const,
      payload: { ownerId: "owner-1" },
    };
    const encoded = encodeFrame(frame);
    const decoded = decodeFrame(encoded);
    expect(decoded.messageType).toBe("artifact.list");
  });

  it("rejects invalid frame version", () => {
    const frame = {
      frameVersion: FRAME_VERSION,
      requestId: "req-1",
      messageType: "artifact.list" as const,
      payload: {},
    };
    const encoded = encodeFrame(frame);
    const header = JSON.parse(encoded.subarray(0, encoded.indexOf(10)).toString());
    header.frameVersion = 99;
    const tampered = Buffer.concat([
      Buffer.from(JSON.stringify(header)),
      Buffer.from("\n"),
      encoded.subarray(encoded.indexOf(10) + 1),
    ]);
    expect(() => decodeFrame(tampered)).toThrow("invalid_frame_version");
  });

  it("rejects oversize frames", () => {
    const hugePayload = "x".repeat(MAX_FRAME_BYTES);
    expect(() =>
      encodeFrame({
        frameVersion: FRAME_VERSION,
        requestId: "req-big",
        messageType: "artifact.list",
        payload: { ownerId: "owner-1", blob: hugePayload },
      }),
    ).toThrow("frame_too_large");
  });

  it("rejects payload length mismatch", () => {
    const frame = {
      frameVersion: FRAME_VERSION,
      requestId: "req-3",
      messageType: "artifact.list" as const,
      payload: { ownerId: "owner-1" },
    };
    const encoded = encodeFrame(frame);
    const header = JSON.parse(encoded.subarray(0, encoded.indexOf(10)).toString());
    header.payloadLength = header.payloadLength + 1;
    const tampered = Buffer.concat([
      Buffer.from(JSON.stringify(header)),
      Buffer.from("\n"),
      encoded.subarray(encoded.indexOf(10) + 1),
    ]);
    expect(() => decodeFrame(tampered)).toThrow("payload_length_mismatch");
  });
});
