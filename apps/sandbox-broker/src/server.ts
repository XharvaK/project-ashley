import { existsSync, lstatSync } from "node:fs";
import net from "node:net";
import { encodeFrame, type BrokerFrame, type BrokerResponse } from "./protocol/frame.js";
import { FrameStreamDecoder } from "./protocol/stream.js";
import type { SandboxBroker } from "./broker.js";

export type PeerCredentials = {
  pid: number;
  uid: number;
  gid: number;
};

export type PeerCredentialResolver = (
  socket: net.Socket,
) => PeerCredentials | null;

export type UnixBrokerServerOptions = {
  broker: SandboxBroker;
  ownerId: string;
  socketPath?: string;
  listenFd?: number;
  expectedPeerUid?: number;
  peerCredentialResolver?: PeerCredentialResolver;
  requirePeerCredentials?: boolean;
  logger?: Pick<Console, "warn" | "error">;
};

const INTERNAL_ERROR = {
  ok: false as const,
  errorCode: "broker_internal_error",
  message: "broker rejected the request",
};

/**
 * Unix-stream boundary for the broker. Production must provide a real
 * SO_PEERCRED-backed resolver; the default is fail-closed.
 */
export class UnixBrokerServer {
  private readonly options: Required<
    Pick<UnixBrokerServerOptions, "ownerId" | "requirePeerCredentials">
  > & UnixBrokerServerOptions;
  private readonly connections = new Set<net.Socket>();
  private server: net.Server | null = null;
  private ownsSocketPath = false;

  constructor(options: UnixBrokerServerOptions) {
    if (!options.socketPath && options.listenFd === undefined) {
      throw new Error("socket_path_or_fd_required");
    }
    if (options.socketPath && options.listenFd !== undefined) {
      throw new Error("socket_path_and_fd_are_exclusive");
    }
    if (options.requirePeerCredentials !== false && !options.peerCredentialResolver) {
      // Keep the server constructible for tests, but never silently weaken the
      // production policy.
      options.logger?.warn?.("sandbox broker has no peer credential resolver; requests will fail closed");
    }
    this.options = {
      ...options,
      ownerId: options.ownerId,
      requirePeerCredentials: options.requirePeerCredentials ?? true,
    };
  }

  async start(): Promise<void> {
    if (this.server) throw new Error("broker_server_already_started");
    if (this.options.socketPath && existsSync(this.options.socketPath)) {
      const stat = lstatSync(this.options.socketPath);
      if (!stat.isSocket()) {
        throw new Error("socket_path_not_socket");
      }
      throw new Error("socket_path_exists");
    }

    const server = net.createServer((socket) => this.handleConnection(socket));
    this.server = server;
    this.ownsSocketPath = this.options.socketPath !== undefined;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      if (this.options.listenFd !== undefined) {
        server.listen({ fd: this.options.listenFd });
      } else {
        server.listen(this.options.socketPath!);
      }
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // A directly-bound test/development socket belongs to this server. A
    // systemd-activated socket does not and is never unlinked here.
    if (this.ownsSocketPath && this.options.socketPath && existsSync(this.options.socketPath)) {
      try {
        const stat = lstatSync(this.options.socketPath);
        if (stat.isSocket()) {
          await import("node:fs/promises").then(({ unlink }) => unlink(this.options.socketPath!));
        }
      } catch {
        // Cleanup is best effort; never hide the server stop result.
      }
    }
  }

  private handleConnection(socket: net.Socket): void {
    this.connections.add(socket);
    socket.setNoDelay(true);
    const peer = this.resolvePeer(socket);
    if (!peer) {
      this.options.logger?.warn?.("sandbox broker rejected a connection without valid peer credentials");
      socket.destroy();
      this.connections.delete(socket);
      return;
    }

    const decoder = new FrameStreamDecoder();
    socket.on("data", (chunk: Buffer) => {
      void this.dispatchBatches(socket, chunk, decoder);
    });
    socket.on("error", (error) => {
      this.options.logger?.warn?.(`sandbox broker socket error: ${error.message}`);
    });
    socket.on("close", () => this.connections.delete(socket));
  }

  private resolvePeer(socket: net.Socket): PeerCredentials | null {
    const resolver = this.options.peerCredentialResolver;
    if (!resolver) return this.options.requirePeerCredentials ? null : { pid: 0, uid: 0, gid: 0 };
    const peer = resolver(socket);
    if (!peer) return null;
    if (
      this.options.expectedPeerUid !== undefined &&
      peer.uid !== this.options.expectedPeerUid
    ) {
      return null;
    }
    return peer;
  }

  private async dispatchBatches(
    socket: net.Socket,
    chunk: Buffer,
    decoder: FrameStreamDecoder,
  ): Promise<void> {
    let frames: BrokerFrame[];
    try {
      frames = decoder.push(chunk);
    } catch (error) {
      this.options.logger?.warn?.(
        `sandbox broker protocol error: ${error instanceof Error ? error.message : "unknown"}`,
      );
      socket.destroy();
      return;
    }
    for (const frame of frames) {
      await this.dispatchFrame(socket, frame);
      if (socket.destroyed) return;
    }
  }

  private async dispatchFrame(socket: net.Socket, frame: BrokerFrame): Promise<void> {
    let response: BrokerResponse<unknown>;
    try {
      const data = await this.options.broker.dispatchAsync(frame.messageType, frame.payload, {
        peerOwnerId: this.options.ownerId,
        ownerId: this.options.ownerId,
        nowMs: Date.now(),
      });
      this.options.broker.store.flush();
      response = data;
    } catch {
      response = INTERNAL_ERROR;
    }
    try {
      socket.write(
        encodeFrame({
          frameVersion: frame.frameVersion,
          requestId: frame.requestId,
          messageType: frame.messageType,
          payload: response,
        }),
      );
    } catch {
      socket.destroy();
    }
  }
}
