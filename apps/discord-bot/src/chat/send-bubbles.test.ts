import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SendableChannels } from "discord.js";
import { sendBubbles } from "./send-bubbles.js";

function mockChannel(sends: unknown[] = []): SendableChannels {
  return {
    send: async (payload: unknown) => {
      sends.push(payload);
      return {} as never;
    },
  } as SendableChannels;
}

describe("sendBubbles onFirstSend", () => {
  it("fires once after the first bubble, before later bubbles", async () => {
    const sends: unknown[] = [];
    const order: string[] = [];
    const channel = mockChannel(sends);

    await sendBubbles(channel, ["first", "second"], null, null, () => {
      order.push("firstSend");
    });

    assert.deepEqual(order, ["firstSend"]);
    assert.deepEqual(sends, ["first", "second"]);
  });

  it("fires for gif-only sends with no text chunks", async () => {
    let called = 0;
    const channel = mockChannel();
    await sendBubbles(channel, [], "https://example.com/a.gif", null, () => {
      called += 1;
    });
    assert.equal(called, 1);
  });
});
