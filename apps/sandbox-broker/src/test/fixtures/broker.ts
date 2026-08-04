import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBroker, type SandboxBroker } from "../../index.js";
import {
  approvalVerifier,
  createTestKeys,
  type TestKeyMaterial,
  tombstoneVerifier,
} from "./keys.js";

export function createTestBroker(
  keys: TestKeyMaterial = createTestKeys(),
): { broker: SandboxBroker; workspaceRoot: string; keys: TestKeyMaterial } {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "ashley-broker-"));
  mkdirSync(path.join(workspaceRoot, "workspace"), { recursive: true });
  const broker = createBroker({
    workspaceRoot,
    ownerId: "owner-1",
    approval: approvalVerifier(keys),
    tombstone: tombstoneVerifier(keys),
    interpreterAllowlist: new Set(["/bin/echo", "/usr/bin/node"]),
    envAllowlist: new Set(["PATH"]),
    processRunner: {
      async run() {
        return {
          exitCode: 0,
          stdout: "ok",
          stderr: "",
          truncated: false,
          terminalReason: "success",
        };
      },
    },
  });
  return { broker, workspaceRoot, keys };
}

export const testCtx = {
  peerOwnerId: "owner-1",
  ownerId: "owner-1",
  nowMs: Date.now(),
};
