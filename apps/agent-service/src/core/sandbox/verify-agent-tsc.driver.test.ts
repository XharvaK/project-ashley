import { describe, expect, it, afterAll, beforeAll, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, Server } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encryptPrivateKeyPem,
  FrameStreamDecoder,
  generateEd25519KeyPairPem,
  ownerPolicyKeyFromPem,
  signDelegatedPolicyArtifact,
  verifyDelegatedPolicyArtifact,
  encodeFrame,
} from "@composer-assistant/sandbox-broker";
import {
  SANDBOX_POLICY_PAYLOAD_VERSION,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");

const ZEROS = "0".repeat(64);
const OWNER_KEY_ID = "owner-ed25519-v1";
const DELEGATED_KEY_ID = "delegated-runtime-ed25519-v1";

// ---- signed policy artifact (owner-signed, verified exactly like the driver) ----
function policyPayload(nowMs: number, overrides: Partial<SandboxPolicyDocument> = {}): SandboxPolicyDocument {
  return {
    policyId: "test-policy-1",
    policyVersion: 1,
    issuedAt: new Date(nowMs - 60_000).toISOString(),
    expiresAt: new Date(nowMs + 3_600_000).toISOString(),
    allowedDelegatedSignerKeyIds: [DELEGATED_KEY_ID],
    allowedCapabilities: [
      "approved_project_read",
      "approved_bounded_log_read",
      "fixed_test_recipe",
      "fixed_build_recipe",
      "fixed_lint_verification_recipe",
      "candidate_workspace_create",
      "candidate_workspace_read_write_delete",
      "bounded_diagnostic_execution",
    ],
    sessionRoles: ["sandbox_operator_light"],
    readOnlyRoots: ["/srv/ashley/live-checkout"],
    writableDisposableRoots: ["/var/lib/ashley-sandbox/work"],
    protectedRoots: [
      {
        path: "/srv/ashley/live-checkout/.git",
        class: "delegated_write_denied_owner_approvable",
      },
    ],
    allowedRecipeIds: ["verify:agent-tsc"],
    allowedExecutableIds: ["ashley-tools/check.sh"],
    resourceCeilings: {
      wallMsMax: 120_000,
      maxProcesses: 16,
      maxOutputBytes: 4_194_304,
      workspaceBytesMax: 2_000_000_000,
    },
    networkMode: "none",
    maxActiveSessions: 1,
    payloadVersion: SANDBOX_POLICY_PAYLOAD_VERSION,
    ...overrides,
  };
}

// Mock server state — mutated by the handler on each IPC request, reset per test.
let sessionRevision: number;
let toolExecutionsUsed: number;
let sessionState: string;
let transitionSucceeds: boolean;
let executionOutcome: "succeeded" | "failed";
let transitionCalls: Array<{ to: string; expectedRevision: number }>;
let executeCalls: number;
let sessionGetCalls: number;

let artifact: ReturnType<typeof signDelegatedPolicyArtifact>;
let policyHash: string;

describe("verify-agent-tsc driver", () => {
  let root: string;
  let socketPath: string;
  let server: Server;
  let testEnv: Record<string, string>;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "ashley-driver-test-"));
    socketPath =
      process.platform === "win32"
        ? `\\\\.\\pipe\\ashley-driver-test-${Date.now()}`
        : join(root, "broker.sock");

    const keys = {
      owner: generateEd25519KeyPairPem(),
      delegated: generateEd25519KeyPairPem(),
    };
    const ownerPubPem = keys.owner.publicKeyPem;
    const delegated = keys.delegated;
    const passphrase = "test-passphrase";
    const delegatedEnc = encryptPrivateKeyPem(delegated.privateKeyPem, passphrase, DELEGATED_KEY_ID);

    artifact = signDelegatedPolicyArtifact(policyPayload(Date.now()), keys.owner.privateKeyPem, OWNER_KEY_ID);

    writeFileSync(join(root, "owner-pub.pem"), ownerPubPem);
    writeFileSync(join(root, "delegated.enc.json"), JSON.stringify(delegatedEnc));
    writeFileSync(join(root, "delegated-pub.pem"), delegated.publicKeyPem);
    writeFileSync(join(root, "passphrase.txt"), passphrase);
    writeFileSync(join(root, "policy.json"), JSON.stringify(artifact.payload));
    writeFileSync(join(root, "policy.json.sig"), JSON.stringify(artifact.signature));

    const verified = verifyDelegatedPolicyArtifact(
      artifact,
      { keys: [{ keyId: OWNER_KEY_ID, publicKey: ownerPolicyKeyFromPem(ownerPubPem) }] },
      Date.now(),
    );
    if (!verified.ok) {
      throw new Error(`policy fixture verification failed: ${verified.reason}`);
    }
    policyHash = verified.policyHash;

    testEnv = {
      ...process.env,
      ASHLEY_SANDBOX_BROKER_SOCKET: socketPath,
      ASHLEY_SANDBOX_POLICY_ARTIFACT: join(root, "policy.json"),
      ASHLEY_SANDBOX_POLICY_SIGNATURE: join(root, "policy.json.sig"),
      ASHLEY_SANDBOX_OWNER_PUBLIC_KEY: join(root, "owner-pub.pem"),
      ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH: join(root, "delegated.enc.json"),
      ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH: join(root, "passphrase.txt"),
      ASHLEY_SANDBOX_DELEGATED_PUBLIC_KEY: join(root, "delegated-pub.pem"),
      ASHLEY_SANDBOX_OWNER_ID: "owner-1",
      NODE_NO_WARNINGS: "1",
    };

    server = createServer((socket) => {
      const decoder = new FrameStreamDecoder();
      socket.on("data", (chunk: Buffer) => {
        const frames = decoder.push(chunk);
        for (const req of frames) {
          let res: any = { ok: true };

          if (req.messageType === "sandbox.readiness") {
            res = {
              ok: true,
              data: {
                enabled: true,
                ready: true,
                networkMode: "none",
                policyId: artifact.payload.policyId,
                policyVersion: artifact.payload.policyVersion,
                policyHash,
                networkIsolationOperational: true,
                ownerKeyId: OWNER_KEY_ID,
                delegatedKeyId: DELEGATED_KEY_ID,
                capabilityKeyId: "capability-ed25519-v1",
                continuityKeyId: "continuity-ed25519-v1",
                maxConcurrentTasks: 1,
              },
            };
          } else if (req.messageType === "sandbox.session.create") {
            sessionRevision = 1;
            toolExecutionsUsed = 0;
            sessionState = "created";
            res = { ok: true, data: { ok: true, value: snapshot() } };
          } else if (req.messageType === "sandbox.session.activate") {
            sessionRevision = 2;
            sessionState = "active";
            res = { ok: true, data: { ok: true, value: snapshot() } };
          } else if (req.messageType === "sandbox.session.issueCapability") {
            res = {
              ok: true,
              data: {
                ok: true,
                value: {
                  payload: {
                    capabilityVersion: 1,
                    capabilityId: "fixed_lint_verification_recipe",
                    sessionUuid: "sess-1",
                    ownerId: "owner-1",
                    role: "sandbox_operator_light",
                    sessionState: "active",
                    policyId: artifact.payload.policyId,
                    policyVersion: artifact.payload.policyVersion,
                    policyHash,
                    allowedCapabilities: ["fixed_lint_verification_recipe"],
                    maxToolExecutions: 1,
                    nonce: "fake-nonce",
                    issuedAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 86400000).toISOString(),
                  },
                  signature: {
                    algorithm: "Ed25519",
                    keyId: "capability-ed25519-v1",
                    encoding: "base64url",
                    value: "fake-signature-base64-value",
                  },
                },
              },
            };
          } else if (req.messageType === "sandbox.recipe.execute") {
            // Simulate the broker-side reservation: increments revision and
            // consumes one tool-execution budget unit, exactly as
            // reserveCapabilityUse does in the real ledger.
            executeCalls += 1;
            sessionRevision += 1;
            toolExecutionsUsed += 1;
            res = {
              ok: true,
              data: {
                ok: true,
                outcome: executionOutcome,
                receipt: {
                  recipeId: "verify:agent-tsc",
                  terminalState:
                    executionOutcome === "succeeded"
                      ? { state: "succeeded", exitCode: 0 }
                      : { state: "failed", exitCode: 1, terminalReason: "non_zero_exit" },
                  wallMs: 100,
                  stdoutHash: ZEROS,
                  stderrHash: ZEROS,
                  stdoutBytes: 0,
                  stderrBytes: 0,
                  truncated: false,
                  networkIsolation: "enforced",
                  receiptHash: ZEROS,
                },
                audit: { kind: "broker_fixed_recipe_execution", outcome: "completed" },
              },
            };
          } else if (req.messageType === "sandbox.session.get") {
            sessionGetCalls += 1;
            res = { ok: true, data: snapshot() };
          } else if (req.messageType === "sandbox.session.transition") {
            const body = req.payload as {
              sessionUuid: string;
              to: string;
              input: { expectedRevision: number; nowMs: number };
            };
            transitionCalls.push({ to: body.to, expectedRevision: body.input.expectedRevision });
            if (!transitionSucceeds) {
              res = {
                ok: true,
                data: { ok: false, errorCode: "mocked_error", reason: "Mocked transition failure" },
              };
            } else if (body.input.expectedRevision !== sessionRevision) {
              res = {
                ok: true,
                data: {
                  ok: false,
                  errorCode: "revision_mismatch",
                  reason: `expected ${body.input.expectedRevision}, current ${sessionRevision}`,
                },
              };
            } else {
              sessionState = body.to;
              sessionRevision += 1;
              res = { ok: true, data: { ok: true, value: snapshot() } };
            }
          }

          socket.write(
            encodeFrame({
              frameVersion: req.frameVersion,
              requestId: req.requestId,
              messageType: req.messageType,
              payload: res,
            }),
          );
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  });

  afterAll(() => {
    if (server) server.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    sessionRevision = 1;
    toolExecutionsUsed = 0;
    sessionState = "active";
    transitionSucceeds = true;
    executionOutcome = "succeeded";
    transitionCalls = [];
    executeCalls = 0;
    sessionGetCalls = 0;
  });

  function snapshot(): Record<string, unknown> {
    return {
      sessionUuid: "sess-1",
      ownerId: "owner-1",
      role: "sandbox_operator_light",
      policyId: artifact.payload.policyId,
      policyVersion: artifact.payload.policyVersion,
      policyHash,
      allowedCapabilities: ["fixed_lint_verification_recipe"],
      workspaceId: null,
      maxToolExecutions: 1,
      toolExecutionsUsed,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      state: sessionState,
      revision: sessionRevision,
    };
  }

  async function runDriver(): Promise<{ code: number; stdout: string; stderr: string }> {
    const driverScript = join(REPO_ROOT, "scripts/mint/verify-agent-tsc.mjs");
    try {
      const { stdout, stderr } = await execFileAsync("node", [driverScript], {
        env: testEnv,
        encoding: "utf8",
      });
      return { code: 0, stdout, stderr };
    } catch (e: any) {
      return {
        code: typeof e.code === "number" ? e.code : 1,
        stdout: (e.stdout ?? "").toString(),
        stderr: (e.stderr ?? "").toString(),
      };
    }
  }

  // ---- Success path ----
  it("success path: successful execution reaches completed, consumes one-shot budget", async () => {
    executionOutcome = "succeeded";
    transitionSucceeds = true;

    const result = await runDriver();

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"outcome": "succeeded"');
    expect(result.stdout).toContain('"exitCode": 0');

    // Session reached a terminal state
    expect(sessionState).toBe("completed");
    // Budget consumed: exactly one tool execution used, not refunded
    expect(toolExecutionsUsed).toBe(1);
  });

  // ---- Revision correctness ----
  it("revision correctness: finalization uses the current revision from getSession, stale revision is rejected", async () => {
    executionOutcome = "succeeded";
    transitionSucceeds = true;

    const result = await runDriver();

    expect(result.code).toBe(0);
    // Exactly one transition was attempted
    expect(transitionCalls).toHaveLength(1);
    // The revision used must be the one returned by getSession AFTER executeRecipe
    // incremented it via reservation (= sessionRevision at finalize time, which
    // is 3: 1 create + 1 activate + 1 reservation). A stale revision from the
    // activateSession snapshot (= 2) would have been rejected by the mock's
    // revision guard with revision_mismatch.
    expect(transitionCalls[0].expectedRevision).toBe(3);
    expect(transitionCalls[0].to).toBe("completed");
    // The refresh itself must have been observed once.
    expect(sessionGetCalls).toBe(1);
  });

  // ---- Finalization failure ----
  it("finalization failure: transition failure fails qualification, no false success report", async () => {
    executionOutcome = "succeeded";
    transitionSucceeds = false;

    const result = await runDriver();

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("transition_to_completed_failed");
    expect(result.stdout).not.toContain('"ok": true');
  });

  // ---- Failed execution path ----
  it("failed execution path: child process failure reaches terminal state, budget retained", async () => {
    executionOutcome = "failed";
    transitionSucceeds = true;

    const result = await runDriver();

    // Driver exits non-zero because outcome is "failed"
    expect(result.code).toBe(1);
    // Session still reached a terminal state (the reservation ran to completion)
    expect(sessionState).toBe("completed");
    expect(transitionCalls).toHaveLength(1);
    expect(transitionCalls[0].to).toBe("completed");
    // Budget was consumed by the reservation, not refunded
    expect(toolExecutionsUsed).toBe(1);
  });

  // ---- No duplicate execution ----
  it("finalization never re-executes the recipe", async () => {
    executionOutcome = "succeeded";
    transitionSucceeds = true;

    const result = await runDriver();

    expect(result.code).toBe(0);
    // The recipe must be executed exactly once; the finalize path must not
    // trigger a second executeRecipe.
    expect(executeCalls).toBe(1);
  });
});
