import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type net from "node:net";
import type { PeerCredentialResolver, PeerCredentials } from "./server.js";

type InternalSocket = net.Socket & {
  _handle?: { fd?: number };
};

/**
 * Linux SO_PEERCRED resolver. The tiny helper receives the accepted socket fd
 * on stdin and prints `pid uid gid`; no owner id is accepted from the frame.
 * When the helper is absent or cannot inspect the fd, the broker rejects the
 * connection rather than weakening the boundary.
 */
export function createLinuxPeerCredentialResolver(
  helperPath: string,
): PeerCredentialResolver {
  return (socket) => {
    if (process.platform !== "linux" || !existsSync(helperPath)) return null;
    const fd = (socket as InternalSocket)._handle?.fd;
    if (!Number.isInteger(fd) || (fd as number) < 0) return null;
    const result = spawnSync(helperPath, [], {
      encoding: "utf8",
      timeout: 1_000,
      stdio: [fd as number, "pipe", "pipe"],
    });
    if (result.error || result.status !== 0) return null;
    const parts = result.stdout.trim().split(/\s+/).map(Number);
    if (
      parts.length !== 3 ||
      !parts.every((value) => Number.isInteger(value) && value >= 0)
    ) {
      return null;
    }
    const [pid, uid, gid] = parts;
    return { pid: pid!, uid: uid!, gid: gid! } satisfies PeerCredentials;
  };
}
