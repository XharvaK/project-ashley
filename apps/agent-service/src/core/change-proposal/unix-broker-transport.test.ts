import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UnixBrokerClientTransport } from "./unix-broker-transport.js";

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});

describe("UnixBrokerClientTransport", () => {
  it("fails closed when the broker socket is unavailable", async () => {
    const result = await new UnixBrokerClientTransport({
      socketPath: join(tmpdir(), "ashley-broker-does-not-exist.sock"),
      timeoutMs: 500,
    }).dispatch("artifact.list", { ownerId: "owner-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("broker_unavailable");
      expect(result.requestDelivery).toBe("not_sent");
    }
  });

  it.skipIf(process.platform === "win32")(
    "marks a timeout after request write as sent_or_unknown",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "ashley-agent-broker-timeout-"));
      const socketPath = join(root, "broker.sock");
      const server = createServer((socket) => {
        socket.on("data", () => {
          // Accept the request, but do not send a response.
        });
      });
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));
      cleanup.push(() => {
        server.close();
        rmSync(root, { recursive: true, force: true });
      });

      const result = await new UnixBrokerClientTransport({
        socketPath,
        timeoutMs: 100,
      }).dispatch("artifact.list", { ownerId: "owner-1" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe("broker_timeout");
        expect(result.requestDelivery).toBe("sent_or_unknown");
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "round-trips a framed response over a Unix socket",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "ashley-agent-broker-"));
      const socketPath = join(root, "broker.sock");
      const server = createServer((socket) => {
        let buffer = Buffer.alloc(0);
        socket.on("data", (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          const newline = buffer.indexOf(10);
          if (newline < 0) return;
          const header = JSON.parse(buffer.subarray(0, newline).toString("utf8")) as {
            requestId: string;
            messageType: string;
          };
          const body = Buffer.from(JSON.stringify({ ok: true, data: { messageType: header.messageType } }));
          socket.end(
            Buffer.concat([
              Buffer.from(
                JSON.stringify({
                  frameVersion: 1,
                  requestId: header.requestId,
                  messageType: header.messageType,
                  payloadLength: body.length,
                }) + "\n",
              ),
              body,
            ]),
          );
        });
      });
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));
      cleanup.push(() => {
        server.close();
        rmSync(root, { recursive: true, force: true });
      });
      const result = await new UnixBrokerClientTransport({ socketPath }).dispatch(
        "artifact.list",
        { ownerId: "owner-1" },
      );
      expect(result).toEqual({ ok: true, data: { messageType: "artifact.list" } });
    },
  );
});
