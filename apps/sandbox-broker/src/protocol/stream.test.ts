import { describe, expect, it } from "vitest";
import { FRAME_VERSION } from "../constants/limits.js";
import { encodeFrame } from "./frame.js";
import { FrameStreamDecoder } from "./stream.js";

describe("frame stream decoder", () => {
  it("handles split headers, bodies, and multiple frames", () => {
    const first = encodeFrame({
      frameVersion: FRAME_VERSION,
      requestId: "one",
      messageType: "artifact.list",
      payload: { ownerId: "owner-1" },
    });
    const second = encodeFrame({
      frameVersion: FRAME_VERSION,
      requestId: "two",
      messageType: "artifact.read",
      payload: { ownerId: "owner-1", artifactRef: "ref" },
    });
    const combined = Buffer.concat([first, second]);
    const decoder = new FrameStreamDecoder();
    const frames = [
      ...decoder.push(combined.subarray(0, 3)),
      ...decoder.push(combined.subarray(3, first.length - 1)),
      ...decoder.push(combined.subarray(first.length - 1)),
    ];
    expect(frames.map((frame) => frame.requestId)).toEqual(["one", "two"]);
    expect(decoder.pendingBytes).toBe(0);
  });

  it("rejects an oversized header before waiting forever", () => {
    const decoder = new FrameStreamDecoder();
    expect(() => decoder.push(Buffer.alloc(9 * 1024, 120))).toThrow(
      "header_too_large",
    );
  });

  it("rejects a declared body larger than the frame limit", () => {
    const decoder = new FrameStreamDecoder();
    expect(() =>
      decoder.push(
        Buffer.from(
          JSON.stringify({
            frameVersion: FRAME_VERSION,
            requestId: "large",
            messageType: "artifact.list",
            payloadLength: 2 * 1024 * 1024,
          }) + "\n",
        ),
      ),
    ).toThrow("frame_too_large");
  });
});
