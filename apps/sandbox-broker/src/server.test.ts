import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { FRAME_VERSION } from "./constants/limits.js";
import { encodeFrame, type BrokerFrame } from "./protocol/frame.js";
import { FrameStreamDecoder } from "./protocol/stream.js";
import { UnixBrokerServer } from "./server.js";
import { createTestBroker } from "./test/fixtures/broker.js";
import { signedApproval } from "./test/fixtures/keys.js";

function socketPath(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "ashley-server-")), "broker.sock");
}

async function connect(pathname: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(pathname);
    client.once("connect", () => resolve(client));
    client.once("error", reject);
  });
}

async function request(
  client: net.Socket,
  frame: BrokerFrame,
  split = false,
): Promise<unknown> {
  const decoder = new FrameStreamDecoder();
  const response = new Promise<unknown>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      try {
        const frames = decoder.push(chunk);
        if (frames.length > 0) {
          client.off("data", onData);
          resolve(frames[0]?.payload);
        }
      } catch (error) {
        reject(error);
      }
    };
    client.on("data", onData);
    client.once("error", reject);
  });
  const encoded = encodeFrame(frame);
  if (split) {
    client.write(encoded.subarray(0, 4));
    client.write(encoded.subarray(4));
  } else {
    client.write(encoded);
  }
  return response;
}

describe("UnixBrokerServer", () => {
  it.skipIf(process.platform === "win32")(
    "round-trips split frames only for the expected peer UID",
    async () => {
    const fixture = createTestBroker();
    const pathname = socketPath();
    const server = new UnixBrokerServer({
      broker: fixture.broker,
      ownerId: "owner-1",
      socketPath: pathname,
      expectedPeerUid: 1000,
      peerCredentialResolver: () => ({ pid: 10, uid: 1000, gid: 1000 }),
    });
    await server.start();
    const client = await connect(pathname);
    const approval = signedApproval(fixture.keys, {
      taskId: `server-${randomUUID()}`,
      nonce: randomUUID(),
    });
    const payload = await request(
      client,
      {
        frameVersion: FRAME_VERSION,
        requestId: "server-request",
        messageType: "task.submit",
        payload: { approval },
      },
      true,
    );
    expect(payload).toMatchObject({ ok: true, data: { state: "running" } });
    client.destroy();
      await server.stop();
    },
  );

  it.skipIf(process.platform === "win32")(
    "fails closed when peer credentials are unavailable",
    async () => {
    const fixture = createTestBroker();
    const pathname = socketPath();
    const server = new UnixBrokerServer({
      broker: fixture.broker,
      ownerId: "owner-1",
      socketPath: pathname,
    });
    await server.start();
    const client = await connect(pathname);
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    client.write(
      encodeFrame({
        frameVersion: FRAME_VERSION,
        requestId: "rejected",
        messageType: "artifact.list",
        payload: { ownerId: "owner-1" },
      }),
    );
    await closed;
    expect(fixture.broker.store.auditEvents).toHaveLength(0);
      await server.stop();
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects a peer UID that is not the configured agent UID",
    async () => {
    const fixture = createTestBroker();
    const pathname = socketPath();
    const server = new UnixBrokerServer({
      broker: fixture.broker,
      ownerId: "owner-1",
      socketPath: pathname,
      expectedPeerUid: 1000,
      peerCredentialResolver: () => ({ pid: 10, uid: 1001, gid: 1001 }),
    });
    await server.start();
    const client = await connect(pathname);
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    await closed;
      await server.stop();
    },
  );
});
